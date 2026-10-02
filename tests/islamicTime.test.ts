import { describe, expect, it } from 'vitest';
import {
  formatGameDate,
  gregorianToJdn,
  jdnToGregorian,
  jdnToHijri,
  nextPrayer,
  prayerTimes,
  prayersBetween,
} from '../src/survival/islamicTime';

describe('namaz vakitleri (Faz 10)', () => {
  it('ekinoksta 41,5° K: sıralı ve makul (güneş saati)', () => {
    const t = prayerTimes(41.5, 265);
    expect(t.imsak!).toBeGreaterThan(4.3);
    expect(t.imsak!).toBeLessThan(4.8);
    expect(t.gunes!).toBeGreaterThan(5.8);
    expect(t.gunes!).toBeLessThan(6.1);
    expect(t.ogle).toBeCloseTo(12 + 5 / 60);
    expect(t.ikindi!).toBeGreaterThan(15.0);
    expect(t.ikindi!).toBeLessThan(15.6);
    expect(t.aksam!).toBeGreaterThan(17.9);
    expect(t.aksam!).toBeLessThan(18.2);
    expect(t.yatsi!).toBeGreaterThan(19.2);
    expect(t.yatsi!).toBeLessThan(19.7);
  });

  it('sonraki vakit ve aradaki vakitler (gün dönümü dahil)', () => {
    const t = prayerTimes(41.5, 265);
    expect(nextPrayer(t, 9).prayer).toBe('ogle');
    expect(nextPrayer(t, 21).prayer).toBe('imsak');
    expect(nextPrayer(t, 21).hour).toBeGreaterThan(24);
    expect(prayersBetween(t, 11.9, 12.2)).toEqual(['ogle']);
    expect(prayersBetween(t, 23, 5)).toEqual(['imsak']);
    expect(prayersBetween(t, 13, 14)).toEqual([]);
  });
});

describe('Hicrî takvim', () => {
  it('Jülyen gün dönüşümleri tutarlı', () => {
    const jdn = gregorianToJdn(2026, 9, 22);
    expect(jdnToGregorian(jdn)).toEqual({ year: 2026, month: 9, day: 22 });
    expect(gregorianToJdn(2000, 1, 1)).toBe(2451545);
  });

  it('bilinen tarihler (±1 gün): 1 Muharrem 1446 ≈ 7 Temmuz 2024, 1 Ramazan 1447 ≈ 18–19 Şubat 2026', () => {
    // Tablo takvimi: 7 Temmuz 2024 = 30 Zilhicce 1445, ertesi gün 1 Muharrem 1446.
    expect(jdnToHijri(gregorianToJdn(2024, 7, 7))).toEqual({ year: 1445, month: 12, day: 30 });
    expect(jdnToHijri(gregorianToJdn(2024, 7, 8))).toEqual({ year: 1446, month: 1, day: 1 });
    const ramazan = jdnToHijri(gregorianToJdn(2026, 2, 19));
    expect(ramazan.year).toBe(1447);
    expect([8, 9]).toContain(ramazan.month);
  });

  it('oyun tarihi metni', () => {
    expect(formatGameDate(2026, 265, 0)).toMatch(/^22 Eylül 2026 · \d+ \S+ 1448$/);
    expect(formatGameDate(2026, 265, 10)).toMatch(/^2 Ekim 2026/);
  });
});
