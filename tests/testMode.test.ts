import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER, TEST_MODE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import type { MoveIntent } from '../src/core/inputMapping';
import { GatherSystem } from '../src/interaction/gather';
import { craft, craftStatus, NO_STATIONS } from '../src/items/craft';
import { Inventory } from '../src/items/Inventory';
import { RECIPES } from '../src/items/recipes';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';
import { stepFlight } from '../src/player/movement';
import { Player } from '../src/player/Player';
import type { PropRef } from '../src/world/propKinds';

const DT = 1 / 60;
const idle: MoveIntent = { forward: 0, strafe: 0, run: false, jump: false };
const free = { stations: new Set<never>(), free: true as const };

beforeAll(async () => {
  await initPhysics();
});

describe('test modu: serbest üretim', () => {
  it('istasyon, alet ve malzeme istenmez; girdi tüketilmez; çıktı verilir', () => {
    const inv = new Inventory();
    const wall = RECIPES.wall; // tezgâh + taş balta + malzeme ister
    expect(craftStatus(inv, wall, NO_STATIONS).ok).toBe(false);
    expect(craftStatus(inv, wall, free).ok).toBe(true);
    for (let i = 0; i < 3; i++) expect(craft(inv, wall, free).ok).toBe(true);
    expect(inv.count('wall')).toBe(3);
    expect(inv.count('log')).toBe(0);
  });

  it('çıktıya yer yoksa yine de başarısız olur (no_space)', () => {
    const inv = new Inventory({ slots: 1 });
    inv.add('stick', 1);
    expect(craftStatus(inv, RECIPES.wall, free)).toMatchObject({ ok: false, reason: 'no_space' });
  });

  it('kapalıyken (free yok) normal kurallar geçerli', () => {
    const inv = new Inventory();
    expect(craft(inv, RECIPES.wall, { stations: new Set() })).toMatchObject({ ok: false });
  });
});

describe('test modu: tükenmeyen kaynaklar', () => {
  const tree: PropRef = { id: 4242, kind: 'tree_broadleaf', x: 0, y: 0, z: -2, scale: 1 };
  function setup() {
    const events = new EventBus<GameEvents>();
    const inventory = new Inventory();
    const gather = new GatherSystem(events, inventory);
    const collected: GameEvents['item:collected'][] = [];
    events.on('item:collected', (e) => collected.push(e));
    const hold = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) gather.update(DT, true, tree);
    };
    return { inventory, gather, collected, hold };
  }

  it('balta varsa ağaç tekrar tekrar kesilir ama hiç kalkmaz', () => {
    const { inventory, gather, collected, hold } = setup();
    gather.setUnlimited(true);
    inventory.add('stone_axe', 1);
    hold(5);
    hold(5);
    hold(5);
    expect(collected.every((c) => !c.removed)).toBe(true);
    expect(inventory.count('log')).toBeGreaterThanOrEqual(3);
    expect(gather.isRemoved(tree.id)).toBe(false);
    expect(gather.toSave()).toEqual({ handDone: [], axeDone: [], removed: [] });
  });

  it('balta yoksa elle dal toplanır ve tükenmez; kapatınca normal kurallar döner', () => {
    const { inventory, gather, hold } = setup();
    gather.setUnlimited(true);
    hold(2);
    hold(2);
    expect(inventory.count('stick')).toBeGreaterThanOrEqual(2);
    gather.setUnlimited(false);
    hold(2);
    expect(gather.inspect(tree)?.action).toBe('axe'); // elle verim şimdi sayıldı
  });
});

describe('test modu: uçuş', () => {
  it('stepFlight: Space yukarı, Z aşağı çıkar; tuşsuz havada asılı kalır; Shift hızlandırır', () => {
    let v = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 120; i++) v = stepFlight(v, { ...idle, jump: true }, 0, DT);
    expect(v.y).toBeCloseTo(TEST_MODE.flight.verticalSpeed, 5);
    for (let i = 0; i < 240; i++) v = stepFlight(v, { ...idle, descend: true }, 0, DT);
    expect(v.y).toBeCloseTo(-TEST_MODE.flight.verticalSpeed, 5);
    for (let i = 0; i < 240; i++) v = stepFlight(v, idle, 0, DT);
    expect(Math.abs(v.y)).toBeLessThan(1e-6);

    let walk = { x: 0, y: 0, z: 0 };
    let fast = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 240; i++) {
      walk = stepFlight(walk, { ...idle, forward: 1 }, 0, DT);
      fast = stepFlight(fast, { ...idle, forward: 1, run: true }, 0, DT);
    }
    expect(Math.hypot(walk.x, walk.z)).toBeCloseTo(TEST_MODE.flight.speed, 3);
    expect(Math.hypot(fast.x, fast.z)).toBeCloseTo(TEST_MODE.flight.fastSpeed, 3);
  });

  function world() {
    const physics = new PhysicsWorld();
    physics.addStaticCollider(RAPIER.ColliderDesc.cuboid(200, 1, 200).setTranslation(0, -1, 0));
    const player = new Player(physics, { x: 0, y: 0.05, z: 0 });
    const run = (seconds: number, intent: MoveIntent) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        player.update(DT, intent, 0);
        physics.step();
      }
    };
    return { physics, player, run };
  }

  it('uçuşta yükselir, bırakınca havada asılı kalır; uçuş kapanınca düşer', () => {
    const { physics, player, run } = world();
    player.setFlying(true);
    run(2, { ...idle, jump: true });
    const height = player.position.y;
    expect(height).toBeGreaterThan(10);
    run(1, idle); // tuş bırakılınca ivmeyle durur (kısa süzülme)
    const settled = player.position.y;
    expect(settled - height).toBeLessThan(1.5);
    run(3, idle);
    expect(player.position.y).toBeCloseTo(settled, 2); // yerçekimi yok: havada asılı
    player.setFlying(false);
    run(8, idle);
    expect(player.position.y).toBeLessThan(0.5);
    expect(player.grounded).toBe(true);
    physics.dispose();
  });

  it('uçuşta da zemine ve engellere çarpar (zeminin altına inmez)', () => {
    const { physics, player, run } = world();
    player.setFlying(true);
    run(1, { ...idle, jump: true });
    run(6, { ...idle, descend: true });
    expect(player.position.y).toBeGreaterThan(-0.1);
    expect(player.position.y).toBeLessThan(PLAYER.height);
    physics.dispose();
  });
});
