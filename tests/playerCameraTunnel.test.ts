import { describe, expect, it } from 'vitest';
import { CAMERA } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { PlayerCamera } from '../src/player/PlayerCamera';
import type { HeightSource } from '../src/world/HeightSource';

/** Düz arazi y = 20 (tünelde oyuncu y = 5'te, arazinin 15 m altında). */
const terrain = { heightAt: () => 20 } as unknown as HeightSource;

function thirdPerson(): PlayerCamera {
  const cam = new PlayerCamera(new EventBus<GameEvents>(), terrain);
  cam.toggleMode();
  expect(cam.mode).toBe('thirdPerson');
  return cam;
}

describe('PlayerCamera — tünel', () => {
  it('yüzeyde üçüncü şahıs kamera arazinin üstünde kalır', () => {
    const cam = thirdPerson();
    cam.setLook(0, 0.6); // yukarı bakış: kamera aşağı iner
    cam.update({ x: 0, y: 20, z: 0 });
    expect(cam.camera.position.y).toBeGreaterThanOrEqual(
      20 + CAMERA.thirdPersonGroundClearance - 1e-6,
    );
  });

  it('tünelde (ayak arazinin altında) kamera dağın üstüne fırlamaz, oyuncunun yakınında kalır', () => {
    const cam = thirdPerson();
    cam.setLook(0, -0.2);
    cam.update({ x: 0, y: 5, z: 0 });
    const p = cam.camera.position;
    expect(p.y).toBeLessThan(10);
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(CAMERA.undergroundDistance + 0.01);
  });
});
