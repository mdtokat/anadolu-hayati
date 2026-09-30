import { beforeAll, describe, expect, it } from 'vitest';
import { OBSTACLES } from '../src/config';
import type { MoveIntent } from '../src/core/inputMapping';
import { initPhysics, PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Player } from '../src/player/Player';
import { ProceduralHeightSource } from '../src/world/ProceduralHeightSource';
import { TestScene } from '../src/world/TestScene';

const DT = 1 / 60;
/** yaw = π → ileri = +Z (parkur bloklarına doğru) */
const FACE_SOUTH = Math.PI;

beforeAll(async () => {
  await initPhysics();
});

/**
 * Parkur bloğuna doğru koşar; `jump` true ise zıplama tuşu basılı tutulur.
 * - `maxZ`: ulaşılan en güney nokta (blok önünde kaldı mı?)
 * - `minYOnBlock`: oyuncunun merkezi blok alanının içindeyken en düşük yükseklik
 *   (null = hiç blok üstüne girmedi). Bloğun içinden/altından geçseydi bu değer h'den küçük olurdu.
 */
function approach(blockIndex: number, jump: boolean, seconds = 6) {
  const block = OBSTACLES.course[blockIndex];
  if (!block) throw new Error('parkur bloğu yok');
  const front = block.z - block.d / 2;
  const back = block.z + block.d / 2;

  const source = new ProceduralHeightSource();
  const physics = new PhysicsWorld();
  const scene = new TestScene(physics, source);
  const player = new Player(physics, { x: block.x, y: 0.05, z: front - 10 });
  const intent: MoveIntent = { forward: 1, strafe: 0, run: true, jump };

  let maxZ = -Infinity;
  let maxY = 0;
  let minYOnBlock: number | null = null;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    player.update(DT, intent, FACE_SOUTH);
    physics.step();
    const { y, z } = player.position;
    maxZ = Math.max(maxZ, z);
    maxY = Math.max(maxY, y);
    if (z > front + 0.3 && z < back - 0.3) minYOnBlock = Math.min(minYOnBlock ?? Infinity, y);
  }
  player.dispose();
  scene.dispose();
  physics.dispose();
  return { maxZ, maxY, minYOnBlock, front, block };
}

describe('hareket parkuru', () => {
  it('0,3 m blok: zıplamadan otomatik basamakla çıkılır', () => {
    const r = approach(0, false);
    expect(r.minYOnBlock).not.toBeNull();
    expect(r.minYOnBlock).toBeGreaterThan(r.block.h - 0.1);
  });

  it('0,6 m blok: zıplamadan çıkılamaz, zıplayarak çıkılır', () => {
    const walk = approach(1, false);
    expect(walk.maxZ).toBeLessThan(walk.front);
    expect(walk.maxY).toBeLessThan(0.5);

    const jump = approach(1, true);
    expect(jump.minYOnBlock).not.toBeNull();
    expect(jump.minYOnBlock).toBeGreaterThan(jump.block.h - 0.1);
  });

  it('1,0 m blok: zıplayarak çıkılır', () => {
    const r = approach(2, true);
    expect(r.minYOnBlock).not.toBeNull();
    expect(r.minYOnBlock).toBeGreaterThan(r.block.h - 0.1);
  });

  it('2,0 m duvar: zıplayarak bile aşılamaz', () => {
    const r = approach(3, true);
    expect(r.maxZ).toBeLessThan(r.front);
    expect(r.maxY).toBeLessThan(1.5);
  });
});
