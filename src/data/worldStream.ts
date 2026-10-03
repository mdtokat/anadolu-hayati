import type { BakedSettlementMap } from '../settlements/bakedMap';
import { RegionDataError } from './region';

/**
 * Akışlı dünya (Faz 12, karo akışı) dosya sözleşmesi: `public/data/world/<id>/stream.json` + `stream/…`. Veri hattının
 * bake adımı (`scripts/bakeWorld.ts` → `data/worldBake.ts`) üretir; `world.json` ve özgün karo dosyaları değişmez
 * (yoksa oyun tüm dünyayı belleğe alan eski yolu kullanır). Ayrıntı: docs/faz-12-karo-akisi-olcumler.md.
 */

export const STREAM_VERSION = 1;

export interface StreamFileEntry {
  /** Dünya klasörüne göreli yol. */
  file: string;
  bytes: number;
  sha256: string;
}

export interface StreamTileEntry extends StreamFileEntry {
  tx: number;
  ty: number;
}

export interface StreamManifest {
  version: typeof STREAM_VERSION;
  worldId: string;
  /** Üretildiği `world.json`'ın bayt sayısı ve sha256'sı: eskimiş bake'i yakalar. */
  world: { bytes: number; sha256: string };
  /** Karo penceresinin çekirdek dışına taşan payı (örnek). */
  halo: number;
  overview: StreamFileEntry;
  /** Önceden hesaplanmış yerleşim haritası; yerleşimsiz dünyada null. */
  settlements: StreamFileEntry | null;
  tiles: StreamTileEntry[];
}

/** Karo dosyasının içeriği (`bakedBlob`). Pencere dizi (extent-göreli) indeksindedir. */
export interface TileBlob {
  tx: number;
  ty: number;
  window: { col0: number; row0: number; cols: number; rows: number };
  /** Pencerenin ham yükseklikleri (uint16). */
  raw: Uint16Array;
  /** Pencerenin arazi örtüsü sınıfları (uint8), aynı pencere. */
  cover: Uint8Array;
  /** Yol/dere/teras düzeltmesi yamaları: sayfa içi indeks ve düzeltilmiş oyun yüksekliği. */
  patchIndices: Uint32Array;
  patchValues: Float32Array;
}

/** Genel bakış dosyasının içeriği: her 8. örnek (oyun yüksekliği) ve arazi örtüsü. */
export interface OverviewBlob {
  cols: number;
  rows: number;
  heights: Float32Array;
  cover: Uint8Array;
}

/** Yerleşim dosyasının içeriği. */
export interface SettlementBlob {
  map: BakedSettlementMap;
  /** Tünel ağzı delikleri: `[col, row, …]` (dizi indeksi). */
  holes: Int32Array;
}

function fail(message: string): never {
  throw new RegionDataError(`Akış verisi geçersiz: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function entry(value: unknown, where: string): StreamFileEntry {
  if (!isRecord(value)) fail(`${where} bir nesne olmalı`);
  const { file, bytes, sha256 } = value;
  if (typeof file !== 'string' || file === '' || file.startsWith('/') || file.includes('..')) {
    fail(`${where}: 'file' göreli yol olmalı`);
  }
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0) {
    fail(`${where}: 'bytes' pozitif tam sayı olmalı`);
  }
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    fail(`${where}: 'sha256' 64 haneli küçük harf onaltılık olmalı`);
  }
  return { file, bytes, sha256 };
}

/** `stream.json`'ı doğrular. */
export function parseStreamManifest(json: unknown): StreamManifest {
  if (!isRecord(json)) fail('stream.json bir nesne olmalı');
  if (json.version !== STREAM_VERSION) {
    fail(`'version' ${String(json.version)}, desteklenen ${STREAM_VERSION}`);
  }
  if (typeof json.worldId !== 'string') fail("'worldId' metin olmalı");
  const world = json.world;
  if (!isRecord(world)) fail("'world' { bytes, sha256 } olmalı");
  const worldEntry = entry({ file: 'world.json', ...world }, 'world');
  if (typeof json.halo !== 'number' || !Number.isInteger(json.halo) || json.halo < 0) {
    fail("'halo' tam sayı olmalı");
  }
  if (!Array.isArray(json.tiles)) fail("'tiles' liste olmalı");
  const seen = new Set<string>();
  const tiles = json.tiles.map((t: unknown, i): StreamTileEntry => {
    const base = entry(t, `tiles[${i}]`);
    const r = t as Record<string, unknown>;
    if (!Number.isInteger(r.tx) || !Number.isInteger(r.ty))
      fail(`tiles[${i}]: tx/ty tam sayı olmalı`);
    const key = `${String(r.tx)},${String(r.ty)}`;
    if (seen.has(key)) fail(`karo (${key}) yinelenmiş`);
    seen.add(key);
    return { ...base, tx: r.tx as number, ty: r.ty as number };
  });
  return {
    version: STREAM_VERSION,
    worldId: json.worldId,
    world: { bytes: worldEntry.bytes, sha256: worldEntry.sha256 },
    halo: json.halo,
    overview: entry(json.overview, 'overview'),
    settlements: json.settlements === null ? null : entry(json.settlements, 'settlements'),
    tiles,
  };
}
