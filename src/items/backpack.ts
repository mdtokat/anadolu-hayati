import { BACKPACKS } from '../config';
import type { ItemId } from './itemDefs';

/** Sırt çantası eşyaları (küçükten büyüğe). */
export const BACKPACK_IDS = ['backpack_small', 'backpack_medium', 'backpack_large'] as const;
export type BackpackId = (typeof BACKPACK_IDS)[number];

export function isBackpack(id: ItemId): id is BackpackId {
  return (BACKPACK_IDS as readonly ItemId[]).includes(id);
}

/** Çanta etkisi: ek slot ve ek ağırlık (gram). */
export interface BackpackBonus {
  slots: number;
  weightG: number;
}

export const NO_BACKPACK: BackpackBonus = { slots: 0, weightG: 0 };

/** En çok ek slot (envanter dizisi bu kadar büyük açılır; fazlası çanta yokken kilitlidir). */
export const MAX_BACKPACK_SLOTS = Math.max(...BACKPACK_IDS.map((id) => BACKPACKS[id].slots));

/**
 * Taşınan çantaların etkisi (saf): çantalar üst üste binmez, **en büyük** çanta geçerlidir (sırtta tek çanta).
 * `count(id)` envanterdeki adet.
 */
export function backpackBonus(count: (id: BackpackId) => number): BackpackBonus {
  let best: BackpackBonus = NO_BACKPACK;
  for (const id of BACKPACK_IDS) {
    if (count(id) > 0 && BACKPACKS[id].slots >= best.slots) best = BACKPACKS[id];
  }
  return best;
}
