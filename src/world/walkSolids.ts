import { segmentBlockedByRect, type ObstacleRect } from '../placement/obstacles';

/**
 * Yürüyen gövdeler (canlı, insan, eşkıya) için yönlü katı kutu (saf mantık): yatay izdüşümü yönlü dikdörtgen, dikey
 * aralığı kutunun merkezindeki alt/üst yükseklik ve ileri yöndeki eğim (köprü güvertesi/korkuluğu yamaçta eğimlidir).
 * Gövde yalnızca ayağından `lo`…`hi` yüksekliğe kadar uzanan aralık kutuyla kesişiyorsa engeldir: köprünün altından
 * ve yerdeki yola oturan güvertenin üstünden yürünür, korkuluk ve duvar keser.
 */
export interface WalkBox {
  cx: number;
  cz: number;
  /** Yerel eksen: x = (cos, −sin), ileri = (sin, cos) (`StructureObstacles` dikdörtgenleriyle aynı sözleşme). */
  cos: number;
  sin: number;
  /** Yarı genişlik (yerel x) ve yarı uzunluk (yerel z). */
  hx: number;
  hz: number;
  /** Kutunun merkezindeki alt ve üst yükseklik (dünya y). */
  bottom: number;
  top: number;
  /** İleri yönde yatay metre başına yükseklik değişimi. */
  slope: number;
}

/** Gövdenin ayağından bu yükseklikler arasında kalan kutular engeldir (alçak plaka yürünür, yüksek tavan geçilir). */
export const WALK_BAND = { lo: 0.35, hi: 1.7 } as const;

/** Kutu (x0, z0)→(x1, z1) yürüyüşünü (yarıçap `radius`, ayak yüksekliği `ground`) keser mi? */
export function walkBoxBlocks(
  box: WalkBox,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  radius: number,
  ground: number,
): boolean {
  const along = (x1 - box.cx) * box.sin + (z1 - box.cz) * box.cos;
  const shift = box.slope * Math.max(-box.hz, Math.min(box.hz, along));
  if (box.top + shift < ground + WALK_BAND.lo) return false;
  if (box.bottom + shift > ground + WALK_BAND.hi) return false;
  const rect: ObstacleRect = {
    cx: box.cx,
    cz: box.cz,
    cos: box.cos,
    sin: box.sin,
    hx: box.hx,
    hz: box.hz,
    minX: 0,
    maxX: 0,
    minZ: 0,
    maxZ: 0,
    stamp: 0,
  };
  return segmentBlockedByRect(rect, x0, z0, x1, z1, radius);
}

/** Yaw'lı basit kutu (kamp çadırı/sandığı) → `WalkBox` (eğimsiz). `yaw` Three.js Y dönüşüdür. */
export function yawBox(b: {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
}): WalkBox {
  // Y ekseni etrafında yaw: yerel x → (cos yaw, −sin yaw), yerel z → (sin yaw, cos yaw) (dünya x, z).
  // `StructureObstacles` yerel x'i (cos, −sin) olarak okur: cos = cos(yaw), sin = sin(yaw).
  return {
    cx: b.x,
    cz: b.z,
    cos: Math.cos(b.yaw),
    sin: Math.sin(b.yaw),
    hx: b.hx,
    hz: b.hz,
    bottom: b.y - b.hy,
    top: b.y + b.hy,
    slope: 0,
  };
}
