import { HORIZONTAL_SCALE, TERRAIN_SMOOTHING, VERTICAL_SCALE } from '../config';
import type { RegionData, RegionMeta } from '../data/region';
import type { HeightSource } from './HeightSource';
import { latticeCol, latticeRow, LATTICE_CELL } from './lattice';
import { seaDistanceToLand } from './seabed';
import {
  OVERVIEW_STRIDE,
  PAGE_MASK,
  PAGE_SHIFT,
  PAGE_SIZE,
  createPage,
  overviewSize,
  terrainFromRaw,
  type TerrainPage,
} from './terrainPages';

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Bir karonun çekirdeği + komşu payı: dizi (extent-göreli) indekslerinde dikdörtgen ve ham örnekleri. Pay, çekirdeğin
 * `TILE_HALO` örnek dışına taşar (dünya kenarında kırpılır).
 */
export interface TileWindow {
  col0: number;
  row0: number;
  cols: number;
  rows: number;
  /** `cols × rows` ham (uint16) örnek, satır satır. */
  raw: Uint16Array;
}

/** Karonun (dizi indeksinde) dünya içindeki çekirdek dikdörtgeni. */
export interface TileCore {
  col0: number;
  row0: number;
  cols: number;
  rows: number;
}

/**
 * Gerçek bölge yüksekliği: heightmap örneklerinden bilinear aradeğerlenen oyun yüksekliği (y).
 *
 * Örnekler ızgara köşesidir (piksel merkezi); dizinin (0, 0) örneği `meta.gridOrigin`'dedir:
 *   x = origin.x + c · cell,  z = origin.z + r · cell,  cell = cellSizeReal / HORIZONTAL_SCALE.
 * Eski (merkezli) bölgede `origin = −(W − 1) / 2 · cell` (z benzer); Faz 7 dünyasında kafese çapalıdır.
 * Izgara dışında en yakın kenar değeri kullanılır.
 *
 * Deniz (heightmap'te 0'a kırpılı hücreler) çalışma zamanında kıyıdan uzaklığa göre çukurlaştırılır
 * (bkz. SEABED): su yüzeyi ile zemin çakışıp titremesin. Mesh, collider ve `heightAt` aynı diziyi okur.
 *
 * Depolama **sayfalıdır** (Faz 12, karo akışı): dizi `PAGE_SIZE²` örneklik sayfalara bölünür (kafese hizalı dünyada
 * sayfa = dünya karosu). Yoğun kip (`new`, `fromRegion`) tüm sayfaları kurar; akış kipi (`streamed`) yalnız genel
 * bakış dizisini (her 8. örnek) tutar ve sayfalar `loadTile`/`unloadTile` ile gelip gider. Yüklü olmayan sayfada
 * örnekler genel bakıştan aradeğerlenir (LOD3 köşeleriyle bire bir aynı).
 */
export class RegionHeightSource implements HeightSource {
  /** Izgara hücre boyu (oyun metresi). */
  readonly cell: number;
  readonly width: number;
  readonly height: number;
  readonly bounds: Bounds;
  /** Dizinin (0, 0) örneğinin konumu (oyun m): `meta.gridOrigin`. */
  readonly origin: { x: number; z: number };

  /** Sayfa ızgarası: dizi (c, r) → sayfa `((c + padCol) >> 9, (r + padRow) >> 9)`. */
  private readonly padCol: number;
  private readonly padRow: number;
  /** İlk sayfanın (dünya) karo indeksi: kafese hizalıysa `floor(col0 / 512)`, değilse 0. */
  readonly tileX0: number;
  readonly tileY0: number;
  readonly pagesX: number;
  readonly pagesY: number;
  private readonly pages: Array<TerrainPage | undefined>;
  /** Akış kipinde genel bakış (her 8. örnek, oyun yüksekliği); yoğun kipte null. */
  private overview: Float32Array | null = null;
  private readonly overviewCols: number;
  private readonly overviewRows: number;
  /** Yumuşatma uygulanır mı (sayfa pencereleri de aynı kuralı izler). */
  private readonly smooth: boolean;
  /** Herhangi bir örnek düzeltildi mi (yol/dere/teras)? */
  private gradedFlag = false;

