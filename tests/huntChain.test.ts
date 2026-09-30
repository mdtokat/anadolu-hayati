import { describe, expect, it, vi } from 'vitest';
import { CarcassButcher, pickCarcass } from '../src/combat/carcass';
import { CombatSystem } from '../src/combat/CombatSystem';
import { CookingSystem } from '../src/combat/cooking';
import { updateInteractions, type InteractionSystems } from '../src/combat/interactChain';
import { COMBAT, COOKING, FIRE, LOOT } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import type { CreatureSystem } from '../src/creatures/CreatureSystem';
import type { CreatureView } from '../src/creatures/kinds';
import { eatItem } from '../src/items/eatItem';
import { GatherSystem } from '../src/interaction/gather';
import { Inventory } from '../src/items/Inventory';
import { StructureSet } from '../src/placement/structures';
import { FireTender } from '../src/placement/tend';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import { FakeCreatures } from './helpers/fakeCreatures';

const DT = 1 / 60;
const aim = { x: 0, y: 0, z: 0, eyeY: 1.65, yaw: 0, pitch: 0 };
const feet = { x: 1, z: 0 };

function world() {
  const events = new EventBus<GameEvents>();
  const inventory = new Inventory();
  const survival = new SurvivalSystem(events);
  const structures = new StructureSet();
  const creatures = new FakeCreatures(events);
  const asSystem = creatures as unknown as CreatureSystem;
  const combat = new CombatSystem(events, inventory, asSystem, survival);
  const systems: InteractionSystems = {
    gather: new GatherSystem(events, inventory),
    butcher: new CarcassButcher(events, inventory, asSystem),
    cooking: new CookingSystem(events, inventory, structures),
    fireTender: new FireTender(events, inventory, structures),
  };
  const heldFor = (seconds: number, carcass: CreatureView | null = null) => {
    let last = updateInteractions(DT, systems, {
      held: true,
      feet,
      prop: null,
      carcass,
      alive: true,
    });
    for (let t = DT; t < seconds; t += DT) {
      last = updateInteractions(DT, systems, {
        held: true,
        feet,
        prop: null,
        carcass,
        alive: true,
      });
    }
    return last;
  };
  return { events, inventory, survival, structures, creatures, combat, systems, heldFor };
}

describe('av zinciri (sahte canlı sistemiyle)', () => {
  it('vur → öl → kes → pişir → ye', () => {
    const w = world();
    const died = vi.fn();
    const butchered = vi.fn();
    const cooked = vi.fn();
    w.events.on('creature:died', died);
    w.events.on('carcass:butchered', butchered);
    w.events.on('item:cooked', cooked);

    // Oyuncu taş mızrakla bir karacaya vurur (40 can: iki vuruş).
    w.inventory.add('stone_spear', 1);
    const id = w.creatures.add({
      kind: 'roe_deer',
      z: -1.5,
      health: 40,
      maxHealth: 40,
      radius: 0.35,
    });
    let swings = 0;
    while (swings < 5 && !died.mock.calls.length) {
      w.combat.update(COMBAT.weapons.stone_spear.cooldownSeconds + 0.01);
      w.combat.attack(aim);
      swings += 1;
    }
    expect(swings).toBe(2);
    expect(died).toHaveBeenCalledTimes(1);
    expect(died.mock.calls[0]?.[0].id).toBe(id);

    // Ölü canlı leştir: bakılarak kesilir.
    const view = w.creatures.views().find((v) => v.id === id) as CreatureView;
    expect(view.dead).toBe(true);
    const carcass = pickCarcass(w.creatures.near(0, 0, 5), aim)?.view ?? null;
    expect(carcass?.id).toBe(id);
    w.heldFor(LOOT.butcherSeconds + 0.5, carcass);
    expect(butchered).toHaveBeenCalledTimes(1);
    expect(w.inventory.count('raw_meat')).toBe(3);
    expect(w.inventory.count('hide')).toBe(1);
    expect(w.creatures.views().some((v) => v.id === id)).toBe(false);

    // Yanık ateşin yanında pişir.
    w.structures.add('campfire', 0, 0, 0);
    w.heldFor(COOKING.seconds * 3 + 0.5);
    expect(cooked).toHaveBeenCalledTimes(3);
    expect(w.inventory.count('raw_meat')).toBe(0);
    expect(w.inventory.count('cooked_meat')).toBe(3);

    // Ye: pişmiş et çok doyurur ve iyileştirir.
    w.survival.setVitals({ satiety: 40, health: 70 });
    expect(eatItem(w.inventory, w.survival, 'cooked_meat')).toBe('cooked_meat');
    expect(w.survival.state.satiety).toBeGreaterThan(40 + 25);
    expect(w.survival.state.health).toBeGreaterThan(70);
  });

  it('çiğ et yenince tokluk az artar, can düşer ama yemek öldürmez', () => {
    const w = world();
    w.inventory.add('raw_meat', 2);
    w.survival.setVitals({ satiety: 40, health: 3 });
    eatItem(w.inventory, w.survival, 'raw_meat');
    expect(w.survival.state.satiety).toBeCloseTo(48);
    expect(w.survival.state.health).toBe(1);
    expect(w.survival.alive).toBe(true);
  });
});

