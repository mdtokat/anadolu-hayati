import { FOOD, SURVIVAL } from '../config';
import { applyConsumable, type VitalsState } from '../survival/vitals';
import type { Inventory } from './Inventory';
import { ITEMS, type EdibleEffect, type ItemId } from './itemDefs';

export interface EatResult {
  vitals: VitalsState;
  eaten: ItemId;
}

/** Eşyanın yenince verdiği etki; yenebilir değilse `null`. */
export function edibleEffect(id: ItemId): EdibleEffect | null {
  return ITEMS[id].edible ?? null;
}

/** Etkiyi göstergelere uygular (0–100'e kırpar); girdi durumu değişmez. */
export function applyEdible(state: VitalsState, effect: EdibleEffect): VitalsState {
  const next = applyConsumable(state, effect);
  const health = Math.min(Math.max(state.health + (effect.health ?? 0), 0), SURVIVAL.maxValue);
  return { ...next, health };
}

/** Yenebilir mi ve tokluk eksiği yeterli mi? (Tok olan yemek yiyemez.) */
export function canEat(state: VitalsState, id: ItemId): boolean {
  return edibleEffect(id) !== null && SURVIVAL.maxValue - state.satiety >= FOOD.eatMinDeficit;
}

/**
 * Envanterden bir adet yiyip göstergeleri artırır (saf: yeni göstergeleri döndürür).
 * `target`: slot indeksi veya eşya kimliği. Envanterde yoksa, yenebilir değilse veya tokken
 * `null` döner ve envanter değişmez.
 */
export function eat(
  inventory: Inventory,
  target: number | ItemId,
  vitals: VitalsState,
): EatResult | null {
  const id =
    typeof target === 'number'
      ? (inventory.slots[target]?.id ?? null)
      : inventory.has(target)
        ? target
        : null;
  if (id === null || !canEat(vitals, id)) return null;

  const effect = edibleEffect(id);
  if (effect === null) return null;
  const removed =
    typeof target === 'number' ? inventory.removeFromSlot(target, 1) : inventory.remove(id, 1);
  if (!removed) return null;
  return { vitals: applyEdible(vitals, effect), eaten: id };
}
