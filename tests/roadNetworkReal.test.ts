import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER, ROADS } from '../src/config';
import type { RegionData } from '../src/data/region';
import { footprintRadius, settlementCenter } from '../src/settlements/layout';
import { SPAN_KIND } from '../src/settlements/roadProfile';
import { loadRealWorld } from './helpers/realRegion';
import { buildSettlementWorld, type SettlementWorld } from './helpers/settlementWorld';

/** Gerçek dünyada yol ağı: bağlantı, düzgünlük, eğim, köprü, sınıf düzeni (Faz 10 sonrası yol düzenlemesi). */
let world: RegionData;
let sw: SettlementWorld;

beforeAll(async () => {
  world = await loadRealWorld();
  sw = buildSettlementWorld(world);
}, 120_000);

const towns = () =>
  world.settlements!.settlements.map((s) => ({
    ...settlementCenter(s),
    r: footprintRadius(s),
    rank: s.rank,
  }));

describe('yol ağı — bağlantı', () => {
  it('kopuk küçük yol parçası kalmaz (yerleşimden ve dünya kenarından uzakta < 80 m)', () => {
    const lines = sw.map.roadLines;
    const cell = 4;
    const grid = new Map<number, Array<{ x: number; z: number; line: number }>>();
    const parent = Int32Array.from({ length: lines.length }, (_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]!]!;
        i = parent[i]!;
      }
      return i;
    };
    const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
    const lengthOf = new Float64Array(lines.length);
    lines.forEach((line, li) => {
      const xz = line.xz;
      for (let i = 0; i + 3 < xz.length; i += 2) {
        const ax = xz[i]!;
        const az = xz[i + 1]!;
        const bx = xz[i + 2]!;
        const bz = xz[i + 3]!;
        const len = Math.hypot(bx - ax, bz - az);
        lengthOf[li] = lengthOf[li]! + len;
        const n = Math.max(1, Math.ceil(len / 2));
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const z = az + ((bz - az) * k) / n;
          const cx = Math.floor(x / cell);
          const cz = Math.floor(z / cell);
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              for (const o of grid.get(key(cx + dx, cz + dz)) ?? []) {
                if (o.line !== li && Math.hypot(o.x - x, o.z - z) <= ROADS.nodeSnap + 0.2) {
                  parent[find(li)] = find(o.line);
                }
              }
            }
          }
          const list = grid.get(key(cx, cz));
          if (list) list.push({ x, z, line: li });
          else grid.set(key(cx, cz), [{ x, z, line: li }]);
        }
      }
    });
    const compLen = new Map<number, number>();
    const compPts = new Map<number, number[]>();
    lines.forEach((line, li) => {
      const root = find(li);
      compLen.set(root, (compLen.get(root) ?? 0) + lengthOf[li]!);
      const pts = compPts.get(root) ?? [];
      pts.push(line.xz[0]!, line.xz[1]!);
      compPts.set(root, pts);
    });
    const b = sw.source.bounds;
    const t = towns();
    let tiny = 0;
    let total = 0;
    for (const [root, len] of compLen) {
      total += len;
      if (len >= 80) continue;
      const pts = compPts.get(root)!;
      const anchored = pts.some((_, k) => {
        if (k % 2) return false;
        const x = pts[k]!;
        const z = pts[k + 1]!;
        if (x < b.minX + 20 || x > b.maxX - 20 || z < b.minZ + 20 || z > b.maxZ - 20) return true;
        return t.some((s) => Math.hypot(x - s.x, z - s.z) <= s.r + 40);
      });
      if (!anchored) tiny++;
    }
    expect(tiny).toBe(0);
    expect(total).toBeGreaterThan(100_000);
    // Ağın büyük kısmı tek bir iri bileşendedir (anayol + tali + patika birbirine bağlı).
    const largest = Math.max(...compLen.values());
    expect(largest / total).toBeGreaterThan(0.6);
  });

  it('çıkmaz budama ve kırsal sınıflandırma çalıştı', () => {
    expect(sw.network.pruned).toBeGreaterThan(500);
    expect(sw.network.demoted).toBeGreaterThan(100);
    expect(sw.network.linked).toBeGreaterThan(20);
    expect(sw.network.edgesOut).toBeLessThan(sw.network.edgesIn);
  });
});

