import { describe, expect, it } from 'vitest';
import { CAMERA } from '../src/config';
import { applyLook, lookDirection, thirdPersonOffset, wrapAngle } from '../src/player/cameraMath';
import { wishDirection } from '../src/player/movement';

const MAX_PITCH = CAMERA.maxPitchDeg * (Math.PI / 180);

describe('applyLook', () => {
  it('fareyi sağa çekmek sağa döndürür (yaw azalır)', () => {
    const look = applyLook({ yaw: 0, pitch: 0 }, 100, 0, 0.01);
    expect(look.yaw).toBeCloseTo(-1);
    expect(look.pitch).toBe(0);
  });

  it('fareyi aşağı çekmek aşağı bakar (pitch azalır)', () => {
    expect(applyLook({ yaw: 0, pitch: 0 }, 0, 50, 0.01).pitch).toBeCloseTo(-0.5);
  });

  it('pitch ±maxPitch ile sınırlanır', () => {
    expect(applyLook({ yaw: 0, pitch: 0 }, 0, -1e6, 0.01).pitch).toBe(MAX_PITCH);
    expect(applyLook({ yaw: 0, pitch: 0 }, 0, 1e6, 0.01).pitch).toBe(-MAX_PITCH);
  });

  it('yaw (−π, π] aralığında kalır', () => {
    let look = { yaw: 3, pitch: 0 };
    for (let i = 0; i < 100; i++) {
      look = applyLook(look, -37, 0, 0.01);
      expect(look.yaw).toBeGreaterThan(-Math.PI);
      expect(look.yaw).toBeLessThanOrEqual(Math.PI);
    }
  });
});

describe('wrapAngle', () => {
  it('açıyı sarar', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI * 2 + 0.5)).toBeCloseTo(0.5);
    expect(wrapAngle(-Math.PI * 2 - 0.5)).toBeCloseTo(-0.5);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe('lookDirection', () => {
  it('birim uzunluktadır', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [1.1, 0.4],
      [-2.5, -1.2],
    ] as const) {
      const d = lookDirection({ yaw, pitch });
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    }
  });

  it('yaw 0 → −Z (kuzey); yukarı bakınca y > 0', () => {
    const d = lookDirection({ yaw: 0, pitch: 0 });
    expect(d).toEqual({ x: -0, y: 0, z: -1 });
    expect(lookDirection({ yaw: 0, pitch: 0.5 }).y).toBeGreaterThan(0);
  });

  it('yatay bileşen, hareketin "ileri" yönüyle aynıdır (kamera ile hareket uyumlu)', () => {
    for (const yaw of [0, 0.7, -1.9, 3]) {
      const look = lookDirection({ yaw, pitch: 0 });
      const move = wishDirection({ forward: 1, strafe: 0, run: false, jump: false }, yaw);
      expect(look.x).toBeCloseTo(move.x);
      expect(look.z).toBeCloseTo(move.z);
    }
  });
});

describe('thirdPersonOffset', () => {
  it('düz bakarken kamera oyuncunun arkasındadır (yaw 0 → +Z)', () => {
    const o = thirdPersonOffset({ yaw: 0, pitch: 0 }, 4);
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(0);
    expect(o.z).toBeCloseTo(4);
  });

  it('uzaklık korunur', () => {
    const o = thirdPersonOffset({ yaw: 1.3, pitch: -0.6 }, 4);
    expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(4);
  });

  it('yukarı bakınca kamera odağın altına iner, aşağı bakınca üstüne çıkar', () => {
    expect(thirdPersonOffset({ yaw: 0, pitch: 0.5 }, 4).y).toBeLessThan(0);
    expect(thirdPersonOffset({ yaw: 0, pitch: -0.5 }, 4).y).toBeGreaterThan(0);
  });
});
