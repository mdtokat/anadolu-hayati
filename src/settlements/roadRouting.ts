import { FRESH_WATER, ROADS } from '../config';
import type { RoadData } from '../data/settlements';
import { roadHalfWidth } from './roadWidth';

/** Yol ayırmanın okuduğu tatlı su sorgusu (`FreshWaterIndex.nearest` karşılar). */
export type NearestWater = (
  x: number,
  z: number,
  maxDistance: number,
) => { kind: string; distance: number; x: number; z: number } | null;

/** Akarsu türünün çizim yarı genişliği (oyun m); göl kıyısı ve kaynak noktası için 0. */
function waterHalfWidth(kind: string): number {
  const widths = FRESH_WATER.lineWidth as Record<string, number>;
  const w = widths[kind];
  return w === undefined ? 0 : w / 2;
}

/** En geniş akarsuyun yarı genişliği (oyun m). */
const MAX_WATER_HALF = Math.max(...Object.values(FRESH_WATER.lineWidth)) / 2;

/** Douglas–Peucker sadeleştirmesi: `tolerance`'tan (oyun m) az sapan ara noktalar atılır; uçlar kalır. */
export function simplify(pts: readonly number[], tolerance: number): number[] {
  const n = pts.length / 2;
  if (n <= 2) return [...pts];
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  const t2 = tolerance * tolerance;
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number];
    const ax = pts[a * 2] as number;
    const az = pts[a * 2 + 1] as number;
    const dx = (pts[b * 2] as number) - ax;
    const dz = (pts[b * 2 + 1] as number) - az;
    const len2 = dx * dx + dz * dz;
    let worst = -1;
    let worstD2 = t2;
    for (let i = a + 1; i < b; i++) {
      const px = (pts[i * 2] as number) - ax;
      const pz = (pts[i * 2 + 1] as number) - az;
      const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + pz * dz) / len2)) : 0;
      const ex = px - t * dx;
      const ez = pz - t * dz;
      const d2 = ex * ex + ez * ez;
      if (d2 > worstD2) {
        worstD2 = d2;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2] as number, pts[i * 2 + 1] as number);
  return out;
}

/** Çoklu çizgiyi tam `step` aralıklı noktalara yeniden örnekler (ilk ve son nokta korunur). */
function resample(pts: readonly number[], step: number): number[] {
  const n = pts.length / 2;
  if (n < 2) return [...pts];
  const out: number[] = [pts[0] as number, pts[1] as number];
  let carried = 0; // son çıktı noktasından beri alınan yol
  for (let i = 0; i + 1 < n; i++) {
    const ax = pts[i * 2] as number;
    const az = pts[i * 2 + 1] as number;
    const bx = pts[i * 2 + 2] as number;
    const bz = pts[i * 2 + 3] as number;
    const len = Math.hypot(bx - ax, bz - az);
    if (len === 0) continue;
    let at = step - carried;
    while (at <= len) {
      out.push(ax + ((bx - ax) * at) / len, az + ((bz - az) * at) / len);
      at += step;
    }
    carried = len - (at - step);
  }
  const lx = pts[(n - 1) * 2] as number;
  const lz = pts[(n - 1) * 2 + 1] as number;
  // Son örnek uca çok yakınsa uca taşınır (ikiz nokta oluşmasın).
  const last = out.length / 2 - 1;
  if (
    last > 0 &&
    Math.hypot((out[last * 2] as number) - lx, (out[last * 2 + 1] as number) - lz) < step * 0.5
  ) {
    out[last * 2] = lx;
    out[last * 2 + 1] = lz;
  } else {
    out.push(lx, lz);
  }
  return out;
}