describe('yol ağı — düzgünlük ve eğim', () => {
  it('yol çizgilerinde keskin dönüş yok (3 m aralıkta > 60° dönüş < %0,5)', () => {
    let sharp = 0;
    let samples = 0;
    for (const road of sw.map.plan.roads) {
      if (road.cls === 2) continue;
      const n = road.xz.length / 2;
      for (let i = 2; i + 2 < n; i++) {
        const a1 = Math.atan2(
          road.xz[i * 2 + 1]! - road.xz[(i - 1) * 2 + 1]!,
          road.xz[i * 2]! - road.xz[(i - 1) * 2]!,
        );
        const a2 = Math.atan2(
          road.xz[(i + 1) * 2 + 1]! - road.xz[i * 2 + 1]!,
          road.xz[(i + 1) * 2]! - road.xz[i * 2]!,
        );
        let d = Math.abs(a2 - a1);
        if (d > Math.PI) d = 2 * Math.PI - d;
        samples++;
        if ((d * 180) / Math.PI > 60) sharp++;
      }
    }
    expect(samples).toBeGreaterThan(10_000);
    expect(sharp / samples).toBeLessThan(0.005);
  });

  it('anayol yatağı eğimi sınırda: uzunluğun ≥ %92’si gradeMax × 1,5 altında', () => {
    let ok = 0;
    let total = 0;
    for (const road of sw.map.plan.roads) {
      if (road.cls !== 0) continue;
      for (let i = 0; i + 1 < road.bed.length; i++) {
        const g = Math.abs(road.bed[i + 1]! - road.bed[i]!) / road.step;
        total += road.step;
        if (g <= (ROADS.gradeMax[0] as number) * 1.5) ok += road.step;
      }
    }
    expect(total).toBeGreaterThan(30_000);
    expect(ok / total).toBeGreaterThan(0.92);
  });

  it('kavşakta buluşan yolların yatak yükseklikleri uyuşur (basamak yok)', () => {
    const ends = new Map<string, number[]>();
    for (const road of sw.map.plan.roads) {
      const n = road.bed.length;
      if (n < 4) continue;
      for (const [x, z, h] of [
        [road.xz[0]!, road.xz[1]!, road.bed[0]!],
        [road.xz[(n - 1) * 2]!, road.xz[(n - 1) * 2 + 1]!, road.bed[n - 1]!],
      ] as const) {
        const k = `${Math.round(x / 3)},${Math.round(z / 3)}`;
        const list = ends.get(k) ?? [];
        list.push(h);
        ends.set(k, list);
      }
    }
    let nodes = 0;
    let bad = 0;
    for (const list of ends.values()) {
      if (list.length < 2) continue;
      nodes++;
      if (Math.max(...list) - Math.min(...list) > 0.6) bad++;
    }
    expect(nodes).toBeGreaterThan(1000);
    expect(bad / nodes).toBeLessThan(0.03);
  });

  it('zemin yola uydurulmuş: zemin kesimlerinde arazi yatağa ≤ 0,3 m yakın (≥ %95)', () => {
    let near = 0;
    let total = 0;
    for (const road of sw.map.plan.roads) {
      if (road.cls === 2) continue; // dağ patikaları istisna
      for (let i = 0; i < road.bed.length; i++) {
        if (road.kind[i] !== SPAN_KIND.ground) continue;
        total++;
        const h = sw.source.heightAt(road.xz[i * 2]!, road.xz[i * 2 + 1]!);
        if (Math.abs(h - road.bed[i]!) <= 0.3) near++;
      }
    }
    expect(total).toBeGreaterThan(20_000);
    expect(near / total).toBeGreaterThan(0.95);
  });
});

