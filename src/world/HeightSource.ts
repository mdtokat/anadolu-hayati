/** Dünya X/Z konumundan arazi yüksekliği (oyun metresi, y) veren kaynak. */
export interface HeightSource {
  heightAt(x: number, z: number): number;
}

/**
 * Orijin merkezli kare ızgara tanımı. Satır r → z = −size/2 + r·cellSize,
 * sütun c → x = −size/2 + c·cellSize (Three.js: −Z kuzey, +X doğu).
 */
export interface GridSpec {
  /** Kenar uzunluğu (oyun metresi). */
  size: number;
  /** Hücre boyu (oyun metresi). */
  cellSize: number;
}

/** Bir kenardaki hücre sayısı. */
export function gridCells(grid: GridSpec): number {
  return Math.round(grid.size / grid.cellSize);
}

/** Bir kenardaki köşe (örnek) sayısı = hücre + 1. */
export function gridVertices(grid: GridSpec): number {
  return gridCells(grid) + 1;
}

/** Izgara satır/sütun indeksinin dünya koordinatı (x veya z). */
export function gridCoord(grid: GridSpec, index: number): number {
  return -grid.size / 2 + index * grid.cellSize;
}

/** Kaynağı ızgarada örnekler: satır satır (row-major) yükseklik dizisi. */
export function sampleGrid(source: HeightSource, grid: GridSpec): Float32Array {
  const n = gridVertices(grid);
  const heights = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    const z = gridCoord(grid, r);
    for (let c = 0; c < n; c++) {
      heights[r * n + c] = source.heightAt(gridCoord(grid, c), z);
    }
  }
  return heights;
}
