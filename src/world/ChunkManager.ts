import { BufferAttribute, BufferGeometry, Group, Mesh, type Material } from 'three';
import { CHUNK } from '../config';
import { buildChunkMesh } from './chunkGeometry';
import { chunkGridFor, chunkKey, distanceToChunk, lodForDistance, type ChunkGrid } from './chunks';
import type { RegionHeightSource } from './RegionHeightSource';
import type { TerrainHoles } from './roadTunnels';

export interface ChunkManagerOptions {
  /** Bu uzaklıktan (oyun m) yakın chunk'lar yüklenir; ötesi boşaltılır. */
  viewDistance?: number;
  /** Bir `update` çağrısında kurulabilecek en fazla chunk (mesh) sayısı. */
  maxBuildsPerFrame?: number;
  /** Tünel ağzı delikleri (yakın LOD'larda mesh'ten çıkarılır). */
  holes?: TerrainHoles | null;
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
  private readonly holes: TerrainHoles | null;
  /** LOD geçiş uzaklıkları (oyun m); `setLodScale` ile `CHUNK.lodDistances` çarpanıyla yeniden hesaplanır. */
  private lodThresholds: readonly number[] = CHUNK.lodDistances;

  constructor(
    private readonly source: RegionHeightSource,
    private readonly material: Material,
    options: ChunkManagerOptions = {},
  ) {
    this.grid = chunkGridFor(source);
    this.viewDistance = options.viewDistance ?? CHUNK.viewDistance;
    this.maxBuilds = options.maxBuildsPerFrame ?? CHUNK.maxBuildsPerFrame;
    this.holes = options.holes ?? null;
    this.group.name = 'terrain-chunks';
  }

  /**
   * LOD geçiş uzaklıklarını `CHUNK.lodDistances × scale` yapar (grafik kalitesi; < 1 = kabalar daha erken).
   * Chunk'lar bir sonraki `update`te yeni eşiklere göre kendiliğinden yeniden kurulur.
   */
  setLodScale(scale: number): void {
    this.lodThresholds = CHUNK.lodDistances.map((distance) => distance * scale);
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  /** Chunk'ın mevcut LOD'u; yüklü değilse undefined. */
  lodOf(cx: number, cy: number): number | undefined {
    return this.chunks.get(chunkKey(cx, cy))?.lod;
  }

  /**
   * Odak noktası (oyuncu X/Z) çevresindeki chunk'ları günceller. `maxBuilds` ile bu çağrının
   * bütçesi değiştirilebilir (Infinity = hepsini hemen kur; başlangıç yüklemesi için).
   */
  update(focusX: number, focusZ: number, maxBuilds: number = this.maxBuilds): ChunkUpdateStats {
    const work: Array<{ cx: number; cy: number; lod: number; distance: number }> = [];
    let removed = 0;

    const { cx0, cy0, cols, rows } = this.grid;
    for (let cy = cy0; cy < cy0 + rows; cy++) {
      for (let cx = cx0; cx < cx0 + cols; cx++) {
        const key = chunkKey(cx, cy);
        const entry = this.chunks.get(key);
        const distance = distanceToChunk(this.grid, cx, cy, focusX, focusZ);

        if (distance > this.viewDistance) {
          if (entry) {
            this.remove(key, entry);
            removed++;
          }
          continue;
        }

        const lod = lodForDistance(distance, entry?.lod ?? null, this.lodThresholds);
        if (!entry || entry.lod !== lod) work.push({ cx, cy, lod, distance });
      }
    }

    // En yakın chunk'lar önce kurulur.
    work.sort((a, b) => a.distance - b.distance);
    const batch = work.slice(0, maxBuilds);
    for (const item of batch) this.build(item.cx, item.cy, item.lod);

    return { built: batch.length, removed, pending: work.length - batch.length };
  }

  /** Tüm chunk'ları boşaltır ve kaynakları serbest bırakır. */
  dispose(): void {
    for (const [key, entry] of this.chunks) this.remove(key, entry);
    this.group.clear();
  }

  private build(cx: number, cy: number, lod: number): void {
    const key = chunkKey(cx, cy);
    const data = buildChunkMesh(this.source, this.grid, cx, cy, lod, this.holes);

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
