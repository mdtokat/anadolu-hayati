import { COOK_RECIPES } from '../src/combat/cooking';
import { describe, expect, it, vi } from 'vitest';
import { FOOD, SURVIVAL } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { applyEdible, canEat, eat, edibleEffect, isDrink } from '../src/items/consume';
import { Inventory } from '../src/items/Inventory';
import { ITEM_IDS, ITEMS, type EdibleEffect } from '../src/items/itemDefs';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import { initialVitals, type VitalsState } from '../src/survival/vitals';

const hungry = (satiety = 50): VitalsState => ({ ...initialVitals(), satiety });
const MAX = SURVIVAL.maxValue;

describe('edibleEffect / canEat', () => {
  it('yalnızca yiyecekler yenebilir; çiğ erzak (bulgur, tarhana…) pişirilmeden yenmez', () => {
    const raw = new Set(COOK_RECIPES.filter((r) => r.requires).map((r) => r.from));
    for (const id of ITEM_IDS) {
      expect(edibleEffect(id) !== null, id).toBe(ITEMS[id].category === 'food' && !raw.has(id));
    }
  });

  it('tokluk eksiği eşikte yenir, altında yenmez; yenemez eşya hiç yenmez', () => {
    expect(canEat(hungry(MAX - FOOD.eatMinDeficit), 'hazelnut')).toBe(true);
    expect(canEat(hungry(MAX - FOOD.eatMinDeficit + 0.01), 'hazelnut')).toBe(false);
    expect(canEat(hungry(MAX), 'hazelnut')).toBe(false);
    expect(canEat(hungry(0), 'stick')).toBe(false);
    expect(canEat(hungry(0), 'stone_axe')).toBe(false);
  });

  it('içecek (demli çay) tokluğa bakmaz: tok ama susuz ya da yorgun oyuncu içer', () => {
    expect(isDrink('brewed_tea')).toBe(true);
    expect(isDrink('hazelnut')).toBe(false);
    expect(isDrink('stick')).toBe(false);
    const full = { ...initialVitals(), satiety: MAX, hydration: MAX, energy: MAX };
    expect(canEat(full, 'brewed_tea')).toBe(false);
    expect(canEat({ ...full, hydration: MAX - FOOD.eatMinDeficit }, 'brewed_tea')).toBe(true);
    expect(canEat({ ...full, energy: 40 }, 'brewed_tea')).toBe(true);
    // Aç ama susuz/yorgun değil: çay gerekmez.
    expect(canEat({ ...full, satiety: 10 }, 'brewed_tea')).toBe(false);
  });
});

describe('applyEdible', () => {
  it("tokluk, su ve can artar; hepsi 100'e kırpılır; girdi değişmez", () => {
    const state: VitalsState = { ...initialVitals(), satiety: 98, hydration: 40, health: 90 };
    const next = applyEdible(state, { satiety: 6, hydration: 2, health: 25 });
    expect(next.satiety).toBe(MAX);
    expect(next.hydration).toBe(42);
    expect(next.health).toBe(MAX);
    expect(state.satiety).toBe(98);
    expect(state.health).toBe(90);
  });

  it('etkisiz alanlar değişmez', () => {
    const state = hungry(30);
    expect(applyEdible(state, { satiety: 4 })).toEqual({ ...state, satiety: 34 });
  });
});

