import { radiusOf } from './placeRules';
import type { Structure, StructureKind, StructureSet } from './structures';

/** Oyuncunun ayak konumu ve bakış yönü (yaw; ileri = (−sin, −cos)). */
export interface FocusPose {
  x: number;
  z: number;
  yaw: number;
}

export interface StructureFocusRules {
  /** Yapının kenarına (merkez − yarıçap) en büyük yatay uzaklık (oyun m). */
  reach: number;
  /** Bakış ile yapı merkezi arasındaki en büyük yatay açı (derece); yapının içinde/dibinde aranmaz. */
  viewConeDeg: number;
  /** Yalnızca bu türler (verilmezse hepsi). */
  kinds?: ReadonlyArray<StructureKind>;
}

/**
 * Bakılan yapı (saf): menzildeki yapılar arasından bakış konisinde olanların kenarı en yakın olanı; yoksa null.
 * Yapının kaplama yarıçapı içindeyken (dibinde/içinde) açı aranmaz. Eşitlikte küçük kimlik kazanır.
 */
export function structureInView(
  structures: StructureSet,
  pose: FocusPose,
  rules: StructureFocusRules,
): Readonly<Structure> | null {
  const kinds = rules.kinds;
  const forwardX = -Math.sin(pose.yaw);
  const forwardZ = -Math.cos(pose.yaw);
  const cosLimit = Math.cos((rules.viewConeDeg * Math.PI) / 180);
  let best: Readonly<Structure> | null = null;
  let bestEdge = Infinity;
  // En büyük yapı yarıçapı kadar geniş ara; kenar uzaklığı ayrıca denetlenir.
  for (const s of structures.near(pose.x, pose.z, rules.reach + radiusOf('wooden_hut'))) {
    if (kinds && !kinds.includes(s.kind)) continue;
    const dx = s.x - pose.x;
    const dz = s.z - pose.z;
    const distance = Math.hypot(dx, dz);
    const radius = radiusOf(s.kind);
    const edge = Math.max(0, distance - radius);
    if (edge > rules.reach) continue;
    if (distance > radius && (dx * forwardX + dz * forwardZ) / distance < cosLimit) continue;
    if (edge < bestEdge) {
      best = s;
      bestEdge = edge;
    }
  }
  return best;
}
