import { describe, expect, it } from 'vitest';
import { CombatSystem } from '../src/combat/CombatSystem';
import { CREATURES } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import {
  CREATURE_KINDS,
  CREATURE_STATES,
  type CreatureContext,
  type CreatureView,
} from '../src/creatures/kinds';
import { Inventory } from '../src/items/Inventory';
import { formatDebugInfo } from '../src/ui/hudFormat';
import { CreatureLayer } from '../src/world/CreatureLayer';

const context: CreatureContext = {
  player: { x: 0, y: 0, z: 0, activity: 'rest', alive: true },
  hour: 12,
  sunAltitudeDeg: 50,
  isNight: false,
  fires: [],
  terrain: null,
};

function view(patch: Partial<CreatureView> = {}): CreatureView {
  return {
    id: 1,
    kind: 'wolf',
    x: 10,
    y: 2,
    z: -5,
    yaw: 0.5,
    speed: 0,
    state: 'idle',
    attackPhase: 0,
    hitFlash: 0,
    health: 70,
    maxHealth: 70,
    radius: 0.4,
    height: 0.8,
    dead: false,
    deadSeconds: 0,
    ...patch,
  };
}

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
    const combat = new CombatSystem(events, new Inventory(), new CreatureSystem(events));
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

describe('CreatureLayer (yer tutucu)', () => {
  it('görünümleri türüne göre çizer, fazlasını sınırlar ve dispose eder', () => {
    const layer = new CreatureLayer();
    expect(layer.group.children).toHaveLength(CREATURE_KINDS.length);
    layer.update([
      view({ id: 1, kind: 'wolf' }),
      view({ id: 2, kind: 'wolf', dead: true, state: 'dead', hitFlash: 1 }),
      view({ id: 3, kind: 'brown_bear' }),
    ]);
    expect(layer.stats.instances).toBe(3);
    layer.update([]);
    expect(layer.stats.instances).toBe(0);

    const many = Array.from({ length: CREATURES.maxActive + 10 }, (_, i) => view({ id: i }));
    layer.update(many);
    expect(layer.stats.instances).toBe(CREATURES.maxActive);

    layer.dispose();
    expect(layer.group.children).toHaveLength(0);
  });
});
