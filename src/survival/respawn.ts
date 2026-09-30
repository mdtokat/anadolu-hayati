import { RESPAWN } from '../config';
import type { ProvinceShape } from '../data/region';
import type { Random } from '../utils/random';
import { createRandom } from '../utils/random';
import { provinceAt } from '../world/provinces';
import type { RegionHeightSource } from '../world/RegionHeightSource';
import { findSafeSpawn, type SpawnPoint } from '../world/spawn';

/** n. ölüm için deterministik rastgele üreteç: aynı seed ve n → aynı nokta. */
export function respawnRandom(deathIndex: number, seed: number = RESPAWN.seed): Random {
  // Ölümler arası tohumları ayrıştırmak için asal bir çarpan.
  return createRandom(seed + deathIndex * 7919);
}

/**
 * Bölgenin hedef illerinde (inRegion) rastgele, yürünebilir, kara bir doğma noktası seçer.
 * Sınır kutusunda rastgele aday → hedef ilin içinde mi → en yakın güvenli noktaya kaydır → hâlâ hedef
 * ilde mi. Bulunamazsa null (çağıran başka bir noktaya düşebilir).
 */
export function pickRespawnPoint(
  provinces: readonly ProvinceShape[],
  source: RegionHeightSource,
  maxSlopeDeg: number,
  random: Random,
  attempts: number = RESPAWN.attempts,
): SpawnPoint | null {
  const targets = provinces.filter((p) => p.inRegion);
  if (targets.length === 0) return null;

  const bounds = targets.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.bounds.minX),
      maxX: Math.max(b.maxX, p.bounds.maxX),
      minZ: Math.min(b.minZ, p.bounds.minZ),
      maxZ: Math.max(b.maxZ, p.bounds.maxZ),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );

  for (let i = 0; i < attempts; i++) {
    // Sabit sayıda RNG çağrısı: reddedilen adaylar da akışı aynı ilerletir.
    const x = random.range(bounds.minX, bounds.maxX);
    const z = random.range(bounds.minZ, bounds.maxZ);
    if (!source.contains(x, z)) continue;
    if (provinceAt(targets, x, z) === null) continue;

    const safe = findSafeSpawn(source, x, z, maxSlopeDeg);
    if (!safe || Math.hypot(safe.x - x, safe.z - z) > RESPAWN.maxDrift) continue;
    if (provinceAt(targets, safe.x, safe.z) === null) continue;
    return safe;
  }
  return null;
}
