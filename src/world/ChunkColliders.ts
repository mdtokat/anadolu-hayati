import { CHUNK } from '../config';
import type { FrameBudget } from '../core/FrameBudget';
import { createChunkHeightfieldDesc, createChunkTrimeshDesc } from '../physics/heightfield';
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
import type { TerrainHoles } from './roadTunnels';

/**
 * Oyuncuya yakın chunk'lar için tam çözünürlüklü Rapier heightfield collider'ları (mesh LOD'undan
 * bağımsız). Yaklaşırken karede en fazla `maxColliderBuildsPerFrame` kurulur, uzaklaşınca (histerezisle)
 * kaldırılır. Işınlanma/doğmada `ensureAround` hepsini senkron kurar: oyuncu boşluğa düşmesin.
 */
export class ChunkColliders {
  readonly grid: ChunkGrid;
  /** Chunk başına collider(lar): deliksiz chunk tek heightfield, delikli chunk blok başına bir collider. */
  private readonly colliders = new Map<number, RAPIER.Collider[]>();

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly source: RegionHeightSource,
    private readonly radius: number = CHUNK.physicsRadius,
    /** Tünel ağzı delikleri: delikli chunk heightfield yerine deliksiz üçgen ağıyla (trimesh) çarpışır. */
    private readonly holes: TerrainHoles | null = null,
  ) {
    this.grid = chunkGridFor(source);
  }

  /** Collider'ı olan chunk sayısı. */
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

  /**
   * Yaklaşan chunk'ların collider'ını (bütçeyle) kurar, uzaklaşanları kaldırır. `budget`: kare zaman bütçesi (en
   * yakındaki ilk collider her durumda kurulur).
   */
  update(
    x: number,
    z: number,
    budget: FrameBudget | null = null,
  ): { added: number; removed: number } {
    const removed = this.removeFar(x, z);
    let added = 0;
    for (const { cx, cy } of this.wanted(x, z)) {
      if (added >= CHUNK.maxColliderBuildsPerFrame) break;
      if (budget !== null && !budget.allows(added)) break;
      if (this.add(cx, cy)) added++;
    }
    return { added, removed };
  }

  dispose(): void {
    for (const list of this.colliders.values()) {
      for (const collider of list) this.physics.removeCollider(collider);
    }
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
        const list = this.colliders.get(key);
        if (list && distanceToChunk(this.grid, cx, cy, x, z) > limit) {
          for (const collider of list) this.physics.removeCollider(collider);
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
    const holes = this.holes;
    if (!holes || !holes.any(col0, row0, col0 + cells, row0 + cells)) {
      const size = cells * this.grid.cellSize;
      const rect = chunkRect(this.grid, cx, cy);
      const centerX = (rect.minX + rect.maxX) / 2;
      const centerZ = (rect.minZ + rect.maxZ) / 2;
      const desc = createChunkHeightfieldDesc(heights, cells, size, centerX, centerZ);
      this.colliders.set(key, [this.physics.addStaticCollider(desc)]);
      return true;
    }
    this.colliders.set(key, this.addHoledBlocks(heights, cx, cy, holes));
    return true;
  }

  /**
   * Delikli chunk: `CHUNK.holeBlockCells` hücrelik bloklar; delik içeren blok trimesh, diğerleri heightfield. Komşu
   * bloklar sınır örneklerini paylaşır (aynı yükseklikler), dikiş yoktur.
   */
  private addHoledBlocks(
    heights: Float32Array,
    cx: number,
    cy: number,
    holes: TerrainHoles,
  ): RAPIER.Collider[] {
    const { cells, cellSize } = this.grid;
    const n = cells + 1;
    const block = CHUNK.holeBlockCells;
    const bn = block + 1;
    const col0 = chunkCol0(this.grid, cx);
    const row0 = chunkRow0(this.grid, cy);
    const rect = chunkRect(this.grid, cx, cy);
    const out: RAPIER.Collider[] = [];
    const sub = new Float32Array(bn * bn);
    for (let br = 0; br < cells; br += block) {
      for (let bc = 0; bc < cells; bc += block) {
        for (let r = 0; r < bn; r++) {
          for (let c = 0; c < bn; c++) sub[r * bn + c] = heights[(br + r) * n + bc + c] as number;
        }
        const minX = rect.minX + bc * cellSize;
        const minZ = rect.minZ + br * cellSize;
        const c0 = col0 + bc;
        const r0 = row0 + br;
        const desc = holes.any(c0, r0, c0 + block, r0 + block)
          ? createChunkTrimeshDesc(sub, block, minX, minZ, cellSize, (c, r) =>
              holes.has(c0 + c, r0 + r),
            )
          : createChunkHeightfieldDesc(
              sub,
              block,
              block * cellSize,
              minX + (block * cellSize) / 2,
              minZ + (block * cellSize) / 2,
            );
        out.push(this.physics.addStaticCollider(desc));
      }
    }
    return out;
  }
}
