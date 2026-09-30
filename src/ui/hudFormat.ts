import type { Vec3 } from '../player/movement';
import type { LocationInfo } from '../world/GameWorld';

export interface DebugInfo {
  position: Readonly<Vec3>;
  velocity: Readonly<Vec3>;
  grounded: boolean;
  cameraMode: 'firstPerson' | 'thirdPerson';
}

/** Yatay hız büyüklüğü (m/s). */
export function horizontalSpeed(velocity: Readonly<Vec3>): number {
  return Math.hypot(velocity.x, velocity.z);
}

/** Bir ondalık basamağa yuvarlar; "-0.0" görünmesin diye sıfıra çok yakın değerler 0 yazılır. */
function fixed1(value: number): string {
  return (Math.abs(value) < 0.05 ? 0 : value).toFixed(1);
}

/** Geliştirici HUD'unda gösterilen çok satırlı metin. */
export function formatDebugInfo(info: DebugInfo): string {
  const { position: p } = info;
  return [
    `Konum: ${fixed1(p.x)}, ${fixed1(p.y)}, ${fixed1(p.z)}`,
    `Hız: ${horizontalSpeed(info.velocity).toFixed(1)} m/s`,
    `Zeminde: ${info.grounded ? 'evet' : 'hayır'}`,
    `Kamera: ${info.cameraMode === 'firstPerson' ? '1. şahıs' : '3. şahıs'}`,
  ].join('\n');
}

/** HUD'daki konum satırları: il adı (komşu ilse belirtilir) ve gerçek rakım. */
export function formatLocation(info: LocationInfo): { title: string; detail: string } {
  let title: string;
  if (info.province !== null) title = info.inRegion ? info.province : `${info.province} (komşu il)`;
  else title = info.elevation < 1 ? 'Karadeniz' : 'Harita dışı';
  return { title, detail: `Rakım: ${Math.round(info.elevation)} m` };
}
