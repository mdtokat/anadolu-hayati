import { describe, expect, it, vi } from 'vitest';
import { FOOD, SURVIVAL } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { bestFood, eatItem, quickEat } from '../src/items/eatItem';
import { Inventory } from '../src/items/Inventory';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import { initialVitals } from '../src/survival/vitals';

function setup(satiety = 40) {
  const events = new EventBus<GameEvents>();
  const survival = new SurvivalSystem(events);
  survival.setVitals({ satiety });
  const inventory = new Inventory();
  const ate = vi.fn();
  events.on('player:ate', ate);
  return { survival, inventory, ate };
}

describe('eatItem', () => {
  it('slot indeksiyle yer: adet düşer, tokluk artar, player:ate yayınlanır', () => {
    const { survival, inventory, ate } = setup(40);
    inventory.add('hazelnut', 3);
    const slot = inventory.slots.findIndex((s) => s?.id === 'hazelnut');
    expect(eatItem(inventory, survival, slot)).toBe('hazelnut');
    expect(inventory.count('hazelnut')).toBe(2);
    expect(survival.state.satiety).toBe(44);
    expect(ate).toHaveBeenCalledTimes(1);
  });

  it('eşya kimliğiyle de yer; son adet slotu boşaltır', () => {
    const { survival, inventory } = setup(10);
    inventory.add('chestnut', 1);
    expect(eatItem(inventory, survival, 'chestnut')).toBe('chestnut');
    expect(inventory.count('chestnut')).toBe(0);
    expect(inventory.slots.every((s) => s === null)).toBe(true);
  });

  it('tokken, yiyecek olmayanı, boş slotu ve envanterde olmayanı yemez; envanter değişmez', () => {
    const { survival, inventory, ate } = setup(SURVIVAL.maxValue - FOOD.eatMinDeficit + 1);
    inventory.add('hazelnut', 2);
    inventory.add('stick', 2);
    const version = inventory.version;
    expect(eatItem(inventory, survival, 'hazelnut')).toBeNull(); // tok
    survival.setVitals({ satiety: 20 });
    expect(eatItem(inventory, survival, 'stick')).toBeNull(); // yiyecek değil
    expect(eatItem(inventory, survival, 'blackberry')).toBeNull(); // envanterde yok
    expect(eatItem(inventory, survival, 19)).toBeNull(); // boş slot
    expect(inventory.version).toBe(version);
    expect(ate).not.toHaveBeenCalled();
  });

  it('ölü oyuncu yiyemez', () => {
    const { survival, inventory } = setup(20);
    inventory.add('hazelnut', 1);
    survival.setVitals({ health: 0, hydration: 0 });
    for (let i = 0; i < 600 && survival.alive; i++) {
      survival.update(1 / 60, { activity: 'rest', elevationM: 0, drinking: false });
    }
    expect(survival.alive).toBe(false);
    expect(eatItem(inventory, survival, 'hazelnut')).toBeNull();
    expect(inventory.count('hazelnut')).toBe(1);
  });
});

describe('bestFood', () => {
  const hungry = { ...initialVitals(), satiety: 30 };

  it('tokluğu en çok artıran yiyeceği seçer (kestane > fındık)', () => {
    const inventory = new Inventory();
    inventory.add('hazelnut', 5);
    inventory.add('chestnut', 2);
    inventory.add('blackberry', 9);
    expect(bestFood(inventory, hungry)).toBe('chestnut');
  });

  it('yiyecek yoksa veya tokken null', () => {
    const inventory = new Inventory();
    inventory.add('stick', 3);
    expect(bestFood(inventory, hungry)).toBeNull();
    inventory.add('hazelnut', 1);
    expect(bestFood(inventory, hungry)).toBe('hazelnut');
    expect(bestFood(inventory, { ...hungry, satiety: SURVIVAL.maxValue })).toBeNull();
  });
});

describe('quickEat', () => {
  it('en iyi yiyeceği yer', () => {
    const { survival, inventory } = setup(30);
    inventory.add('hazelnut', 4);
    inventory.add('chestnut', 1);
    expect(quickEat(inventory, survival)).toEqual({ ok: true, item: 'chestnut' });
    expect(inventory.count('chestnut')).toBe(0);
    expect(inventory.count('hazelnut')).toBe(4);
  });

  it('yiyecek yoksa no_food, tokken full, ölüyken dead', () => {
    const { survival, inventory } = setup(30);
    inventory.add('stick', 2);
    expect(quickEat(inventory, survival)).toEqual({ ok: false, reason: 'no_food' });
    inventory.add('hazelnut', 2);
    survival.setVitals({ satiety: SURVIVAL.maxValue });
    expect(quickEat(inventory, survival)).toEqual({ ok: false, reason: 'full' });
    expect(inventory.count('hazelnut')).toBe(2);
    survival.setVitals({ health: 0, hydration: 0 });
    for (let i = 0; i < 600 && survival.alive; i++) {
      survival.update(1 / 60, { activity: 'rest', elevationM: 0, drinking: false });
    }
    expect(quickEat(inventory, survival)).toEqual({ ok: false, reason: 'dead' });
  });
});
