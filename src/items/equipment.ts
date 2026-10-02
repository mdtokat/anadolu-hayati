import { EQUIPMENT } from '../config';
import type { Inventory } from './Inventory';
import type { ItemId } from './itemDefs';

/** Isıtan giysiler (`EQUIPMENT.clothingWarmthC` anahtarları). */
const WARM_CLOTHES = Object.keys(EQUIPMENT.clothingWarmthC) as Array<
  keyof typeof EQUIPMENT.clothingWarmthC
>;

/**
 * Envanterdeki giysilerin vücut ısısı denge değerine eklediği ısı (°C, 0–`maxClothingWarmthC`). Giysi envanterde
 * bulunarak etki eder (ayrı giysi slotu yok); aynı giysiden birden çok olsa da bir kez sayılır.
 */
export function clothingWarmth(inventory: Pick<Inventory, 'has'>): number {
  let total = 0;
  for (const id of WARM_CLOTHES) {
    if (inventory.has(id as ItemId)) total += EQUIPMENT.clothingWarmthC[id];
  }
  return Math.min(Math.max(total, 0), EQUIPMENT.maxClothingWarmthC);
}

/** Elde yanan meşale var mı (kısayolda seçili ve envanterde)? */
export function torchLit(inventory: Pick<Inventory, 'has'>, held: ItemId | null): boolean {
  return held !== null && LIGHT_ITEMS.has(held) && inventory.has(held);
}

/** Elde tutulunca aydınlatan eşyalar (meşale; Faz 10: madenci lambası). */
export const LIGHT_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>(['torch', 'miner_lamp']);
