import { BEDS } from '../config';
import type { StructureSet } from './structures';

/** Aynı kat sayılması için döşek ile ayak arasındaki en büyük yükseklik farkı (oyun m). */
const SAME_FLOOR = 1.5;

/**
 * (x, y, z) bir döşeğin üstünde (yakınında) mı? Döşeğe `BEDS.reach` yatay uzaklıkta ve aynı katta durulursa üstünde
 * sayılır; hareketsiz dinlenirken enerji/can dolumu barınağın üstüne `BEDS` çarpanlarıyla artar (`stepVitals`).
 */
export function bedAt(structures: StructureSet, x: number, y: number, z: number): boolean {
  return structures
    .near(x, z, BEDS.reach)
    .some((s) => s.kind === 'bedroll' && Math.abs(y - s.y) <= SAME_FLOOR);
}
