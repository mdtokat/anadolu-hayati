import { isBackpack } from '../items/backpack';
import type { Inventory } from '../items/Inventory';

/**
 * Bir slottaki yığını başka bir envantere taşır (sandık ↔ oyuncu; saf). Sığdığı kadarı taşınır (slot ve ağırlık
 * sınırı), kalan kaynakta kalır. Taşınan adedi döndürür (slot boşsa ya da hiç sığmıyorsa 0; değişiklik yok).
 */
export function transferSlot(from: Inventory, slot: number, to: Inventory): number {
  const stack = from.slots[slot] ?? null;
  if (stack === null) return 0;
  const moved = Math.min(stack.count, to.capacityFor(stack.id));
  if (moved === 0) return 0;
  const taken = from.removeFromSlot(slot, moved);
  if (!taken) return 0;
  to.add(taken.id, taken.count);
  return moved;
}

/** Kaynaktaki bütün yığınları sığdığı kadar hedefe taşır; toplam taşınan adedi döndürür. */
export function transferAll(from: Inventory, to: Inventory): number {
  let total = 0;
  // Sırt çantaları envanterden en son çıkar (dolu çanta çıkarılamaz, önce içindekiler boşalsın), envantere ise önce
  // girer (çanta yer açar, ardından gelen eşyalar da sığsın).
  const order = to.backpacks ? [true, false] : [false, true];
  for (const backpacks of order) {
    for (let slot = 0; slot < from.slotCount; slot++) {
      const stack = from.slots[slot] ?? null;
      if (stack === null || isBackpack(stack.id) !== backpacks) continue;
      total += transferSlot(from, slot, to);
    }
  }
  return total;
}
