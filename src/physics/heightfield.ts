import { RAPIER } from './PhysicsWorld';
import { gridCells, gridVertices, type GridSpec } from '../world/HeightSource';

/**
 * Satır satır (row-major) yükseklik dizisini Rapier'in beklediği sütun-öncelikli (column-major)
 * dizilime çevirir. Rapier'de satırlar Z, sütunlar X boyunca ilerler.
 */
export function toColumnMajor(heights: Float32Array, vertices: number): Float32Array {
  const out = new Float32Array(heights.length);
  for (let r = 0; r < vertices; r++) {
    for (let c = 0; c < vertices; c++) {
      out[c * vertices + r] = heights[r * vertices + c] as number;
    }
  }
  return out;
}

/** Izgaradan Rapier heightfield collider tanımı üretir (orijin merkezli, y = yükseklik). */
export function createHeightfieldDesc(heights: Float32Array, grid: GridSpec): RAPIER.ColliderDesc {
  const cells = gridCells(grid);
  return RAPIER.ColliderDesc.heightfield(
    // Rapier hücre (altbölüm) sayısı bekler; yükseklik dizisi (cells + 1)² uzunluktadır.
    cells,
    cells,
    toColumnMajor(heights, gridVertices(grid)),
    // Ölçek: heightfield'ın toplam kapladığı boyut (x, yükseklik çarpanı, z).
    { x: grid.size, y: 1, z: grid.size },
  );
}

/**
 * Tek bir chunk için Rapier heightfield tanımı. `heights` satır satır (cells + 1)² köşe;
 * `size` chunk kenar uzunluğu (oyun m), (centerX, centerZ) chunk merkezidir.
 */
export function createChunkHeightfieldDesc(
  heights: Float32Array,
  cells: number,
  size: number,
  centerX: number,
  centerZ: number,
): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.heightfield(cells, cells, toColumnMajor(heights, cells + 1), {
    x: size,
    y: 1,
    z: size,
  }).setTranslation(centerX, 0, centerZ);
}

/**
 * Delikli chunk için üçgen ağı (trimesh) collider tanımı: `heights` satır satır (cells + 1)² köşe, (minX, minZ) chunk'ın
 * kuzeybatı köşe örneği, `cell` örnek aralığı. `hole(c, r)` doğru olan hücrelerin üçgenleri atlanır (tünel ağzı).
 */
export function createChunkTrimeshDesc(
  heights: Float32Array,
  cells: number,
  minX: number,
  minZ: number,
  cell: number,
  hole: (col: number, row: number) => boolean,
): RAPIER.ColliderDesc {
  const n = cells + 1;
  const vertices = new Float32Array(n * n * 3);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = (r * n + c) * 3;
      vertices[i] = minX + c * cell;
      vertices[i + 1] = heights[r * n + c] as number;
      vertices[i + 2] = minZ + r * cell;
    }
  }
  const indices = new Uint32Array(cells * cells * 6);
  let k = 0;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (hole(c, r)) continue;
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
  return RAPIER.ColliderDesc.trimesh(
    vertices,
    indices.slice(0, k),
    RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
  );
}