  constructor(
    readonly meta: RegionMeta,
    heights: Uint16Array | null,
    options: { smooth?: boolean; overview?: Float32Array } = {},
  ) {
    this.width = meta.gridWidth;
    this.height = meta.gridHeight;
    this.cell = meta.cellSizeReal / HORIZONTAL_SCALE;
    this.origin = { x: meta.gridOrigin.x, z: meta.gridOrigin.z };
    this.bounds = {
      minX: this.origin.x,
      maxX: this.origin.x + (this.width - 1) * this.cell,
      minZ: this.origin.z,
      maxZ: this.origin.z + (this.height - 1) * this.cell,
    };
    this.smooth = options.smooth === true && TERRAIN_SMOOTHING.sigmaCells > 0;

    // Sayfa ızgarası kafese hizalıysa sayfa = dünya karosu (aksi: sentetik ızgara, yerel).
    const col0 = latticeCol(this.origin.x);
    const row0 = latticeRow(this.origin.z);
    const aligned =
      Math.abs(this.cell - LATTICE_CELL) < 1e-9 &&
      Math.abs(col0 - Math.round(col0)) < 1e-9 &&
      Math.abs(row0 - Math.round(row0)) < 1e-9;
    this.tileX0 = aligned ? Math.floor(Math.round(col0) / PAGE_SIZE) : 0;
    this.tileY0 = aligned ? Math.floor(Math.round(row0) / PAGE_SIZE) : 0;
    this.padCol = aligned ? Math.round(col0) - this.tileX0 * PAGE_SIZE : 0;
    this.padRow = aligned ? Math.round(row0) - this.tileY0 * PAGE_SIZE : 0;
    this.pagesX = ((this.width - 1 + this.padCol) >> PAGE_SHIFT) + 1;
    this.pagesY = ((this.height - 1 + this.padRow) >> PAGE_SHIFT) + 1;
    this.pages = new Array<TerrainPage | undefined>(this.pagesX * this.pagesY).fill(undefined);
    this.overviewCols = overviewSize(this.width);
    this.overviewRows = overviewSize(this.height);

    if (options.overview) {
      if (options.overview.length !== this.overviewCols * this.overviewRows) {
        throw new Error(
          `Genel bakış ${options.overview.length} örnek, beklenen ${this.overviewCols * this.overviewRows}`,
        );
      }
      this.overview = options.overview;
    }
    if (heights !== null) this.loadDense(heights);
  }

  /** Yoğun kip: tüm diziyi bir kerede hesaplar ve sayfalara böler (eski davranışla bire bir aynı). */
  private loadDense(heights: Uint16Array): void {
    const game = terrainFromRaw(heights, this.width, this.height, this.meta, this.smooth);
    for (let py = 0; py < this.pagesY; py++) {
      for (let px = 0; px < this.pagesX; px++) {
        const page = createPage();
        const rows = this.pageRows(py);
        const cols = this.pageCols(px);
        if (this.smooth) page.raw = new Uint16Array(PAGE_SIZE * PAGE_SIZE);
        for (let r = rows.from; r < rows.to; r++) {
          const src =
            (py * PAGE_SIZE + r - this.padRow) * this.width +
            (px * PAGE_SIZE + cols.from - this.padCol);
          const dst = r * PAGE_SIZE + cols.from;
          const n = cols.to - cols.from;
          page.game.set(game.subarray(src, src + n), dst);
          page.raw?.set(heights.subarray(src, src + n), dst);
        }
        this.pages[py * this.pagesX + px] = page;
      }
    }
  }

  /** Sayfa içi satır aralığı (dünya dizisinin içinde kalan kısım). */
  private pageRows(py: number): { from: number; to: number } {
    return {
      from: Math.max(0, this.padRow - py * PAGE_SIZE),
      to: Math.min(PAGE_SIZE, this.height + this.padRow - py * PAGE_SIZE),
    };
  }

  private pageCols(px: number): { from: number; to: number } {
    return {
      from: Math.max(0, this.padCol - px * PAGE_SIZE),
      to: Math.min(PAGE_SIZE, this.width + this.padCol - px * PAGE_SIZE),
    };
  }

  /** Oyunun yükseklik kaynağı: yumuşatılmış (`TERRAIN_SMOOTHING`); `smooth: false` ham veriyi verir. */
  static fromRegion(region: RegionData, options: { smooth?: boolean } = {}): RegionHeightSource {
    return new RegionHeightSource(region.meta, region.heights, {
      smooth: options.smooth ?? true,
    });
  }

