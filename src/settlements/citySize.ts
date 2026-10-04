import { BUILDING_LOOK, CITY_SIZE } from '../config';
import type { SettlementData, SettlementRank } from '../data/settlements';
import { VARIABLE_STOREYS } from './kinds';

/**
 * Kent büyüklüğü (saf; kullanıcı talimatı: "büyük illerin küçük illerden farkı olsun"). Her yerleşime 0 (küçük
 * kasaba) … 1 (metropol) arası bir kentleşme ölçeği verir; düzen (`layout.ts`) kat sayısını, konut karışımını, çarşı
 * payını, doluluğu, harabeliği ve cephe boyasını bu ölçekle ara değerler. Sabitler `config.ts` → `CITY_SIZE`.
 */

/** Apartman kat sayısının mutlak sınırları (zemin dahil; `kinds.ts` `VARIABLE_STOREYS`). */
export const APARTMENT_FLOORS = VARIABLE_STOREYS.apartment!;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** `[küçük, büyük]` çiftini ölçekle ara değerler. */
export function bySize(pair: readonly [number, number], scale: number): number {
  return pair[0] + (pair[1] - pair[0]) * clamp01(scale);
}

function logScale(value: number, lo: number, hi: number): number {
  if (!(value > 0)) return 0;
  return clamp01(Math.log(value / lo) / Math.log(hi / lo));
}

/** İlin büyüklük ölçeği (nüfus tablosundan; tabloda yoksa 0). */
export function provinceScale(province: string): number {
  const pop = CITY_SIZE.provincePopulation[province];
  return pop === undefined ? 0 : logScale(pop, CITY_SIZE.smallPop, CITY_SIZE.largePop);
}

/** Yerleşimin kentleşme ölçeği: il merkezi ilin ölçeği, ilçe il + kendi bina sayısı karışımı, köy 0. */
export function urbanScale(
  settlement: Pick<SettlementData, 'rank' | 'province' | 'buildings'>,
): number {
  if (settlement.rank === 'koy') return 0;
  const province = provinceScale(settlement.province);
  if (settlement.rank === 'il') return province;
  const own = logScale(settlement.buildings, CITY_SIZE.smallTown, CITY_SIZE.largeTown);
  const w = CITY_SIZE.ilceProvinceWeight;
  return clamp01(w * province + (1 - w) * own);
}

/** Apartman kat aralığı (zemin dahil; tam sayı) rütbe ve ölçeğe göre. Köyde apartman olmaz: ilçe aralığı. */
export function apartmentFloorRange(
  rank: SettlementRank,
  scale: number,
): { min: number; max: number } {
  const t = CITY_SIZE.apartmentFloors[rank === 'il' ? 'il' : 'ilce'];
  const min = Math.round(bySize(t.min, scale));
  const max = Math.round(bySize(t.max, scale));
  return {
    min: Math.max(APARTMENT_FLOORS.min, Math.min(min, APARTMENT_FLOORS.max)),
    max: Math.max(Math.max(APARTMENT_FLOORS.min, min), Math.min(max, APARTMENT_FLOORS.max)),
  };
}

/**
 * Bir apartmanın kat sayısı: aralık içinde zar (`roll` ∈ [0, 1)), merkeze yakınlık (`closeness` 1 merkez, 0 kenar)
 * ve yoğunluk (`density` 0–1) ağırlıklı.
 */
export function apartmentFloors(
  rank: SettlementRank,
  scale: number,
  roll: number,
  closeness: number,
  density: number,
): number {
  const { min, max } = apartmentFloorRange(rank, scale);
  const t = clamp01(
    CITY_SIZE.floorRoll * roll +
      CITY_SIZE.floorCore * clamp01(closeness) +
      CITY_SIZE.floorDensity * clamp01(density),
  );
  return Math.round(min + (max - min) * t);
}

/** Konağın kat sayısı (2 ya da 3). */
export function konakFloors(scale: number, osmanli: boolean, roll: number): number {
  const chance = bySize(CITY_SIZE.konakTall, scale) + (osmanli ? CITY_SIZE.konakOsmanli : 0);
  return roll < chance ? 3 : 2;
}

/** Apartmanın cephe boyası: 0 boyasız, 1…n `BUILDING_LOOK.paints` sırası. `rolls` ∈ [0, 1). */
export function paintIndex(scale: number, chanceRoll: number, colorRoll: number): number {
  if (chanceRoll >= bySize(CITY_SIZE.paintChance, scale)) return 0;
  const n = BUILDING_LOOK.paints.length;
  return 1 + Math.min(n - 1, Math.floor(colorRoll * n));
}
