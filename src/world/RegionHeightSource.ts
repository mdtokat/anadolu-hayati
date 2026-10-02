import { HORIZONTAL_SCALE, SEABED, TERRAIN_SMOOTHING, VERTICAL_SCALE } from '../config';
import type { RegionData, RegionMeta } from '../data/region';
import type { HeightSource } from './HeightSource';
import { seabedDepth, seaDistanceToLand } from './seabed';
import { smoothLand } from './terrainSmoothing';

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
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
 */
export class RegionHeightSource implements HeightSource {
  /** Izgara hücre boyu (oyun metresi). */
  readonly cell: number;
  readonly width: number;
  readonly height: number;
  readonly bounds: Bounds;
  /** Dizinin (0, 0) örneğinin konumu (oyun m): `meta.gridOrigin`. */
  readonly origin: { x: number; z: number };
  /** Oyun yüksekliği (y = metre / VERTICAL_SCALE), satır satır. */
  private readonly game: Float32Array;

  /**
   * Yumuşatma uygulandıysa ham (uint16) örnekler: nesne dağılımı bunları okur (`scatterView`). Yumuşatılmamış
   * kaynakta null (dağılım `natural()` ile aynıdır).
   */
  private readonly raw: Uint16Array | null;

  constructor(
    readonly meta: RegionMeta,
    heights: Uint16Array,
    options: { smooth?: boolean } = {},
  ) {
    this.width = meta.gridWidth;
    this.height = meta.gridHeight;
    this.cell = meta.cellSizeReal / HORIZONTAL_SCALE;

    const range = meta.elevationMax - meta.elevationMin;
    this.game = new Float32Array(heights.length);
    for (let i = 0; i < heights.length; i++) {
      this.game[i] =
        (meta.elevationMin + ((heights[i] as number) / 65535) * range) / VERTICAL_SCALE;
    }

    // Küçük tümsekler (deve sırtı) düzlenir; deniz hücreleri ve kıyı çizgisi değişmez (TERRAIN_SMOOTHING).
    const smooth = options.smooth === true && TERRAIN_SMOOTHING.sigmaCells > 0;
    this.raw = smooth ? heights : null;
    if (smooth) {
      smoothLand(
        this.game,
        this.width,
        this.height,
        (i) => heights[i] !== 0,
        TERRAIN_SMOOTHING.sigmaCells,
        TERRAIN_SMOOTHING.strength,
      );
    }
    this.applySeabed(heights);

    this.origin = { x: meta.gridOrigin.x, z: meta.gridOrigin.z };
    this.bounds = {
      minX: this.origin.x,
      maxX: this.origin.x + (this.width - 1) * this.cell,
      minZ: this.origin.z,
      maxZ: this.origin.z + (this.height - 1) * this.cell,
    };
  }

  /** Deniz hücrelerini (uint16 değeri 0) kıyıdan uzaklığa göre aşağı indirir. */
  private applySeabed(heights: Uint16Array): void {
    const distance = seaDistanceToLand(this.width, this.height, (i) => heights[i] === 0);
    const depth = seabedDepth(distance, this.cell, SEABED.slopeDeg, SEABED.maxDepth);
    for (let i = 0; i < depth.length; i++) {
      if (heights[i] === 0) this.game[i] = -(depth[i] as number);
    }
  }

  /** Oyunun yükseklik kaynağı: yumuşatılmış (`TERRAIN_SMOOTHING`); `smooth: false` ham veriyi verir. */
  static fromRegion(region: RegionData, options: { smooth?: boolean } = {}): RegionHeightSource {
    return new RegionHeightSource(region.meta, region.heights, {
      smooth: options.smooth ?? true,
    });
  }

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

  /**
   * Yol düzeltmesinden önceki (doğal) yükseklikler; düzeltme yoksa null. Nesne dağılımı (eğim/rakım elemesi)
   * doğal araziye göre yapılır: yol düzeltmesi nesne kimliklerini kaydırmasın.
   */
  private base: Float32Array | null = null;

  /** Izgara örneğini değiştirir (yol düzeltmesi). İlk değişiklikte doğal yükseklikler saklanır. */
  setSample(col: number, row: number, value: number): void {
    this.base ??= new Float32Array(this.game);
    this.game[row * this.width + col] = value;
  }

  /** Sonraki düzeltmelerin (yapı terası) değiştirmeyeceği hücreler: yol yatağı, yapı ayak izi. Tembel açılır. */
  private locked: Uint8Array | null = null;