  /**
   * Akış kipi: yalnız genel bakış dizisiyle kurulur (`overview`: her 8. örnek, `buildOverview` çıktısı); sayfalar
   * sonradan `loadTile` ile gelir. Yumuşatma açıktır (oyunun kaynağı).
   */
  static streamed(meta: RegionMeta, overview: Float32Array): RegionHeightSource {
    return new RegionHeightSource(meta, null, { smooth: true, overview });
  }

  /** Akış kipinde mi (genel bakış dizisi var)? */
  get streaming(): boolean {
    return this.overview !== null;
  }

  // --- Sayfa yönetimi -------------------------------------------------------------------------------------

  /** Karonun dünya dizisi içindeki çekirdek dikdörtgeni; dünyayla kesişmiyorsa null. */
  tileCore(tx: number, ty: number): TileCore | null {
    const px = tx - this.tileX0;
    const py = ty - this.tileY0;
    if (px < 0 || py < 0 || px >= this.pagesX || py >= this.pagesY) return null;
    const cols = this.pageCols(px);
    const rows = this.pageRows(py);
    if (cols.to <= cols.from || rows.to <= rows.from) return null;
    return {
      col0: px * PAGE_SIZE + cols.from - this.padCol,
      row0: py * PAGE_SIZE + rows.from - this.padRow,
      cols: cols.to - cols.from,
      rows: rows.to - rows.from,
    };
  }

  hasTile(tx: number, ty: number): boolean {
    const px = tx - this.tileX0;
    const py = ty - this.tileY0;
    if (px < 0 || py < 0 || px >= this.pagesX || py >= this.pagesY) return false;
    return this.pages[py * this.pagesX + px] !== undefined;
  }

  /** Yüklü sayfa sayısı. */
  get tileCount(): number {
    let n = 0;
    for (const page of this.pages) if (page !== undefined) n++;
    return n;
  }

  /**
   * Karoyu pencereden yükler: yumuşatma ve deniz tabanı pencerede hesaplanır, çekirdek sayfaya yazılır. Pencere
   * çekirdeği ve (varsa) `TILE_HALO` payını kapsamalı; sonuç yoğun kipteki değerle bire bir aynıdır.
   */
  loadTile(tx: number, ty: number, window: TileWindow): void {
    const core = this.tileCore(tx, ty);
    if (!core) throw new Error(`Karo (${tx}, ${ty}) dünyanın dışında`);
    if (window.raw.length !== window.cols * window.rows) {
      throw new Error(`Pencere ${window.raw.length} örnek, beklenen ${window.cols * window.rows}`);
    }
    if (
      core.col0 < window.col0 ||
      core.row0 < window.row0 ||
      core.col0 + core.cols > window.col0 + window.cols ||
      core.row0 + core.rows > window.row0 + window.rows
    ) {
      throw new Error(`Karo (${tx}, ${ty}) penceresi çekirdeği kapsamıyor`);
    }
    const game = terrainFromRaw(window.raw, window.cols, window.rows, this.meta, this.smooth);
    const page = createPage();
    page.raw = new Uint16Array(PAGE_SIZE * PAGE_SIZE);
    const px = tx - this.tileX0;
    const py = ty - this.tileY0;
    for (let r = 0; r < core.rows; r++) {
      const src = (core.row0 - window.row0 + r) * window.cols + (core.col0 - window.col0);
      const localRow = core.row0 + r + this.padRow - py * PAGE_SIZE;
      const dst = localRow * PAGE_SIZE + (core.col0 + this.padCol - px * PAGE_SIZE);
      page.game.set(game.subarray(src, src + core.cols), dst);
      page.raw.set(window.raw.subarray(src, src + core.cols), dst);
    }
    this.pages[py * this.pagesX + px] = page;
  }

  /**
   * Karoya düzeltme yamalarını uygular (yol/dere/teras; veri hattında hesaplanmış): `indices` sayfa içi indeks
   * (`satır · 512 + sütun`), `values` düzeltilmiş oyun yüksekliği. Doğal yükseklikler saklanır.
   */
  patchTile(tx: number, ty: number, indices: ArrayLike<number>, values: ArrayLike<number>): void {
    const page = this.pageAt(tx, ty);
    if (!page) throw new Error(`Karo (${tx}, ${ty}) yüklü değil`);
    if (indices.length === 0) return;
    page.base ??= new Float32Array(page.game);
    for (let k = 0; k < indices.length; k++) page.game[indices[k] as number] = values[k] as number;
    this.gradedFlag = true;
  }

