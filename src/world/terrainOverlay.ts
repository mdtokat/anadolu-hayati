import { FRESH_WATER, ROADS, TERRAIN_OVERLAY } from '../config';
import type { ProvinceShape, WaterFeatures } from '../data/region';
import type { RoadData } from '../data/settlements';
import { provinceAt } from './provinces';

/**
 * Arazi kaplaması (saf mantık, Three.js'siz): yollar, akarsular ve il sınırları arazinin kendi shader'ında boyanır
 * (`TerrainMaterial`). Ayrı şerit mesh'leri dik yamaçta havada kalıyor, uzak LOD'larda arazinin altına giriyor ve
 * birbirine karışıyordu; boyama her LOD'da zemine tam oturur ve draw call istemez.
 *
 * Biçim: arazi ızgarasıyla aynı kafeste (hücre merkezleri) RGBA8 doku; her kanal bir özelliğin **işaretli kenar
 * uzaklığıdır** (oyun m; içeride negatif): R asfalt (sınıf 0–1 ve kent sokakları), G köy yolu (sınıf 2), B akarsu
 * (kenar) ve göl kıyısı, A il sınırı. Kodlama `128 + d · scale` (0–255'e kırpılır; uzak = 255). Uzaklık alanı
 * doğrusal süzgeçle aradeğerlendiğinden 2 m'lik hücrede bile kenarlar keskin kalır (yarı genişlik ≥ 1 m olmalı:
 * daha dar özellik hücre içinde kopuk görünür, bu yüzden `minHalfWidth`).
 */

/** Kanallar (doku bileşeni sırası). */
export const OVERLAY_CHANNEL = { paved: 0, dirt: 1, water: 2, border: 3 } as const;
export type OverlayChannel = (typeof OVERLAY_CHANNEL)[keyof typeof OVERLAY_CHANNEL];

/** Kaplama ızgarası: arazi ızgarasıyla aynı (hücre merkezleri `origin + (c, r) · cell`). */
export interface OverlayGrid {
  width: number;
  height: number;
  cell: number;
  origin: { x: number; z: number };
}

