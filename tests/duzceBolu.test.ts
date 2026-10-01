import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER, REGION_PLAYER, TELEPORTS, VERTICAL_SCALE } from '../src/config';
import type { RegionData } from '../src/data/region';
import { initPhysics } from '../src/physics/PhysicsWorld';
import { latLonToGame } from '../src/world/geo';
import { latticeX, latticeZ } from '../src/world/lattice';
import { provinceAt } from '../src/world/provinces';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { findSafeSpawn } from '../src/world/spawn';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealWorld } from './helpers/realRegion';
import { routeBetween, walkPath } from './helpers/walker';

/**
 * Faz 7.9 içerik: Düzce–Bolu ışınlanma noktaları, Abant ve Yedigöller'de içilebilir göl, Zonguldak'tan Düzce'ye
 * ve Bolu'ya kesintisiz (fizikli) yürüyüş, eski/yeni alan dikişinde yükseklik sıçraması olmaması.
 */
let region: RegionData;
let source: RegionHeightSource;
let water: FreshWaterIndex;

beforeAll(async () => {
  await initPhysics();
  region = await loadRealWorld();
  source = RegionHeightSource.fromRegion(region);
  water = new FreshWaterIndex(region.features!.water, FRESH_WATER.indexCellSize);
}, 60_000);

const STILL_WATER = new Set(['lake', 'pond', 'reservoir', 'water']);
const byName = (name: string) => TELEPORTS.find((t) => t.name === name)!;

function safePoint(tp: { lat: number; lon: number }) {
  const { x, z } = latLonToGame(tp.lat, tp.lon, region.meta.originUtm);
  return findSafeSpawn(source, x, z, REGION_PLAYER.maxSlopeDeg)!;
}

describe('ışınlanma noktaları (1–9, 0)', () => {
  it('on nokta; beşi Düzce–Bolu (Düzce merkez, Bolu merkez, Abant, Yedigöller, Akçakoca)', () => {
    expect(TELEPORTS).toHaveLength(10);
    expect(TELEPORTS.slice(5).map((t) => t.name)).toEqual([
      'Düzce merkez',
      'Bolu merkez',
      'Abant Gölü',
      'Yedigöller',
      'Akçakoca',
    ]);
  });

  for (const tp of TELEPORTS) {
    it(`${tp.name}: karada, beklenen ilde (${tp.province}), göl içinde değil`, () => {
      const p = safePoint(tp);
      expect(p).not.toBeNull();
      const province = provinceAt(region.provinces, p.x, p.z);
      expect(province?.name).toBe(tp.province);
      expect(province?.inRegion).toBe(true);
      expect(source.elevationAt(p.x, p.z)).toBeGreaterThan(0);
      const hit = water.nearest(p.x, p.z, 0.01);
      expect(hit !== null && hit.distance === 0 && STILL_WATER.has(hit.kind)).toBe(false);
    });
  }
});

describe('Abant Gölü ve Yedigöller: göl var ve içilebilir', () => {
  // Gerçek rakımlar: Abant ≈ 1330 m, Yedigöller (Büyükgöl) ≈ 800 m.
  for (const [name, lake, minElevation, maxElevation] of [
    ['Abant Gölü', 'Abant Gölü', 1250, 1450],
    ['Yedigöller', 'Büyükgöl', 700, 950],
  ] as const) {
    it(`${name}: kıyıda durgun su (${lake}); bir iki adımda içme mesafesine girilir`, () => {
      const p = safePoint(byName(name));
      const hit = water.nearest(p.x, p.z, 10);
      expect(hit).not.toBeNull();
      expect(STILL_WATER.has(hit!.kind)).toBe(true);
      expect(hit!.name).toBe(lake);
      // Suya doğru yürü: içme mesafesine girilen nokta yürünebilir eğimde
      const d = hit!.distance;
      const t = Math.max(0, (d - (FRESH_WATER.reachDistance - 0.5)) / d);
      const sx = p.x + (hit!.x - p.x) * t;
      const sz = p.z + (hit!.z - p.z) * t;
      expect(water.nearest(sx, sz)).not.toBeNull(); // RegionWorld.freshWaterNear ile aynı sorgu
      expect(source.slopeDegAt(sx, sz)).toBeLessThan(REGION_PLAYER.maxSlopeDeg);
      expect(source.elevationAt(sx, sz)).toBeGreaterThan(minElevation);
      expect(source.elevationAt(sx, sz)).toBeLessThan(maxElevation);
    });
  }
});

