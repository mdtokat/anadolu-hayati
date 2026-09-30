import { describe, expect, it } from 'vitest';
import { HORIZONTAL_SCALE } from '../src/config';
import {
  gameToLatLon,
  gameToUtm,
  latLonToGame,
  latLonToUtm,
  utmToGame,
  utmToLatLon,
  type UtmOrigin,
} from '../src/world/geo';

/** pyproj (EPSG:4326 → EPSG:32636) ile üretilmiş referans noktaları. */
const REFERENCE = [
  { name: 'Amasra', lat: 41.7494, lon: 32.3853, e: 448892.6437, n: 4622135.5587 },
  { name: 'Safranbolu', lat: 41.2517, lon: 32.6939, e: 474354.687, n: 4566743.9318 },
  { name: 'Zonguldak', lat: 41.4564, lon: 31.7987, e: 399668.0334, n: 4590120.2121 },
  { name: 'Filyos', lat: 41.5667, lon: 32.0333, e: 419398.916, n: 4602120.4103 },
  { name: 'Yenice', lat: 41.2028, lon: 32.3358, e: 444311.1639, n: 4561482.8158 },
  { name: 'Orta meridyen', lat: 41.0, lon: 33.0, e: 500000.0, n: 4538757.0619 },
  { name: 'Batı köşe', lat: 41.836, lon: 31.274, e: 356687.9074, n: 4633007.769 },
  { name: 'Doğu köşe', lat: 40.826, lon: 33.136, e: 511467.8361, n: 4519450.6016 },
] as const;

/** Gerçek bölgenin meta.json `originUtm` değeri. */
const ORIGIN: UtmOrigin = [434085, 4576261];

describe('latLonToUtm (pyproj referansı)', () => {
  for (const p of REFERENCE) {
    it(`${p.name}: 1 cm içinde pyproj ile aynı`, () => {
      const { easting, northing } = latLonToUtm(p.lat, p.lon);
      expect(Math.abs(easting - p.e)).toBeLessThan(0.01);
      expect(Math.abs(northing - p.n)).toBeLessThan(0.01);
    });
  }

  it('orta meridyende (33°D) easting = 500000', () => {
    expect(latLonToUtm(41.5, 33).easting).toBeCloseTo(500000, 6);
  });
});

describe('utmToLatLon', () => {
  for (const p of REFERENCE) {
    it(`${p.name}: pyproj UTM'inden enlem/boylamı geri verir`, () => {
      const { lat, lon } = utmToLatLon(p.e, p.n);
      // 1e-7° ≈ 1 cm
      expect(Math.abs(lat - p.lat)).toBeLessThan(1e-7);
      expect(Math.abs(lon - p.lon)).toBeLessThan(1e-7);
    });
  }

  it('ileri-geri dönüşüm bölge genelinde tutarlı (< 1 mm)', () => {
    for (let lat = 40.8; lat <= 41.9; lat += 0.1) {
      for (let lon = 31.2; lon <= 33.3; lon += 0.15) {
        const { easting, northing } = latLonToUtm(lat, lon);
        const back = utmToLatLon(easting, northing);
        expect(Math.abs(back.lat - lat)).toBeLessThan(1e-9);
        expect(Math.abs(back.lon - lon)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('UTM ↔ oyun', () => {
  it('orijin oyunda (0, 0)dır', () => {
    const p = utmToGame(ORIGIN[0], ORIGIN[1], ORIGIN);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);
  });

  it('doğuya gitmek +x, kuzeye gitmek −z', () => {
    const east = utmToGame(ORIGIN[0] + 100, ORIGIN[1], ORIGIN);
    expect(east.x).toBeCloseTo(100 / HORIZONTAL_SCALE);
    expect(east.z).toBeCloseTo(0);
    const north = utmToGame(ORIGIN[0], ORIGIN[1] + 100, ORIGIN);
    expect(north.x).toBeCloseTo(0);
    expect(north.z).toBeCloseTo(-100 / HORIZONTAL_SCALE);
  });

  it('gameToUtm, utmToGame ile ters dönüşümdür', () => {
    const { x, z } = utmToGame(448892.6437, 4622135.5587, ORIGIN);
    const utm = gameToUtm(x, z, ORIGIN);
    expect(utm.easting).toBeCloseTo(448892.6437, 6);
    expect(utm.northing).toBeCloseTo(4622135.5587, 6);
  });
});

describe('enlem/boylam ↔ oyun', () => {
  it("Amasra, Zonguldak'ın kuzeydoğusundadır (x büyük, z küçük)", () => {
    const amasra = latLonToGame(41.7494, 32.3853, ORIGIN);
    const zonguldak = latLonToGame(41.4564, 31.7987, ORIGIN);
    expect(amasra.x).toBeGreaterThan(zonguldak.x);
    expect(amasra.z).toBeLessThan(zonguldak.z);
  });

  it('bilinen değer: Amasra (448892.6, 4622135.6) → x ≈ 296.15, z ≈ −917.49', () => {
    const p = latLonToGame(41.7494, 32.3853, ORIGIN);
    expect(p.x).toBeCloseTo((448892.6437 - 434085) / 50, 2);
    expect(p.z).toBeCloseTo(-(4622135.5587 - 4576261) / 50, 2);
  });

  it('gameToLatLon ters dönüşümdür', () => {
    const p = latLonToGame(41.2517, 32.6939, ORIGIN);
    const back = gameToLatLon(p.x, p.z, ORIGIN);
    expect(Math.abs(back.lat - 41.2517)).toBeLessThan(1e-8);
    expect(Math.abs(back.lon - 32.6939)).toBeLessThan(1e-8);
  });

  it('bölge boyutu oyunda ~3,2 × 2,4 km (154,8 km / 50)', () => {
    const west = latLonToGame(41.2, 31.293, ORIGIN);
    const east = latLonToGame(41.2, 33.137, ORIGIN);
    expect((east.x - west.x) * 50).toBeGreaterThan(150_000);
    expect(east.x - west.x).toBeLessThan(3400);
  });
});
