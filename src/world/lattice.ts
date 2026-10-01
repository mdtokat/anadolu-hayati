import { HORIZONTAL_SCALE, WORLD } from '../config';
import type { WorldExtent } from '../data/worldTypes';

/**
 * Global örnek kafesi (docs/faz-7-paralel-plan.md §3.1): saf matematik, iki hesabın ortak dayanağı.
 * Örnek `(col, row)` tam sayıdır; `(0, 0)` eski bölgenin kuzeybatı örneğidir, negatif indeksler batıya/kuzeye
 * uzanır. Konumlar piksel merkezidir.
 */

/** Kafes hücre boyu (oyun m): gerçek hücre 100 m / `HORIZONTAL_SCALE`. */
export const LATTICE_CELL = 100 / HORIZONTAL_SCALE;

/** Chunk kenarındaki hücre sayısı (`CHUNK.cells` ile aynı; kafes sözleşmesinin parçası). */
export const CHUNK_CELLS = 128;

/** Sütun → oyun X (m). */
export function latticeX(col: number): number {
  return WORLD.lattice.anchorX + col * LATTICE_CELL;
}

/** Satır → oyun Z (m). */
export function latticeZ(row: number): number {
  return WORLD.lattice.anchorZ + row * LATTICE_CELL;
}

/** Oyun X → (kesirli) sütun. */
export function latticeCol(x: number): number {
  return (x - WORLD.lattice.anchorX) / LATTICE_CELL;
}

/** Oyun Z → (kesirli) satır. */
export function latticeRow(z: number): number {
  return (z - WORLD.lattice.anchorZ) / LATTICE_CELL;
}

/** Birleştirilmiş dizinin (0, 0) örneğinin konumu: `RegionMeta.gridOrigin`. */
export function gridOriginOf(extent: Pick<WorldExtent, 'col0' | 'row0'>): { x: number; z: number } {
  return { x: latticeX(extent.col0), z: latticeZ(extent.row0) };
}

/** Örneği içeren karo (`WORLD.tileSize`; negatif indeks sıfıra değil aşağı yuvarlanır). */
export function tileOf(col: number, row: number): { tx: number; ty: number } {
  return { tx: Math.floor(col / WORLD.tileSize), ty: Math.floor(row / WORLD.tileSize) };
}

/** Örneği içeren chunk (chunk `(cx, cy)` sütun `[cx·128, (cx+1)·128]` aralığını kapsar). */
export function chunkOf(col: number, row: number): { cx: number; cy: number } {
  return { cx: Math.floor(col / CHUNK_CELLS), cy: Math.floor(row / CHUNK_CELLS) };
}

/** `extent` ile kesişen karo aralığı (kapsayıcı): bu aralıktaki her karo manifestte listelenmelidir. */
export function tileRangeOf(extent: WorldExtent): {
  tx0: number;
  tx1: number;
  ty0: number;
  ty1: number;
} {
  const first = tileOf(extent.col0, extent.row0);
  const last = tileOf(extent.col0 + extent.cols - 1, extent.row0 + extent.rows - 1);
  return { tx0: first.tx, tx1: last.tx, ty0: first.ty, ty1: last.ty };
}

/**
 * Kuzeybatı örneği `(x, z)`'de olan bir ızgara kafese **chunk hizalı** mı (7.5)? Öyleyse ızgaranın ilk
 * chunk'ının kafes indeksini verir (negatif olabilir): chunk/doğma hücresi indeksleri ve dolayısıyla nesne
 * yerleşim tohumları (`seedFrom(seed, cx, cy)`) ve mutlak kimlikler dünyanın kapsamından bağımsız olur. Gerçek
 * veri her zaman hizalıdır (yükleyici batı/kuzey kenarı 128 örneğe hizalar; eski merkezli bölge `(0, 0)`).
 * Hizalı değilse (testlerdeki küçük sentetik ızgaralar, `?world=test`) `null`: çağıran yerel indeks kullanır.
 */
export function latticeChunkOffset(
  x: number,
  z: number,
  cellSize: number = LATTICE_CELL,
): { cx: number; cy: number } | null {
  if (Math.abs(cellSize - LATTICE_CELL) > 1e-9) return null;
  const cx = latticeCol(x) / CHUNK_CELLS;
  const cy = latticeRow(z) / CHUNK_CELLS;
  const rx = Math.round(cx);
  const ry = Math.round(cy);
  if (Math.abs(cx - rx) > 1e-9 || Math.abs(cy - ry) > 1e-9) return null;
  return { cx: rx, cy: ry };
}
