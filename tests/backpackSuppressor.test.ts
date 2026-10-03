import { describe, expect, it } from 'vitest';
import { BACKPACKS, INVENTORY, RANGED } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { RangedSystem } from '../src/combat/RangedSystem';
import { backpackBonus } from '../src/items/backpack';
import { Inventory } from '../src/items/Inventory';
import { hotbarUse } from '../src/items/hotbar';
import { WeaponState, canSuppress } from '../src/items/weaponState';
import { transferAll } from '../src/placement/storage';
import { migrateSave, parseSave, SAVE_FORMAT_VERSION } from '../src/save/saveGame';

describe('sırt çantaları', () => {
  it('en büyük çanta geçerli (üst üste binmez)', () => {
    const counts: Record<string, number> = { backpack_small: 1, backpack_large: 1 };
    expect(backpackBonus((id) => counts[id] ?? 0)).toEqual(BACKPACKS.backpack_large);
    expect(backpackBonus(() => 0)).toEqual({ slots: 0, weightG: 0 });
  });

  it('çanta slot ve ağırlık sınırını artırır; kilitli slotlara eşya konmaz', () => {
    const inv = new Inventory({ backpacks: true });
    expect(inv.activeSlots).toBe(INVENTORY.slots);
    expect(inv.maxWeightG).toBe(INVENTORY.maxWeightG);
    // Çantasız: 20 slot dolunca fazlası sığmaz.
    expect(inv.add('hide', 5 * 20 + 3)).toBeGreaterThan(0);
    expect(inv.slots.slice(INVENTORY.slots).every((s) => s === null)).toBe(true);
    const roomy = new Inventory({ backpacks: true });
    expect(roomy.add('backpack_medium', 1)).toBe(0);
    expect(roomy.activeSlots).toBe(INVENTORY.slots + BACKPACKS.backpack_medium.slots);
    expect(roomy.maxWeightG).toBe(INVENTORY.maxWeightG + BACKPACKS.backpack_medium.weightG);
    expect(hotbarUse('backpack_medium')).toBe('none');
  });

  it('dolu çanta çıkarılamaz; boşalınca çıkar', () => {
    const inv = new Inventory({ backpacks: true });
    inv.add('backpack_small', 1);
    // Tüm aktif slotları taşa doldur (20 + 4 slot; taş 10'lu, 500 g: ağırlık sınırı 33 kg → 66 taş).
    inv.add('stone', 1000);
    expect(inv.remove('backpack_small', 1)).toBe(false);
    const slot = inv.slots.findIndex((s) => s?.id === 'backpack_small');
    expect(inv.removeFromSlot(slot, 1)).toBeNull();
    inv.remove('stone', inv.count('stone'));
    expect(inv.remove('backpack_small', 1)).toBe(true);
  });

  it('sandığa "hepsini koy": çanta en son taşınır', () => {
    const inv = new Inventory({ backpacks: true });
    inv.add('backpack_large', 1);
    inv.add('log', 9);
    const chest = new Inventory({ slots: 16, maxWeightG: 60_000 });
    transferAll(inv, chest);
    expect(inv.count('log')).toBe(0);
    expect(chest.count('backpack_large')).toBe(1);
  });

  it('sandıktan "hepsini al": çanta önce alınır, açtığı yere diğer eşyalar da sığar', () => {
    const chest = new Inventory({ slots: 16, maxWeightG: 60_000 });
    chest.add('log', 10); // 30 kg: çantasız sınırı (25 kg) aşar, çantayla (50 kg) sığar
    chest.add('backpack_large', 1);
    const inv = new Inventory({ backpacks: true });
    transferAll(chest, inv);
    expect(inv.count('backpack_large')).toBe(1);
    expect(inv.count('log')).toBe(10);
    expect(chest.slots.every((s) => s === null)).toBe(true);
  });

  it('eski 20 slotluk kayıt çantalı envantere yüklenir; kopya ayarları korur', () => {
    const old = new Inventory({ slots: INVENTORY.slots });
    old.add('stick', 5);
    const inv = new Inventory({ backpacks: true });
    inv.loadSave(old.toJSON());
    expect(inv.count('stick')).toBe(5);
    expect(inv.slotCount).toBeGreaterThan(INVENTORY.slots);
    inv.add('backpack_small', 1);
    const copy = inv.clone();
    expect(copy.activeSlots).toBe(inv.activeSlots);
    expect(copy.toJSON()).toEqual(inv.toJSON());
  });
});

describe('susturucu', () => {
  it('yalnızca tabanca ve tüfeklere takılır; kayıtta kalır', () => {
    expect(canSuppress('pistol')).toBe(true);
    expect(canSuppress('shotgun')).toBe(false);
    const w = new WeaponState();
    expect(w.setSuppressed('bow', true)).toBe(false);
    expect(w.setSuppressed('rifle', true)).toBe(true);
    const copy = new WeaponState();
    copy.loadSave(w.toSave());
    expect(copy.suppressed('rifle')).toBe(true);
    expect(copy.toSave().suppressed).toEqual(['rifle']);
  });

  it('susturuculu atış gürültüsü kısıktır', () => {
    const events = new EventBus<GameEvents>();
    const noises: number[] = [];
    const fired: Array<boolean | undefined> = [];
    events.on('noise:made', (e) => noises.push(e.radius));
    events.on('weapon:fired', (e) => fired.push(e.suppressed));
    const inv = new Inventory({ backpacks: true });
    inv.add('pistol', 1);
    const weapons = new WeaponState();
    const survival = {
      alive: true,
      state: { energy: 100, exhausted: false },
      spendEnergy: () => undefined,
    } as unknown as ConstructorParameters<typeof RangedSystem>[3];
    const ranged = new RangedSystem(events, inv, weapons, survival, () => 0.5);
    const input = {
      held: 'pistol' as const,
      aiming: false,
      steady: false,
      moving: false,
      running: false,
    };
    const world = { heightAt: () => -100, targets: { targetsNear: () => [], applyHit: () => {} } };
    const pose = { x: 0, y: 2, z: 0, yaw: 0, pitch: 0 };
    ranged.update(1 / 60, input);
    weapons.set('pistol', 5);
    expect(ranged.fire(pose, world as never).status).toBe('fired');
    for (let i = 0; i < 300; i++) ranged.update(1 / 60, input);
    weapons.setSuppressed('pistol', true);
    const result = ranged.fire(pose, world as never);
    expect(result.status).toBe('fired');
    expect(result.suppressed).toBe(true);
    expect(noises[1]).toBeCloseTo(noises[0]! * RANGED.suppressor.noiseFactor, 6);
    expect(fired).toEqual([false, true]);
  });

  it('v6 kaydı v7e göç eder (susturucu yok)', () => {
    expect(SAVE_FORMAT_VERSION).toBe(8);
    const raw = migrateSave({ version: 6, weapons: { loaded: { pistol: 2 } } }) as {
      weapons: { suppressed: unknown };
    };
    expect(raw.weapons.suppressed).toEqual([]);
    expect(() => parseSave({ version: 99 })).toThrow();
  });
});
