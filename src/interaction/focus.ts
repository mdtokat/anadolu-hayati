import { INTERACT, SCATTER } from '../config';
import type { Vec3 } from '../player/movement';
import type { PropRef } from '../world/propKinds';

/** Oyuncunun bakışı: göz noktası ve (birim) bakış yönü. */
export interface View {
  eye: Readonly<Vec3>;
  forward: Readonly<Vec3>;
}

export interface Focus {
  prop: PropRef;
  /** Oyuncunun ayak konumuna yatay uzaklık (oyun m). */
  distance: number;
  /** Bakış yönü ile nesnenin hedef noktası arasındaki açı (derece). */
  angleDeg: number;
}

/**
 * Yaw/pitch'ten birim bakış yönü. Yaw 0 = −Z (kuzey) ve pozitif yaw sola döner; pitch pozitif yukarı bakar
 * (bkz. player/cameraMath.ts, Three.js 'YXZ' sırası).
 */
export function lookDirection(yaw: number, pitch: number): Vec3 {
  const horizontal = Math.cos(pitch);
  return { x: -Math.sin(yaw) * horizontal, y: Math.sin(pitch), z: -Math.cos(yaw) * horizontal };
}

/** Nesnenin bakış hedefi: zeminden nesne boyunun yarısı (en çok `maxTargetHeight`). */
export function targetHeight(prop: PropRef): number {
  const height = SCATTER.kinds[prop.kind].height * prop.scale * INTERACT.targetHeightFraction;
  return Math.min(height, INTERACT.maxTargetHeight);
}

function angleBetween(ax: number, ay: number, az: number, b: Readonly<Vec3>): number {
  const la = Math.hypot(ax, ay, az);
  const lb = Math.hypot(b.x, b.y, b.z);
  if (la === 0 || lb === 0) return 0;
  const cos = (ax * b.x + ay * b.y + az * b.z) / (la * lb);
  return (Math.acos(Math.min(Math.max(cos, -1), 1)) * 180) / Math.PI;
}

/**
 * Bakılan nesneyi seçer: `candidates` içinden `accept` diyenlerden, erişim (yatay) ve bakış konisi içinde
 * olan, bakış yönüne en yakın olanı (eşitlikte yakın olanı) döndürür; yoksa `null`.
 * `closeRange` içindeki nesnelerde yalnızca yatay bakış açısı aranır: dibindeki dala yere bakmadan da
 * ulaşılır.
 */
export function pickFocus(
  candidates: readonly PropRef[],
  view: View,
  accept: (prop: PropRef) => boolean = () => true,
): Focus | null {
  let best: Focus | null = null;
  const { eye, forward } = view;

  for (const prop of candidates) {
    const dx = prop.x - eye.x;
    const dz = prop.z - eye.z;
    const distance = Math.hypot(dx, dz);
    if (distance > INTERACT.reach || !accept(prop)) continue;

    const dy = prop.y + targetHeight(prop) - eye.y;
    let angleDeg = angleBetween(dx, dy, dz, forward);
    if (distance <= INTERACT.closeRange) {
      const horizontalForward = { x: forward.x, y: 0, z: forward.z };
      if (Math.hypot(forward.x, forward.z) > 1e-6) {
        angleDeg = Math.min(angleDeg, angleBetween(dx, 0, dz, horizontalForward));
      }
    }
    if (angleDeg > INTERACT.viewConeDeg) continue;

    if (
      best === null ||
      angleDeg < best.angleDeg - 1e-9 ||
      (Math.abs(angleDeg - best.angleDeg) <= 1e-9 && distance < best.distance)
    ) {
      best = { prop, distance, angleDeg };
    }
  }
  return best;
}
