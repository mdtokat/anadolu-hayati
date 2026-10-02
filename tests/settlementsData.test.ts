import { describe, expect, it } from 'vitest';
import { RegionDataError } from '../src/data/region';
import { decodeRoad, parseSettlements } from '../src/data/settlements';
import { cutRoads } from '../src/settlements/SettlementMap';
import { RoadIndex } from '../src/settlements/roadIndex';
import { azimuthToGameDir, qiblaAzimuthDeg, yawFacingBackTo } from '../src/settlements/qibla';

const valid = () => ({
  version: 1,
  overtureRelease: '2026-09-23.1',
  settlements: [
    {
      id: 7,
      name: 'Safranbolu',
      province: 'Karabük',
      rank: 'ilce',
      style: 'osmanli',
      population: 52709,
      x: 10,
      z: 20,
      mosques: 3,
      buildings: 40,
      cells: [0, 0, 12, 1, -1, 4],
    },
  ],
  landmarks: [{ s: 7, kind: 'han', name: 'Cinci Hanı', x: 11, z: 21 }],
  roads: [{ c: 0, d: [100, 200, 10, 0, 0, -5] }],
});

describe('settlements.json (Faz 10)', () => {
  it('geçerli veriyi okur; yollar delta kodundan çözülür', () => {
    const data = parseSettlements(valid());
    expect(data.settlements[0]!.cells).toEqual(Int16Array.from([0, 0, 12, 1, -1, 4]));
    expect(Array.from(data.roads[0]!.xz)).toEqual(
      [10, 20, 11, 20, 11, 19.5].map((v) => Math.fround(v)),
    );
    expect(data.landmarks[0]!.kind).toBe('han');
  });

  it('delta çözme birikmeli toplamdır', () => {
    expect(Array.from(decodeRoad([5, 5, 1, 1, -2, 0]))).toEqual(
      [0.5, 0.5, 0.6, 0.6, 0.4, 0.6].map(Math.fround),
    );
  });

  it('bozuk veri RegionDataError verir', () => {
    const bad = [
      { ...valid(), version: 2 },
      { ...valid(), settlements: [{ ...valid().settlements[0], rank: 'metropol' }] },
      { ...valid(), settlements: [{ ...valid().settlements[0], cells: [1, 2] }] },
      { ...valid(), landmarks: [{ s: 99, kind: 'han', name: 'x', x: 0, z: 0 }] },
      { ...valid(), landmarks: [{ s: 7, kind: 'kilise', name: 'x', x: 0, z: 0 }] },
      { ...valid(), roads: [{ c: 3, d: [0, 0, 1, 1] }] },
      { ...valid(), roads: [{ c: 0, d: [0, 0] }] },
      { ...valid(), settlements: [valid().settlements[0], valid().settlements[0]] },
    ];
    for (const json of bad) expect(() => parseSettlements(json)).toThrow(RegionDataError);
  });
});

describe('RoadIndex', () => {
  const roads = [
    { cls: 0 as const, xz: Float32Array.from([0, 0, 100, 0]) },
    { cls: 2 as const, xz: Float32Array.from([0, 50, 0, 150]) },
  ];
  const index = new RoadIndex(roads, 16);

  it('en yakın parça, kenar uzaklığı ve yön', () => {
    const hit = index.nearest(50, 4, 20)!;
    expect(hit.cls).toBe(0);
    expect(hit.distance).toBeCloseTo(4);
    expect(hit.edgeDistance).toBeCloseTo(4 - 2.5);
    expect(hit.angle).toBeCloseTo(0);
    expect(index.nearest(50, 40, 5)).toBeNull();
    expect(index.nearest(1, 100, 5)!.angle).toBeCloseTo(Math.PI / 2);
  });

  it('yol üstü sorgusu genişliğe göre', () => {
    expect(index.onRoad(30, 2)).toBe(true);
    expect(index.onRoad(30, 3)).toBe(false);
    expect(index.onRoad(30, 3, 1)).toBe(true);
    expect(index.onRoad(1, 100)).toBe(true);
  });

  it('kent içi kesme: anayol kalır, diğerleri daire içinde kopar', () => {
    const cut = cutRoads(
      [
        { cls: 0, xz: Float32Array.from([-50, 0, 50, 0]) },
        { cls: 1, xz: Float32Array.from([-50, 1, -20, 1, 0, 1, 20, 1, 50, 1]) },
      ],
      [{ x: 0, z: 0, r: 10 }],
    );
    expect(cut).toHaveLength(3);
    expect(cut[0]!.cls).toBe(0);
    expect(Array.from(cut[1]!.xz)).toEqual([-50, 1, -20, 1]);
    expect(Array.from(cut[2]!.xz)).toEqual([20, 1, 50, 1]);
  });
});

describe('kıble', () => {
  it('Batı Karadeniz’den kıble güneydoğudadır (~150°)', () => {
    const a = qiblaAzimuthDeg(41.45, 31.79); // Zonguldak
    expect(a).toBeGreaterThan(145);
    expect(a).toBeLessThan(160);
    // İstanbul için bilinen değer ≈ 151,6°
    expect(qiblaAzimuthDeg(41.0082, 28.9784)).toBeCloseTo(151.6, 0);
  });

  it('yapının arka yüzü (mihrap) azimuta bakar', () => {
    const azimuth = 152;
    const yaw = yawFacingBackTo(azimuth);
    const back = { x: -Math.sin(yaw), z: -Math.cos(yaw) }; // yerel −z
    const dir = azimuthToGameDir(azimuth);
    expect(back.x).toBeCloseTo(dir.x);
    expect(back.z).toBeCloseTo(dir.z);
    // Güneydoğu: +X (doğu) ve +Z (güney)
    expect(dir.x).toBeGreaterThan(0);
    expect(dir.z).toBeGreaterThan(0);
  });
});