describe('eat', () => {
  it('kimlikle: bir adet düşer, tokluk artar', () => {
    const inv = new Inventory();
    inv.add('hazelnut', 3);
    const result = eat(inv, 'hazelnut', hungry(50));
    expect(result?.eaten).toBe('hazelnut');
    expect(result?.vitals.satiety).toBe(50 + (ITEMS.hazelnut.edible?.satiety ?? 0));
    expect(inv.count('hazelnut')).toBe(2);
  });

  it('slot indeksiyle: o slottaki eşya yenir; böğürtlen su da verir', () => {
    const inv = new Inventory();
    inv.add('stick', 1);
    inv.add('blackberry', 2);
    const vitals = { ...hungry(50), hydration: 60 };
    const result = eat(inv, 1, vitals);
    expect(result?.eaten).toBe('blackberry');
    expect(result?.vitals.satiety).toBe(53);
    expect(result?.vitals.hydration).toBe(62);
    expect(inv.slots[1]).toEqual({ id: 'blackberry', count: 1 });
    expect(eat(inv, 1, result?.vitals ?? vitals)?.eaten).toBe('blackberry');
    expect(inv.slots[1]).toBeNull();
  });

  it('tokken yenmez ve adet düşmez', () => {
    const inv = new Inventory();
    inv.add('chestnut', 2);
    const before = inv.version;
    expect(eat(inv, 'chestnut', hungry(MAX))).toBeNull();
    expect(eat(inv, 0, hungry(MAX))).toBeNull();
    expect(inv.count('chestnut')).toBe(2);
    expect(inv.version).toBe(before);
  });

  it('envanterde yoksa, slot boşsa veya indeks sınır dışıysa null', () => {
    const inv = new Inventory();
    inv.add('hazelnut', 1);
    expect(eat(inv, 'chestnut', hungry())).toBeNull();
    expect(eat(inv, 5, hungry())).toBeNull();
    expect(eat(inv, -1, hungry())).toBeNull();
    expect(inv.count('hazelnut')).toBe(1);
  });

  it('yenemez eşyayı yemez, envanteri korur', () => {
    const inv = new Inventory();
    inv.add('stick', 2);
    expect(eat(inv, 'stick', hungry(0))).toBeNull();
    expect(eat(inv, 0, hungry(0))).toBeNull();
    expect(inv.count('stick')).toBe(2);
  });

  it('girdi göstergelerini değiştirmez', () => {
    const inv = new Inventory();
    inv.add('mushroom_edible', 1);
    const vitals = hungry(20);
    eat(inv, 'mushroom_edible', vitals);
    expect(vitals.satiety).toBe(20);
  });
});

describe('SurvivalSystem.consume', () => {
  function setup() {
    const bus = new EventBus<GameEvents>();
    const ate = vi.fn();
    bus.on('player:ate', ate);
    return { system: new SurvivalSystem(bus), ate };
  }

  it("etkiyi uygular ve gerçekte artan değerlerle player:ate'i bir kez yayınlar", () => {
    const { system, ate } = setup();
    system.setVitals({ satiety: 50, hydration: 99 });
    expect(system.consume({ satiety: 3, hydration: 2 }, 'blackberry')).toBe(true);
    expect(system.state.satiety).toBe(53);
    expect(system.state.hydration).toBe(MAX);
    expect(ate).toHaveBeenCalledTimes(1);
    expect(ate).toHaveBeenCalledWith({ item: 'blackberry', satiety: 3, hydration: 1 });
  });

  it('eşya verilmezse olay yayınlanmaz', () => {
    const { system, ate } = setup();
    system.setVitals({ satiety: 50 });
    system.consume({ satiety: 10 });
    expect(system.state.satiety).toBe(60);
    expect(ate).not.toHaveBeenCalled();
  });

  it('sağlık etkisi uygulanır', () => {
    const { system } = setup();
    system.setVitals({ health: 40 });
    system.consume({ health: 10 }, 'mushroom_edible');
    expect(system.state.health).toBe(50);
  });

  it('ölü oyuncu yiyemez: durum değişmez, olay yok, false döner', () => {
    const { system, ate } = setup();
    system.setVitals({ hydration: 0, health: 0.0001 });
    system.update(1, { activity: 'rest', elevationM: 50, drinking: false });
    expect(system.alive).toBe(false);
    const satiety = system.state.satiety;
    expect(system.consume({ satiety: 4 }, 'hazelnut')).toBe(false);
    expect(system.state.satiety).toBe(satiety);
    expect(ate).not.toHaveBeenCalled();
  });

  it('yeniden doğduktan sonra yine yiyebilir', () => {
    const { system, ate } = setup();
    system.setVitals({ hydration: 0, health: 0.0001 });
    system.update(1, { activity: 'rest', elevationM: 50, drinking: false });
    system.respawn();
    system.setVitals({ satiety: 10 });
    expect(system.consume({ satiety: 4 }, 'hazelnut')).toBe(true);
    expect(ate).toHaveBeenCalledTimes(1);
  });
});

describe('zararlı yiyecek (çiğ et)', () => {
  it('canı düşürür ama 1 altına indirmez; zaten 1 altındaysa daha da düşürmez', () => {
    const base = { ...initialVitals(), satiety: 50 };
    const effect = ITEMS.raw_meat.edible as EdibleEffect;
    expect(applyEdible({ ...base, health: 50 }, effect).health).toBe(50 + (effect.health ?? 0));
    expect(applyEdible({ ...base, health: 3 }, effect).health).toBe(1);
    expect(applyEdible({ ...base, health: 0.4 }, effect).health).toBe(0.4);
  });
});
