import { COOK_RECIPES } from '../src/combat/cooking';
import { describe, expect, it } from 'vitest';
import { FOOD, INVENTORY } from '../src/config';
import { ITEM_IDS, ITEMS, isItemId } from '../src/items/itemDefs';
import { PIECE_KINDS } from '../src/placement/pieces';

describe('eşya tablosu', () => {
  it('her kimliğin tanımı var ve tanım kendi kimliğini taşıyor', () => {
    expect(Object.keys(ITEMS).sort()).toEqual([...ITEM_IDS].sort());
    for (const id of ITEM_IDS) expect(ITEMS[id].id).toBe(id);
  });

  it('ad boş değil, ağırlık ve yığın sınırı pozitif tam sayı', () => {
    for (const id of ITEM_IDS) {
      const def = ITEMS[id];
      expect(def.name.trim().length, id).toBeGreaterThan(0);
      expect(Number.isInteger(def.weightG) && def.weightG > 0, id).toBe(true);
      expect(Number.isInteger(def.stackMax) && def.stackMax >= 1, id).toBe(true);
    }
  });

  it('alet ve yerleştirilebilir yapıların yığın sınırı 1 (modüler parçalar hariç: art arda kurulur)', () => {
    for (const id of ITEM_IDS) {
      if ((PIECE_KINDS as readonly string[]).includes(id)) continue;
      if (ITEMS[id].category === 'tool' || ITEMS[id].category === 'placeable') {
        expect(ITEMS[id].stackMax, id).toBe(1);
      }
    }
  });

  it('yenebilir etkiler 0–100 aralığında; yiyecek kategorisi yenebilir, diğerleri değil', () => {
    for (const id of ITEM_IDS) {
      const def = ITEMS[id];
      // Çiğ erzak (Faz 10) yiyecektir ama tencerede pişirilmeden yenmez.
      const raw = COOK_RECIPES.some((r) => r.requires && r.from === id);
      expect(def.category === 'food' && !raw, id).toBe(def.edible !== undefined);
      if (!def.edible) continue;
      const values = [
        def.edible.satiety,
        def.edible.hydration,
        def.edible.health,
        def.edible.energy,
      ].filter((v): v is number => v !== undefined);
      expect(values.length, id).toBeGreaterThan(0);
      for (const v of values) expect(v >= -100 && v <= 100, id).toBe(true);
      // Yalnızca tokluk/su negatif olamaz; can negatif olabilir (çiğ et).
      expect(def.edible.satiety ?? 0, id).toBeGreaterThanOrEqual(0);
      expect(def.edible.hydration ?? 0, id).toBeGreaterThanOrEqual(0);
    }
  });

  it('av ürünleri: çiğ et riskli ve az doyurur, pişmiş et çok doyurur ve iyileştirir', () => {
    const raw = ITEMS.raw_meat.edible;
    const cooked = ITEMS.cooked_meat.edible;
    expect(raw?.health ?? 0).toBeLessThan(0);
    expect(cooked?.health ?? 0).toBeGreaterThan(0);
    expect(cooked?.satiety ?? 0).toBeGreaterThan(raw?.satiety ?? 0);
    expect(ITEMS.hide.category).toBe('material');
    expect(ITEMS.bone.category).toBe('material');
  });

  it('bir slot ağırlık sınırını tek başına aşmaz (her eşyadan en az bir yığın taşınabilir)', () => {
    for (const id of ITEM_IDS) {
      expect(ITEMS[id].weightG, id).toBeLessThanOrEqual(INVENTORY.maxWeightG);
    }
  });

  it('isItemId yalnızca bilinen kimlikleri kabul eder', () => {
    expect(isItemId('stick')).toBe(true);
    expect(isItemId('unknown')).toBe(false);
    expect(isItemId(3)).toBe(false);
  });

  it('config: envanter ve yemek ayarları makul', () => {
    expect(Number.isInteger(INVENTORY.slots) && INVENTORY.slots > 0).toBe(true);
    expect(Number.isInteger(INVENTORY.maxWeightG) && INVENTORY.maxWeightG > 0).toBe(true);
    expect(FOOD.eatMinDeficit).toBeGreaterThan(0);
  });
});
