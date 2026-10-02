import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER, SCATTER } from '../src/config';
import type { RegionData } from '../src/data/region';
import { chunkGridFor } from '../src/world/chunks';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { scatterChunk } from '../src/world/scatter';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealWorld } from './helpers/realRegion';
import { buildSettlementWorld } from './helpers/settlementWorld';

let world: RegionData;

beforeAll(async () => {
  world = await loadRealWorld();
}, 60_000);

describe('RegionHeightSource — yol düzeltmesi ve doğal arazi', () => {
  it('düzeltme yokken natural() kaynakla aynı değeri verir', () => {
    const source = RegionHeightSource.fromRegion(world);
    expect(source.graded).toBe(false);
    const n = source.natural();
    for (const [x, z] of [
      [0, 0],
      [-500.3, 120.7],
      [800.1, -300.9],
    ] as const) {
      expect(n.heightAt(x, z)).toBeCloseTo(source.heightAt(x, z), 6);
      expect(n.slopeDegAt(x, z)).toBeCloseTo(source.slopeDegAt(x, z), 6);
      expect(n.elevationAt(x, z)).toBeCloseTo(source.elevationAt(x, z), 6);
    }
  });

  it('düzeltmeden sonra natural() eski yükseklikleri korur, kaynak ise değişir', () => {
    const source = RegionHeightSource.fromRegion(world);
    const probe = [-1785, 1075] as const; // Düzce merkezi (yollar geçer)
    const before = source.heightAt(probe[0], probe[1]);
    source.setSample(
      Math.round((probe[0] - source.origin.x) / source.cell),
      Math.round((probe[1] - source.origin.z) / source.cell),
      before + 5,
    );
    expect(source.graded).toBe(true);
    expect(source.natural().heightAt(probe[0], probe[1])).toBeCloseTo(before, 6);
    expect(source.heightAt(probe[0], probe[1])).toBeGreaterThan(before + 1);
  });

  it('nesne dağılımı (adet ve sıra) yol düzeltmesinden bağımsız: kimlikler kaymaz', () => {
    const cover = LandCoverMap.fromRegion(world)!;
    const water = new FreshWaterIndex(world.features!.water, FRESH_WATER.indexCellSize);
    const plain = RegionHeightSource.fromRegion(world);
    const sw = buildSettlementWorld(world); // düzeltilmiş kaynak
    expect(sw.source.graded).toBe(true);
    const grid = chunkGridFor(plain);
    const natural = sw.source.natural();
    const scatterHeight = {
      heightAt: (x: number, z: number) => sw.source.heightAt(x, z),
      elevationAt: natural.elevationAt,
      slopeDegAt: natural.slopeDegAt,
    };
    // Düzce çevresinden birkaç chunk.
    let checked = 0;
    for (let cy = grid.cy0; cy < grid.cy0 + grid.rows; cy += 3) {
      for (let cx = grid.cx0; cx < grid.cx0 + grid.cols; cx += 3) {
        const a = scatterChunk({
          cx,
          cy,
          grid,
          seed: SCATTER.seed,
          cover,
          height: plain,
          isWater: (x, z, c) => water.nearest(x, z, c) !== null,
        });
        const b = scatterChunk({
          cx,
          cy,
          grid,
          seed: SCATTER.seed,
          cover,
          height: scatterHeight,
          isWater: (x, z, c) => water.nearest(x, z, c) !== null,
        });
        expect(b.count).toBe(a.count);
        expect(Array.from(b.kind)).toEqual(Array.from(a.kind));
        expect(Array.from(b.x)).toEqual(Array.from(a.x));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  }, 60_000);
});
