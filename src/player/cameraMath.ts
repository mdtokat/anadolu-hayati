import { CAMERA } from '../config';
import type { Vec3 } from './movement';

const MAX_PITCH = CAMERA.maxPitchDeg * (Math.PI / 180);
const TWO_PI = Math.PI * 2;

export interface Look {
  /** Yatay bakış: 0 = −Z (kuzey); pozitif değer sola döner. */
  yaw: number;
  /** Dikey bakış: pozitif değer yukarı bakar. */
  pitch: number;
}

/** Açıyı (−π, π] aralığına sarar. */
export function wrapAngle(angle: number): number {
  const wrapped = ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/**
 * Fare hareketini (piksel) bakışa uygular. Fareyi sağa çekmek sağa döndürür (yaw azalır),
 * aşağı çekmek aşağı bakar (pitch azalır). Pitch ±maxPitch ile sınırlanır.
 */
export function applyLook(look: Look, dx: number, dy: number, sensitivity: number): Look {
  const pitch = look.pitch - dy * sensitivity;
  return {
    yaw: wrapAngle(look.yaw - dx * sensitivity),
    pitch: Math.min(Math.max(pitch, -MAX_PITCH), MAX_PITCH),
  };
}

/** Bakış yönünün birim vektörü (dünya ekseni: +X doğu, +Y yukarı, −Z kuzey). */
export function lookDirection(look: Look): Vec3 {
  const cosPitch = Math.cos(look.pitch);
  return {
    x: -Math.sin(look.yaw) * cosPitch,
    y: Math.sin(look.pitch),
    z: -Math.cos(look.yaw) * cosPitch,
  };
}

/** Üçüncü şahıs kamerasının odak noktasına göre konumu: bakış yönünün tersine `distance` kadar. */
export function thirdPersonOffset(look: Look, distance: number): Vec3 {
  const d = lookDirection(look);
  return { x: -d.x * distance, y: -d.y * distance, z: -d.z * distance };
}
