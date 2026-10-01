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
import { loadRealRegion } from './helpers/realRegion';
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
  const water = new FreshWaterIndex(region.features!.water, FRESH_WATER.indexCellSize);
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

function scatterDigest(world: World, cx: number, cy: number): { count: number; digest: string } {
  const props = scatterChunk({
    cx,
    cy,
    grid: world.grid,
    seed: SCATTER.seed,
    cover: world.cover,
    height: world.source,
    isWater: (x, z, clearance) => world.water.nearest(x, z, clearance) !== null,
  });
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

beforeAll(async () => {
  const region = await loadRealRegion();
  legacy = worldOf(region);
  wide = worldOf(syntheticWorld(region));
}, 60_000);

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

const SCATTER_GOLDEN = {
  total: 9832,
  digests: {
    '0,0': '4b95f515',
    '12,9': '27655d8e',
    '6,4': 'fdda65b3',
    '3,7': 'a9dc59c0',
    '9,2': '64ed8957',
    '5,5': '3d014798',
    '11,6': '7bad7232',
    '8,5': '605c3d12',
    '7,8': '05b877ae',
    '4,3': '9cf46c6f',
    '10,0': 'e1ed43e1',
    '1,9': 'ac218180',
  },
};
const CANDIDATE_GOLDEN = {
  totals: { 'epoch 0': 270, 'epoch 7': 282, 'epoch 19': 255 },
  digest: 'fa8d8030',
};