describe('yol ağı — köprüler', () => {
  it('dere geçişleri köprüdür: ana/tali yol zemin noktalarının < %1’i akarsu içinde', () => {
    const water = sw.water!;
    let wet = 0;
    let total = 0;
    for (const road of sw.map.plan.roads) {
      if (road.cls === 2) continue;
      for (let i = 1; i + 1 < road.bed.length; i++) {
        if (road.kind[i] !== SPAN_KIND.ground) continue;
        total++;
        const hit = water.nearest(road.xz[i * 2]!, road.xz[i * 2 + 1]!, 3);
        const half = (FRESH_WATER.lineWidth as Record<string, number>)[hit?.kind ?? ''] ?? 0;
        if (hit && half > 0 && hit.distance < half / 2) wet++;
      }
    }
    expect(wet / total).toBeLessThan(0.01);
  });

  it('köprüler var: yüzlerce dere köprüsü, ana yol ve patika dar farkıyla', () => {
    const plan = sw.map.plan;
    expect(plan.spans.length).toBeGreaterThan(500);
    const byClass = [0, 0, 0];
    for (const span of plan.spans) byClass[plan.roads[span.road]!.cls]!++;
    expect(byClass[0]).toBeGreaterThan(50);
    expect(byClass[1]).toBeGreaterThan(50);
    expect(byClass[2]).toBeGreaterThan(5);
    // Köprü altı doğal kalır; kıyılar zeminde, aradaki noktalar köprü türünde.
    for (const span of plan.spans.slice(0, 200)) {
      const r = plan.roads[span.road]!;
      expect(r.kind[span.i0]).toBe(SPAN_KIND.ground);
      expect(r.kind[span.i1]).toBe(SPAN_KIND.ground);
      expect(r.kind[span.i0 + 1]).toBe(SPAN_KIND.bridge);
    }
  });
});

describe('yol ağı — yoğunluğa göre sınıf', () => {
  it('yerleşimden çok uzakta tali yol (sınıf 1) neredeyse yok; anayol ve patika var', () => {
    const t = towns();
    const lens = [0, 0, 0];
    let farClass1 = 0;
    for (const line of sw.map.roadLines) {
      if (sw.map.streetLines.includes(line)) continue;
      for (let i = 0; i + 3 < line.xz.length; i += 2) {
        const len = Math.hypot(line.xz[i + 2]! - line.xz[i]!, line.xz[i + 3]! - line.xz[i + 1]!);
        lens[line.cls]! += len;
        if (line.cls !== 1) continue;
        const mx = (line.xz[i]! + line.xz[i + 2]!) / 2;
        const mz = (line.xz[i + 1]! + line.xz[i + 3]!) / 2;
        const d = Math.min(...t.map((s) => Math.hypot(mx - s.x, mz - s.z) - s.r));
        if (d > (ROADS.ruralDistance as number) + 150) farClass1 += len;
      }
    }
    expect(lens[0]).toBeGreaterThan(30_000);
    expect(lens[2]).toBeGreaterThan(20_000);
    expect(farClass1 / lens[1]!).toBeLessThan(0.1);
  });

  it('kent sokakları yapıların yanındadır (yapısız sokak yok) ve ana cadde sınıf 0', () => {
    const buildings = sw.map.buildings;
    let far = 0;
    let main = 0;
    for (const street of sw.map.streetLines) {
      const mx = (street.xz[0]! + street.xz[street.xz.length - 2]!) / 2;
      const mz = (street.xz[1]! + street.xz[street.xz.length - 1]!) / 2;
      if (street.cls === 0) main++;
      const near = buildings.some((b) => Math.hypot(b.x - mx, b.z - mz) <= 45);
      if (!near) far++;
    }
    expect(sw.map.streetLines.length).toBeGreaterThan(100);
    expect(far / sw.map.streetLines.length).toBeLessThan(0.05);
    expect(main).toBeGreaterThan(5);
  });
});
