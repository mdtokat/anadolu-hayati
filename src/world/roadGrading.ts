import { FRESH_WATER, ROADS } from '../config';
import { SPAN_KIND, type RoadPlan } from '../settlements/roadProfile';

/**
 * Zemin düzeltme (saf mantık): yol planının (`settlements/roadProfile.ts`) yatağını arazi yükseklik ızgarasına işler.
 * Yol ekseni ve `shoulder` genişliğinde banket tam yatak yüksekliğindedir; ötesinde zemin, yamaca `batterCut`
 * (kazı) / `batterFill` (dolgu) eğimiyle yumuşakça bağlanır. Köprü ve tünel kesimlerinin altındaki/üstündeki zemin
 * değişmez (yapı araziden bağımsızdır). Deniz hücrelerine dokunulmaz.
 */

/** Düzeltilen yükseklik ızgarası (`RegionHeightSource` karşılar). */
export interface HeightGrid {
  readonly width: number;
  readonly height: number;
  readonly cell: number;
  readonly origin: { x: number; z: number };
  /** Hücre yüksekliği (oyun y). */
  sample(col: number, row: number): number;
  setSample(col: number, row: number, value: number): void;
  /** Varsa yol yatağı hücreleri kilitlenir (yapı terasları değiştirmesin). */
  lock?(col: number, row: number): void;
}

export interface GradingStats {
  /** Değiştirilen hücre sayısı ve değişimin en büyük mutlak değeri (oyun m). */
  cells: number;
  maxChange: number;
}

function smoothstep(u: number): number {
  return u * u * (3 - 2 * u);
}

/**
 * Planı ızgaraya işler. Her hücre en yakın yol parçasının yatağını alır (kenar uzaklığına göre); çakışan yollarda
 * en yakın kazanır.
 */