/** Gauss çekirdeği ağırlıkları (k = −reach … reach); aynı (σ, adım) için önbellekli. */
const KERNELS = new Map<string, Float64Array>();
function kernel(sigma: number, step: number, reach: number): Float64Array {
  const key = `${sigma}/${step}/${reach}`;
  let w = KERNELS.get(key);
  if (!w) {
    w = new Float64Array(reach * 2 + 1);
    for (let k = -reach; k <= reach; k++) {
      w[k + reach] = Math.exp(-((k * step) ** 2) / (2 * sigma * sigma));
    }
    KERNELS.set(key, w);
  }
  return w;
}

/**
 * Gauss yumuşatması: her noktanın yeni konumu, yol boyunca σ ölçeğindeki komşularının ağırlıklı ortalamasıdır.
 * σ uca yaklaştıkça sönümlenir (uçlar yerinde kalır: kavşak bozulmaz). Noktalar eşit aralıklı (`step`) olmalıdır.
 */
function gaussianSmooth(pts: readonly number[], step: number, sigma: number): number[] {
  const n = pts.length / 2;
  if (n < 3 || sigma <= 0) return [...pts];
  const out = [...pts];
  for (let i = 1; i < n - 1; i++) {
    // Uca uzaklık (yol boyunca, yaklaşık): σ bununla sınırlanır.
    const toEnd = Math.min(i, n - 1 - i) * step;
    const s = Math.min(sigma, toEnd * 0.6);
    if (s < step * 0.5) continue;
    const reach = Math.min(Math.ceil((s * 2.5) / step), i, n - 1 - i);
    // Uçlardan uzakta σ sabit: çekirdek önbellekten; uca yakınken (σ küçülüyor) hesaplanır.
    const full = Math.ceil((sigma * 2.5) / step);
    const w =
      s === sigma && reach === full
        ? kernel(sigma, step, reach)
        : kernel(Math.round(s * 100) / 100, step, reach);
    let sx = 0;
    let sz = 0;
    let sw = 0;
    for (let k = -reach; k <= reach; k++) {
      const wk = w[k + reach] as number;
      sx += wk * (pts[(i + k) * 2] as number);
      sz += wk * (pts[(i + k) * 2 + 1] as number);
      sw += wk;
    }
    out[i * 2] = sx / sw;
    out[i * 2 + 1] = sz / sw;
  }
  return out;
}

/**
 * Yol çizgisini yumuşatır (saf): kafes basamaklarını sadeleştirir (`smoothTolerance`), eşit aralıkla örnekler ve sınıfın
 * σ'sıyla Gauss süzgecinden geçirir; son olarak gereksiz noktaları atar. Keskin dönüş ve dalgalanma kalmaz; uçlar sabit.
 */
export function smoothPath(xz: ArrayLike<number>, cls: number): Float32Array {
  const sigma = ROADS.smoothSigma[cls] as number;
  let pts = simplify(Array.from(xz), ROADS.smoothTolerance);
  pts = resample(pts, ROADS.smoothStep);
  // Birkaç tur: tek geçiş uzun düzlükte keskin köşeyi tamamen yuvarlamaz.
  pts = gaussianSmooth(pts, ROADS.smoothStep, sigma);
  pts = gaussianSmooth(pts, ROADS.smoothStep, sigma * 0.7);
  return Float32Array.from(simplify(pts, ROADS.smoothSimplify));
}

/**
 * Yolları yumuşatır (saf): veri hattı yolları kafes hücresine (2 m) oturtulmuş olduğundan çizgiler merdiven gibi
 * kırık ve dalgalıdır; köşeler keskindir. Bkz. `smoothPath`.
 */
export function smoothRoads(roads: readonly RoadData[]): RoadData[] {
  return roads.map((road) => ({ ...road, xz: smoothPath(road.xz, road.cls) }));
}

/** Çoklu çizgiyi en çok `step` aralıklı noktalara sıklaştırır. */
function densify(xz: Float32Array, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < xz.length; i += 2) {
    const ax = xz[i] as number;
    const az = xz[i + 1] as number;
    if (i + 3 >= xz.length) {
      out.push(ax, az);
      break;
    }
    const bx = xz[i + 2] as number;
    const bz = xz[i + 3] as number;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
  }
  return out;
}

