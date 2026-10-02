import { SHELTER_EFFECTS } from '../config';
import { pieceShelterAt } from './pieceShelter';
import { isLit, type Structure, type StructureSet } from './structures';

const { fireWarmth } = SHELTER_EFFECTS;

/** Oyuncunun kurduğu barınaklar (Faz 9: ahşap kulübe sundurmadan iyi korur). */
export type StructureShelter = 'lean_to' | 'hut';
export type { ShelterKind } from '../survival/vitals';

/** Yapı türünden barınak türü; barınak değilse null. */
function shelterKindOf(structure: Readonly<Structure>): StructureShelter | null {
  if (structure.kind === 'lean_to') return 'lean_to';
  if (structure.kind === 'wooden_hut') return 'hut';
  return null;
}

/** Barınak türünün etkileri (`SHELTER_EFFECTS.shelter` sundurma, `.hut` kulübe). */
export function shelterEffects(kind: StructureShelter) {
  return kind === 'hut' ? SHELTER_EFFECTS.hut : SHELTER_EFFECTS.shelter;
}

/** Oyuncunun bulunduğu yerde yapıların hayatta kalma üzerindeki etkisi. */
export interface Exposure {
  /** Yanık ateşlerin vücut ısısı denge değerine eklediği ısı (°C). */
  warmthC: number;
  /** Bir barınağın (sundurma, kulübe) altında mı? */
  sheltered: boolean;
  /** Altında bulunulan en iyi barınak (kulübe › sundurma; Faz 10: cami/han içi); yoksa null. */
  shelter: import('../survival/vitals').ShelterKind | null;
}

export const NO_EXPOSURE: Readonly<Exposure> = { warmthC: 0, sheltered: false, shelter: null };

/** Bir ateşin `distance` (oyun m, yatay) uzaktaki ısıtması (°C): çekirdekte tam, dışa doğru doğrusal azalır. */
export function fireWarmthAt(distance: number): number {
  if (!(distance < fireWarmth.radius)) return 0;
  if (distance <= fireWarmth.coreRadius) return fireWarmth.maxC;
  const t = (fireWarmth.radius - distance) / (fireWarmth.radius - fireWarmth.coreRadius);
  return fireWarmth.maxC * t;
}

/**
 * (x, z) noktası barınağın (sundurma ya da kulübe) dikdörtgen altlığında mı? Altlık, yapının yerel eksenlerindedir
 * (`mesh.rotation.y = yaw`; yerel +z = açık ön yüz / kapı). Yükseklik farkı `verticalReach`'i aşıyorsa dışarıdadır.
 */
export function isUnderShelter(
  structure: Readonly<Structure>,
  x: number,
  y: number,
  z: number,
): boolean {
  const kind = shelterKindOf(structure);
  if (kind === null) return false;
  const area = shelterEffects(kind);
  if (Math.abs(y - structure.y) > area.verticalReach) return false;
  const dx = x - structure.x;
  const dz = z - structure.z;
  const cos = Math.cos(structure.yaw);
  const sin = Math.sin(structure.yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= area.halfWidth && localZ >= area.back && localZ <= area.front;
}

/** Altlığın en uzak köşesi bile bu yarıçap içindedir (her barınak türü için). */
const SEARCH_RADIUS = Math.max(
  fireWarmth.radius,
  ...[SHELTER_EFFECTS.shelter, SHELTER_EFFECTS.hut].map((a) =>
    Math.hypot(a.halfWidth, Math.max(-a.back, a.front)),
  ),
);

/** Oyuncunun ayak konumundaki ısı ve barınak etkisi (saf; `structures` değişmez). */
export function exposureAt(structures: StructureSet, x: number, y: number, z: number): Exposure {
  let warmth = 0;
  let shelter: StructureShelter | null = null;
  for (const s of structures.near(x, z, SEARCH_RADIUS)) {
    if (isLit(s)) {
      if (Math.abs(y - s.y) <= SHELTER_EFFECTS.shelter.verticalReach) {
        warmth += fireWarmthAt(Math.hypot(s.x - x, s.z - z));
      }
    } else if (shelter !== 'hut' && isUnderShelter(s, x, y, z)) {
      shelter = shelterKindOf(s);
    }
  }
  // Modüler yapılar (taban/duvar/çatı): çatı altı sundurma, kapalı oda kulübe etkisi verir.
  const modular = pieceShelterAt(structures, x, y, z);
  if (modular === 'hut' || (modular !== null && shelter === null)) shelter = modular;
  return {
    warmthC: Math.min(warmth, fireWarmth.maxTotalC),
    sheltered: shelter !== null,
    shelter,
  };
}
