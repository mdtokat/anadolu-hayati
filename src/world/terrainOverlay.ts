import { FRESH_WATER, TERRAIN_OVERLAY } from '../config';
import type { ProvinceShape, WaterFeatures } from '../data/region';
import type { RoadData } from '../data/settlements';
import { roadHalfWidth } from '../settlements/roadWidth';
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

/** Kanallar (doku bileşeni sırası): R köy yolu (asfalt), G dağ patikası (toprak), B akarsu/kıyı, A il sınırı. */
export const OVERLAY_CHANNEL = { paved: 0, dirt: 1, water: 2, border: 3 } as const;
export type OverlayChannel = (typeof OVERLAY_CHANNEL)[keyof typeof OVERLAY_CHANNEL];

/**
 * İkinci doku (yol dokusu) kanalları: R anayol, G kent sokağı (uzaklık), B/A anayol boyunca konum evresinin kosinüs ve
 * sinüsü (`128 + 127 · cos/sin`; kesik orta şerit). Evre iki kanaldadır: doğrusal aradeğerleme sarmada bozulmasın.
 */
export const ROAD_CHANNEL = { main: 0, street: 1, cos: 2, sin: 3 } as const;

/** Kaplama ızgarası: arazi ızgarasıyla aynı (hücre merkezleri `origin + (c, r) · cell`). */
export interface OverlayGrid {
  width: number;
  height: number;
  cell: number;
  origin: { x: number; z: number };
}

