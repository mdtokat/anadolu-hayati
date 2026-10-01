import { CHUNK } from '../config';
import { createChunkHeightfieldDesc } from '../physics/heightfield';
import type { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import {
  chunkCol0,
  chunkGridFor,
  chunkKey,
  chunkRect,
  chunkRow0,
  distanceToChunk,
  type ChunkGrid,
} from './chunks';
import type { RegionHeightSource } from './RegionHeightSource';

/**
 * Oyuncuya yakın chunk'lar için tam çözünürlüklü Rapier heightfield collider'ları (mesh LOD'undan
 * bağımsız). Yaklaşırken karede en fazla `maxColliderBuildsPerFrame` kurulur, uzaklaşınca (histerezisle)
 * kaldırılır. Işınlanma/doğmada `ensureAround` hepsini senkron kurar: oyuncu boşluğa düşmesin.
 */
export class ChunkColliders {
  readonly grid: ChunkGrid;
  private readonly colliders = new Map<number, RAPIER.Collider>();

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly source: RegionHeightSource,
    private readonly radius: number = CHUNK.physicsRadius,
  ) {
    this.grid = chunkGridFor(source);
  }

  get count(): number {
    return this.colliders.size;
  }

  has(cx: number, cy: number): boolean {
    return this.colliders.has(chunkKey(cx, cy));
  }

  /** `radius` içindeki tüm collider'ları hemen kurar (ışınlanma / ilk doğma). */
  ensureAround(x: number, z: number): void {
    for (const { cx, cy } of this.wanted(x, z)) this.add(cx, cy);
    this.removeFar(x, z);
  }

  /** Yaklaşan chunk'ların collider'ını (bütçeyle) kurar, uzaklaşanları kaldırır. */
  update(x: number, z: number): { added: number; removed: number } {
    const removed = this.removeFar(x, z);
    let added = 0;
    for (const { cx, cy } of this.wanted(x, z)) {
      if (added >= CHUNK.maxColliderBuildsPerFrame) break;
      if (this.add(cx, cy)) added++;
    }
    return { added, removed };
  }

  dispose(): void {
    for (const collider of this.colliders.values()) this.physics.removeCollider(collider);
    this.colliders.clear();
  }

  /** Henüz olmayan ve yarıçap içindeki chunk'lar, en yakın önce. */
  private wanted(x: number, z: number): Array<{ cx: number; cy: number; distance: number }> {
    const list: Array<{ cx: number; cy: number; distance: number }> = [];
    const { cx0, cy0, cols, rows } = this.grid;
    for (let cy = cy0; cy < cy0 + rows; cy++) {
      for (let cx = cx0; cx < cx0 + cols; cx++) {
        const distance = distanceToChunk(this.grid, cx, cy, x, z);
        if (distance <= this.radius && !this.has(cx, cy)) list.push({ cx, cy, distance });
      }
    }
    return list.sort((a, b) => a.distance - b.distance);
  }

  private removeFar(x: number, z: number): number {
    let removed = 0;
    const limit = this.radius * CHUNK.physicsRemoveFactor;
    const { cx0, cy0, cols, rows } = this.grid;
    for (let cy = cy0; cy < cy0 + rows; cy++) {
      for (let cx = cx0; cx < cx0 + cols; cx++) {
        const key = chunkKey(cx, cy);
        const collider = this.colliders.get(key);
        if (collider && distanceToChunk(this.grid, cx, cy, x, z) > limit) {
          this.physics.removeCollider(collider);
          this.colliders.delete(key);
          removed++;
        }
      }
    }
    return removed;
  }

  private add(cx: number, cy: number): boolean {
    const key = chunkKey(cx, cy);
    if (this.colliders.has(key)) return false;

    const { cells } = this.grid;
    const col0 = chunkCol0(this.grid, cx);
    const row0 = chunkRow0(this.grid, cy);
    const n = cells + 1;
    const heights = new Float32Array(n * n);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        heights[r * n + c] = this.source.sample(col0 + c, row0 + r);
      }
    }
    const size = cells * this.grid.cellSize;
    const rect = chunkRect(this.grid, cx, cy);
    const centerX = (rect.minX + rect.maxX) / 2;
    const centerZ = (rect.minZ + rect.maxZ) / 2;
    this.colliders.set(
      key,
      this.physics.addStaticCollider(
        createChunkHeightfieldDesc(heights, cells, size, centerX, centerZ),
      ),
    );
    return true;
  }
}
