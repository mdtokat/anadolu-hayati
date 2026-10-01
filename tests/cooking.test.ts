import { describe, expect, it, vi } from 'vitest';
import { CookingSystem } from '../src/combat/cooking';
import { cookPrompt, cookedToast } from '../src/combat/promptText';
import { COOKING, FIRE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory } from '../src/items/Inventory';
import { StructureSet } from '../src/placement/structures';

const DT = 1 / 60;

function setup() {
  const events = new EventBus<GameEvents>();
  const cooked = vi.fn();
  events.on('item:cooked', cooked);
  const inventory = new Inventory();
  const structures = new StructureSet();
  const fire = structures.add('campfire', 0, 0, 0);
  const cooking = new CookingSystem(events, inventory, structures);
  return { events, cooked, inventory, structures, fire, cooking };
}

function hold(cooking: CookingSystem, seconds: number, pos = { x: 1, z: 0 }, alive = true): void {
  for (let t = 0; t < seconds; t += DT) cooking.update(DT, true, pos, alive);
}

describe('CookingSystem', () => {
  it('çiğ et yoksa, ateş uzaktaysa ya da sönükse teklif yok', () => {
    const { cooking, inventory, structures, fire } = setup();
    cooking.update(DT, false, { x: 1, z: 0 });
    expect(cooking.offer).toBeNull(); // et yok
    inventory.add('raw_meat', 1);
    cooking.update(DT, false, { x: FIRE.refuelReach + 0.01, z: 0 });
    expect(cooking.offer).toBeNull(); // uzak
    cooking.update(DT, false, { x: FIRE.refuelReach, z: 0 });
    expect(cooking.offer).toMatchObject({ fireId: fire.id, seconds: COOKING.seconds });
    structures.update(FIRE.burnSeconds + 1);
    cooking.update(DT, false, { x: 1, z: 0 });
    expect(cooking.offer).toBeNull(); // sönük
  });

  it('süre dolunca bir çiğ et pişmiş ete döner, olay bir kez yayınlanır', () => {
    const { cooking, inventory, cooked } = setup();
    inventory.add('raw_meat', 2);
    hold(cooking, COOKING.seconds - 0.2);
    expect(inventory.count('cooked_meat')).toBe(0);
    expect(cooking.progress).toBeGreaterThan(0.9);
    hold(cooking, 0.4);
    expect(inventory.count('raw_meat')).toBe(1);
    expect(inventory.count('cooked_meat')).toBe(1);
    expect(cooked).toHaveBeenCalledTimes(1);
    expect(cooked).toHaveBeenCalledWith({ from: 'raw_meat', item: 'cooked_meat', count: 1 });
  });

  it('tuş basılı kaldıkça sıradaki ete geçer; et bitince durur', () => {
    const { cooking, inventory, cooked } = setup();
    inventory.add('raw_meat', 2);
    hold(cooking, COOKING.seconds * 3);
    expect(inventory.count('cooked_meat')).toBe(2);
    expect(inventory.count('raw_meat')).toBe(0);
    expect(cooked).toHaveBeenCalledTimes(2);
    expect(cooking.offer).toBeNull();
  });

  it('tuş bırakılınca ilerleme sıfırlanır', () => {
    const { cooking, inventory } = setup();
    inventory.add('raw_meat', 1);
    hold(cooking, COOKING.seconds - 0.5);
    cooking.update(DT, false, { x: 1, z: 0 });
    expect(cooking.progress).toBe(0);
    hold(cooking, COOKING.seconds - 0.5);
    expect(inventory.count('cooked_meat')).toBe(0);
  });

  it('ateş sönünce pişirme iptal olur, et harcanmaz', () => {
    const { cooking, inventory, structures } = setup();
    inventory.add('raw_meat', 1);
    hold(cooking, COOKING.seconds - 0.5);
    structures.update(FIRE.burnSeconds + 1);
    hold(cooking, 2);
    expect(inventory.count('raw_meat')).toBe(1);
    expect(inventory.count('cooked_meat')).toBe(0);
    expect(cooking.progress).toBe(0);
  });

  it('pişmiş et sığmıyorsa teklif `full` olur, döngüye girmez ve et harcanmaz', () => {
    const { cooking, inventory, cooked } = setup();
    // 2 çiğ et + 19 slot kav: biri çıkınca slot boşalmaz, pişmiş ete yer yok.
    inventory.add('raw_meat', 2);
    inventory.add('tinder', 19 * 30);
    expect(inventory.slots.every((s) => s !== null)).toBe(true);
    expect(inventory.canExchange('raw_meat', 'cooked_meat')).toBe(false);
    hold(cooking, COOKING.seconds * 2);
    expect(cooking.offer?.status).toBe('full');
    expect(cooking.progress).toBe(0);
    expect(inventory.count('raw_meat')).toBe(2);
    expect(cooked).not.toHaveBeenCalled();
  });

  it('son çiğ et tek başına bir slottaysa, slot boşalacağından pişebilir', () => {
    const { cooking, inventory } = setup();
    inventory.add('raw_meat', 1);
    inventory.add('tinder', 19 * 30);
    expect(inventory.slots.every((s) => s !== null)).toBe(true);
    cooking.update(DT, false, { x: 1, z: 0 });
    expect(cooking.offer?.status).toBe('ready');
    hold(cooking, COOKING.seconds + 0.1);
    expect(inventory.count('cooked_meat')).toBe(1);
    expect(inventory.count('raw_meat')).toBe(0);
  });

  it('ölü oyuncu pişirmez', () => {
    const { cooking, inventory } = setup();
    inventory.add('raw_meat', 1);
    hold(cooking, COOKING.seconds + 1, { x: 1, z: 0 }, false);
    expect(inventory.count('cooked_meat')).toBe(0);
    expect(cooking.offer).toBeNull();
  });
});

describe('pişirme metinleri', () => {
  it('yakıt varsa öncelik kuralını söyler', () => {
    expect(cookPrompt(false)).toBe('E (basılı tut): Eti pişir');
    expect(cookPrompt(true)).toContain('yakıt');
    expect(cookedToast(1)).toBe('Pişti: Pişmiş Et');
    expect(cookPrompt(true, 'full')).toContain('Envanter dolu');
  });
});
