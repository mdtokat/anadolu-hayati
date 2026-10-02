import { beforeAll, describe, expect, it } from 'vitest';
import { ROADS, TERRAIN_OVERLAY } from '../src/config';
import { parseProvinces, type RegionData } from '../src/data/region';
import { provinceAt } from '../src/world/provinces';
import {
  OVERLAY_CHANNEL,
  OverlayRaster,
  ROAD_CHANNEL,
  buildRoadOverlay,
  buildTerrainOverlay,
  type OverlayChannel,
  decodeOverlay,
  encodeOverlay,
  landBorderSegments,
  waterLineHalfWidth,
} from '../src/world/terrainOverlay';
import { loadRealRegion } from './helpers/realRegion';

const grid = { width: 51, height: 51, cell: 2, origin: { x: -50, z: -50 } };

describe('kodlama', () => {
  it('uzaklık ↔ bayt: 1/16 m çözünürlük, uç değerler kırpılır', () => {
    expect(encodeOverlay(0)).toBe(128);
    expect(decodeOverlay(encodeOverlay(-1.25))).toBeCloseTo(-1.25, 5);
    expect(decodeOverlay(encodeOverlay(3.5))).toBeCloseTo(3.5, 5);
    expect(encodeOverlay(100)).toBe(255);
    expect(encodeOverlay(-100)).toBe(0);
    expect(TERRAIN_OVERLAY.scale).toBe(16);
  });
});

describe('OverlayRaster', () => {
  it('boş doku her yerde "uzak"', () => {
    const r = new OverlayRaster(grid);
    expect(r.data.length).toBe(51 * 51 * 4);
    expect(r.data.every((v) => v === 255)).toBe(true);
  });

  it('parça: aradeğerlenen kenar uzaklığı hücre aralarında da doğru (keskin kenar)', () => {
    const r = new OverlayRaster(grid);
    r.segment(OVERLAY_CHANNEL.paved, -40, 0.3, 40, 0.3, 2.5);
    // Eksen üstünde −yarı genişlik, kenarda 0, dışarıda pozitif; hücre ortasında (tek x) da doğrusal.
    for (const x of [-11, -10, 0, 3, 7.3]) {
      expect(r.distanceAt(OVERLAY_CHANNEL.paved, x, 0.3 + 2.5)).toBeCloseTo(0, 1);
      expect(r.distanceAt(OVERLAY_CHANNEL.paved, x, 0.3 + 4)).toBeCloseTo(1.5, 1);
      expect(r.distanceAt(OVERLAY_CHANNEL.paved, x, 0.3 - 3.7)).toBeCloseTo(1.2, 1);
      expect(r.distanceAt(OVERLAY_CHANNEL.paved, x, 0.3)).toBeLessThan(-1.3);
    }
    // Diğer kanallar etkilenmez.
    expect(r.distanceAt(OVERLAY_CHANNEL.dirt, 0, 0)).toBeGreaterThan(7);
  });

  it('dar çizgi (yarı genişlik ≥ minHalfWidth) eksen üstünde hiçbir açıda kopmaz', () => {
    const half = TERRAIN_OVERLAY.minHalfWidth;
    for (const angle of [0, 0.3, Math.PI / 4, 1.1, Math.PI / 2]) {
      const r = new OverlayRaster(grid);
      const c = Math.cos(angle) * 40;
      const s = Math.sin(angle) * 40;
      r.segment(OVERLAY_CHANNEL.water, -c + 0.37, -s - 0.61, c + 0.37, s - 0.61, half);
      for (let t = -0.8; t <= 0.8; t += 0.013) {
        const d = r.distanceAt(OVERLAY_CHANNEL.water, t * c + 0.37, t * s - 0.61);
        expect(d).toBeLessThan(0);
      }
    }
  });

  it('çakışan çizgilerde en yakın kenar kazanır; ızgara dışı parça sessizce atlanır', () => {
    const r = new OverlayRaster(grid);
    r.polyline(OVERLAY_CHANNEL.dirt, [-20, 0, 20, 0], 1.3);
    r.polyline(OVERLAY_CHANNEL.dirt, [0, -20, 0, 20], 1.3);
    r.segment(OVERLAY_CHANNEL.dirt, 500, 500, 600, 600, 2);
    expect(r.distanceAt(OVERLAY_CHANNEL.dirt, 0, 10)).toBeCloseTo(-1.3, 1);
    expect(r.distanceAt(OVERLAY_CHANNEL.dirt, 10, 0)).toBeCloseTo(-1.3, 1);
    expect(r.distanceAt(OVERLAY_CHANNEL.dirt, 10, 10)).toBeGreaterThan(7);
  });
});

