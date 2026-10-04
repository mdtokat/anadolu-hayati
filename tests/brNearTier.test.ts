import { describe, expect, it } from 'vitest';
import { BanditSystem, type BanditContext, type BanditWorld } from '../src/bandits/BanditSystem';
import { createBrain, stepBandit, type BanditSenses } from '../src/bandits/ai';
import type { BanditPlayer } from '../src/bandits/perception';
import { BrArea } from '../src/battleRoyale/area';
import { FarSim, type FarWorld } from '../src/battleRoyale/farSim';
import { BrMatch, PLAYER_ID } from '../src/battleRoyale/match';
import { BrNearTier, banditIdOf, contestantOfBandit } from '../src/battleRoyale/nearTier';
import { planZone } from '../src/battleRoyale/zone';
import { TargetRegistry, playerTargetProvider } from '../src/combat/targets';
import { BATTLE_ROYALE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import type { ProvinceShape } from '../src/data/region';
import { createRandom } from '../src/utils/random';

const DT = 1 / 60;
const GRACE = BATTLE_ROYALE.far.graceSeconds;

/** 2 km × 2 km düz il; her yer yürünebilir, ganimet yeri yok (hedef: güvenli dairede rastgele nokta). */
const SQUARE: ProvinceShape = {
  name: 'K',
  iso: 'K',
  inRegion: true,
  polygons: [[Float64Array.from([0, 0, 2000, 0, 2000, 2000, 0, 2000])]],
  bounds: { minX: 0, minZ: 0, maxX: 2000, maxZ: 2000 },
};
const flat: BanditWorld = { heightAt: () => 0, slopeDegAt: () => 0, isSea: () => false };
const farWorld: FarWorld = {
  walkable: (x, z) => x >= 0 && z >= 0 && x <= 2000 && z <= 2000,
  lootSpots: [],
};

interface Options {
  starts: Array<{ id: number; x: number; z: number }>;
  players?: number;
  start?: number;
  ready?: (x: number, z: number) => boolean;
  player?: Partial<BanditPlayer>;
}

function setup(o: Options) {
  const area = new BrArea([SQUARE], ['K'], 8, 0);
  const zone = { plan: planZone(area, createRandom(1), 4, () => true), area };
  const n = o.players ?? Math.max(...o.starts.map((s) => s.id)) + 1;
  const match = new BrMatch(Array.from({ length: n }, (_, i) => (i === 0 ? 'Sen' : `Y${i}`)));
  const t0 = o.start ?? GRACE + 10;
  const far = new FarSim(match, zone, farWorld, 3, o.starts, t0);
  const events = new EventBus<GameEvents>();
  const bandits = new BanditSystem(events, [], flat);
  const tier = new BrNearTier(
    match,
    far,
    bandits,
    { ready: o.ready ?? (() => true) },
    zone,
    'normal',
  );
  const player: BanditPlayer = {
    x: 1000,
    y: 0,
    z: 1000,
    activity: 'rest',
    alive: true,
    sanctuary: false,
    ...o.player,
  };
  const playerDamage: number[] = [];
  const registry = new TargetRegistry();
  registry.register(
    playerTargetProvider({
      position: () => (player.alive ? player : null),
      radius: 0.35,
      height: 1.8,
      damage: (amount) => playerDamage.push(amount),
    }),
  );
  registry.register(bandits);
  let t = t0;
  events.on('bandit:damaged', (e) => {
    const c = contestantOfBandit(e.id);
    if (e.killed && c !== null) tier.onKilled(c, BrNearTier.killerOf(e), e.weapon ?? null, t);
  });
  const ctx = (): BanditContext => ({
    player,
    hour: 12,
    darkness: 0,
    now: 10 * 86_400 + 12 * 3600,
    targets: registry,
    prey: () => [],
  });
  const run = (seconds: number): void => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      t += DT;
      far.update(t);
      tier.update(DT, t, player);
      bandits.update(DT, ctx());
    }
  };
  return { match, far, bandits, tier, player, playerDamage, run, now: () => t };
}

