import { HORIZONTAL_SCALE, SEABED, TERRAIN_SMOOTHING, VERTICAL_SCALE } from '../config';
import { latticeCol, latticeRow, LATTICE_CELL } from './lattice';
import { seabedDepth, seaDistanceToLandSteps } from './seabed';
import { smoothLandSteps } from './terrainSmoothing';

/**
 * Sayfalı arazi (saf): yükseklik dizisi `PAGE_SIZE × PAGE_SIZE` örneklik sayfalara bölünür (= dünya karosu); akış
 * kipinde yalnızca oyuncuya yakın sayfalar bellekte durur. Yumuşatma ve deniz tabanı **pencere** üzerinde de
 * hesaplanabilir: pencere sayfanın `TILE_HALO` örnek taşan komşu verisini taşıyorsa sonuç tüm diziyle hesaplananla
 * bit-bit aynıdır (Gauss yarıçapı 4, deniz tabanı etkisi en çok ~10 hücre).
 */

/** Sayfa kenarı (örnek); `WORLD.tileSize` ile aynı olmalı (test eşleştirir). */
export const PAGE_SHIFT = 9;
export const PAGE_SIZE = 1 << PAGE_SHIFT;
export const PAGE_MASK = PAGE_SIZE - 1;
/** Genel bakış kademesi: her `OVERVIEW_STRIDE`. örnek (LOD3 ile aynı). */
export const OVERVIEW_STRIDE = 8;
/** Pencere payı (örnek): Gauss yarıçapı ve deniz tabanı etkisi bunun içindedir. */
export const TILE_HALO = 12;

/** Yükseklik yorumu için üst veri (dikey nicemleme ve ölçek). */
export interface HeightEncoding {
  elevationMin: number;
  elevationMax: number;
  cellSizeReal: number;
}

/** Bir sayfanın bellek içi hâli. */
export interface TerrainPage {
  /** Oyun yüksekliği (y), satır satır `PAGE_SIZE²`; deniz tabanı ve yol/dere düzeltmeleri dahil. */
  game: Float32Array;
  /** Ham (uint16) örnekler: nesne dağılımı (`scatterView`) için; yumuşatma yoksa null. */
  raw: Uint16Array | null;
  /** Düzeltmeden önceki (doğal) yükseklikler; düzeltme yoksa null. */
  base: Float32Array | null;
  /** Sonraki düzeltmelerin değiştirmeyeceği hücreler (yalnız hat/veri üretimi); tembel. */
  locked: Uint8Array | null;
}

