import { beforeAll, describe, expect, it } from 'vitest';
import { HORIZONTAL_SCALE, VERTICAL_SCALE } from '../src/config';
import {
  parseHeightmap,
  parseMeta,
  parseProvinces,
  RegionDataError,
  type RegionData,
  type RegionMeta,
} from '../src/data/region';
import { latLonToGame } from '../src/world/geo';
import { provinceAt } from '../src/world/provinces';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { coreProvinces, groupProvinces } from './helpers/groups';
import { loadRealRegion, REGION_ID } from './helpers/realRegion';

const VALID_META = {
  id: 'test',
  name: 'Test',
  crs: 'EPSG:32636',
  originUtm: [500000, 4500000],
  gridWidth: 3,
  gridHeight: 2,
  cellSizeReal: 100,
  elevationMin: 0,
  elevationMax: 65535,
  elevationEncoding: 'uint16',
  horizontalScale: HORIZONTAL_SCALE,
  sources: ['a'],
};

describe('parseMeta', () => {
  it("geçerli meta.json'ı okur", () => {
    const meta = parseMeta(VALID_META);
    expect(meta.gridWidth).toBe(3);
    expect(meta.originUtm).toEqual([500000, 4500000]);
  });

  it('gridOrigin yoksa (eski, orijin-merkezli veri) merkezli değeri türetir', () => {
    // 3 × 2 örnek, hücre 100 m / 50 = 2 oyun m: x = −(3−1)/2·2 = −2, z = −(2−1)/2·2 = −1
    expect(parseMeta(VALID_META).gridOrigin).toEqual({ x: -2, z: -1 });
  });

  it('gridOrigin varsa (kafese çapalı dünya) olduğu gibi okur ve doğrular', () => {
    expect(parseMeta({ ...VALID_META, gridOrigin: { x: -2867, z: -1175 } }).gridOrigin).toEqual({
      x: -2867,
      z: -1175,
    });
    expect(() => parseMeta({ ...VALID_META, gridOrigin: 5 })).toThrow(/gridOrigin/);
    expect(() => parseMeta({ ...VALID_META, gridOrigin: { x: 1 } })).toThrow(/'z'/);
    expect(() => parseMeta({ ...VALID_META, gridOrigin: { x: 'a', z: 0 } })).toThrow(/'x'/);
  });

  it('yatay ölçek uyuşmazlığını reddeder', () => {
    expect(() => parseMeta({ ...VALID_META, horizontalScale: HORIZONTAL_SCALE * 2 })).toThrow(
      /yatay ölçeği/,
    );
  });

  it('eksik/bozuk alanları reddeder', () => {
    expect(() => parseMeta(null)).toThrow(RegionDataError);
    expect(() => parseMeta({ ...VALID_META, gridWidth: 1.5 })).toThrow(/gridWidth/);
    expect(() => parseMeta({ ...VALID_META, originUtm: [1] })).toThrow(/originUtm/);
    expect(() => parseMeta({ ...VALID_META, elevationEncoding: 'float32' })).toThrow(
      /elevationEncoding/,
    );
    expect(() => parseMeta({ ...VALID_META, elevationMax: 0 })).toThrow(/elevationMax/);
    expect(() => parseMeta({ ...VALID_META, id: undefined })).toThrow(/'id'/);
  });
});

describe('parseHeightmap', () => {
  const meta = parseMeta(VALID_META);

  it('little-endian uint16 satır satır okur', () => {
    const bytes = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 1, 5, 0, 255, 255]); // 4,1 → 260; 255,255 → 65535
    const heights = parseHeightmap(bytes.buffer, meta);
    expect(Array.from(heights)).toEqual([1, 2, 3, 260, 5, 65535]);
  });

  it('uzunluk uyuşmazlığını reddeder', () => {
    expect(() => parseHeightmap(new ArrayBuffer(10), meta)).toThrow(/beklenen 12/);
  });
});

describe('parseProvinces', () => {
  it("Polygon ve MultiPolygon'ı çokgen yapısına çevirir", () => {
    const ring = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const provinces = parseProvinces({
      features: [
        {
          properties: { name: 'A', inRegion: true },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          properties: { name: 'B', iso: 'T-2' },
          geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] },
        },
      ],
    });
    expect(provinces).toHaveLength(2);
    expect(provinces[0]?.inRegion).toBe(true);
    expect(provinces[1]?.inRegion).toBe(false);
    expect(provinces[1]?.polygons).toHaveLength(2);
    expect(provinces[0]?.bounds).toEqual({ minX: 0, minZ: 0, maxX: 10, maxZ: 10 });
  });

  it('desteklenmeyen geometriyi reddeder', () => {
    expect(() =>
      parseProvinces({
        features: [{ properties: { name: 'A' }, geometry: { type: 'Point', coordinates: [0, 0] } }],
      }),
    ).toThrow(/desteklenmeyen/);
  });
});

