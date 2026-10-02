import { FRESH_WATER, ROADS } from '../config';
import type { RoadData } from '../data/settlements';

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
function simplify(pts: readonly number[], tolerance: number): number[] {
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

/** Chaikin köşe kesme (bir tur): her köşe ¼–¾ noktalarıyla yuvarlanır; uçlar kalır. */
function chaikin(pts: readonly number[]): number[] {
  const n = pts.length / 2;
  if (n <= 2) return [...pts];
  const out: number[] = [pts[0] as number, pts[1] as number];
  for (let i = 0; i + 1 < n; i++) {
    const ax = pts[i * 2] as number;
    const az = pts[i * 2 + 1] as number;
    const bx = pts[i * 2 + 2] as number;
    const bz = pts[i * 2 + 3] as number;
    if (i > 0) out.push(ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25);
    if (i + 2 < n) out.push(ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75);
  }
  out.push(pts[(n - 1) * 2] as number, pts[(n - 1) * 2 + 1] as number);
  return out;
}

/**
 * Yolları yumuşatır (saf): veri hattı yolları kafes hücresine (2 m) oturtulmuş olduğundan çizgiler merdiven gibi
 * kırıktır. Önce `ROADS.smoothTolerance` ile sadeleştirilir (basamaklar kalkar), sonra `ROADS.smoothRounds` tur
 * Chaikin köşe kesmesiyle virajlar yuvarlanır. Uçlar (kavşaklar) yerinde kalır.
 */
export function smoothRoads(roads: readonly RoadData[]): RoadData[] {
  return roads.map((road) => {
    let pts = simplify(Array.from(road.xz), ROADS.smoothTolerance);
    for (let k = 0; k < ROADS.smoothRounds; k++) pts = chaikin(pts);
    return { cls: road.cls, xz: Float32Array.from(pts) };
  });
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
    const half = (ROADS.width[road.cls] as number) / 2;
    const pts = densify(road.xz, step);
    const count = pts.length / 2;
    if (count < 3) {
      out.push(road);
      continue;
    }
    let moved = false;
    const reach = half + ROADS.waterGap + MAX_WATER_HALF;
    // İlk geçişte suya yakın noktalar işaretlenir; sonraki geçişler yalnızca onlara (ve komşularına) bakar.
    const near = new Uint8Array(count);
    for (let pass = 0; pass < ROADS.routePasses; pass++) {
      const ox = new Float64Array(count);
      const oz = new Float64Array(count);
      let lo = count;
      let hi = -1;
      for (let i = 1; i < count - 1; i++) {
        if (pass > 0 && near[i] === 0) continue;
        const x = pts[i * 2] as number;
        const z = pts[i * 2 + 1] as number;
        const hit = nearestWater(x, z, pass === 0 ? reach + ROADS.routeStep : reach);
        if (pass === 0 && hit) near[i] = 1;
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
    out.push(
      moved ? { cls: road.cls, xz: Float32Array.from(simplify(pts, ROADS.routeSimplify)) } : road,
    );
  }
  return out;
}
