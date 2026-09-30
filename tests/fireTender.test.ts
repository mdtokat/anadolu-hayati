import { describe, expect, it, vi } from 'vitest';
import { FIRE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory } from '../src/items/Inventory';
import { StructureSet, isLit } from '../src/placement/structures';
import { FireTender } from '../src/placement/tend';

const DT = 1 / 60;

function setup() {
  const events = new EventBus<GameEvents>();
  const refueled = vi.fn();
  events.on('structure:refueled', refueled);
  const inventory = new Inventory();
  const structures = new StructureSet();
  const fire = structures.add('campfire', 0, 0, 0);
  const tender = new FireTender(events, inventory, structures);
  return { events, refueled, inventory, structures, fire, tender };
}

/** `seconds` boyunca E basılı tutar. */
function hold(tender: FireTender, seconds: number, pos = { x: 1, z: 0 }, alive = true): void {
  for (let t = 0; t < seconds; t += DT) tender.update(DT, true, pos, alive);
}

describe('FireTender', () => {
  it('uzaktaysa teklif yok; yakındayken (sınır dahil) teklif var', () => {
    const { tender, inventory } = setup();
    inventory.add('stick', 1);
    tender.update(DT, false, { x: FIRE.refuelReach + 0.01, z: 0 });
    expect(tender.offer).toBeNull();
    tender.update(DT, false, { x: FIRE.refuelReach, z: 0 });
    expect(tender.offer).toMatchObject({
      status: 'ready',
      item: 'stick',
      seconds: FIRE.fuel.stick,
    });
  });

  it('tutunca süre dolar: bir dal düşer, yanma süresi uzar, olay bir kez yayınlanır', () => {
    const { tender, inventory, structures, fire, refueled } = setup();
    inventory.add('stick', 3);
    hold(tender, FIRE.refuelSeconds - 0.1);
    expect(inventory.count('stick')).toBe(3);
    expect(tender.progress).toBeGreaterThan(0.8);
    hold(tender, 0.2);
    expect(inventory.count('stick')).toBe(2);
    expect(structures.get(fire.id)?.fuelSeconds).toBe(FIRE.burnSeconds + FIRE.fuel.stick);
    expect(refueled).toHaveBeenCalledTimes(1);
    expect(refueled).toHaveBeenCalledWith({ id: fire.id, item: 'stick', seconds: FIRE.fuel.stick });
  });

  it('tuş bırakılınca ilerleme sıfırlanır ve hiçbir şey harcanmaz', () => {
    const { tender, inventory, refueled } = setup();
    inventory.add('stick', 1);
    hold(tender, FIRE.refuelSeconds - 0.1);
    tender.update(DT, false, { x: 1, z: 0 });
    expect(tender.progress).toBe(0);
    hold(tender, FIRE.refuelSeconds - 0.1);
    expect(inventory.count('stick')).toBe(1);
    expect(refueled).not.toHaveBeenCalled();
  });

  it('önce dal, dal yoksa kütük kullanılır', () => {
    const { tender, inventory, structures, fire } = setup();
    inventory.add('log', 2);
    hold(tender, FIRE.refuelSeconds + 0.1);
    expect(inventory.count('log')).toBe(1);
    expect(structures.get(fire.id)?.fuelSeconds).toBe(FIRE.burnSeconds + FIRE.fuel.log);
    inventory.add('stick', 1);
    tender.update(DT, false, { x: 1, z: 0 });
    expect(tender.offer?.item).toBe('stick');
  });

  it('yakıt yoksa noFuel; depo doluysa full ve eşya harcanmaz', () => {
    const { tender, inventory, structures, fire } = setup();
    tender.update(DT, true, { x: 1, z: 0 });
    expect(tender.offer).toMatchObject({ status: 'noFuel', item: null });
    inventory.add('stick', 5);
    structures.refuel(fire.id, FIRE.maxFuelSeconds);
    hold(tender, 3);
    expect(tender.offer?.status).toBe('full');
    expect(inventory.count('stick')).toBe(5);
  });

  it('basılı tutmaya devam edince depo dolana kadar sürekli yakıt atar, sonra durur', () => {
    const { tender, inventory, structures, fire } = setup();
    inventory.add('stick', 30);
    hold(tender, 20);
    expect(structures.get(fire.id)?.fuelSeconds).toBe(FIRE.maxFuelSeconds);
    const used = 30 - inventory.count('stick');
    expect(used).toBe(Math.ceil((FIRE.maxFuelSeconds - FIRE.burnSeconds) / FIRE.fuel.stick));
  });

  it('sönük ateş yakıt atılınca yeniden tutuşur', () => {
    const { tender, inventory, structures, fire } = setup();
    structures.update(FIRE.burnSeconds);
    expect(isLit(structures.get(fire.id)!)).toBe(false);
    inventory.add('stick', 1);
    hold(tender, FIRE.refuelSeconds + 0.1);
    expect(isLit(structures.get(fire.id)!)).toBe(true);
    expect(structures.get(fire.id)?.fuelSeconds).toBe(FIRE.fuel.stick);
  });

  it('ölü oyuncu yakıt atamaz', () => {
    const { tender, inventory, refueled } = setup();
    inventory.add('stick', 1);
    hold(tender, 2, { x: 1, z: 0 }, false);
    expect(tender.offer).toBeNull();
    expect(inventory.count('stick')).toBe(1);
    expect(refueled).not.toHaveBeenCalled();
  });

  it('sundurma ateş sayılmaz', () => {
    const events = new EventBus<GameEvents>();
    const inventory = new Inventory();
    const structures = new StructureSet();
    structures.add('lean_to', 0, 0, 0);
    const tender = new FireTender(events, inventory, structures);
    inventory.add('stick', 1);
    hold(tender, 2);
    expect(tender.offer).toBeNull();
    expect(inventory.count('stick')).toBe(1);
  });
});
