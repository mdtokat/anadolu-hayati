import { FRESH_WATER } from '../../src/config';
import type { RoadData } from '../../src/data/settlements';
import { SPAN_KIND, type RoadPlan } from '../../src/settlements/roadProfile';
import type { SettlementWorld } from './settlementWorld';

/**
 * Yol ağı ölçüleri (test ve ölçüm belgesi): parçalanma, paralel ikiz yollar, küçük halkalar (göbek/ayrım),
 * çıkmazlar, köprü sayısı/uzunluğu, ardışık köprüler, köprü tepeleri ve yamaçta duran akarsular.
 */

export interface RoadMetrics {
  /** Sınıf başına toplam uzunluk (oyun m). */
  length: number[];
  lines: number;
  /** Bağlı bileşen sayısı, en büyük bileşenin toplam uzunluğa oranı. */
  components: number;
  largestShare: number;
  /** Yerleşimden/dünya kenarından uzak çıkmaz uç sayısı. */
  deadEnds: number;
  /** Başka bir yola 8 m'den yakın ve ona paralel (< 25°) giden yol uzunluğu (ikiz şerit, oyun m; sokaklar hariç). */
  parallel: number;
  /** Çevresi < 400 m olan halka sayısı (göbek, ayrım; kent sokakları hariç). */
  smallLoops: number;
  bridges: number;
  /** Köprü uzunlukları: ortanca, %90'lık, en büyük (oyun m). */
  bridgeMedian: number;
  bridgeP90: number;
  bridgeMax: number;
  /** Aynı yolda bir öncekine 30 m'den yakın köprü. */
  consecutiveBridges: number;
  /** Köprü güvertesi kıyılar arası doğrudan en çok bu kadar (oyun m) yukarıda (tepe). */
  peakedBridges: number;
  /** Akarsuya paralel köprü (uzunluk, gereken geçişin 3 katından fazla). */
  parallelBridges: number;
  tunnels: number;
}

function key(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

/** Çizgileri ~2 m aralıklı örneklere ayırır: [x, z, yönAçısı, çizgi]. */
function samples(lines: readonly RoadData[]): Float64Array {
  const out: number[] = [];
  lines.forEach((line, li) => {
    const xz = line.xz;
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const ax = xz[i]!;
      const az = xz[i + 1]!;
      const bx = xz[i + 2]!;
      const bz = xz[i + 3]!;
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / 2));
      const ang = Math.atan2(bz - az, bx - ax);
      for (let k = 0; k <= n; k++)
        out.push(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, ang, li);
    }
  });
  return Float64Array.from(out);
}

