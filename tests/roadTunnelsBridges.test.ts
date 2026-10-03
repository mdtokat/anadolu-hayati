import { describe, expect, it } from 'vitest';
import { ROAD_STRUCTURES, STREAM_CARVING, VERTICAL_SCALE } from '../src/config';
import type { RoadData } from '../src/data/settlements';
import {
  SPAN_KIND,
  bridgeTypeFor,
  planRoadProfiles,
  surfaceRuns,
  type ProfileTerrain,
} from '../src/settlements/roadProfile';
import { buildChunkMesh } from '../src/world/chunkGeometry';
import { chunkGridFor } from '../src/world/chunks';
import type { HeightGrid } from '../src/world/roadGrading';
import { applyRoadGrading } from '../src/world/roadGrading';
import { tunnelHoles, tunnelRoofTop } from '../src/world/roadTunnels';
import { carveStreams } from '../src/world/streamCarving';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { HORIZONTAL_SCALE } from '../src/config';

const road = (cls: 0 | 1 | 2, ...xz: number[]): RoadData => ({ cls, xz: Float32Array.from(xz) });

function terrain(
  h: (x: number, z: number) => number,
  waterLines?: ProfileTerrain['waterLines'],
): ProfileTerrain {
  return { heightAt: h, elevationAt: (x, z) => h(x, z) * VERTICAL_SCALE, waterLines };
}

/** Bellek içi yükseklik ızgarası (`HeightGrid`). */
function grid(width: number, height: number, cell: number, h: (x: number, z: number) => number) {
  const origin = { x: -((width - 1) * cell) / 2, z: -((height - 1) * cell) / 2 };
  const data = new Float32Array(width * height);
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++)
      data[r * width + c] = h(origin.x + c * cell, origin.z + r * cell);
  const g: HeightGrid & { data: Float32Array; at: (x: number, z: number) => number } = {
    width,
    height,
    cell,
    origin,
    data,
    sample: (c, r) =>
      data[Math.min(height - 1, Math.max(0, r)) * width + Math.min(width - 1, Math.max(0, c))]!,
    setSample: (c, r, v) => {
      data[r * width + c] = v;
    },
    at: (x, z) => g.sample(Math.round((x - origin.x) / cell), Math.round((z - origin.z) / cell)),
  };
  return g;
}

