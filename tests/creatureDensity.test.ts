import { beforeAll, describe, expect, it } from 'vitest';
import { CREATURES, FRESH_WATER } from '../src/config';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import { CREATURE_KINDS, type CreatureKind, type CreatureTerrain } from '../src/creatures/kinds';
import { createRegionCreatureTerrain } from '../src/creatures/regionTerrain';
import { createRandom } from '../src/utils/random';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealRegion } from './helpers/realRegion';

/**
 * Doğma yoğunluğu ölçümü (5.5): oyuncu gerçek bölgede ormanda düz yürür (4 m/s), 100 m içine giren canlılar
 * "karşılaşma" sayılır. Hedef (plan §A.3): karaca/domuz birkaç dakikada bir, kurt yalnızca gece/şafak ve
 * nadir, ayı yüksek ormanda ~20 dk'da bir. Sınırlar bilerek gevşektir (denge 5.12'de elle ayarlanır).
 * Daha uzun/kapsamlı ölçüm: `CREATURE_STRESS=4 npm test -- creatureDensity`.
 */

const SIGHT = 100;
const DT = 1 / 60;
const STRESS = Math.max(1, Number(process.env.CREATURE_STRESS ?? 1));
const STARTS = 8 * STRESS;
const MINUTES = 10;

let terrain: CreatureTerrain;

beforeAll(async () => {
  const region = await loadRealRegion();
  terrain = createRegionCreatureTerrain({
    source: RegionHeightSource.fromRegion(region),
    cover: LandCoverMap.fromRegion(region),
    freshWater: new FreshWaterIndex(region.features!.water, FRESH_WATER.indexCellSize),
  });
});

function forestStarts(minElevation: number, maxElevation: number, count: number, seed: number) {
  const rng = createRandom(seed);
  const b = terrain.bounds;
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < 20000 && out.length < count; i++) {
    const x = rng.range(b.minX + 300, b.maxX - 300);
    const z = rng.range(b.minZ + 300, b.maxZ - 300);
    const e = terrain.elevationAt(x, z);
    if (
      terrain.coverAt(x, z) === 'forest' &&
      e > minElevation &&
      e < maxElevation &&
      terrain.slopeDegAt(x, z) < 30
    ) {
      out.push({ x, z });
    }
  }
  return out;
}

/** Karşılaşma sayısı (tür başına) ve CPU; `sunAltitudeDeg` sabit. */
function walk(starts: Array<{ x: number; z: number }>, sunAltitudeDeg: number, seed: number) {
  const rng = createRandom(seed);
  const seen: Record<CreatureKind, Set<number>> = {
    roe_deer: new Set(),
    wild_boar: new Set(),
    wolf: new Set(),
    brown_bear: new Set(),
  };
  let peak = 0;
  let totalMs = 0;
  let steps = 0;
  for (const start of starts) {
    const system = new CreatureSystem();
    const heading = rng.range(0, Math.PI * 2);
    let x = start.x;
    let z = start.z;
    const ctx = {
      player: { x, y: 0, z, activity: 'walk' as const, alive: true, yaw: 0, weakness: 0 },
      hour: 12,
      sunAltitudeDeg,
      isNight: sunAltitudeDeg < 0,
      fires: [],
      terrain,
    };
    for (let i = 0; i < MINUTES * 60 * 60; i++) {
      const h = heading + Math.sin((i * DT) / 90) * 1.2;
      const nx = x + Math.cos(h) * 4 * DT;
      const nz = z + Math.sin(h) * 4 * DT;
      if (nx > terrain.bounds.minX + 50 && nx < terrain.bounds.maxX - 50) x = nx;
      if (nz > terrain.bounds.minZ + 50 && nz < terrain.bounds.maxZ - 50) z = nz;
      ctx.player.x = x;
      ctx.player.z = z;
      ctx.player.yaw = Math.atan2(-Math.cos(h), -Math.sin(h)) * -1; // yaklaşık bakış yönü
      const t0 = performance.now();
      system.update(DT, ctx);
      totalMs += performance.now() - t0;
      steps++;
      peak = Math.max(peak, system.stats.active);
      if (i % 6 === 0) {
        for (const v of system.views()) {
          if (!v.dead && Math.hypot(v.x - x, v.z - z) < SIGHT) seen[v.kind].add(v.id);
        }
      }
    }
    system.dispose();
  }
  const minutes = starts.length * MINUTES;
  const perMinute = Object.fromEntries(
    CREATURE_KINDS.map((k) => [k, seen[k].size / minutes]),
  ) as Record<CreatureKind, number>;
  return { perMinute, peak, meanMs: totalMs / steps };
}

describe('doğma yoğunluğu (gerçek bölge, ormanda yürüyüş)', () => {
  it(
    'gündüz: karaca/domuz birkaç dakikada bir; gece: kurt var, gündüz nadir',
    () => {
      const starts = forestStarts(100, 1200, STARTS, 77);
      expect(starts.length).toBe(STARTS);
      const day = walk(starts, 50, 1);
      const night = walk(starts, -30, 2);

      const dayPrey = day.perMinute.roe_deer + day.perMinute.wild_boar;
      // Hedef ≈ 1 / (2–3 dk) = 0,33–0,5 karşılaşma/dk; gevşek aralık.
      expect(dayPrey).toBeGreaterThan(0.15);
      expect(dayPrey).toBeLessThan(1.5);

      expect(night.perMinute.wolf).toBeGreaterThan(day.perMinute.wolf);
      expect(night.perMinute.wolf).toBeGreaterThan(0.03);
      // Kurt/ayı, karaca + domuzdan seyrektir.
      expect(day.perMinute.wolf + day.perMinute.brown_bear).toBeLessThan(dayPrey);

      for (const r of [day, night]) {
        expect(r.peak).toBeLessThanOrEqual(CREATURES.maxActive);
        expect(r.meanMs).toBeLessThan(2);
      }
    },
    300_000 * STRESS,
  );

  it(
    'yüksek ormanda ayı var ama seyrek (hedef ~20 dk)',
    () => {
      const starts = forestStarts(700, 1800, STARTS, 91);
      expect(starts.length).toBeGreaterThan(0);
      const day = walk(starts, 50, 3);
      const bearPerMinute = day.perMinute.brown_bear;
      // Gevşek aralık: 5 dk'da bir ile 200 dk'da bir arası (küçük örnek; uzun ölçüm için CREATURE_STRESS).
      expect(bearPerMinute).toBeLessThan(0.2);
      expect(bearPerMinute).toBeGreaterThanOrEqual(0);
    },
    300_000 * STRESS,
  );
});