/**
 * Akarsuya paralel giden yolları sudan ayırır (saf): veri yolları ve akarsular gerçek konumlarına yakındır ama
 * ikisi de çizimde abartılı geniştir (yol 2,6–5 m, nehir 3 m ≈ gerçek 130–250 m), bu yüzden vadi yolları ırmağın
 * üstüne biner. Her yol noktası, su kenarına `ROADS.waterGap` kalana kadar suyun ters yönüne itilir; yolu suya dik
 * kesen noktalar (köprü/geçit) itilmez. Kaydırmalar yumuşatılır (kırık çıkmasın) ve `ROADS.maxWaterShift` ile
 * sınırlanır; yolun iki ucu (kavşaklar) yerinde kalır. Göl içindeki noktalar (bent, set) olduğu gibi kalır.
 */
export function separateRoadsFromWater(
  roads: readonly RoadData[],
  nearestWater: NearestWater,
): RoadData[] {
  const step = ROADS.routeStep;
  const out: RoadData[] = [];
  for (const road of roads) {
    const half = roadHalfWidth(road);
    const pts = densify(road.xz, step);
    const count = pts.length / 2;
    if (count < 3) {
      out.push(road);
      continue;
    }
    let moved = false;
    const reach = half + ROADS.waterGap + MAX_WATER_HALF;
    // İlk geçişte suya yakın noktalar işaretlenir; sonraki geçişler yalnızca onlara (ve komşularına) bakar. Su yakınlığı
    // önce her ikinci noktada geniş yarıçapla sınanır (çoğu yol sudan uzaktadır).
    const near = new Uint8Array(count);
    let anyNear = false;
    for (let i = 1; i < count - 1; i += 2) {
      if (
        nearestWater(pts[i * 2] as number, pts[i * 2 + 1] as number, reach + 2 * ROADS.routeStep)
      ) {
        near[i - 1] = near[i] = near[i + 1] = 1;
        anyNear = true;
      }
    }
    if (!anyNear) {
      out.push(road);
      continue;
    }
    for (let pass = 0; pass < ROADS.routePasses; pass++) {
      const ox = new Float64Array(count);
      const oz = new Float64Array(count);
      let lo = count;
      let hi = -1;
      for (let i = 1; i < count - 1; i++) {
        if (near[i] === 0) continue;
        const x = pts[i * 2] as number;
        const z = pts[i * 2 + 1] as number;
        const hit = nearestWater(x, z, pass === 0 ? reach + ROADS.routeStep : reach);
        if (!hit || hit.distance < 1e-3) continue; // su yok ya da göl içi/tam eksen üstü (geçit)
        const need = half + ROADS.waterGap + waterHalfWidth(hit.kind);
        if (hit.distance >= need) continue;
        const nx = (x - hit.x) / hit.distance;
        const nz = (z - hit.z) / hit.distance;
        const tx = (pts[i * 2 + 2] as number) - (pts[i * 2 - 2] as number);
        const tz = (pts[i * 2 + 3] as number) - (pts[i * 2 - 1] as number);
        const tl = Math.hypot(tx, tz) || 1;
        // Yol suya doğru/sudan uzağa gidiyorsa (geçiş) itme yok: köprü yerinde kalsın.
        if (Math.abs((tx * nx + tz * nz) / tl) > ROADS.crossingCos) continue;
        const push = need - hit.distance;
        ox[i] = nx * push;
        oz[i] = nz * push;
        lo = Math.min(lo, i);
        hi = Math.max(hi, i);
      }
      if (hi < 0) break;
      // Yalnızca itilen kesimin çevresi işlenir (yumuşatma her turda bir nokta yayılır).
      const from = Math.max(1, lo - ROADS.routeSmoothing - 1);
      const to = Math.min(count - 2, hi + ROADS.routeSmoothing + 1);
      // Yumuşatma: itmeler komşulara yayılır (en yakın su noktası parçadan parçaya atladığından ham itme testere
      // dişi gibidir). Yumuşatma itmeyi azaltırsa kalan çakışmayı sonraki geçiş giderir; uçlar sabit.
      const sx = new Float64Array(count);
      const sz = new Float64Array(count);
      for (let k = 0; k < ROADS.routeSmoothing; k++) {
        for (let i = from; i <= to; i++) {
          sx[i] = ((ox[i - 1] as number) + 2 * (ox[i] as number) + (ox[i + 1] as number)) / 4;
          sz[i] = ((oz[i - 1] as number) + 2 * (oz[i] as number) + (oz[i + 1] as number)) / 4;
        }
        for (let i = from; i <= to; i++) {
          ox[i] = sx[i] as number;
          oz[i] = sz[i] as number;
        }
      }
      for (let i = from; i <= to; i++) {
        let dx = ox[i] as number;
        let dz = oz[i] as number;
        const len = Math.hypot(dx, dz);
        if (len === 0) continue;
        if (len > ROADS.maxWaterShift) {
          dx *= ROADS.maxWaterShift / len;
          dz *= ROADS.maxWaterShift / len;
        }
        pts[i * 2] = (pts[i * 2] as number) + dx;
        pts[i * 2 + 1] = (pts[i * 2 + 1] as number) + dz;
        moved = true;
      }
    }
    // Sıklaştırılmış noktalar çizgide gereksiz: kaydırılan yol hafifçe sadeleştirilir (dizin ve kaplama hızı).
    out.push(moved ? { ...road, xz: Float32Array.from(simplify(pts, ROADS.routeSimplify)) } : road);
  }
  return out;
}

