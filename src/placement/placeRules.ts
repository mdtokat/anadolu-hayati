import { PLACEMENT, SCATTER, VERTICAL_SCALE } from '../config';
import type { StructureKind, StructureSet } from './structures';

/** Geçerlilik denetiminin dünyaya bakışı (Three.js'siz; test ve dünyalar kendi kaynağını verir). */
export interface PlaceContext {
  heightAt(x: number, z: number): number;
  /** (x, z) tatlı suya erişim mesafesinde mi (nehir, göl, kaynak)? Desteklemeyen dünyada tanımsız. */
  nearFreshWater?(x: number, z: number): boolean;
  structures: StructureSet;
}

export type PlaceFailure = 'too_far' | 'in_sea' | 'too_steep' | 'near_water' | 'too_close';

export type PlaceCheck =
  { ok: true; y: number; slopeDeg: number } | { ok: false; reason: PlaceFailure };

/**
 * Zemin eğimi (derece, oyun uzayı): hedef çevresinde ±adım örneklenen yüksekliklerin merkezi farkı.
 * `HeightSource` yalnızca yükseklik verdiği için dünyadan bağımsız hesaplanır.
 */
export function slopeDegAt(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
  step: number = PLACEMENT.slopeSampleStep,
): number {
  const dx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step);
  const dz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}

/**
 * Yapı (`target`) konumuna konabilir mi? Sırayla: erişim, deniz/kıyı, eğim, tatlı su, başka yapıya
 * yakınlık. Geçerliyse zemin yüksekliği (`y`) ve eğim döner.
 */
export function validatePlacement(
  kind: StructureKind,
  target: { x: number; z: number },
  player: { x: number; z: number },
  ctx: PlaceContext,
): PlaceCheck {
  const spec = PLACEMENT.kinds[kind];
  if (Math.hypot(target.x - player.x, target.z - player.z) > PLACEMENT.maxReach) {
    return { ok: false, reason: 'too_far' };
  }

  const y = ctx.heightAt(target.x, target.z);
  if (y * VERTICAL_SCALE <= SCATTER.minElevation) return { ok: false, reason: 'in_sea' };

  const slope = slopeDegAt(ctx.heightAt, target.x, target.z);
  if (slope > spec.maxSlopeDeg) return { ok: false, reason: 'too_steep' };

  if (ctx.nearFreshWater?.(target.x, target.z)) return { ok: false, reason: 'near_water' };

  const longest = Math.max(...Object.values(PLACEMENT.kinds).map((k) => k.radius));
  const searchRadius = spec.radius + longest + PLACEMENT.spacingMargin;
  for (const other of ctx.structures.near(target.x, target.z, searchRadius)) {
    const needed = spec.radius + PLACEMENT.kinds[other.kind].radius + PLACEMENT.spacingMargin;
    if (Math.hypot(other.x - target.x, other.z - target.z) < needed) {
      return { ok: false, reason: 'too_close' };
    }
  }
  return { ok: true, y, slopeDeg: slope };
}