describe('eski/yeni alan dikişi', () => {
  /** Dikiş boyunca komşu örnek farkı (m) dağılımı. */
  function diffs(pairs: Array<[number, number, number, number]>): { p99: number; max: number } {
    const values = pairs
      .map(([x0, z0, x1, z1]) => Math.abs(source.heightAt(x0, z0) - source.heightAt(x1, z1)))
      .map((v) => v * VERTICAL_SCALE)
      .sort((a, b) => a - b);
    return {
      p99: values[Math.floor(values.length * 0.99)] as number,
      max: values[values.length - 1] as number,
    };
  }

  it('batı (sütun −1|0) ve güney (satır 1175|1176) dikişinde sıçrama iç alandan büyük değil', () => {
    const rows = Array.from({ length: 1176 }, (_, r) => r);
    const cols = Array.from({ length: 1588 }, (_, c) => c);
    const across = (c: number) =>
      rows.map(
        (r) =>
          [latticeX(c - 1), latticeZ(r), latticeX(c), latticeZ(r)] as [
            number,
            number,
            number,
            number,
          ],
      );
    const down = (r: number) =>
      cols.map(
        (c) =>
          [latticeX(c), latticeZ(r - 1), latticeX(c), latticeZ(r)] as [
            number,
            number,
            number,
            number,
          ],
      );

    const west = diffs(across(0));
    const westInside = diffs([...across(-8), ...across(8)]);
    expect(west.p99).toBeLessThanOrEqual(westInside.p99 * 1.25);
    expect(west.max).toBeLessThanOrEqual(westInside.max * 1.5);

    const south = diffs(down(1176));
    const southInside = diffs([...down(1168), ...down(1184)]);
    expect(south.p99).toBeLessThanOrEqual(southInside.p99 * 1.25);
    expect(south.max).toBeLessThanOrEqual(southInside.max * 1.5);
  });
});

describe('Zonguldak → Düzce ve Bolu kesintisiz yürüyüş', () => {
  const start = byName('Zonguldak merkez');

  for (const [target, seconds] of [
    ['Düzce merkez', 60 * 12],
    ['Bolu merkez', 60 * 12],
  ] as const) {
    it(`${target}: oyuncu eğim sınırında (60°) yürünebilir rota var`, () => {
      const tp = byName(target);
      const path = routeBetween(
        source,
        region,
        [start.lat, start.lon],
        [tp.lat, tp.lon],
        REGION_PLAYER.maxSlopeDeg,
      );
      expect(path).not.toBeNull();
    }, 60_000);

    it(`${target}: oyuncu fizikle varır; dikişte sıçrama/düşme yok`, () => {
      const tp = byName(target);
      const path = routeBetween(source, region, [start.lat, start.lon], [tp.lat, tp.lon]);
      expect(path, 'rota (A* 50°)').not.toBeNull();
      const result = walkPath(region, path!, seconds);
      expect(
        result.reached,
        `varmalı (süre ${result.seconds.toFixed(0)} sn, takılma ${result.stuck}, kalan ${result.remaining.toFixed(1)} m)`,
      ).toBe(true);
      expect(result.maxJump).toBeLessThan(3);
      expect(result.provinces.has('Zonguldak')).toBe(true);
      expect(result.provinces.has(tp.province)).toBe(true);
    }, 600_000);
  }
});
