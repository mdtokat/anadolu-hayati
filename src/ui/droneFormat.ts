import { DRONE, HORIZONTAL_SCALE, VERTICAL_SCALE } from '../config';
import type { DroneMode } from '../drone/flight';
import { compassLabel } from './hudView';

/** Drone HUD metinleri (Faz 11, 11.8; saf). Uzaklık/yükseklik gerçek metredir (ölçekli dünyadan çevrilir). */

/** Gerçek yatay uzaklık: "850 m" / "4,2 km". */
export function realDistance(gameMeters: number): string {
  const real = gameMeters * HORIZONTAL_SCALE;
  if (real < 1000) return `${Math.round(real / 10) * 10} m`;
  return `${(real / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km`;
}

/** Yerden gerçek yükseklik: "120 m". */
export function realAltitude(gameMeters: number): string {
  return `${Math.max(0, Math.round((gameMeters * VERTICAL_SCALE) / 5) * 5)} m`;
}

/** Pil yüzdesi. */
export function batteryPercent(battery: number): number {
  return Math.round(Math.min(Math.max(battery, 0), 1) * 100);
}

/** Uçuş durumu satırı (yoksa boş). */
export function droneStatus(mode: DroneMode, battery: number, noise: number): string {
  if (mode === 'falling') return 'Drone düşüyor!';
  if (mode === 'returning') return 'Menzil dışı: drone kendiliğinden dönüyor';
  if (mode === 'homing') return 'Eve dönüyor';
  if (battery <= DRONE.lowBattery) return 'Pil azaldı';
  if (noise > 0.5) return 'Sinyal zayıf';
  return '';
}

/** İşaret satırı: "Kurt · 4,2 km KB". */
export function markLine(label: string, distance: number, bearing: number): string {
  return `${label} · ${realDistance(distance)} ${compassLabel(bearing)}`;
}
