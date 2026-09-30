import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER } from '../src/config';
import { parseFeatures, type RegionData, type WaterFeatures } from '../src/data/region';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealRegion } from './helpers/realRegion';

const f64 = (...v: number[]) => Float64Array.from(v);

function water(partial: Partial<WaterFeatures>): WaterFeatures {
  return { lines: [], polygons: [], points: [], ...partial };
}

const square = (x0: number, z0: number, x1: number, z1: number) =>
  f64(x0, z0, x1, z0, x1, z1, x0, z1, x0, z0);
const bounds = (minX: number, minZ: number, maxX: number, maxZ: number) => ({
  minX,
  minZ,
  maxX,
  maxZ,
});

describe('FreshWaterIndex: çizgiler', () => {
  const index = new FreshWaterIndex(
    water({
      lines: [{ kind: 'river', name: 'Test Çayı', intermittent: false, xz: f64(0, 0, 100, 0) }],
    }),
  );

  it('çizgiye olan uzaklık ve en yakın nokta', () => {
    const hit = index.nearest(50, 3, 5);
    expect(hit?.kind).toBe('river');
    expect(hit?.name).toBe('Test Çayı');
    expect(hit?.distance).toBeCloseTo(3, 9);
    expect(hit?.x).toBeCloseTo(50, 9);
    expect(hit?.z).toBeCloseTo(0, 9);
  });

  it('uçların ötesinde uç noktaya uzaklık', () => {
    const hit = index.nearest(103, 4, 6);
    expect(hit?.distance).toBeCloseTo(5, 9);
    expect(hit?.x).toBeCloseTo(100, 9);
  });

  it('erişim mesafesi dışında null', () => {
    expect(index.nearest(50, 10, 5)).toBeNull();
    expect(index.nearest(50, FRESH_WATER.reachDistance + 0.1)).toBeNull();
    expect(index.nearest(50, FRESH_WATER.reachDistance - 0.1)).not.toBeNull();
  });

  it('sorgu yarıçapı hücre boyundan büyük olabilir', () => {
    expect(index.nearest(50, 90, 100)?.distance).toBeCloseTo(90, 9);
  });

  it('uzun çapraz çizgiyi hücre sınırlarını aşarken de bulur', () => {
    const diagonal = new FreshWaterIndex(
      water({ lines: [{ kind: 'stream', intermittent: false, xz: f64(-500, -500, 500, 500) }] }),
    );
    for (const t of [-400, -123, 0, 77, 391]) {
      const hit = diagonal.nearest(t + 2, t - 2, 5); // çizgiden ≈ 2,83 m
      expect(hit?.distance).toBeCloseTo(Math.SQRT2 * 2, 6);
    }
  });
});

describe('FreshWaterIndex: göller', () => {
  const lake = {
    kind: 'lake' as const,
    name: 'Göl',
    rings: [square(0, 0, 100, 100), square(40, 40, 60, 60)], // 40–60 arası ada (delik)
    bounds: bounds(0, 0, 100, 100),
  };
  const index = new FreshWaterIndex(water({ polygons: [lake] }));

  it('gölün içinde uzaklık 0', () => {
    const hit = index.nearest(20, 20);
    expect(hit?.kind).toBe('lake');
    expect(hit?.distance).toBe(0);
  });

  it('adada (delik) suda değildir: en yakın kıyıya uzaklık', () => {
    const hit = index.nearest(50, 50, 30);
    expect(hit?.distance).toBeCloseTo(10, 9); // adanın kenarına 10 m
  });

  it('kıyıya yakın dışarıdaki nokta kıyıya uzaklıkla eşleşir', () => {
    const hit = index.nearest(102, 50, 5);
    expect(hit?.distance).toBeCloseTo(2, 9);
  });

  it('göl dışı ve uzak nokta null', () => {
    expect(index.nearest(300, 300)).toBeNull();
  });
});

describe('FreshWaterIndex: kaynaklar ve karışım', () => {
  it('kaynak noktası (spring) bulunur', () => {
    const index = new FreshWaterIndex(
      water({ points: [{ kind: 'spring', name: 'Pınar', x: 10, z: 10 }] }),
    );
    const hit = index.nearest(12, 10, 5);
    expect(hit?.kind).toBe('spring');
    expect(hit?.distance).toBeCloseTo(2, 9);
  });

  it('birden çok kaynak arasından en yakınını seçer', () => {
    const index = new FreshWaterIndex(
      water({
        lines: [
          { kind: 'river', intermittent: false, xz: f64(0, 10, 100, 10) },
          { kind: 'stream', intermittent: false, xz: f64(0, 3, 100, 3) },
        ],
        points: [{ kind: 'spring', x: 50, z: 1 }],
      }),
    );
    expect(index.nearest(50, 0, 20)?.kind).toBe('spring');
    expect(index.nearest(50, 5, 20)?.kind).toBe('stream');
  });

  it('boş özelliklerde null', () => {
    expect(new FreshWaterIndex(water({})).nearest(0, 0, 100)).toBeNull();
  });
});

