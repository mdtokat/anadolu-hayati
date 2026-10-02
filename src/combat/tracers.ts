import type { Vec3Like } from './ballistics';

/**
 * Mermi izleri (Faz 11.5, saf): atışın yolu (`ShotResult.path`) üzerinde, uçuş süresine göre ilerleyen kısa bir
 * çizgi parçası. Görsel katman (`world/TracerLayer.ts`) her karede `tracerSegment` ile uçlarını alır.
 */

export interface TracerPath {
  points: readonly Vec3Like[];
  /** Köşelerin yol boyunca birikimli uzaklığı (ilk 0, son toplam). */
  cumulative: Float64Array;
  total: number;
}

/** Yolun birikimli uzunluklarını hazırlar. */
export function tracerPath(points: readonly Vec3Like[]): TracerPath {
  const cumulative = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cumulative[i] = cumulative[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return { points, cumulative, total: points.length > 0 ? cumulative[points.length - 1]! : 0 };
}

/** Yol üzerinde `s` uzaklığındaki nokta (0 ile toplam arasına kırpılır). */
export function pointAlong(path: TracerPath, s: number): Vec3Like {
  const { points, cumulative } = path;
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  if (s <= 0) return points[0]!;
  if (s >= path.total) return points[points.length - 1]!;
  // İkili arama: cumulative[i] ≤ s < cumulative[i + 1].
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  const span = cumulative[hi]! - cumulative[lo]!;
  const f = span > 0 ? (s - cumulative[lo]!) / span : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
}

/**
 * `elapsed` saniyede izin uçları: baş yol boyunca (toplam / uçuş süresi) hızla ilerler, kuyruk `length` geride.
 * Kuyruk yolun sonunu geçince null (iz bitti).
 */
export function tracerSegment(
  path: TracerPath,
  flightSeconds: number,
  elapsed: number,
  length: number,
): { head: Vec3Like; tail: Vec3Like } | null {
  if (path.total <= 0) return null;
  const speed = path.total / Math.max(flightSeconds, 1e-3);
  const head = Math.min(elapsed * speed, path.total);
  const tail = elapsed * speed - length;
  if (tail >= path.total) return null;
  return { head: pointAlong(path, head), tail: pointAlong(path, Math.max(tail, 0)) };
}
