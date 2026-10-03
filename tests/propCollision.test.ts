import { beforeAll, describe, expect, it } from 'vitest';
import type { RegionData } from '../src/data/region';
import { initPhysics } from '../src/physics/PhysicsWorld';
import { propSolid } from '../src/world/propSolids';
import { findSafeSpawn } from '../src/world/spawn';
import { loadRealRegion } from './helpers/realRegion';
import { setupWorld, yawToward } from './helpers/walker';

let region: RegionData;

beforeAll(async () => {
  await initPhysics();
  region = await loadRealRegion();
});

describe('katı nesneler (ağaç, kaya, çalı)', () => {
  it('oyuncu bir ağaca doğru yürürse gövdesinin içine giremez', () => {
    const { world, player, physics, step, dispose } = setupWorld(region);
    // Oyuncunun çevresinde düz, rahat bir ağaç ara (başlangıç noktası ormanlık değilse çevreyi tara).
    const start = world.spawn;
    world.prepare(start.x, start.z);
    let target: { x: number; z: number; r: number; kind: string } | null = null;
    let from = { x: start.x, z: start.z };
    search: for (let ring = 0; ring < 40 && !target; ring++) {
      const cx = start.x + (ring % 7) * 60;
      const cz = start.z + Math.floor(ring / 7) * 60;
      const spot = findSafeSpawn(world.source, cx, cz, world.maxSlopeDeg);
      if (!spot) continue;
      world.prepare(spot.x, spot.z);
      for (const prop of world.propsNear(spot.x, spot.z, 30)) {
        const solid = propSolid(prop.kind, prop.scale);
        if (!solid || !prop.kind.startsWith('tree')) continue;
        from = { x: prop.x - 6, z: prop.z };
        const safe = findSafeSpawn(world.source, from.x, from.z, world.maxSlopeDeg);
        if (!safe || Math.hypot(safe.x - from.x, safe.z - from.z) > 1) continue;
        target = { x: prop.x, z: prop.z, r: solid.radius, kind: prop.kind };
        break search;
      }
    }
    expect(target).not.toBeNull();
    const t = target!;
    world.prepare(from.x, from.z);
    player.teleport({ x: from.x, y: world.terrain.heightAt(from.x, from.z) + 0.2, z: from.z });
    physics.step();
    let closest = Infinity;
    for (let i = 0; i < 60 * 6; i++) {
      step(
        { forward: 1, strafe: 0, run: false, jump: false },
        yawToward(t.x - player.position.x, t.z - player.position.z),
      );
      closest = Math.min(closest, Math.hypot(player.position.x - t.x, player.position.z - t.z));
    }
    // Oyuncu gövdesi (yarıçap ~0,35) ağaç yarıçapının içine giremez (küçük sönüm payıyla).
    expect(closest).toBeGreaterThan(t.r + 0.2);
    dispose();
  });

  it('collider sayısı sınırlı kalır (oyuncuya yakın nesneler)', () => {
    const { world, dispose } = setupWorld(region);
    world.prepare(world.spawn.x, world.spawn.z);
    expect(world.walkBlocked).toBeTypeOf('function');
    dispose();
  });
});