  lock(col: number, row: number): void {
    this.locked ??= new Uint8Array(this.width * this.height);
    this.locked[row * this.width + col] = 1;
  }

  isLocked(col: number, row: number): boolean {
    return this.locked !== null && this.locked[row * this.width + col] === 1;
  }

  /** Yol düzeltmesi uygulandı mı? */
  get graded(): boolean {
    return this.base !== null;
  }

  /**
   * Doğal (düzeltilmemiş) araziyi okuyan görünüm: `heightAt`, `slopeDegAt`, `elevationAt`. Düzeltme yoksa kaynağın
   * kendisi gibi davranır. Yol planı doğal araziden tasarlanır; nesne dağılımı da doğal eğimi kullanır.
   */
  natural(): Pick<RegionHeightSource, 'heightAt' | 'elevationAt' | 'slopeDegAt'> {
    return this.view((i) => (this.base ?? this.game)[i] as number);
  }

  /**
   * Nesne dağılımının okuduğu arazi: yumuşatma ve düzeltmeden önceki ham veri (deniz tabanı dahil). Nesne kimlikleri
   * (`PropId`) dağılıma bağlı olduğundan arazi yumuşatması onları kaydırmasın. Yumuşatılmamış kaynakta `natural()`.
   */
  scatterView(): Pick<RegionHeightSource, 'heightAt' | 'elevationAt' | 'slopeDegAt'> {
    const raw = this.raw;
    if (raw === null) return this.natural();
    const { elevationMin, elevationMax } = this.meta;
    const range = elevationMax - elevationMin;
    return this.view((i) => {
      const v = raw[i] as number;
      // Deniz hücreleri yumuşatılmaz: çukurlaştırılmış taban olduğu gibi okunur.
      if (v === 0) return (this.base ?? this.game)[i] as number;
      // Kaynakla aynı float32 yuvarlaması: dağılım (ve kimlikler) yumuşatmasız kaynakla bit-eşdeğer kalsın.
      return Math.fround((elevationMin + (v / 65535) * range) / VERTICAL_SCALE);
    });
  }

  private view(
    sample: (index: number) => number,
  ): Pick<RegionHeightSource, 'heightAt' | 'elevationAt' | 'slopeDegAt'> {
    const read = (col: number, row: number): number => {
      const c = Math.min(Math.max(col, 0), this.width - 1);
      const r = Math.min(Math.max(row, 0), this.height - 1);
      return sample(r * this.width + c);
    };
    const heightAt = (x: number, z: number): number => {
      const fc = Math.min(Math.max((x - this.origin.x) / this.cell, 0), this.width - 1);
      const fr = Math.min(Math.max((z - this.origin.z) / this.cell, 0), this.height - 1);
      const c0 = Math.floor(fc);
      const r0 = Math.floor(fr);
      const tc = fc - c0;
      const tr = fr - r0;
      const top = read(c0, r0) * (1 - tc) + read(c0 + 1, r0) * tc;
      const bottom = read(c0, r0 + 1) * (1 - tc) + read(c0 + 1, r0 + 1) * tc;
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
    const c = Math.min(Math.max(col, 0), this.width - 1);
    const r = Math.min(Math.max(row, 0), this.height - 1);
    return this.game[r * this.width + c] as number;
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

  /** Karadan en yakın deniz hücresine uzaklık (hücre cinsinden), tembel hesaplanır; deniz hücreleri 0. */
  private seaDistanceCells: Float32Array | null = null;

  /**
   * (x, z)'den en yakın denize uzaklık (oyun m); denizdeyse 0, ızgara dışında ya da hiç deniz yoksa çok büyük.
   * Deniz hücreleri taban çukurlaştırmasından (negatif yükseklik) bilinir. İlk çağrıda bir kez hesaplanır
   * (iki geçişli mesafe dönüşümü, ~ızgara boyu); ortam sesleri bunu kullanır.
   */
  distanceToSea(x: number, z: number): number {
    this.seaDistanceCells ??= seaDistanceToLand(
      this.width,
      this.height,
      (i) => (this.game[i] as number) >= 0,
    );
    const col = Math.round((x - this.origin.x) / this.cell);
    const row = Math.round((z - this.origin.z) / this.cell);
    if (col < 0 || row < 0 || col >= this.width || row >= this.height)
      return Number.POSITIVE_INFINITY;
    return (this.seaDistanceCells[row * this.width + col] as number) * this.cell;
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
