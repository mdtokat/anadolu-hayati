import { RANGED } from '../config';
import type { HitTarget, TargetProvider } from './targets';

/**
 * Balistik (Faz 11.5, saf): mermi, ok ve taş sabit zaman adımlı bir yol izler (çıkış hızı + yerçekimi düşüşü).
 * Yol `RANGED.simStepSeconds` aralıkla doğru parçalarına bölünür; her parça hedef silindirlerine, katı kutulara
 * (oyuncu yapıları, yerleşim binaları) ve araziye karşı **tam** sınanır (parça içi kesişim analitik; arazi `heightAt`
 * adımlı yürütme + ikiye bölme). İlk engel kazanır: arazinin ya da duvarın arkasındaki hedef vurulmaz.
 *
 * Yol tüm atış anında hesaplanır (hedefler uçuş süresince yerinde sayılır); isabetin hasarı çağıranın isteğiyle
 * uçuş süresi kadar geciktirilebilir (`RangedSystem`). Rüzgâr yok (kapsam dışı).
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Katı kutu: dünya X/Z'de `yaw` ile dönük (yapıların kuralıyla aynı: yerel (lx, lz) → (x + lx·cos + lz·sin,
 * z − lx·sin + lz·cos)), dikeyde `y0`–`y1` arası. Merkez (x, z), yarı boyutlar (hx, hz).
 */
export interface SolidBox {
  x: number;
  z: number;
  hx: number;
  hz: number;
  yaw: number;
  y0: number;
  y1: number;
}

/** Mermiyi durduran katılar (`combat/shotSolids.ts` oyuncu yapılarından ve binalardan kurar). */
export interface SolidQuery {
  /** Merkezi (x, z)'ye yatay `r` içindeki (ya da ona değen) kutular. */
  boxesNear(x: number, z: number, r: number): readonly SolidBox[];
}

/** Bir uçuşun dünyadan istedikleri. */
export interface BallisticWorld {
  heightAt(x: number, z: number): number;
  targets: Pick<TargetProvider, 'targetsNear'>;
  /** Vurulmayacak hedef (atanın kendisi). */
  ignore?: string;
  solids?: SolidQuery;
}

/** Fırlatılan mermi: başlangıç, hız vektörü (oyun m/sn), yerçekimi ivmesi (m/sn²) ve en uzun yol (oyun m). */
export interface Projectile {
  origin: Vec3Like;
  velocity: Vec3Like;
  gravity: number;
  maxDistance: number;
}

/** Uçuşun sonucu. */
export interface Flight {
  hit: HitTarget | null;
  /** Merminin durduğu nokta (isabet, arazi, katı ya da menzil sonu). */
  point: Vec3Like;
  /** Mermi yolunun uzunluğu (oyun m). */
  distance: number;
  /** Uçuş süresi (sn). */
  time: number;
  terrain: boolean;
  solid: boolean;
  /** Yolun köşe noktaları (iz çizimi için; ilk = başlangıç, son = `point`). */
  path: Vec3Like[];
}

/** Arazi kesişimi ikiye bölme tur sayısı (adım/2¹⁰ hassasiyet). */
const BISECT_STEPS = 10;
/** Hedef ve katı aramasının yarıçap payı (oyun m): en büyük canlı/eşkıya yarıçapından büyük. */
const SEARCH_MARGIN = 3;
/** En uzun uçuş (sn): hız sıfıra yakın olsa da döngü bitsin. */
const MAX_FLIGHT_SECONDS = 20;