describe('yakın kademe', () => {
  it('oyuncuya yakın NPC yarışmacıya dönüşür (uzaktaki değil); uzaklaşınca durumu korunarak geri döner', () => {
    const near = { id: 1, x: 1100, z: 1000 };
    const farAway = { id: 2, x: 1000, z: 1000 + BATTLE_ROYALE.near.radius + 200 };
    const t = setup({ starts: [near, farAway] });
    t.run(0.1);
    expect(t.tier.isNear(1)).toBe(true);
    expect(t.tier.isNear(2)).toBe(false);
    expect(t.far.get(1)).toBeNull();
    const view = t.bandits.views().find((v) => v.contestant === 1);
    expect(view).toMatchObject({ name: 'Y1', id: banditIdOf(1) });
    t.bandits.drainContestant(1, 30); // can kaybı uzak kayda taşınmalı
    t.player.x = 1000 - BATTLE_ROYALE.near.radius - BATTLE_ROYALE.near.margin - 300;
    t.run(0.1);
    expect(t.tier.isNear(1)).toBe(false);
    expect(t.bandits.views().some((v) => v.contestant === 1)).toBe(false);
    expect(t.far.get(1)?.health).toBeCloseTo(70, 0);
  });

  it('karo hazır değilse dönüşmez; en çok maxAgents yarışmacı', () => {
    const starts = Array.from({ length: BATTLE_ROYALE.near.maxAgents + 6 }, (_, i) => ({
      id: i + 1,
      x: 1000 + Math.cos(i) * (40 + i * 8),
      z: 1000 + Math.sin(i) * (40 + i * 8),
    }));
    const blocked = setup({ starts, ready: () => false });
    blocked.run(0.1);
    expect(blocked.tier.ids).toHaveLength(0);
    const open = setup({ starts });
    open.run(0.1);
    expect(open.tier.aliveCount).toBe(BATTLE_ROYALE.near.maxAgents);
    // En yakınlar seçilir.
    const nearest = [...starts]
      .sort((a, b) => Math.hypot(a.x - 1000, a.z - 1000) - Math.hypot(b.x - 1000, b.z - 1000))
      .slice(0, BATTLE_ROYALE.near.maxAgents)
      .map((s) => s.id)
      .sort((a, b) => a - b);
    expect([...open.tier.ids].sort((a, b) => a - b)).toEqual(nearest);
  });

  it('iki yarışmacı birbirini görünce çatışır; ölüm öldürenle maça yazılır, ceset kalır', () => {
    // Oyuncu görüş menzilinin (70 m) dışında, ama yakın kademe yarıçapında.
    const t = setup({
      starts: [
        { id: 1, x: 1000, z: 800 },
        { id: 2, x: 1010, z: 800 },
      ],
      players: 3,
      player: { x: 1000, z: 1000 },
    });
    for (let i = 0; i < 90 && t.match.eliminations.length === 0; i++) t.run(1);
    expect(t.match.aliveCount).toBe(2); // biri öldü (oyuncu + kazanan)
    const e = t.match.eliminations[0]!;
    expect(e.cause).toBe('kill');
    expect([1, 2]).toContain(e.killer);
    expect(e.killer).not.toBe(e.victim);
    expect(e.weapon).toBe('club'); // eli boş başlayan yarışmacı sopayla
    expect(t.match.contestants[e.killer!]!.kills).toBe(1);
    // Ceset yakın kademede kalır.
    expect(t.bandits.views().find((v) => v.contestant === e.victim)?.state).toBe('dead');
  });

  it('ateşkes boyunca kimse saldırmaz; sonra oyuncuya saldırır', () => {
    const t = setup({
      starts: [{ id: 1, x: 1000, z: 990 }],
      start: 0,
      player: { activity: 'walk' },
    });
    // Oyuncu yarışmacının hemen yanında yürür (duyulur, görülür).
    t.run(0.1);
    const follow = (seconds: number): void => {
      for (let i = 0; i < seconds; i++) {
        const c = t.bandits.contestantState(1)!;
        t.player.x = c.x + 4;
        t.player.z = c.z;
        t.run(1);
      }
    };
    follow(GRACE - 5);
    expect(t.playerDamage).toHaveLength(0);
    follow(30);
    expect(t.playerDamage.length).toBeGreaterThan(0);
  });

  it('oyuncunun öldürdüğü yarışmacı oyuncuya yazılır', () => {
    const t = setup({ starts: [{ id: 1, x: 1000, z: 900 }] });
    t.run(0.1);
    t.bandits.applyHit(`bandit:${banditIdOf(1)}`, 500, {
      x: 1000,
      y: 0,
      z: 1000,
      by: 'player',
      weapon: 'rifle',
    });
    expect(t.match.eliminations[0]).toMatchObject({
      victim: 1,
      killer: PLAYER_ID,
      cause: 'kill',
      weapon: 'rifle',
    });
    expect(t.match.player.kills).toBe(1);
  });

  it('bölge dışındaki yakın yarışmacı bölgeden ölür', () => {
    const t = setup({ starts: [{ id: 1, x: 1000, z: 950 }], players: 3 });
    const plan = (t.far as unknown as { zone: { plan: { total: number } } }).zone.plan;
    t.run(0.1);
    expect(t.tier.isNear(1)).toBe(true);
    // Zamanı bölgenin kapandığı ana sar (kapanmış daire her yerde hasar verir).
    for (let i = 0; i < 4 && t.match.isAlive(1); i++) {
      const tier = t.tier;
      tier.update(30, plan.total + 10 + i * 30, t.player);
    }
    expect(t.match.isAlive(1)).toBe(false);
    expect(t.match.eliminations[0]).toMatchObject({ victim: 1, cause: 'zone', killer: null });
  });

  it('sakin yarışmacı hedefine yürür; takılırsa yeni hedef seçer', () => {
    const t = setup({ starts: [{ id: 1, x: 1000, z: 1100 }], player: { x: 1000, z: 1300 } });
    t.run(0.2);
    const before = t.bandits.contestantState(1)!;
    t.run(10);
    const after = t.bandits.contestantState(1)!;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(5);
  });

  it('returnAll ve clear', () => {
    const t = setup({
      starts: [
        { id: 1, x: 1050, z: 1000 },
        { id: 2, x: 950, z: 1000 },
      ],
    });
    t.run(0.1);
    expect(t.tier.aliveCount).toBe(2);
    t.tier.returnAll();
    expect(t.tier.ids).toHaveLength(0);
    expect(t.far.get(1)).not.toBeNull();
    expect(t.far.get(2)).not.toBeNull();
    t.run(0.1);
    t.tier.clear();
    expect(t.bandits.views()).toHaveLength(0);
  });
});

