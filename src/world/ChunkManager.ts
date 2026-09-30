import { BufferAttribute, BufferGeometry, Group, Mesh, type Material } from 'three';
import { CHUNK } from '../config';
import { buildChunkMesh } from './chunkGeometry';
import { chunkKey, distanceToChunk, lodForDistance, makeChunkGrid, type ChunkGrid } from './chunks';
import type { RegionHeightSource } from './RegionHeightSource';

export interface ChunkManagerOptions {
  /** Bu uzaklıktan (oyun m) yakın chunk'lar yüklenir; ötesi boşaltılır. */
  viewDistance?: number;
  /** Bir `update` çağrısında kurulabilecek en fazla chunk (mesh) sayısı. */
  maxBuildsPerFrame?: number;
}

export interface ChunkUpdateStats {
  /** Bu çağrıda (yeniden) kurulan chunk sayısı. */
  built: number;
  /** Bu çağrıda boşaltılan chunk sayısı. */
  removed: number;
  /** Hâlâ bekleyen (bütçe yüzünden ertelenen) chunk sayısı. */
  pending: number;
}

interface ChunkEntry {
  cx: number;
  cy: number;
  lod: number;
  mesh: Mesh<BufferGeometry, Material>;
}

/**
 * Arazi chunk'larını oyuncuya uzaklığa göre yükler, LOD'unu değiştirir ve boşaltır.
 * Karede en fazla `maxBuildsPerFrame` mesh kurulur (yakınlar önce): takılma olmasın.
 * Boşaltılan/yeniden kurulan her geometry `dispose()` edilir (kaynak temizliği kuralı).
 */
export class ChunkManager {
  readonly group = new Group();
  readonly grid: ChunkGrid;

  private readonly chunks = new Map<number, ChunkEntry>();
  private readonly viewDistance: number;
  private readonly maxBuilds: number;

  constructor(
    private readonly source: RegionHeightSource,
    private readonly material: Material,
    options: ChunkManagerOptions = {},
  ) {
    this.grid = makeChunkGrid(source.width, source.height, source.cell);
    this.viewDistance = options.viewDistance ?? CHUNK.viewDistance;
    this.maxBuilds = options.maxBuildsPerFrame ?? CHUNK.maxBuildsPerFrame;
    this.group.name = 'terrain-chunks';
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  /** Chunk'ın mevcut LOD'u; yüklü değilse undefined. */
  lodOf(cx: number, cy: number): number | undefined {
    return this.chunks.get(chunkKey(this.grid, cx, cy))?.lod;
  }

  /** Odak noktası (oyuncu X/Z) çevresindeki chunk'ları günceller. */
  update(focusX: number, focusZ: number): ChunkUpdateStats {
    const work: Array<{ cx: number; cy: number; lod: number; distance: number }> = [];
    let removed = 0;

    for (let cy = 0; cy < this.grid.rows; cy++) {
      for (let cx = 0; cx < this.grid.cols; cx++) {
        const key = chunkKey(this.grid, cx, cy);
        const entry = this.chunks.get(key);
        const distance = distanceToChunk(this.grid, cx, cy, focusX, focusZ);

        if (distance > this.viewDistance) {
          if (entry) {
            this.remove(key, entry);
            removed++;
          }
          continue;
        }

        const lod = lodForDistance(distance, entry?.lod ?? null);
        if (!entry || entry.lod !== lod) work.push({ cx, cy, lod, distance });
      }
    }

    // En yakın chunk'lar önce kurulur.
    work.sort((a, b) => a.distance - b.distance);
    const batch = work.slice(0, this.maxBuilds);
    for (const item of batch) this.build(item.cx, item.cy, item.lod);

    return { built: batch.length, removed, pending: work.length - batch.length };
  }

  /** Tüm chunk'ları boşaltır ve kaynakları serbest bırakır. */
  dispose(): void {
    for (const [key, entry] of this.chunks) this.remove(key, entry);
    this.group.clear();
  }

  private build(cx: number, cy: number, lod: number): void {
    const key = chunkKey(this.grid, cx, cy);
    const data = buildChunkMesh(this.source, this.grid, cx, cy, lod);

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
    geometry.setIndex(new BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere(); // frustum culling için
    geometry.computeBoundingBox();

    const existing = this.chunks.get(key);
    if (existing) {
      existing.mesh.geometry.dispose();
      existing.mesh.geometry = geometry;
      existing.lod = lod;
      return;
    }

    const mesh = new Mesh(geometry, this.material);
    mesh.name = `chunk-${cx}-${cy}`;
    this.group.add(mesh);
    this.chunks.set(key, { cx, cy, lod, mesh });
  }

  private remove(key: number, entry: ChunkEntry): void {
    this.group.remove(entry.mesh);
    entry.mesh.geometry.dispose(); // materyal paylaşımlıdır; sahip (World) dispose eder
    this.chunks.delete(key);
  }
}
