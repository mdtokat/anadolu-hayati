import { beforeAll, describe, expect, it } from 'vitest';
import { WORLD } from '../src/config';
import type { RegionData } from '../src/data/region';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { PAGE_SIZE, cutWindow } from '../src/world/terrainPages';
import { loadRealWorld } from './helpers/realRegion';

let region: RegionData;
let dense: RegionHeightSource;

beforeAll(async () => {
  region = await loadRealWorld();
  dense = RegionHeightSource.fromRegion(region);
}, 60_000);

/** Akış kipinde kaynak kurar ve verilen karoları pencereden yükler. */
function streamedWith(tiles: Array<[number, number]>): RegionHeightSource {
  const source = RegionHeightSource.streamed(region.meta, dense.buildOverview());
  for (const [tx, ty] of tiles) {
    const core = source.tileCore(tx, ty);
    if (!core) throw new Error('karo yok');
    source.loadTile(
      tx,
      ty,
      cutWindow(region.heights, region.meta.gridWidth, region.meta.gridHeight, core),
    );
  }
  return source;
}

describe('sayfalı arazi', () => {
  it('sayfa boyu karo boyuyla aynı ve kafese hizalı dünyada sayfa = karo', () => {
    expect(PAGE_SIZE).toBe(WORLD.tileSize);
    expect(dense.tileX0).toBe(Math.floor(-1152 / 512));
    expect(dense.pagesX * dense.pagesY).toBeGreaterThanOrEqual(50);
  });

  it('pencereden yüklenen karo yoğun kiple bire bir aynı (kıyı, kenar ve iç karolar)', () => {
    // İlk, son ve ortadaki karolar + kıyıdan geçen bir karo.
    const picks: Array<[number, number]> = [
      [dense.tileX0, dense.tileY0],
      [dense.tileX0 + dense.pagesX - 1, dense.tileY0 + dense.pagesY - 1],
      [Math.floor(dense.tileX0 + dense.pagesX / 2), Math.floor(dense.tileY0 + dense.pagesY / 2)],
      [0, 0],
      [1, 0],
    ];
    const streamed = streamedWith(picks);
    for (const [tx, ty] of picks) {
      const core = streamed.tileCore(tx, ty)!;
      let checked = 0;
      for (let r = core.row0; r < core.row0 + core.rows; r += 3) {
        for (let c = core.col0; c < core.col0 + core.cols; c += 3) {
          expect(streamed.sample(c, r)).toBe(dense.sample(c, r));
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(1000);
      // Kenar satır/sütunları da eksiksiz.
      for (let c = core.col0; c < core.col0 + core.cols; c++) {
        expect(streamed.sample(c, core.row0)).toBe(dense.sample(c, core.row0));
        expect(streamed.sample(c, core.row0 + core.rows - 1)).toBe(
          dense.sample(c, core.row0 + core.rows - 1),
        );
      }
      for (let r = core.row0; r < core.row0 + core.rows; r++) {
        expect(streamed.sample(core.col0, r)).toBe(dense.sample(core.col0, r));
        expect(streamed.sample(core.col0 + core.cols - 1, r)).toBe(
          dense.sample(core.col0 + core.cols - 1, r),
        );
      }
    }
  }, 120_000);

  it('scatterView ve natural() yüklü karoda yoğun kiple aynı', () => {
    const streamed = streamedWith([[0, 0]]);
    const core = streamed.tileCore(0, 0)!;
    const x = streamed.xAt(core.col0 + 77.3);
    const z = streamed.zAt(core.row0 + 301.9);
    expect(streamed.scatterView().heightAt(x, z)).toBe(dense.scatterView().heightAt(x, z));
    expect(streamed.natural().slopeDegAt(x, z)).toBe(dense.natural().slopeDegAt(x, z));
  });

  it('yüklü olmayan karoda genel bakış: her 8. örnekte tam, aradakiler aradeğer', () => {
    const streamed = streamedWith([]);
    expect(streamed.tileCount).toBe(0);
    for (const [c, r] of [
      [400, 800],
      [1600, 1200],
      [2400, 600],
    ] as const) {
      const c8 = Math.round(c / 8) * 8;
      const r8 = Math.round(r / 8) * 8;
      expect(streamed.sample(c8, r8)).toBe(dense.sample(c8, r8));
      expect(Math.abs(streamed.sample(c + 3, r + 5) - dense.sample(c + 3, r + 5))).toBeLessThan(40);
    }
  });

  it('yama: doğal yükseklik saklanır, geri alma ve karo boşaltma çalışır', () => {
    const streamed = streamedWith([[0, 0]]);
    const core = streamed.tileCore(0, 0)!;
    const c = core.col0 + 10;
    const r = core.row0 + 10;
    const before = streamed.sample(c, r);
    streamed.setSample(c, r, before + 4);
    expect(streamed.graded).toBe(true);
    expect(streamed.sample(c, r)).toBe(before + 4);
    expect(streamed.natural().heightAt(streamed.xAt(c), streamed.zAt(r))).toBeCloseTo(before, 5);
    const patches = streamed.tilePatches(0, 0);
    expect(patches.indices.length).toBe(1);
    expect(patches.values[0]).toBe(before + 4);
    streamed.unloadTile(0, 0);
    expect(streamed.hasTile(0, 0)).toBe(false);
    // Boşaltılınca genel bakıştan okunur.
    expect(Number.isFinite(streamed.sample(c, r))).toBe(true);
  });

  it('deniz mesafesi: akış kipinde genel bakıştan, en çok bir genel bakış hücresi sapar', () => {
    const streamed = streamedWith([]);
    for (const [x, z] of [
      [-1785, 1075],
      [0, 0],
      [-600, -900],
    ] as const) {
      const a = dense.distanceToSea(x, z);
      const b = streamed.distanceToSea(x, z);
      expect(Math.abs(a - b)).toBeLessThan(40);
    }
  });
});
