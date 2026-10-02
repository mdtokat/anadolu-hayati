import { beforeAll, describe, expect, it } from 'vitest';
import type { MoveIntent } from '../src/core/inputMapping';
import { fenceYawForAxis } from '../src/placement/fences';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';
import { Player } from '../src/player/Player';
import { StructureSet } from '../src/placement/structures';
import { StructureColliders } from '../src/world/StructureColliders';

const DT = 1 / 60;
const idle: MoveIntent = { forward: 0, strafe: 0, run: false, jump: false };

beforeAll(async () => {
  await initPhysics();
});

function world() {
  const physics = new PhysicsWorld();
  physics.addStaticCollider(RAPIER.ColliderDesc.cuboid(100, 1, 100).setTranslation(0, -1, 0));
  const structures = new StructureSet();
  return { physics, structures, colliders: new StructureColliders(physics, structures) };
}

/** Oyuncuyu `seconds` boyunca kuzeye (−Z) yürütür; son konumu döndürür. */
function walkNorth(
  physics: PhysicsWorld,
  from: { x: number; y: number; z: number },
  seconds: number,
) {
  const player = new Player(physics, from);
  for (let i = 0; i < seconds / DT; i++) {
    player.update(DT, { ...idle, forward: 1 }, 0);
    physics.step();
  }
  const end = { ...player.position };
  player.dispose();
  return end;
}

describe('çit collider (Rapier)', () => {
  it('kapalı çit yürüyen oyuncuyu durdurur; çitsiz geçilir', () => {
    const { physics, structures, colliders } = world();
    for (const x of [-3, -1, 1, 3]) structures.add('wood_fence', x, 0, -3, fenceYawForAxis('x'));
    colliders.sync();
    const blocked = walkNorth(physics, { x: 0, y: 0.05, z: 0 }, 3);
    expect(blocked.z).toBeGreaterThan(-3);
    expect(blocked.z).toBeLessThan(-1.5);
    colliders.dispose();
    const free = walkNorth(physics, { x: 0, y: 0.05, z: 0 }, 3);
    expect(free.z).toBeLessThan(-5);
    physics.dispose();
  });

  it('çit kapısı kapalıyken durdurur, açılınca (collider yenilenir) orta açıklıktan geçilir', () => {
    const { physics, structures, colliders } = world();
    for (const x of [-3, -1, 3]) structures.add('wood_fence', x, 0, -3, fenceYawForAxis('x'));
    const gate = structures.add('fence_gate', 1, 0, -3, fenceYawForAxis('x'));
    colliders.sync();
    expect(walkNorth(physics, { x: 1, y: 0.05, z: 0 }, 3).z).toBeGreaterThan(-3);
    structures.toggleDoor(gate.id);
    colliders.sync();
    // Kanat menteşe ucunda (x = 1 + 1 → kapının batı/doğu ucunda); orta (x = 1) açık kalır.
    expect(walkNorth(physics, { x: 1, y: 0.05, z: 0 }, 3).z).toBeLessThan(-5);
    colliders.dispose();
    physics.dispose();
  });

  it('eğimli çit iki ucunun zeminine uyar: yüksek uçta kutu tepesi daha yukarıdadır, dilimler boşluk bırakmaz', () => {
    const { physics, structures, colliders } = world();
    // Uçları z = −1 (y 0) ve z = +1 (y 1) — Z boyunca uzanan çit (yaw 0), rise = +1, orta nokta y = 0,5.
    structures.add('wood_fence', 0, 0.5, 0, 0, 1);
    colliders.sync();
    physics.step(); // sorgu boru hattı güncellensin
    expect(colliders.count).toBeGreaterThanOrEqual(2);
    // Yukarıdan inen ışın: kutu tepesi (zemin + çit boyu) uçların zemininden 1,1 m yukarıdadır.
    const topAt = (z: number): number => {
      const hit = physics.world.castRay(
        new RAPIER.Ray({ x: 0, y: 5, z }, { x: 0, y: -1, z: 0 }),
        20,
        true,
      );
      return 5 - (hit?.timeOfImpact ?? 99);
    };
    expect(topAt(-0.9)).toBeCloseTo(0.05 + 1.1, 0);
    expect(topAt(0.9)).toBeCloseTo(0.95 + 1.1, 0);
    expect(topAt(0.9)).toBeGreaterThan(topAt(-0.9) + 0.6);
    // Eğim boyunca kesintisiz: her 0,1 m'de bir ışın kutuya çarpar (zemin değil, kutu tepesi ≥ 1).
    for (let z = -0.95; z <= 0.95; z += 0.1) expect(topAt(z)).toBeGreaterThan(1);
    colliders.dispose();
    physics.dispose();
  });
});
