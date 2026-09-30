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
