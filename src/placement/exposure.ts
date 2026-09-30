import { SHELTER_EFFECTS } from '../config';
import { isLit, type Structure, type StructureSet } from './structures';

const { fireWarmth, shelter } = SHELTER_EFFECTS;

/** Oyuncunun bulunduğu yerde yapıların hayatta kalma üzerindeki etkisi. */
export interface Exposure {
  /** Yanık ateşlerin vücut ısısı denge değerine eklediği ısı (°C). */
  warmthC: number;
  /** Bir sundurmanın altında mı? */
  sheltered: boolean;
}

export const NO_EXPOSURE: Readonly<Exposure> = { warmthC: 0, sheltered: false };

/** Bir ateşin `distance` (oyun m, yatay) uzaktaki ısıtması (°C): çekirdekte tam, dışa doğru doğrusal azalır. */
export function fireWarmthAt(distance: number): number {
  if (!(distance < fireWarmth.radius)) return 0;
  if (distance <= fireWarmth.coreRadius) return fireWarmth.maxC;
  const t = (fireWarmth.radius - distance) / (fireWarmth.radius - fireWarmth.coreRadius);
  return fireWarmth.maxC * t;
}

/**
 * (x, z) noktası sundurmanın dikdörtgen altlığında mı? Altlık, yapının yerel eksenlerindedir
 * (`mesh.rotation.y = yaw`; yerel +z = açık ön yüz). Yükseklik farkı `verticalReach`'i aşıyorsa dışarıdadır.
 */
export function isUnderShelter(
  structure: Readonly<Structure>,
  x: number,
  y: number,
  z: number,
): boolean {
  if (structure.kind !== 'lean_to') return false;
  if (Math.abs(y - structure.y) > shelter.verticalReach) return false;
  const dx = x - structure.x;
  const dz = z - structure.z;
  const cos = Math.cos(structure.yaw);
  const sin = Math.sin(structure.yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= shelter.halfWidth && localZ >= shelter.back && localZ <= shelter.front;
}

/** Oyuncunun ayak konumundaki ısı ve barınak etkisi (saf; `structures` değişmez). */
export function exposureAt(structures: StructureSet, x: number, y: number, z: number): Exposure {
  // Altlığın en uzak köşesi bile bu yarıçap içindedir.
  const searchRadius = Math.max(fireWarmth.radius, Math.hypot(shelter.halfWidth, shelter.back));
  let warmth = 0;
  let sheltered = false;
  for (const s of structures.near(x, z, searchRadius)) {
    if (isLit(s) && Math.abs(y - s.y) <= shelter.verticalReach) {
      warmth += fireWarmthAt(Math.hypot(s.x - x, s.z - z));
    } else if (!sheltered && isUnderShelter(s, x, y, z)) {
      sheltered = true;
    }
  }
  return { warmthC: Math.min(warmth, fireWarmth.maxTotalC), sheltered };
}
