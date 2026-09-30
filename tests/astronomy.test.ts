import { describe, expect, it } from 'vitest';
import { CLOCK } from '../src/config';
import {
  dayLengthHours,
  moonPosition,
  skyDirection,
  solarDeclinationDeg,
  sunPosition,
} from '../src/survival/astronomy';

const LAT = 41.5;

describe('solarDeclinationDeg', () => {
  it('yaz gündönümünde ≈ +23,4°, kış gündönümünde ≈ −23,4°', () => {
    expect(solarDeclinationDeg(172)).toBeCloseTo(23.45, 0);
    expect(solarDeclinationDeg(355)).toBeCloseTo(-23.4, 0);
  });

  it('ekinokslarda ≈ 0° (21 Mart = 80, 22 Eylül = 265)', () => {
    expect(Math.abs(solarDeclinationDeg(80))).toBeLessThan(1);
    expect(Math.abs(solarDeclinationDeg(265))).toBeLessThan(1);
  });
});

describe('sunPosition', () => {
  it('güneş öğlesinde yükseklik = 90° − |enlem − dikliği|, azimut güney (180°)', () => {
    for (const day of [80, 172, 265, 355]) {
      const delta = solarDeclinationDeg(day);
      const noon = sunPosition(LAT, day, 12);
      expect(noon.altitudeDeg).toBeCloseTo(90 - (LAT - delta), 5);
      expect(noon.azimuthDeg).toBeCloseTo(180, 3);
    }
  });

  it('ekinoksta öğle yüksekliği ≈ 90° − enlem (48,5° civarı)', () => {
    expect(sunPosition(LAT, CLOCK.dayOfYear, 12).altitudeDeg).toBeGreaterThan(47);
    expect(sunPosition(LAT, CLOCK.dayOfYear, 12).altitudeDeg).toBeLessThan(49);
  });

  it('gece yarısı güneş ufkun altında', () => {
    expect(sunPosition(LAT, 265, 0).altitudeDeg).toBeLessThan(-40);
  });

  it('sabah doğudan, akşam batıdan: 9:00 azimut < 180 (doğu yarısı), 15:00 > 180', () => {
    expect(sunPosition(LAT, 265, 9).azimuthDeg).toBeLessThan(180);
    expect(sunPosition(LAT, 265, 9).azimuthDeg).toBeGreaterThan(90);
    expect(sunPosition(LAT, 265, 15).azimuthDeg).toBeGreaterThan(180);
  });

  it('öğleden önce ve sonra simetriktir (yükseklik eşit, azimut 360 − az)', () => {
    const morning = sunPosition(LAT, 265, 9);
    const afternoon = sunPosition(LAT, 265, 15);
    expect(morning.altitudeDeg).toBeCloseTo(afternoon.altitudeDeg, 6);
    expect(morning.azimuthDeg + afternoon.azimuthDeg).toBeCloseTo(360, 4);
  });

  it('yükseklik gün içinde öğleye kadar artar, sonra azalır (tekdüze)', () => {
    let previous = -Infinity;
    for (let h = 0; h <= 12; h += 0.5) {
      const alt = sunPosition(LAT, 265, h).altitudeDeg;
      expect(alt).toBeGreaterThan(previous);
      previous = alt;
    }
  });
});

describe('dayLengthHours', () => {
  it('ekinoksta ≈ 12 saat (kırılma yok sayılır), yazın uzun, kışın kısa', () => {
    expect(dayLengthHours(LAT, 265)).toBeGreaterThan(11.9);
    expect(dayLengthHours(LAT, 265)).toBeLessThan(12.2);
    expect(dayLengthHours(LAT, 172)).toBeGreaterThan(14.5);
    expect(dayLengthHours(LAT, 355)).toBeLessThan(9.5);
  });

  it('kutup gecesi ve gündüzü uç değerlerdir', () => {
    expect(dayLengthHours(85, 355)).toBe(0);
    expect(dayLengthHours(85, 172)).toBe(24);
  });

  it('gündüz süresi, güneşin ufuk çizgisini geçtiği saatlerle tutarlı', () => {
    const length = dayLengthHours(LAT, 265);
    const sunrise = 12 - length / 2;
    expect(Math.abs(sunPosition(LAT, 265, sunrise).altitudeDeg)).toBeLessThan(0.01);
  });
});

describe('skyDirection ve moonPosition', () => {
  it('birim uzunluktadır', () => {
    for (const h of [0, 6, 9, 12, 15, 18, 22]) {
      const d = skyDirection(sunPosition(LAT, 265, h));
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 10);
    }
  });

  it('öğle güneşi güneyde (+Z) ve yukarıda; sabah güneşi doğuda (+X)', () => {
    const noon = skyDirection(sunPosition(LAT, 265, 12));
    expect(noon.z).toBeGreaterThan(0.5); // güney = +Z (−Z kuzey)
    expect(noon.y).toBeGreaterThan(0.5);
    expect(Math.abs(noon.x)).toBeLessThan(1e-6);
    expect(skyDirection(sunPosition(LAT, 265, 8)).x).toBeGreaterThan(0.3); // doğu = +X
    expect(skyDirection(sunPosition(LAT, 265, 16)).x).toBeLessThan(-0.3);
  });

  it('ay güneşin tam karşısındadır', () => {
    const sun = sunPosition(LAT, 265, 10);
    const moon = moonPosition(sun);
    const a = skyDirection(sun);
    const b = skyDirection(moon);
    expect(a.x + b.x).toBeCloseTo(0, 9);
    expect(a.y + b.y).toBeCloseTo(0, 9);
    expect(a.z + b.z).toBeCloseTo(0, 9);
  });

  it('gündüz ay ufkun altında, gece ufkun üstünde', () => {
    expect(moonPosition(sunPosition(LAT, 265, 12)).altitudeDeg).toBeLessThan(0);
    expect(moonPosition(sunPosition(LAT, 265, 0)).altitudeDeg).toBeGreaterThan(0);
  });
});
