import { describe, expect, it } from 'vitest';
import { CombatSystem } from '../src/combat/CombatSystem';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import { CREATURE_KINDS, CREATURE_STATES, type CreatureContext } from '../src/creatures/kinds';
import { Inventory } from '../src/items/Inventory';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import { formatDebugInfo } from '../src/ui/hudFormat';

const context: CreatureContext = {
  player: { x: 0, y: 0, z: 0, activity: 'rest', alive: true },
  hour: 12,
  sunAltitudeDeg: 50,
  isNight: false,
  fires: [],
  terrain: null,
};

describe('Faz 5 iskeleti: sözleşme', () => {
  it('tür ve durum listeleri benzersiz, yalnızca-sona-ekle sırası korunmuş', () => {
    expect(new Set(CREATURE_KINDS).size).toBe(CREATURE_KINDS.length);
    expect(new Set(CREATURE_STATES).size).toBe(CREATURE_STATES.length);
    expect(CREATURE_KINDS.slice(0, 4)).toEqual(['roe_deer', 'wild_boar', 'wolf', 'brown_bear']);
    expect(CREATURE_STATES[CREATURE_STATES.length - 1]).toBe('dead');
  });

  it('boş CreatureSystem hiçbir şey üretmez ve hasar/leş işlemleri etkisizdir', () => {
    const system = new CreatureSystem(new EventBus<GameEvents>());
    system.update(1 / 60, context);
    expect(system.views()).toEqual([]);
    expect(system.near(0, 0, 100)).toEqual([]);
    expect(system.damage(1, 10, { x: 0, z: 0 })).toBeNull();
    expect(system.removeCarcass(1)).toBe(false);
    expect(system.stats).toEqual({ active: 0, carcasses: 0 });
    system.dispose();
  });

  it('CombatSystem iskeleti kurulup güncellenebilir', () => {
    const events = new EventBus<GameEvents>();
    const combat = new CombatSystem(
      events,
      new Inventory(),
      new CreatureSystem(events),
      new SurvivalSystem(events),
    );
    combat.update(1 / 60);
    combat.dispose();
  });

  it('debug HUD canlı satırını yazar', () => {
    const text = formatDebugInfo({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      grounded: true,
      cameraMode: 'firstPerson',
      creatures: { active: 5, carcasses: 1 },
    });
    expect(text).toContain('Canlı: 5 etkin (1 leş)');
  });
});
