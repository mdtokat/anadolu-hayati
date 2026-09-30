import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../src/config';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';

beforeAll(async () => {
  await initPhysics();
});

describe('PhysicsWorld', () => {
  it('sabit adım süresini FIXED_STEP olarak ayarlar', () => {
    const physics = new PhysicsWorld();
    expect(physics.world.timestep).toBeCloseTo(FIXED_STEP);
    physics.dispose();
  });

  it('initPhysics birden çok kez çağrılabilir', async () => {
    await expect(initPhysics()).resolves.toBeUndefined();
  });

  it('yerçekimi altında düşen kapsül zeminde durur', () => {
    const physics = new PhysicsWorld();
    // Üst yüzü y = 0 olan geniş zemin
    physics.addStaticCollider(RAPIER.ColliderDesc.cuboid(50, 1, 50).setTranslation(0, -1, 0));

    const body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0),
    );
    physics.world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.35), body);

    for (let i = 0; i < 180; i++) physics.step();

    // Kapsül merkezi: yarım silindir (0.55) + yarıçap (0.35) = 0.9 m yukarıda
    expect(body.translation().y).toBeCloseTo(0.9, 1);
    expect(Math.abs(body.linvel().y)).toBeLessThan(0.05);
    physics.dispose();
  });
});
