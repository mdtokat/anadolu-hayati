import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import type { CreatureContext } from '../src/creatures/kinds';
import { fenceYawForAxis } from '../src/placement/fences';
import { StructureObstacles } from '../src/placement/obstacles';
import { StructureSet } from '../src/placement/structures';
import { fakeTerrain } from './helpers/fakeTerrain';

const DT = 1 / 60;
/** Kare ağıl: merkez (0, −60), kenar 12 m (6 çit/kenar). */
const PEN = { cx: 0, cz: -60, half: 6 };

/** Çitle çevrili kare ağıl; `gateOpen` = kuzey kenarın ortasında açık çit kapısı. */
function pen(gate: 'none' | 'closed' | 'open') {
  const set = new StructureSet();
  const { cx, cz, half } = PEN;
  const xs = [-5, -3, -1, 1, 3, 5];
  for (const x of xs) {
    const north = gate !== 'none' && x === 1 ? 'fence_gate' : 'wood_fence';
    const g = set.add(north, cx + x, 0, cz - half, fenceYawForAxis('x'));
    if (north === 'fence_gate' && gate === 'open') set.toggleDoor(g.id);
    set.add('wood_fence', cx + x, 0, cz + half, fenceYawForAxis('x'));
  }
  for (const z of xs) {
    set.add('wood_fence', cx - half, 0, cz + z, fenceYawForAxis('z'));
    set.add('wood_fence', cx + half, 0, cz + z, fenceYawForAxis('z'));
  }
  return { set, obstacles: new StructureObstacles(set) };
}

function context(
  obstacles?: StructureObstacles,
  fires: CreatureContext['fires'] = [],
): CreatureContext {
  return {
    // Oyuncu 210 m uzakta (despawn yarıçapı içinde ama algı dışı): canlı yalnızca ateşten/dolaşmadan hareket eder.
    player: { x: 0, y: 0, z: 150, activity: 'rest', alive: true, yaw: 0 },
    hour: 12,
    sunAltitudeDeg: 50,
    isNight: false,
    fires,
    terrain: fakeTerrain({ half: 3000, cover: 'urban' }),
    ...(obstacles ? { obstacles } : {}),
  };
}

function inside(x: number, z: number, margin = 0): boolean {
  return Math.abs(x - PEN.cx) < PEN.half + margin && Math.abs(z - PEN.cz) < PEN.half + margin;
}

function simulate(obstacles: StructureObstacles | undefined, seconds: number) {
  const system = new CreatureSystem(new EventBus<GameEvents>());
  const fire = { x: PEN.cx, z: PEN.cz + 3 }; // ağılın güneyinden kuzeye (−Z) kaçırır
  const ctx = context(obstacles, [fire]);
  system.update(DT, ctx);
  const ids = [
    system.spawnAt('roe_deer', PEN.cx - 2, PEN.cz + 1, 0),
    system.spawnAt('roe_deer', PEN.cx + 2, PEN.cz + 2, 0),
    system.spawnAt('wild_boar', PEN.cx, PEN.cz + 3.5, 0),
  ].filter((id): id is number => id !== null);
  let escaped = 0;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    system.update(DT, ctx);
    if (i % 30 === 0) {
      for (const v of system.views()) {
        if (ids.includes(v.id) && !inside(v.x, v.z, 0.3)) escaped++;
      }
    }
  }
  return { escaped, alive: system.views().filter((v) => ids.includes(v.id)).length };
}

describe('çit: canlılar çitin içinden geçmez', () => {
  it('kapalı ağılda hayvanlar dışarı çıkamaz', () => {
    const closed = pen('closed');
    const { escaped, alive } = simulate(closed.obstacles, 60);
    expect(alive).toBeGreaterThan(0);
    expect(escaped).toBe(0);
  });

  it('çitsiz aynı sahnede hayvanlar ağıl alanından çıkar (karşılaştırma)', () => {
    const { escaped } = simulate(undefined, 60);
    expect(escaped).toBeGreaterThan(0);
  });

  it('kapı açıkken çıkış mümkündür (kapalıyla aynı kurulum, tek fark kapı)', () => {
    const open = pen('open');
    const { escaped } = simulate(open.obstacles, 90);
    expect(escaped).toBeGreaterThan(0);
  });
});
