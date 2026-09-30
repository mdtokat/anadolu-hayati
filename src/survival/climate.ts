import { CLIMATE } from '../config';

export interface ClimateInput {
  /** Yerel güneş saati (0–24). */
  hour: number;
  /** Yılın günü (1–365). */
  dayOfYear: number;
  /** Gerçek rakım (metre) — oyun yüksekliği DEĞİL (bkz. VERTICAL_SCALE). */
  elevationM: number;
}

/** Deniz seviyesinde günlük ortalama sıcaklık (°C): yıllık sinüs. */
export function seaLevelDailyMean(dayOfYear: number): number {
  const phase = (2 * Math.PI * (dayOfYear - CLIMATE.warmestDayOfYear)) / 365;
  return CLIMATE.annualMeanC + CLIMATE.annualAmplitudeC * Math.cos(phase);
}

/** Günlük döngünün ortalamadan sapması (°C): en sıcak saatte +genlik, 12 saat sonra −genlik. */
export function dailyOffset(hour: number): number {
  const phase = (2 * Math.PI * (hour - CLIMATE.warmestHour)) / 24;
  return CLIMATE.dailyAmplitudeC * Math.cos(phase);
}

/**
 * Ortam sıcaklığı (°C) = mevsimsel ortalama + günlük döngü − rakım × düşme oranı.
 * Yalnızca saf hesap; rüzgâr, yağış ve bulut yoktur.
 */
export function ambientTemperature({ hour, dayOfYear, elevationM }: ClimateInput): number {
  const lapse = (Math.max(elevationM, 0) / 1000) * CLIMATE.lapseRateCPerKm;
  return seaLevelDailyMean(dayOfYear) + dailyOffset(hour) - lapse;
}
