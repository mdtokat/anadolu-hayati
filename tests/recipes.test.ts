import { describe, expect, it } from 'vitest';
import { INVENTORY } from '../src/config';
import { ITEM_IDS, ITEMS, isItemId, type ItemId } from '../src/items/itemDefs';
import { RECIPE_IDS, RECIPE_LIST, RECIPES } from '../src/items/recipes';

describe('tarif tablosu', () => {
  it('her kimliğin tarifi var ve tarif kendi kimliğini taşıyor', () => {
    expect(Object.keys(RECIPES).sort()).toEqual([...RECIPE_IDS].sort());
    for (const id of RECIPE_IDS) expect(RECIPES[id].id).toBe(id);
    expect(RECIPE_LIST).toHaveLength(RECIPE_IDS.length);
  });

  it('adlar dolu; eşya kimlikleri geçerli; adetler pozitif tam sayı', () => {
    for (const r of RECIPE_LIST) {
      expect(r.name.trim().length, r.id).toBeGreaterThan(0);
      expect(r.inputs.length, r.id).toBeGreaterThan(0);
      for (const { id, count } of [...r.inputs, r.output]) {
        expect(isItemId(id), `${r.id}: ${id}`).toBe(true);
        expect(Number.isInteger(count) && count >= 1, `${r.id}: ${id}`).toBe(true);
      }
      if (r.tool) expect(isItemId(r.tool), r.id).toBe(true);
    }
  });

  it('girdi satırları tekrarsız; alet girdi olarak tüketilmez; çıktı girdiyle aynı değil', () => {
    for (const r of RECIPE_LIST) {
      const ids = r.inputs.map((i) => i.id);
      expect(new Set(ids).size, r.id).toBe(ids.length);
      if (r.tool) expect(ids, r.id).not.toContain(r.tool);
      expect(ids, r.id).not.toContain(r.output.id);
    }
  });

  it('çıktı yığın sınırına sığar; yiyecek üretmez (yemek Faz 5 pişirmesiyle)', () => {
    for (const r of RECIPE_LIST) {
      expect(r.output.count, r.id).toBeLessThanOrEqual(ITEMS[r.output.id].stackMax);
      expect(ITEMS[r.output.id].category, r.id).not.toBe('food');
    }
  });

  it('girdiler üretilebilir kaynaklardır (alet/yapı/yiyecek değil)', () => {
    for (const r of RECIPE_LIST) {
      for (const { id } of r.inputs) expect(ITEMS[id].category, `${r.id}: ${id}`).toBe('material');
    }
  });

  it('bir tarifin girdileri boş envantere sığar (ağırlık ve slot)', () => {
    for (const r of RECIPE_LIST) {
      let weight = r.tool ? ITEMS[r.tool].weightG : 0;
      let slots = r.tool ? 1 : 0;
      for (const { id, count } of r.inputs) {
        weight += count * ITEMS[id].weightG;
        slots += Math.ceil(count / ITEMS[id].stackMax);
      }
      expect(weight, r.id).toBeLessThanOrEqual(INVENTORY.maxWeightG);
      expect(slots, r.id).toBeLessThanOrEqual(INVENTORY.slots);
    }
  });

  it('ulaşılabilirlik: elle toplananlardan başlayarak her tarif yapılabilir (plan §2.3)', () => {
    // Elle: dal, taş, kav. Baltayla ek olarak: kütük, kabuk. Avla (leş kesme, Faz 5): deri, kemik.
    const have = new Set<ItemId>(['stick', 'stone', 'tinder', 'hide', 'bone']);
    const axeOnly: ItemId[] = ['log', 'bark'];
    const done = new Set<string>();
    for (let changed = true; changed;) {
      changed = false;
      if (have.has('stone_axe')) {
        for (const id of axeOnly) if (!have.has(id)) have.add(id);
      }
      for (const r of RECIPE_LIST) {
        if (done.has(r.id)) continue;
        if (r.tool && !have.has(r.tool)) continue;
        if (!r.inputs.every((i) => have.has(i.id))) continue;
        done.add(r.id);
        have.add(r.output.id);
        changed = true;
      }
    }
    expect([...done].sort()).toEqual([...RECIPE_IDS].sort());
    expect(have.has('stone_axe')).toBe(true);
  });

  it('balta baltasız üretilebilir olmalı: ilk tarif kütük/kabuk istemez', () => {
    const axe = RECIPES.stone_axe;
    expect(axe.tool).toBeUndefined();
    for (const { id } of axe.inputs) expect(['log', 'bark']).not.toContain(id);
  });

  it('tüm eşya kimlikleri bilinen bir listedendir (tablo ile uyum)', () => {
    for (const r of RECIPE_LIST) {
      for (const { id } of [...r.inputs, r.output]) expect(ITEM_IDS).toContain(id);
    }
  });
});
