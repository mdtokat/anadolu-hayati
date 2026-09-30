import { describe, expect, it } from 'vitest';
import { LOOT_TABLE, lootFor } from '../src/combat/loot';
import { CREATURE_KINDS } from '../src/creatures/kinds';
import { craft } from '../src/items/craft';
import { Inventory } from '../src/items/Inventory';
import { isItemId, ITEMS } from '../src/items/itemDefs';
import { RECIPES } from '../src/items/recipes';

describe('yük tablosu', () => {
  it('her tür için bir yük var ve başka tür yok', () => {
    expect(Object.keys(LOOT_TABLE).sort()).toEqual([...CREATURE_KINDS].sort());
  });

  it('eşya kimlikleri geçerli, adetler pozitif tam sayı, satırlar tekrarsız', () => {
    for (const kind of CREATURE_KINDS) {
      const stacks = LOOT_TABLE[kind];
      expect(stacks.length, kind).toBeGreaterThan(0);
      const ids = stacks.map((s) => s.id);
      expect(new Set(ids).size, kind).toBe(ids.length);
      for (const { id, count } of stacks) {
        expect(isItemId(id), `${kind}: ${id}`).toBe(true);
        expect(Number.isInteger(count) && count >= 1, `${kind}: ${id}`).toBe(true);
      }
    }
  });

  it('her yük boş envantere sığar', () => {
    for (const kind of CREATURE_KINDS) {
      const inventory = new Inventory();
      for (const { id, count } of LOOT_TABLE[kind]) expect(inventory.add(id, count), kind).toBe(0);
    }
  });

  it('plan §3.5 değerleri: ayı en çok, karaca deri+et, kurt/domuz kemik de verir', () => {
    const count = (kind: (typeof CREATURE_KINDS)[number], id: string) =>
      LOOT_TABLE[kind].find((s) => s.id === id)?.count ?? 0;
    expect(count('roe_deer', 'raw_meat')).toBe(3);
    expect(count('roe_deer', 'bone')).toBe(0);
    expect(count('wild_boar', 'raw_meat')).toBe(4);
    expect(count('wolf', 'bone')).toBe(1);
    expect(count('brown_bear', 'raw_meat')).toBe(8);
    expect(count('brown_bear', 'hide')).toBe(2);
  });

  it('lootFor kopya döner: değiştirmek tabloyu bozmaz', () => {
    const loot = lootFor('wolf');
    loot[0] = { id: 'stick', count: 99 };
    expect(lootFor('wolf')).toEqual(LOOT_TABLE.wolf);
  });

  it('bir leşin verdiği et oyunu tıkamaz: çiğ et toplam ağırlığı makul', () => {
    const grams = LOOT_TABLE.brown_bear.reduce((sum, s) => sum + ITEMS[s.id].weightG * s.count, 0);
    expect(grams).toBeLessThan(10_000);
  });
});

describe('av tarifleri', () => {
  it('taş mızrak dal+taş+kavdan, baltasız üretilir', () => {
    const inv = new Inventory();
    for (const { id, count } of RECIPES.stone_spear.inputs) inv.add(id, count);
    expect(RECIPES.stone_spear.tool).toBeUndefined();
    expect(craft(inv, RECIPES.stone_spear).ok).toBe(true);
    expect(inv.has('stone_spear')).toBe(true);
  });

  it('deri yelek deri+kavdan, balta gerekir', () => {
    const inv = new Inventory();
    for (const { id, count } of RECIPES.hide_vest.inputs) inv.add(id, count);
    expect(craft(inv, RECIPES.hide_vest).ok).toBe(false); // balta yok
    inv.add('stone_axe', 1);
    expect(craft(inv, RECIPES.hide_vest).ok).toBe(true);
    expect(inv.has('hide_vest')).toBe(true);
    expect(inv.has('hide')).toBe(false);
  });
});