/** Akarsu parçalarının uzamsal ızgarası (kesişim sorgusu). */
export class StreamGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly segs: number[] = [];
  private readonly kinds: string[] = [];
  private readonly cell = 32;

  constructor(lines: ReadonlyArray<{ kind: string; xz: ArrayLike<number> }>) {
    for (const line of lines) {
      if (waterHalfWidth(line.kind) <= 0) continue;
      const xz = line.xz;
      for (let i = 0; i + 3 < xz.length; i += 2) {
        const ax = xz[i] as number;
        const az = xz[i + 1] as number;
        const bx = xz[i + 2] as number;
        const bz = xz[i + 3] as number;
        const id = this.kinds.push(line.kind) - 1;
        this.segs.push(ax, az, bx, bz);
        for (
          let cx = Math.floor(Math.min(ax, bx) / this.cell);
          cx <= Math.floor(Math.max(ax, bx) / this.cell);
          cx++
        ) {
          for (
            let cz = Math.floor(Math.min(az, bz) / this.cell);
            cz <= Math.floor(Math.max(az, bz) / this.cell);
            cz++
          ) {
            const k = (cx + 32768) * 65536 + (cz + 32768);
            const list = this.cells.get(k);
            if (list) list.push(id);
            else this.cells.set(k, [id]);
          }
        }
      }
    }
  }

  /**
   * (a → b) parçasının kestiği akarsular: parça üzerindeki konum t ∈ [0, 1], akarsuyun yarı genişliği ve geçiş açısının
   * sinüsü (dik geçiş 1).
   */
  crossings(
    ax: number,
    az: number,
    bx: number,
    bz: number,
  ): Array<{ t: number; half: number; sin: number }> {
    const out: Array<{ t: number; half: number; sin: number }> = [];
    const seen = new Set<number>();
    const rx = bx - ax;
    const rz = bz - az;
    const rl = Math.hypot(rx, rz) || 1;
    for (
      let cx = Math.floor(Math.min(ax, bx) / this.cell);
      cx <= Math.floor(Math.max(ax, bx) / this.cell);
      cx++
    ) {
      for (
        let cz = Math.floor(Math.min(az, bz) / this.cell);
        cz <= Math.floor(Math.max(az, bz) / this.cell);
        cz++
      ) {
        for (const id of this.cells.get((cx + 32768) * 65536 + (cz + 32768)) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const cx0 = this.segs[id * 4] as number;
          const cz0 = this.segs[id * 4 + 1] as number;
          const sx = (this.segs[id * 4 + 2] as number) - cx0;
          const sz = (this.segs[id * 4 + 3] as number) - cz0;
          const den = rx * sz - rz * sx;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx0 - ax) * sz - (cz0 - az) * sx) / den;
          const u = ((cx0 - ax) * rz - (cz0 - az) * rx) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const sl = Math.hypot(sx, sz) || 1;
          out.push({
            t,
            half: waterHalfWidth(this.kinds[id] as string),
            sin: Math.abs(den) / (rl * sl),
          });
        }
      }
    }
    return out;
  }
}

