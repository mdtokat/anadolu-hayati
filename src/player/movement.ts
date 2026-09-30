import { PHYSICS, PLAYER } from '../config';
import type { MoveIntent } from '../core/inputMapping';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Yatay hareket niyetinin dünya yönü (birim uzunluğu aşmaz). */
export interface WishDirection {
  x: number;
  z: number;
}

/**
 * Bakış açısına (yaw) göre hareket niyetini dünya X/Z yönüne çevirir.
 * yaw = 0 → −Z'ye (kuzey) bakar; pozitif yaw sola döner.
 * Çapraz hareket normalize edilir: iki tuş tek tuştan hızlı olmaz.
 */
export function wishDirection(intent: MoveIntent, yaw: number): WishDirection {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // ileri = (−sin, −cos); sağ = (cos, −sin)
  const x = -sin * intent.forward + cos * intent.strafe;
  const z = -cos * intent.forward - sin * intent.strafe;
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}

/** Verilen zıplama yüksekliğine ulaşmak için gereken dikey başlangıç hızı: v = √(2·g·h). */
export function jumpSpeedFor(height: number, gravity: number): number {
  return Math.sqrt(2 * gravity * height);
}

/**
 * Bir sabit adım için yeni hızı hesaplar (çarpışmadan önce).
 * Yatay: hedef hıza (yürüme/koşma) ivmeyle yaklaşır; yerde havadakinden çevik.
 * Dikey: yerdeyken zıplama tuşu başlangıç hızı verir, aksi halde yerçekimi (üst sınırlı).
 */
export function stepVelocity(
  velocity: Vec3,
  grounded: boolean,
  intent: MoveIntent,
  yaw: number,
  dt: number,
): Vec3 {
  const wish = wishDirection(intent, yaw);
  const speed = intent.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const acceleration = grounded ? PLAYER.groundAcceleration : PLAYER.airAcceleration;

  // Vektörel yaklaşma: yön değiştirirken hız büyüklüğü de ivmeyle sınırlı kalır.
  const dx = wish.x * speed - velocity.x;
  const dz = wish.z * speed - velocity.z;
  const distance = Math.hypot(dx, dz);
  const maxDelta = acceleration * dt;
  const k = distance <= maxDelta || distance === 0 ? 1 : maxDelta / distance;

  let vy = velocity.y;
  if (grounded && intent.jump) {
    vy = jumpSpeedFor(PLAYER.jumpHeight, PHYSICS.gravity);
  } else if (grounded && vy < 0) {
    vy = 0;
  } else {
    vy = Math.max(vy - PHYSICS.gravity * dt, -PLAYER.maxFallSpeed);
  }

  return { x: velocity.x + dx * k, y: vy, z: velocity.z + dz * k };
}
