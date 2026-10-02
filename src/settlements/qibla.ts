/**
 * Kıble yönü (saf): bir noktadan Kâbe'ye büyük daire başlangıç açısı. Camiler mihrap duvarı (yerel −z) kıbleye
 * bakacak şekilde döndürülür; pusula da kıbleyi gösterir. Oyun −Z = UTM ızgara kuzeyi; bölgede ızgara yakınsaması
 * ~1°'dir, ihmal edilir.
 */

/** Kâbe (Mescid-i Haram) koordinatları (derece). */
export const KAABA = { lat: 21.4225, lon: 39.8262 } as const;

const RAD = Math.PI / 180;

/** (lat, lon)'dan kıbleye başlangıç açısı (derece, kuzeyden saat yönünde, 0–360). */
export function qiblaAzimuthDeg(lat: number, lon: number): number {
  const φ1 = lat * RAD;
  const φ2 = KAABA.lat * RAD;
  const Δλ = (KAABA.lon - lon) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) / RAD) % 360) + 360) % 360;
}

/**
 * Azimut (derece, kuzeyden saat yönünde) → oyun yönü (x, z) birim vektörü (+X doğu, −Z kuzey).
 */
export function azimuthToGameDir(azimuthDeg: number): { x: number; z: number } {
  const a = azimuthDeg * RAD;
  return { x: Math.sin(a), z: -Math.cos(a) };
}

/**
 * Yapının arka yüzünün (yerel −z; caminin mihrap duvarı) azimuta bakması için `yaw` (yapı kuralı:
 * yerel (lx, lz) → dünya (lx·cos + lz·sin, −lx·sin + lz·cos)). Yerel −z → (−sin yaw, −cos yaw) = (sin A, −cos A)
 * ⇒ yaw = −A.
 */
export function yawFacingBackTo(azimuthDeg: number): number {
  return -azimuthDeg * RAD;
}
