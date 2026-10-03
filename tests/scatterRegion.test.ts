import { scatterWaterOf } from '../src/data/waterThinning';
import { beforeAll, describe, expect, it } from 'vitest';
import { REGION_PLAYER, SCATTER } from '../src/config';
import type { RegionData } from '../src/data/region';
import { FRESH_WATER } from '../src/config';
import { chunkGridFor, chunkIndexAt, type ChunkGrid } from '../src/world/chunks';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { PROP_KINDS, type PropKind } from '../src/world/propKinds';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { scatterChunk, type ChunkProps, type ScatterInput } from '../src/world/scatter';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealRegion } from './helpers/realRegion';

let region: RegionData;
let source: RegionHeightSource;
let cover: LandCoverMap;
let water: FreshWaterIndex;
let scatterSource: ReturnType<RegionHeightSource['scatterView']>;
let grid: ChunkGrid;
let all: ChunkProps[];
let slowestMs = 0;
let totalMs = 0;

function inputFor(cx: number, cy: number): ScatterInput {
  return {
    cx,
    cy,
    grid,
    seed: SCATTER.seed,
    cover,
    height: source.scatterView(),
    isWater: (x, z, clearance) => water.nearest(x, z, clearance) !== null,
  };
}

beforeAll(async () => {
  region = await loadRealRegion();
  source = RegionHeightSource.fromRegion(region);
  scatterSource = source.scatterView();
  const map = LandCoverMap.fromRegion(region);
  if (!map) throw new Error('landcover.bin gerekli');
  cover = map;
  water = new FreshWaterIndex(scatterWaterOf(region.features!), FRESH_WATER.indexCellSize);
  grid = chunkGridFor(source);

  all = [];
  for (let cy = grid.cy0; cy < grid.cy0 + grid.rows; cy++) {
    for (let cx = grid.cx0; cx < grid.cx0 + grid.cols; cx++) {
      const start = performance.now();
      all.push(scatterChunk(inputFor(cx, cy)));
      const ms = performance.now() - start;
      slowestMs = Math.max(slowestMs, ms);
      totalMs += ms;
    }
  }
}, 120_000);

const TREE_KINDS: PropKind[] = ['tree_broadleaf', 'tree_conifer', 'chestnut'];
const WOODY_KINDS: PropKind[] = [...TREE_KINDS, 'bush', 'berry_bush', 'hazel', 'mushroom'];

