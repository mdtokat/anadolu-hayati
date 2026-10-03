import { describe, expect, it } from 'vitest';
import { WEATHER } from '../src/config';
import { ambientMix } from '../src/audio/ambientMix';
import { weatherAt, weatherCoolingC, weatherHours } from '../src/survival/weather';
import { skyLook, weatherLook } from '../src/world/skyModel';

describe('hava durumu (weather.ts)', () => {
  it('deterministik ve yumuşak değişir', () => {
    for (let h = 0; h < 200; h += 7.3) expect(weatherAt(h)).toEqual(weatherAt(h));
    let maxJump = 0;
    let prev = weatherAt(0).cloudiness;
    for (let h = 0.1; h < 500; h += 0.1) {
      const c = weatherAt(h).cloudiness;
      maxJump = Math.max(maxJump, Math.abs(c - prev));
      prev = c;
    }
    expect(maxJump).toBeLessThan(0.05);
  });

  it('uzun sürede açık, bulutlu ve yağmurlu havaların hepsi görülür; açık hava baskın değil ama sık', () => {
    const counts = { clear: 0, cloudy: 0, rain: 0 };
    for (let h = 0; h < 24 * 60; h += 0.5) counts[weatherAt(h).kind]++;
    const total = counts.clear + counts.cloudy + counts.rain;
    expect(counts.clear / total).toBeGreaterThan(0.25);
    expect(counts.cloudy / total).toBeGreaterThan(0.2);
    expect(counts.rain / total).toBeGreaterThan(0.05);
    expect(counts.rain / total).toBeLessThan(0.35);
  });

  it('yağmur yalnız kapalı gökte; tür eşiklere uyar', () => {
    for (let h = 0; h < 24 * 30; h += 0.25) {
      const w = weatherAt(h);
      if (w.rain > 0) expect(w.cloudiness).toBeGreaterThanOrEqual(WEATHER.rainAbove);
      if (w.kind === 'clear') expect(w.cloudiness).toBeLessThan(WEATHER.clearBelow);
    }
  });

  it('oyun başlangıcı (09:00, ilk gün) yağmurlu değil', () => {
    expect(weatherAt(weatherHours(0, 9)).kind).not.toBe('rain');
  });

  it('yağmurda ıslanınca üşünür; barınakta ıslanma yok', () => {
    const storm = { kind: 'rain' as const, cloudiness: 1, rain: 1 };
    expect(weatherCoolingC(storm, 0, false)).toBeCloseTo(WEATHER.rainCoolingC, 6);
    expect(weatherCoolingC(storm, 0, true)).toBe(0);
    expect(weatherCoolingC({ kind: 'clear', cloudiness: 0, rain: 0 }, 1, false)).toBe(0);
  });

  it('kapalı gökte güneş zayıflar, gök griye çalar; yağmurda sis yaklaşır ve kuşlar susar', () => {
    const sun = { altitudeDeg: 40, azimuthDeg: 180 };
    const clear = weatherLook(skyLook(sun), { kind: 'clear', cloudiness: 0, rain: 0 });
    const rainy = weatherLook(skyLook(sun), { kind: 'rain', cloudiness: 1, rain: 1 });
    expect(rainy.sunIntensity).toBeLessThan(clear.sunIntensity * 0.5);
    expect(rainy.fogScale).toBeLessThan(clear.fogScale);
    expect(rainy.cloudCover).toBeGreaterThan(clear.cloudCover);
    const base = {
      elevationM: 300,
      seaDistance: 500,
      cover: 'forest' as const,
      sunAltitudeDeg: 40,
    };
    const dry = ambientMix({ ...base, sheltered: false });
    const wet = ambientMix({ ...base, sheltered: false, rain: 1 });
    const roof = ambientMix({ ...base, sheltered: true, rain: 1 });
    expect(dry.rain).toBe(0);
    expect(wet.rain).toBe(1);
    expect(roof.rain).toBeLessThan(wet.rain);
    expect(wet.birds).toBeLessThan(dry.birds);
  });
});
