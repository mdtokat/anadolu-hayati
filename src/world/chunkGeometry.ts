import { CHUNK } from '../config';
import { chunkCol0, chunkRow0, sampleX, sampleZ, type ChunkGrid } from './chunks';
import type { RegionHeightSource } from './RegionHeightSource';
import type { TerrainHoles } from './roadTunnels';

/** Bu LOD'a kadar (dahil) tünel ağzı delikleri mesh'ten çıkarılır; uzakta ağız cephesi yeterlidir. */
const HOLE_MAX_LOD = 1;

/** Three.js'e bağımlı olmayan chunk geometrisi (typed array'ler). */
export interface ChunkMeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
  /** Yüzey köşe sayısı (etek köşeleri hariç). */
  surfaceVertices: number;
  /** Kenardaki köşe sayısı (n): (cells / stride) + 1. */
  verticesPerSide: number;
}

/**
 * Chunk (cx, cy) için LOD `lod` geometrisi. Köşeler her `stride` örnekte bir alınır; konumlar
 * mutlak dünya koordinatlarıdır (mesh orijinde durur). Normaller LOD'un kendi adımıyla,
 * global heightmap'ten (chunk sınırlarını aşarak) merkezi farkla hesaplanır: komşu chunk'larda
 * ışık kesintisi olmaz. Dört kenara aşağı sarkan "etek" eklenir (LOD komşuluğundaki çatlakları kapatır).
 */
export function buildChunkMesh(
  source: RegionHeightSource,
  grid: ChunkGrid,
  cx: number,
  cy: number,
  lod: number,
  /** Tünel ağzı delikleri: bu hücrelerin (LOD 0–1) üçgenleri çizilmez. */
  holes: TerrainHoles | null = null,
): ChunkMeshData {
  const stride = CHUNK.lodStrides[lod];
  const skirt = CHUNK.skirtDepth[lod];
  if (stride === undefined || skirt === undefined) throw new RangeError(`geçersiz LOD: ${lod}`);

  const n = grid.cells / stride + 1;
  const surfaceVertices = n * n;
  const total = surfaceVertices + 4 * n;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);

  const col0 = chunkCol0(grid, cx);
  const row0 = chunkRow0(grid, cy);
  const step = stride * grid.cellSize;

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const col = col0 + c * stride;
      const row = row0 + r * stride;
      const i = (r * n + c) * 3;

      positions[i] = sampleX(grid, col);
      positions[i + 1] = source.sample(col, row);
      positions[i + 2] = sampleZ(grid, row);

      // Normal = (−dh/dx, 1, −dh/dz), normalize.
      const dhdx =
        (source.sample(col + stride, row) - source.sample(col - stride, row)) / (2 * step);
      const dhdz =
        (source.sample(col, row + stride) - source.sample(col, row - stride)) / (2 * step);
      const len = Math.hypot(dhdx, 1, dhdz);
      normals[i] = -dhdx / len;
      normals[i + 1] = 1 / len;
      normals[i + 2] = -dhdz / len;
    }
  }

  const surfaceQuads = (n - 1) * (n - 1);
  const indices = new Uint16Array(surfaceQuads * 6 + 4 * (n - 1) * 6);
  let k = 0;

  // Yüzey: her hücre iki üçgen, +Y'ye bakacak (saat yönünün tersi) sarım. Yakın LOD'larda tünel ağzı delik kalır.
  const cut =
    holes !== null &&
    lod <= HOLE_MAX_LOD &&
    holes.any(col0, row0, col0 + grid.cells, row0 + grid.cells);
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      if (
        cut &&
        holes.any(
          col0 + c * stride,
          row0 + r * stride,
          col0 + (c + 1) * stride,
          row0 + (r + 1) * stride,
        )
      ) {
        continue;
      }
      const a = r * n + c;
      const b = (r + 1) * n + c;
      const d = r * n + c + 1;
      const e = (r + 1) * n + c + 1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = d;
      indices[k++] = b;
      indices[k++] = e;
    }
  }

  // Etekler: kenar köşelerinin kopyaları (y − derinlik); normal kenarla aynı (koyu şerit olmasın).
  const edges: number[][] = [
    Array.from({ length: n }, (_, c) => c), // kuzey (r = 0)
    Array.from({ length: n }, (_, c) => (n - 1) * n + c), // güney
    Array.from({ length: n }, (_, r) => r * n), // batı (c = 0)
    Array.from({ length: n }, (_, r) => r * n + (n - 1)), // doğu
  ];
  let next = surfaceVertices;
  for (const [edgeIndex, edge] of edges.entries()) {
    const base = next;
    for (const vertex of edge) {
      const i = vertex * 3;
      const o = next * 3;
      positions[o] = positions[i] as number;
      positions[o + 1] = (positions[i + 1] as number) - skirt;
      positions[o + 2] = positions[i + 2] as number;
      normals[o] = normals[i] as number;
      normals[o + 1] = normals[i + 1] as number;
      normals[o + 2] = normals[i + 2] as number;
      next++;
    }
    // Sarım yönü kenara göre; malzeme çift yüzlü olduğundan görünürlük etkilenmez.
    const flip = edgeIndex === 0 || edgeIndex === 3;
    for (let s = 0; s < n - 1; s++) {
      const top0 = edge[s] as number;
      const top1 = edge[s + 1] as number;
      const low0 = base + s;
      const low1 = base + s + 1;
      if (flip) {
        indices[k++] = top0;
        indices[k++] = low0;
        indices[k++] = top1;
        indices[k++] = top1;
        indices[k++] = low0;
        indices[k++] = low1;
      } else {
        indices[k++] = top0;
        indices[k++] = top1;
        indices[k++] = low0;
        indices[k++] = top1;
        indices[k++] = low1;
        indices[k++] = low0;
      }
    }
  }

  return {
    positions,
    normals,
    indices: k < indices.length ? indices.slice(0, k) : indices,
    surfaceVertices,
    verticesPerSide: n,
  };
}
