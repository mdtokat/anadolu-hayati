import { describe, expect, it } from 'vitest';
import { PHYSICS, PLAYER } from '../src/config';
import type { MoveIntent } from '../src/core/inputMapping';
import { jumpSpeedFor, stepVelocity, wishDirection, type Vec3 } from '../src/player/movement';

const DT = 1 / 60;
const idle: MoveIntent = { forward: 0, strafe: 0, run: false, jump: false };
const still: Vec3 = { x: 0, y: 0, z: 0 };

/** Aynı niyetle `seconds` saniye simüle eder. */
function simulate(
  intent: MoveIntent,
  yaw: number,
  seconds: number,
  grounded = true,
  start = still,
) {
  let v = start;
  for (let i = 0; i < Math.round(seconds / DT); i++) v = stepVelocity(v, grounded, intent, yaw, DT);
  return v;
}

describe('wishDirection', () => {
  it('yaw 0 iken ileri = −Z (kuzey), sağ = +X (doğu)', () => {
    const forward = wishDirection({ ...idle, forward: 1 }, 0);
    expect(forward.x).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(-1);
    const right = wishDirection({ ...idle, strafe: 1 }, 0);
    expect(right.x).toBeCloseTo(1);
    expect(right.z).toBeCloseTo(0);
  });

  it('sola dönünce (yaw +90°) ileri = −X (batı)', () => {
    const d = wishDirection({ ...idle, forward: 1 }, Math.PI / 2);
    expect(d.x).toBeCloseTo(-1);
    expect(d.z).toBeCloseTo(0);
  });

  it('çapraz hareket normalize edilir (birim uzunluk)', () => {
    const d = wishDirection({ ...idle, forward: 1, strafe: 1 }, 0.7);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
  });

  it('niyet yokken sıfır verir', () => {
    const d = wishDirection(idle, 1.2);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(0);
  });
});

describe('jumpSpeedFor', () => {
  it('v²/(2g) istenen yüksekliği verir', () => {
    const v = jumpSpeedFor(PLAYER.jumpHeight, PHYSICS.gravity);
    expect((v * v) / (2 * PHYSICS.gravity)).toBeCloseTo(PLAYER.jumpHeight, 6);
  });
});

describe('stepVelocity yatay', () => {
  it('yürürken yürüme hızına ulaşır ve aşmaz', () => {
    const v = simulate({ ...idle, forward: 1 }, 0, 2);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(PLAYER.walkSpeed, 6);
  });

  it('Shift ile koşma hızına ulaşır', () => {
    const v = simulate({ ...idle, forward: 1, run: true }, 0, 2);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(PLAYER.runSpeed, 6);
  });

  it('çapraz gidiş tek eksenden hızlı değildir', () => {
    const straight = simulate({ ...idle, forward: 1 }, 0.4, 2);
    const diagonal = simulate({ ...idle, forward: 1, strafe: 1 }, 0.4, 2);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(Math.hypot(straight.x, straight.z), 6);
  });

  it('ivme sınırlıdır: tek adımda hedef hıza sıçramaz', () => {
    const v = stepVelocity(still, true, { ...idle, forward: 1 }, 0, DT);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(PLAYER.groundAcceleration * DT, 6);
    expect(Math.hypot(v.x, v.z)).toBeLessThan(PLAYER.walkSpeed);
  });

  it('tuş bırakılınca durur', () => {
    const moving = simulate({ ...idle, forward: 1, run: true }, 0, 2);
    const stopped = simulate(idle, 0, 1, true, moving);
    expect(Math.hypot(stopped.x, stopped.z)).toBeCloseTo(0, 6);
  });

  it('havada yerdekinden daha az ivmelenir', () => {
    const ground = stepVelocity(still, true, { ...idle, forward: 1 }, 0, DT);
    const air = stepVelocity(still, false, { ...idle, forward: 1 }, 0, DT);
    expect(Math.hypot(air.x, air.z)).toBeLessThan(Math.hypot(ground.x, ground.z));
  });
});

describe('stepVelocity dikey', () => {
  it('yerdeyken zıplama tuşu başlangıç hızı verir', () => {
    const v = stepVelocity(still, true, { ...idle, jump: true }, 0, DT);
    expect(v.y).toBeCloseTo(jumpSpeedFor(PLAYER.jumpHeight, PHYSICS.gravity), 6);
  });

  it('havadayken zıplama tuşu etkisizdir, yerçekimi çeker', () => {
    const v = stepVelocity(still, false, { ...idle, jump: true }, 0, DT);
    expect(v.y).toBeCloseTo(-PHYSICS.gravity * DT, 6);
  });

  it('yerdeyken aşağı hız sıfırlanır', () => {
    const v = stepVelocity({ x: 0, y: -5, z: 0 }, true, idle, 0, DT);
    expect(v.y).toBe(0);
  });

  it('düşüş hızı üst sınırla kısıtlıdır', () => {
    let v: Vec3 = still;
    for (let i = 0; i < 60 * 20; i++) v = stepVelocity(v, false, idle, 0, DT);
    expect(v.y).toBe(-PLAYER.maxFallSpeed);
  });
});