/**
 * Menderesli dereye paralel giden yolu derenin tek yakasına alır (saf): yol bir akarsuyu kısa aralıklarla (aralık
 * `ROADS.uncrossGap`'ten kısa) birden çok kez kesiyorsa, ilk ve son kesişimin `uncrossPad` dışındaki iki nokta arası A*
 * ile yeniden çizilir (akarsu geçişi pahalı: rota dereyi gerekmedikçe kesmez, kenarından uzak durur). Böylece akarsu
 * boyunca uzanan köprü kümeleri yerine yol derenin yanından gider ve gerekiyorsa bir kez köprüyle geçer.
 */
export function uncrossStreams(
  roads: readonly RoadData[],
  streams: StreamGrid,
  route: (ax: number, az: number, bx: number, bz: number) => number[] | null,
): RoadData[] {
  return roads.map((road) => {
    const pts = densify(road.xz, ROADS.routeStep);
    const n = pts.length / 2;
    // Kesişimlerin yol boyu konumları (nokta dizini + t).
    const at: number[] = [];
    for (let i = 0; i + 1 < n; i++) {
      for (const c of streams.crossings(
        pts[i * 2] as number,
        pts[i * 2 + 1] as number,
        pts[i * 2 + 2] as number,
        pts[i * 2 + 3] as number,
      )) {
        at.push(i + c.t);
      }
    }
    if (at.length < 2) return road;
    at.sort((p, q) => p - q);
    const gap = ROADS.uncrossGap / ROADS.routeStep;
    const pad = Math.ceil(ROADS.uncrossPad / ROADS.routeStep);
    const clusters: Array<[number, number]> = [];
    let start = at[0] as number;
    let prev = start;
    let size = 1;
    for (let k = 1; k <= at.length; k++) {
      const cur = at[k];
      if (cur !== undefined && cur - prev <= gap) {
        prev = cur;
        size++;
        continue;
      }
      if (size >= 2) clusters.push([start, prev]);
      if (cur !== undefined) {
        start = cur;
        prev = cur;
        size = 1;
      }
    }
    if (clusters.length === 0) return road;
    let out: number[] = [];
    let from = 0;
    let changed = false;
    for (const [c0, c1] of clusters) {
      const i0 = Math.max(from, Math.floor(c0) - pad);
      const i1 = Math.min(n - 1, Math.ceil(c1) + pad);
      if (i1 - i0 < 2) continue;
      const path = route(
        pts[i0 * 2] as number,
        pts[i0 * 2 + 1] as number,
        pts[i1 * 2] as number,
        pts[i1 * 2 + 1] as number,
      );
      if (!path) continue;
      for (let i = from; i < i0; i++) out.push(pts[i * 2] as number, pts[i * 2 + 1] as number);
      out.push(...path.slice(0, path.length - 2));
      from = i1;
      changed = true;
    }
    if (!changed) return road;
    for (let i = from; i < n; i++) out.push(pts[i * 2] as number, pts[i * 2 + 1] as number);
    out = Array.from(smoothPath(out, road.cls));
    return { ...road, xz: Float32Array.from(out) };
  });
}
