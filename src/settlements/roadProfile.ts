import { FRESH_WATER, ROADS, ROAD_STRUCTURES } from '../config';
import type { RoadClass, RoadData } from '../data/settlements';
import { NodeIndex, pathLength } from './roadNetwork';
import { StreamGrid, type NearestWater } from './roadRouting';

/**
 * Yol boyuna profili (saf mantık): her yol için zemine uygun, düzgün ve eğimi sınırlı bir "yatak" (bed) yüksekliği
 * tasarlar. Arazi yoldan bağımsızdır; yol araziyi yumuşatır: tepeler kazılır (yarma), çukurlar doldurulur. Yapılar:
 *
 * - **Köprü:** yalnızca yolun akarsu çizgisini gerçekten kestiği yerde; uzunluğu suyun genişliği ve geçiş açısından
 *   (dik geçiş kısa, verev geçiş uzun) hesaplanır; birbirine yakın köprüler tek köprü olur. Güverte iki ayak arasında
 *   **düzdür** (tepe yapmaz): açıklık gerekiyorsa ayaklar yükseltilir, yaklaşım yolu eğimle çıkar.
 * - **Viyadük:** yalnızca anayolda, derin ve uzun vadi geçişinde (dolgu sınırını aşan kesim).
 * - **Tünel:** anayol ve köy yolunda, eğim sınırlı profil sırtın `tunnelDepth`'ten derin altından geçiyorsa; ağızlar
 *   kazının `portalDepth`'e indiği yerdedir. Tünelin üstündeki arazi değişmez (ağızlarda arazi delinir:
 *   `world/roadTunnels.ts`).
 *
 * Köprü türü yola ve konuma göre seçilir (`BRIDGE_TYPES`): anayolda beton kirişli köprü ya da viyadük, köy yolunda taş
 * kemer (kısa) ya da beton, patikada ahşap (kısa) ya da taş kemer. Zemini yola uydurmayı `world/roadGrading.ts` yapar.
 *
 * Yöntem: arazi yüksekliği yol boyunca eşit aralıkla örneklenir, yumuşatılır (sınıfa göre `profileSigma`), eğim
 * `gradeMax` ile sınırlanır (uçlar kavşağın doğal yüksekliğine sabit); sonra yapı kesimleri seçilir ve sınırlar
 * (zeminde kazı `maxCut` / dolgu `maxFill`, köprüde açıklık, tünelde örtü) eğim sınırıyla dönüşümlü uygulanır.
 */

/** Plan noktasının türü. */
export const SPAN_KIND = { ground: 0, bridge: 1, tunnel: 2 } as const;
export type SpanKind = (typeof SPAN_KIND)[keyof typeof SPAN_KIND];

/** Köprü türleri: beton kirişli, viyadük (yüksek ayaklı), taş kemer (Osmanlı), ahşap (patika). */
export const BRIDGE_TYPES = ['beam', 'viaduct', 'arch', 'wooden'] as const;
export type BridgeType = (typeof BRIDGE_TYPES)[number];

/** Planlanmış yol: sıklaştırılmış eksen + nokta başına doğal yükseklik, yatak yüksekliği ve tür. */
export interface PlannedRoad {
  cls: RoadClass;
  /** [x0, z0, x1, z1, …]; noktalar eşit aralıklı (`step`). */
  xz: Float32Array;
  step: number;
  natural: Float32Array;
  bed: Float32Array;
  kind: Uint8Array;
}

/**
 * Yapı: `i0` ve `i1` zemin kalan uç noktalarıdır (köprü ayağı / tünel ağzı), aradaki noktalar yapı kesimidir.
 */
export interface RoadSpan {
  road: number;
  i0: number;
  i1: number;
  kind: Exclude<SpanKind, 0>;
  /** Köprü için: dere değil, derin vadi geçişi (viyadük). */
  viaduct: boolean;
  /** Köprü türü (tünelde `beam`, kullanılmaz). */
  type: BridgeType;
}

export interface RoadPlan {
  roads: PlannedRoad[];
  spans: RoadSpan[];
}

/** Profilin okuduğu arazi sorguları. */
export interface ProfileTerrain {
  /** Doğal (düzeltilmemiş) oyun yüksekliği (y). */
  heightAt(x: number, z: number): number;
  elevationAt(x: number, z: number): number;
  nearestWater?: NearestWater;
  /** Varsa akarsu çizgileri: köprüler yalnızca yolun bunları kestiği yerde kurulur (yoksa `nearestWater` yakınlığı). */
  waterLines?: ReadonlyArray<{ kind: string; xz: ArrayLike<number> }>;
}

