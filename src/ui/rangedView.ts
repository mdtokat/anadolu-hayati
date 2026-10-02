import { RANGED } from '../config';
import type { WeaponId } from '../items/weaponState';

/** Silah HUD'unun görünüm mantığı (Faz 11.5, saf; `ui/RangedHud.ts` çizer). */

export type CrosshairKind = 'cross' | 'spread' | 'bow' | 'scope';

/** Nişangâh biçimi: dürbünlü tam nişanda dürbün, saçmada açık daire, yay/sapanda kavis işaretli, yoksa artı. */
export function crosshairKind(weapon: WeaponId, scoped: boolean): CrosshairKind {
  if (scoped) return 'scope';
  if (RANGED.weapons[weapon].pellets > 1) return 'spread';
  if (weapon === 'bow' || weapon === 'slingshot') return 'bow';
  return 'cross';
}

/**
 * Saçılma konisinin ekrandaki yarıçapı (piksel): `tan(saçılma) / tan(FOV/2) × ekranın yarı yüksekliği`.
 * En az `minPx` (nişangâh kollarının birbirine değmemesi için).
 */
export function spreadRadiusPx(
  spreadDeg: number,
  fovDeg: number,
  screenHeight: number,
  minPx = 4,
): number {
  const half = Math.tan((fovDeg * Math.PI) / 360);
  if (!(half > 0)) return minPx;
  const px = (Math.tan((spreadDeg * Math.PI) / 180) / half) * (screenHeight / 2);
  return Math.max(minPx, Math.min(px, screenHeight / 2));
}

/** Mermi sayacı: "5 / 12" (şarjör / yedek); doldururken "Dolduruluyor…". */
export function ammoText(loaded: number, reserve: number, reloading: boolean): string {
  return reloading ? 'Dolduruluyor…' : `${loaded} / ${reserve}`;
}

/** Sayacın uyarı düzeyi: boş şarjör ve yedek yok `empty`, şarjör boş `low`, yoksa `ok`. */
export function ammoLevel(loaded: number, reserve: number): 'ok' | 'low' | 'empty' {
  if (loaded > 0) return 'ok';
  return reserve > 0 ? 'low' : 'empty';
}
