import { RANGED } from '../config';
import type { WeaponId } from '../items/weaponState';
import type { HitTarget, TargetProvider } from './targets';

/**
 * Menzilli atış (Faz 11 ortak sözleşmesi, docs/faz-11-paralel-plan.md §3.4). 11.0 uygulaması anında isabetlidir
 * (hitscan): ışın, silahın menzili boyunca araziye (`heightAt` ile adım adım yürütme + ikiye bölme) ve hedef
 * silindirlerine karşı sınanır; en yakın engel kazanır (arazinin arkasındaki hedef vurulmaz). D mermi uçuşu,
 * düşüş, saçılma ve yapı isabetiyle değiştirir; **imza aynı kalır**. Hasarı uygulamaz: çağıran, dönen hedefe
 * `TargetProvider.applyHit` ile hasar verir (eşkıya oyuncuya da hayvana da böyle ateş eder).
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Atışın dünyadan istediği. */
export interface ShotContext {
  /** Arazi yüksekliği (oyun m). */
  heightAt(x: number, z: number): number;
  /** Vurulabilir hedefler. */
  targets: Pick<TargetProvider, 'targetsNear'>;
  /** Vurulmayacak hedef kimliği (atanın kendisi; ör. `bandit:7`, `player`). */
  ignore?: string;
  /** Menzil üst sınırı (oyun m); verilmezse silahın `RANGED.weapons[...].range`'i. */
  range?: number;
}

export interface ShotResult {
  /** İsabet edilen hedef (yoksa null). */
  hit: HitTarget | null;
  /** Merminin durduğu nokta (isabet, arazi ya da menzil sonu). */
  point: Vec3Like;
  /** `origin`'den `point`'e uzaklık (oyun m). */
  distance: number;
  /** Mermi araziye mi gömüldü? */
  terrain: boolean;
}

/** Arazi kesişimi ikiye bölme tur sayısı (adım/2¹⁰ hassasiyet). */
const BISECT_STEPS = 10;

/** `origin`'den `dir` yönünde (normalize edilir) `weapon` ile tek atış. */
export function fireShot(
  origin: Vec3Like,
  dir: Vec3Like,
  weapon: WeaponId,
  ctx: ShotContext,
): ShotResult {
  const length = Math.hypot(dir.x, dir.y, dir.z);
  const range = ctx.range ?? RANGED.weapons[weapon].range;
  if (!(length > 0) || !(range > 0)) {
    return { hit: null, point: { ...origin }, distance: 0, terrain: false };
  }
  const d = { x: dir.x / length, y: dir.y / length, z: dir.z / length };
  const at = (t: number): Vec3Like => ({
    x: origin.x + d.x * t,
    y: origin.y + d.y * t,
    z: origin.z + d.z * t,
  });

  // En yakın hedef (ışın–dikey silindir kesişimi).
  let best: { target: HitTarget; t: number } | null = null;
  const mid = at(range / 2);
  for (const target of ctx.targets.targetsNear(mid.x, mid.z, range / 2 + 2)) {
    if (target.id === ctx.ignore) continue;
    const t = rayCylinder(origin, d, target, range);
    if (t !== null && (best === null || t < best.t)) best = { target, t };
  }

  // Arazi: hedefe (ya da menzil sonuna) kadar adım adım yürüt.
  const limit = best ? best.t : range;
  const terrainT = rayTerrain(origin, d, limit, ctx.heightAt);
  if (terrainT !== null) {
    return { hit: null, point: at(terrainT), distance: terrainT, terrain: true };
  }
  if (best) return { hit: best.target, point: at(best.t), distance: best.t, terrain: false };
  return { hit: null, point: at(range), distance: range, terrain: false };
}

/** Işının (birim `d`) silindire girdiği `t` (0 ≤ t ≤ `range`); kesişmiyorsa null. */
export function rayCylinder(
  o: Vec3Like,
  d: Vec3Like,
  c: Pick<HitTarget, 'x' | 'y' | 'z' | 'radius' | 'height'>,
  range: number,
): number | null {
  // Yatay: |(o + t·d) − c|² = r² (xz düzleminde).
  const ox = o.x - c.x;
  const oz = o.z - c.z;
  const a = d.x * d.x + d.z * d.z;
  let t0: number;
  let t1: number;
  if (a < 1e-12) {
    if (ox * ox + oz * oz > c.radius * c.radius) return null;
    t0 = -Infinity;
    t1 = Infinity;
  } else {
    const b = 2 * (ox * d.x + oz * d.z);
    const k = ox * ox + oz * oz - c.radius * c.radius;
    const disc = b * b - 4 * a * k;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    t0 = (-b - root) / (2 * a);
    t1 = (-b + root) / (2 * a);
  }
  // Dikey: c.y ≤ o.y + t·d.y ≤ c.y + height.
  let y0: number;
  let y1: number;
  if (Math.abs(d.y) < 1e-12) {
    if (o.y < c.y || o.y > c.y + c.height) return null;
    y0 = -Infinity;
    y1 = Infinity;
  } else {
    const ta = (c.y - o.y) / d.y;
    const tb = (c.y + c.height - o.y) / d.y;
    y0 = Math.min(ta, tb);
    y1 = Math.max(ta, tb);
  }
  const enter = Math.max(t0, y0, 0);
  const exit = Math.min(t1, y1, range);
  return enter <= exit ? enter : null;
}

/** Işının araziye girdiği ilk `t` (`limit`'e kadar); girmiyorsa null. */
export function rayTerrain(
  o: Vec3Like,
  d: Vec3Like,
  limit: number,
  heightAt: (x: number, z: number) => number,
): number | null {
  const step = RANGED.stepMeters;
  const below = (t: number): boolean => o.y + d.y * t < heightAt(o.x + d.x * t, o.z + d.z * t);
  if (below(0)) return 0;
  let prev = 0;
  for (let t = step; ; t += step) {
    const cur = Math.min(t, limit);
    if (below(cur)) {
      let lo = prev;
      let hi = cur;
      for (let i = 0; i < BISECT_STEPS; i++) {
        const m = (lo + hi) / 2;
        if (below(m)) hi = m;
        else lo = m;
      }
      return hi;
    }
    if (cur >= limit) return null;
    prev = cur;
  }
}
