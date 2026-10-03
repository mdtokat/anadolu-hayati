import { describe, expect, it } from 'vitest';
import { Hotbar } from '../src/items/hotbar';
import { Inventory } from '../src/items/Inventory';
import { RECIPES } from '../src/items/recipes';
import { heldLabel, hotbarSignature, hotbarViews, unusableHotbarText } from '../src/ui/hotbarView';
import { hotbarUse } from '../src/items/hotbar';
import { ITEMS, ITEM_IDS } from '../src/items/itemDefs';
import { failureText, recipeRow } from '../src/ui/inventoryView';
import {
  dismantlePrompt,
  dismantledToast,
  storagePrompt,
  structureHint,
} from '../src/placement/promptText';

describe('hotbarView', () => {
  it('slotlar: tuş etiketi, ad, adet, eksik ve seçili', () => {
    const bar = new Hotbar();
    const inv = new Inventory();
    bar.assign(0, 'stone_spear');
    bar.assign(1, 'cooked_meat');
    bar.assign(2, 'torch');
    inv.add('stone_spear', 1);
    inv.add('cooked_meat', 3);
    bar.select(0);
    const views = hotbarViews(bar, inv);
    expect(views).toHaveLength(bar.slotCount);
    expect(views[0]).toMatchObject({
      key: '1',
      name: 'Taş Mızrak',
      count: '',
      selected: true,
      missing: false,
    });
    expect(views[1]).toMatchObject({ key: '2', name: 'Pişmiş Et', count: '×3', missing: false });
    expect(views[1]?.title).toContain('kullan');
    expect(views[2]).toMatchObject({ name: 'Meşale', missing: true });
    expect(views[3]).toMatchObject({ key: '4', empty: true, name: '' });
    expect(heldLabel(bar, inv)).toBe('Elde: Taş Mızrak');
    bar.select(2);
    expect(heldLabel(bar, inv)).toBe(''); // envanterde yok
  });

  it('imza kısayol ya da envanter değişince değişir', () => {
    const bar = new Hotbar();
    const inv = new Inventory();
    const a = hotbarSignature(bar, inv);
    inv.add('stick', 1);
    const b = hotbarSignature(bar, inv);
    bar.select(1);
    expect(new Set([a, b, hotbarSignature(bar, inv)]).size).toBe(3);
  });
});

describe('inşa metinleri', () => {
  it('istasyon satırı ve nedeni', () => {
    const inv = new Inventory();
    const row = recipeRow(inv, RECIPES.storage_chest);
    expect(row.station).toEqual({ name: 'Çalışma Tezgâhı', ok: false });
    expect(row.reason).toBe('Çalışma Tezgâhı yanında üretilir');
    const near = recipeRow(inv, RECIPES.storage_chest, {
      stations: new Set(['workbench'] as const),
    });
    expect(near.station?.ok).toBe(true);
    expect(near.reason).toMatch(/^Taş Balta gerekir|^Eksik/);
    expect(recipeRow(inv, RECIPES.torch).station).toBeNull();
    expect(
      failureText({ ok: false, reason: 'missing_station', missing: [], station: 'workbench' }),
    ).toBe('Çalışma Tezgâhı yanında üretilir');
  });

  it('sandık, sökme ve yapı ipuçları', () => {
    expect(storagePrompt('storage_chest')).toBe('E: Sandığı aç · X (basılı tut): sök');
    expect(structureHint('workbench')).toBe(
      'Çalışma Tezgâhı · I: tezgâhta üret · X (basılı tut): sök',
    );
    expect(structureHint('campfire')).toBe('Kamp Ateşi · X (basılı tut): sök');
    const offer = { id: 1, kind: 'storage_chest' as const, items: [] };
    expect(dismantlePrompt({ ...offer, status: 'ready' })).toBe('Sökülüyor: Sandık');
    expect(dismantlePrompt({ ...offer, status: 'not_empty' })).toBe('Önce sandık boşaltılmalı');
    expect(dismantlePrompt({ ...offer, status: 'no_space' })).toMatch(/^Envanterde yer yok/);
    expect(dismantledToast([{ id: 'stone', count: 4 }])).toBe('Söküldü: +4 Taş');
  });

  it('doğrudan kullanılamayan eşyalar: eşyaya göre açıklama (yalnız boş kap "doldur" der)', () => {
    expect(unusableHotbarText('water_container_empty')).toBe(
      `${ITEMS.water_container_empty.name}: tatlı su kenarında E ile doldur`,
    );
    expect(unusableHotbarText('backpack_large')).toMatch(/sırtında taşınır/);
    expect(unusableHotbarText('bulgur')).toMatch(/çiğ yenmez.*pişir.*Bakır Tencere gerekir/);
    for (const id of ITEM_IDS) {
      if (hotbarUse(id) !== 'none' || id === 'water_container_empty') continue;
      expect(unusableHotbarText(id), id).not.toMatch(/doldur/);
    }
  });
});
