import type { CreatureKind } from '../creatures/kinds';
import type { ItemStack } from '../items/Inventory';

/**
 * Leş kesince alınan eşyalar (docs/faz-5-paralel-plan.md §3.5; veri). Yalnızca `CreatureKind` tipine bağlıdır:
 * tür tablosunu (`creatures/species.ts`, Hesap A) import etmez. Miktarlar sabittir (rastgelelik yok); denge
 * elle ayarlanır.
 */
export const LOOT_TABLE: Readonly<Record<CreatureKind, ReadonlyArray<ItemStack>>> = {
  roe_deer: [
    { id: 'raw_meat', count: 3 },
    { id: 'hide', count: 1 },
  ],
  wild_boar: [
    { id: 'raw_meat', count: 4 },
    { id: 'hide', count: 1 },
    { id: 'bone', count: 1 },
  ],
  wolf: [
    { id: 'raw_meat', count: 2 },
    { id: 'hide', count: 1 },
    { id: 'bone', count: 1 },
  ],
  brown_bear: [
    { id: 'raw_meat', count: 8 },
    { id: 'hide', count: 2 },
    { id: 'bone', count: 2 },
  ],
};

/** Türün leşinden çıkan eşyalar (kopya; çağıran değiştirebilir). */
export function lootFor(kind: CreatureKind): ItemStack[] {
  return LOOT_TABLE[kind].map((stack) => ({ ...stack }));
}
