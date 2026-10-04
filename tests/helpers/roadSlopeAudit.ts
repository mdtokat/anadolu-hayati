import type { RoadData } from '../../src/data/settlements';
import { roadWidth } from '../../src/settlements/roadWidth';

/**
 * Yol yüzeyinin eğim denetimi: boyanan yol çizgileri `step` aralıkla örneklenir; her örnekte yolun iki kenarı (yarı
 * genişlik − `inset`) arasındaki yükseklik farkı / genişlik = enine eğim (yan yatma), ardışık örnekler arası = boyuna eğim.
 */
export interface SlopeStats {
  samples: number;
  /** Enine eğimi 0,15'i (≈ 8,5°) ve 0,3'ü (≈ 17°) aşan örnek oranı. */
  cross15: number;
  cross30: number;
  crossP95: number;
  /** Boyuna eğimi 0,4'ü aşan örnek oranı. */
  long40: number;
}

export function roadSlopeStats(
  lines: readonly RoadData[],
  heightAt: (x: number, z: number) => number,
  step = 3,
  inset = 0.4,
): SlopeStats {
  const crosses: number[] = [];
  let long40 = 0;
  let longN = 0;
  for (const line of lines) {
    const half = Math.max(0.6, roadWidth(line) / 2 - inset);
    const xz = line.xz;
    let prev: { x: number; z: number; h: number } | null = null;
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const ax = xz[i]!;
      const az = xz[i + 1]!;
      const bx = xz[i + 2]!;
      const bz = xz[i + 3]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const n = Math.max(1, Math.round(len / step));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        const hl = heightAt(x + nx * half, z + nz * half);
        const hr = heightAt(x - nx * half, z - nz * half);
        if (hl <= 0.05 || hr <= 0.05) continue; // deniz/kıyı
        crosses.push(Math.abs(hl - hr) / (2 * half));
        const h = heightAt(x, z);
        if (prev) {
          const d = Math.hypot(x - prev.x, z - prev.z);
          if (d > 0.5) {
            longN++;
            if (Math.abs(h - prev.h) / d > 0.4) long40++;
          }
        }
        prev = { x, z, h };
      }
    }
  }
  const sorted = Float64Array.from(crosses).sort();
  const share = (t: number) => crosses.filter((c) => c > t).length / Math.max(1, crosses.length);
  return {
    samples: crosses.length,
    cross15: share(0.15),
    cross30: share(0.3),
    crossP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    long40: long40 / Math.max(1, longN),
  };
}

export function byClass(lines: readonly RoadData[]): Map<number, RoadData[]> {
  const out = new Map<number, RoadData[]>();
  for (const l of lines) {
    const list = out.get(l.cls) ?? [];
    list.push(l);
    out.set(l.cls, list);
  }
  return out;
}