export function measureRoads(
  sw: SettlementWorld,
  towns: ReadonlyArray<{ x: number; z: number; r: number }>,
): RoadMetrics {
  const lines = sw.map.roadLines;
  const length = [0, 0, 0, 0];
  for (const line of lines) {
    for (let i = 0; i + 3 < line.xz.length; i += 2) {
      length[line.cls] =
        length[line.cls]! +
        Math.hypot(line.xz[i + 2]! - line.xz[i]!, line.xz[i + 3]! - line.xz[i + 1]!);
    }
  }

  // Bileşenler ve paralel ikizler: örnek ızgarası.
  const sp = samples(lines);
  const cell = 8;
  const grid = new Map<number, number[]>();
  for (let s = 0; s * 4 < sp.length; s++) {
    const k = key(Math.floor(sp[s * 4]! / cell), Math.floor(sp[s * 4 + 1]! / cell));
    const list = grid.get(k);
    if (list) list.push(s);
    else grid.set(k, [s]);
  }
  const parent = Int32Array.from({ length: lines.length }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  let parallel = 0;
  // Uçlar (çıkmaz ölçüsü için): uç noktaya 3 m içinde başka çizgi örneği var mı?
  const endTouch = new Uint8Array(lines.length * 2);
  for (let s = 0; s * 4 < sp.length; s++) {
    const x = sp[s * 4]!;
    const z = sp[s * 4 + 1]!;
    const ang = sp[s * 4 + 2]!;
    const li = sp[s * 4 + 3]!;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    let twin = false;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const o of grid.get(key(cx + dx, cz + dz)) ?? []) {
          const lo = sp[o * 4 + 3]!;
          if (lo === li) continue;
          const d = Math.hypot(sp[o * 4]! - x, sp[o * 4 + 1]! - z);
          if (d <= 2.7) parent[find(li)] = find(lo);
          if (!twin && d <= 8 && d > 2.7 && lines[li]!.cls < 3 && lines[lo]!.cls < 3) {
            let da = Math.abs(sp[o * 4 + 2]! - ang) % Math.PI;
            if (da > Math.PI / 2) da = Math.PI - da;
            if (da < (25 * Math.PI) / 180) twin = true;
          }
        }
      }
    }
    if (twin) parallel += 2;
  }
  lines.forEach((line, li) => {
    const n = line.xz.length;
    [0, n - 2].forEach((at, e) => {
      const x = line.xz[at]!;
      const z = line.xz[at + 1]!;
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      for (let dx = -1; dx <= 1 && !endTouch[li * 2 + e]; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const o of grid.get(key(cx + dx, cz + dz)) ?? []) {
            if (sp[o * 4 + 3] === li) continue;
            if (Math.hypot(sp[o * 4]! - x, sp[o * 4 + 1]! - z) <= 3) {
              endTouch[li * 2 + e] = 1;
              break;
            }
          }
        }
      }
    });
  });
  const b = sw.source.bounds;
  let deadEnds = 0;
  lines.forEach((line, li) => {
    const n = line.xz.length;
    [0, n - 2].forEach((at, e) => {
      if (endTouch[li * 2 + e]) return;
      const x = line.xz[at]!;
      const z = line.xz[at + 1]!;
      if (x < b.minX + 20 || x > b.maxX - 20 || z < b.minZ + 20 || z > b.maxZ - 20) return;
      if (towns.some((t) => Math.hypot(x - t.x, z - t.z) <= t.r + 20)) return;
      deadEnds++;
    });
  });
  const compLen = new Map<number, number>();
  let total = 0;
  lines.forEach((line, li) => {
    let l = 0;
    for (let i = 0; i + 3 < line.xz.length; i += 2)
      l += Math.hypot(line.xz[i + 2]! - line.xz[i]!, line.xz[i + 3]! - line.xz[i + 1]!);
    total += l;
    compLen.set(find(li), (compLen.get(find(li)) ?? 0) + l);
  });

  // Küçük halkalar: uç düğümlerinden çizge; her kenar için kendisi olmadan uçları arası en kısa yol.
  const nodeOf = new Map<number, number>();
  const nodeId = (x: number, z: number) => {
    const k = key(Math.round(x / 3), Math.round(z / 3));
    let id = nodeOf.get(k);
    if (id === undefined) {
      id = nodeOf.size;
      nodeOf.set(k, id);
    }
    return id;
  };
  const edges: Array<{ a: number; b: number; len: number }> = [];
  const adj = new Map<number, number[]>();
  lines.forEach((line) => {
    if (line.cls === 3) return; // kent sokakları blok kenarlarıdır (doğal halka)
    const n = line.xz.length;
    const a = nodeId(line.xz[0]!, line.xz[1]!);
    const bb = nodeId(line.xz[n - 2]!, line.xz[n - 1]!);
    let len = 0;
    for (let i = 0; i + 3 < n; i += 2)
      len += Math.hypot(line.xz[i + 2]! - line.xz[i]!, line.xz[i + 3]! - line.xz[i + 1]!);
    const id = edges.push({ a, b: bb, len }) - 1;
    for (const v of [a, bb]) {
      const list = adj.get(v) ?? [];
      list.push(id);
      adj.set(v, list);
    }
  });
  let smallLoops = 0;
  edges.forEach((e, id) => {
    if (e.len >= 400) return;
    if (e.a === e.b) {
      smallLoops++;
      return;
    }
    const limit = 400 - e.len;
    const dist = new Map<number, number>([[e.a, 0]]);
    const open: Array<[number, number]> = [[0, e.a]];
    while (open.length > 0) {
      open.sort((p, q) => q[0] - p[0]);
      const [d, v] = open.pop()!;
      if (d > (dist.get(v) ?? Infinity)) continue;
      if (v === e.b) {
        smallLoops++;
        return;
      }
      for (const oid of adj.get(v) ?? []) {
        if (oid === id) continue;
        const o = edges[oid]!;
        const w = o.a === v ? o.b : o.a;
        const nd = d + o.len;
        if (nd <= limit && nd < (dist.get(w) ?? Infinity)) {
          dist.set(w, nd);
          open.push([nd, w]);
        }
      }
    }
  });

  // Köprüler.
  const plan: RoadPlan = sw.map.plan;
  const bridgeLens: number[] = [];
  let consecutive = 0;
  let peaked = 0;
  let parallelBridges = 0;
  let tunnels = 0;
  const lastEnd = new Map<number, number>();
  const sorted = [...plan.spans].sort((p, q) => p.road - q.road || p.i0 - q.i0);
  for (const span of sorted) {
    const road = plan.roads[span.road]!;
    if (span.kind !== SPAN_KIND.bridge) {
      tunnels++;
      continue;
    }
    const len = (span.i1 - span.i0) * road.step;
    bridgeLens.push(len);
    const prev = lastEnd.get(span.road);
    if (prev !== undefined && (span.i0 - prev) * road.step < 30) consecutive++;
    lastEnd.set(span.road, span.i1);
    let peak = 0;
    for (let i = span.i0; i <= span.i1; i++) {
      const t = (i - span.i0) / (span.i1 - span.i0);
      const line = road.bed[span.i0]! + t * (road.bed[span.i1]! - road.bed[span.i0]!);
      peak = Math.max(peak, road.bed[i]! - line);
    }
    if (peak > 1.2) peaked++;
    if (sw.water && !span.viaduct) {
      // Akarsuya yakın nokta oranı: köprünün çoğu suya < 2 m ise akarsu boyunca uzanıyordur.
      let wet = 0;
      for (let i = span.i0; i <= span.i1; i++) {
        const hit = sw.water.nearest(road.xz[i * 2]!, road.xz[i * 2 + 1]!, 3);
        if (hit && hit.distance < 2) wet++;
      }
      const maxWidth = Math.max(...Object.values(FRESH_WATER.lineWidth));
      if (wet * road.step > 3 * (maxWidth + 4)) parallelBridges++;
    }
  }
  bridgeLens.sort((p, q) => p - q);
  const at = (f: number) =>
    bridgeLens[Math.min(bridgeLens.length - 1, Math.floor(f * bridgeLens.length))] ?? 0;
  return {
    length,
    lines: lines.length,
    components: compLen.size,
    largestShare: Math.max(...compLen.values()) / total,
    deadEnds,
    parallel,
    smallLoops,
    bridges: bridgeLens.length,
    bridgeMedian: at(0.5),
    bridgeP90: at(0.9),
    bridgeMax: bridgeLens[bridgeLens.length - 1] ?? 0,
    consecutiveBridges: consecutive,
    peakedBridges: peaked,
    parallelBridges,
    tunnels,
  };
}

