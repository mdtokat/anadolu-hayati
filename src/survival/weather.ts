import { WEATHER } from '../config';
import { createRandom, seedFrom } from '../utils/random';

/**
 * Değişken hava durumu (saf; kullanıcı talimatı: "bazen bulutlu bazen yağmurlu bazen açık"). Hava oyun saatinin
 * deterministik bir fonksiyonudur: aynı an hep aynı havayı verir, kayda girmesi gerekmez (saat kayıtlıdır).
 *
 * Bulutluluk `c ∈ [0, 1]`, `WEATHER.periodHours` aralıklı rastgele düğümler arasında yumuşak (kosinüs) geçişli iki
 * katmandan (yavaş cephe + hızlı dalga) oluşur. `c < clearBelow` açık, `c ≥ rainAbove` yağmur (yağış şiddeti
 * eşikten sonra artar), arası bulutlu.
 */

export type WeatherKind = 'clear' | 'cloudy' | 'rain';

export interface WeatherState {
  kind: WeatherKind;
  /** Bulutluluk (0 açık – 1 kapalı). */
  cloudiness: number;
  /** Yağış şiddeti (0 yok – 1 sağanak). */
  rain: number;
}

/** Düğüm değeri [0, 1): dönem sırası ve katman tohumundan. */
function node(index: number, layer: number): number {
  return createRandom(seedFrom(WEATHER.seed, layer, index)).next();
}

/** `period` saatlik düğümler arasında kosinüs aradeğerlemeli değer. */
function smoothNoise(hours: number, period: number, layer: number): number {
  const t = hours / period;
  const i = Math.floor(t);
  const f = t - i;
  const w = (1 - Math.cos(Math.PI * f)) / 2;
  return node(i, layer) * (1 - w) + node(i + 1, layer) * w;
}

/** `hours`: oyun başından beri geçen oyun saati (gün · 24 + saat). */
export function weatherAt(hours: number): WeatherState {
  const front = smoothNoise(hours, WEATHER.periodHours, 1);
  const ripple = smoothNoise(hours, WEATHER.periodHours / 3, 2);
  // Cephe baskın; dalga bulutları kıpırdatır. Hafif kayma ile açık hava biraz daha sık.
  const raw = front * 0.75 + ripple * 0.25;
  const cloudiness = Math.min(Math.max((raw - WEATHER.bias) / (1 - WEATHER.bias), 0), 1);
  const rain =
    cloudiness >= WEATHER.rainAbove
      ? Math.min((cloudiness - WEATHER.rainAbove) / (1 - WEATHER.rainAbove) + 0.25, 1)
      : 0;
  const kind: WeatherKind =
    rain > 0 ? 'rain' : cloudiness < WEATHER.clearBelow ? 'clear' : 'cloudy';
  return { kind, cloudiness, rain };
}

/** Oyun saatinden (gün, saat) mutlak saat. */
export function weatherHours(day: number, hour: number): number {
  return day * 24 + hour + WEATHER.startOffsetHours;
}

/** Görünen ad. */
export const WEATHER_LABELS: Readonly<Record<WeatherKind, string>> = {
  clear: 'Açık',
  cloudy: 'Bulutlu',
  rain: 'Yağmurlu',
};

/**
 * Hava kaynaklı serinleme (°C, ortam sıcaklığından düşülür): yağmur ıslatır (barınakta yok sayılır), gündüz bulut
 * güneşi keser.
 */
export function weatherCoolingC(state: WeatherState, daylight: number, sheltered: boolean): number {
  const wet = sheltered ? 0 : state.rain * WEATHER.rainCoolingC;
  const shade = state.cloudiness * daylight * WEATHER.cloudCoolingC;
  return wet + shade;
}
