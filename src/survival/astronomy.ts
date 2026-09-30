/**
 * Güneş ve ay geometrisi (saf). Açılar derece; azimut kuzeyden saat yönünde (K=0, D=90, G=180, B=270).
 * Oyun eksenleri: +X doğu, +Y yukarı, −Z kuzey.
 */

const DEG = Math.PI / 180;

export interface SkyPosition {
  /** Ufuk üstü yükseklik (derece; negatif = ufkun altında). */
  altitudeDeg: number;
  /** Kuzeyden saat yönünde azimut (derece, 0–360). */
  azimuthDeg: number;
}

export interface Direction {
  x: number;
  y: number;
  z: number;
}

/** Güneşin dikliği (derece), Cooper formülü: δ = 23,45° · sin(360/365 · (284 + n)). */
export function solarDeclinationDeg(dayOfYear: number): number {
  return 23.45 * Math.sin((360 / 365) * (284 + dayOfYear) * DEG);
}

/**
 * Yerel güneş saatinde (12 = güneş öğlesi) güneşin konumu.
 * sin(h) = sinφ·sinδ + cosφ·cosδ·cosH;  H = 15°·(saat − 12).
 */
export function sunPosition(
  latitudeDeg: number,
  dayOfYear: number,
  solarHour: number,
): SkyPosition {
  const phi = latitudeDeg * DEG;
  const delta = solarDeclinationDeg(dayOfYear) * DEG;
  const hourAngle = 15 * (solarHour - 12) * DEG;

  const sinAlt =
    Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.min(Math.max(sinAlt, -1), 1));

  // cos(az) = (sinδ − sinφ·sin h) / (cosφ·cos h); öğleden sonra azimut 360° − acos
  const denominator = Math.cos(phi) * Math.cos(altitude);
  const cosAz = denominator === 0 ? 1 : (Math.sin(delta) - Math.sin(phi) * sinAlt) / denominator;
  let azimuth = Math.acos(Math.min(Math.max(cosAz, -1), 1)) / DEG;
  if (Math.sin(hourAngle) > 0) azimuth = 360 - azimuth;

  return { altitudeDeg: altitude / DEG, azimuthDeg: azimuth };
}

/**
 * Ay konumu: güneşin tam karşısı (dolunay). Evreler bilinçli olarak yok; gece ışığı sabit ve
 * öngörülebilir olsun diye. (Faz 3 kapsamı.)
 */
export function moonPosition(sun: SkyPosition): SkyPosition {
  return { altitudeDeg: -sun.altitudeDeg, azimuthDeg: (sun.azimuthDeg + 180) % 360 };
}

/** Gök cisminin oyun uzayındaki yönü (gözlemciden cisme birim vektör). */
export function skyDirection(position: SkyPosition): Direction {
  const altitude = position.altitudeDeg * DEG;
  const azimuth = position.azimuthDeg * DEG;
  return {
    x: Math.cos(altitude) * Math.sin(azimuth),
    y: Math.sin(altitude),
    z: -Math.cos(altitude) * Math.cos(azimuth),
  };
}

/** Gündüz süresi (saat): güneş ufuk çizgisinde (yükseklik 0°) olduğu iki an arası. Kutup gecesi/gündüzü için 0 / 24. */
export function dayLengthHours(latitudeDeg: number, dayOfYear: number): number {
  const phi = latitudeDeg * DEG;
  const delta = solarDeclinationDeg(dayOfYear) * DEG;
  const cosH = -Math.tan(phi) * Math.tan(delta);
  if (cosH >= 1) return 0;
  if (cosH <= -1) return 24;
  return (2 * Math.acos(cosH)) / DEG / 15;
}
