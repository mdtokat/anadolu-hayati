import { PILOT } from '../config';
import type { ProvinceShape } from '../data/region';
import { distanceToProvince, provinceAt } from './provinces';

/** Pilot ilin şekli; manifestte yoksa null. */
export function pilotProvince(provinces: readonly ProvinceShape[]): ProvinceShape | null {
  return provinces.find((p) => p.name === PILOT.province) ?? null;
}

/**
 * (x, z) verilen ilde mi? İl çokgeninin içi evet; başka bir ilin içi hayır. Hiçbir ile ait olmayan nokta
 * (il çokgenleri kıyıdan içeride kaldığından kıyı şeridi) ancak en yakın il verilen il ise ve çokgene
 * `coastBufferM` içindeyse o ilde sayılır. Denizi ayırmak çağıranın işidir (kara kontrolü).
 */
export function isInProvince(
  provinces: readonly ProvinceShape[],
  name: string,
  x: number,
  z: number,
  coastBufferM: number = PILOT.coastBufferM,
): boolean {
  const province = provinces.find((p) => p.name === name);
  if (!province) return false;
  const inside = provinceAt(provinces, x, z);
  if (inside !== null) return inside === province;

  const distance = distanceToProvince(province, x, z);
  if (distance > coastBufferM) return false;
  return provinces.every((p) => p === province || distanceToProvince(p, x, z) > distance);
}

/** (x, z) pilot ilde mi? (`isInProvince`, pilot il için; kıyı şeridi dahil). */
export function isInPilotProvince(
  provinces: readonly ProvinceShape[],
  x: number,
  z: number,
): boolean {
  return isInProvince(provinces, PILOT.province, x, z);
}
