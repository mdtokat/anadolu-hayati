import { CHUNK } from '../config';
import { absoluteChunkKey } from './chunkKeys';
import { latticeChunkOffset } from './lattice';

/**
 * Dünya örnek dizisinin chunk'lara bölünmesi. Dizinin `(0, 0)` örneği `origin`'dedir (`RegionMeta.gridOrigin`);
 * chunk `(cx, cy)` dizi sütunları `[(cx − cx0)·N, (cx − cx0 + 1)·N]` aralığını kapsar. Dizi kafese chunk hizalıysa
 * (gerçek veri) `cx0/cy0` ilk chunk'ın **kafes** indeksidir (negatif olabilir; docs/faz-7-paralel-plan.md §3.1),
 * böylece `(cx, cy)` dünya kapsamı büyüse de aynı yeri gösterir; değilse (sentetik test ızgarası) 0'dır.
 */
export interface ChunkGrid {
  /** İlk chunk'ın indeksi; geçerli aralık `cx0 … cx0 + cols − 1` (satır benzer). */
  cx0: number;
  cy0: number;
  /** Chunk sütun/satır sayısı. */
  cols: number;
  rows: number;
  /** Chunk kenarındaki hücre sayısı (N). */
  cells: number;
  /** Örnek (köşe) sayısı ve hücre boyu (oyun m). */
  sampleWidth: number;
  sampleHeight: number;
  cellSize: number;
  /** Dizinin (0, 0) örneğinin konumu (oyun m). */
  originX: number;
  originZ: number;
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

/** Orijin merkezli dizinin (eski bölge biçimi) (0, 0) örneği. */
export function centeredOrigin(
  sampleWidth: number,
  sampleHeight: number,
  cellSize: number,
): { x: number; z: number } {
  return { x: (-(sampleWidth - 1) / 2) * cellSize, z: (-(sampleHeight - 1) / 2) * cellSize };
}

export function makeChunkGrid(
  sampleWidth: number,
  sampleHeight: number,
  cellSize: number,
  origin: { x: number; z: number } = centeredOrigin(sampleWidth, sampleHeight, cellSize),
  cells: number = CHUNK.cells,
): ChunkGrid {
  const offset = cells === CHUNK.cells ? latticeChunkOffset(origin.x, origin.z, cellSize) : null;
  return {
    cx0: offset?.cx ?? 0,
    cy0: offset?.cy ?? 0,
    // Son chunk kısmi olabilir (örnekler kenara sıkıştırılır): yukarı yuvarla.
    cols: Math.ceil((sampleWidth - 1) / cells),
    rows: Math.ceil((sampleHeight - 1) / cells),
    cells,
    sampleWidth,
    sampleHeight,
    cellSize,
    originX: origin.x,
    originZ: origin.z,
  };
}

/** Yükseklik kaynağının (`RegionHeightSource`) ızgarası. */
export function chunkGridFor(source: {
  width: number;
  height: number;
  cell: number;
  origin: { x: number; z: number };
}): ChunkGrid {
  return makeChunkGrid(source.width, source.height, source.cell, source.origin);
}

/** Chunk `(0, 0)`'ın kuzeybatı köşesi (oyun m): doğma hücresi ızgarası bunu paylaşır (hücre ≡ chunk). */
export function chunkAnchor(grid: ChunkGrid): { x: number; z: number } {
  const size = grid.cells * grid.cellSize;
  return { x: grid.originX - grid.cx0 * size, z: grid.originZ - grid.cy0 * size };
}

/** Chunk ızgaranın içinde mi? */
export function inChunkGrid(grid: ChunkGrid, cx: number, cy: number): boolean {
  return cx >= grid.cx0 && cy >= grid.cy0 && cx < grid.cx0 + grid.cols && cy < grid.cy0 + grid.rows;
}

/** Chunk'ın ilk örneğinin dizi sütunu/satırı. */
export function chunkCol0(grid: ChunkGrid, cx: number): number {
  return (cx - grid.cx0) * grid.cells;
}

export function chunkRow0(grid: ChunkGrid, cy: number): number {
  return (cy - grid.cy0) * grid.cells;
}

/** Dizi sütunu c → dünya X. */
export function sampleX(grid: ChunkGrid, col: number): number {
  return grid.originX + col * grid.cellSize;
}

/** Dizi satırı r → dünya Z. */
export function sampleZ(grid: ChunkGrid, row: number): number {
  return grid.originZ + row * grid.cellSize;
}

/** Tekil, ızgara boyutundan bağımsız anahtar (Map için; mutlak: `chunkKeys.absoluteChunkKey`). */
export function chunkKey(cx: number, cy: number): number {
  return absoluteChunkKey(cx, cy);
}

export function chunkRect(grid: ChunkGrid, cx: number, cy: number): ChunkRect {
  const col0 = chunkCol0(grid, cx);
  const row0 = chunkRow0(grid, cy);
  return {
    minX: sampleX(grid, col0),
    maxX: sampleX(grid, col0 + grid.cells),
    minZ: sampleZ(grid, row0),
    maxZ: sampleZ(grid, row0 + grid.cells),
  };
}

/** Dünya konumunu içeren chunk (kapsam dışıysa en yakın kenar chunk'ı). */
export function chunkIndexAt(grid: ChunkGrid, x: number, z: number): ChunkIndex {
  const col = (x - grid.originX) / grid.cellSize;
  const row = (z - grid.originZ) / grid.cellSize;
  return {
    cx: grid.cx0 + Math.min(Math.max(Math.floor(col / grid.cells), 0), grid.cols - 1),
    cy: grid.cy0 + Math.min(Math.max(Math.floor(row / grid.cells), 0), grid.rows - 1),
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
  for (let cy = grid.cy0; cy < grid.cy0 + grid.rows; cy++) {
    for (let cx = grid.cx0; cx < grid.cx0 + grid.cols; cx++) {
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
