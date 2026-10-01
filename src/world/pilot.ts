import { PILOT } from '../config';
import type { ProvinceShape } from '../data/region';
import { distanceToProvince, provinceAt } from './provinces';

/** Pilot ilin şekli; manifestte yoksa null. */
export function pilotProvince(provinces: readonly ProvinceShape[]): ProvinceShape | null {
  return provinces.find((p) => p.name === PILOT.province) ?? null;
}

/**
 * (x, z) pilot ilde mi? İl çokgeninin içi evet; başka bir ilin içi hayır. Hiçbir ile ait olmayan nokta
 * (il çokgeni kıyıdan içeride kaldığından kıyı şeridi) ancak en yakın il pilot ilse ve çokgene
 * `PILOT.coastBufferM` içindeyse pilot ilde sayılır. Denizi ayırmak çağıranın işidir (kara kontrolü).
 */
export function isInPilotProvince(
  provinces: readonly ProvinceShape[],
  x: number,
  z: number,
): boolean {
  const pilot = pilotProvince(provinces);
  if (pilot === null) return false;
  const inside = provinceAt(provinces, x, z);
  if (inside !== null) return inside === pilot;

  const distance = distanceToProvince(pilot, x, z);
  if (distance > PILOT.coastBufferM) return false;
  return provinces.every((p) => p === pilot || distanceToProvince(p, x, z) > distance);
}
