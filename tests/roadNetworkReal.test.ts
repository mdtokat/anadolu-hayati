import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER, ROADS } from '../src/config';
import type { RegionData } from '../src/data/region';
import { footprintRadius, settlementCenter } from '../src/settlements/layout';
import { SPAN_KIND } from '../src/settlements/roadProfile';
import { loadRealWorld } from './helpers/realRegion';
import { measureRoads, sidewaysStreamShare, type RoadMetrics } from './helpers/roadMetrics';
import { buildSettlementWorld, type SettlementWorld } from './helpers/settlementWorld';

/**
 * Gerçek dünyada yol ağı (Faz 10 sonrası yol, köprü ve dere düzenlemesi): tek parça seyrek ağ, ikiz şerit ve göbek
 * yok, çıkmaz yok; dört yol tipi; köprüler yalnız dere geçişlerinde ve kısa; tüneller; dereler yamaçta değil.
 */
let world: RegionData;
let sw: SettlementWorld;
let metrics: RoadMetrics;

const towns = () =>
  world.settlements!.settlements.map((s) => ({
    ...settlementCenter(s),
    r: footprintRadius(s),
    rank: s.rank,
  }));

beforeAll(async () => {
  world = await loadRealWorld();
  sw = buildSettlementWorld(world);
  metrics = measureRoads(sw, towns());
  if (process.env.ROAD_REPORT) console.log(JSON.stringify({ metrics, network: sw.network }));
}, 120_000);

const lengthOf = (lines: ReadonlyArray<{ xz: Float32Array }>) => {
  let l = 0;
  for (const line of lines)
    for (let i = 0; i + 3 < line.xz.length; i += 2)
      l += Math.hypot(line.xz[i + 2]! - line.xz[i]!, line.xz[i + 3]! - line.xz[i + 1]!);
  return l;
};

describe('yol ağı — bağlantı ve seyreklik', () => {
  it('tüm yollar tek parça; hiçbir yere gitmeyen çıkmaz uç yok', () => {
    expect(metrics.components).toBe(1);
    expect(metrics.deadEnds).toBe(0);
  });

  it('her yerleşime yol varır', () => {
    for (const t of towns()) {
      const hit = sw.map.roads.nearest(t.x, t.z, t.r + 25);
      expect(hit, `${t.x.toFixed(0)},${t.z.toFixed(0)}`).not.toBeNull();
    }
  });

  it('ağ seyrek: veri yollarının küçük bir kısmı; ikiz şerit ve kavşak kolları atıldı', () => {
    const network = lengthOf(sw.map.roadLines.filter((l) => l.cls !== 3));
    expect(network).toBeGreaterThan(30_000);
    expect(network).toBeLessThan(lengthOf(world.settlements!.roads) * 0.3);
    expect(sw.network.twinsRemoved).toBeGreaterThan(200);
    expect(sw.network.unlinked).toBe(0);
  });

  it('göbek, ayrılıp birleşen çatal gibi kısa halkalar neredeyse yok', () => {
    expect(metrics.smallLoops).toBeLessThan(30);
  });
});

describe('yol ağı — dört yol tipi', () => {
  it('anayol, köy yolu, dağ patikası ve kent sokağı var', () => {
    const [main, village, trail, street] = metrics.length;
    expect(main).toBeGreaterThan(12_000);
    expect(village).toBeGreaterThan(12_000);
    expect(trail).toBeGreaterThan(5_000);
    expect(street).toBeGreaterThan(10_000);
    expect(sw.network.trails).toBeGreaterThan(20);
  });

  it('kent sokakları yapıların yanındadır; ana caddeler geniştir', () => {
    const buildings = sw.map.buildings;
    let far = 0;
    let avenues = 0;
    for (const street of sw.map.streetLines) {
      expect(street.cls).toBe(3);
      if ((street.width ?? 0) === ROADS.avenueWidth) avenues++;
      const mx = (street.xz[0]! + street.xz[street.xz.length - 2]!) / 2;
      const mz = (street.xz[1]! + street.xz[street.xz.length - 1]!) / 2;
      if (!buildings.some((b) => Math.hypot(b.x - mx, b.z - mz) <= 45)) far++;
    }
    expect(sw.map.streetLines.length).toBeGreaterThan(100);
    expect(far / sw.map.streetLines.length).toBeLessThan(0.05);
    expect(avenues).toBeGreaterThan(10);
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
    expect(samples).toBeGreaterThan(5_000);
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
    expect(total).toBeGreaterThan(12_000);
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
    expect(nodes).toBeGreaterThan(200);
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
    expect(total).toBeGreaterThan(8_000);
    expect(near / total).toBeGreaterThan(0.95);
  });
});

describe('yol ağı — köprüler ve tüneller', () => {
  it('dere geçişleri köprüdür: ana/köy yolu zemin noktalarının < %1’i akarsu içinde', () => {
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

  it('köprüler kısa, arka arkaya ve tepeli değil; dere boyunca uzanan köprü yok', () => {
    expect(metrics.bridges).toBeGreaterThan(120);
    expect(metrics.bridges).toBeLessThan(450);
    expect(metrics.bridgeMedian).toBeLessThan(18);
    expect(metrics.bridgeP90).toBeLessThan(40);
    expect(metrics.consecutiveBridges / metrics.bridges).toBeLessThan(0.15);
    expect(metrics.peakedBridges / metrics.bridges).toBeLessThan(0.02);
    expect(metrics.parallelBridges / metrics.bridges).toBeLessThan(0.03);
  });

  it('köprü türleri yola göre: beton, viyadük, taş kemer, ahşap; anayolda ahşap yok', () => {
    const plan = sw.map.plan;
    const types = new Map<string, number>();
    for (const span of plan.spans) {
      if (span.kind !== SPAN_KIND.bridge) continue;
      types.set(span.type, (types.get(span.type) ?? 0) + 1);
      const cls = plan.roads[span.road]!.cls;
      if (cls === 0) expect(['beam', 'viaduct']).toContain(span.type);
      if (span.type === 'wooden') expect(cls).toBe(2);
    }
    for (const type of ['beam', 'viaduct', 'arch', 'wooden'])
      expect(types.get(type) ?? 0).toBeGreaterThan(5);
  });

  it('dağların altından geçen tüneller var; tavan arazinin altında', () => {
    expect(metrics.tunnels).toBeGreaterThanOrEqual(3);
    const plan = sw.map.plan;
    for (const span of plan.spans) {
      if (span.kind !== SPAN_KIND.tunnel) continue;
      const r = plan.roads[span.road]!;
      expect(r.cls).toBeLessThanOrEqual(1);
      expect((span.i1 - span.i0) * r.step).toBeGreaterThan(30);
    }
  });
});

describe('akarsular', () => {
  it('dereler yamaçta durmaz: oyma ve korumadan sonra yamaçtaki örnek oranı doğal araziden az', () => {
    const lines = world.features!.water.lines;
    const natural = sidewaysStreamShare(sw.source.natural().heightAt, lines);
    const graded = sidewaysStreamShare((x, z) => sw.source.heightAt(x, z), lines);
    expect(graded).toBeLessThan(natural * 0.8);
  });
});
