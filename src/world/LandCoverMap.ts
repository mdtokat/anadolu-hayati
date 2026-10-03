import { HORIZONTAL_SCALE } from '../config';
import { LANDCOVER_CLASSES, LANDCOVER_VALUE, type LandCoverClass } from '../data/landcover';
import type { RegionData, RegionMeta } from '../data/region';
import {
  OVERVIEW_STRIDE,
  PAGE_MASK,
  PAGE_SHIFT,
  PAGE_SIZE,
  overviewSize,
  pageCore,
  pageGridOf,
  type PageGrid,
} from './terrainPages';

/**
 * Arazi örtüsü ızgarası (landcover.bin): oyun X/Z → sınıf. Izgara heightmap ile aynıdır
 * (piksel merkezi örnekleri; (0, 0) örneği `origin`'de, varsayılan eski merkezli düzen); sorgu en yakın hücreyi
 * okur. Izgara dışı `none`.
 */
export class LandCoverMap {
  readonly width: number;
  readonly height: number;
  /** Izgara hücre boyu (oyun metresi). */
  readonly cell: number;
  /** Dizinin (0, 0) örneğinin konumu (oyun m): `RegionMeta.gridOrigin`. */
  readonly origin: { x: number; z: number };

  constructor(
    gridWidth: number,
    gridHeight: number,
    cellSizeReal: number,
    private readonly classes: Uint8Array | null,
    origin?: { x: number; z: number },
  ) {
    if (classes !== null && classes.length !== gridWidth * gridHeight) {
      throw new Error(`landcover ${classes.length} hücre, beklenen ${gridWidth * gridHeight}`);
    }
    this.width = gridWidth;
    this.height = gridHeight;
    this.cell = cellSizeReal / HORIZONTAL_SCALE;
    this.origin = origin ?? {
      x: (-(gridWidth - 1) / 2) * this.cell,
      z: (-(gridHeight - 1) / 2) * this.cell,
    };
  }

  /** Bölgenin arazi örtüsü yoksa null. */
  static fromRegion(region: RegionData): LandCoverMap | null {
    if (region.landcover === null) return null;
    const { gridWidth, gridHeight, cellSizeReal, gridOrigin } = region.meta;
    return new LandCoverMap(gridWidth, gridHeight, cellSizeReal, region.landcover, gridOrigin);
  }

  /**
   * Akış kipi (Faz 12): yalnız genel bakış örtüsüyle (her 8. örnek) kurulur; karo sayfaları `setTile` ile gelir ve
   * gider. Yüklü olmayan yerde en yakın genel bakış örneği okunur.
   */
  static streamed(meta: RegionMeta, overview: Uint8Array): LandCoverMap {
    const map = new LandCoverMap(
      meta.gridWidth,
      meta.gridHeight,
      meta.cellSizeReal,
      null,
      meta.gridOrigin,
    );
    map.pageGrid = pageGridOf(meta);
    map.pages = new Array<Uint8Array | undefined>(map.pageGrid.pagesX * map.pageGrid.pagesY);
    map.overview = overview;
    map.overviewCols = overviewSize(meta.gridWidth);
    map.overviewRows = overviewSize(meta.gridHeight);
    if (overview.length !== map.overviewCols * map.overviewRows) {
      throw new Error(
        `Örtü genel bakışı ${overview.length} örnek, beklenen ${map.overviewCols * map.overviewRows}`,
      );
    }
    return map;
  }

  private pageGrid: PageGrid | null = null;
  private pages: Array<Uint8Array | undefined> = [];
  private overview: Uint8Array | null = null;
  private overviewCols = 0;
  private overviewRows = 0;

  /** Karonun örtü sayfasını yükler: `window` karo penceresi (dizi indeksi, çekirdeği kapsar), `cover` sınıflar. */
  setTile(
    tx: number,
    ty: number,
    window: { col0: number; row0: number; cols: number; rows: number },
    cover: Uint8Array,
  ): void {
    const grid = this.pageGrid;
    if (grid === null) throw new Error('Örtü haritası akış kipinde değil');
    const core = pageCore(grid, this.width, this.height, tx, ty);
    if (!core) return;
    const page = new Uint8Array(PAGE_SIZE * PAGE_SIZE);
    const px = tx - grid.tileX0;
    const py = ty - grid.tileY0;
    for (let r = 0; r < core.rows; r++) {
      const src = (core.row0 - window.row0 + r) * window.cols + (core.col0 - window.col0);
      const dst =
        (core.row0 + r + grid.padRow - py * PAGE_SIZE) * PAGE_SIZE +
        (core.col0 + grid.padCol - px * PAGE_SIZE);
      page.set(cover.subarray(src, src + core.cols), dst);
    }
    this.pages[py * grid.pagesX + px] = page;
  }

  removeTile(tx: number, ty: number): void {
    const grid = this.pageGrid;
    if (grid === null) return;
    const px = tx - grid.tileX0;
    const py = ty - grid.tileY0;
    if (px < 0 || py < 0 || px >= grid.pagesX || py >= grid.pagesY) return;
    this.pages[py * grid.pagesX + px] = undefined;
  }

  /** Hücre değeri (uint8); ızgara dışı için 0 (`none`). */
  valueAtCell(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return 0;
    if (this.classes !== null) return this.classes[row * this.width + col] as number;
    const grid = this.pageGrid as PageGrid;
    const c = col + grid.padCol;
    const r = row + grid.padRow;
    const page = this.pages[(r >> PAGE_SHIFT) * grid.pagesX + (c >> PAGE_SHIFT)];
    if (page !== undefined) return page[(r & PAGE_MASK) * PAGE_SIZE + (c & PAGE_MASK)] as number;
    const oc = Math.min(Math.round(col / OVERVIEW_STRIDE), this.overviewCols - 1);
    const or = Math.min(Math.round(row / OVERVIEW_STRIDE), this.overviewRows - 1);
    return (this.overview as Uint8Array)[or * this.overviewCols + oc] as number;
  }

  /** Oyun X/Z'deki sınıf değeri (uint8). */
  valueAt(x: number, z: number): number {
    const col = Math.round((x - this.origin.x) / this.cell);
    const row = Math.round((z - this.origin.z) / this.cell);
    return this.valueAtCell(col, row);
  }

  /** Oyun X/Z'deki sınıf adı. */
  classAt(x: number, z: number): LandCoverClass {
    return LANDCOVER_CLASSES[this.valueAt(x, z)] ?? 'none';
  }

  /** Oyun X/Z'de belirli bir sınıf var mı? */
  is(x: number, z: number, name: LandCoverClass): boolean {
    return this.valueAt(x, z) === LANDCOVER_VALUE[name];
  }
}
