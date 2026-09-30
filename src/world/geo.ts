import { HORIZONTAL_SCALE } from '../config';

/**
 * Coğrafi koordinat dönüşümleri: enlem/boylam (WGS84) ↔ UTM Zone 36N (EPSG:32636) ↔ oyun X/Z.
 *
 * UTM dönüşümü Krüger serisiyle (4. derece) yapılır; bağımlılık gerektirmez. Orta meridyene
 * 3° içinde (bu bölge) doğruluk milimetre altıdır. Testler pyproj çıktılarıyla karşılaştırır.
 *
 * Oyun eksenleri (Three.js, Y yukarı): +X doğu, −Z kuzey.
 *   x = (easting − originE) / HORIZONTAL_SCALE
 *   z = −(northing − originN) / HORIZONTAL_SCALE
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Utm {
  easting: number;
  northing: number;
}

export interface GamePoint {
  x: number;
  z: number;
}

/** Bölgenin oyun dünyasındaki (0, 0) noktasının UTM konumu: meta.json `originUtm`. */
export type UtmOrigin = readonly [easting: number, northing: number];

// WGS84 elipsoidi
const A = 6378137;
const F = 1 / 298.257223563;
// UTM Zone 36N
const K0 = 0.9996;
const FALSE_EASTING = 500000;
const CENTRAL_MERIDIAN_DEG = 33;

const DEG = Math.PI / 180;
const N = F / (2 - F);
const N2 = N * N;
const N3 = N2 * N;
const N4 = N3 * N;
/** Düzeltilmiş yarıçap (rektifiye edilmiş meridyen yarıçapı). */
const RADIUS = (A / (1 + N)) * (1 + N2 / 4 + N4 / 64);

// Krüger serisi katsayıları (ileri)
const ALPHA = [
  N / 2 - (2 / 3) * N2 + (5 / 16) * N3 + (41 / 180) * N4,
  (13 / 48) * N2 - (3 / 5) * N3 + (557 / 1440) * N4,
  (61 / 240) * N3 - (103 / 140) * N4,
  (49561 / 161280) * N4,
] as const;
// (ters)
const BETA = [
  N / 2 - (2 / 3) * N2 + (37 / 96) * N3 - (1 / 360) * N4,
  (1 / 48) * N2 + (1 / 15) * N3 - (437 / 1440) * N4,
  (17 / 480) * N3 - (37 / 840) * N4,
  (4397 / 161280) * N4,
] as const;
const DELTA = [
  2 * N - (2 / 3) * N2 - 2 * N3 + (116 / 45) * N4,
  (7 / 3) * N2 - (8 / 5) * N3 - (227 / 45) * N4,
  (56 / 15) * N3 - (136 / 35) * N4,
  (4279 / 630) * N4,
] as const;

/** Enlem/boylam (derece) → UTM 36N (metre). */
export function latLonToUtm(lat: number, lon: number): Utm {
  const phi = lat * DEG;
  const dLambda = (lon - CENTRAL_MERIDIAN_DEG) * DEG;

  const c = (2 * Math.sqrt(N)) / (1 + N);
  const sinPhi = Math.sin(phi);
  const t = Math.sinh(Math.atanh(sinPhi) - c * Math.atanh(c * sinPhi));
  const xiPrime = Math.atan2(t, Math.cos(dLambda));
  const etaPrime = Math.atanh(Math.sin(dLambda) / Math.sqrt(1 + t * t));

  let xi = xiPrime;
  let eta = etaPrime;
  ALPHA.forEach((alpha, i) => {
    const j = 2 * (i + 1);
    xi += alpha * Math.sin(j * xiPrime) * Math.cosh(j * etaPrime);
    eta += alpha * Math.cos(j * xiPrime) * Math.sinh(j * etaPrime);
  });

  return { easting: FALSE_EASTING + K0 * RADIUS * eta, northing: K0 * RADIUS * xi };
}

/** UTM 36N (metre) → enlem/boylam (derece). */
export function utmToLatLon(easting: number, northing: number): LatLon {
  const xi = northing / (K0 * RADIUS);
  const eta = (easting - FALSE_EASTING) / (K0 * RADIUS);

  let xiPrime = xi;
  let etaPrime = eta;
  BETA.forEach((beta, i) => {
    const j = 2 * (i + 1);
    xiPrime -= beta * Math.sin(j * xi) * Math.cosh(j * eta);
    etaPrime -= beta * Math.cos(j * xi) * Math.sinh(j * eta);
  });

  const chi = Math.asin(Math.sin(xiPrime) / Math.cosh(etaPrime));
  let phi = chi;
  DELTA.forEach((delta, i) => {
    phi += delta * Math.sin(2 * (i + 1) * chi);
  });
  const dLambda = Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime));

  return { lat: phi / DEG, lon: CENTRAL_MERIDIAN_DEG + dLambda / DEG };
}

/** UTM → oyun X/Z. */
export function utmToGame(easting: number, northing: number, origin: UtmOrigin): GamePoint {
  return {
    x: (easting - origin[0]) / HORIZONTAL_SCALE,
    z: -(northing - origin[1]) / HORIZONTAL_SCALE,
  };
}

/** Oyun X/Z → UTM. */
export function gameToUtm(x: number, z: number, origin: UtmOrigin): Utm {
  return {
    easting: origin[0] + x * HORIZONTAL_SCALE,
    northing: origin[1] - z * HORIZONTAL_SCALE,
  };
}

/** Enlem/boylam → oyun X/Z. */
export function latLonToGame(lat: number, lon: number, origin: UtmOrigin): GamePoint {
  const { easting, northing } = latLonToUtm(lat, lon);
  return utmToGame(easting, northing, origin);
}

/** Oyun X/Z → enlem/boylam. */
export function gameToLatLon(x: number, z: number, origin: UtmOrigin): LatLon {
  const { easting, northing } = gameToUtm(x, z, origin);
  return utmToLatLon(easting, northing);
}
