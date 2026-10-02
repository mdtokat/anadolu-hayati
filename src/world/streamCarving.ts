import { FRESH_WATER, STREAM_CARVING } from '../config';
import type { HeightGrid } from './roadGrading';

/**
 * Akarsu yatağı oyma (saf mantık): akarsu çizgileri (OSM) ile 100 m'lik yükseklik verisi tam örtüşmez; dikey ölçek de
 * yamaçları ×3,3 dikleştirdiğinden çizgi çoğu yerde vadi tabanında değil, yamacın üstünde kalır ("yan duran" dere).
 * Bu adım her akarsu boyunca bir yatak tasarlar ve araziyi ona doğru oyar:
 *
 * - Yatak yüksekliği, çizginin iki yanındaki (`lateralReach`) en alçak zemindir; akış yönünde (yüksek uçtan alçak uca)
 *   yükselmez, ama doğal zeminden en çok `maxDepth` aşağı iner.
 * - Su genişliği içinde zemin yatağın `channelDepth` altına, kıyı bandında (`bankWidth`) yumuşakça doğal zemine bağlanır.
 * - Yalnızca alçaltır (hiçbir hücre yükselmez), deniz hücrelerine dokunmaz. Yol düzeltmesinden önce çalışır: yol
 *   profili oyulmuş araziyi görür.
 */

export interface CarveStats {
  cells: number;
  maxChange: number;
}

function smoothstep(u: number): number {
  return u * u * (3 - 2 * u);
}

/** Izgarada bilinear yükseklik (örnek kenara sıkıştırılmış). */
function heightOn(grid: HeightGrid, x: number, z: number): number {
  const fc = Math.min(Math.max((x - grid.origin.x) / grid.cell, 0), grid.width - 1);
  const fr = Math.min(Math.max((z - grid.origin.z) / grid.cell, 0), grid.height - 1);
  const c0 = Math.floor(fc);
  const r0 = Math.floor(fr);
  const c1 = Math.min(c0 + 1, grid.width - 1);
  const r1 = Math.min(r0 + 1, grid.height - 1);
  const tc = fc - c0;
  const tr = fr - r0;
  const top = grid.sample(c0, r0) * (1 - tc) + grid.sample(c1, r0) * tc;
  const bottom = grid.sample(c0, r1) * (1 - tc) + grid.sample(c1, r1) * tc;
  return top * (1 - tr) + bottom * tr;
}

export function carveStreams(
  grid: HeightGrid,
  lines: ReadonlyArray<{ kind: string; xz: ArrayLike<number> }>,
): CarveStats {
  const C = STREAM_CARVING;
  const { width, height, cell, origin } = grid;
  // Hücre başına en alçak hedef (oyulmuş) yükseklik; NaN = dokunulmaz.
  const target = new Float32Array(width * height).fill(Number.NaN);
  for (const line of lines) {
    const w = (FRESH_WATER.lineWidth as Record<string, number>)[line.kind];
    if (w === undefined) continue;
    const half = w / 2;
    // Eşit aralıklı örnekler.
    const pts: number[] = [];
    const xz = line.xz;
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const ax = xz[i] as number;
      const az = xz[i + 1] as number;
      const bx = xz[i + 2] as number;
      const bz = xz[i + 3] as number;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / C.step));
      for (let k = 0; k < n; k++) pts.push(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
    }
    if (xz.length >= 2) pts.push(xz[xz.length - 2] as number, xz[xz.length - 1] as number);
    const count = pts.length / 2;
    if (count < 2) continue;
    // Yanal en alçak zemin.
    const floor = new Float64Array(count);
    const natural = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const x = pts[i * 2] as number;
      const z = pts[i * 2 + 1] as number;
      const j = Math.min(count - 1, i + 1);
      const k = Math.max(0, i - 1);
      const tx = (pts[j * 2] as number) - (pts[k * 2] as number);
      const tz = (pts[j * 2 + 1] as number) - (pts[k * 2 + 1] as number);
      const tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl;
      const nz = tx / tl;
      const h = heightOn(grid, x, z);
      natural[i] = h;
      let low = h;
      for (let o = cell / 2; o <= half + C.lateralReach; o += cell / 2) {
        low = Math.min(
          low,
          heightOn(grid, x + nx * o, z + nz * o),
          heightOn(grid, x - nx * o, z - nz * o),
        );
      }
      floor[i] = low;
    }
    // Akış yönü: yüksek uçtan alçak uca. Yatak akış yönünde yükselmez.
    const forward = (natural[0] as number) >= (natural[count - 1] as number);
    const bed = new Float64Array(count);
    let run = Number.POSITIVE_INFINITY;
    for (let s = 0; s < count; s++) {
      const i = forward ? s : count - 1 - s;
      run = Math.min(run, floor[i] as number);
      bed[i] = Math.max(run, (natural[i] as number) - C.maxDepth);
    }
    // Hücrelere: su içinde yatak − kanal derinliği, kıyıda doğal zemine yumuşak geçiş.
    const reach = half + C.bankWidth;
    for (let i = 0; i + 1 < count; i++) {
      const ax = pts[i * 2] as number;
      const az = pts[i * 2 + 1] as number;
      const bx = pts[i * 2 + 2] as number;
      const bz = pts[i * 2 + 3] as number;
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const c0 = Math.max(0, Math.ceil((Math.min(ax, bx) - reach - origin.x) / cell));
      const c1 = Math.min(width - 1, Math.floor((Math.max(ax, bx) + reach - origin.x) / cell));
      const r0 = Math.max(0, Math.ceil((Math.min(az, bz) - reach - origin.z) / cell));
      const r1 = Math.min(height - 1, Math.floor((Math.max(az, bz) + reach - origin.z) / cell));
      for (let r = r0; r <= r1; r++) {
        const z = origin.z + r * cell;
        for (let c = c0; c <= c1; c++) {
          const x = origin.x + c * cell;
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
          const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
          if (d > reach) continue;
          const at = r * width + c;
          const nat = grid.sample(c, r);
          if (nat <= 0) continue; // deniz
          const b = (bed[i] as number) + t * ((bed[i + 1] as number) - (bed[i] as number));
          const floorY = b - C.channelDepth;
          let v: number;
          if (d <= half) v = floorY;
          else v = floorY + (nat - floorY) * smoothstep((d - half) / C.bankWidth);
          if (v >= nat) continue;
          const prev = target[at] as number;
          if (Number.isNaN(prev) || v < prev) target[at] = v;
        }
      }
    }
  }
  let cells = 0;
  let maxChange = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const v = target[r * width + c] as number;
      if (Number.isNaN(v)) continue;
      const nat = grid.sample(c, r);
      // Kıyıda deniz seviyesine inmez (kıyı ovası yerleşim/kara olarak kalır).
      const value = Math.max(v, nat - C.maxDepth - C.channelDepth, C.minHeight);
      if (value >= nat - 1e-4) continue;
      grid.setSample(c, r, value);
      cells++;
      maxChange = Math.max(maxChange, nat - value);
    }
  }
  return { cells, maxChange };
}
