import { beforeAll, describe, expect, it } from 'vitest';
import { PIECES } from '../src/config';
import type { MoveIntent } from '../src/core/inputMapping';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';
import { Player } from '../src/player/Player';
import { STOREY } from '../src/placement/pieces';
import { StructureSet } from '../src/placement/structures';
import { StructureColliders } from '../src/world/StructureColliders';

const DT = 1 / 60;
const idle: MoveIntent = { forward: 0, strafe: 0, run: false, jump: false };
const SLAB = PIECES.slab;

beforeAll(async () => {
  await initPhysics();
});

/** Düz zemin (üst yüzü y = 0) üstünde yapı kümesi ve collider'ları. */
function world() {
  const physics = new PhysicsWorld();
  physics.addStaticCollider(RAPIER.ColliderDesc.cuboid(100, 1, 100).setTranslation(0, -1, 0));
  const structures = new StructureSet();
  const colliders = new StructureColliders(physics, structures);
  return { physics, structures, colliders };
}

/** Oyuncuyu `seconds` boyunca `yaw` yönüne yürütür (zıplamadan); son ayak konumunu döndürür. */
function walk(
  physics: PhysicsWorld,
  from: { x: number; y: number; z: number },
  yaw: number,
  seconds: number,
): { x: number; y: number; z: number } {
  const player = new Player(physics, from);
  for (let i = 0; i < seconds / DT; i++) {
    player.update(DT, { ...idle, forward: 1 }, yaw);
    physics.step();
  }
  const end = { ...player.position };
  player.dispose();
  return end;
}

describe('merdiven (Rapier)', () => {
  /**
   * Zemin katı (0, 2), (0, 0), (0, −2) tabanları; merdiven (0, 0) → (0, −2) kuzeye çıkar; üst katta merdiven boşluklu
   * iki taban ve çıkıştaki (0, −4) tabanı.
   */
  function stairScene() {
    const scene = world();
    const { structures } = scene;
    for (const z of [2, 0, -2]) structures.add('foundation', 0, 0, z, 0);
    structures.add('stairs', 0, 0, -1, 0);
    for (const z of [0, -2, -4]) structures.add('foundation', 0, STOREY, z, 0);
    scene.colliders.sync();
    return scene;
  }

  it('zeminden merdivenle üst kata yürünür (zıplamadan)', () => {
    const { physics, colliders } = stairScene();
    // 2,6 sn: merdivenin üst ucunu geçip çıkıştaki tabanda (öbür kenarından düşmeden) durur.
    const end = walk(physics, { x: 0, y: 0.05, z: 3.5 }, 0, 2.6);
    expect(end.z).toBeLessThan(-3.2);
    expect(end.z).toBeGreaterThan(-5);
    expect(end.y).toBeGreaterThan(STOREY + SLAB - 0.15);
    expect(end.y).toBeLessThan(STOREY + SLAB + 0.15);
    colliders.dispose();
    physics.dispose();
  });

  it('üst kattan merdivenle aşağı inilir', () => {
    const { physics, colliders } = stairScene();
    const end = walk(physics, { x: 0, y: STOREY + SLAB + 0.05, z: -4 }, Math.PI, 1.6);
    expect(end.z).toBeGreaterThan(1.2);
    expect(end.z).toBeLessThan(3);
    expect(end.y).toBeLessThan(SLAB + 0.15);
    colliders.dispose();
    physics.dispose();
  });

  it('merdiven yokken üst kata çıkılamaz; boşluk korkulukla çevrili (yandan düşülmez)', () => {
    const { physics, structures, colliders } = world();
    for (const z of [2, 0, -2]) structures.add('foundation', 0, 0, z, 0);
    for (const z of [-4]) structures.add('foundation', 0, STOREY, z, 0);
    colliders.sync();
    const end = walk(physics, { x: 0, y: 0.05, z: 3.5 }, 0, 4);
    expect(end.y).toBeLessThan(1);
    colliders.dispose();
    physics.dispose();

    // Üst katta boşluğun yanında doğuya yürüyen oyuncu korkuluğa takılır (boşluğa düşmez).
    const scene = stairScene();
    scene.structures.add('foundation', 2, STOREY, 0, 0);
    scene.colliders.sync();
    const side = walk(scene.physics, { x: 2, y: STOREY + SLAB + 0.05, z: 0 }, Math.PI / 2, 2);
    expect(side.x).toBeGreaterThan(1);
    expect(side.y).toBeGreaterThan(STOREY);
    scene.colliders.dispose();
    scene.physics.dispose();
  });

  it('merdiven eklenince üstteki tabanın collider’ı boşluklu varyanta döner', () => {
    const { physics, structures, colliders } = world();
    for (const z of [0, -2]) structures.add('foundation', 0, 0, z, 0);
    for (const z of [0, -2]) structures.add('foundation', 0, STOREY, z, 0);
    colliders.sync();
    const before = colliders.count;
    structures.add('stairs', 0, 0, -1, 0);
    colliders.sync();
    // Merdiven rampası (1) + iki taban artık kenar şeridi (iç kenar hariç 3) + korkuluk (3 ve 2).
    expect(colliders.count).toBe(before - 2 + 1 + (3 + 3) + (3 + 2));
    colliders.dispose();
    physics.dispose();
  });
});

describe('giriş basamağı (Rapier)', () => {
  /** Üst yüzü zeminden 1 m yüksek taban (0, −2); güney kenarında isteğe bağlı giriş basamağı. */
  function raised(step: boolean) {
    const scene = world();
    scene.structures.add('foundation', 0, 1 - SLAB, -2, 0);
    if (step) scene.structures.add('entry_step', 0, 1 - SLAB, -1, 0);
    scene.colliders.sync();
    return scene;
  }

  it('1 m yüksek tabana basamakla zıplamadan çıkılır; basamaksız çıkılamaz', () => {
    const without = raised(false);
    const blocked = walk(without.physics, { x: 0, y: 0.05, z: 3 }, 0, 3);
    expect(blocked.z).toBeGreaterThan(-1);
    expect(blocked.y).toBeLessThan(0.5);
    without.colliders.dispose();
    without.physics.dispose();

    // 1,5 sn: basamaktan çıkıp tabanın üstünde (öbür kenarından inmeden) durur.
    const withStep = raised(true);
    const up = walk(withStep.physics, { x: 0, y: 0.05, z: 3 }, 0, 1.5);
    expect(up.z).toBeLessThan(-1.5);
    expect(up.y).toBeGreaterThan(0.85);
    expect(up.y).toBeLessThan(1.15);
    withStep.colliders.dispose();
    withStep.physics.dispose();
  });
});
