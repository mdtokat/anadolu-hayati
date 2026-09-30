import type { SurvivalSystem } from '../survival/SurvivalSystem';
import type { VitalsState } from '../survival/vitals';
import { canEat, edibleEffect } from './consume';
import type { Inventory } from './Inventory';
import { ITEM_IDS, type ItemId } from './itemDefs';

/**
 * Envanterden bir adet yiyip `SurvivalSystem.consume` ile göstergelere uygular (`player:ate` yayınlanır).
 * `target`: slot indeksi veya eşya kimliği. Yenemiyorsa (envanterde yok, yiyecek değil, tok, ölü)
 * `null` döner ve envanter değişmez.
 */
export function eatItem(
  inventory: Inventory,
  survival: SurvivalSystem,
  target: number | ItemId,
): ItemId | null {
  if (!survival.alive) return null;
  const id = typeof target === 'number' ? (inventory.slots[target]?.id ?? null) : target;
  if (id === null || !inventory.has(id) || !canEat(survival.state, id)) return null;
  const effect = edibleEffect(id);
  if (effect === null) return null;

  const removed =
    typeof target === 'number' ? inventory.removeFromSlot(target, 1) : inventory.remove(id, 1);
  if (!removed) return null;
  survival.consume(effect, id);
  return id;
}

/** Hızlı yemek için seçim: envanterde olan ve şu an yenebilen yiyeceklerden tokluğu en çok artıran. */
export function bestFood(inventory: Inventory, vitals: VitalsState): ItemId | null {
  let best: ItemId | null = null;
  let bestSatiety = -1;
  for (const id of ITEM_IDS) {
    if (!inventory.has(id) || !canEat(vitals, id)) continue;
    const satiety = edibleEffect(id)?.satiety ?? 0;
    if (satiety > bestSatiety) {
      best = id;
      bestSatiety = satiety;
    }
  }
  return best;
}

export type QuickEatResult =
  { ok: true; item: ItemId } | { ok: false; reason: 'dead' | 'no_food' | 'full' };

/**
 * Hızlı yemek (`F`): en çok tokluk veren yiyeceği yer. Başarısızlık nedeni bildirim içindir:
 * `no_food` envanterde hiç yiyecek yok, `full` yiyecek var ama oyuncu tok.
 */
export function quickEat(inventory: Inventory, survival: SurvivalSystem): QuickEatResult {
  if (!survival.alive) return { ok: false, reason: 'dead' };
  const best = bestFood(inventory, survival.state);
  if (best !== null) {
    const eaten = eatItem(inventory, survival, best);
    if (eaten !== null) return { ok: true, item: eaten };
  }
  const hasFood = ITEM_IDS.some((id) => edibleEffect(id) !== null && inventory.has(id));
  return { ok: false, reason: hasFood ? 'full' : 'no_food' };
}
