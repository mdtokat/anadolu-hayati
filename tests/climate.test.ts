import { describe, expect, it } from 'vitest';
import { CLIMATE, CLOCK } from '../src/config';
import { ambientTemperature, dailyOffset, seaLevelDailyMean } from '../src/survival/climate';

const DAY = CLOCK.dayOfYear; // 22 Eylül

describe('seaLevelDailyMean', () => {
  it('en sıcak günde ortalama + genlik, 6 ay sonra ortalama − genlik', () => {
    expect(seaLevelDailyMean(CLIMATE.warmestDayOfYear)).toBeCloseTo(
      CLIMATE.annualMeanC + CLIMATE.annualAmplitudeC,
      6,
    );
    const coldest = CLIMATE.warmestDayOfYear + 365 / 2;
    expect(seaLevelDailyMean(coldest)).toBeCloseTo(
      CLIMATE.annualMeanC - CLIMATE.annualAmplitudeC,
      6,
    );
  });

  it('yaz kıştan sıcak (Temmuz > Ocak); Eylül ikisinin arasında', () => {
    const july = seaLevelDailyMean(205);
    const january = seaLevelDailyMean(15);
    const september = seaLevelDailyMean(DAY);
    expect(july).toBeGreaterThan(september);
    expect(september).toBeGreaterThan(january);
  });
});

describe('dailyOffset', () => {
  it('en sıcak saatte +genlik, 12 saat sonra −genlik', () => {
    expect(dailyOffset(CLIMATE.warmestHour)).toBeCloseTo(CLIMATE.dailyAmplitudeC, 9);
    expect(dailyOffset(CLIMATE.warmestHour - 12)).toBeCloseTo(-CLIMATE.dailyAmplitudeC, 9);
  });

  it('gün sınırında süreklidir (23,99 ≈ 0 ≈ 24)', () => {
    expect(Math.abs(dailyOffset(23.99) - dailyOffset(0))).toBeLessThan(0.01);
    expect(dailyOffset(24)).toBeCloseTo(dailyOffset(0), 9);
  });
});

describe('ambientTemperature', () => {
  it('rakım 1000 m arttıkça lapse oranı kadar soğur', () => {
    const base = ambientTemperature({ hour: 12, dayOfYear: DAY, elevationM: 0 });
    const high = ambientTemperature({ hour: 12, dayOfYear: DAY, elevationM: 1000 });
    expect(base - high).toBeCloseTo(CLIMATE.lapseRateCPerKm, 9);
  });

  it('rakımla tekdüze azalır', () => {
    let previous = Infinity;
    for (let m = 0; m <= 2000; m += 100) {
      const t = ambientTemperature({ hour: 3, dayOfYear: DAY, elevationM: m });
      expect(t).toBeLessThan(previous);
      previous = t;
    }
  });

  it('gece gündüzden soğuk; fark günlük genliğin iki katı', () => {
    const noonish = ambientTemperature({
      hour: CLIMATE.warmestHour,
      dayOfYear: DAY,
      elevationM: 100,
    });
    const night = ambientTemperature({
      hour: CLIMATE.warmestHour - 12,
      dayOfYear: DAY,
      elevationM: 100,
    });
    expect(noonish - night).toBeCloseTo(2 * CLIMATE.dailyAmplitudeC, 9);
  });

  it('negatif rakım (deniz altı) deniz seviyesi gibi davranır', () => {
    expect(ambientTemperature({ hour: 12, dayOfYear: DAY, elevationM: -50 })).toBe(
      ambientTemperature({ hour: 12, dayOfYear: DAY, elevationM: 0 }),
    );
  });

  it('Eylül kıyısı makul aralıkta (12–25 °C); zirvede gece donmaya yakın (< 3 °C)', () => {
    for (let h = 0; h < 24; h += 1) {
      const coast = ambientTemperature({ hour: h, dayOfYear: DAY, elevationM: 50 });
      expect(coast).toBeGreaterThan(12);
      expect(coast).toBeLessThan(25);
    }
    const summitNight = ambientTemperature({ hour: 3, dayOfYear: DAY, elevationM: 1995 });
    expect(summitNight).toBeLessThan(3);
    expect(summitNight).toBeGreaterThan(-5);
  });

  it('kışın zirvede gece belirgin biçimde dondurucu (< −10 °C)', () => {
    expect(ambientTemperature({ hour: 3, dayOfYear: 15, elevationM: 1995 })).toBeLessThan(-10);
  });
});