/** Mermiyi uçurur; ilk engelde (hedef, katı, arazi) ya da `maxDistance` yolda durur. */
export function traceProjectile(p: Projectile, world: BallisticWorld): Flight {
  const speed = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z);
  const start = { ...p.origin };
  if (!(speed > 0) || !(p.maxDistance > 0)) {
    return miss(start, 0, 0, [start]);
  }

  // Aday hedefler ve katılar bir kez toplanır (yolun yatay izdüşümünün sınır dairesi).
  const flat = Math.hypot(p.velocity.x, p.velocity.z) / speed;
  const reach = p.maxDistance * Math.max(flat, 0.05);
  const cx = p.origin.x + (p.velocity.x / speed) * (reach / 2);
  const cz = p.origin.z + (p.velocity.z / speed) * (reach / 2);
  const radius = reach / 2 + SEARCH_MARGIN;
  const targets = world.targets
    .targetsNear(cx, cz, radius)
    .filter((target) => target.id !== world.ignore);
  const boxes = world.solids?.boxesNear(cx, cz, radius) ?? [];
  // Tünelin içinden atış: arazi tavanı delik olduğundan arazi engeli yok sayılır (yüzeye çıkınca yeniden sayılır).
  let underground = p.origin.y < world.heightAt(p.origin.x, p.origin.z) - RANGED.undergroundDepth;

  const dt = RANGED.simStepSeconds;
  const path: Vec3Like[] = [start];
  let pos = start;
  let vel = { ...p.velocity };
  let travelled = 0;
  let time = 0;
  while (time < MAX_FLIGHT_SECONDS) {
    // Parça: bu adımın sonundaki konum (yerçekimi altında tam: x + v·t − g·t²/2).
    const next = {
      x: pos.x + vel.x * dt,
      y: pos.y + vel.y * dt - 0.5 * p.gravity * dt * dt,
      z: pos.z + vel.z * dt,
    };
    const dx = next.x - pos.x;
    const dy = next.y - pos.y;
    const dz = next.z - pos.z;
    const segment = Math.max(Math.hypot(dx, dy, dz), 1e-9);
    const remaining = p.maxDistance - travelled;
    const last = segment >= remaining;
    const length = last ? remaining : segment;
    const dir = { x: dx / segment, y: dy / segment, z: dz / segment };

    // En yakın engel bu parçada.
    let bestT = length;
    let bestTarget: HitTarget | null = null;
    let kind: 'none' | 'target' | 'solid' | 'terrain' = 'none';
    for (const target of targets) {
      const t = rayCylinder(pos, dir, target, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        bestTarget = target;
        kind = 'target';
      }
    }
    for (const box of boxes) {
      const t = rayBox(pos, dir, box, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        bestTarget = null;
        kind = 'solid';
      }
    }
    if (underground && pos.y >= world.heightAt(pos.x, pos.z)) underground = false;
    if (!underground) {
      const t = rayTerrain(pos, dir, bestT, world.heightAt);
      if (t !== null && (t < bestT || kind === 'none')) {
        bestT = t;
        bestTarget = null;
        kind = 'terrain';
      }
    }

    const segmentTime = (dt * bestT) / segment;
    if (kind !== 'none') {
      const point = along(pos, dir, bestT);
      path.push(point);
      return {
        hit: bestTarget,
        point,
        distance: travelled + bestT,
        time: time + segmentTime,
        terrain: kind === 'terrain',
        solid: kind === 'solid',
        path,
      };
    }
    if (last) {
      const point = along(pos, dir, length);
      path.push(point);
      return miss(point, p.maxDistance, time + segmentTime, path);
    }
    travelled += length;
    time += dt;
    pos = next;
    vel = { x: vel.x, y: vel.y - p.gravity * dt, z: vel.z };
    path.push(pos);
  }
  return miss(pos, travelled, time, path);
}

function miss(point: Vec3Like, distance: number, time: number, path: Vec3Like[]): Flight {
  return { hit: null, point, distance, time, terrain: false, solid: false, path };
}

