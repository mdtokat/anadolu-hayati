import { RESPAWN } from '../config';
import type { ProvinceShape } from '../data/region';
import type { Random } from '../utils/random';
import { createRandom } from '../utils/random';
import { isInPilotProvince, pilotProvince } from '../world/pilot';
import type { RegionHeightSource } from '../world/RegionHeightSource';
import { findSafeSpawn, type SpawnPoint } from '../world/spawn';

/** n. ölüm için deterministik rastgele üreteç: aynı seed ve n → aynı nokta. */
export function respawnRandom(deathIndex: number, seed: number = RESPAWN.seed): Random {
  // Ölümler arası tohumları ayrıştırmak için asal bir çarpan.
  return createRandom(seed + deathIndex * 7919);
}

/**
 * Pilot ilde (`PILOT.province`) rastgele, yürünebilir, kara bir doğma noktası seçer. Pilot ilin sınır kutusunda
 * rastgele aday → pilot ilde mi (kıyı şeridi dahil, bkz. `isInPilotProvince`) → en yakın güvenli noktaya kaydır →
 * hâlâ pilot ilde mi. Bulunamazsa null (çağıran başka bir noktaya düşebilir).
 */
export function pickRespawnPoint(
  provinces: readonly ProvinceShape[],
  source: RegionHeightSource,
  maxSlopeDeg: number,
  random: Random,
  attempts: number = RESPAWN.attempts,
): SpawnPoint | null {
  const pilot = pilotProvince(provinces);
  if (pilot === null) return null;
  const bounds = pilot.bounds;

  for (let i = 0; i < attempts; i++) {
    // Sabit sayıda RNG çağrısı: reddedilen adaylar da akışı aynı ilerletir.
    const x = random.range(bounds.minX, bounds.maxX);
    const z = random.range(bounds.minZ, bounds.maxZ);
    if (!source.contains(x, z) || source.elevationAt(x, z) <= 0) continue;
    if (!isInPilotProvince(provinces, x, z)) continue;

    const safe = findSafeSpawn(source, x, z, maxSlopeDeg);
    if (!safe || Math.hypot(safe.x - x, safe.z - z) > RESPAWN.maxDrift) continue;
    if (!isInPilotProvince(provinces, safe.x, safe.z)) continue;
    return safe;
  }
  return null;
}
