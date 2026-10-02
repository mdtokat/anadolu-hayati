import { SOLAR } from '../config';
import type { StructureSet } from './structures';

/**
 * Güneş paneli (Faz 11, 11.2; saf mantık). Panel gündüz yakınındaki pillere şarj gücü üretir: güneş
 * `SOLAR.minSunAltitudeDeg` altındayken üretim yok, `SOLAR.fullSunAltitudeDeg`'de tam üretim (aradaki doğrusal);
 * `SOLAR.reach` yarıçapındaki paneller toplanır (en çok `SOLAR.maxPanels`). Drone pili (F, 11.8) bu fonksiyonu okur.
 */

/** Güneş yüksekliğine (derece) göre tek panelin üretimi: saniyede eklenen pil oranı (0–1). */
export function solarOutput(sunAltitudeDeg: number): number {
  if (!(sunAltitudeDeg > SOLAR.minSunAltitudeDeg)) return 0;
  const t = Math.min(
    (sunAltitudeDeg - SOLAR.minSunAltitudeDeg) /
      (SOLAR.fullSunAltitudeDeg - SOLAR.minSunAltitudeDeg),
    1,
  );
  return SOLAR.chargePerSecond * t;
}

/** (x, z)'deki toplam şarj gücü: erişimdeki panel sayısı × güneş üretimi (saniyede pil oranı). */
export function solarChargeAt(
  structures: StructureSet,
  x: number,
  z: number,
  sunAltitudeDeg: number,
): number {
  const output = solarOutput(sunAltitudeDeg);
  if (output === 0) return 0;
  const panels = structures.near(x, z, SOLAR.reach).filter((s) => s.kind === 'solar_panel').length;
  return output * Math.min(panels, SOLAR.maxPanels);
}
