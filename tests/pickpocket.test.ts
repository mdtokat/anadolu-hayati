import { describe, expect, it } from 'vitest';
import { PICKPOCKETS } from '../src/config';
import {
  PickpocketSystem,
  type PickpocketContext,
  type PickpocketWorld,
} from '../src/bandits/pickpocket';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory, type ItemStack } from '../src/items/Inventory';

const DT = 1 / 60;
const town: PickpocketWorld = { heightAt: () => 0, walkable: () => true, townRankAt: () => 'il' };

function setup() {
  const events = new EventBus<GameEvents>();
  const log: string[] = [];
  for (const name of [
    'pickpocket:near',
    'pickpocket:stole',
    'pickpocket:recovered',
    'pickpocket:escaped',
  ] as const) {
    events.on(name, () => log.push(name));
  }
  const system = new PickpocketSystem(events);
  const inventory = new Inventory();
  inventory.add('pekmez', 4);
  inventory.add('stone_axe', 1);
  const deposits: ItemStack[][] = [];
  const player = { x: 0, z: 0, alive: true, sanctuary: false };
  const ctx: PickpocketContext = {
    player,
    inventory,
    held: 'stone_axe',
    deposit: (items) => (deposits.push(items.map((s) => ({ ...s }))), 42),
  };
  const run = (seconds: number, world = town) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      system.bind(ctx);
      system.update(DT, ctx, world);
    }
  };
  return { system, inventory, deposits, player, ctx, run, log };
}

describe('yankesici', () => {
  it('yanaşır, uyarı verir, elde tutulmayan bir eşyanın yarısını çalar ve kaçar', () => {
    const { system, inventory, run, log } = setup();
    system.spawnAt(0, -10, town);
    run(10);
    expect(log.slice(0, 2)).toEqual(['pickpocket:near', 'pickpocket:stole']);
    expect(inventory.count('pekmez')).toBe(2);
    expect(inventory.count('stone_axe')).toBe(1); // elde tutulan çalınmaz
    const p = system.list()[0]!;
    expect(p.state).toBe('flee');
    expect(p.carried).toEqual({ id: 'pekmez', count: 2 });
  });

  it('yakalanınca (oyuncu yetişince) eşya geri gelir', () => {
    const { system, inventory, run, player, log } = setup();
    system.spawnAt(0, -10, town);
    run(10);
    const p = system.list()[0]!;
    player.x = p.x;
    player.z = p.z + 1;
    run(DT);
    expect(log).toContain('pickpocket:recovered');
    expect(inventory.count('pekmez')).toBe(4);
    expect(system.list()[0]?.state).toBe('leave');
  });

  it('vurulunca eşyayı bırakır (envantere döner)', () => {
    const { system, inventory, run } = setup();
    system.spawnAt(0, -10, town);
    run(10);
    const target = system.targetsNear(0, 0, 200)[0]!;
    system.applyHit(target.id, 5, { x: 0, y: 0, z: 0, by: 'player' });
    expect(inventory.count('pekmez')).toBe(4);
  });

  it('kaçarsa eşya en yakın kamp sandığına düşer', () => {
    const { system, deposits, run, log } = setup();
    system.spawnAt(0, -10, town);
    run(10 + PICKPOCKETS.escapeSeconds + 1);
    expect(log).toContain('pickpocket:escaped');
    expect(deposits).toEqual([[{ id: 'pekmez', count: 2 }]]);
    expect(system.list()).toHaveLength(0);
  });

  it('camide yanaşmaz; envanter boşsa çalmadan ayrılır', () => {
    const a = setup();
    a.player.sanctuary = true;
    a.system.spawnAt(0, -10, town);
    a.run(10);
    expect(a.inventory.count('pekmez')).toBe(4);
    expect(a.system.list()[0]?.state ?? 'leave').toBe('leave');
    const b = setup();
    b.ctx.held = null;
    b.inventory.remove('pekmez', 4);
    b.inventory.remove('stone_axe', 1);
    b.system.spawnAt(0, -3, town);
    b.run(5);
    expect(b.log).not.toContain('pickpocket:stole');
  });

  it('yalnızca il/ilçe merkezinde ve ayar açıkken doğar', () => {
    const count = (world: PickpocketWorld, enabled = true) => {
      const s = setup();
      s.system.setEnabled(enabled);
      let seen = 0;
      for (let i = 0; i < 400; i++) {
        s.system.update(PICKPOCKETS.spawnCheckSeconds, s.ctx, world);
        seen += s.system.list().length > 0 ? 1 : 0;
        s.system.clear();
      }
      return seen;
    };
    expect(count(town)).toBeGreaterThan(5);
    expect(count({ ...town, townRankAt: () => 'koy' })).toBe(0);
    expect(count({ ...town, townRankAt: () => null })).toBe(0);
    expect(count(town, false)).toBe(0);
  });

  it('kayıt: kaçmakta olanın taşıdığı yazılır; yüklemede ilk adımda sandığa konur', () => {
    const { system, run, deposits, ctx } = setup();
    system.spawnAt(0, -10, town);
    run(10);
    const save = system.toSave();
    expect(save).toEqual([{ id: 'pekmez', count: 2 }]);
    system.loadSave(save);
    expect(system.list()).toHaveLength(0);
    system.update(DT, ctx, town);
    expect(deposits).toEqual([[{ id: 'pekmez', count: 2 }]]);
    expect(system.toSave()).toEqual([]);
  });
});
