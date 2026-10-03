import { beforeAll, describe, expect, it } from 'vitest';
import { CHUNK, HORIZONTAL_SCALE } from '../src/config';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';
import { ChunkColliders } from '../src/world/ChunkColliders';
import { RegionHeightSource } from '../src/world/RegionHeightSource';

/** 129 × 129 örneklik (tek chunk) düz arazi; elevation ≈ 30000/65535 · 100 m. */
function flatSource(): RegionHeightSource {
  const meta = {
    id: 't',
    name: 't',
    crs: 'EPSG:32636',
    originUtm: [0, 0] as [number, number],
    gridWidth: 129,
    gridHeight: 129,
    cellSizeReal: 2 * HORIZONTAL_SCALE,
    elevationMin: 0,
    elevationMax: 100,
    elevationEncoding: 'uint16' as const,
    horizontalScale: HORIZONTAL_SCALE,
    sources: [],
    built: '2026-01-01',
    gridOrigin: { x: -128, z: -128 },
  };
  return new RegionHeightSource(meta as never, new Uint16Array(129 * 129).fill(30000));
}

/** Tek delik hücresi (40, 40). */
const HOLE = { c: 40, r: 40 };
const holes = {
  width: 129,
  count: 1,
  has: (c: number, r: number) => c === HOLE.c && r === HOLE.r,
  any: (c0: number, r0: number, c1: number, r1: number) =>
    c0 <= HOLE.c && HOLE.c < c1 && r0 <= HOLE.r && HOLE.r < r1,
};

function hitDown(physics: PhysicsWorld, x: number, z: number): boolean {
  physics.step();
  const ray = new RAPIER.Ray({ x, y: 50, z }, { x: 0, y: -1, z: 0 });
  return physics.world.castRay(ray, 100, true) !== null;
}

describe('ChunkColliders — tünel ağzı delikli chunk', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('delikli chunk bloklara bölünür: delik hücresinden ışın geçer, başka yerde zemine çarpar', () => {
    const physics = new PhysicsWorld();
    const source = flatSource();
    const colliders = new ChunkColliders(physics, source, 1000, holes);
    colliders.ensureAround(0, 0);
    expect(colliders.count).toBe(1);
    const blocks = (128 / CHUNK.holeBlockCells) ** 2;
    expect(physics.world.colliders.len()).toBe(blocks);

    const cell = source.cell;
    const cx = source.origin.x + (HOLE.c + 0.5) * cell;
    const cz = source.origin.z + (HOLE.r + 0.5) * cell;
    expect(hitDown(physics, cx, cz)).toBe(false);
    expect(hitDown(physics, cx + cell, cz)).toBe(true); // aynı blok, delik dışı (trimesh)
    expect(hitDown(physics, cx + 40 * cell, cz + 40 * cell)).toBe(true); // heightfield blok
    // Blok sınırı (iki heightfield bloğunun ortak kenarı) boşluksuz.
    const edge = source.origin.x + CHUNK.holeBlockCells * 5 * cell + 0.01;
    expect(hitDown(physics, edge, cz + 40 * cell)).toBe(true);

    colliders.dispose();
    expect(physics.world.colliders.len()).toBe(0);
    physics.dispose();
  });

  it('deliksiz chunk tek heightfield collider kalır', () => {
    const physics = new PhysicsWorld();
    const colliders = new ChunkColliders(physics, flatSource(), 1000, null);
    colliders.ensureAround(0, 0);
    expect(physics.world.colliders.len()).toBe(1);
    colliders.dispose();
    physics.dispose();
  });
});
