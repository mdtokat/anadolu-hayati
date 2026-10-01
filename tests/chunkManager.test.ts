import { beforeAll, describe, expect, it } from 'vitest';
import { MeshBasicMaterial } from 'three';
import { CHUNK } from '../src/config';
import { ChunkManager } from '../src/world/ChunkManager';
import { chunkIndexAt, distanceToChunk } from '../src/world/chunks';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealRegion } from './helpers/realRegion';

let source: RegionHeightSource;

beforeAll(async () => {
  source = RegionHeightSource.fromRegion(await loadRealRegion());
});

function makeManager(options = {}) {
  return new ChunkManager(source, new MeshBasicMaterial(), options);
}

/** Bütçe bitene kadar (bekleyen kalmayana kadar) güncelle. */
function settle(manager: ChunkManager, x: number, z: number): number {
  let rounds = 0;
  for (; rounds < 500; rounds++) {
    if (manager.update(x, z).pending === 0 && manager.update(x, z).built === 0) break;
  }
  return rounds;
}

describe('ChunkManager', () => {
  it('karede en fazla maxBuildsPerFrame chunk kurar', () => {
    const manager = makeManager({ maxBuildsPerFrame: 2 });
    const stats = manager.update(0, 0);
    expect(stats.built).toBe(2);
    expect(stats.pending).toBeGreaterThan(0);
    expect(manager.chunkCount).toBe(2);
    manager.dispose();
  });

  it("yakın chunk'lar önce kurulur", () => {
    const manager = makeManager({ maxBuildsPerFrame: 1 });
    manager.update(0, 0);
    const own = chunkIndexAt(manager.grid, 0, 0);
    expect(manager.lodOf(own.cx, own.cy)).toBe(0);
    manager.dispose();
  });

  it("yeterince güncellenince viewDistance içindeki tüm chunk'lar yüklenir", () => {
    const manager = makeManager({ maxBuildsPerFrame: 40 });
    settle(manager, 0, 0);
    expect(manager.chunkCount).toBe(manager.grid.cols * manager.grid.rows);
    manager.dispose();
  });

  it('LOD uzaklığa göre atanır: yakın 0, uzak 3', () => {
    const manager = makeManager({ maxBuildsPerFrame: 200 });
    settle(manager, 0, 0);
    const own = chunkIndexAt(manager.grid, 0, 0);
    expect(manager.lodOf(own.cx, own.cy)).toBe(0);
    for (let cy = manager.grid.cy0; cy < manager.grid.cy0 + manager.grid.rows; cy++) {
      for (let cx = manager.grid.cx0; cx < manager.grid.cx0 + manager.grid.cols; cx++) {
        const d = distanceToChunk(manager.grid, cx, cy, 0, 0);
        const lod = manager.lodOf(cx, cy) as number;
        if (d < CHUNK.lodDistances[0] * (1 - CHUNK.lodHysteresis)) expect(lod).toBe(0);
        if (d > CHUNK.lodDistances[2] * (1 + CHUNK.lodHysteresis)) expect(lod).toBe(3);
      }
    }
    manager.dispose();
  });

  it("odak hareket edince LOD'lar yeniden atanır", () => {
    const manager = makeManager({ maxBuildsPerFrame: 200 });
    settle(manager, 0, 0);
    const far = { x: 1200, z: 800 };
    const idx = chunkIndexAt(manager.grid, far.x, far.z);
    expect(manager.lodOf(idx.cx, idx.cy)).toBeGreaterThan(0);
    settle(manager, far.x, far.z);
    expect(manager.lodOf(idx.cx, idx.cy)).toBe(0);
    manager.dispose();
  });

  it("viewDistance dışındaki chunk'lar boşaltılır ve geometry dispose edilir", () => {
    const manager = makeManager({ maxBuildsPerFrame: 200, viewDistance: 300 });
    settle(manager, 0, 0);
    const loaded = manager.chunkCount;
    expect(loaded).toBeGreaterThan(0);
    expect(loaded).toBeLessThan(manager.grid.cols * manager.grid.rows);

    let disposed = 0;
    for (const mesh of manager.group.children) {
      (
        mesh as unknown as { geometry: { addEventListener: (t: string, f: () => void) => void } }
      ).geometry.addEventListener('dispose', () => disposed++);
    }
    // Çok uzağa taşın: eskiler boşalır, yenileri gelir
    const stats = manager.update(1400, 1000);
    expect(stats.removed).toBeGreaterThan(0);
    expect(disposed).toBe(stats.removed);
    manager.dispose();
  });

  it('LOD değişiminde eski geometry dispose edilir', () => {
    const manager = makeManager({ maxBuildsPerFrame: 200 });
    settle(manager, 0, 0);
    let disposed = 0;
    for (const mesh of manager.group.children) {
      (
        mesh as unknown as { geometry: { addEventListener: (t: string, f: () => void) => void } }
      ).geometry.addEventListener('dispose', () => disposed++);
    }
    const stats = manager.update(1200, 800);
    expect(stats.built).toBeGreaterThan(0);
    expect(disposed).toBeGreaterThan(0);
    manager.dispose();
  });

  it("dispose tüm chunk'ları kaldırır", () => {
    const manager = makeManager({ maxBuildsPerFrame: 200 });
    settle(manager, 0, 0);
    manager.dispose();
    expect(manager.chunkCount).toBe(0);
    expect(manager.group.children).toHaveLength(0);
  });

  it('tekrarlayan update aynı konumda iş üretmez (kararlı)', () => {
    const manager = makeManager({ maxBuildsPerFrame: 200 });
    settle(manager, 0, 0);
    const stats = manager.update(0, 0);
    expect(stats).toEqual({ built: 0, removed: 0, pending: 0 });
    manager.dispose();
  });

  it('mesh geometrisi sınır küresine sahiptir (frustum culling)', () => {
    const manager = makeManager({ maxBuildsPerFrame: 3 });
    manager.update(0, 0);
    for (const child of manager.group.children) {
      const mesh = child as unknown as { geometry: { boundingSphere: { radius: number } | null } };
      expect(mesh.geometry.boundingSphere?.radius).toBeGreaterThan(100);
    }
    manager.dispose();
  });
});

