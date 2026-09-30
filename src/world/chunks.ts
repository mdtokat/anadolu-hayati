import { CHUNK } from '../config';

/** Bölge ızgarasının chunk'lara bölünmesi. Chunk (cx, cy), örnek sütunları [cx·N, (cx+1)·N] kapsar. */
export interface ChunkGrid {
  /** Chunk sütun/satır sayısı. */
  cols: number;
  rows: number;
  /** Chunk kenarındaki hücre sayısı (N). */
  cells: number;
  /** Örnek (köşe) sayısı ve hücre boyu (oyun m). */
  sampleWidth: number;
  sampleHeight: number;
  cellSize: number;
}

export interface ChunkIndex {
  cx: number;
  cy: number;
}

/** Chunk'ın dünya (X/Z) kapsamı. */
export interface ChunkRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function makeChunkGrid(
  sampleWidth: number,
  sampleHeight: number,
  cellSize: number,
  cells: number = CHUNK.cells,
): ChunkGrid {
  return {
    // Son chunk kısmi olabilir (örnekler kenara sıkıştırılır): yukarı yuvarla.
    cols: Math.ceil((sampleWidth - 1) / cells),
    rows: Math.ceil((sampleHeight - 1) / cells),
    cells,
    sampleWidth,
    sampleHeight,
    cellSize,
  };
}

/** Sütun c → dünya X (orijin merkezli, simetrik). */
export function sampleX(grid: ChunkGrid, col: number): number {
  return (col - (grid.sampleWidth - 1) / 2) * grid.cellSize;
}

/** Satır r → dünya Z. */
export function sampleZ(grid: ChunkGrid, row: number): number {
  return (row - (grid.sampleHeight - 1) / 2) * grid.cellSize;
}

/** Tekil sayı anahtarı (Map için). */
export function chunkKey(grid: ChunkGrid, cx: number, cy: number): number {
  return cy * grid.cols + cx;
}

export function chunkRect(grid: ChunkGrid, cx: number, cy: number): ChunkRect {
  return {
    minX: sampleX(grid, cx * grid.cells),
    maxX: sampleX(grid, (cx + 1) * grid.cells),
    minZ: sampleZ(grid, cy * grid.cells),
    maxZ: sampleZ(grid, (cy + 1) * grid.cells),
  };
}

/** Dünya konumunu içeren chunk (kapsam dışıysa en yakın kenar chunk'ı). */
export function chunkIndexAt(grid: ChunkGrid, x: number, z: number): ChunkIndex {
  const col = x / grid.cellSize + (grid.sampleWidth - 1) / 2;
  const row = z / grid.cellSize + (grid.sampleHeight - 1) / 2;
  return {
    cx: Math.min(Math.max(Math.floor(col / grid.cells), 0), grid.cols - 1),
    cy: Math.min(Math.max(Math.floor(row / grid.cells), 0), grid.rows - 1),
  };
}

/** Noktanın chunk dikdörtgenine uzaklığı (içindeyse 0). */
export function distanceToChunk(
  grid: ChunkGrid,
  cx: number,
  cy: number,
  x: number,
  z: number,
): number {
  const r = chunkRect(grid, cx, cy);
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

/** Noktaya `radius` içindeki tüm chunk'lar. */
export function chunksWithin(grid: ChunkGrid, x: number, z: number, radius: number): ChunkIndex[] {
  const result: ChunkIndex[] = [];
  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      if (distanceToChunk(grid, cx, cy, x, z) <= radius) result.push({ cx, cy });
    }
  }
  return result;
}

/**
 * Uzaklığa göre LOD (0 = en ayrıntılı). `current` verilirse histerezis uygulanır:
 * daha kaba LOD'a eşiğin (1 + h) katından sonra, daha ince LOD'a (1 − h) katından önce geçilir;
 * böylece eşik civarında LOD sürekli değişmez.
 */
export function lodForDistance(
  distance: number,
  current: number | null = null,
  thresholds: readonly number[] = CHUNK.lodDistances,
  hysteresis: number = CHUNK.lodHysteresis,
): number {
  if (current === null) {
    let lod = 0;
    while (lod < thresholds.length && distance >= (thresholds[lod] as number)) lod++;
    return lod;
  }

  let lod = current;
  while (lod > 0 && distance < (thresholds[lod - 1] as number) * (1 - hysteresis)) lod--;
  while (lod < thresholds.length && distance > (thresholds[lod] as number) * (1 + hysteresis))
    lod++;
  return lod;
}