/** Kenar uzaklığı (oyun m) → bayt. */
export function encodeOverlay(distance: number): number {
  const v = Math.round(128 + distance * TERRAIN_OVERLAY.scale);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Bayt → kenar uzaklığı (oyun m); 255 "uzak" demektir. */
export function decodeOverlay(value: number): number {
  return (value - 128) / TERRAIN_OVERLAY.scale;
}

/**
 * Rasterlemenin özellik kenarından dışarı taştığı uzaklık (oyun m): kodlanabilen aralık ile `rasterReach`'in küçüğü.
 * Ötesi "uzak" (255) kalır; shader'ın baktığı en geniş bant (kıyı) + bir hücre köşegeni yeterlidir.
 */
const REACH = Math.min(127 / TERRAIN_OVERLAY.scale, TERRAIN_OVERLAY.rasterReach);

export class OverlayRaster {
  /** RGBA, satır satır (satır 0 kuzeyde: en küçük z). */
  readonly data: Uint8Array;

  constructor(readonly grid: OverlayGrid) {
    this.data = new Uint8Array(grid.width * grid.height * 4).fill(255);
  }

  /** Parçayı (yarı genişlik `half`) kanala işler: her hücre en küçük kenar uzaklığını tutar. */
  segment(
    channel: OverlayChannel,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    half: number,
  ): void {
    const { width, height, cell, origin } = this.grid;
    const pad = half + REACH;
    const pad2 = pad * pad;
    const c0 = Math.max(0, Math.ceil((Math.min(ax, bx) - pad - origin.x) / cell));
    const c1 = Math.min(width - 1, Math.floor((Math.max(ax, bx) + pad - origin.x) / cell));
    const r0 = Math.max(0, Math.ceil((Math.min(az, bz) - pad - origin.z) / cell));
    const r1 = Math.min(height - 1, Math.floor((Math.max(az, bz) + pad - origin.z) / cell));
    if (c0 > c1 || r0 > r1) return;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const data = this.data;
    for (let r = r0; r <= r1; r++) {
      const z = origin.z + r * cell;
      for (let c = c0; c <= c1; c++) {
        const x = origin.x + c * cell;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
        const px = x - (ax + t * dx);
        const pz = z - (az + t * dz);
        const d2 = px * px + pz * pz;
        if (d2 >= pad2) continue;
        const d = Math.sqrt(d2) - half;
        const i = (r * width + c) * 4 + channel;
        const v = encodeOverlay(d);
        if (v < (data[i] as number)) data[i] = v;
      }
    }
  }

  /** Çoklu çizgiyi ([x0, z0, x1, z1, …]) işler; `closed` ise son nokta ilkine bağlanır. */
  polyline(channel: OverlayChannel, xz: ArrayLike<number>, half: number, closed = false): void {
    const n = Math.floor(xz.length / 2);
    for (let i = 0; i + 1 < n; i++) {
      this.segment(
        channel,
        xz[i * 2] as number,
        xz[i * 2 + 1] as number,
        xz[i * 2 + 2] as number,
        xz[i * 2 + 3] as number,
        half,
      );
    }
    if (closed && n > 2) {
      this.segment(
        channel,
        xz[(n - 1) * 2] as number,
        xz[(n - 1) * 2 + 1] as number,
        xz[0] as number,
        xz[1] as number,
        half,
      );
    }
  }

  /** (x, z)'de kanalın kenar uzaklığı (doğrusal aradeğerleme; shader'ın gördüğüyle aynı). Izgara dışı: uzak. */
  distanceAt(channel: OverlayChannel, x: number, z: number): number {
    const { width, height, cell, origin } = this.grid;
    const fc = (x - origin.x) / cell;
    const fr = (z - origin.z) / cell;
    const c = Math.floor(fc);
    const r = Math.floor(fr);
    if (c < 0 || r < 0 || c + 1 >= width || r + 1 >= height) return decodeOverlay(255);
    const tx = fc - c;
    const tz = fr - r;
    const at = (cc: number, rr: number) => this.data[(rr * width + cc) * 4 + channel] as number;
    const top = at(c, r) * (1 - tx) + at(c + 1, r) * tx;
    const bottom = at(c, r + 1) * (1 - tx) + at(c + 1, r + 1) * tx;
    return decodeOverlay(top * (1 - tz) + bottom * tz);
  }
}

/** Akarsu türünün boyama yarı genişliği (oyun m; çok dar dereler `minHalfWidth`'e genişletilir). */
export function waterLineHalfWidth(kind: keyof typeof FRESH_WATER.lineWidth): number {
  return Math.max(FRESH_WATER.lineWidth[kind] / 2, TERRAIN_OVERLAY.minHalfWidth);
}

/**
 * İller arası (kara) sınır parçaları: il çokgenlerinin kenarları `BORDER_PIECE` uzunluğunda parçalanır, parçanın
 * iki yanında başka bir il varsa tutulur. Kıyı (öte yanı deniz ya da ilsiz kıyı şeridi) ve dünya kenarı elenir:
 * deniz kıyısı boyunca il sınırı çizilmez. Dönüş: [ax, az, bx, bz] dörtlüleri.
 */
export function landBorderSegments(provinces: readonly ProvinceShape[]): number[] {
  const out: number[] = [];
  const piece = TERRAIN_OVERLAY.borderPiece;
  const probe = TERRAIN_OVERLAY.borderProbe;
  for (const province of provinces) {
    for (const polygon of province.polygons) {
      for (const ring of polygon) {
        for (let i = 0; i + 3 < ring.length; i += 2) {
          const x0 = ring[i] as number;
          const z0 = ring[i + 1] as number;
          const x1 = ring[i + 2] as number;
          const z1 = ring[i + 3] as number;
          const len = Math.hypot(x1 - x0, z1 - z0);
          if (len < 1e-6) continue;
          const nx = -(z1 - z0) / len;
          const nz = (x1 - x0) / len;
          const n = Math.max(1, Math.ceil(len / piece));
          for (let k = 0; k < n; k++) {
            const ax = x0 + ((x1 - x0) * k) / n;
            const az = z0 + ((z1 - z0) * k) / n;
            const bx = x0 + ((x1 - x0) * (k + 1)) / n;
            const bz = z0 + ((z1 - z0) * (k + 1)) / n;
            const mx = (ax + bx) / 2;
            const mz = (az + bz) / 2;
            const left = provinceAt(provinces, mx + nx * probe, mz + nz * probe);
            const right = provinceAt(provinces, mx - nx * probe, mz - nz * probe);
            if (left && right && left !== right) out.push(ax, az, bx, bz);
          }
        }
      }
    }
  }
  return out;
}

/** Kaplamanın kaynakları; olmayan katman boş kalır. */
export interface OverlaySources {
  roads?: readonly RoadData[];
  water?: WaterFeatures | null;
  /** `landBorderSegments` çıktısı. */
  borders?: readonly number[];
}

/** Tüm katmanları rasterler. */
export function buildTerrainOverlay(grid: OverlayGrid, sources: OverlaySources): OverlayRaster {
  const raster = new OverlayRaster(grid);
  for (const road of sources.roads ?? []) {
    const channel = road.cls === 2 ? OVERLAY_CHANNEL.dirt : OVERLAY_CHANNEL.paved;
    raster.polyline(channel, road.xz, (ROADS.width[road.cls] as number) / 2);
  }
  const water = sources.water;
  if (water) {
    for (const line of water.lines) {
      raster.polyline(OVERLAY_CHANNEL.water, line.xz, waterLineHalfWidth(line.kind));
    }
    // Göl/gölet kıyısı: kenar çizgisi (yarı genişlik 0) — içi göl yüzeyi mesh'iyle örtülür, kanal kıyı bandını verir.
    for (const polygon of water.polygons) {
      for (const ring of polygon.rings) raster.polyline(OVERLAY_CHANNEL.water, ring, 0, true);
    }
  }
  const borders = sources.borders ?? [];
  for (let i = 0; i + 3 < borders.length; i += 4) {
    raster.segment(
      OVERLAY_CHANNEL.border,
      borders[i] as number,
      borders[i + 1] as number,
      borders[i + 2] as number,
      borders[i + 3] as number,
      0,
    );
  }
  return raster;
}