export function applyRoadGrading(
  grid: HeightGrid,
  plan: RoadPlan,
  /** Varsa akarsu çizgileri: dere yatağı yolun dolgusuyla yükseltilmez (dere yamaçta kalmasın). */
  streams?: ReadonlyArray<{ kind: string; xz: ArrayLike<number> }>,
): GradingStats {
  const { width, height, cell, origin } = grid;
  const streamCells = streams ? streamMask(grid, streams) : null;
  const bestD = new Float32Array(width * height).fill(Number.POSITIVE_INFINITY);
  const bestBed = new Float32Array(width * height);
  const reach = ROADS.shoulder + ROADS.maxBlend;

  for (const road of plan.roads) {
    const half = (ROADS.width[road.cls] as number) / 2;
    const pad = half + reach;
    const pad2 = pad * pad;
    const n = road.xz.length / 2;
    // Tünel ağızları (konum + dağa doğru yön): hiçbir parçanın şevi ağız düzleminin ötesine taşmaz.
    const portals: Array<{ x: number; z: number; nx: number; nz: number }> = [];
    for (let i = 1; i + 1 < n; i++) {
      const into =
        road.kind[i] === SPAN_KIND.ground && road.kind[i + 1] === SPAN_KIND.tunnel
          ? i + 1
          : road.kind[i] === SPAN_KIND.ground && road.kind[i - 1] === SPAN_KIND.tunnel
            ? i - 1
            : -1;
      if (into < 0) continue;
      const x = road.xz[i * 2] as number;
      const z = road.xz[i * 2 + 1] as number;
      const dx = (road.xz[into * 2] as number) - x;
      const dz = (road.xz[into * 2 + 1] as number) - z;
      const l = Math.hypot(dx, dz) || 1;
      portals.push({ x, z, nx: dx / l, nz: dz / l });
    }
    const portalReach = (pad + 6) ** 2;
    const behindPortal = (x: number, z: number) =>
      portals.some(
        (p) =>
          (x - p.x) * p.nx + (z - p.z) * p.nz > 0 && (x - p.x) ** 2 + (z - p.z) ** 2 < portalReach,
      );
    for (let i = 0; i + 1 < n; i++) {
      // Yalnızca iki ucu da zemin olan parçalar işlenir (köprü/tünel altı doğal kalır).
      if (road.kind[i] !== SPAN_KIND.ground || road.kind[i + 1] !== SPAN_KIND.ground) continue;
      // Tünel ağzında biten/başlayan parça ağız düzleminin ötesine (dağın içine) taşmaz: yamaç ağız cephesine dayanır.
      const portalAhead = i + 2 < n && road.kind[i + 2] === SPAN_KIND.tunnel;
      const portalBehind = i > 0 && road.kind[i - 1] === SPAN_KIND.tunnel;
      const ax = road.xz[i * 2] as number;
      const az = road.xz[i * 2 + 1] as number;
      const bx = road.xz[i * 2 + 2] as number;
      const bz = road.xz[i * 2 + 3] as number;
      const bedA = road.bed[i] as number;
      const bedB = road.bed[i + 1] as number;
      const c0 = Math.max(0, Math.ceil((Math.min(ax, bx) - pad - origin.x) / cell));
      const c1 = Math.min(width - 1, Math.floor((Math.max(ax, bx) + pad - origin.x) / cell));
      const r0 = Math.max(0, Math.ceil((Math.min(az, bz) - pad - origin.z) / cell));
      const r1 = Math.min(height - 1, Math.floor((Math.max(az, bz) + pad - origin.z) / cell));
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      for (let r = r0; r <= r1; r++) {
        const z = origin.z + r * cell;
        for (let c = c0; c <= c1; c++) {
          const x = origin.x + c * cell;
          const raw = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
          if ((portalAhead && raw > 1) || (portalBehind && raw < 0)) continue;
          if (portals.length > 0 && behindPortal(x, z)) continue;
          const t = Math.max(0, Math.min(1, raw));
          const px = x - (ax + t * dx);
          const pz = z - (az + t * dz);
          const d2 = px * px + pz * pz;
          if (d2 >= pad2) continue;
          const d = Math.sqrt(d2) - half;
          const at = r * width + c;
          if (d < (bestD[at] as number)) {
            bestD[at] = d;
            bestBed[at] = bedA + t * (bedB - bedA);
          }
        }
      }
    }
  }

  let cells = 0;
  let maxChange = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const at = r * width + c;
      const d = bestD[at] as number;
      if (!Number.isFinite(d)) continue;
      const natural = grid.sample(c, r);
      if (natural <= 0) continue; // deniz / kıyı çizgisi
      const bed = Math.max(bestBed[at] as number, ROADS.minBedHeight);
      let value: number;
      if (d <= ROADS.shoulder) {
        value = bed;
        grid.lock?.(c, r);
      } else {
        const delta = natural - bed;
        const batter = delta > 0 ? ROADS.batterCut : ROADS.batterFill;
        const blend = Math.min(ROADS.maxBlend, Math.max(ROADS.minBlend, Math.abs(delta) / batter));
        const u = (d - ROADS.shoulder) / blend;
        if (u >= 1) continue;
        value = bed + delta * smoothstep(u);
        // Yol dışındaki hücrede değişim sınırlıdır: derin vadiye bakan yamaçta dev set oluşmasın.
        value = Math.min(
          Math.max(value, natural - ROADS.maxEdgeChange),
          natural + ROADS.maxEdgeChange,
        );
      }
      // Dere hücresi yolun dolgusuyla yükselmez (yatağın dışındaysa): akarsu kendi yatağında kalır.
      if (streamCells && streamCells[at] === 1 && d > ROADS.shoulder)
        value = Math.min(value, natural);
      const change = Math.abs(value - natural);
      if (change < 1e-4) continue;
      grid.setSample(c, r, value);
      cells++;
      if (change > maxChange) maxChange = change;
    }
  }
  return { cells, maxChange };
}

/** Akarsu çizgilerine (yarı genişlik + `streamGuard`) yakın hücreler. */
function streamMask(
  grid: HeightGrid,
  streams: ReadonlyArray<{ kind: string; xz: ArrayLike<number> }>,
): Uint8Array {
  const { width, height, cell, origin } = grid;
  const mask = new Uint8Array(width * height);
  for (const line of streams) {
    const w = (FRESH_WATER.lineWidth as Record<string, number>)[line.kind];
    if (w === undefined) continue;
    const reach = w / 2 + ROADS.streamGuard;
    const xz = line.xz;
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const ax = xz[i] as number;
      const az = xz[i + 1] as number;
      const bx = xz[i + 2] as number;
      const bz = xz[i + 3] as number;
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
          if (Math.hypot(x - (ax + t * dx), z - (az + t * dz)) <= reach) mask[r * width + c] = 1;
        }
      }
    }
  }
  return mask;
}