describe('E öncelik sırası', () => {
  it('çiğ et varken ateşin yanında E eti pişirir, yakıt atmaz; et bitince yakıt atar', () => {
    const w = world();
    const fire = w.structures.add('campfire', 0, 0, 0);
    w.inventory.add('raw_meat', 1);
    w.inventory.add('stick', 5);
    const fuelBefore = w.structures.get(fire.id)?.fuelSeconds ?? 0;

    let result = w.heldFor(COOKING.seconds - 0.3);
    expect(result).toEqual({ taker: 'cook', drinkAllowed: false });
    expect(w.inventory.count('stick')).toBe(5);

    w.heldFor(0.6); // et pişti
    expect(w.inventory.count('cooked_meat')).toBe(1);
    // Et bitti: sıradaki E yakıt atar.
    result = w.heldFor(FIRE.refuelSeconds + 0.2);
    expect(result.taker).toBe('tend');
    expect(w.inventory.count('stick')).toBeLessThan(5);
    expect(w.structures.get(fire.id)?.fuelSeconds).toBeGreaterThan(fuelBefore);
  });

  it('leş kesme pişirme ve yakıttan önceliklidir', () => {
    const w = world();
    w.structures.add('campfire', 0, 0, 0);
    w.inventory.add('raw_meat', 1);
    w.inventory.add('stick', 5);
    w.creatures.add({ kind: 'wolf', x: 1, z: -1.5, dead: true, state: 'dead' });
    const carcass = pickCarcass(w.creatures.near(1, 0, 5), { ...aim, x: 1 })?.view ?? null;
    expect(carcass).not.toBeNull();
    const result = w.heldFor(1, carcass);
    expect(result).toEqual({ taker: 'butcher', drinkAllowed: false });
    expect(w.inventory.count('cooked_meat')).toBe(0);
  });

  it('hiçbir şey E almazsa su içme serbest; tuş basılı değilse değil', () => {
    const w = world();
    expect(w.heldFor(0.1)).toEqual({ taker: null, drinkAllowed: true });
    const idle = updateInteractions(DT, w.systems, {
      held: false,
      feet,
      prop: null,
      carcass: null,
      alive: true,
    });
    expect(idle.drinkAllowed).toBe(false);
  });

  it('ateşe yakıt, et yoksa su içmeden önceliklidir', () => {
    const w = world();
    w.structures.add('campfire', 0, 0, 0);
    w.inventory.add('stick', 2);
    const result = w.heldFor(0.1);
    expect(result).toEqual({ taker: 'tend', drinkAllowed: false });
  });
});
