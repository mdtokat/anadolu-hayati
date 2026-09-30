import { beforeAll, describe, expect, it } from 'vitest';
import { HORIZONTAL_SCALE } from '../src/config';
import { classesMatch, LANDCOVER_CLASSES, LANDCOVER_VALUE } from '../src/data/landcover';
import {
  loadRegion,
  parseLandCover,
  parseMeta,
  RegionDataError,
  type RegionData,
} from '../src/data/region';
import { latLonToGame } from '../src/world/geo';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { loadRealRegion } from './helpers/realRegion';

const VALID_META = {
  id: 'test',
  name: 'Test',
  crs: 'EPSG:32636',
  originUtm: [500000, 4500000],
  gridWidth: 4,
  gridHeight: 2,
  cellSizeReal: 100,
  elevationMin: 0,
  elevationMax: 100,
  elevationEncoding: 'uint16',
  horizontalScale: HORIZONTAL_SCALE,
  sources: [],
  landcover: { file: 'landcover.bin', classes: [...LANDCOVER_CLASSES] },
};

/** VALID_META'nın `landcover` alanı olmayan kopyası. */
function withoutLandCover(): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...VALID_META };
  delete copy.landcover;
  return copy;
}

describe('sınıf tablosu', () => {
  it('indeksler sözleşmedeki sırayla (tools/landcover.py) başlar: none, forest, shrub…', () => {
    expect(LANDCOVER_CLASSES.slice(0, 3)).toEqual(['none', 'forest', 'shrub']);
    expect(LANDCOVER_VALUE.none).toBe(0);
    expect(LANDCOVER_VALUE.forest).toBe(1);
  });

  it('classesMatch yalnızca birebir aynı tabloyu kabul eder', () => {
    expect(classesMatch([...LANDCOVER_CLASSES])).toBe(true);
    expect(classesMatch(LANDCOVER_CLASSES.slice(0, 3))).toBe(false);
    expect(classesMatch([...LANDCOVER_CLASSES].reverse())).toBe(false);
  });
});

describe('parseMeta landcover', () => {
  it('alan yoksa null', () => {
    expect(parseMeta(withoutLandCover()).landcover).toBeNull();
  });

  it('geçerli alanı okur', () => {
    expect(parseMeta(VALID_META).landcover?.file).toBe('landcover.bin');
  });

  it('sınıf tablosu uyuşmazsa hata verir', () => {
    const bad = { ...VALID_META, landcover: { file: 'landcover.bin', classes: ['none', 'orman'] } };
    expect(() => parseMeta(bad)).toThrow(/sınıf tablosu/);
    expect(() => parseMeta({ ...VALID_META, landcover: 'evet' })).toThrow(RegionDataError);
    expect(() => parseMeta({ ...VALID_META, landcover: { file: 'x', classes: [1] } })).toThrow(
      /metin listesi/,
    );
  });
});

describe('parseLandCover', () => {
  const meta = parseMeta(VALID_META);

  it('geçerli dosyayı okur', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 8]);
    expect(Array.from(parseLandCover(bytes.buffer, meta))).toEqual(Array.from(bytes));
  });

  it('boyut ve değer aralığı hatalarını reddeder', () => {
    expect(() => parseLandCover(new ArrayBuffer(5), meta)).toThrow(/beklenen 8/);
    const unknown = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 9]);
    expect(() => parseLandCover(unknown.buffer, meta)).toThrow(/bilinmeyen sınıf/);
  });
});

describe('loadRegion landcover.bin', () => {
  it('meta.landcover varsa dosyayı ister ve yükler; yoksa istemez', async () => {
    const requested: string[] = [];
    const make = (metaJson: unknown) => async (url: string) => {
      requested.push(url.split('/').pop() as string);
      const name = url.split('/').pop();
      return {
        ok: true,
        status: 200,
        json: async () =>
          name === 'meta.json' ? metaJson : { type: 'FeatureCollection', features: [] },
        arrayBuffer: async () =>
          name === 'heightmap.bin' ? new ArrayBuffer(16) : new Uint8Array(8).buffer,
      };
    };

    const withCover = await loadRegion('test', '/', make(VALID_META));
    expect(requested).toContain('landcover.bin');
    expect(withCover.landcover).toHaveLength(8);

    requested.length = 0;
    const noCover = await loadRegion('test', '/', make(withoutLandCover()));
    expect(requested).not.toContain('landcover.bin');
    expect(noCover.landcover).toBeNull();
  });
});