const WATER_AREA = new Set(['lake', 'reservoir', 'pond', 'water']);

/** Çizgiyi yay uzunluğuna göre `count` eşit aralıklı noktaya (uçlar dahil) örnekler. */
function resampleUniform(xz: ArrayLike<number>, count: number): Float32Array {
  const n = xz.length / 2;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cum[i] =
      (cum[i - 1] as number) +
      Math.hypot(
        (xz[i * 2] as number) - (xz[i * 2 - 2] as number),
        (xz[i * 2 + 1] as number) - (xz[i * 2 - 1] as number),
      );
  }
  const total = cum[n - 1] as number;
  const out = new Float32Array(count * 2);
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const at = (total * k) / (count - 1);
    while (seg < n - 2 && (cum[seg + 1] as number) < at) seg++;
    const len = (cum[seg + 1] as number) - (cum[seg] as number);
    const t = len > 0 ? (at - (cum[seg] as number)) / len : 0;
    out[k * 2] =
      (xz[seg * 2] as number) + t * ((xz[seg * 2 + 2] as number) - (xz[seg * 2] as number));
    out[k * 2 + 1] =
      (xz[seg * 2 + 1] as number) + t * ((xz[seg * 2 + 3] as number) - (xz[seg * 2 + 1] as number));
  }
  return out;
}

/** Gauss çekirdekleri (σ, adım, erişim başına önbellekli). */
const KERNELS = new Map<string, Float64Array>();
function kernel(sigma: number, ds: number, reach: number): Float64Array {
  const key = `${sigma}/${ds}/${reach}`;
  let w = KERNELS.get(key);
  if (!w) {
    w = new Float64Array(reach * 2 + 1);
    for (let k = -reach; k <= reach; k++)
      w[k + reach] = Math.exp(-((k * ds) ** 2) / (2 * sigma * sigma));
    KERNELS.set(key, w);
  }
  return w;
}

/** Uçları kısmen sabitleyen Gauss yumuşatması (eşit aralıklı `values`); σ uca yaklaştıkça küçülür. */
function smoothValues(values: Float64Array, ds: number, sigma: number): Float64Array {
  const n = values.length;
  const out = Float64Array.from(values);
  for (let i = 1; i < n - 1; i++) {
    const toEnd = Math.min(i, n - 1 - i) * ds;
    const s = Math.min(sigma, toEnd * 0.5);
    if (s < ds * 0.5) continue;
    const reach = Math.min(Math.ceil((s * 2.5) / ds), i, n - 1 - i);
    const w = kernel(Math.round(s * 20) / 20, Math.round(ds * 20) / 20, reach);
    let sum = 0;
    let wsum = 0;
    for (let k = -reach; k <= reach; k++) {
      const wk = w[k + reach] as number;
      sum += wk * (values[i + k] as number);
      wsum += wk;
    }
    out[i] = sum / wsum;
  }
  return out;
}

/**
 * Ardışık noktalar arası eğimi `g` (yükselti / yatay) ile sınırlar. Uçlar (`pinA`, `pinB`) sabittir: önce uçlardan
 * çıkan eğim konisi dışına çıkan noktalar koniye alınır, sonra ileri ve geri geçiş uygulanır.
 */
function limitGrade(p: Float64Array, ds: number, g: number, pinA: number, pinB: number): void {
  const n = p.length;
  const d = g * ds;
  for (let i = 0; i < n; i++) {
    const loA = pinA - i * d;
    const hiA = pinA + i * d;
    const loB = pinB - (n - 1 - i) * d;
    const hiB = pinB + (n - 1 - i) * d;
    p[i] = Math.min(Math.max(p[i] as number, Math.max(loA, loB)), Math.min(hiA, hiB));
  }
  p[0] = pinA;
  for (let i = 1; i < n; i++) {
    p[i] = Math.min(Math.max(p[i] as number, (p[i - 1] as number) - d), (p[i - 1] as number) + d);
  }
  p[n - 1] = pinB;
  for (let i = n - 2; i >= 0; i--) {
    p[i] = Math.min(Math.max(p[i] as number, (p[i + 1] as number) - d), (p[i + 1] as number) + d);
  }
  p[0] = pinA;
}

