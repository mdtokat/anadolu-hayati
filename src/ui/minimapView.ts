import { MINIMAP, TERRAIN_LOOK, WATER } from '../config';
import type { LandCoverClass } from '../data/landcover';

/**
 * Mini haritanın saf görünüm mantığı (Three.js'siz, DOM'suz; `ui/Minimap.ts` çizer): taban görüntüsünün renkleri
 * (arazi örtüsü + rakım + eğim ışığı, deniz), dünya → harita pikseli dönüşümü ve taban görüntüsünün ne zaman yeniden
 * örnekleneceği. Kuzey (−Z) yukarıdadır.
 */

export type Rgb = readonly [number, number, number];

const hex = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

const COVER_RGB: Partial<Record<LandCoverClass, Rgb>> = Object.fromEntries(
  Object.entries(TERRAIN_LOOK.cover).map(([k, v]) => [k, hex(v)]),
);
const SEA = hex(MINIMAP.colors.sea);
const SEA_DEEP = hex(MINIMAP.colors.seaDeep);
const BARE = hex(MINIMAP.colors.bare);

/** Deniz mi (zemin su düzleminin altında)? */
export function isSeaHeight(height: number): boolean {
  return height < WATER.level;
}

/**
 * Taban görüntüsünün bir pikseli: denizde derinliğe göre mavi, karada arazi örtüsü rengi (yoksa çıplak), rakımla hafif
 * açılır; `shade` eğim ışığıdır (−1 gölge … +1 aydınlık; kuzeybatıdan ışık).
 */
export function rasterColor(cover: LandCoverClass, height: number, shade: number): Rgb {
  if (isSeaHeight(height)) {
    const t = Math.min(Math.max(-height / 6, 0), 1);
    return mix(SEA, SEA_DEEP, t);
  }
  const base = COVER_RGB[cover] ?? BARE;
  const lift = Math.min(Math.max(height / 160, 0), 1) * 0.18;
  const k = 1 + Math.min(Math.max(shade, -1), 1) * 0.35 * MINIMAP.hillshade + lift;
  return [clamp255(base[0] * k), clamp255(base[1] * k), clamp255(base[2] * k)];
}

/**
 * Eğim ışığı: kuzeybatıdaki komşuyla (`hNW`) yükseklik farkı, örnek aralığına (`step`, oyun m) bölünür. Pozitif = ışığa
 * dönük yamaç.
 */
export function slopeShade(h: number, hNW: number, step: number): number {
  return ((h - hNW) / Math.max(step, 1e-6)) * 1.4;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function clamp255(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

/** Taban görüntüsü: merkezi ve kenarı (oyun m). */
export interface RasterFrame {
  cx: number;
  cz: number;
  span: number;
}

/** Oyuncunun görüş karesi (merkez ± `radius`) tabanın içinde değilse (payıyla) yeniden örneklenir. */
export function needsRebase(
  frame: RasterFrame | null,
  x: number,
  z: number,
  radius: number,
): boolean {
  if (!frame) return true;
  const half = frame.span / 2;
  const margin = radius * 1.05;
  return Math.abs(x - frame.cx) + margin > half || Math.abs(z - frame.cz) + margin > half;
}

/** Yeni taban görüntüsünün çerçevesi (oyuncu merkezde). */
export function frameAround(x: number, z: number, radius: number): RasterFrame {
  return { cx: x, cz: z, span: 2 * radius * MINIMAP.rasterSpan };
}

/** Harita pikseli dönüşümü: oyuncu ortada, kuzey yukarı. `size` piksel çapı `2 · radius` oyun metresidir. */
export function mapTransform(
  center: { x: number; z: number },
  radius: number,
  size: number,
): { scale: number; toPx(x: number, z: number): { x: number; y: number } } {
  const scale = size / (2 * radius);
  const half = size / 2;
  return {
    scale,
    toPx: (x, z) => ({ x: half + (x - center.x) * scale, y: half + (z - center.z) * scale }),
  };
}

/** Bir çoklu çizginin sınır kutusu bir karenin (merkez ± yarı kenar) içine değiyor mu? */
export function boundsTouch(
  b: { minX: number; minZ: number; maxX: number; maxZ: number },
  x: number,
  z: number,
  half: number,
): boolean {
  return b.maxX >= x - half && b.minX <= x + half && b.maxZ >= z - half && b.minZ <= z + half;
}

/** [x0, z0, x1, z1, …] dizisinin sınır kutusu. */
export function lineBounds(xz: ArrayLike<number>): {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
} {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 1 < xz.length; i += 2) {
    const x = xz[i] as number;
    const z = xz[i + 1] as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

/**
 * Mini harita görünür mü? Hayatta kalmada envanterde Harita varken; **Son Kalan'da hiç** (orada yalnızca büyük harita,
 * `M`). Ölüyken ve oyun duraklıyken gizlenir.
 */
export function minimapVisible(opts: {
  battleRoyale: boolean;
  hasMap: boolean;
  alive: boolean;
  paused: boolean;
}): boolean {
  if (!opts.alive || opts.paused || opts.battleRoyale) return false;
  return opts.hasMap;
}