describe('LandCoverMap', () => {
  // 4×2 ızgara, hücre 100 m gerçek = 2 oyun m; satır 0 kuzeyde (z negatif)
  //   kuzey: none forest shrub grass
  //   güney: crop barren urban wetland
  const classes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 8]);
  const map = new LandCoverMap(4, 2, 100, classes);
  const cell = 100 / HORIZONTAL_SCALE;

  it('hücre merkezlerini doğru sınıfa çevirir (kuzey = −Z, doğu = +X)', () => {
    expect(map.classAt(-1.5 * cell, -0.5 * cell)).toBe('none');
    expect(map.classAt(-0.5 * cell, -0.5 * cell)).toBe('forest');
    expect(map.classAt(0.5 * cell, -0.5 * cell)).toBe('shrub');
    expect(map.classAt(1.5 * cell, -0.5 * cell)).toBe('grass');
    expect(map.classAt(-1.5 * cell, 0.5 * cell)).toBe('crop');
    expect(map.classAt(1.5 * cell, 0.5 * cell)).toBe('wetland');
  });

  it('hücre içindeki noktalar en yakın örneği okur', () => {
    expect(map.classAt(-0.5 * cell + 0.4 * cell, -0.5 * cell - 0.4 * cell)).toBe('forest');
  });

  it('ızgara dışı none döner', () => {
    expect(map.classAt(1000, 0)).toBe('none');
    expect(map.classAt(0, -1000)).toBe('none');
    expect(map.valueAtCell(-1, 0)).toBe(0);
  });

  it('is() sınıf karşılaştırır', () => {
    expect(map.is(-0.5 * cell, -0.5 * cell, 'forest')).toBe(true);
    expect(map.is(-0.5 * cell, -0.5 * cell, 'grass')).toBe(false);
  });

  it('boyut uyuşmazlığını reddeder', () => {
    expect(() => new LandCoverMap(3, 3, 100, classes)).toThrow(/beklenen 9/);
  });

  it('bölgede arazi örtüsü yoksa fromRegion null döner', () => {
    const region = { landcover: null } as unknown as Parameters<typeof LandCoverMap.fromRegion>[0];
    expect(LandCoverMap.fromRegion(region)).toBeNull();
  });
});

describe('gerçek bölge arazi örtüsü (public/data/regions)', () => {
  let region: RegionData;
  let map: LandCoverMap;

  beforeAll(async () => {
    region = await loadRealRegion();
    map = LandCoverMap.fromRegion(region) as LandCoverMap;
  });

  const classAtPlace = (lat: number, lon: number) => {
    const { x, z } = latLonToGame(lat, lon, region.meta.originUtm);
    return map.classAt(x, z);
  };

  it('dosya heightmap ile aynı ızgarada ve bölgede arazi örtüsü var', () => {
    expect(map).not.toBeNull();
    expect(region.landcover?.length).toBe(region.heights.length);
  });

  it('orman kara alanının çoğunu kaplar; tüm sınıflar bilinen aralıktadır', () => {
    const counts = new Array<number>(LANDCOVER_CLASSES.length).fill(0);
    for (const value of region.landcover as Uint8Array) counts[value] = (counts[value] ?? 0) + 1;
    const total = region.heights.length;
    const forest = (counts[LANDCOVER_VALUE.forest] ?? 0) / total;
    expect(forest).toBeGreaterThan(0.45); // Batı Karadeniz ormanlı bir bölge
    expect(forest).toBeLessThan(0.8);
    expect(counts[LANDCOVER_VALUE.shrub]).toBeGreaterThan(0);
    expect(counts[LANDCOVER_VALUE.crop]).toBeGreaterThan(0);
    expect(counts[LANDCOVER_VALUE.urban]).toBeGreaterThan(0);
  });

  it('deniz (heightmap 0 m) hücrelerinin çoğu sınıfsızdır (none)', () => {
    let sea = 0;
    let seaNone = 0;
    for (let i = 0; i < region.heights.length; i++) {
      if (region.heights[i] !== 0) continue;
      sea++;
      if (region.landcover?.[i] === 0) seaNone++;
    }
    expect(sea).toBeGreaterThan(10_000);
    expect(seaNone / sea).toBeGreaterThan(0.9);
  });

  it('bilinen yerler: kentler yerleşim, Yenice dağları orman, açık deniz sınıfsız', () => {
    expect(classAtPlace(41.6344, 32.3375)).toBe('urban'); // Bartın
    expect(classAtPlace(41.2, 32.62)).toBe('urban'); // Karabük
    expect(classAtPlace(41.2508, 32.6939)).toBe('urban'); // Safranbolu
    expect(classAtPlace(41.7494, 32.3853)).toBe('urban'); // Amasra
    expect(classAtPlace(41.2, 32.4)).toBe('forest'); // Yenice ormanları
    expect(classAtPlace(41.9, 32.0)).toBe('none'); // açık deniz
  });
});