describe('parseFeatures', () => {
  const valid = {
    version: 1,
    water: {
      lines: [
        { kind: 'river', name: 'A', xz: [0, 0, 10, 0], intermittent: true },
        { kind: 'stream', xz: [0, 0, 5, 5] },
      ],
      polygons: [{ kind: 'pond', rings: [[0, 0, 5, 0, 5, 5, 0, 5, 0, 0]] }],
      points: [{ kind: 'spring', x: 1, z: 2 }],
    },
  };

  it('geçerli özellikleri okur (isim, kesikli bayrağı, sınır kutusu)', () => {
    const { water: w } = parseFeatures(valid);
    expect(w.lines).toHaveLength(2);
    expect(w.lines[0]).toMatchObject({ kind: 'river', name: 'A', intermittent: true });
    expect(w.lines[1]?.intermittent).toBe(false);
    expect(w.lines[1]?.name).toBeUndefined();
    expect(w.polygons[0]?.bounds).toEqual({ minX: 0, minZ: 0, maxX: 5, maxZ: 5 });
    expect(w.points[0]).toMatchObject({ kind: 'spring', x: 1, z: 2 });
  });

  it('bozuk yapıları reddeder', () => {
    expect(() => parseFeatures(null)).toThrow(/water/);
    expect(() => parseFeatures({ water: { lines: [], polygons: [] } })).toThrow(
      /lines\/polygons\/points/,
    );
    expect(() =>
      parseFeatures({ water: { ...valid.water, lines: [{ kind: 'ocean', xz: [0, 0, 1, 1] }] } }),
    ).toThrow(/türü/);
    expect(() =>
      parseFeatures({ water: { ...valid.water, lines: [{ kind: 'river', xz: [0, 0, 1] }] } }),
    ).toThrow(/çift/);
    expect(() =>
      parseFeatures({ water: { ...valid.water, polygons: [{ kind: 'lake', rings: [] }] } }),
    ).toThrow(/halka/);
    expect(() =>
      parseFeatures({ water: { ...valid.water, points: [{ kind: 'spring', x: 'a', z: 1 }] } }),
    ).toThrow(/sayı/);
  });
});

describe('gerçek bölge suyu (features.json)', () => {
  let region: RegionData;
  let index: FreshWaterIndex;

  beforeAll(async () => {
    region = await loadRealRegion();
    index = new FreshWaterIndex((region.features as NonNullable<RegionData['features']>).water);
  });

  it('meta.features ile features.json yüklenir; akarsu ve göl sayıları makul', () => {
    expect(region.meta.features).toEqual(['water']);
    const w = (region.features as NonNullable<RegionData['features']>).water;
    expect(w.lines.length).toBeGreaterThan(500);
    expect(w.lines.filter((l) => l.kind === 'river').length).toBeGreaterThan(100);
    expect(w.polygons.length).toBeGreaterThan(50);
  });

  it('bilinen nehirler adıyla bulunur (Filyos, Bartın, Soğanlı, Devrekani)', () => {
    const names = new Set((region.features?.water.lines ?? []).map((l) => l.name));
    for (const name of ['Filyos Çayı', 'Bartın Çayı', 'Soğanlı Çayı', 'Devrekani Çayı'])
      expect(names.has(name)).toBe(true);
  });

  it("nehir üzerindeki bir noktada uzaklık 0'a yakın ve isim döner", () => {
    const filyos = region.features?.water.lines.find((l) => l.name === 'Filyos Çayı');
    expect(filyos).toBeDefined();
    const xz = (filyos as { xz: Float64Array }).xz;
    const mid = Math.floor(xz.length / 4) * 2;
    const hit = index.nearest(xz[mid] as number, xz[mid + 1] as number, 1);
    expect(hit?.distance).toBeLessThan(0.01);
  });

  it('sorgular hızlı: 20 bin rastgele nokta < 1 sn', () => {
    const t0 = performance.now();
    let found = 0;
    for (let i = 0; i < 20000; i++) {
      const x = ((i * 7919) % 3000) - 1500;
      const z = ((i * 104729) % 2200) - 1100;
      if (index.nearest(x, z, FRESH_WATER.reachDistance)) found++;
    }
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(found).toBeGreaterThan(0);
    expect(found).toBeLessThan(20000);
  });

  it('deniz kıyısı tatlı su sayılmaz: Karadeniz açıklarında su yok', () => {
    expect(index.nearest(0, -1000, FRESH_WATER.reachDistance)).toBeNull();
  });
});
