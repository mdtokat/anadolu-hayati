import { describe, expect, it } from 'vitest';
import { INVENTORY, WATER_CONTAINER } from '../src/config';
import { Inventory } from '../src/items/Inventory';
import { RECIPE_LIST, RECIPES } from '../src/items/recipes';
import {
  capacityText,
  failureText,
  formatWeight,
  recipeRow,
  recipeRows,
  slotView,
} from '../src/ui/inventoryView';

describe('formatWeight / capacityText', () => {
  it('gramı Türkçe kg biçiminde yazar', () => {
    expect(formatWeight(0)).toBe('0,0 kg');
    expect(formatWeight(4200)).toBe('4,2 kg');
    expect(formatWeight(25_000)).toBe('25,0 kg');
  });

  it('ağırlık ve slot sayısını gösterir', () => {
    const inventory = new Inventory();
    expect(capacityText(inventory)).toBe(
      `Ağırlık 0,0 kg / ${formatWeight(INVENTORY.maxWeightG)} · Slot 0/${INVENTORY.slots}`,
    );
    inventory.add('stone', 12); // 10 + 2 → iki slot, 6 kg
    expect(capacityText(inventory)).toContain('Ağırlık 6,0 kg');
    expect(capacityText(inventory)).toContain(`Slot 2/${INVENTORY.slots}`);
  });
});

describe('slotView', () => {
  it('boş slot', () => {
    expect(slotView(null)).toMatchObject({
      empty: true,
      name: '',
      count: '',
      id: null,
      edible: false,
    });
  });

  it('ad, adet etiketi (tek adette yok) ve ipucu metni', () => {
    const many = slotView({ id: 'hazelnut', count: 12 });
    expect(many).toMatchObject({ empty: false, name: 'Fındık', count: '×12', edible: true });
    expect(many.title).toContain('Fındık ×12');
    expect(many.title).toContain('0,4 kg'); // 12 × 30 g = 360 g
    expect(many.title).toContain('Tokluk +4');
    const one = slotView({ id: 'stone_axe', count: 1 });
    expect(one.count).toBe('');
    expect(one.edible).toBe(false);
    expect(one.title).not.toContain('Tokluk');
  });

  it('böğürtlenin su etkisi de yazılır', () => {
    expect(slotView({ id: 'blackberry', count: 2 }).title).toContain('Su +2');
  });

  it('dolu su kabı içilebilir, boşu değil', () => {
    const full = slotView({ id: 'water_container_full', count: 1 });
    expect(full).toMatchObject({ drinkable: true, edible: false });
    expect(full.title).toContain(`Su +${WATER_CONTAINER.drinkHydration}`);
    expect(slotView({ id: 'water_container_empty', count: 1 }).drinkable).toBe(false);
  });
});

describe('recipeRows', () => {
  it('her tarif için bir satır, tarif sırasıyla', () => {
    const rows = recipeRows(new Inventory());
    expect(rows.map((r) => r.id)).toEqual(RECIPE_LIST.map((r) => r.id));
  });

  it('boş envanterde hiçbiri yapılamaz; malzeme satırlarında elde/gerekli doğru', () => {
    const row = recipeRow(new Inventory(), RECIPES.stone_axe);
    expect(row.craftable).toBe(false);
    expect(row.inputs).toEqual([
      { name: 'Dal', need: 2, have: 0, ok: false },
      { name: 'Taş', need: 2, have: 0, ok: false },
      { name: 'Kav', need: 3, have: 0, ok: false },
    ]);
    expect(row.reason).toBe('Eksik: 2 Dal, 2 Taş, 3 Kav');
    expect(row.output).toBe('Taş Balta');
  });

  it('malzeme tamamlanınca yapılabilir ve neden boştur', () => {
    const inventory = new Inventory();
    inventory.add('stick', 2);
    inventory.add('stone', 2);
    inventory.add('tinder', 3);
    const row = recipeRow(inventory, RECIPES.stone_axe);
    expect(row.craftable).toBe(true);
    expect(row.reason).toBe('');
    expect(row.inputs.every((i) => i.ok)).toBe(true);
  });

  it('alet gerektiren tarif: alet yoksa neden "gerekir", varsa alet satırı tamam', () => {
    const inventory = new Inventory();
    inventory.add('log', 3);
    inventory.add('stick', 8);
    inventory.add('bark', 10);
    const without = recipeRow(inventory, RECIPES.lean_to);
    expect(without.tool).toEqual({ name: 'Taş Balta', ok: false });
    expect(without.craftable).toBe(false);
    expect(without.reason).toBe('Taş Balta gerekir');
    inventory.add('stone_axe', 1);
    const withAxe = recipeRow(inventory, RECIPES.lean_to);
    expect(withAxe.tool).toEqual({ name: 'Taş Balta', ok: true });
    expect(withAxe.craftable).toBe(true);
  });

  it('çıktıya yer yoksa "Envanterde yer yok" der', () => {
    // 4 slot: dal (1), taş 20 (2), kav (1). Tarif malzemeyi düşünce hiçbir slot boşalmaz → balta sığmaz.
    const tight = new Inventory({ slots: 4, maxWeightG: 25_000 });
    tight.add('stick', 5);
    tight.add('stone', 20);
    tight.add('tinder', 10);
    expect(tight.slots.filter((s) => s !== null)).toHaveLength(4);
    const row = recipeRow(tight, RECIPES.stone_axe);
    expect(row.craftable).toBe(false);
    expect(row.reason).toBe('Envanterde yer yok');
  });

  it('failureText her başarısızlık nedenini karşılar', () => {
    expect(
      failureText({ ok: false, reason: 'missing_tool', missing: [{ id: 'stone_axe', count: 1 }] }),
    ).toBe('Taş Balta gerekir');
    expect(
      failureText({ ok: false, reason: 'missing_inputs', missing: [{ id: 'bark', count: 4 }] }),
    ).toBe('Eksik: 4 Kabuk');
    expect(failureText({ ok: false, reason: 'no_space', missing: [] })).toBe('Envanterde yer yok');
  });
});