describe('köprüler — yalnız gerçek dere geçişlerinde', () => {
  it('yolu kesen dere köprü olur; yola paralel (kesmeyen) dere köprü değildir', () => {
    const flat = () => 10;
    const crossing = planRoadProfiles(
      [road(1, -100, 0, 100, 0)],
      terrain(flat, [{ kind: 'stream', xz: [0, -50, 0, 50] }]),
    );
    expect(crossing.spans).toHaveLength(1);
    const len = (crossing.spans[0]!.i1 - crossing.spans[0]!.i0) * crossing.roads[0]!.step;
    // Dik geçişte kısa: en kısa açıklık (ya da su + kıyı payı) ve iki yanda birer örnek aralığı kadar.
    expect(len).toBeLessThanOrEqual(ROAD_STRUCTURES.minSpan + 2 * crossing.roads[0]!.step + 0.01);
    const parallel = planRoadProfiles(
      [road(1, -100, 0, 100, 0)],
      terrain(flat, [{ kind: 'river', xz: [-100, 1.2, 100, 1.2] }]),
    );
    expect(parallel.spans).toHaveLength(0);
  });

  it('yolun ucundaki (kavşaktaki) geçişe köprü yaslanır: ayak uç noktadır ve kavşak yüksekliği sabit kalır', () => {
    const flat = () => 10;
    // Dere yolun başlangıcından 1 m ötede: eskiden aday uç noktaya kadar uzanamadığından köprü hiç kurulmuyordu.
    const plan = planRoadProfiles(
      [road(1, 0, 0, 100, 0)],
      terrain(flat, [{ kind: 'stream', xz: [1, -50, 1, 50] }]),
    );
    expect(plan.spans).toHaveLength(1);
    const span = plan.spans[0]!;
    expect(span.i0).toBe(0);
    const r = plan.roads[0]!;
    expect(r.bed[0]).toBeCloseTo(10, 3); // kavşak (uç) yatağı doğal yükseklikte sabit
    for (let i = span.i0 + 1; i < span.i1; i++)
      expect(r.bed[i]!).toBeGreaterThanOrEqual(10 + ROAD_STRUCTURES.clearance - 0.01);
  });

  it('göl/rezervuar içinden geçen yol köprü olur', () => {
    const flat = () => 10;
    const lake = {
      ...terrain(flat),
      nearestWater: (x: number) =>
        x > 20 && x < 50 ? { kind: 'reservoir' as const, distance: 0, x, z: 0 } : null,
      waterLines: [],
    };
    const plan = planRoadProfiles([road(1, -100, 0, 100, 0)], lake);
    expect(plan.spans).toHaveLength(1);
    const r = plan.roads[0]!;
    const from = r.xz[plan.spans[0]!.i0 * 2]!;
    const to = r.xz[plan.spans[0]!.i1 * 2]!;
    expect(from).toBeLessThanOrEqual(20 + 0.01);
    expect(to).toBeGreaterThanOrEqual(50 - 0.01);
  });

  it('verev geçiş dik geçişten uzundur', () => {
    const flat = () => 10;
    const square = planRoadProfiles(
      [road(1, -100, 0, 100, 0)],
      terrain(flat, [{ kind: 'river', xz: [0, -50, 0, 50] }]),
    );
    const skew = planRoadProfiles(
      [road(1, -100, 0, 100, 0)],
      terrain(flat, [{ kind: 'river', xz: [-60, -40, 60, 40] }]),
    );
    const l = (p: typeof square) => p.spans[0]!.i1 - p.spans[0]!.i0;
    expect(l(skew)).toBeGreaterThan(l(square));
  });

  it('birbirine yakın geçişler tek köprü olur; güverte düzdür (tepe yok)', () => {
    const flat = () => 10;
    const plan = planRoadProfiles(
      [road(1, -150, 0, 150, 0)],
      terrain(flat, [
        { kind: 'stream', xz: [-3, -50, -3, 50] },
        { kind: 'stream', xz: [4, -50, 4, 50] },
        { kind: 'stream', xz: [80, -50, 80, 50] },
      ]),
    );
    expect(plan.spans).toHaveLength(2); // ilk ikisi birleşik, üçüncüsü ayrı (uzak)
    const r = plan.roads[0]!;
    for (const span of plan.spans) {
      for (let i = span.i0; i <= span.i1; i++) {
        const t = (i - span.i0) / (span.i1 - span.i0);
        const line = r.bed[span.i0]! + t * (r.bed[span.i1]! - r.bed[span.i0]!);
        expect(Math.abs(r.bed[i]! - line)).toBeLessThan(1e-3);
      }
      for (let i = span.i0 + 1; i < span.i1; i++)
        expect(r.bed[i]!).toBeGreaterThanOrEqual(10 + ROAD_STRUCTURES.clearance - 0.01);
    }
  });

  it('köprü türü yola ve konuma göre: anayol beton/viyadük, köy yolu taş kemer/beton, patika ahşap/kemer', () => {
    expect(bridgeTypeFor(0, 12, 2, false, 0, 0)).toBe('beam');
    expect(bridgeTypeFor(0, 60, 12, false, 0, 0)).toBe('viaduct');
    expect(bridgeTypeFor(0, 20, 3, true, 0, 0)).toBe('viaduct');
    expect(bridgeTypeFor(2, 8, 1, false, 0, 0)).toBe('wooden');
    expect(bridgeTypeFor(2, 20, 2, false, 0, 0)).toBe('arch');
    expect(bridgeTypeFor(1, 40, 2, false, 0, 0)).toBe('beam');
    const village = new Set<string>();
    for (let k = 0; k < 40; k++) village.add(bridgeTypeFor(1, 12, 2, false, k * 37.1, k * 11.3));
    expect(village).toEqual(new Set(['arch', 'beam']));
  });
});