  /** Karonun düzeltilmiş hücreleri (doğala göre farklı): `[indeks…]` ve değerleri. Düzeltme yoksa boş. */
  tilePatches(tx: number, ty: number): { indices: Uint32Array; values: Float32Array } {
    const page = this.pageAt(tx, ty);
    if (!page?.base) return { indices: new Uint32Array(0), values: new Float32Array(0) };
    const idx: number[] = [];
    for (let i = 0; i < page.game.length; i++) {
      if (page.game[i] !== page.base[i]) idx.push(i);
    }
    const indices = Uint32Array.from(idx);
    const values = new Float32Array(indices.length);
    for (let k = 0; k < indices.length; k++) values[k] = page.game[indices[k] as number] as number;
    return { indices, values };
  }

  unloadTile(tx: number, ty: number): void {
    const px = tx - this.tileX0;
    const py = ty - this.tileY0;
    if (px < 0 || py < 0 || px >= this.pagesX || py >= this.pagesY) return;
    this.pages[py * this.pagesX + px] = undefined;
  }

  private pageAt(tx: number, ty: number): TerrainPage | undefined {
    const px = tx - this.tileX0;
    const py = ty - this.tileY0;
    if (px < 0 || py < 0 || px >= this.pagesX || py >= this.pagesY) return undefined;
    return this.pages[py * this.pagesX + px];
  }

  /**
   * Genel bakış dizisi: her 8. örnek (dizi sütun/satır 0, 8, 16, …; son örnek dahil değilse en yakın), oyun
   * yüksekliği. Tüm sayfalar yüklü olmalı (veri hattı). Akış kipinde oyun bunu `overview` olarak alır.
   */
  buildOverview(): Float32Array {
    const out = new Float32Array(this.overviewCols * this.overviewRows);
    for (let j = 0; j < this.overviewRows; j++) {
      const r = Math.min(j * OVERVIEW_STRIDE, this.height - 1);
      for (let i = 0; i < this.overviewCols; i++) {
        out[j * this.overviewCols + i] = this.sample(
          Math.min(i * OVERVIEW_STRIDE, this.width - 1),
          r,
        );
      }
    }
    return out;
  }

  // --- Sorgular -------------------------------------------------------------------------------------------