/** Kenar uzaklığı (oyun m) → bayt. `scale`: bayt/m (varsayılan `TERRAIN_OVERLAY.scale`). */
export function encodeOverlay(distance: number, scale: number = TERRAIN_OVERLAY.scale): number {
  const v = Math.round(128 + distance * scale);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Bayt → kenar uzaklığı (oyun m); 255 "uzak" demektir. */
export function decodeOverlay(value: number, scale: number = TERRAIN_OVERLAY.scale): number {
  return (value - 128) / scale;
}

/** Rasterleme seçenekleri: genel bakış (16 m hücre) kaplaması daha kaba kodlama ve geniş erişim kullanır. */
export interface RasterOptions {
  /** Bayt/m (kodlama ölçeği). */
  scale?: number;
  /** Özellik kenarından en çok bu kadar (oyun m) dışarı taşar. */
  reach?: number;
}

export class OverlayRaster {
  /** RGBA, satır satır (satır 0 kuzeyde: en küçük z). */
  readonly data: Uint8Array;
  /** Bu rasterin kodlama ölçeği (shader `uOverlayScale` ile aynı olmalı). */
  readonly scale: number;
  private readonly reach: number;

  constructor(
    readonly grid: OverlayGrid,
    options: RasterOptions = {},
  ) {
    this.scale = options.scale ?? TERRAIN_OVERLAY.scale;
    this.reach = Math.min(127 / this.scale, options.reach ?? TERRAIN_OVERLAY.rasterReach);
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
    const pad = half + this.reach;
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
        const v = encodeOverlay(d, this.scale);
        if (v < (data[i] as number)) data[i] = v;
      }
    }
  }

  /**
   * Anayol parçası (yol dokusu): R kanalına kenar uzaklığı, B/A kanallarına yol boyu konumun evresi (`s0` parçanın
   * başındaki yol boyu konum, `period` kesik çizgi dönemi). Hücre en yakın parçanın evresini alır.
   */
  segmentPhase(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    half: number,
    s0: number,
    period: number,
  ): void {
    const { width, height, cell, origin } = this.grid;
    const pad = half + this.reach;
    const pad2 = pad * pad;
    const c0 = Math.max(0, Math.ceil((Math.min(ax, bx) - pad - origin.x) / cell));
    const c1 = Math.min(width - 1, Math.floor((Math.max(ax, bx) + pad - origin.x) / cell));
    const r0 = Math.max(0, Math.ceil((Math.min(az, bz) - pad - origin.z) / cell));
    const r1 = Math.min(height - 1, Math.floor((Math.max(az, bz) + pad - origin.z) / cell));
    if (c0 > c1 || r0 > r1) return;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const len = Math.sqrt(len2);
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
        const i = (r * width + c) * 4;
        const v = encodeOverlay(Math.sqrt(d2) - half, this.scale);
        if (v >= (data[i + ROAD_CHANNEL.main] as number)) continue;
        data[i + ROAD_CHANNEL.main] = v;
        const phase = ((s0 + t * len) / period) * Math.PI * 2;
        data[i + ROAD_CHANNEL.cos] = Math.round(128 + 127 * Math.cos(phase));
        data[i + ROAD_CHANNEL.sin] = Math.round(128 + 127 * Math.sin(phase));
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
    if (c < 0 || r < 0 || c + 1 >= width || r + 1 >= height) return decodeOverlay(255, this.scale);
    const tx = fc - c;
    const tz = fr - r;
    const at = (cc: number, rr: number) => this.data[(rr * width + cc) * 4 + channel] as number;
    const top = at(c, r) * (1 - tx) + at(c + 1, r) * tx;
    const bottom = at(c, r + 1) * (1 - tx) + at(c + 1, r + 1) * tx;
    return decodeOverlay(top * (1 - tz) + bottom * tz, this.scale);
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

/**
 * Tüm katmanları rasterler (ana doku): köy yolu, dağ patikası, akarsular, il sınırı. Anayol ve kent sokağı ikinci
 * dokudadır (`buildRoadOverlay`).
 */
export function buildTerrainOverlay(
  grid: OverlayGrid,
  sources: OverlaySources,
  options: RasterOptions = {},
): OverlayRaster {
  const steps = buildTerrainOverlaySteps(grid, sources, options, Infinity);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/** `buildTerrainOverlay`'in dilimli hâli (aynı sonuç): her `vertsPerStep` çizgi köşesinde bir `yield` eder. */
export function* buildTerrainOverlaySteps(
  grid: OverlayGrid,
  sources: OverlaySources,
  options: RasterOptions = {},
  vertsPerStep = 400,
): Generator<void, OverlayRaster> {
  const raster = new OverlayRaster(grid, options);
  let work = 0;
  const tick = (xz: ArrayLike<number>): boolean => {
    work += xz.length / 2;
    if (work < vertsPerStep) return false;
    work = 0;
    return true;
  };
  for (const road of sources.roads ?? []) {
    if (road.cls === 1) raster.polyline(OVERLAY_CHANNEL.paved, road.xz, roadHalfWidth(road));
    else if (road.cls === 2) raster.polyline(OVERLAY_CHANNEL.dirt, road.xz, roadHalfWidth(road));
    if (tick(road.xz)) yield;
  }
  const water = sources.water;
  if (water) {
    for (const line of water.lines) {
      raster.polyline(OVERLAY_CHANNEL.water, line.xz, waterLineHalfWidth(line.kind));
      if (tick(line.xz)) yield;
    }
    // Göl/gölet kıyısı: kenar çizgisi (yarı genişlik 0) — içi göl yüzeyi mesh'iyle örtülür, kanal kıyı bandını verir.
    for (const polygon of water.polygons) {
      for (const ring of polygon.rings) {
        raster.polyline(OVERLAY_CHANNEL.water, ring, 0, true);
        if (tick(ring)) yield;
      }
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

/**
 * Yol dokusu: anayollar (R + kesik orta şerit evresi B/A) ve kent sokakları (G). Boş hücre 255 (uzak), evre 128 (sıfır).
 */
export function buildRoadOverlay(
  grid: OverlayGrid,
  roads: readonly RoadData[],
  options: RasterOptions = {},
): OverlayRaster {
  const steps = buildRoadOverlaySteps(grid, roads, options, Infinity);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/** `buildRoadOverlay`'in dilimli hâli (aynı sonuç): her `vertsPerStep` çizgi köşesinde bir `yield` eder. */
export function* buildRoadOverlaySteps(
  grid: OverlayGrid,
  roads: readonly RoadData[],
  options: RasterOptions = {},
  vertsPerStep = 400,
): Generator<void, OverlayRaster> {
  const raster = new OverlayRaster(grid, options);
  const data = raster.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i + ROAD_CHANNEL.cos] = 128;
    data[i + ROAD_CHANNEL.sin] = 128;
  }
  let work = 0;
  for (const road of roads) {
    work += road.xz.length / 2;
    if (work >= vertsPerStep) {
      work = 0;
      yield;
    }
    if (road.cls === 3) {
      raster.polyline(ROAD_CHANNEL.street as OverlayChannel, road.xz, roadHalfWidth(road));
      continue;
    }
    if (road.cls !== 0) continue;
    const half = roadHalfWidth(road);
    let s = 0;
    for (let i = 0; i + 3 < road.xz.length; i += 2) {
      const ax = road.xz[i] as number;
      const az = road.xz[i + 1] as number;
      const bx = road.xz[i + 2] as number;
      const bz = road.xz[i + 3] as number;
      raster.segmentPhase(ax, az, bx, bz, half, s, TERRAIN_OVERLAY.dashPeriod);
      s += Math.hypot(bx - ax, bz - az);
    }
  }
  return raster;
}
