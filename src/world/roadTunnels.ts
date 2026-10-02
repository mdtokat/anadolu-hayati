import { ROADS, ROAD_STRUCTURES } from '../config';
import { SPAN_KIND, type PlannedRoad, type RoadPlan } from '../settlements/roadProfile';

/**
 * Tünel ağızlarında arazi deliği (saf mantık): tünel tüpünün geçtiği ve arazinin tüp tavanının altında kaldığı hücreler
 * (ağız ile içerideki ilk birkaç metre) arazi mesh'inden ve çarpışmasından çıkarılır; böylece oyuncu ve kamera tünele
 * girebilir. Deliğin kenarları tüpün kalın duvarları ve tavanı ile ağız cephesi tarafından örtülür. Tünelin derin
 * kısmında arazi tavanın çok üstündedir: oraya dokunulmaz (heightfield yalnızca yüzeydir, altından geçilebilir).
 */

/** Delik hücre kümesi: hücre (col, row) = (col, row) … (col + 1, row + 1) örnekleri arasındaki dörtgen. */
export interface TerrainHoles {
  readonly width: number;
  has(col: number, row: number): boolean;
  /** Bölgede delik var mı (chunk'ın hücre aralığı, uçlar dahil değil)? */
  any(col0: number, row0: number, col1: number, row1: number): boolean;
  readonly count: number;
}

/** Arazi ızgarası (hücre merkezleri ve örnekleri). */
export interface HoleGrid {
  readonly width: number;
  readonly height: number;
  readonly cell: number;
  readonly origin: { x: number; z: number };
  sample(col: number, row: number): number;
}

class HoleSet implements TerrainHoles {
  private readonly cells = new Set<number>();
  private readonly rows = new Map<number, number[]>();

  constructor(readonly width: number) {}

  add(col: number, row: number): void {
    const k = row * this.width + col;
    if (this.cells.has(k)) return;
    this.cells.add(k);
    const list = this.rows.get(row) ?? [];
    list.push(col);
    this.rows.set(row, list);
  }

  has(col: number, row: number): boolean {
    return this.cells.has(row * this.width + col);
  }

  any(col0: number, row0: number, col1: number, row1: number): boolean {
    for (let r = row0; r < row1; r++) {
      for (const c of this.rows.get(r) ?? []) if (c >= col0 && c < col1) return true;
    }
    return false;
  }

  get count(): number {
    return this.cells.size;
  }
}

/** Ağız düzleminin bu kadar hücre dışındaki hücre merkezleri de delinebilir (düzlemi kesen hücre). */
export const PORTAL_CELLS = 0.75;

/** Ağız cephesi ve önündeki zemin, ağız düzleminden dışarı bu kadar (oyun m) taşar: delik kenarını örter. */
export const PORTAL_APRON = 2.8;

/** Tüp tavanının üst yüzü (yatak + iç yükseklik + duvar). */
export function tunnelRoofTop(bed: number): number {
  return bed + ROAD_STRUCTURES.tunnelHeight + ROAD_STRUCTURES.tunnelWall;
}

/** Tüpün iç yarı genişliği (yol yarı genişliği + yan pay). */
export function tunnelInnerHalf(road: PlannedRoad): number {
  return (ROADS.width[road.cls] as number) / 2 + ROAD_STRUCTURES.tunnelSidePad;
}

/** Planın tünellerinden delik kümesi. */
export function tunnelHoles(plan: RoadPlan, grid: HoleGrid): TerrainHoles {
  const holes = new HoleSet(grid.width);
  const { cell, origin } = grid;
  for (const span of plan.spans) {
    if (span.kind !== SPAN_KIND.tunnel) continue;
    const road = plan.roads[span.road] as PlannedRoad;
    // Hücre merkezi eksene iç yarı genişlik + 0,3 m'den yakınsa (hücre köşesi duvarın içinde kalır).
    const reach = tunnelInnerHalf(road) + 0.3;
    // Ağız düzlemleri: i0'da içeri (i0 → i0+1) yön, i1'de içeri (i1 → i1−1) yön.
    const planes = [
      { i: span.i0, j: span.i0 + 1 },
      { i: span.i1, j: span.i1 - 1 },
    ].map(({ i, j }) => {
      const px = road.xz[i * 2] as number;
      const pz = road.xz[i * 2 + 1] as number;
      const dx = (road.xz[j * 2] as number) - px;
      const dz = (road.xz[j * 2 + 1] as number) - pz;
      const l = Math.hypot(dx, dz) || 1;
      return { px, pz, nx: dx / l, nz: dz / l };
    });
    for (let i = span.i0; i < span.i1; i++) {
      const ax = road.xz[i * 2] as number;
      const az = road.xz[i * 2 + 1] as number;
      const bx = road.xz[i * 2 + 2] as number;
      const bz = road.xz[i * 2 + 3] as number;
      const bedA = road.bed[i] as number;
      const bedB = road.bed[i + 1] as number;
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - origin.x) / cell) - 1);
      const c1 = Math.min(grid.width - 2, Math.ceil((Math.max(ax, bx) + reach - origin.x) / cell));
      const r0 = Math.max(0, Math.floor((Math.min(az, bz) - reach - origin.z) / cell) - 1);
      const r1 = Math.min(grid.height - 2, Math.ceil((Math.max(az, bz) + reach - origin.z) / cell));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (holes.has(c, r)) continue;
          const x = origin.x + (c + 0.5) * cell;
          const z = origin.z + (r + 0.5) * cell;
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
          if (Math.hypot(x - (ax + t * dx), z - (az + t * dz)) > reach) continue;
          // Ağız düzleminin dışındaki (yaklaşım yolu) hücreler kalır.
          // Ağız düzlemini kesen hücre (dışı yolla düzlenmiş, içi dağ) dik bir duvar olurdu: o da delinir; ağız cephesi
          // ve önündeki zemin (`PORTAL_APRON`) bunu örter.
          if (planes.some((p) => (x - p.px) * p.nx + (z - p.pz) * p.nz < -cell * PORTAL_CELLS))
            continue;
          const low = Math.min(
            grid.sample(c, r),
            grid.sample(c + 1, r),
            grid.sample(c, r + 1),
            grid.sample(c + 1, r + 1),
          );
          if (low < tunnelRoofTop(bedA + t * (bedB - bedA)) + 0.3) holes.add(c, r);
        }
      }
    }
  }
  return holes;
}