describe('tüneller', () => {
  // 400 m'lik yolun ortasında yüksek, dik bir sırt.
  const ridge = (x: number) => 10 + 40 * Math.exp(-((x / 60) ** 2));

  it('anayol derin sırtın altından tünelle geçer; tünel tavanı arazinin altında, ağızlar zeminde', () => {
    const plan = planRoadProfiles(
      [road(0, -200, 0, 200, 0)],
      terrain((x) => ridge(x)),
    );
    const tunnel = plan.spans.find((s) => s.kind === SPAN_KIND.tunnel);
    expect(tunnel).toBeDefined();
    const r = plan.roads[0]!;
    expect(r.kind[tunnel!.i0]).toBe(SPAN_KIND.ground);
    expect(r.kind[tunnel!.i1]).toBe(SPAN_KIND.ground);
    for (let i = tunnel!.i0 + 1; i < tunnel!.i1; i++) {
      expect(r.kind[i]).toBe(SPAN_KIND.tunnel);
      expect(tunnelRoofTop(r.bed[i]!)).toBeLessThan(r.natural[i]! + 0.01);
    }
    // Ağızda kazı ağız derinliği kadar (sırtın tepesinde değil).
    expect(r.natural[tunnel!.i0]! - r.bed[tunnel!.i0]!).toBeLessThan(ROAD_STRUCTURES.tunnelDepth);
    // Tünel içi yüzey yollarından çıkar (dağın üstünde ağaç kalır).
    const surface = surfaceRuns(plan);
    expect(surface).toHaveLength(2);
  });

  it('patika sırtın üstünden geçer (tünel yok)', () => {
    const plan = planRoadProfiles(
      [road(2, -200, 0, 200, 0)],
      terrain((x) => ridge(x)),
    );
    expect(plan.spans.some((s) => s.kind === SPAN_KIND.tunnel)).toBe(false);
  });

  it('ağızda arazi delinir (tavanın altında kalan hücreler); sırtın derininde delik yok; mesh üçgeni atlanır', () => {
    const g = grid(301, 41, 2, (x) => ridge(x));
    const plan = planRoadProfiles(
      [road(0, -200, 0, 200, 0)],
      terrain((x, z) => g.at(x, z)),
    );
    const holes = tunnelHoles(plan, g);
    expect(holes.count).toBeGreaterThan(4);
    const tunnel = plan.spans.find((s) => s.kind === SPAN_KIND.tunnel)!;
    const r = plan.roads[0]!;
    const mid = Math.floor((tunnel.i0 + tunnel.i1) / 2);
    const mc = Math.floor((r.xz[mid * 2]! - g.origin.x) / g.cell);
    const mr = Math.floor((r.xz[mid * 2 + 1]! - g.origin.z) / g.cell);
    expect(holes.has(mc, mr)).toBe(false); // derinde arazi kalır
    // Ağızların dışı (yaklaşım yolu) delinmez.
    const outside = Math.floor((r.xz[(tunnel.i0 - 2) * 2]! - g.origin.x) / g.cell);
    expect(holes.has(outside, mr)).toBe(false);
  });

  it('chunk mesh delik hücrelerin üçgenlerini çizmez (yakın LOD), uzak LOD tam kalır', () => {
    const meta = {
      id: 't',
      name: 't',
      crs: 'EPSG:32636',
      originUtm: [0, 0] as [number, number],
      gridWidth: 129,
      gridHeight: 129,
      cellSizeReal: 2 * HORIZONTAL_SCALE,
      elevationMin: 0,
      elevationMax: 100,
      elevationEncoding: 'uint16' as const,
      horizontalScale: HORIZONTAL_SCALE,
      sources: [],
      built: '2026-01-01',
      gridOrigin: { x: -128, z: -128 },
    };
    const source = new RegionHeightSource(meta as never, new Uint16Array(129 * 129).fill(30000));
    const chunkGrid = chunkGridFor(source);
    const holes = {
      width: 129,
      count: 1,
      has: (c: number, r: number) => c === 10 && r === 10,
      any: (c0: number, r0: number, c1: number, r1: number) =>
        c0 <= 10 && 10 < c1 && r0 <= 10 && 10 < r1,
    };
    const full = buildChunkMesh(source, chunkGrid, chunkGrid.cx0, chunkGrid.cy0, 0);
    const cut = buildChunkMesh(source, chunkGrid, chunkGrid.cx0, chunkGrid.cy0, 0, holes);
    expect(full.indices.length - cut.indices.length).toBe(6);
    const far = buildChunkMesh(source, chunkGrid, chunkGrid.cx0, chunkGrid.cy0, 3, holes);
    const farFull = buildChunkMesh(source, chunkGrid, chunkGrid.cx0, chunkGrid.cy0, 3);
    expect(far.indices.length).toBe(farFull.indices.length);
  });

  it('zemin düzeltme ağız düzleminin ötesine (dağın içine) taşmaz', () => {
    const g = grid(301, 41, 2, (x) => ridge(x));
    const before = Float32Array.from(g.data);
    const plan = planRoadProfiles(
      [road(0, -200, 0, 200, 0)],
      terrain((x, z) => g.at(x, z)),
    );
    applyRoadGrading(g, plan);
    const tunnel = plan.spans.find((s) => s.kind === SPAN_KIND.tunnel)!;
    const r = plan.roads[0]!;
    const portalX = r.xz[tunnel.i0 * 2]!;
    // Ağızdan 3 m içerideki (yol ekseni üstü) hücre değişmedi.
    const c = Math.round((portalX + 3 - g.origin.x) / g.cell);
    const row = Math.round((0 - g.origin.z) / g.cell);
    expect(g.data[row * g.width + c]).toBeCloseTo(before[row * g.width + c]!, 5);
  });
});

