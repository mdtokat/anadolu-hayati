import { HORIZONTAL_SCALE, SEABED, VERTICAL_SCALE } from '../config';
import type { RegionData, RegionMeta } from '../data/region';
import type { HeightSource } from './HeightSource';
import { seabedDepth, seaDistanceToLand } from './seabed';

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Gerçek bölge yüksekliği: heightmap örneklerinden bilinear aradeğerlenen oyun yüksekliği (y).
 *
 * Örnekler ızgara köşesidir (piksel merkezi) ve orijin etrafında simetriktir:
 *   x = (c − (W − 1) / 2) · cell,  z = (r − (H − 1) / 2) · cell,  cell = cellSizeReal / HORIZONTAL_SCALE.
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
  /** Oyun yüksekliği (y = metre / VERTICAL_SCALE), satır satır. */
  private readonly game: Float32Array;

  constructor(
    readonly meta: RegionMeta,
    heights: Uint16Array,
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

    this.applySeabed(heights);

    const halfX = ((this.width - 1) / 2) * this.cell;
    const halfZ = ((this.height - 1) / 2) * this.cell;
    this.bounds = { minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ };
  }

  /** Deniz hücrelerini (uint16 değeri 0) kıyıdan uzaklığa göre aşağı indirir. */
  private applySeabed(heights: Uint16Array): void {
    const distance = seaDistanceToLand(this.width, this.height, (i) => heights[i] === 0);
    const depth = seabedDepth(distance, this.cell, SEABED.slopeDeg, SEABED.maxDepth);
    for (let i = 0; i < depth.length; i++) {
      if (heights[i] === 0) this.game[i] = -(depth[i] as number);
    }
  }

  static fromRegion(region: RegionData): RegionHeightSource {
    return new RegionHeightSource(region.meta, region.heights);
  }

  /** Dünya X/Z'nin dünya içinde (heightmap kapsamında) olup olmadığı. */
  contains(x: number, z: number): boolean {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  /** Sütun c için dünya X'i. */
  xAt(col: number): number {
    return (col - (this.width - 1) / 2) * this.cell;
  }

  /** Satır r için dünya Z'si. */
  zAt(row: number): number {
    return (row - (this.height - 1) / 2) * this.cell;
  }

  /** Tam sayı örnek (kenara sıkıştırılmış): oyun yüksekliği. */
  sample(col: number, row: number): number {
    const c = Math.min(Math.max(col, 0), this.width - 1);
    const r = Math.min(Math.max(row, 0), this.height - 1);
    return this.game[r * this.width + c] as number;
  }

  heightAt(x: number, z: number): number {
    const fc = Math.min(Math.max(x / this.cell + (this.width - 1) / 2, 0), this.width - 1);
    const fr = Math.min(Math.max(z / this.cell + (this.height - 1) / 2, 0), this.height - 1);
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
    const col = Math.round(x / this.cell + (this.width - 1) / 2);
    const row = Math.round(z / this.cell + (this.height - 1) / 2);
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
