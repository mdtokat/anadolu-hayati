import { DRONE } from '../config';

/**
 * Drone işaretleri (Faz 11, 11.8; saf): drone görüşünde sol tık bakılan hayvanı, eşkıyayı, kampı ya da yapıyı (yoksa
 * bakılan zemini) işaretler. İşaretler pusulada ve HUD'da kalır, kayda girer (en çok `maxMarks`; dolunca en eskisi
 * düşer). Var olan bir işarete tıklamak onu kaldırır.
 */

export interface Mark {
  x: number;
  z: number;
  label: string;
}

/** İşaretlenebilir aday: konum (merkez yüksekliğiyle), yarıçap ve ad. */
export interface MarkCandidate {
  x: number;
  y: number;
  z: number;
  radius: number;
  label: string;
}

/** Bakış ışını (drone kamerası): göz ve birim yön. */
export interface ViewRay {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

/** Işına açısal olarak en yakın aday (`markPickDeg` + adayın açısal genişliği içinde, `markRange` içinde); yoksa null. */
export function pickCandidate(
  candidates: readonly MarkCandidate[],
  ray: ViewRay,
): MarkCandidate | null {
  let best: MarkCandidate | null = null;
  let bestAngle = Infinity;
  for (const c of candidates) {
    const vx = c.x - ray.x;
    const vy = c.y - ray.y;
    const vz = c.z - ray.z;
    const d = Math.hypot(vx, vy, vz);
    if (d < 1e-6 || d > DRONE.markRange) continue;
    const cos = (vx * ray.dx + vy * ray.dy + vz * ray.dz) / d;
    const angle = (Math.acos(Math.min(Math.max(cos, -1), 1)) * 180) / Math.PI;
    const width = (Math.atan2(c.radius, d) * 180) / Math.PI;
    if (angle > DRONE.markPickDeg + width) continue;
    if (angle - width < bestAngle) {
      best = c;
      bestAngle = angle - width;
    }
  }
  return best;
}

/**
 * İşareti ekler; aynı yerde (`markRemoveRadius` içinde) işaret varsa onu kaldırır (aç/kapa). Liste doluysa en eski
 * düşer. Yeni listeyi ve yapılanı döner.
 */
export function toggleMark(
  marks: readonly Mark[],
  mark: Mark,
): { marks: Mark[]; action: 'added' | 'removed' } {
  const index = marks.findIndex(
    (m) => Math.hypot(m.x - mark.x, m.z - mark.z) <= DRONE.markRemoveRadius,
  );
  if (index >= 0) return { marks: marks.filter((_, i) => i !== index), action: 'removed' };
  const next = [...marks, { ...mark }];
  while (next.length > DRONE.maxMarks) next.shift();
  return { marks: next, action: 'added' };
}

/** Pusula yönü (derece, 0 = kuzey, saat yönünde) ve yatay uzaklık. */
export function bearingTo(
  from: { x: number; z: number },
  to: { x: number; z: number },
): { bearing: number; distance: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return {
    bearing: ((((Math.atan2(dx, -dz) * 180) / Math.PI) % 360) + 360) % 360,
    distance: Math.hypot(dx, dz),
  };
}
