import { SKY } from '../config';
import type { SkyPosition } from '../survival/astronomy';

/** [r, g, b], her biri 0–1. */
export type Rgb = readonly [number, number, number];

/** Güneş konumuna göre gökyüzü/ışık görünümü (saf; Three.js'e bağımlı değil, Environment uygular). */
export interface SkyLook {
  /** 0 = gece, 1 = tam gündüz. */
  dayFactor: number;
  zenith: Rgb;
  /** Ufuk rengi; sis ve arka plan rengi de budur. */
  horizon: Rgb;
  sunColor: Rgb;
  sunIntensity: number;
  moonColor: Rgb;
  moonIntensity: number;
  ambientColor: Rgb;
  ambientIntensity: number;
  /** Yıldızların görünürlüğü (0–1). */
  starAlpha: number;
}

export function hexToRgb(hex: number): Rgb {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** 0..1 arası yumuşak basamak (edge0 < edge1 ya da tersi; ters ise 1 → 0 iner). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Güneşin ufuk üstü yüksekliğine (derece) göre tüm gökyüzü ve ışık parametreleri. */
export function skyLook(sun: SkyPosition): SkyLook {
  const alt = sun.altitudeDeg;
  const day = smoothstep(SKY.dayFactorFrom, SKY.dayFactorTo, alt);

  const zenith = mixRgb(hexToRgb(SKY.zenithNight), hexToRgb(SKY.zenithDay), day);

  // Alacakaranlık: güneş ufka yakınken (üstte ya da altta) ufuk turuncuya çalar.
  const twilight = Math.exp(-((alt / SKY.twilightWidth) ** 2)) * SKY.twilightMix;
  const horizonBase = mixRgb(hexToRgb(SKY.horizonNight), hexToRgb(SKY.horizonDay), day);
  const horizon = mixRgb(horizonBase, hexToRgb(SKY.horizonTwilight), twilight);

  const sunFactor = smoothstep(SKY.sunLightFrom, SKY.sunLightTo, alt);
  const warm = 1 - smoothstep(0, SKY.sunWarmBelow, alt);
  const sunColor = mixRgb(hexToRgb(SKY.sunColorHigh), hexToRgb(SKY.sunColorLow), warm);

  // Ay güneşin tam karşısındadır (yüksekliği −alt); güneş ışığı söndükçe ay ışığı açılır.
  const moonFactor = smoothstep(SKY.sunLightFrom, SKY.sunLightTo, -alt);

  return {
    dayFactor: day,
    zenith,
    horizon,
    sunColor,
    sunIntensity: SKY.sunIntensity * sunFactor,
    moonColor: hexToRgb(SKY.moonColor),
    moonIntensity: SKY.moonIntensity * moonFactor,
    ambientColor: mixRgb(hexToRgb(SKY.ambientColorNight), hexToRgb(SKY.ambientColorDay), day),
    ambientIntensity: SKY.ambientNight + (SKY.ambientDay - SKY.ambientNight) * day,
    starAlpha: smoothstep(SKY.starsFadeStart, SKY.starsFadeEnd, alt),
  };
}