/** Ham örneklerden oyun yüksekliği dizisi (dikey ölçek, isteğe bağlı yumuşatma, deniz tabanı). */
export function terrainFromRaw(
  heights: Uint16Array,
  width: number,
  height: number,
  encoding: HeightEncoding,
  smooth: boolean,
): Float32Array {
  const steps = terrainFromRawSteps(heights, width, height, encoding, smooth, Infinity);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/**
 * `terrainFromRaw`'ın dilimli hâli (aynı aritmetik, bire bir aynı sonuç): her dilimde (≈ 1 ms) bir `yield` eder; karo
 * akışı dilimleri kare bütçesine yayar (tek parça ~20 ms'lik takılma olmasın).
 */
export function* terrainFromRawSteps(
  heights: Uint16Array,
  width: number,
  height: number,
  encoding: HeightEncoding,
  smooth: boolean,
  rowsPerStep = 32,
): Generator<void, Float32Array> {
  const range = encoding.elevationMax - encoding.elevationMin;
  const game = new Float32Array(heights.length);
  const slice = Math.max(1, Math.floor(rowsPerStep * 4 * width));
  let since = 0;
  for (let i = 0; i < heights.length; i++) {
    game[i] = (encoding.elevationMin + ((heights[i] as number) / 65535) * range) / VERTICAL_SCALE;
    if (++since === slice) {
      since = 0;
      yield;
    }
  }
  yield;
  // Küçük tümsekler (deve sırtı) düzlenir; deniz hücreleri ve kıyı çizgisi değişmez (TERRAIN_SMOOTHING).
  if (smooth && TERRAIN_SMOOTHING.sigmaCells > 0) {
    yield* smoothLandSteps(
      game,
      width,
      height,
      (i) => heights[i] !== 0,
      TERRAIN_SMOOTHING.sigmaCells,
      TERRAIN_SMOOTHING.strength,
      rowsPerStep,
    );
  }
  // Deniz hücreleri (uint16 değeri 0) kıyıdan uzaklığa göre aşağı indirilir.
  const cell = encoding.cellSizeReal / HORIZONTAL_SCALE;
  const distance = yield* seaDistanceToLandSteps(
    width,
    height,
    (i) => heights[i] === 0,
    rowsPerStep * 2,
  );
  yield;
  const depth = seabedDepth(distance, cell, SEABED.slopeDeg, SEABED.maxDepth);
  yield;
  for (let i = 0; i < depth.length; i++) {
    if (heights[i] === 0) game[i] = -(depth[i] as number);
  }
  yield;
  return game;
}

export function createPage(): TerrainPage {
  return { game: new Float32Array(PAGE_SIZE * PAGE_SIZE), raw: null, base: null, locked: null };
}

/** Genel bakış dizisinin boyutu (örnek): `ceil((n − 1) / stride) + 1`. */
export function overviewSize(samples: number): number {
  return Math.ceil((samples - 1) / OVERVIEW_STRIDE) + 1;
}

/** Dünya dizisinden, çekirdek dikdörtgeni `halo` örnek genişleterek (dünya kenarında kırparak) pencere keser. */
export function cutWindow<T extends Uint8Array | Uint16Array>(
  data: T,
  width: number,
  height: number,
  core: { col0: number; row0: number; cols: number; rows: number },
  halo: number = TILE_HALO,
): { col0: number; row0: number; cols: number; rows: number; raw: T } {
  const col0 = Math.max(0, core.col0 - halo);
  const row0 = Math.max(0, core.row0 - halo);
  const col1 = Math.min(width, core.col0 + core.cols + halo);
  const row1 = Math.min(height, core.row0 + core.rows + halo);
  const cols = col1 - col0;
  const rows = row1 - row0;
  const raw = new (data.constructor as new (n: number) => T)(cols * rows);
  for (let r = 0; r < rows; r++) {
    const from = (row0 + r) * width + col0;
    raw.set(data.subarray(from, from + cols), r * cols);
  }
  return { col0, row0, cols, rows, raw };
}

/**
 * Sayfa ızgarası: dünya dizisinin (c, r) örneği `((c + padCol) >> 9, (r + padRow) >> 9)` sayfasındadır. Dizi kafese
 * hizalıysa sayfa = dünya karosu (`tileX0/tileY0` ilk sayfanın karo indeksi); değilse (sentetik ızgara) yereldir.
 */
export interface PageGrid {
  tileX0: number;
  tileY0: number;
  padCol: number;
  padRow: number;
  pagesX: number;
  pagesY: number;
}

export function pageGridOf(meta: {
  gridWidth: number;
  gridHeight: number;
  cellSizeReal: number;
  gridOrigin: { x: number; z: number };
}): PageGrid {
  const cell = meta.cellSizeReal / HORIZONTAL_SCALE;
  const col0 = latticeCol(meta.gridOrigin.x);
  const row0 = latticeRow(meta.gridOrigin.z);
  const aligned =
    Math.abs(cell - LATTICE_CELL) < 1e-9 &&
    Math.abs(col0 - Math.round(col0)) < 1e-9 &&
    Math.abs(row0 - Math.round(row0)) < 1e-9;
  const tileX0 = aligned ? Math.floor(Math.round(col0) / PAGE_SIZE) : 0;
  const tileY0 = aligned ? Math.floor(Math.round(row0) / PAGE_SIZE) : 0;
  const padCol = aligned ? Math.round(col0) - tileX0 * PAGE_SIZE : 0;
  const padRow = aligned ? Math.round(row0) - tileY0 * PAGE_SIZE : 0;
  return {
    tileX0,
    tileY0,
    padCol,
    padRow,
    pagesX: ((meta.gridWidth - 1 + padCol) >> PAGE_SHIFT) + 1,
    pagesY: ((meta.gridHeight - 1 + padRow) >> PAGE_SHIFT) + 1,
  };
}

/** Sayfanın dünya dizisi içindeki çekirdek dikdörtgeni (dizi indeksi); dünyayla kesişmiyorsa null. */
export function pageCore(
  grid: PageGrid,
  width: number,
  height: number,
  tx: number,
  ty: number,
): { col0: number; row0: number; cols: number; rows: number } | null {
  const px = tx - grid.tileX0;
  const py = ty - grid.tileY0;
  if (px < 0 || py < 0 || px >= grid.pagesX || py >= grid.pagesY) return null;
  const c0 = Math.max(0, grid.padCol - px * PAGE_SIZE);
  const c1 = Math.min(PAGE_SIZE, width + grid.padCol - px * PAGE_SIZE);
  const r0 = Math.max(0, grid.padRow - py * PAGE_SIZE);
  const r1 = Math.min(PAGE_SIZE, height + grid.padRow - py * PAGE_SIZE);
  if (c1 <= c0 || r1 <= r0) return null;
  return {
    col0: px * PAGE_SIZE + c0 - grid.padCol,
    row0: py * PAGE_SIZE + r0 - grid.padRow,
    cols: c1 - c0,
    rows: r1 - r0,
  };
}
