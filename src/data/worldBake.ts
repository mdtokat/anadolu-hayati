import { FRESH_WATER } from '../config';
import { dumpHoles } from '../world/roadTunnels';
import { cutWindow, OVERVIEW_STRIDE, TILE_HALO, overviewSize } from '../world/terrainPages';
import { prepareDenseWorld } from '../world/worldPrep';
import { FreshWaterIndex } from '../world/waterIndex';
import { lakeLevels } from '../world/waterGeometry';
import { packBlob } from './bakedBlob';
import type { RegionData } from './region';
import {
  STREAM_VERSION,
  type OverviewBlob,
  type SettlementBlob,
  type StreamManifest,
  type StreamTileEntry,
  type TileBlob,
} from './worldStream';

/**
 * Veri hattının bake adımı (Faz 12, karo akışı; saf mantık): yüklenmiş dünyadan (`loadWorld`) akışlı dünya dosyalarını
 * üretir. Açılışta hesaplanan her şey (dere yatakları, yol ağı/planı, yapı düzeni, terasler, tünel delikleri) burada
 * **oyunun kendi koduyla** (`prepareDenseWorld`) bir kez hesaplanır; karolara pencere (yumuşatma/deniz tabanı için
 * komşu payıyla), düzeltme yamaları ve arazi örtüsü yazılır. Node ve tarayıcıda çalışır (`scripts/bakeWorld.ts`
 * dosyaları yazar).
 */

export interface BakedFile {
  /** Dünya klasörüne göreli yol. */
  path: string;
  bytes: Uint8Array;
}

export interface BakeResult {
  manifest: StreamManifest;
  files: BakedFile[];
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Karo dosyası yolu. */
export function tileFilePath(tx: number, ty: number): string {
  return `stream/t_${tx}_${ty}.bin`;
}

/**
 * Dünyayı bake eder. `worldFile`: `world.json`'ın bayt sayısı ve sha256'sı (eskimiş bake denetimi).
 * `onProgress`: ölçüm/ilerleme iletisi (isteğe bağlı).
 */
export async function bakeWorld(
  region: RegionData,
  worldFile: { bytes: number; sha256: string },
  onProgress: (message: string) => void = () => {},
): Promise<BakeResult> {
  const freshWater = region.features
    ? new FreshWaterIndex(region.features.water, FRESH_WATER.indexCellSize)
    : null;
  let t0 = performance.now();
  const prepared = prepareDenseWorld(region, freshWater);
  onProgress(
    `hazırlık (dere yatakları, yerleşim, tüneller): ${Math.round(performance.now() - t0)} ms`,
  );
  const { source } = prepared;
  const { gridWidth: width, gridHeight: height } = region.meta;
  const files: BakedFile[] = [];
  const add = async (path: string, value: unknown) => {
    const bytes = packBlob(value);
    files.push({ path, bytes });
    return { file: path, bytes: bytes.length, sha256: await sha256Hex(bytes) };
  };

  // Genel bakış: her 8. örnek (düzeltilmiş yükseklik) ve arazi örtüsü (en yakın örnek).
  t0 = performance.now();
  const cols = overviewSize(width);
  const rows = overviewSize(height);
  const cover = new Uint8Array(cols * rows);
  if (region.landcover) {
    for (let j = 0; j < rows; j++) {
      const r = Math.min(j * OVERVIEW_STRIDE, height - 1);
      for (let i = 0; i < cols; i++) {
        cover[j * cols + i] = region.landcover[
          r * width + Math.min(i * OVERVIEW_STRIDE, width - 1)
        ] as number;
      }
    }
  }
  const lakes = region.features
    ? lakeLevels(region.features.water.polygons, (x, z) => source.heightAt(x, z))
    : new Float32Array(0);
  const overviewBlob: OverviewBlob = {
    cols,
    rows,
    heights: source.buildOverview(),
    cover,
    lakeLevels: lakes,
  };
  const overview = await add('stream/overview.bin', overviewBlob);

  let settlements: StreamManifest['settlements'] = null;
  if (prepared.settlementMap && prepared.holes) {
    const blob: SettlementBlob = {
      map: prepared.settlementMap.toBaked(),
      holes: dumpHoles(prepared.holes),
    };
    settlements = await add('stream/settlements.bin', blob);
  }

  const tiles: StreamTileEntry[] = [];
  for (let ty = source.tileY0; ty < source.tileY0 + source.pagesY; ty++) {
    for (let tx = source.tileX0; tx < source.tileX0 + source.pagesX; tx++) {
      const core = source.tileCore(tx, ty);
      if (!core) continue;
      const window = cutWindow(region.heights, width, height, core, TILE_HALO);
      const coverWindow = region.landcover
        ? cutWindow(region.landcover, width, height, core, TILE_HALO).raw
        : new Uint8Array(window.cols * window.rows);
      const patches = source.tilePatches(tx, ty);
      const blob: TileBlob = {
        tx,
        ty,
        window: { col0: window.col0, row0: window.row0, cols: window.cols, rows: window.rows },
        raw: window.raw,
        cover: coverWindow,
        patchIndices: patches.indices,
        patchValues: patches.values,
      };
      tiles.push({ tx, ty, ...(await add(tileFilePath(tx, ty), blob)) });
    }
  }
  onProgress(
    `karolar ve genel bakış: ${tiles.length} karo, ${Math.round(performance.now() - t0)} ms`,
  );

  const manifest: StreamManifest = {
    version: STREAM_VERSION,
    worldId: region.meta.id,
    world: worldFile,
    halo: TILE_HALO,
    overview,
    settlements,
    tiles,
  };
  return { manifest, files };
}
