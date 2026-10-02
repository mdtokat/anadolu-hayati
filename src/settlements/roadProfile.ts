import { FRESH_WATER, ROADS, ROAD_STRUCTURES } from '../config';
import type { RoadClass, RoadData } from '../data/settlements';
import { NodeIndex, pathLength } from './roadNetwork';
import type { NearestWater } from './roadRouting';

/**
 * Yol boyuna profili (saf mantık): her yol için zemine uygun, düzgün ve eğimi sınırlı bir "yatak" (bed) yüksekliği
 * tasarlar. Arazi yoldan bağımsızdır; yol araziyi yumuşatır: tepeler kazılır (yarma), çukurlar doldurulur, dere geçişleri
 * ve derin vadi geçişleri köprü (viyadük) olur. Tünel yoktur: arazi yükseklik ızgarasında delik açılamadığından derin
 * sırtlar yarma ile geçilir. Zemini yola uydurmayı `world/roadGrading.ts` yapar.
 *
 * Yöntem: arazi yüksekliği yol boyunca eşit aralıkla örneklenir, yumuşatılır (sınıfa göre `profileSigma`), eğim
 * `gradeMax` ile sınırlanır (uçlar kavşağın doğal yüksekliğine sabit); sonra köprü/tünel kesimleri seçilir ve kalan
 * noktalarda kazı (`maxCut`) / dolgu (`maxFill`) sınırları uygulanır.
 */

/** Plan noktasının türü. */
export const SPAN_KIND = { ground: 0, bridge: 1 } as const;
export type SpanKind = (typeof SPAN_KIND)[keyof typeof SPAN_KIND];

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

