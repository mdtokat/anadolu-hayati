import { describe, expect, it, vi } from 'vitest';
import { CombatSystem } from '../src/combat/CombatSystem';
import { bestWeapon, pickMeleeTarget, resolveMelee, type MeleeAim } from '../src/combat/melee';
import { COMBAT } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import type { CreatureSystem } from '../src/creatures/CreatureSystem';
import type { CreatureId, CreatureView } from '../src/creatures/kinds';
import { Inventory } from '../src/items/Inventory';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import { FakeCreatures, makeView } from './helpers/fakeCreatures';

/** Orijinde, −Z'ye (kuzeye) bakan, yatay bakışlı oyuncu. */
const aim: MeleeAim = { x: 0, y: 0, z: 0, eyeY: 1.65, yaw: 0, pitch: 0 };
const fist = COMBAT.weapons.fist;

describe('resolveMelee', () => {
  it('önündeki menzil içindeki canlıya isabet eder', () => {
    const hit = resolveMelee(makeView({ x: 0, z: -1.2, radius: 0.4 }), aim, fist);
    expect(hit).not.toBeNull();
    expect(hit?.distance).toBeCloseTo(0.8);
  });

  it('menzil sınırı canlının kenarına göredir (kenar değerleri)', () => {
    const radius = 0.5;
    const edge = fist.reach + radius;
    expect(resolveMelee(makeView({ z: -(edge - 0.01), radius }), aim, fist)).not.toBeNull();
    expect(resolveMelee(makeView({ z: -(edge + 0.01), radius }), aim, fist)).toBeNull();
  });

  it('arkadaki ve koni dışındaki canlıya isabet etmez', () => {
    expect(resolveMelee(makeView({ z: 1.2 }), aim, fist)).toBeNull(); // arkada
    expect(resolveMelee(makeView({ x: 1.5, z: -0.1 }), aim, fist)).toBeNull(); // tam yanda
  });

  it('yatay koni sınırı: dar canlıda koni kenarı', () => {
    const d = 1.4;
    const inside = COMBAT.aim.coneDeg - 3;
    const outside = COMBAT.aim.coneDeg + 8;
    const at = (deg: number) =>
      makeView({
        x: Math.sin((deg * Math.PI) / 180) * d,
        z: -Math.cos((deg * Math.PI) / 180) * d,
        radius: 0.05,
      });
    expect(resolveMelee(at(inside), aim, fist)).not.toBeNull();
    expect(resolveMelee(at(outside), aim, fist)).toBeNull();
  });

  it('bakış yönü (yaw) koniyi döndürür: sola dönünce −X yönündeki canlıya vurulur', () => {
    const view = makeView({ x: -1.2, z: 0 });
    expect(resolveMelee(view, aim, fist)).toBeNull();
    expect(resolveMelee(view, { ...aim, yaw: Math.PI / 2 }, fist)).not.toBeNull();
  });

  it('leşe vurulmaz', () => {
    expect(resolveMelee(makeView({ z: -1, dead: true, state: 'dead' }), aim, fist)).toBeNull();
  });

  it('dikey tolerans: gök yüzüne bakarken yakın ama menzildeki canlı ıskalanır, yere bakınca isabet', () => {
    const view = makeView({ z: -1.6, radius: 0.3, height: 0.8 }); // closeRange'in dışında
    expect(resolveMelee(view, { ...aim, pitch: (80 * Math.PI) / 180 }, fist)).toBeNull();
    expect(resolveMelee(view, { ...aim, pitch: (-30 * Math.PI) / 180 }, fist)).not.toBeNull();
  });

  it('closeRange içinde dikey açı aranmaz', () => {
    const view = makeView({ z: -0.8, radius: 0.3 });
    expect(resolveMelee(view, { ...aim, pitch: (85 * Math.PI) / 180 }, fist)).not.toBeNull();
  });

  it('zemin farkı maxVerticalGap üstündeyse isabet yok (dik yamaç: üstten/alttan)', () => {
    const below = makeView({ z: -1, y: -COMBAT.aim.maxVerticalGap - 0.1 });
    expect(resolveMelee(below, aim, fist)).toBeNull();
    const ok = makeView({ z: -1, y: -COMBAT.aim.maxVerticalGap + 0.1 });
    expect(resolveMelee(ok, { ...aim, pitch: (-30 * Math.PI) / 180 }, fist)).not.toBeNull();
  });
});

describe('pickMeleeTarget', () => {
  it('bakışa en yakın olanı seçer', () => {
    const near = makeView({ id: 1, x: 0.9, z: -1, radius: 0.3 });
    const centered = makeView({ id: 2, x: 0, z: -1.6, radius: 0.3 });
    const hit = pickMeleeTarget([near, centered], aim, COMBAT.weapons.stone_spear);
    expect(hit?.view.id).toBe(2);
  });

  it('aday yoksa null', () => {
    expect(pickMeleeTarget([], aim, fist)).toBeNull();
  });
});

