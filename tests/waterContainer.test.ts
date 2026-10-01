import { describe, expect, it, vi } from 'vitest';
import { SURVIVAL, WATER_CONTAINER } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory } from '../src/items/Inventory';
import {
  ContainerFiller,
  EMPTY_CONTAINER,
  FULL_CONTAINER,
  canDrinkContainer,
  drinkFromContainer,
} from '../src/items/waterContainer';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';

const DT = 1 / 60;
const AT_WATER = { held: true, nearWater: true, drinking: false, alive: true };

function setup() {
  const events = new EventBus<GameEvents>();
  const filled = vi.fn();
  const drank = vi.fn();
  events.on('item:filled', filled);
  events.on('player:drank', drank);
  const inventory = new Inventory();
  const filler = new ContainerFiller(events, inventory);
  return { events, filled, drank, inventory, filler };
}

function hold(filler: ContainerFiller, seconds: number, input = AT_WATER): void {
  for (let t = 0; t < seconds; t += DT) filler.update(DT, input);
}

describe('ContainerFiller', () => {
  it('boş kap yoksa, su uzaktaysa, içerken ya da ölüyken teklif yok', () => {
    const { filler, inventory } = setup();
    filler.update(DT, AT_WATER);
    expect(filler.offer).toBeNull(); // kap yok
    inventory.add(EMPTY_CONTAINER, 1);
    filler.update(DT, { ...AT_WATER, nearWater: false });
    expect(filler.offer).toBeNull();
    filler.update(DT, { ...AT_WATER, drinking: true });
    expect(filler.offer).toBeNull();
    filler.update(DT, { ...AT_WATER, alive: false });
    expect(filler.offer).toBeNull();
    filler.update(DT, { ...AT_WATER, held: false });
    expect(filler.offer).toEqual({ status: 'ready', seconds: WATER_CONTAINER.fillSeconds });
  });

  it('E basılı süre dolunca boş kap dolar, olay bir kez yayınlanır', () => {
    const { filler, inventory, filled } = setup();
    inventory.add(EMPTY_CONTAINER, 1);
    hold(filler, WATER_CONTAINER.fillSeconds - 0.2);
    expect(inventory.has(FULL_CONTAINER)).toBe(false);
    expect(filler.progress).toBeGreaterThan(0.8);
    hold(filler, 0.4);
    expect(inventory.count(FULL_CONTAINER)).toBe(1);
    expect(inventory.count(EMPTY_CONTAINER)).toBe(0);
    expect(filled).toHaveBeenCalledTimes(1);
    expect(filler.offer).toBeNull(); // boş kap kalmadı
  });

  it('tuş bırakılınca ilerleme sıfırlanır', () => {
    const { filler, inventory } = setup();
    inventory.add(EMPTY_CONTAINER, 1);
    hold(filler, WATER_CONTAINER.fillSeconds / 2);
    filler.update(DT, { ...AT_WATER, held: false });
    expect(filler.progress).toBe(0);
    hold(filler, WATER_CONTAINER.fillSeconds / 2);
    expect(inventory.has(FULL_CONTAINER)).toBe(false);
  });

  it('dolu kap ağırlık sınırını aşacaksa `full` ve kap boş kalır', () => {
    const events = new EventBus<GameEvents>();
    const inventory = new Inventory({ maxWeightG: 1000 });
    const filler = new ContainerFiller(events, inventory);
    inventory.add(EMPTY_CONTAINER, 1);
    hold(filler, WATER_CONTAINER.fillSeconds * 2);
    expect(filler.offer?.status).toBe('full');
    expect(filler.progress).toBe(0);
    expect(inventory.has(EMPTY_CONTAINER)).toBe(true);
  });
});

describe('drinkFromContainer', () => {
  it('susuzken dolu kaptan içer: su artar, kap boşalır, player:drank yayınlanır', () => {
    const { inventory, events, drank } = setup();
    const survival = new SurvivalSystem();
    survival.setVitals({ hydration: 30 });
    inventory.add(FULL_CONTAINER, 1);
    expect(canDrinkContainer(survival.state, inventory)).toBe(true);
    const result = drinkFromContainer(inventory, survival, events);
    expect(result).toEqual({ ok: true, amount: WATER_CONTAINER.drinkHydration });
    expect(survival.state.hydration).toBe(30 + WATER_CONTAINER.drinkHydration);
    expect(inventory.count(EMPTY_CONTAINER)).toBe(1);
    expect(inventory.count(FULL_CONTAINER)).toBe(0);
    expect(drank).toHaveBeenCalledWith({ amount: WATER_CONTAINER.drinkHydration });
  });

  it('su 100’e kırpılır; yeterince susuz değilken ya da kap yokken içilmez', () => {
    const { inventory } = setup();
    const survival = new SurvivalSystem();
    expect(drinkFromContainer(inventory, survival)).toEqual({ ok: false, reason: 'no_water' });
    inventory.add(FULL_CONTAINER, 1);
    survival.setVitals({ hydration: SURVIVAL.maxValue - WATER_CONTAINER.drinkMinDeficit + 1 });
    expect(drinkFromContainer(inventory, survival)).toEqual({ ok: false, reason: 'not_thirsty' });
    expect(inventory.has(FULL_CONTAINER)).toBe(true);
    survival.setVitals({ hydration: 90 });
    const result = drinkFromContainer(inventory, survival);
    expect(result).toEqual({ ok: true, amount: 10 });
    expect(survival.state.hydration).toBe(SURVIVAL.maxValue);
  });

  it('ölüyken içilmez', () => {
    const { inventory } = setup();
    const survival = new SurvivalSystem();
    inventory.add(FULL_CONTAINER, 1);
    survival.setVitals({ hydration: 0 });
    survival.update(DT, { activity: 'rest', elevationM: 0, drinking: false });
    survival.applyDamage(1000, 'creature');
    expect(drinkFromContainer(inventory, survival)).toEqual({ ok: false, reason: 'dead' });
    expect(inventory.has(FULL_CONTAINER)).toBe(true);
  });
});