/** Dere yarı genişliği (oyun m) — köprü gereksinimi için. */
function streamHalf(kind: string): number {
  return ((FRESH_WATER.lineWidth as Record<string, number>)[kind] ?? 0) / 2;
}

/** [lo, hi] arasında ardışık "doğru" noktaların aralıkları (en az `minLen` nokta). */
function runsOf(flags: Uint8Array, minLen: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i] === 1;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (i - start >= minLen) out.push([start, i - 1]);
      start = -1;
    }
  }
  return out;
}

/** Aralarında en çok `gap` nokta boşluk olan aralıkları birleştirir. */
function mergeRuns(runs: Array<[number, number]>, gap: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && run[0] - last[1] - 1 <= gap) last[1] = run[1];
    else out.push([run[0], run[1]]);
  }
  return out;
}

/** Kesimi aday listesi: [a, b] nokta aralığı ve türü. */
interface Candidate {
  a: number;
  b: number;
  kind: Exclude<SpanKind, 0>;
  viaduct: boolean;
}

/** Bir değerin deterministik [0, 1) karması (köprü türü çeşitlemesi). */
function hash01(x: number, z: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** Köprü türü: yola, uzunluğa, yüksekliğe ve (çeşitleme için) konuma göre. */
export function bridgeTypeFor(
  cls: RoadClass,
  length: number,
  height: number,
  viaduct: boolean,
  x: number,
  z: number,
): BridgeType {
  const B = ROAD_STRUCTURES;
  if (cls === 0)
    return viaduct || (height > B.viaductHeight && length > B.archMaxLength) ? 'viaduct' : 'beam';
  if (cls === 2) return length <= B.woodenMaxLength ? 'wooden' : 'arch';
  if (cls === 1) {
    // Köy köprüleri çoğunlukla taş kemer; bir kısmı sonradan yapılmış beton.
    return length <= B.archMaxLength && hash01(x, z) < B.archShare ? 'arch' : 'beam';
  }
  return 'beam';
}

/**
 * Tüm yolların profilini tasarlar. `roads` düğümlerinde bölünmüş olmalıdır (`buildRoadNetwork` çıktısı): aynı kavşakta
 * buluşan yolların uçları kavşağın doğal yüksekliğine sabitlenir, böylece kavşakta basamak olmaz.
 */
export function planRoadProfiles(roads: readonly RoadData[], terrain: ProfileTerrain): RoadPlan {
  const step = ROADS.profileStep;
  const S = ROAD_STRUCTURES;
  const streams = terrain.waterLines ? new StreamGrid(terrain.waterLines) : null;
  // Kavşak yükseklikleri: aynı düğümdeki uçların doğal yüksekliklerinin ortalaması.
  const index = new NodeIndex();
  const nodeSum: number[] = [];
  const nodeCount: number[] = [];
  const endNodes: Array<[number, number]> = [];
  for (const road of roads) {
    const xz = road.xz;
    const ends: number[] = [];
    for (const at of [0, xz.length - 2]) {
      const x = xz[at] as number;
      const z = xz[at + 1] as number;
      const id = index.node(x, z);
      if (id >= nodeSum.length) {
        nodeSum.push(0);
        nodeCount.push(0);
      }
      nodeSum[id] = (nodeSum[id] as number) + terrain.heightAt(x, z);
      nodeCount[id] = (nodeCount[id] as number) + 1;
      ends.push(id);
    }
    endNodes.push([ends[0] as number, ends[1] as number]);
  }
  const nodeHeight = (id: number) => (nodeSum[id] as number) / (nodeCount[id] as number);

  const planned: PlannedRoad[] = [];
  const spans: RoadSpan[] = [];
  roads.forEach((road, ri) => {
    const length = pathLength(Array.from(road.xz));
    const segments = Math.max(1, Math.round(length / step));
    const count = segments + 1;
    const xz = resampleUniform(road.xz, count);
    const ds = length / segments;
    const natural = new Float32Array(count);
    for (let i = 0; i < count; i++)
      natural[i] = terrain.heightAt(xz[i * 2] as number, xz[i * 2 + 1] as number);
    const bed = new Float32Array(natural);
    const kind = new Uint8Array(count);
    planned.push({ cls: road.cls, xz, step: ds, natural, bed, kind });
    if (count < 4) return; // çok kısa: doğal zeminde kalır

    const [na, nb] = endNodes[ri] as [number, number];
    const pinA = nodeHeight(na);
    const pinB = nodeHeight(nb);
    const h = Float64Array.from(natural);
    h[0] = pinA;
    h[count - 1] = pinB;
    // Boyuna profil: yumuşat + eğimi sınırla (uçları aşan bir eğim gerekiyorsa sınır o yol için gevşer).
    const cls = road.cls;
    const grade = Math.max(ROADS.gradeMax[cls] as number, (1.1 * Math.abs(pinB - pinA)) / length);
    const p = smoothValues(h, ds, ROADS.profileSigma[cls] as number);
    p[0] = pinA;
    p[count - 1] = pinB;
    limitGrade(p, ds, grade, pinA, pinB);
    const stepsFor = (meters: number) => Math.max(1, Math.ceil(meters / ds));
    const fillMax = ROADS.maxFill[cls] as number;
    const candidates: Candidate[] = [];

    // Tünel: eğim sınırlı profil sırtın derinden altından geçiyorsa (anayol, köy yolu).
    if (cls <= 1) {
      const deep = new Uint8Array(count);
      for (let i = 1; i < count - 1; i++) {
        if ((h[i] as number) - (p[i] as number) > S.tunnelDepth) deep[i] = 1;
      }
      for (const [a0, b0] of mergeRuns(runsOf(deep, 1), stepsFor(S.tunnelMergeGap))) {
        // Ağızlar: kazının ağız derinliğine indiği yere kadar dışarı.
        let a = a0;
        let b = b0;
        while (a > 1 && (h[a - 1] as number) - (p[a - 1] as number) > S.portalDepth) a--;
        while (b < count - 2 && (h[b + 1] as number) - (p[b + 1] as number) > S.portalDepth) b++;
        if ((b - a + 2) * ds < S.tunnelMinLength) continue;
        if (a < 2 || b > count - 3) continue; // ağız kavşakta olmasın
        candidates.push({ a, b, kind: SPAN_KIND.tunnel, viaduct: false });
      }
    }

    // Köprü: akarsu kesişimleri (ya da çizgi yoksa suya yakınlık).
    if (streams) {
      for (let i = 0; i + 1 < count; i++) {
        for (const c of streams.crossings(
          xz[i * 2] as number,
          xz[i * 2 + 1] as number,
          xz[i * 2 + 2] as number,
          xz[i * 2 + 3] as number,
        )) {
          const at = (i + c.t) * ds;
          const sin = Math.max(c.sin, Math.sin((S.minCrossingDeg * Math.PI) / 180));
          const half = Math.max(S.minSpan / 2, (c.half + S.bank) / sin);
          // Aday aralığı ayakların bir içi: ayaklar (a − 1, b + 1) kıyı payının dışındaki ilk noktalardır. Yolun ucuna
          // (kavşak) yakın geçişte aday uca kadar uzanır: ayak uç noktanın kendisi olur.
          const a = Math.max(0, Math.floor((at - half) / ds) + 1);
          const b = Math.min(count - 1, Math.ceil((at + half) / ds) - 1);
          if (b >= a) candidates.push({ a, b, kind: SPAN_KIND.bridge, viaduct: false });
        }
      }
      // Göl/rezervuar içinden geçen kesim de köprü (baraj, gölü kesen yol): çokgenin içindeki noktalar.
      if (terrain.nearestWater) {
        const wet = new Uint8Array(count);
        for (let i = 1; i < count - 1; i++) {
          const hit = terrain.nearestWater(xz[i * 2] as number, xz[i * 2 + 1] as number, 0.5);
          if (hit && WATER_AREA.has(hit.kind) && hit.distance <= 0.5) wet[i] = 1;
        }
        for (const [a, b] of mergeRuns(runsOf(wet, 1), 1))
          candidates.push({ a, b, kind: SPAN_KIND.bridge, viaduct: false });
      }
    } else if (terrain.nearestWater) {
      const wet = new Uint8Array(count);
      for (let i = 1; i < count - 1; i++) {
        const hit = terrain.nearestWater(xz[i * 2] as number, xz[i * 2 + 1] as number, 6);
        if (hit && !WATER_AREA.has(hit.kind) && hit.distance < streamHalf(hit.kind) + S.bank)
          wet[i] = 1;
      }
      for (const [a, b] of mergeRuns(runsOf(wet, 1), 1))
        candidates.push({ a, b, kind: SPAN_KIND.bridge, viaduct: false });
    }

    // Viyadük: yalnız anayolda, uzun ve derin dolgu.
    if (cls === 0) {
      const fill = new Uint8Array(count);
      for (let i = 1; i < count - 1; i++) {
        if ((p[i] as number) - (h[i] as number) > S.viaductFill) fill[i] = 1;
      }
      for (const [a, b] of mergeRuns(runsOf(fill, 1), 1)) {
        let deepest = 0;
        for (let i = a; i <= b; i++)
          deepest = Math.max(deepest, (p[i] as number) - (h[i] as number));
        if ((b - a + 1) * ds >= S.viaductMinLength || deepest > fillMax + S.fillSlack)
          candidates.push({ a, b, kind: SPAN_KIND.bridge, viaduct: true });
      }
    }

    // Birleştirme: tüneller önce yer alır; yakın köprüler (aralık `bridgeMergeGap`'ten kısa) tek köprüdür; tünelle çakışan
    // köprü atılır.
    const tunnels = candidates.filter((c) => c.kind === SPAN_KIND.tunnel);
    const bridges = candidates
      .filter((c) => c.kind === SPAN_KIND.bridge)
      .filter((c) => !tunnels.some((t) => c.b >= t.a - 1 && c.a <= t.b + 1))
      .sort((x, y) => x.a - y.a);
    const mergedBridges: Candidate[] = [];
    for (const c of bridges) {
      const last = mergedBridges[mergedBridges.length - 1];
      if (last && c.a - last.b <= stepsFor(S.bridgeMergeGap)) {
        last.b = Math.max(last.b, c.b);
        last.viaduct = last.viaduct || c.viaduct;
      } else mergedBridges.push({ ...c });
    }
    const chosen = [...tunnels, ...mergedBridges].sort((x, y) => x.a - y.a);
    const mySpans: RoadSpan[] = [];
    let lastEnd = 0;
    for (const c of chosen) {
      const i0 = Math.max(0, c.a - 1, lastEnd);
      let i1 = Math.min(count - 1, c.b + 1);
      // Uca yaslanan köprü en az iki adım uzar (ayak uç noktadır).
      if (i1 - i0 < 2) i1 = Math.min(count - 1, i0 + 2);
      if (i1 - i0 < 2) continue;
      mySpans.push({
        road: ri,
        i0,
        i1,
        kind: c.kind,
        viaduct: c.viaduct,
        type: 'beam',
      });
      for (let i = i0 + 1; i < i1; i++) kind[i] = c.kind;
      lastEnd = i1;
    }

    // Sınırlar: zeminde kazı/dolgu, köprüde zeminin üstü, tünelde örtü. Eğim sınırı ile dönüşümlü uygulanır.
    const lo = new Float64Array(count);
    const hi = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const hv = h[i] as number;
      if (kind[i] === SPAN_KIND.bridge) {
        lo[i] = hv + S.clearance;
        hi[i] = Number.POSITIVE_INFINITY;
      } else if (kind[i] === SPAN_KIND.tunnel) {
        lo[i] = Number.NEGATIVE_INFINITY;
        hi[i] = hv - S.portalDepth;
      } else {
        lo[i] = hv - ROADS.maxCut;
        hi[i] = hv + fillMax;
      }
    }
    lo[0] = hi[0] = pinA;
    lo[count - 1] = hi[count - 1] = pinB;
    // Yükseltilmiş köprü ayakları kesin sınırdır (güverte açıklığı); diğer zemin noktaları yumuşaktır.
    const hard = new Uint8Array(count);
    const solve = () => {
      // Önce tüm sınırlar, son turlarda yalnız yapı sınırları: eğim ve yapı gerekleri kesindir, kazı/dolgu yumuşaktır.
      const rounds = 8;
      for (let round = 0; round < rounds; round++) {
        limitGrade(p, ds, grade, pinA, pinB);
        const soft = round < rounds - 2;
        for (let i = 0; i < count; i++) {
          if (!soft && kind[i] === SPAN_KIND.ground && !hard[i] && i > 0 && i < count - 1) continue;
          p[i] = Math.min(Math.max(p[i] as number, lo[i] as number), hi[i] as number);
        }
      }
      limitGrade(p, ds, grade, pinA, pinB);
      for (let i = 1; i < count - 1; i++) {
        if (kind[i] === SPAN_KIND.ground && !hard[i]) continue;
        p[i] = Math.min(Math.max(p[i] as number, lo[i] as number), hi[i] as number);
      }
    };
    solve();
    // Köprü güvertesi iki ayak arasında düzdür: açıklık yetmiyorsa ayaklar (ve yaklaşım) yükseltilir.
    for (let iter = 0; iter < 4; iter++) {
      let raised = false;
      for (const span of mySpans) {
        if (span.kind !== SPAN_KIND.bridge) continue;
        const a = p[span.i0] as number;
        const b = p[span.i1] as number;
        let need = 0;
        for (let i = span.i0 + 1; i < span.i1; i++) {
          const t = (i - span.i0) / (span.i1 - span.i0);
          need = Math.max(need, (lo[i] as number) - (a + (b - a) * t));
        }
        if (need > 1e-3) {
          // Yolun ucundaki ayak kavşağa sabittir (kavşakta basamak olmasın): yalnızca öbür ayak yükselir, güverte eğimli olur.
          const pinnedA = span.i0 === 0;
          const pinnedB = span.i1 === count - 1;
          if (pinnedA && pinnedB) continue;
          let raiseA = need;
          let raiseB = need;
          if (pinnedA || pinnedB) {
            // Sabit uçtan geçen doğrunun tüm köprü noktalarının üstünde kalması için öbür ucun gereken yükselişi.
            let top = 0;
            for (let i = span.i0 + 1; i < span.i1; i++) {
              const t = (i - span.i0) / (span.i1 - span.i0);
              const t2 = pinnedA ? t : 1 - t;
              const fixed = pinnedA ? a : b;
              const free = pinnedA ? b : a;
              top = Math.max(
                top,
                ((lo[i] as number) - fixed) / Math.max(t2, 1e-6) - (free - fixed),
              );
            }
            raiseA = pinnedA ? 0 : top;
            raiseB = pinnedB ? 0 : top;
          }
          hard[span.i0] = 1;
          hard[span.i1] = 1;
          lo[span.i0] = Math.max(lo[span.i0] as number, a + raiseA);
          lo[span.i1] = Math.max(lo[span.i1] as number, b + raiseB);
          hi[span.i0] = Math.max(hi[span.i0] as number, lo[span.i0] as number);
          hi[span.i1] = Math.max(hi[span.i1] as number, lo[span.i1] as number);
          raised = true;
        }
      }
      if (!raised) break;
      solve();
    }
    for (const span of mySpans) {
      if (span.kind !== SPAN_KIND.bridge) continue;
      const a = p[span.i0] as number;
      const b = p[span.i1] as number;
      for (let i = span.i0 + 1; i < span.i1; i++) {
        const t = (i - span.i0) / (span.i1 - span.i0);
        p[i] = a + (b - a) * t;
      }
    }
    // Kısa köprüler düzdür: ayaklar arasındaki eksen doğrultulur (virajlı yolda yan yana duran güverte kutuları açılıp
    // saçılmasın). Uzun köprü (viyadük) yolun virajını izler.
    for (const span of mySpans) {
      if (span.kind !== SPAN_KIND.bridge) continue;
      const len = (span.i1 - span.i0) * ds;
      // Uzun köprü yolun virajını izler (doğrultulursa yoldan sapar).
      const full = len <= 24 ? 1 : 0;
      const ax = xz[span.i0 * 2] as number;
      const az = xz[span.i0 * 2 + 1] as number;
      const bx = xz[span.i1 * 2] as number;
      const bz = xz[span.i1 * 2 + 1] as number;
      for (let i = span.i0 + 1; i < span.i1; i++) {
        const t = (i - span.i0) / (span.i1 - span.i0);
        const taper = full * Math.min(1, Math.sin(Math.PI * t) * 2.2);
        xz[i * 2] = (xz[i * 2] as number) * (1 - taper) + (ax + (bx - ax) * t) * taper;
        xz[i * 2 + 1] = (xz[i * 2 + 1] as number) * (1 - taper) + (az + (bz - az) * t) * taper;
        natural[i] = terrain.heightAt(xz[i * 2] as number, xz[i * 2 + 1] as number);
      }
      // Tür: yol sınıfı, uzunluk, güvertenin zeminden en büyük yüksekliği.
      let height = 0;
      for (let i = span.i0; i <= span.i1; i++)
        height = Math.max(height, (p[i] as number) - (natural[i] as number));
      span.type = bridgeTypeFor(cls, len, height, span.viaduct, ax, az);
    }
    spans.push(...mySpans);

    // Dağ patikası istisnası: eğimli arazide (yalnız sınıf 2) yatak doğal zemine yaklaşır.
    for (let i = 0; i < count; i++) {
      let w = 1;
      if (cls === 2 && kind[i] === SPAN_KIND.ground) w = lowlandWeight(terrain, xz, i, count);
      bed[i] = (h[i] as number) + w * ((p[i] as number) - (h[i] as number));
    }
    // Patika köprüsünün ayakları yaklaşan yatakla aynı (doğal zemine yaklaşan patikada da güverte ayağa oturur).
    if (cls === 2) {
      for (const span of mySpans) {
        if (span.kind !== SPAN_KIND.bridge) continue;
        const a = bed[span.i0] as number;
        const b = bed[span.i1] as number;
        let need = 0;
        for (let i = span.i0 + 1; i < span.i1; i++) {
          const t = (i - span.i0) / (span.i1 - span.i0);
          need = Math.max(need, (natural[i] as number) + S.clearance - (a + (b - a) * t));
        }
        for (let i = span.i0 + 1; i < span.i1; i++) {
          const t = (i - span.i0) / (span.i1 - span.i0);
          bed[i] = a + (b - a) * t + need * Math.sin(Math.PI * t);
        }
      }
    }
  });
  return { roads: planned, spans };
}

