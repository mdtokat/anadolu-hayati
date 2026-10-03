import type { CreatureKind } from '../creatures/kinds';
import type { ItemStack } from '../items/Inventory';

/**
 * Leş kesince alınan eşyalar (docs/faz-5-paralel-plan.md §3.5; veri). Yalnızca `CreatureKind` tipine bağlıdır:
 * tür tablosunu (`creatures/species.ts`, Hesap A) import etmez. Miktarlar sabittir (rastgelelik yok); denge
 * elle ayarlanır.
 *
 * Faz 10 — helal/haram (İslami yeme kuralları, Hanefî): karaca, kızıl geyik, yabani tavşan ve sülünün eti yenir. Domuz eti haramdır ve
 * domuz necistir (derisi tabaklansa da temizlenmez): yaban domuzu leşi kesilmez (boş tablo). Kurt ve ayı yırtıcıdır,
 * etleri haramdır; derileri tabaklanınca kullanılır, kemikleri alınır. Tilki de yırtıcıdır: yalnız postu alınır.
 */
export const LOOT_TABLE: Readonly<Record<CreatureKind, ReadonlyArray<ItemStack>>> = {
  roe_deer: [
    { id: 'raw_meat', count: 3 },
    { id: 'hide', count: 1 },
  ],
  wild_boar: [],
  wolf: [
    { id: 'hide', count: 1 },
    { id: 'bone', count: 1 },
  ],
  brown_bear: [
    { id: 'hide', count: 2 },
    { id: 'bone', count: 2 },
  ],
  // Geyik, tavşan ve sülün helaldir (eti yenir); tilki yırtıcıdır, yalnız postu alınır.
  red_deer: [
    { id: 'raw_meat', count: 5 },
    { id: 'hide', count: 2 },
    { id: 'bone', count: 1 },
  ],
  red_fox: [{ id: 'hide', count: 1 }],
  hare: [{ id: 'raw_meat', count: 1 }],
  pheasant: [{ id: 'raw_meat', count: 1 }],
};

/** Leşi kesilebilir mi (helal kesim ya da kullanılabilir derisi var mı)? Yaban domuzu kesilmez. */
export function isButcherable(kind: CreatureKind): boolean {
  return LOOT_TABLE[kind].length > 0;
}

/** Türün leşinden çıkan eşyalar (kopya; çağıran değiştirebilir). */
export function lootFor(kind: CreatureKind): ItemStack[] {
  return LOOT_TABLE[kind].map((stack) => ({ ...stack }));
}