describe('yarışmacı yapay zekâsı (ai.ts eklemeleri)', () => {
  const senses = (patch: Partial<BanditSenses> = {}): BanditSenses => ({
    player: null,
    noise: null,
    activity: 'travel',
    home: { x: 0, z: -50, yaw: 0 },
    camp: { x: 0, z: -50 },
    prey: null,
    ...patch,
  });

  it('travel: hedefe verilen hızla gider, varınca durur', () => {
    const brain = createBrain(0, 0, 0, 'club', 'member', 'travel');
    const step = stepBandit(brain, senses({ travelSpeed: 4.6 }), 1 / 60, createRandom(1));
    expect(step.next.state).toBe('travel');
    expect(step.intent.speed).toBeCloseTo(4.6);
    const there = createBrain(0, -49.5, 0, 'club', 'member', 'travel');
    expect(stepBandit(there, senses(), 1 / 60, createRandom(1)).intent.speed).toBe(0);
  });

  it('noSurrender: ağır yaralı yarışmacı teslim olmaz (eşkıya olur)', () => {
    const player = { x: 0, z: -5, dist: 5, visible: true, heard: true };
    const bandit = { ...createBrain(0, 0, 0, 'pistol', 'member', 'patrol'), health: 5 };
    expect(stepBandit(bandit, senses({ player }), 1 / 60, createRandom(1)).next.state).toBe(
      'surrender',
    );
    const contestant = { ...bandit, noSurrender: true };
    expect(stepBandit(contestant, senses({ player }), 1 / 60, createRandom(1)).next.state).not.toBe(
      'surrender',
    );
  });
});