describe('bestWeapon', () => {
  it('envantere göre en çok hasar vereni seçer', () => {
    const inv = new Inventory();
    expect(bestWeapon(inv)).toBe('fist');
    inv.add('stone_axe', 1);
    expect(bestWeapon(inv)).toBe('stone_axe');
    inv.add('stone_spear', 1);
    expect(bestWeapon(inv)).toBe('stone_spear');
  });
});

function setup(items: Array<['stone_axe' | 'stone_spear', number]> = []) {
  const events = new EventBus<GameEvents>();
  const inventory = new Inventory();
  for (const [id, n] of items) inventory.add(id, n);
  const survival = new SurvivalSystem(events);
  const creatures = new FakeCreatures(events);
  const combat = new CombatSystem(
    events,
    inventory,
    creatures as unknown as CreatureSystem,
    survival,
  );
  const attacked = vi.fn();
  events.on('player:attacked', attacked);
  return { events, inventory, survival, creatures, combat, attacked };
}

describe('CombatSystem.attack', () => {
  it('yumrukla isabet: hasar verir, player:attacked hitId ile yayınlanır', () => {
    const { creatures, combat, attacked } = setup();
    const id = creatures.add(makeView({ x: 0, z: -1.2 }));
    const result = combat.attack(aim);
    expect(result.status).toBe('hit');
    expect(result.weapon).toBe('fist');
    expect(creatures.damageCalls).toEqual([
      { id, amount: COMBAT.weapons.fist.damage, from: { x: 0, z: 0 } },
    ]);
    expect(attacked).toHaveBeenCalledWith({ weapon: 'fist', hitId: id });
  });

  it('ıskalayınca da enerji ve bekleme işler; hitId null', () => {
    const { survival, combat, attacked } = setup();
    const before = survival.state.energy;
    expect(combat.attack(aim).status).toBe('miss');
    expect(survival.state.energy).toBeCloseTo(before - COMBAT.weapons.fist.energyCost);
    expect(attacked).toHaveBeenCalledWith({ weapon: 'fist', hitId: null });
  });

  it('bekleme süresince saldırı yok, dolunca var', () => {
    const { combat, creatures } = setup();
    creatures.add(makeView({ z: -1.2, health: 1000, maxHealth: 1000 }));
    expect(combat.attack(aim).status).toBe('hit');
    expect(combat.attack(aim).status).toBe('cooldown');
    combat.update(COMBAT.weapons.fist.cooldownSeconds - 0.01);
    expect(combat.attack(aim).status).toBe('cooldown');
    combat.update(0.02);
    expect(combat.attack(aim).status).toBe('hit');
  });

  it('en iyi silahı kullanır (taş mızrak menzili ve hasarı)', () => {
    const { combat, creatures } = setup([['stone_spear', 1]]);
    const id = creatures.add(makeView({ z: -2.6, radius: 0.3 }));
    expect(combat.attack(aim).status).toBe('hit');
    expect(creatures.damageCalls[0]).toMatchObject({
      id,
      amount: COMBAT.weapons.stone_spear.damage,
    });
    // Aynı mesafe yumrukla ıskalanırdı.
    expect(resolveMelee(makeView({ z: -2.6, radius: 0.3 }), aim, fist)).toBeNull();
  });

  it('öldüren vuruş killed döner', () => {
    const { combat, creatures } = setup([['stone_axe', 1]]);
    creatures.add(makeView({ z: -1.2, health: 10, maxHealth: 40 }));
    const result = combat.attack(aim);
    expect(result.killed).toBe(true);
  });

  it('ölü canlıya saldırı isabet etmez', () => {
    const { combat, creatures } = setup();
    creatures.add(makeView({ z: -1.2, dead: true, state: 'dead', health: 0 }));
    expect(combat.attack(aim).status).toBe('miss');
    expect(creatures.damageCalls).toHaveLength(0);
  });

  it('bitkinken (enerji tükenmiş) saldırı yok', () => {
    const { combat, survival, attacked } = setup();
    survival.setVitals({ energy: 0, exhausted: true });
    expect(combat.attack(aim).status).toBe('exhausted');
    expect(attacked).not.toHaveBeenCalled();
  });

  it('enerji düşümü 0 altına inmez', () => {
    const { combat, survival } = setup();
    survival.setVitals({ energy: 1 });
    combat.attack(aim);
    expect(survival.state.energy).toBe(0);
    combat.update(10);
    expect(combat.attack(aim).status).toBe('exhausted');
  });

  it('ölü oyuncu saldıramaz', () => {
    const { combat, survival } = setup();
    survival.setVitals({ health: 1 });
    survival.applyDamage(5, 'creature');
    expect(combat.attack(aim).status).toBe('dead');
  });
});

describe('Sahte CreatureSystem', () => {
  it('near yakından uzağa sıralar', () => {
    const creatures = new FakeCreatures(new EventBus<GameEvents>());
    const far: CreatureId = creatures.add(makeView({ x: 5 }));
    const close: CreatureId = creatures.add(makeView({ x: 1 }));
    expect(creatures.near(0, 0, 10).map((v: CreatureView) => v.id)).toEqual([close, far]);
  });
});