  /** Dünya X/Z'nin dünya içinde (heightmap kapsamında) olup olmadığı. */
  contains(x: number, z: number): boolean {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  /** Sütun c için dünya X'i. */
  xAt(col: number): number {
    return this.origin.x + col * this.cell;
  }

  /** Satır r için dünya Z'si. */
  zAt(row: number): number {
    return this.origin.z + row * this.cell;
  }

  /** Genel bakıştan bilinear aradeğer (sayfa yüklü değilken). */
  private overviewAt(col: number, row: number): number {
    const ov = this.overview;
    if (ov === null) return 0;
    const fc = col / OVERVIEW_STRIDE;
    const fr = row / OVERVIEW_STRIDE;
    const c0 = Math.min(Math.floor(fc), this.overviewCols - 1);
    const r0 = Math.min(Math.floor(fr), this.overviewRows - 1);
    const c1 = Math.min(c0 + 1, this.overviewCols - 1);
    const r1 = Math.min(r0 + 1, this.overviewRows - 1);
    const tc = fc - c0;
    const tr = fr - r0;
    const w = this.overviewCols;
    const top = (ov[r0 * w + c0] as number) * (1 - tc) + (ov[r0 * w + c1] as number) * tc;
    const bottom = (ov[r1 * w + c0] as number) * (1 - tc) + (ov[r1 * w + c1] as number) * tc;
    return top * (1 - tr) + bottom * tr;
  }

  /** Izgara örneğini değiştirir (yol düzeltmesi). İlk değişiklikte sayfanın doğal yükseklikleri saklanır. */
  setSample(col: number, row: number, value: number): void {
    const c = col + this.padCol;
    const r = row + this.padRow;
    const page = this.pages[(r >> PAGE_SHIFT) * this.pagesX + (c >> PAGE_SHIFT)];
    if (!page) return;
    page.base ??= new Float32Array(page.game);
    page.game[(r & PAGE_MASK) * PAGE_SIZE + (c & PAGE_MASK)] = value;
    this.gradedFlag = true;
  }

  lock(col: number, row: number): void {
    const c = col + this.padCol;
    const r = row + this.padRow;
    const page = this.pages[(r >> PAGE_SHIFT) * this.pagesX + (c >> PAGE_SHIFT)];
    if (!page) return;
    page.locked ??= new Uint8Array(PAGE_SIZE * PAGE_SIZE);
    page.locked[(r & PAGE_MASK) * PAGE_SIZE + (c & PAGE_MASK)] = 1;
  }

  isLocked(col: number, row: number): boolean {
    const c = col + this.padCol;
    const r = row + this.padRow;
    const page = this.pages[(r >> PAGE_SHIFT) * this.pagesX + (c >> PAGE_SHIFT)];
    return page?.locked?.[(r & PAGE_MASK) * PAGE_SIZE + (c & PAGE_MASK)] === 1;
  }

  /** Yol düzeltmesi uygulandı mı? */
  get graded(): boolean {
    return this.gradedFlag;
  }

  /**
   * Doğal (düzeltilmemiş) araziyi okuyan görünüm: `heightAt`, `slopeDegAt`, `elevationAt`. Düzeltme yoksa kaynağın
   * kendisi gibi davranır. Yol planı doğal araziden tasarlanır; nesne dağılımı da doğal eğimi kullanır.
   */
  natural(): Pick<RegionHeightSource, 'heightAt' | 'elevationAt' | 'slopeDegAt'> {
    return this.view((c, r) => {
      const cc = this.clampCol(c);
      const rr = this.clampRow(r);
      const pc = cc + this.padCol;
      const pr = rr + this.padRow;
      const page = this.pages[(pr >> PAGE_SHIFT) * this.pagesX + (pc >> PAGE_SHIFT)];
      if (!page) return this.overviewAt(cc, rr);
      return (page.base ?? page.game)[(pr & PAGE_MASK) * PAGE_SIZE + (pc & PAGE_MASK)] as number;
    });
  }

  /**
   * Nesne dağılımının okuduğu arazi: yumuşatma ve düzeltmeden önceki ham veri (deniz tabanı dahil). Nesne kimlikleri
   * (`PropId`) dağılıma bağlı olduğundan arazi yumuşatması onları kaydırmasın. Yumuşatılmamış kaynakta `natural()`.
   */
  scatterView(): Pick<RegionHeightSource, 'heightAt' | 'elevationAt' | 'slopeDegAt'> {
    if (!this.smooth) return this.natural();
    const { elevationMin, elevationMax } = this.meta;
    const range = elevationMax - elevationMin;
    return this.view((c, r) => {
      const cc = this.clampCol(c);
      const rr = this.clampRow(r);
      const pc = cc + this.padCol;
      const pr = rr + this.padRow;
      const page = this.pages[(pr >> PAGE_SHIFT) * this.pagesX + (pc >> PAGE_SHIFT)];
      if (!page) return this.overviewAt(cc, rr);
      const local = (pr & PAGE_MASK) * PAGE_SIZE + (pc & PAGE_MASK);
      const v = (page.raw as Uint16Array)[local] as number;
      // Deniz hücreleri yumuşatılmaz: çukurlaştırılmış taban olduğu gibi okunur.
      if (v === 0) return (page.base ?? page.game)[local] as number;
      // Kaynakla aynı float32 yuvarlaması: dağılım (ve kimlikler) yumuşatmasız kaynakla bit-eşdeğer kalsın.
      return Math.fround((elevationMin + (v / 65535) * range) / VERTICAL_SCALE);
    });
  }

  private clampCol(col: number): number {
    return col < 0 ? 0 : col >= this.width ? this.width - 1 : col;
  }

  private clampRow(row: number): number {
    return row < 0 ? 0 : row >= this.height ? this.height - 1 : row;
  }

  private view(
    sample: (col: number, row: number) => number,
  ): Pick<RegionHeightSource, 'heightAt' | 'elevationAt' | 'slopeDegAt'> {
    const heightAt = (x: number, z: number): number => {
      const fc = Math.min(Math.max((x - this.origin.x) / this.cell, 0), this.width - 1);
      const fr = Math.min(Math.max((z - this.origin.z) / this.cell, 0), this.height - 1);
      const c0 = Math.floor(fc);
      const r0 = Math.floor(fr);
      const tc = fc - c0;
      const tr = fr - r0;
      const top = sample(c0, r0) * (1 - tc) + sample(c0 + 1, r0) * tc;
      const bottom = sample(c0, r0 + 1) * (1 - tc) + sample(c0 + 1, r0 + 1) * tc;
      return top * (1 - tr) + bottom * tr;
    };
    return {
      heightAt,
      elevationAt: (x, z) => heightAt(x, z) * VERTICAL_SCALE,
      slopeDegAt: (x, z) => {
        const d = this.cell;
        const gx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
        const gz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
        return (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
      },
    };
  }

  /** Tam sayı örnek (kenara sıkıştırılmış): oyun yüksekliği. */
  sample(col: number, row: number): number {
    const c = (col < 0 ? 0 : col >= this.width ? this.width - 1 : col) + this.padCol;
    const r = (row < 0 ? 0 : row >= this.height ? this.height - 1 : row) + this.padRow;
    const page = this.pages[(r >> PAGE_SHIFT) * this.pagesX + (c >> PAGE_SHIFT)];
    if (page === undefined) return this.overviewAt(c - this.padCol, r - this.padRow);
    return page.game[(r & PAGE_MASK) * PAGE_SIZE + (c & PAGE_MASK)] as number;
  }

  heightAt(x: number, z: number): number {
    const fc = Math.min(Math.max((x - this.origin.x) / this.cell, 0), this.width - 1);
    const fr = Math.min(Math.max((z - this.origin.z) / this.cell, 0), this.height - 1);
    const c0 = Math.floor(fc);
    const r0 = Math.floor(fr);
    const c1 = Math.min(c0 + 1, this.width - 1);
    const r1 = Math.min(r0 + 1, this.height - 1);
    const tc = fc - c0;
    const tr = fr - r0;

    const top = this.sample(c0, r0) * (1 - tc) + this.sample(c1, r0) * tc;
    const bottom = this.sample(c0, r1) * (1 - tc) + this.sample(c1, r1) * tc;
    return top * (1 - tr) + bottom * tr;
  }

  /**
   * Karadan en yakın deniz hücresine uzaklık (hücre; yoğun kipte örnek, akış kipinde genel bakış hücresi),
   * tembel hesaplanır; deniz hücreleri 0.
   */
  private seaDistanceCells: Float32Array | null = null;

  /**
   * (x, z)'den en yakın denize uzaklık (oyun m); denizdeyse 0, ızgara dışında ya da hiç deniz yoksa çok büyük.
   * Deniz hücreleri taban çukurlaştırmasından (negatif yükseklik) bilinir. İlk çağrıda bir kez hesaplanır
   * (iki geçişli mesafe dönüşümü, ~ızgara boyu); ortam sesleri bunu kullanır. Akış kipinde dönüşüm genel bakış
   * dizisi üzerindedir (en çok bir genel bakış hücresi ≈ 16 m hata).
   */
  distanceToSea(x: number, z: number): number {
    const stride = this.overview !== null ? OVERVIEW_STRIDE : 1;
    const cols = this.overview !== null ? this.overviewCols : this.width;
    const rows = this.overview !== null ? this.overviewRows : this.height;
    this.seaDistanceCells ??=
      this.overview !== null
        ? seaDistanceToLand(cols, rows, (i) => ((this.overview as Float32Array)[i] as number) >= 0)
        : seaDistanceToLand(cols, rows, (i) => this.sample(i % cols, Math.floor(i / cols)) >= 0);
    const col = Math.round((x - this.origin.x) / this.cell / stride);
    const row = Math.round((z - this.origin.z) / this.cell / stride);
    if (col < 0 || row < 0 || col >= cols || row >= rows) return Number.POSITIVE_INFINITY;
    return (this.seaDistanceCells[row * cols + col] as number) * this.cell * stride;
  }

  /** Gerçek rakım (metre): oyun yüksekliği × VERTICAL_SCALE. */
  elevationAt(x: number, z: number): number {
    return this.heightAt(x, z) * VERTICAL_SCALE;
  }

  /**
   * Oyun uzayında yerel eğim (derece), ±1 hücrelik merkezi farkla. Oyuncu eğim limiti ile
   * aynı ölçekte (dikey ölçek uygulanmış) olduğundan doğrudan karşılaştırılabilir.
   */
  slopeDegAt(x: number, z: number): number {
    const d = this.cell;
    const dx = (this.heightAt(x + d, z) - this.heightAt(x - d, z)) / (2 * d);
    const dz = (this.heightAt(x, z + d) - this.heightAt(x, z - d)) / (2 * d);
    return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
  }
}
