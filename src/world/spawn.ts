import { SPAWN_SEARCH } from '../config';
import type { RegionHeightSource } from './RegionHeightSource';

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

/** Konum ve çevresindeki 4 nokta eğim sınırının altında ve kara mı? */
function isWalkable(source: RegionHeightSource, x: number, z: number, limitDeg: number): boolean {
  const r = SPAWN_SEARCH.probeRadius;
  const points: Array<[number, number]> = [
    [x, z],
    [x + r, z],
    [x - r, z],
    [x, z + r],
    [x, z - r],
  ];
  return points.every(
    ([px, pz]) =>
      source.contains(px, pz) &&
      source.elevationAt(px, pz) >= SPAWN_SEARCH.minElevation &&
      source.slopeDegAt(px, pz) <= limitDeg,
  );
}

/**
 * İstenen (x, z)'ye en yakın yürünebilir noktayı bulur: kara, eğimi `maxSlopeDeg − pay` altında.
 * Kare halkalar hâlinde dışa doğru arar. Bulunamazsa null.
 */
export function findSafeSpawn(
  source: RegionHeightSource,
  x: number,
  z: number,
  maxSlopeDeg: number,
): SpawnPoint | null {
  const limit = maxSlopeDeg - SPAWN_SEARCH.slopeMarginDeg;
  const found = (px: number, pz: number): SpawnPoint => ({
    x: px,
    y: source.heightAt(px, pz) + 0.05,
    z: pz,
  });

  if (isWalkable(source, x, z, limit)) return found(x, z);

  const step = source.cell * 2;
  const maxRing = Math.floor(SPAWN_SEARCH.maxRadius / step);
  for (let ring = 1; ring <= maxRing; ring++) {
    let best: { px: number; pz: number; distance: number } | null = null;
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue; // yalnızca halka
        const px = x + i * step;
        const pz = z + j * step;
        const distance = Math.hypot(px - x, pz - z);
        if ((best === null || distance < best.distance) && isWalkable(source, px, pz, limit)) {
          best = { px, pz, distance };
        }
      }
    }
    if (best) return found(best.px, best.pz);
  }
  return null;
}