// Tüm bölgeyi (130 chunk, ~94 bin nesne) tarayan testler yavaş CI çalıştırıcılarında 5 sn'yi aşabilir.
describe('scatterChunk (gerçek bölge)', { timeout: 60_000 }, () => {
  it("tüm chunk'lar hesaplanır ve bölgede nesne vardır", () => {
    expect(all).toHaveLength(grid.cols * grid.rows);
    const total = all.reduce((sum, p) => sum + p.count, 0);
    expect(total).toBeGreaterThan(60_000);
  });

  it('kurallar: deniz/kıyı yok, tatlı su tamponu, eğim sınırı, sınıf tablosu, y = zemin', () => {
    const density = SCATTER.density as Record<string, Partial<Record<PropKind, number>>>;
    // Dağılım ham (yumuşatmasız) araziyle yapılır: kurallar o görünümde sınanır.
    const source = scatterSource;
    for (const props of all) {
      for (let i = 0; i < props.count; i++) {
        const kind = PROP_KINDS[props.kind[i] as number] as PropKind;
        const spec = SCATTER.kinds[kind];
        const x = props.x[i] as number;
        const z = props.z[i] as number;

        expect(source.elevationAt(x, z)).toBeGreaterThan(SCATTER.minElevation);
        expect(source.slopeDegAt(x, z)).toBeLessThanOrEqual(spec.maxSlopeDeg);
        expect(water.nearest(x, z, spec.waterClearance)).toBeNull();
        expect(props.y[i]).toBeCloseTo(source.heightAt(x, z), 2);
        expect(density[cover.classAt(x, z)]?.[kind] ?? 0).toBeGreaterThan(0);
        if (TREE_KINDS.includes(kind)) {
          expect(source.elevationAt(x, z)).toBeLessThanOrEqual(SCATTER.treeLineElevation);
        }
        expect(spec.maxSlopeDeg).toBeLessThanOrEqual(90);
      }
    }
  });

  it('ağaçlar yalnızca orman/çalı (ve tarımda fındık) sınıfına düşer; tarım/çıplak/yerleşimde ağaç yok', () => {
    let trees = 0;
    let onForestOrShrub = 0;
    for (const props of all) {
      for (let i = 0; i < props.count; i++) {
        const kind = PROP_KINDS[props.kind[i] as number] as PropKind;
        if (!TREE_KINDS.includes(kind)) continue;
        trees++;
        const cls = cover.classAt(props.x[i] as number, props.z[i] as number);
        if (cls === 'forest' || cls === 'shrub') onForestOrShrub++;
        expect(['crop', 'barren', 'urban', 'snow', 'none', 'grass', 'wetland']).not.toContain(cls);
      }
    }
    expect(trees).toBeGreaterThan(30_000);
    expect(onForestOrShrub / trees).toBeGreaterThanOrEqual(0.99);
  });

  it('eğim üst sınırı bölgenin oyuncu sınırını aşmaz (bitkiler yürünebilir yamaçta)', () => {
    for (const kind of WOODY_KINDS) {
      expect(SCATTER.kinds[kind].maxSlopeDeg).toBeLessThanOrEqual(REGION_PLAYER.maxSlopeDeg);
    }
  });

  it("orman örtüşmesi: uygun orman bloklarının ≥ %90'ında en az bir ağaç var", () => {
    const block = 32; // oyun m (16×16 arazi örtüsü hücresi); ≈ 10 beklenen ağaç
    const half = block / 2;
    const treeBlocks = new Set<string>();
    const key = (bx: number, bz: number) => `${bx},${bz}`;
    for (const props of all) {
      for (let i = 0; i < props.count; i++) {
        if (!TREE_KINDS.includes(PROP_KINDS[props.kind[i] as number] as PropKind)) continue;
        treeBlocks.add(
          key(
            Math.floor((props.x[i] as number) / block),
            Math.floor((props.z[i] as number) / block),
          ),
        );
      }
    }

    let eligible = 0;
    let withTree = 0;
    const { minX, maxX, minZ, maxZ } = source.bounds;
    for (let bx = Math.floor(minX / block); bx < Math.ceil(maxX / block); bx++) {
      for (let bz = Math.floor(minZ / block); bz < Math.ceil(maxZ / block); bz++) {
        const cx = bx * block + half;
        const cz = bz * block + half;
        let good = 0;
        let total = 0;
        for (let dx = -half + 1; dx < half; dx += 4) {
          for (let dz = -half + 1; dz < half; dz += 4) {
            const x = cx + dx;
            const z = cz + dz;
            const elevation = source.elevationAt(x, z);
            total++;
            if (
              cover.classAt(x, z) === 'forest' &&
              elevation > 30 &&
              elevation < 500 && // yapraklı platosu: ağaç yoğunluğu tam (gürültü payıyla)
              source.slopeDegAt(x, z) < 50
            ) {
              good++;
            }
          }
        }
        const ok = good / total >= 0.9;
        if (!ok || water.nearest(cx, cz, SCATTER.waterClearance + half) !== null) continue;
        eligible++;
        if (treeBlocks.has(key(bx, bz))) withTree++;
      }
    }
    expect(eligible).toBeGreaterThan(50);
    expect(withTree / eligible).toBeGreaterThanOrEqual(0.9);
  });

  it('orman alanı ağaç yoğunluğu hedef civarında: orman hücresi başına ≈ hedef yoğunluk', () => {
    // Zemin ağaçları (yapraklı+iğne yapraklı+kestane) orman hücrelerinde toplam ≈ 1 / 100 m².
    let forestCells = 0;
    for (let row = 0; row < cover.height; row += 4) {
      for (let col = 0; col < cover.width; col += 4) {
        if (cover.valueAtCell(col, row) === 1) forestCells++;
      }
    }
    const forestArea = forestCells * 16 * cover.cell * cover.cell; // oyun m² (4 hücrede bir örnek)
    let forestTrees = 0;
    for (const props of all) {
      for (let i = 0; i < props.count; i++) {
        if (!TREE_KINDS.includes(PROP_KINDS[props.kind[i] as number] as PropKind)) continue;
        if (cover.classAt(props.x[i] as number, props.z[i] as number) === 'forest') forestTrees++;
      }
    }
    const perHundred = (forestTrees / forestArea) * 100;
    // Eleme (kıyı, su, dik yamaç, ağaç sınırı) yoğunluğu hedefin altına çeker; yine de makul aralıkta.
    expect(perHundred).toBeGreaterThan(0.6);
    expect(perHundred).toBeLessThan(1.15);
  });

  it('yerleşim (urban) ve deniz üzerinde nesne yok', () => {
    for (const props of all) {
      for (let i = 0; i < props.count; i++) {
        const cls = cover.classAt(props.x[i] as number, props.z[i] as number);
        expect(['urban', 'snow', 'none']).not.toContain(cls);
      }
    }
  });

  it('komşu chunk sınırında çift nesne yok: konum başına tek sahip', () => {
    for (const props of all) {
      for (let i = 0; i < props.count; i += 37) {
        const idx = chunkIndexAt(grid, props.x[i] as number, props.z[i] as number);
        expect(idx).toEqual({ cx: props.cx, cy: props.cy });
      }
    }
  });

  it('hız: tek chunk için gevşek üst sınırın altında', () => {
    expect(slowestMs).toBeLessThan(250); // CI gürültüsüne karşı cömert; ortalama çok daha düşük
    expect(totalMs / all.length).toBeLessThan(50);
  });
});
