import { scatterWaterOf } from '../src/data/waterThinning';
import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER, SCATTER } from '../src/config';
import type { CreatureTerrain } from '../src/creatures/kinds';
import { createRegionCreatureTerrain } from '../src/creatures/regionTerrain';
import { candidatesForCell, makeSpawnGrid, type SpawnGrid } from '../src/creatures/spawn';
import { decodeCreatureId } from '../src/creatures/species';
import type { RegionData } from '../src/data/region';
import { decodeAbsoluteChunkKey } from '../src/world/chunkKeys';
import { chunkGridFor, chunkRect, type ChunkGrid } from '../src/world/chunks';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { scatterChunk } from '../src/world/scatter';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadLegacyRegion, loadRealWorld } from './helpers/realRegion';
import { syntheticWorld } from './helpers/syntheticWorld';

/**
 * Faz 7.5 regresyon kapısı: ızgara çapası ve mutlak kimliklere geçişte eski bölgedeki ormanlar, kayalar ve
 * canlı doğma adayları **yerinden oynamamalı**. Değerler refaktörden önce eski kodla kaydedildi; yerleşim
 * yalnızca chunk koordinatına `(cx, cy)` bağlı olduğundan aynı kalmalıdır. Kimliğin kendisi (anahtar
 * biçimi değişti) özete girmez; yerine `(cx, cy, sıra)` girer.
 */

/** FNV-1a (32 bit), sayıların Float32 bit desenleri üzerinde. */
function hasher() {
  let h = 0x811c9dc5;
  const f32 = new Float32Array(1);
  const u8 = new Uint8Array(f32.buffer);
  return {
    add(value: number) {
      f32[0] = value;
      for (const b of u8) h = Math.imul(h ^ b, 0x01000193);
    },
    get value() {
      return (h >>> 0).toString(16).padStart(8, '0');
    },
  };
}

/** Eski bölgede dağıtılmış 12 chunk (köşeler, kenarlar, kıyı, orman, yayla). */
const CHUNKS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [12, 9],
  [6, 4],
  [3, 7],
  [9, 2],
  [5, 5],
  [11, 6],
  [8, 5],
  [7, 8],
  [4, 3],
  [10, 0],
  [1, 9],
];

interface World {
  source: RegionHeightSource;
  cover: LandCoverMap;
  water: FreshWaterIndex;
  grid: ChunkGrid;
  terrain: CreatureTerrain;
  spawnGrid: SpawnGrid;
}

function worldOf(region: RegionData): World {
  const source = RegionHeightSource.fromRegion(region);
  const cover = LandCoverMap.fromRegion(region)!;
  const water = new FreshWaterIndex(scatterWaterOf(region.features!), FRESH_WATER.indexCellSize);
  const terrain = createRegionCreatureTerrain({ source, cover, freshWater: water });
  return {
    source,
    cover,
    water,
    grid: chunkGridFor(source),
    terrain,
    spawnGrid: makeSpawnGrid(terrain.bounds),
  };
}

function scatterOf(world: World, cx: number, cy: number) {
  return scatterChunk({
    cx,
    cy,
    grid: world.grid,
    seed: SCATTER.seed,
    cover: world.cover,
    height: world.source.scatterView(),
    isWater: (x, z, clearance) => world.water.nearest(x, z, clearance) !== null,
  });
}

function scatterDigest(world: World, cx: number, cy: number): { count: number; digest: string } {
  const props = scatterOf(world, cx, cy);
  const h = hasher();
  h.add(props.count);
  for (let i = 0; i < props.count; i++) {
    h.add(props.kind[i] as number);
    h.add(props.x[i] as number);
    h.add(props.y[i] as number);
    h.add(props.z[i] as number);
    h.add(props.yaw[i] as number);
    h.add(props.scale[i] as number);
    h.add(props.tone[i] as number);
  }
  return { count: props.count, digest: h.value };
}

function addCandidates(
  h: ReturnType<typeof hasher>,
  world: World,
  cx: number,
  cy: number,
  epoch: number,
): number {
  const list = candidatesForCell({ grid: world.spawnGrid, terrain: world.terrain, cx, cy, epoch });
  h.add(cx);
  h.add(cy);
  h.add(list.length);
  for (const c of list) {
    const { cellKey, index } = decodeCreatureId(c.id);
    expect(decodeAbsoluteChunkKey(cellKey)).toEqual({ cx, cy }); // kimlik mutlak hücreyi taşır
    h.add(index);
    h.add(c.kind.length);
    h.add(c.kind.charCodeAt(0));
    h.add(c.x);
    h.add(c.z);
    h.add(c.yaw);
    h.add(c.u);
  }
  return list.length;
}