/** Köprü: `i0` ve `i1` zemin kalan kıyı (ayak) noktalarıdır, aradaki noktalar köprü kesimidir. */
export interface RoadSpan {
  road: number;
  i0: number;
  i1: number;
  kind: Exclude<SpanKind, 0>;
  /** Köprü için: dere değil, derin dolgu yerine kurulan viyadük. */
  viaduct: boolean;
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

/**
 * Tüm yolların profilini tasarlar. `roads` düğümlerinde bölünmüş olmalıdır (`shapeRoadNetwork` çıktısı): aynı kavşakta
 * buluşan yolların uçları kavşağın doğal yüksekliğine sabitlenir, böylece kavşakta basamak olmaz.
 */
export function planRoadProfiles(roads: readonly RoadData[], terrain: ProfileTerrain): RoadPlan {
  const step = ROADS.profileStep;
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

    // Kesim türleri (dere geçişi, derin dolgu = viyadük, derin kazı = tünel) profile göre seçilir; sınırlar uygulanınca
    // zeminde kalıp dolgu sınırını aşan noktalar da köprüye alınır (en çok iki tur).
    const fillMax = ROADS.maxFill[cls] as number;
    const stepsFor = (meters: number) => Math.max(1, Math.ceil(meters / ds));
    const wet = new Uint8Array(count);
    if (terrain.nearestWater) {
      // Önce her ikinci noktada geniş yarıçapla "suya yakın mı" bakılır; yalnızca yakın olanların komşularında kesin ölçülür.
      const reach =
        ROAD_STRUCTURES.wetMargin + (FRESH_WATER.lineWidth.river as number) / 2 + ds + 0.5;
      const near = new Uint8Array(count);
      for (let i = 1; i < count - 1; i += 2) {
        if (terrain.nearestWater(xz[i * 2] as number, xz[i * 2 + 1] as number, reach)) {
          near[i] = 1;
          near[i - 1] = 1;
          near[i + 1] = 1;
        }
      }
      for (let i = 1; i < count - 1; i++) {
        if (!near[i]) continue;
        const hit = terrain.nearestWater(xz[i * 2] as number, xz[i * 2 + 1] as number, 6);
        if (
          hit &&
          !WATER_AREA.has(hit.kind) &&
          hit.distance < streamHalf(hit.kind) + ROAD_STRUCTURES.wetMargin
        ) {
          wet[i] = 1;
        }
      }
    }
    const lo = new Float64Array(count);
    const hi = new Float64Array(count);
    const mySpans: RoadSpan[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      kind.fill(SPAN_KIND.ground);
      mySpans.length = 0;
      const fill = new Uint8Array(count);
      for (let i = 1; i < count - 1; i++) {
        if ((p[i] as number) - (h[i] as number) > ROAD_STRUCTURES.viaductFill) fill[i] = 1;
      }

      // Köprü adayları: dere kesimleri ve derin dolgu (uzunsa ya da dolgu sınırını aşıyorsa).
      const wetRuns = mergeRuns(runsOf(wet, 1), 1);
      const fillRuns = mergeRuns(runsOf(fill, 1), 1).filter(([a, b]) => {
        let deepest = 0;
        for (let i = a; i <= b; i++)
          deepest = Math.max(deepest, (p[i] as number) - (h[i] as number));
        return b - a + 1 >= stepsFor(ROAD_STRUCTURES.viaductMinLength) || deepest > fillMax + 0.4;
      });
      const candidates = [
        ...wetRuns.map(([a, b]) => ({ a, b, viaduct: false })),
        ...fillRuns.map(([a, b]) => ({ a, b, viaduct: true })),
      ].sort((x, y) => x.a - y.a);
      // Çakışan/bitişik adaylar birleşir (dere geçen bir viyadük tek yapıdır).
      const merged: Array<{ a: number; b: number; viaduct: boolean }> = [];
      for (const c of candidates) {
        const last = merged[merged.length - 1];
        if (last && c.a <= last.b + 2) {
          last.b = Math.max(last.b, c.b);
          last.viaduct = last.viaduct || c.viaduct;
        } else merged.push({ ...c });
      }
      let lastEnd = -1;
      for (const run of merged) {
        const i0 = Math.max(0, run.a - 1, lastEnd);
        const i1 = Math.min(count - 1, run.b + 1);
        if (i1 - i0 < 2 || (i1 - i0) * ds < ROAD_STRUCTURES.minSpan) continue;
        if (kind.subarray(i0 + 1, i1).some((k) => k !== SPAN_KIND.ground)) continue; // önceki köprüyle çakışmasın
        mySpans.push({ road: ri, i0, i1, kind: SPAN_KIND.bridge, viaduct: run.viaduct });
        for (let i = i0 + 1; i < i1; i++) kind[i] = SPAN_KIND.bridge;
        lastEnd = i1;
      }

      // Sınırlar: zeminde kazı/dolgu, köprüde zeminin üstü. Eğim sınırı ile dönüşümlü uygulanır.
      for (let i = 0; i < count; i++) {
        const hv = h[i] as number;
        if (kind[i] === SPAN_KIND.bridge) {
          lo[i] = hv + ROAD_STRUCTURES.clearance;
          hi[i] = Number.POSITIVE_INFINITY;
        } else {
          lo[i] = hv - ROADS.maxCut;
          hi[i] = hv + fillMax;
        }
      }
      lo[0] = hi[0] = pinA;
      lo[count - 1] = hi[count - 1] = pinB;
      // Önce tüm sınırlar (zemin kazı/dolgu dahil), son turlarda yalnız yapı sınırları: eğim ve yapı gerekleri kesindir,
      // kazı/dolgu sınırı yumuşaktır (bir miktar aşılabilir).
      const rounds = 8;
      for (let round = 0; round < rounds; round++) {
        limitGrade(p, ds, grade, pinA, pinB);
        const soft = round < rounds - 2;
        for (let i = 0; i < count; i++) {
          if (!soft && kind[i] === SPAN_KIND.ground && i > 0 && i < count - 1) continue;
          p[i] = Math.min(Math.max(p[i] as number, lo[i] as number), hi[i] as number);
        }
      }
      limitGrade(p, ds, grade, pinA, pinB);
      // Yapı sınırları kesindir (köprü açıklığı): eğim sınırlamasının bozduğu yerler yeniden kıskaçlanır.
      for (let i = 1; i < count - 1; i++) {
        if (kind[i] === SPAN_KIND.ground) continue;
        p[i] = Math.min(Math.max(p[i] as number, lo[i] as number), hi[i] as number);
      }

      // Zeminde kalıp dolgu sınırını aşan nokta var mı? Varsa bir tur daha, bu kez köprüye alınarak.
      let violation = false;
      for (let i = 1; i < count - 1 && !violation; i++) {
        violation =
          kind[i] === SPAN_KIND.ground &&
          (p[i] as number) - (h[i] as number) > fillMax + ROAD_STRUCTURES.fillSlack;
      }
      if (!violation) break;
    }
    spans.push(...mySpans);
    // Köprüler düzdür: kıyı noktaları arasındaki eksen doğrultulur (virajlı yolda yan yana duran güverte kutuları açılıp
    // saçılmasın). Uzun açıklıklarda yalnızca kısmen doğrultulur.
    for (const span of mySpans) {
      if (span.kind !== SPAN_KIND.bridge) continue;
      const len = (span.i1 - span.i0) * ds;
      const full = len <= 30 ? 1 : Math.max(0.4, 1 - (len - 30) / 40);
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
    }

    // Dağ patikası istisnası: eğimli arazide (yalnız sınıf 2) yatak doğal zemine yaklaşır.
    for (let i = 0; i < count; i++) {
      let w = 1;
      if (cls === 2 && kind[i] === SPAN_KIND.ground) w = lowlandWeight(terrain, xz, i, count);
      bed[i] = (h[i] as number) + w * ((p[i] as number) - (h[i] as number));
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
      // Köprü/tünel başlıyorsa (sonraki nokta kesim türünde) zemin kesimi bu noktada biter.
      if (next !== SPAN_KIND.ground) {
        flush();
        // Kesimin sonuna atla: ilk zemin noktasından (ağız) yeniden başla.
        let j = i + 1;
        while (j < n && road.kind[j] !== SPAN_KIND.ground) j++;
        i = j - 1;
      }
    }
    flush();
  }
  return out;
}
