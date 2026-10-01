import { beforeAll, describe, expect, it } from 'vitest';
import { SHELTER_EFFECTS } from '../src/config';
import type { MoveIntent } from '../src/core/inputMapping';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';
import { Player } from '../src/player/Player';
import { HUT, localToWorld, solidBoxes } from '../src/placement/structureShapes';
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
  const colliders = new StructureColliders(physics, structures);
  return { physics, structures, colliders };
}

describe('structureShapes', () => {
  it('ateş ve sundurma katı değildir; sandık/tezgâh tek kutu, kulübe beş duvar parçası', () => {
    expect(solidBoxes('campfire')).toEqual([]);
    expect(solidBoxes('lean_to')).toEqual([]);
    expect(solidBoxes('storage_chest')).toHaveLength(1);
    expect(solidBoxes('workbench')).toHaveLength(1);
    expect(solidBoxes('wooden_hut')).toHaveLength(5);
  });

  it('kulübenin barınak altlığı duvarların içindedir', () => {
    const { hut } = SHELTER_EFFECTS;
    expect(hut.halfWidth).toBeLessThanOrEqual(HUT.inner);
    expect(hut.front).toBeLessThanOrEqual(HUT.inner);
    expect(-hut.back).toBeLessThanOrEqual(HUT.inner);
  });

  it('localToWorld, Three.js rotation.y ile aynıdır (yaw = 90°: yerel +z → dünya +x)', () => {
    const p = localToWorld({ x: 10, z: 5, yaw: Math.PI / 2 }, 0, 1);
    expect(p.x).toBeCloseTo(11, 9);
    expect(p.z).toBeCloseTo(5, 9);
  });
});

describe('StructureColliders', () => {
  it('yapı kümesiyle eşitlenir: ekleme, sökme, yerinde yükleme', () => {
    const { physics, structures, colliders } = world();
    structures.add('campfire', 0, 0, 0);
    colliders.sync();
    expect(colliders.count).toBe(0);
    const hut = structures.add('wooden_hut', 10, 0, 0);
    structures.add('storage_chest', -5, 0, 0);
    colliders.sync();
    expect(colliders.count).toBe(6);
    structures.remove(hut.id);
    colliders.sync();
    expect(colliders.count).toBe(1);
    // Aynı kimlik başka konumda (kayıt yükleme): eski collider kalkar, yenisi kurulur.
    const other = new StructureSet();
    other.add('campfire', 0, 0, 0);
    other.add('wooden_hut', 50, 0, 50);
    structures.loadSave(other.toJSON());
    colliders.sync();
    expect(colliders.count).toBe(5);
    colliders.dispose();
    expect(colliders.count).toBe(0);
    physics.dispose();
  });

  it('kulübe duvarı oyuncuyu durdurur; kapıdan girilir', () => {
    const { physics, structures, colliders } = world();
    structures.add('wooden_hut', 0, 0, 0, 0); // kapı +Z yönünde
    colliders.sync();
    const outer = HUT.inner + HUT.wallThickness;

    // Doğudan batıya (−X) yürü: sağ duvar durdurur.
    const east = new Player(physics, { x: 6, y: 0.05, z: 0 });
    for (let i = 0; i < 4 / DT; i++) {
      east.update(DT, { ...idle, forward: 1 }, Math.PI / 2); // yaw 90° → ileri −X
      physics.step();
    }
    expect(east.position.x).toBeGreaterThan(outer);
    east.dispose();

    // Güneyden kuzeye (−Z) kapıdan gir: içeri girer.
    const south = new Player(physics, { x: 0, y: 0.05, z: 6 });
    for (let i = 0; i < 1.5 / DT; i++) {
      south.update(DT, { ...idle, forward: 1 }, 0);
      physics.step();
    }
    expect(south.position.z).toBeLessThan(HUT.inner);
    expect(south.position.z).toBeGreaterThan(-HUT.inner);
    south.dispose();
    colliders.dispose();
    physics.dispose();
  });
});