describe('ChunkManager.setLodScale', () => {
  it("LOD eşiklerini çarpanla küçültür: aynı konumda daha kaba LOD'lar çıkar", () => {
    const full = makeManager({ maxBuildsPerFrame: 40 });
    settle(full, 0, 0);
    const scaled = makeManager({ maxBuildsPerFrame: 40 });
    scaled.setLodScale(0.5);
    settle(scaled, 0, 0);

    let fullLodSum = 0;
    let scaledLodSum = 0;
    for (let cy = full.grid.cy0; cy < full.grid.cy0 + full.grid.rows; cy++) {
      for (let cx = full.grid.cx0; cx < full.grid.cx0 + full.grid.cols; cx++) {
        fullLodSum += full.lodOf(cx, cy) ?? 0;
        scaledLodSum += scaled.lodOf(cx, cy) ?? 0;
      }
    }
    expect(scaledLodSum).toBeGreaterThan(fullLodSum);
    full.dispose();
    scaled.dispose();
  });

  it("çarpan çalışma sırasında değişince yüklü chunk'lar yeniden kurulur", () => {
    const manager = makeManager({ maxBuildsPerFrame: 40 });
    settle(manager, 0, 0);
    // Odaktan ~300–600 m uzakta bir chunk: normalde LOD ≥ 1 ama eşikler küçülünce LOD3'e iner.
    const own = chunkIndexAt(manager.grid, 0, 0);
    const far = { cx: own.cx + 2, cy: own.cy };
    expect(distanceToChunk(manager.grid, far.cx, far.cy, 0, 0)).toBeGreaterThan(100);
    const normal = manager.lodOf(far.cx, far.cy) as number;

    manager.setLodScale(0.001);
    settle(manager, 0, 0);
    expect(manager.lodOf(far.cx, far.cy)).toBe(CHUNK.lodDistances.length);

    manager.setLodScale(1);
    settle(manager, 0, 0);
    expect(manager.lodOf(far.cx, far.cy)).toBe(normal);
    manager.dispose();
  });
});