const EPOCHS = [0, 7, 19];

let legacy: World;
let wide: World;
let real: World;

beforeAll(async () => {
  const region = await loadLegacyRegion();
  legacy = worldOf(region);
  wide = worldOf(syntheticWorld(region));
  real = worldOf(await loadRealWorld());
}, 60_000);

/** Eski alanın (dünyanın (0, 0) köşesindeki 1588 × 1176 pencere) kesin özetleri. */
describe('eski bölge golden özetleri (7.5 regresyon kapısı)', { timeout: 60_000 }, () => {
  it('scatterChunk: 12 chunk birebir aynı nesneleri üretir', () => {
    const digests: Record<string, string> = {};
    let total = 0;
    for (const [cx, cy] of CHUNKS) {
      const { count, digest } = scatterDigest(legacy, cx, cy);
      digests[`${cx},${cy}`] = digest;
      total += count;
    }
    expect({ total, digests }).toEqual(SCATTER_GOLDEN);
  });

  it('candidatesForCell: eski ızgaranın 130 hücresi × 3 dönem birebir aynı adayları üretir', () => {
    const totals: Record<string, number> = {};
    const h = hasher();
    for (const epoch of EPOCHS) {
      let total = 0;
      for (let cy = 0; cy < 10; cy++) {
        for (let cx = 0; cx < 13; cx++) total += addCandidates(h, legacy, cx, cy, epoch);
      }
      totals[`epoch ${epoch}`] = total;
    }
    expect({ totals, digest: h.value }).toEqual(CANDIDATE_GOLDEN);
  });
});

/**
 * Eski bölge, kafesteki yerinde duran daha geniş bir dünyaya (batıya 5 chunk, güneye 6 chunk; negatif chunk
 * indeksleri) gömülünce de aynı nesne ve adayları üretmeli: yerleşim dünya kapsamından bağımsızdır. Yalnızca
 * yeni komşusu olan kenar chunk'ları (batı `cx = 0`, güney `cy = 9`) kenar sıkıştırması yüzünden farklı olabilir.
 */
describe('geniş dünyada eski alan yerinde kalır (kafes değişmezliği)', { timeout: 60_000 }, () => {
  const interior = (cx: number, cy: number) => cx >= 1 && cy <= 8;

  it('geniş dünyanın ilk chunk/hücresi kafes indeksidir (−5, 0)', () => {
    expect(wide.grid).toMatchObject({ cx0: -5, cy0: 0, cols: 18, rows: 16 });
    expect(wide.spawnGrid).toMatchObject({ cx0: -5, cy0: 0, cols: 18, rows: 16 });
    expect(chunkRect(wide.grid, 3, 2)).toEqual(chunkRect(legacy.grid, 3, 2));
  });

  it("iç chunk'lar golden ile aynı nesneleri üretir", () => {
    for (const [cx, cy] of CHUNKS) {
      if (!interior(cx, cy)) continue;
      expect(scatterDigest(wide, cx, cy).digest, `chunk ${cx},${cy}`).toBe(
        SCATTER_GOLDEN.digests[`${cx},${cy}` as keyof typeof SCATTER_GOLDEN.digests],
      );
    }
  });

  it('iç hücreler aynı doğma adaylarını üretir', () => {
    for (const epoch of EPOCHS) {
      for (let cy = 0; cy < 10; cy++) {
        for (let cx = 0; cx < 13; cx++) {
          if (!interior(cx, cy)) continue;
          const a = hasher();
          const b = hasher();
          addCandidates(a, legacy, cx, cy, epoch);
          addCandidates(b, wide, cx, cy, epoch);
          expect(b.value, `hücre ${cx},${cy}@${epoch}`).toBe(a.value);
        }
      }
    }
  });
});

/**
 * Gerçek Faz 7 dünyası (7.4): eski alan dünya geneli yükseklik aralığıyla yeniden nicemlendi (≤ 1 nicem ≈ 3,7 cm)
 * ve güneyine/batısına komşu geldi. Ölçülen (7.9): iç chunk'larda (satır ≤ 8) chunk başına en çok ±2 nesne
 * eşikte değişir (~1000'de), aynı kalanların yüksekliği ≤ 0,05 m oynar; doğma adayları iç hücrelerde birebir
 * aynıdır. Son satır (cy = 9) artık güneyinde arazi olduğu için değişir (beklenen). Plan §8 risk 5.
 */
