import { SETTLEMENT_LAYOUT } from '../config';
import { ROADS } from '../config';
import type { OrientedBox } from '../settlements/footprints';
import type { HeightGrid } from './roadGrading';

/**
 * Yapı terasları (saf mantık): dik arazide bir yapının ayak izi düzlenir; çevresine yumuşak bir şevle bağlanır. Yol
 * yatakları ve daha önce kurulmuş yapıların ayak izleri kilitlidir, değişmez. Kasabalar dik yamaçlardadır; teras
 * olmadan yapı yamaca gömülür ya da yüksek bir temele oturur, çoğu parsel elenirdi.
 */

/** Teras ızgarası: yükseklik ızgarası + kilit maskesi. */
export interface PadGrid extends HeightGrid {
  isLocked(col: number, row: number): boolean;
  lock(col: number, row: number): void;
}

function smoothstep(u: number): number {
  return u * u * (3 - 2 * u);
}

/**
 * `box` ayak izini `y` seviyesine düzler ve çevresine şevle bağlar. Ayak izi ve ona yarım hücre kadar yakın hücreler
 * kilitlenir (ayak izi kenarındaki aradeğerleme bu hücrelere dayanır): sonraki yapıların terası bu yapının zeminini
 * değiştirmez; kilitli hücreler sonraki teraslarda olduğu gibi kalır.
 */
export function levelPad(grid: PadGrid, box: OrientedBox, y: number): void {
  const { width, height, cell, origin } = grid;
  const reach = Math.hypot(box.hx, box.hz) + SETTLEMENT_LAYOUT.padBlend;
  const c0 = Math.max(0, Math.floor((box.x - reach - origin.x) / cell));
  const c1 = Math.min(width - 1, Math.ceil((box.x + reach - origin.x) / cell));
  const r0 = Math.max(0, Math.floor((box.z - reach - origin.z) / cell));
  const r1 = Math.min(height - 1, Math.ceil((box.z + reach - origin.z) / cell));
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  for (let r = r0; r <= r1; r++) {
    const z = origin.z + r * cell;
    for (let c = c0; c <= c1; c++) {
      if (grid.isLocked(c, r)) continue;
      const x = origin.x + c * cell;
      const dx = x - box.x;
      const dz = z - box.z;
      // Dünya → yapı yerel (yapılarla aynı kural).
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const outX = Math.max(Math.abs(lx) - box.hx, 0);
      const outZ = Math.max(Math.abs(lz) - box.hz, 0);
      const d = Math.hypot(outX, outZ);
      const natural = grid.sample(c, r);
      if (natural <= 0.05) continue; // deniz / kıyı çizgisi
      if (d <= 0) {
        grid.setSample(c, r, Math.max(y, ROADS.minBedHeight));
        grid.lock(c, r);
        continue;
      }
      const delta = natural - y;
      const batter = delta > 0 ? ROADS.batterCut : ROADS.batterFill;
      const blend = Math.min(
        SETTLEMENT_LAYOUT.padBlend,
        Math.max(ROADS.minBlend, Math.abs(delta) / batter),
      );
      const u = d / blend;
      if (u >= 1) continue;
      const value = y + delta * smoothstep(u);
      const clamped = Math.min(
        Math.max(value, natural - ROADS.maxEdgeChange),
        natural + ROADS.maxEdgeChange,
      );
      grid.setSample(c, r, clamped);
      if (d <= cell * 0.71) grid.lock(c, r);
    }
  }
}

/**
 * Düzlemeden yalnızca kilitler: yapının ayak izi ve yakın hücreleri sonraki terasların şevinden korunur.
 * Teras kurmayan yapılar (zemini olduğu gibi kullananlar) için.
 */
export function lockFootprint(grid: PadGrid, box: OrientedBox): void {
  const { width, height, cell, origin } = grid;
  const reach = Math.hypot(box.hx, box.hz) + cell;
  const c0 = Math.max(0, Math.floor((box.x - reach - origin.x) / cell));
  const c1 = Math.min(width - 1, Math.ceil((box.x + reach - origin.x) / cell));
  const r0 = Math.max(0, Math.floor((box.z - reach - origin.z) / cell));
  const r1 = Math.min(height - 1, Math.ceil((box.z + reach - origin.z) / cell));
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  for (let r = r0; r <= r1; r++) {
    const z = origin.z + r * cell;
    for (let c = c0; c <= c1; c++) {
      const dx = origin.x + c * cell - box.x;
      const dz = z - box.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const d = Math.hypot(Math.max(Math.abs(lx) - box.hx, 0), Math.max(Math.abs(lz) - box.hz, 0));
      if (d <= cell * 0.71) grid.lock(c, r);
    }
  }
}