/**
 * Yamaçta duran akarsu: akarsu çizgisinin iki yanında (±`probe` m) zemin farkı `limit`'i aşan örneklerin oranı.
 * Dere vadi tabanındaysa iki yan da yükselir (fark küçük); yamaçta ise bir yan yüksek, öbür yan alçaktır.
 */
export function sidewaysStreamShare(
  heightAt: (x: number, z: number) => number,
  lines: ReadonlyArray<{ xz: ArrayLike<number> }>,
  probe = 4,
  limit = 1.5,
): number {
  let bad = 0;
  let total = 0;
  for (const line of lines) {
    const xz = line.xz;
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const ax = xz[i] as number;
      const az = xz[i + 1] as number;
      const bx = xz[i + 2] as number;
      const bz = xz[i + 3] as number;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const n = Math.max(1, Math.floor(len / 6));
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * (k + 0.5)) / n;
        const z = az + ((bz - az) * (k + 0.5)) / n;
        const h0 = heightAt(x, z);
        const hl = heightAt(x + nx * probe, z + nz * probe);
        const hr = heightAt(x - nx * probe, z - nz * probe);
        total++;
        // Yan: bir taraf yüksek, öbür taraf dere seviyesinin altında.
        if (Math.min(hl, hr) < h0 - 0.3 && Math.abs(hl - hr) > limit) bad++;
      }
    }
  }
  return total > 0 ? bad / total : 0;
}
