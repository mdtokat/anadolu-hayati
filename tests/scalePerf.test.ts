import { beforeAll, describe, expect, it } from 'vitest';
import { CHUNK, FRESH_WATER } from '../src/config';
import { createRegionCreatureTerrain } from '../src/creatures/regionTerrain';
import { makeSpawnGrid } from '../src/creatures/spawn';
import type { RegionData } from '../src/data/region';
import { buildCoverWeights } from '../src/world/landCoverWeights';
import { ChunkManager } from '../src/world/ChunkManager';
import { FreshWaterMesh } from '../src/world/FreshWaterMesh';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { PropLayer } from '../src/world/PropLayer';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { createTerrainMaterial } from '../src/world/TerrainMaterial';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealRegion } from './helpers/realRegion';
import { syntheticWorld, TARGET_EXTENT } from './helpers/syntheticWorld';

/**
 * 7.8 ölçek ölçümü (CPU, Node; WebGL'siz): Faz 7 kapsamındaki sentetik büyük dünyada (2228 × 1962 örnek, 288
 * chunk) açılış hazırlığının aşamaları ve bellek. Yapısal sayılar kesin denetlenir; süreler gevşek bir tavanla
 * (yavaş CI) denetlenir, `SCALE_REPORT=1` ile tablo olarak yazdırılır. Draw call/üçgen sayımı başsız tarayıcıda
 * yapılır (`?world=wide`, bkz. ROADMAP 7.8 notu). Gerçek veri (7.4) gelince aynı ölçüm gerçek dünyada yinelenir.
 */

interface Phase {
  name: string;
  ms: number;
}

let legacy: RegionData;

beforeAll(async () => {
  legacy = await loadRealRegion();
}, 60_000);

function time<T>(phases: Phase[], name: string, fn: () => T): T {
  const start = performance.now();
  const value = fn();
  phases.push({ name, ms: performance.now() - start });
  return value;
}

/** RegionWorld kurucusunun ağır aşamaları (fizik/WebGL hariç) + başlangıç çevresinin chunk ve nesneleri. */
function prepareWorld(region: RegionData) {
  const phases: Phase[] = [];
  const source = time(phases, 'RegionHeightSource (nicem çözme + deniz tabanı)', () =>
    RegionHeightSource.fromRegion(region),
  );
  const weights = time(phases, 'arazi örtüsü ağırlıkları (2 doku)', () =>
    buildCoverWeights(region.landcover!),
  );
  const material = createTerrainMaterial();
  const cover = time(phases, 'LandCoverMap', () => LandCoverMap.fromRegion(region)!);
  const water = time(
    phases,
    'tatlı su indeksi',
    () => new FreshWaterIndex(region.features!.water, FRESH_WATER.indexCellSize),
  );
  const waterMesh = time(
    phases,
    'tatlı su mesh',
    () => new FreshWaterMesh(region.features!.water, (x, z) => source.heightAt(x, z)),
  );
  const chunks = new ChunkManager(source, material);
  const spawn = { x: -688, z: -277 }; // Zonguldak başlangıcı (eski ve geniş dünyada aynı yer)
  time(phases, `ilk chunk'lar (görüş ${CHUNK.viewDistance} m, hepsi)`, () =>
    chunks.update(spawn.x, spawn.z, Infinity),
  );
  const props = new PropLayer(source, cover, water);
  time(phases, 'başlangıç nesneleri (PropLayer.prepare)', () => props.prepare(spawn.x, spawn.z));
  const terrain = time(phases, 'canlı arazisi + doğma ızgarası', () => {
    const t = createRegionCreatureTerrain({ source, cover, freshWater: water });
    makeSpawnGrid(t.bounds);
    return t;
  });
  const seaDistance = time(phases, 'deniz uzaklığı (tembel, ilk ses sorgusunda)', () =>
    source.distanceToSea(spawn.x, spawn.z),
  );

  const samples = source.width * source.height;
  const memory = {
    heightsUint16: region.heights.byteLength,
    gameHeightsFloat32: samples * 4,
    seaDistanceFloat32: samples * 4,
    landcoverUint8: region.landcover!.byteLength,
    coverTexturesRgba: weights.a.byteLength + weights.b.byteLength,
  };
  const result = {
    phases,
    totalMs: phases.reduce((sum, p) => sum + p.ms, 0),
    chunks: chunks.chunkCount,
    grid: chunks.grid,
    memory,
    terrain,
    seaDistance,
  };
  chunks.dispose();
  props.dispose();
  waterMesh.dispose();
  material.dispose();
  return result;
}

const MB = 1024 * 1024;

describe('Faz 7 ölçeği (sentetik büyük dünya, CPU)', { timeout: 120_000 }, () => {
  it('288 chunk (18 × 16), bellek bütçesi; açılış hazırlığı ölçülür', () => {
    const wideStart = performance.now();
    const wide = syntheticWorld(legacy);
    const assembleMs = performance.now() - wideStart;

    const old = prepareWorld(legacy);
    const big = prepareWorld(wide);

    expect(big.grid).toMatchObject({ cx0: -5, cy0: 0, cols: 18, rows: 16 });
    expect(big.chunks).toBe(288); // görüş uzaklığı tüm dünyayı kapsıyor (draw call'ı frustum sınırlar)
    expect(big.grid.sampleWidth * big.grid.sampleHeight).toBe(
      TARGET_EXTENT.cols * TARGET_EXTENT.rows,
    );

    // Bellek (plan §1.4 tahmini: yükseklik Float32 ≈ 17 MB, deniz uzaklığı ≈ 17 MB, örtü ≈ 4 MB, dokular ≈ 35 MB)
    const total = Object.values(big.memory).reduce((a, b) => a + b, 0);
    expect(big.memory.gameHeightsFloat32 / MB).toBeLessThan(18);
    expect(big.memory.coverTexturesRgba / MB).toBeLessThan(36);
    expect(total / MB).toBeLessThan(100);

    // Süre: başsız bütçe 3 sn (ağ ve birleştirme hariç); yavaş CI için gevşek tavan.
    expect(big.totalMs).toBeLessThan(15_000);

    if (process.env.SCALE_REPORT) {
      const rows = big.phases.map((p, i) => {
        const before = old.phases[i]?.ms ?? 0;
        return `| ${p.name} | ${before.toFixed(0)} | ${p.ms.toFixed(0)} |`;
      });
      const mem = Object.entries(big.memory).map(
        ([k, v]) =>
          `| ${k} | ${((old.memory[k as keyof typeof old.memory] ?? 0) / MB).toFixed(1)} | ${(v / MB).toFixed(1)} |`,
      );
      process.stdout.write(
        [
          '',
          `sentetik dünya birleştirme: ${assembleMs.toFixed(0)} ms`,
          '| Aşama | eski bölge (ms) | geniş dünya (ms) |',
          '|---|---|---|',
          ...rows,
          `| **toplam** | ${old.totalMs.toFixed(0)} | ${big.totalMs.toFixed(0)} |`,
          '',
          '| Bellek | eski (MB) | geniş (MB) |',
          '|---|---|---|',
          ...mem,
          '',
        ].join('\n'),
      );
    }
  });
});
