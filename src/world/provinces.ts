import type { Polygon, ProvinceShape } from '../data/region';

/** Nokta halkanın içinde mi? (çift-tek / ışın atma; halka [x0, z0, x1, z1, ...]) */
function inRing(ring: Float64Array, x: number, z: number): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2] as number;
    const zi = ring[i * 2 + 1] as number;
    const xj = ring[j * 2] as number;
    const zj = ring[j * 2 + 1] as number;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Nokta çokgenin içinde mi? İlk halka dış sınır, diğerleri deliktir. */
function inPolygon(polygon: Polygon, x: number, z: number): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !inRing(outer, x, z)) return false;
  return !holes.some((hole) => inRing(hole, x, z));
}

/** (x, z) noktasının bulunduğu il; hiçbirinde değilse (deniz vb.) null. */
export function provinceAt(
  provinces: readonly ProvinceShape[],
  x: number,
  z: number,
): ProvinceShape | null {
  for (const province of provinces) {
    const b = province.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (province.polygons.some((polygon) => inPolygon(polygon, x, z))) return province;
  }
  return null;
}

/** (x, z)'nin [x0, z0, x1, z1, ...] halkasının kenarlarına en kısa uzaklığı (oyun m). */
function distanceToRing(ring: Float64Array, x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = ring[j * 2] as number;
    const az = ring[j * 2 + 1] as number;
    const bx = ring[i * 2] as number;
    const bz = ring[i * 2 + 1] as number;
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    const t =
      lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSq));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

/**
 * (x, z)'nin ilin sınır çizgisine en kısa uzaklığı (oyun m; içeride ve dışarıda pozitif, sınırda 0).
 * İl çokgenleri kıyıdan içeride kaldığından, ilsiz kıyı şeridini en yakın ile bağlamak için kullanılır.
 */
export function distanceToProvince(province: ProvinceShape, x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const polygon of province.polygons) {
    for (const ring of polygon) best = Math.min(best, distanceToRing(ring, x, z));
  }
  return best;
}