describe('provinceAt', () => {
  const square = (x0: number, z0: number, x1: number, z1: number) => [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
    [x0, z0],
  ];
  const provinces = parseProvinces({
    features: [
      {
        // Delikli çokgen: 0..10 kare, ortasında 4..6 delik
        properties: { name: 'Delikli' },
        geometry: { type: 'Polygon', coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] },
      },
      {
        properties: { name: 'Yan' },
        geometry: { type: 'Polygon', coordinates: [square(10, 0, 20, 10)] },
      },
    ],
  });

  it('noktayı doğru ile eşler, dışarıda null verir', () => {
    expect(provinceAt(provinces, 2, 2)?.name).toBe('Delikli');
    expect(provinceAt(provinces, 15, 5)?.name).toBe('Yan');
    expect(provinceAt(provinces, -5, 5)).toBeNull();
  });

  it('deliğin içindeki nokta o ilin dışındadır', () => {
    expect(provinceAt(provinces, 5, 5)).toBeNull();
  });
});

describe('RegionHeightSource (sentetik 3×2 ızgara)', () => {
  // 3 sütun × 2 satır; elevationMax 65535 → uint16 değeri doğrudan metre
  const meta: RegionMeta = parseMeta(VALID_META);
  const source = new RegionHeightSource(meta, new Uint16Array([30, 150, 300, 150, 300, 450]));
  const cell = 100 / HORIZONTAL_SCALE; // 2 oyun metresi

  it('örnek konumları orijin etrafında simetriktir', () => {
    expect(source.xAt(0)).toBeCloseTo(-cell);
    expect(source.xAt(2)).toBeCloseTo(cell);
    expect(source.zAt(0)).toBeCloseTo(-cell / 2);
    expect(source.zAt(1)).toBeCloseTo(cell / 2);
    expect(source.bounds).toEqual({ minX: -cell, maxX: cell, minZ: -cell / 2, maxZ: cell / 2 });
  });

  it('örnek noktalarında yüksekliği (metre / VERTICAL_SCALE) verir', () => {
    expect(source.heightAt(source.xAt(2), source.zAt(1))).toBeCloseTo(450 / VERTICAL_SCALE, 5);
    expect(source.heightAt(source.xAt(0), source.zAt(0))).toBeCloseTo(30 / VERTICAL_SCALE, 5);
  });

  it('bilinear aradeğerler: hücre merkezi dört köşenin ortalamasıdır', () => {
    const cx = (source.xAt(0) + source.xAt(1)) / 2;
    const cz = (source.zAt(0) + source.zAt(1)) / 2;
    expect(source.heightAt(cx, cz)).toBeCloseTo((30 + 150 + 150 + 300) / 4 / VERTICAL_SCALE, 5);
  });

  it('ızgara dışında kenar değerini kullanır', () => {
    expect(source.heightAt(1e6, 1e6)).toBeCloseTo(450 / VERTICAL_SCALE, 5);
    expect(source.heightAt(-1e6, -1e6)).toBeCloseTo(30 / VERTICAL_SCALE, 5);
  });

  it('değeri 0 olan hücre deniz sayılır ve çukurlaşır (yükseklik negatif)', () => {
    const sea = new RegionHeightSource(meta, new Uint16Array([0, 150, 300, 150, 300, 450]));
    expect(sea.heightAt(sea.xAt(0), sea.zAt(0))).toBeLessThan(0);
    // Kara hücreleri değişmez
    expect(sea.heightAt(sea.xAt(2), sea.zAt(1))).toBeCloseTo(450 / VERTICAL_SCALE, 5);
  });

  it('contains ve elevationAt', () => {
    expect(source.contains(0, 0)).toBe(true);
    expect(source.contains(cell + 1, 0)).toBe(false);
    expect(source.elevationAt(source.xAt(1), source.zAt(0))).toBeCloseTo(150, 4);
  });
});