/** Patika düzeltme ağırlığı (0 = doğal zemin, 1 = tam düzeltme): arazi eğimi arttıkça düşer. */
function lowlandWeight(
  terrain: ProfileTerrain,
  xz: Float32Array,
  i: number,
  count: number,
): number {
  let sum = 0;
  let n = 0;
  for (let k = Math.max(0, i - 3); k <= Math.min(count - 1, i + 3); k++) {
    const x = xz[k * 2] as number;
    const z = xz[k * 2 + 1] as number;
    const gx = (terrain.heightAt(x + 2, z) - terrain.heightAt(x - 2, z)) / 4;
    const gz = (terrain.heightAt(x, z + 2) - terrain.heightAt(x, z - 2)) / 4;
    sum += (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
    n++;
  }
  const slope = sum / n;
  const full = ROADS.mountainSlopeDeg - ROADS.mountainBlendDeg;
  return Math.min(
    1,
    Math.max(0, (ROADS.mountainSlopeDeg - slope) / (ROADS.mountainSlopeDeg - full)),
  );
}

/** Planın zemin kesimleri: köprü/tünel olmayan çizgiler (arazi kaplamasında boyanır). */
export function groundRuns(plan: RoadPlan): RoadData[] {
  return runsWhere(plan, (k) => k === SPAN_KIND.ground);
}

/** Planın yüzey kesimleri: tünel içi hariç (köprüler dahil): nesne eleme ve insanların yürüyüşü. */
export function surfaceRuns(plan: RoadPlan): RoadData[] {
  return runsWhere(plan, (k) => k !== SPAN_KIND.tunnel);
}

/** `keep` doğru olan noktalardan oluşan kesimler; yapı kesiminin uç (ayak/ağız) noktaları iki yanda da kalır. */
function runsWhere(plan: RoadPlan, keep: (kind: number) => boolean): RoadData[] {
  const out: RoadData[] = [];
  for (const road of plan.roads) {
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 4) out.push({ cls: road.cls, xz: Float32Array.from(run) });
      run = [];
    };
    const n = road.xz.length / 2;
    for (let i = 0; i < n; i++) {
      run.push(road.xz[i * 2] as number, road.xz[i * 2 + 1] as number);
      const next = i + 1 < n ? (road.kind[i + 1] as number) : 0;
      // Atlanan kesim başlıyorsa (sonraki nokta atlanan türde) kesim bu noktada biter.
      if (!keep(next)) {
        flush();
        // Kesimin sonuna atla: ilk tutulan noktadan (ayak/ağız) yeniden başla.
        let j = i + 1;
        while (j < n && !keep(road.kind[j] as number)) j++;
        i = j - 1;
      }
    }
    flush();
  }
  return out;
}
