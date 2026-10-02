import { SOLAR } from '../config';

/**
 * Drone pilinin güneş paneliyle dolması (Faz 11, 11.8; saf). Güneş paneli yapısı (`solar_panel`) B'nin 11.2'sidir;
 * B'nin `solarChargeAt`'i birleşince bu dosya ona bağlanabilir. Kural `SOLAR` bloğundan: güneş `minSunAltitudeDeg`
 * altındayken üretim yok, `fullSunAltitudeDeg`'de tam üretim (`chargePerSecond`, pil oranı/sn); panelin `reach`
 * yarıçapındaki drone (envanterde taşınıyorsa oyuncunun konumu) dolar.
 */

/** Güneş yüksekliğine göre saniyede eklenen pil oranı (panel yanında). */
export function solarRate(sunAltitudeDeg: number): number {
  if (sunAltitudeDeg <= SOLAR.minSunAltitudeDeg) return 0;
  const t = Math.min(
    (sunAltitudeDeg - SOLAR.minSunAltitudeDeg) /
      (SOLAR.fullSunAltitudeDeg - SOLAR.minSunAltitudeDeg),
    1,
  );
  return SOLAR.chargePerSecond * t;
}

/** (x, z) bir güneş panelinin erişiminde mi? */
export function nearPanel(
  structures: ReadonlyArray<{ kind: string; x: number; z: number }>,
  x: number,
  z: number,
): boolean {
  return structures.some(
    (s) => s.kind === 'solar_panel' && Math.hypot(s.x - x, s.z - z) <= SOLAR.reach,
  );
}