describe('gerçek dünyada eski alan yerinde kalır (≤ 1 nicem)', { timeout: 120_000 }, () => {
  const interior = (cy: number) => cy <= 8;

  it('gerçek dünyanın ızgarası hedef kapsam: 18 × 16 chunk, ilk chunk (−5, 0)', () => {
    expect(real.grid).toMatchObject({ cx0: -5, cy0: 0, cols: 18, rows: 16 });
    expect(chunkRect(real.grid, 3, 2)).toEqual(chunkRect(legacy.grid, 3, 2));
  });

  it("iç chunk'larda nesnelerin ≥ %99,8'i aynı yerde ve türde; yükseklik farkı ≤ 0,06 m", () => {
    let legacyTotal = 0;
    let kept = 0;
    for (let cy = 0; cy < 10; cy++) {
      if (!interior(cy)) continue;
      for (let cx = 0; cx < 13; cx++) {
        const a = scatterOf(legacy, cx, cy);
        const b = scatterOf(real, cx, cy);
        const index = new Map<string, number>();
        for (let i = 0; i < b.count; i++)
          index.set(`${b.kind[i]}:${b.x[i]}:${b.z[i]}`, b.y[i] as number);
        let same = 0;
        for (let i = 0; i < a.count; i++) {
          const y = index.get(`${a.kind[i]}:${a.x[i]}:${a.z[i]}`);
          if (y === undefined) continue;
          same++;
          expect(Math.abs(y - (a.y[i] as number))).toBeLessThanOrEqual(0.06);
        }
        // eşikteki birkaç aday dışında aynı
        expect(a.count - same, `chunk ${cx},${cy}`).toBeLessThanOrEqual(3);
        expect(b.count - same, `chunk ${cx},${cy}`).toBeLessThanOrEqual(3);
        legacyTotal += a.count;
        kept += same;
      }
    }
    expect(kept / legacyTotal).toBeGreaterThanOrEqual(0.998);
  });

  it('iç hücrelerde doğma adayları birebir aynı', () => {
    for (const epoch of EPOCHS) {
      for (let cy = 0; cy < 10; cy++) {
        if (!interior(cy)) continue;
        for (let cx = 0; cx < 13; cx++) {
          const a = hasher();
          const b = hasher();
          addCandidates(a, legacy, cx, cy, epoch);
          addCandidates(b, real, cx, cy, epoch);
          expect(b.value, `hücre ${cx},${cy}@${epoch}`).toBe(a.value);
        }
      }
    }
  });
});

/**
 * 7.10: eski `public/data/regions` kalktığından özetler, karolu dünyanın eski alana düşen penceresinden
 * (`loadLegacyRegion`) yeniden kaydedildi. Dünya geneli nicemleme (≤ 1 nicem ≈ 3,7 cm) eğim eşiğindeki 2 nesneyi
 * değiştirdi (9832 → 9830); yerleşim kuralı ve adaylar (`CANDIDATE_GOLDEN`) aynıdır.
 */
const SCATTER_GOLDEN = {
  total: 9830,
  digests: {
    '0,0': '4b95f515',
    '12,9': 'd887ccbc',
    '6,4': '44a06b3a',
    '3,7': '584bc7ab',
    '9,2': '959ed496',
    '5,5': '1bddf8f9',
    '11,6': '55c94b82',
    '8,5': '1fa3d2d6',
    '7,8': '307f3254',
    '4,3': 'b496006f',
    '10,0': 'ac2b6c5f',
    '1,9': '812bef28',
  },
};
/**
 * Yeniden kaydedildi (Faz 10 sonrası): arazi yumuşatması (eğim → yaşam alanı), yeni türler (kızıl geyik, tilki, yabani
 * tavşan, sülün) ve azaltılan yaban domuzu/boz ayı yoğunluğu. Nesne golden'ı (`SCATTER_GOLDEN`) değişmedi.
 */
const CANDIDATE_GOLDEN = {
  totals: { 'epoch 0': 351, 'epoch 7': 345, 'epoch 19': 305 },
  digest: '1b69d0fe',
};
