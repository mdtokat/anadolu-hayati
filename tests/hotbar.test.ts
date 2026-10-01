import { describe, expect, it } from 'vitest';
import { HOTBAR, INPUT } from '../src/config';
import { Hotbar, hotbarUse, isHoldable, isHotbarItem } from '../src/items/hotbar';
import { ITEM_IDS, ITEMS } from '../src/items/itemDefs';

describe('Hotbar: kurallar', () => {
  it('slot sayısı kısayol tuşu sayısıdır; malzemeler kısayola konamaz', () => {
    expect(HOTBAR.slots).toBe(INPUT.bindings.hotbar.length);
    expect(new Hotbar().slotCount).toBe(HOTBAR.slots);
    for (const id of ITEM_IDS) {
      expect(isHotbarItem(id)).toBe(ITEMS[id].category !== 'material');
    }
  });

  it('kullanım: yapı yerleştirilir, silah/alet elde tutulur, yiyecek ve dolu kap tüketilir', () => {
    expect(hotbarUse('storage_chest')).toBe('place');
    expect(hotbarUse('wooden_hut')).toBe('place');
    expect(hotbarUse('stone_spear')).toBe('hold');
    expect(hotbarUse('torch')).toBe('hold');
    expect(hotbarUse('cooked_meat')).toBe('consume');
    expect(hotbarUse('water_container_full')).toBe('consume');
    expect(hotbarUse('water_container_empty')).toBe('none');
    expect(isHoldable('bone_knife')).toBe(true);
    expect(isHoldable('hazelnut')).toBe(false);
  });
});

describe('Hotbar: bağlama ve seçim', () => {
  it('bir eşya tek slota bağlıdır: başka slota bağlanınca eskisi boşalır', () => {
    const bar = new Hotbar();
    expect(bar.assign(0, 'stone_axe')).toBe(true);
    expect(bar.assign(3, 'stone_axe')).toBe(true);
    expect(bar.slots[0]).toBeNull();
    expect(bar.slotOf('stone_axe')).toBe(3);
    expect(bar.assign(1, 'stick')).toBe(false);
    expect(bar.slots[1]).toBeNull();
    bar.assign(3, null);
    expect(bar.slotOf('stone_axe')).toBeNull();
  });

  it('autoAssign: yalnızca elde tutulanlar, ilk boş slota, bağlıysa tekrar bağlamaz', () => {
    const bar = new Hotbar(3);
    bar.assign(0, 'hazelnut');
    expect(bar.autoAssign('cooked_meat')).toBeNull();
    expect(bar.autoAssign('stone_spear')).toBe(1);
    expect(bar.autoAssign('stone_spear')).toBeNull();
    expect(bar.autoAssign('campfire')).toBe(2);
    expect(bar.autoAssign('torch')).toBeNull(); // dolu
  });

  it('seçim ve tekerlek: sarar; seçim yokken ileri ilk, geri son slottan başlar', () => {
    const bar = new Hotbar(4);
    bar.assign(2, 'stone_spear');
    expect(bar.selectedItem).toBeNull();
    bar.select(2);
    expect(bar.selectedItem).toBe('stone_spear');
    expect(bar.cycle(1)).toBe(3);
    expect(bar.cycle(1)).toBe(0);
    expect(bar.cycle(-1)).toBe(3);
    bar.select(null);
    expect(bar.cycle(1)).toBe(0);
    bar.select(null);
    expect(bar.cycle(-1)).toBe(3);
    expect(() => bar.select(4)).toThrow(RangeError);
  });

  it('version her değişimde artar, değişmeyende artmaz', () => {
    const bar = new Hotbar();
    const v0 = bar.version;
    bar.assign(0, 'torch');
    const v1 = bar.version;
    expect(v1).toBeGreaterThan(v0);
    bar.assign(0, 'torch');
    bar.select(null);
    expect(bar.version).toBe(v1);
    bar.select(0);
    expect(bar.version).toBeGreaterThan(v1);
  });
});

describe('Hotbar: kayıt', () => {
  it('toSave → loadSave aynı durumu verir', () => {
    const bar = new Hotbar();
    bar.assign(0, 'stone_axe');
    bar.assign(4, 'storage_chest');
    bar.select(4);
    const copy = new Hotbar();
    copy.loadSave(JSON.parse(JSON.stringify(bar.toSave())));
    expect(copy.toSave()).toEqual(bar.toSave());
    expect(copy.selectedItem).toBe('storage_chest');
  });

  it.each([
    ['nesne değil', null],
    ['slot sayısı', { slots: [null], selected: null }],
    [
      'bilinmeyen eşya',
      { slots: ['laser', ...Array(HOTBAR.slots - 1).fill(null)], selected: null },
    ],
    ['malzeme', { slots: ['stick', ...Array(HOTBAR.slots - 1).fill(null)], selected: null }],
    [
      'yinelenen',
      { slots: ['torch', 'torch', ...Array(HOTBAR.slots - 2).fill(null)], selected: null },
    ],
    ['seçim sınır dışı', { slots: Array(HOTBAR.slots).fill(null), selected: HOTBAR.slots }],
    ['seçim tam sayı değil', { slots: Array(HOTBAR.slots).fill(null), selected: 0.5 }],
  ])('bozuk kayıt (%s) reddedilir ve durum değişmez', (_name, data) => {
    const bar = new Hotbar();
    bar.assign(1, 'torch');
    const before = bar.toSave();
    expect(() => bar.loadSave(data)).toThrow();
    expect(bar.toSave()).toEqual(before);
  });
});
