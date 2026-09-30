import { describe, expect, it, vi } from 'vitest';
import { defenseFor, InvulnerabilityTimer, mitigate } from '../src/combat/damage';
import { CombatSystem } from '../src/combat/CombatSystem';
import { COMBAT } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import { Inventory } from '../src/items/Inventory';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import { deathCauseText } from '../src/ui/survivalFormat';

function setup(items: Array<[Parameters<Inventory['add']>[0], number]> = []) {
  const events = new EventBus<GameEvents>();
  const inventory = new Inventory();
  for (const [id, n] of items) inventory.add(id, n);
  const survival = new SurvivalSystem(events);
  const combat = new CombatSystem(events, inventory, new CreatureSystem(events), survival);
  const damaged = vi.fn();
  const died = vi.fn();
  events.on('player:damaged', damaged);
  events.on('player:died', died);
  const hit = (damage: number, kind: 'wolf' | 'brown_bear' = 'wolf') =>
    events.emit('creature:attacked', { id: 1, kind, damage, x: 0, z: 0 });
  return { events, inventory, survival, combat, damaged, died, hit };
}

describe('savunma', () => {
  it('giysisiz savunma 0, yelekle tanımlı oran', () => {
    expect(defenseFor(new Inventory())).toBe(0);
    const inv = new Inventory();
    inv.add('hide_vest', 1);
    expect(defenseFor(inv)).toBe(COMBAT.defense.hide_vest);
  });

  it('toplam savunma maxDefense ile sınırlı', () => {
    expect(defenseFor({ has: () => true })).toBeLessThanOrEqual(COMBAT.maxDefense);
  });

  it('mitigate yüzdeyi uygular ve uçları kırpar', () => {
    expect(mitigate(40, 0.25)).toBeCloseTo(30);
    expect(mitigate(40, 0)).toBe(40);
    expect(mitigate(40, 2)).toBe(0);
    expect(mitigate(-5, 0.1)).toBe(0);
  });
});

describe('dokunulmazlık sayacı', () => {
  it('başlatınca etkin, süre dolunca biter, reset hemen bitirir', () => {
    const timer = new InvulnerabilityTimer();
    expect(timer.active).toBe(false);
    timer.start(0.5);
    expect(timer.active).toBe(true);
    timer.update(0.49);
    expect(timer.active).toBe(true);
    timer.update(0.02);
    expect(timer.active).toBe(false);
    timer.start(1);
    timer.reset();
    expect(timer.active).toBe(false);
  });
});

describe('SurvivalSystem.applyDamage', () => {
  it('canı düşürür ve player:damaged bir kez doğru yükle yayınlanır', () => {
    const { survival, damaged } = setup();
    expect(survival.applyDamage(30, 'creature', 'wolf')).toBe(30);
    expect(survival.state.health).toBe(70);
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(damaged).toHaveBeenCalledWith({ amount: 30, cause: 'creature', sourceKind: 'wolf' });
  });

  it('sıfır/negatif hasar etkisiz', () => {
    const { survival, damaged } = setup();
    expect(survival.applyDamage(0, 'creature')).toBe(0);
    expect(survival.applyDamage(-4, 'creature')).toBe(0);
    expect(survival.state.health).toBe(100);
    expect(damaged).not.toHaveBeenCalled();
  });

  it('can 0 olunca mauled nedeniyle ölür; fazlası sayılmaz', () => {
    const { survival, damaged, died } = setup();
    survival.setVitals({ health: 10 });
    expect(survival.applyDamage(40, 'creature', 'brown_bear')).toBe(10);
    expect(survival.alive).toBe(false);
    expect(died).toHaveBeenCalledTimes(1);
    expect(died.mock.calls[0]?.[0].cause).toBe('mauled');
    expect(damaged).toHaveBeenCalledWith({
      amount: 10,
      cause: 'creature',
      sourceKind: 'brown_bear',
    });
    expect(survival.deathInfo?.cause).toBe('mauled');
  });

  it('ölü oyuncu hasar almaz', () => {
    const { survival, damaged, died } = setup();
    survival.setVitals({ health: 1 });
    survival.applyDamage(5, 'creature');
    damaged.mockClear();
    died.mockClear();
    expect(survival.applyDamage(50, 'creature')).toBe(0);
    expect(damaged).not.toHaveBeenCalled();
    expect(died).not.toHaveBeenCalled();
  });

  it('ölüm nedeni metni hayvan saldırısını söyler', () => {
    expect(deathCauseText('mauled')).toMatch(/[Hh]ayvan/);
  });
});

describe('CombatSystem: hasar alma', () => {
  it('creature:attacked savunma sonrası hasar uygular', () => {
    const { survival, hit, damaged } = setup([['hide_vest', 1]]);
    hit(40);
    const expected = 40 * (1 - COMBAT.defense.hide_vest);
    expect(survival.state.health).toBeCloseTo(100 - expected);
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(damaged.mock.calls[0]?.[0].amount).toBeCloseTo(expected);
  });

  it('dokunulmazlık süresince ikinci vuruş sayılmaz, süre dolunca sayılır', () => {
    const { survival, combat, hit, damaged } = setup();
    hit(18);
    hit(18); // aynı karede iki vuruş
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(survival.state.health).toBe(82);
    combat.update(COMBAT.iframeSeconds - 0.01);
    hit(18);
    expect(damaged).toHaveBeenCalledTimes(1);
    combat.update(0.02);
    hit(18);
    expect(damaged).toHaveBeenCalledTimes(2);
    expect(survival.state.health).toBe(64);
  });

  it('ölü oyuncu hasar almaz; yeniden doğunca dokunulmazlık sıfırlanır', () => {
    const { survival, hit, damaged, died } = setup();
    survival.setVitals({ health: 5 });
    hit(40, 'brown_bear');
    expect(died).toHaveBeenCalledTimes(1);
    hit(40);
    expect(damaged).toHaveBeenCalledTimes(1);
    survival.respawn();
    hit(10);
    expect(damaged).toHaveBeenCalledTimes(2);
    expect(survival.state.health).toBe(90);
  });

  it('dispose sonrası olay dinlenmez', () => {
    const { survival, combat, hit } = setup();
    combat.dispose();
    hit(40);
    expect(survival.state.health).toBe(100);
  });
});