describe('akarsu yatağı', () => {
  it('yamaçtaki dere yatağa oyulur: çizgi üstü iki yanından alçak, hiçbir hücre yükselmez', () => {
    // Doğuya doğru yükselen yamaç; dere yamacın üstünde kuzey–güney uzanır (akış güneye: alçalan).
    const slope = (x: number, z: number) => 10 + 0.3 * x - 0.01 * z;
    const g = grid(61, 61, 2, slope);
    const before = Float32Array.from(g.data);
    carveStreams(g, [{ kind: 'stream', xz: [4, -50, 4, 50] }]);
    for (let i = 0; i < g.data.length; i++)
      expect(g.data[i]!).toBeLessThanOrEqual(before[i]! + 1e-6);
    const onLine = g.at(4, 0);
    // Yamaçta: çizgi, yukarı yandaki zeminden ve kendi doğal yüksekliğinden alçak.
    expect(onLine).toBeLessThan(slope(4, 0) - 0.5);
    expect(onLine).toBeLessThanOrEqual(g.at(8, 0));
    expect(slope(4, 0) - onLine).toBeLessThanOrEqual(
      STREAM_CARVING.maxDepth + STREAM_CARVING.channelDepth + 1e-6,
    );
  });

  it('yol dolgusu dere yatağını yükseltmez', () => {
    const g = grid(81, 41, 2, () => 5);
    const stream = [{ kind: 'stream', xz: [-80, 6, 80, 6] }];
    const plan = {
      roads: [
        {
          cls: 0 as const,
          xz: Float32Array.of(-80, 0, 0, 0, 80, 0),
          step: 80,
          natural: Float32Array.of(5, 5, 5),
          bed: Float32Array.of(8, 8, 8),
          kind: new Uint8Array(3),
        },
      ],
      spans: [],
    };
    applyRoadGrading(g, plan, stream);
    expect(g.at(0, 0)).toBeCloseTo(8, 3); // yol yatağı
    expect(g.at(0, 6)).toBeCloseTo(5, 3); // dere: doğal
    expect(g.at(0, -6)).toBeGreaterThan(5.5); // öbür yandaki şev yükseldi
  });
});