function along(o: Vec3Like, d: Vec3Like, t: number): Vec3Like {
  return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
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

/** Işının (birim `d`) dönük kutuya girdiği `t` (0 ≤ t ≤ `range`); kesişmiyorsa null. İçinden başlarsa 0. */
export function rayBox(o: Vec3Like, d: Vec3Like, b: SolidBox, range: number): number | null {
  // Yerel eksenler: yerel x = (cos, −sin), yerel z = (sin, cos) (dünya x, z).
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const rx = o.x - b.x;
  const rz = o.z - b.z;
  const local = [rx * c - rz * s, o.y - (b.y0 + b.y1) / 2, rx * s + rz * c] as const;
  const dir = [d.x * c - d.z * s, d.y, d.x * s + d.z * c] as const;
  const half = [b.hx, (b.y1 - b.y0) / 2, b.hz] as const;
  let enter = 0;
  let exit = range;
  for (let i = 0; i < 3; i++) {
    const p = local[i] as number;
    const v = dir[i] as number;
    const h = half[i] as number;
    if (Math.abs(v) < 1e-12) {
      if (p < -h || p > h) return null;
      continue;
    }
    let ta = (-h - p) / v;
    let tb = (h - p) / v;
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > enter) enter = ta;
    if (tb < exit) exit = tb;
    if (enter > exit) return null;
  }
  return enter;
}

/** Işının araziye girdiği ilk `t` (`limit`'e kadar); girmiyorsa null. Başlangıç arazinin altındaysa 0. */
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

/**
 * `dir` çevresinde yarı açısı `spreadDeg` olan koniden düzgün dağılımlı yön (birim). `random` [0, 1) üretir;
 * iki çağrı yapar. Saçılma 0 ise yön normalize edilip döner.
 */
export function spreadDirection(dir: Vec3Like, spreadDeg: number, random: () => number): Vec3Like {
  const length = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const f = { x: dir.x / length, y: dir.y / length, z: dir.z / length };
  if (!(spreadDeg > 0)) return f;
  // Dik taban: f'ye dik iki birim vektör.
  const up = Math.abs(f.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const r = normalize(cross(f, up));
  const u = cross(r, f);
  // Koni içinde düzgün: cos θ, [cos max, 1] aralığında düzgün.
  const cosMax = Math.cos((spreadDeg * Math.PI) / 180);
  const cosTheta = 1 - random() * (1 - cosMax);
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const phi = random() * Math.PI * 2;
  const a = Math.cos(phi) * sinTheta;
  const b = Math.sin(phi) * sinTheta;
  return normalize({
    x: f.x * cosTheta + r.x * a + u.x * b,
    y: f.y * cosTheta + r.y * a + u.y * b,
    z: f.z * cosTheta + r.z * a + u.z * b,
  });
}

/**
 * Nişangâh sıfırlaması: bakış yönündeki (`dir`, birim) atışın `zeroMeters` uzaklıkta bakış çizgisine düşmesi için
 * namlunun ne kadar yukarı kaldırılacağı (radyan; düz atış yaklaşımı `g·t/(2v)`, t = mesafe/v). Böylece tüfek
 * sıfır mesafesinde tam nişangâha vurur, ötesinde düşer (keskin nişancı uzak atışta yüksek nişan alır).
 */
export function zeroElevation(speed: number, gravity: number, zeroMeters: number): number {
  if (!(speed > 0) || !(zeroMeters > 0)) return 0;
  return Math.atan((gravity * zeroMeters) / (2 * speed * speed));
}

/** Yönü (birim) yatay ekseni çevresinde `angle` radyan yukarı döndürür (yaw değişmez). */
export function pitchUp(dir: Vec3Like, angle: number): Vec3Like {
  if (angle === 0) return dir;
  const flat = Math.hypot(dir.x, dir.z);
  if (flat < 1e-9) return dir;
  const pitch = Math.atan2(dir.y, flat) + angle;
  const cos = Math.cos(pitch);
  return { x: (dir.x / flat) * cos, y: Math.sin(pitch), z: (dir.z / flat) * cos };
}

/** Uzaklıkla azalan hasar: yolun `falloff.start` oranına kadar tam, menzil sonunda `falloff.min` katı. */
export function damageAt(damage: number, distance: number, range: number): number {
  if (!(range > 0)) return damage;
  const f = Math.min(Math.max(distance / range, 0), 1);
  const { start, min } = RANGED.falloff;
  if (f <= start) return damage;
  return damage * (1 - ((f - start) / (1 - start)) * (1 - min));
}

function cross(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(v: Vec3Like): Vec3Like {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
