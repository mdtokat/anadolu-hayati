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
