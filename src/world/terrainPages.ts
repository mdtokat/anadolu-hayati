import { HORIZONTAL_SCALE, SEABED, TERRAIN_SMOOTHING, VERTICAL_SCALE } from '../config';
import { seabedDepth, seaDistanceToLand } from './seabed';
import { smoothLand } from './terrainSmoothing';

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
  const range = encoding.elevationMax - encoding.elevationMin;
  const game = new Float32Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    game[i] = (encoding.elevationMin + ((heights[i] as number) / 65535) * range) / VERTICAL_SCALE;
  }
  // Küçük tümsekler (deve sırtı) düzlenir; deniz hücreleri ve kıyı çizgisi değişmez (TERRAIN_SMOOTHING).
  if (smooth && TERRAIN_SMOOTHING.sigmaCells > 0) {
    smoothLand(
      game,
      width,
      height,
      (i) => heights[i] !== 0,
      TERRAIN_SMOOTHING.sigmaCells,
      TERRAIN_SMOOTHING.strength,
    );
  }
  // Deniz hücreleri (uint16 değeri 0) kıyıdan uzaklığa göre aşağı indirilir.
  const cell = encoding.cellSizeReal / HORIZONTAL_SCALE;
  const distance = seaDistanceToLand(width, height, (i) => heights[i] === 0);
  const depth = seabedDepth(distance, cell, SEABED.slopeDeg, SEABED.maxDepth);
  for (let i = 0; i < depth.length; i++) {
    if (heights[i] === 0) game[i] = -(depth[i] as number);
  }
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
export function cutWindow(
  heights: Uint16Array,
  width: number,
  height: number,
  core: { col0: number; row0: number; cols: number; rows: number },
  halo: number = TILE_HALO,
): { col0: number; row0: number; cols: number; rows: number; raw: Uint16Array } {
  const col0 = Math.max(0, core.col0 - halo);
  const row0 = Math.max(0, core.row0 - halo);
  const col1 = Math.min(width, core.col0 + core.cols + halo);
  const row1 = Math.min(height, core.row0 + core.rows + halo);
  const cols = col1 - col0;
  const rows = row1 - row0;
  const raw = new Uint16Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const from = (row0 + r) * width + col0;
    raw.set(heights.subarray(from, from + cols), r * cols);
  }
  return { col0, row0, cols, rows, raw };
}