describe('gerçek dünya verisi (public/data/world, karolu)', () => {
  let region: RegionData;
  let source: RegionHeightSource;

  beforeAll(async () => {
    region = await loadRealRegion();
    source = RegionHeightSource.fromRegion(region);
  });

  it('meta.json sözleşmeyle uyumlu', () => {
    expect(region.meta.id).toBe(REGION_ID);
    expect(region.meta.crs).toBe('EPSG:32636');
    expect(region.meta.horizontalScale).toBe(HORIZONTAL_SCALE);
    expect(region.heights.length).toBe(region.meta.gridWidth * region.meta.gridHeight);
    // Karolu dünyada tek dosya yok (her karo ≤ 1 MB); birleştirilmiş dizi bellek içi (Sinop–Sakarya: ~22 MB).
    expect(region.meta.gridWidth * region.meta.gridHeight * 2).toBeLessThan(32 * 1024 * 1024);
  });

  it('yükseklik aralığı meta ile tutarlı: 0 .. elevationMax', () => {
    let min = 65535;
    let max = 0;
    for (const v of region.heights) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBe(0);
    // Dünya geneli aralık yukarı 100'e yuvarlıdır (7.4: en yüksek ≈ 2368 m, max 2400 m)
    expect(max).toBeGreaterThan(64000);
    // Ilgaz Dağı (2 587 m, Kastamonu–Çankırı genişlemesi) dünyanın en yükseğidir.
    expect(region.meta.elevationMax).toBeGreaterThan(2500);
    expect(region.meta.elevationMax).toBeLessThan(2700);
  });

  it('dünya boyutu oyunda ~9,40 × 4,69 km (Sinop–Sakarya dahil)', () => {
    const width = source.bounds.maxX - source.bounds.minX;
    const depth = source.bounds.maxZ - source.bounds.minZ;
    expect(width).toBeGreaterThan(9350);
    expect(width).toBeLessThan(9450);
    expect(depth).toBeGreaterThan(4650);
    expect(depth).toBeLessThan(4730);
  });

  // Python veri hattı + TS koordinat dönüşümü + heightmap okuma birlikte doğrulanır.
  const PLACES = [
    { name: 'Amasra (kıyı)', lat: 41.7494, lon: 32.3853, min: 0, max: 60, province: 'Bartın' },
    { name: 'Bartın merkez', lat: 41.6344, lon: 32.3375, min: 0, max: 60, province: 'Bartın' },
    {
      name: 'Zonguldak merkez',
      lat: 41.4564,
      lon: 31.7987,
      min: 60,
      max: 260,
      province: 'Zonguldak',
    },
    { name: 'Safranbolu', lat: 41.2517, lon: 32.6939, min: 460, max: 560, province: 'Karabük' },
    { name: 'Karabük merkez', lat: 41.2061, lon: 32.6204, min: 250, max: 380, province: 'Karabük' },
    { name: 'Yenice', lat: 41.2028, lon: 32.3358, min: 200, max: 340, province: 'Karabük' },
    { name: 'Düzce merkez', lat: 40.8438, lon: 31.1565, min: 100, max: 250, province: 'Düzce' },
    { name: 'Akçakoca (kıyı)', lat: 41.0864, lon: 31.1167, min: 0, max: 80, province: 'Düzce' },
    { name: 'Bolu merkez', lat: 40.7392, lon: 31.6089, min: 650, max: 850, province: 'Bolu' },
    { name: 'Abant Gölü', lat: 40.6066, lon: 31.2775, min: 1250, max: 1450, province: 'Bolu' },
  ];
  for (const place of PLACES) {
    it(`${place.name}: rakım makul ve il '${place.province}'`, () => {
      const { x, z } = latLonToGame(place.lat, place.lon, region.meta.originUtm);
      expect(source.contains(x, z)).toBe(true);
      const elevation = source.elevationAt(x, z);
      expect(elevation).toBeGreaterThanOrEqual(place.min);
      expect(elevation).toBeLessThanOrEqual(place.max);
      expect(provinceAt(region.provinces, x, z)?.name).toBe(place.province);
    });
  }

  it('komşu iller inRegion=false, hedef iller true (il listesi tools/groups ve veriden okunur)', () => {
    const byName = new Map(region.provinces.map((p) => [p.name, p]));
    for (const name of coreProvinces()) expect(byName.get(name)?.inRegion, name).toBe(true);
    // Hedef il işaretli her il bir grup dosyasında tanımlıdır; en az bir komşu il vardır.
    const declared = new Set(groupProvinces());
    for (const p of region.provinces)
      if (p.inRegion) expect(declared.has(p.name), p.name).toBe(true);
    expect(region.provinces.some((p) => !p.inRegion)).toBe(true);
  });

  it('hedef il (Bolu, Sakarya) ve komşu il (Çorum) noktası doğru bulunur; açık deniz null', () => {
    const bolu = latLonToGame(40.85, 31.6, region.meta.originUtm);
    expect(provinceAt(region.provinces, bolu.x, bolu.z)?.name).toBe('Bolu');
    const sakarya = latLonToGame(40.78, 30.62, region.meta.originUtm);
    expect(provinceAt(region.provinces, sakarya.x, sakarya.z)).toMatchObject({
      name: 'Sakarya',
      inRegion: true,
    });
    const corum = latLonToGame(40.98, 34.8, region.meta.originUtm);
    expect(provinceAt(region.provinces, corum.x, corum.z)?.name).toBe('Çorum');
    const sea = latLonToGame(41.9, 32.0, region.meta.originUtm);
    expect(provinceAt(region.provinces, sea.x, sea.z)).toBeNull();
  });

  it('Karadeniz (kuzey) deniz seviyesinde', () => {
    const { x, z } = latLonToGame(41.9, 32.0, region.meta.originUtm);
    expect(source.elevationAt(x, z)).toBeLessThan(5);
  });
});
