import { CreatureSystem } from '../../src/creatures/CreatureSystem';
import { CREATURE_KINDS, type CreatureKind, type CreatureTerrain } from '../../src/creatures/kinds';
import type { RegionData } from '../../src/data/region';
import { createRandom } from '../../src/utils/random';
import { provinceAt } from '../../src/world/provinces';

/** Karşılaşma yarıçapı (oyun m): bu kadar yakına giren canlı "karşılaşma" sayılır. */
export const SIGHT = 100;
const DT = 1 / 60;

export interface ForestStartOptions {
  minElevation: number;
  maxElevation: number;
  count: number;
  seed: number;
  /** Verilirse başlangıçlar yalnızca bu illerde seçilir. */
  provinces?: readonly string[];
}

/** Ormanlık, yürünebilir eğimli (< 30°) başlangıç noktaları (deterministik). */
export function forestStarts(
  terrain: CreatureTerrain,
  region: RegionData,
  { minElevation, maxElevation, count, seed, provinces }: ForestStartOptions,
): Array<{ x: number; z: number }> {
  const rng = createRandom(seed);
  const b = terrain.bounds;
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < 200000 && out.length < count; i++) {
    const x = rng.range(b.minX + 300, b.maxX - 300);
    const z = rng.range(b.minZ + 300, b.maxZ - 300);
    const e = terrain.elevationAt(x, z);
    if (
      terrain.coverAt(x, z) === 'forest' &&
      e > minElevation &&
      e < maxElevation &&
      terrain.slopeDegAt(x, z) < 30 &&
      (!provinces || provinces.includes(provinceAt(region.provinces, x, z)?.name ?? ''))
    ) {
      out.push({ x, z });
    }
  }
  return out;
}

export interface WalkResult {
  /** Tür başına dakikada görülen (100 m içine giren) benzersiz canlı sayısı. */
  perMinute: Record<CreatureKind, number>;
  peak: number;
  meanMs: number;
}

/**
 * Oyuncu başlangıç noktalarından 4 m/s ile dalgalı bir hatta `minutes` dakika yürür; `sunAltitudeDeg` sabit
 * (gündüz > 0, gece < 0). Sonuç tür başına karşılaşma hızıdır (creatureDensity ile aynı yöntem).
 */
export function walk(
  terrain: CreatureTerrain,
  starts: Array<{ x: number; z: number }>,
  sunAltitudeDeg: number,
  seed: number,
  minutes = 10,
): WalkResult {
  const rng = createRandom(seed);
  const seen = Object.fromEntries(CREATURE_KINDS.map((k) => [k, new Set<number>()])) as Record<
    CreatureKind,
    Set<number>
  >;
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
    for (let i = 0; i < minutes * 60 * 60; i++) {
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
  const total = starts.length * minutes;
  const perMinute = Object.fromEntries(
    CREATURE_KINDS.map((k) => [k, seen[k].size / total]),
  ) as Record<CreatureKind, number>;
  return { perMinute, peak, meanMs: totalMs / steps };
}