describe('buildTerrainOverlay', () => {
  it('yollar sınıfa göre kanala, akarsular ve göl kıyıları su kanalına, sınırlar A kanalına', () => {
    const raster = buildTerrainOverlay(grid, {
      roads: [
        { cls: 1, xz: Float32Array.of(-40, -30, 40, -30) },
        { cls: 2, xz: Float32Array.of(-40, -10, 40, -10) },
        { cls: 0, xz: Float32Array.of(-40, -20, 40, -20) }, // anayol: yol dokusunda
      ],
      water: {
        lines: [{ kind: 'stream', intermittent: false, xz: Float64Array.of(-40, 10, 40, 10) }],
        polygons: [
          {
            kind: 'lake',
            rings: [Float64Array.of(10, 20, 30, 20, 30, 40, 10, 40, 10, 20)],
            bounds: { minX: 10, minZ: 20, maxX: 30, maxZ: 40 },
          },
        ],
        points: [],
      },
      borders: [-40, 0, 40, 0],
    });
    const P = OVERLAY_CHANNEL;
    expect(raster.distanceAt(P.paved, 0, -30)).toBeCloseTo(-ROADS.width[1] / 2, 1);
    expect(raster.distanceAt(P.paved, 0, -20)).toBeGreaterThan(-ROADS.width[1] / 2 + 3);
    expect(raster.distanceAt(P.dirt, 0, -30)).toBeGreaterThan(7);
    expect(raster.distanceAt(P.dirt, 0, -10)).toBeCloseTo(-ROADS.width[2] / 2, 1);
    // Dere çok dar (1,2 m): boyamada en az minHalfWidth.
    expect(raster.distanceAt(P.water, 0, 10)).toBeCloseTo(-waterLineHalfWidth('stream'), 1);
    expect(waterLineHalfWidth('stream')).toBe(TERRAIN_OVERLAY.minHalfWidth);
    expect(waterLineHalfWidth('river')).toBe(1.5);
    // Göl kıyısı: kenarda 0, içeride ve dışarıda kenara uzaklık.
    expect(raster.distanceAt(P.water, 20, 20)).toBeCloseTo(0, 1);
    expect(raster.distanceAt(P.water, 20, 17)).toBeCloseTo(3, 1);
    expect(raster.distanceAt(P.border, 5, 0)).toBeCloseTo(0, 1);
    expect(raster.distanceAt(P.border, 5, 2)).toBeCloseTo(2, 1);
  });
});

describe('buildRoadOverlay', () => {
  it('anayol R kanalına (kesik şerit evresiyle), kent sokağı G kanalına; diğerleri boş', () => {
    const raster = buildRoadOverlay(grid, [
      { cls: 0, xz: Float32Array.of(-40, -30, 40, -30) },
      { cls: 3, xz: Float32Array.of(-40, 0, 40, 0), width: ROADS.avenueWidth },
      { cls: 1, xz: Float32Array.of(-40, 20, 40, 20) },
    ]);
    const R = ROAD_CHANNEL;
    expect(raster.distanceAt(R.main as OverlayChannel, 0, -30)).toBeCloseTo(-ROADS.width[0] / 2, 1);
    expect(raster.distanceAt(R.street as OverlayChannel, 0, 0)).toBeCloseTo(
      -ROADS.avenueWidth / 2,
      1,
    );
    expect(raster.distanceAt(R.main as OverlayChannel, 0, 20)).toBeGreaterThan(7);
    expect(raster.distanceAt(R.street as OverlayChannel, 0, 20)).toBeGreaterThan(7);
    // Evre yol boyunca döner: dönemin yarısı uzaklıktaki iki noktada kosinüs işareti değişir.
    const cosAt = (x: number) => {
      const c = Math.round((x - grid.origin.x) / grid.cell);
      const r = Math.round((-30 - grid.origin.z) / grid.cell);
      return ((raster.data[(r * grid.width + c) * 4 + R.cos] as number) - 128) / 127;
    };
    const period = TERRAIN_OVERLAY.dashPeriod;
    let flips = 0;
    for (let x = -30; x < 30; x += grid.cell)
      if (Math.sign(cosAt(x)) !== Math.sign(cosAt(x + grid.cell))) flips++;
    expect(flips).toBeGreaterThanOrEqual(Math.floor((60 / period) * 2) - 2);
  });
});

describe('landBorderSegments', () => {
  const square = (x0: number, x1: number) => [
    [x0, 0],
    [x1, 0],
    [x1, 50],
    [x0, 50],
    [x0, 0],
  ];
  const two = parseProvinces({
    features: [
      {
        properties: { name: 'A', inRegion: true },
        geometry: { type: 'Polygon', coordinates: [square(0, 100)] },
      },
      {
        properties: { name: 'B', inRegion: false },
        geometry: { type: 'Polygon', coordinates: [square(100, 200)] },
      },
    ],
  });

  it('yalnızca iki ilin ortak kenarı kalır; dış kenarlar (kıyı/dünya kenarı) elenir', () => {
    const segs = landBorderSegments(two);
    expect(segs.length).toBeGreaterThan(0);
    for (let i = 0; i < segs.length; i += 4) {
      expect(segs[i]).toBeCloseTo(100, 5);
      expect(segs[i + 2]).toBeCloseTo(100, 5);
    }
    // Ortak kenar iki ilde de var: toplam uzunluk 2 × 50.
    let length = 0;
    for (let i = 0; i < segs.length; i += 4) {
      length += Math.hypot(segs[i + 2]! - segs[i]!, segs[i + 3]! - segs[i + 1]!);
    }
    expect(length).toBeCloseTo(100, 3);
  });

  describe('gerçek dünya', () => {
    let region: RegionData;
    beforeAll(async () => {
      region = await loadRealRegion();
    });

    it('kıyı boyunca sınır yok: her parçanın iki yanında farklı il var', () => {
      const segs = landBorderSegments(region.provinces);
      expect(segs.length / 4).toBeGreaterThan(300);
      for (let i = 0; i < segs.length; i += 4 * 7) {
        const mx = (segs[i]! + segs[i + 2]!) / 2;
        const mz = (segs[i + 1]! + segs[i + 3]!) / 2;
        const len = Math.hypot(segs[i + 2]! - segs[i]!, segs[i + 3]! - segs[i + 1]!);
        const nx = -(segs[i + 3]! - segs[i + 1]!) / len;
        const nz = (segs[i + 2]! - segs[i]!) / len;
        const p = TERRAIN_OVERLAY.borderProbe;
        const a = provinceAt(region.provinces, mx + nx * p, mz + nz * p);
        const b = provinceAt(region.provinces, mx - nx * p, mz - nz * p);
        expect(a && b && a !== b).toBe(true);
      }
    });
  });
});
