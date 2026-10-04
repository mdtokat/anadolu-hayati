import { describe, expect, it } from 'vitest';
import { BanditSystem, type BanditWorld } from '../src/bandits/BanditSystem';
import type { Camp } from '../src/bandits/camps';
import { BrSession, type BrSessionWorld } from '../src/battleRoyale/BrSession';
import { defaultSetup, type BrSetup } from '../src/battleRoyale/kinds';
import { PLAYER_ID } from '../src/battleRoyale/match';
import { banditIdOf } from '../src/battleRoyale/nearTier';
import { BATTLE_ROYALE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import type { ProvinceShape } from '../src/data/region';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';

const SQUARE: ProvinceShape = {
  name: 'K',
  iso: 'K',
  inRegion: true,
  polygons: [[Float64Array.from([0, 0, 1500, 0, 1500, 1500, 0, 1500])]],
  bounds: { minX: 0, minZ: 0, maxX: 1500, maxZ: 1500 },
};
const flat: BanditWorld = { heightAt: () => 0, slopeDegAt: () => 0, isSea: () => false };
const inside = (x: number, z: number): boolean => x >= 0 && z >= 0 && x <= 1500 && z <= 1500;
const world: BrSessionWorld = {
  provinces: [SQUARE],
  spawnOpen: inside,
  zoneCenterOk: inside,
  walkable: inside,
  ready: () => true,
  lootSpots: [
    { x: 300, z: 300, radius: 40, richness: 1 },
    { x: 1100, z: 900, radius: 25, richness: 0.75 },
  ],
};

function setup(patch: Partial<BrSetup> = {}) {
  const events = new EventBus<GameEvents>();
  const log: Array<{ name: string; payload: unknown }> = [];
  for (const name of ['br:started', 'br:phase', 'br:eliminated', 'br:ended'] as const) {
    events.on(name, (payload: unknown) => log.push({ name, payload }));
  }
  const camp: Camp = {
    id: 3,
    x: 20,
    z: 20,
    yaw: 0,
    members: 3,
    leaderWeapon: 'shotgun',
    ambush: null,
  };
  const bandits = new BanditSystem(events, [camp], flat);
  const session = new BrSession(
    {
      ...defaultSetup(),
      area: { kind: 'provinces', names: ['K'] },
      players: 12,
      ...patch,
    },
    77,
    world,
    bandits,
    events,
  );
  events.on('bandit:damaged', (e) => session.onBanditDamaged(e));
  return { events, log, bandits, session };
}

const of = (log: Array<{ name: string; payload: unknown }>, name: string) =>
  log.filter((e) => e.name === name).map((e) => e.payload as Record<string, unknown>);

describe('BrSession', () => {
  it('başlangıç: plan, kamplar kapalı, sandıklar, başladı olayı', () => {
    const { session, log, bandits } = setup();
    expect(of(log, 'br:started')).toEqual([{ players: 12, area: 'K' }]);
    expect(session.match.total).toBe(12);
    expect(session.spawn).toEqual(session.plan.spawns[0]);
    expect(session.far.size).toBe(11);
    expect(session.pickups.size).toBeGreaterThan(0);
    expect(session.truce).toBe(true);
    // Kamp eşkıyaları maçta canlanmaz.
    const ctx = {
      player: { x: 20, y: 0, z: 25, activity: 'walk' as const, alive: true, sanctuary: false },
      hour: 12,
      darkness: 0,
      now: 0,
      targets: { targetsNear: () => [], applyHit: () => {} },
      prey: () => [],
    };
    bandits.update(1, ctx);
    expect(bandits.views().filter((v) => v.contestant === undefined)).toHaveLength(0);
  });

  it('bölge hasarı: alan dışında hasar, güvenli dairede yok; aşama olayları', () => {
    const { session, log } = setup();
    const c = session.zone.circle;
    expect(session.update(1, { x: c.x, z: c.z })).toBe(0);
    expect(session.update(1, { x: -50, z: -50 })).toBeGreaterThan(0); // alan dışı
    for (let i = 0; i < 400; i++) session.update(1, { x: c.x, z: c.z });
    const phases = of(log, 'br:phase');
    expect(phases[0]).toEqual({ phase: 0, shrinking: false });
    expect(phases).toContainEqual({ phase: 0, shrinking: true });
  });

  it('oyuncuyu vuran yarışmacı öldürene yazılır; maç hızla sonuçlanır, sonuç bir kez yayınlanır', () => {
    const { session, log } = setup();
    session.update(1, session.spawn);
    session.notePlayerHit({
      x: 0,
      y: 0,
      z: 0,
      by: 'bandit',
      weapon: 'rifle',
      attacker: banditIdOf(4),
    });
    const e = session.onPlayerDied('shot')!;
    expect(e).toMatchObject({ victim: PLAYER_ID, killer: 4, cause: 'kill', weapon: 'rifle' });
    expect(session.finished).toBe(true);
    let done = false;
    for (let i = 0; i < 1000 && !done; i++) done = session.finishStep();
    expect(done).toBe(true);
    expect(session.match.aliveCount).toBe(1);
    session.finishStep();
    const ended = of(log, 'br:ended');
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({ placement: 12, total: 12, kills: 0 });
    expect(ended[0]!.winner).toBe(session.match.winner!.name);
    expect(of(log, 'br:eliminated').filter((p) => p.player)).toHaveLength(1);
  });

  it('ölüm nedenleri: bölge ve hayvan; eski isabet öldürene yazılmaz', () => {
    const zone = setup().session;
    expect(zone.onPlayerDied('zone')).toMatchObject({ cause: 'zone', killer: null });
    const animal = setup().session;
    expect(animal.onPlayerDied('mauled')).toMatchObject({ cause: 'animal', killer: null });
    const stale = setup().session;
    stale.notePlayerHit({ x: 0, y: 0, z: 0, by: 'bandit', attacker: banditIdOf(2) });
    for (let i = 0; i < 30; i++) stale.update(1, stale.zone.circle);
    expect(stale.onPlayerDied('shot')).toMatchObject({ killer: null, cause: 'other' });
  });

  it('oyuncu tek kalınca kazanır (sıra 1)', () => {
    const { session, log } = setup({ players: 3 });
    session.match.eliminate(1, PLAYER_ID, 'kill', 'pistol', 1);
    session.match.eliminate(2, PLAYER_ID, 'kill', 'pistol', 2);
    session.update(0.1, session.zone.circle);
    expect(of(log, 'br:ended')).toEqual([{ placement: 1, total: 3, kills: 2, winner: 'Sen' }]);
  });

  it('uzakta ölenin çantası yerdeki ganimete eklenir', () => {
    const { session } = setup({ players: 30 });
    const before = session.pickups.size;
    for (let i = 0; i < 900 && session.far.drops.length === 0; i++)
      session.update(1, { x: -3000, z: -3000 });
    expect(session.far.drops.length).toBeGreaterThan(0);
    expect(session.pickups.size).toBe(before + session.far.drops.length);
  });

  it('dispose: yarışmacılar kalkar, kamp eşkıyaları geri gelir', () => {
    const { session, bandits } = setup();
    session.update(0.1, { x: 300, z: 300 }); // yakındakiler yarışmacıya döner
    session.dispose();
    expect(bandits.views().some((v) => v.contestant !== undefined)).toBe(false);
    bandits.update(1, {
      player: { x: 20, y: 0, z: 25, activity: 'walk', alive: true, sanctuary: false },
      hour: 12,
      darkness: 0,
      now: 0,
      targets: { targetsNear: () => [], applyHit: () => {} },
      prey: () => [],
    });
    expect(bandits.views().length).toBeGreaterThan(0);
  });
});

describe('hayatta kalma dondurma (Battle Royale)', () => {
  it('ihtiyaçlar donukken tokluk/su/ısı değişmez, can ve enerji çalışır; saat donabilir', () => {
    const survival = new SurvivalSystem();
    survival.setFreeze({ needs: true, clock: true });
    const before = survival.state;
    const hour = survival.clock.hour;
    for (let i = 0; i < 60 * 60; i++) {
      survival.update(1 / 60, { activity: 'run', elevationM: 2000, drinking: false });
    }
    expect(survival.state.satiety).toBe(before.satiety);
    expect(survival.state.hydration).toBe(before.hydration);
    expect(survival.state.bodyTemp).toBe(before.bodyTemp);
    expect(survival.state.energy).toBeLessThan(before.energy);
    expect(survival.clock.hour).toBe(hour);
    survival.applyDamage(500, 'zone');
    expect(survival.deathInfo?.cause).toBe('zone');
  });
});

describe('BanditSystem: kamplar kapalı (Battle Royale)', () => {
  it('setWildEnabled(false) kampları kaldırır, yarışmacıları bırakır', () => {
    const events = new EventBus<GameEvents>();
    const bandits = new BanditSystem(
      events,
      [{ id: 1, x: 0, z: 0, yaw: 0, members: 3, leaderWeapon: 'shotgun', ambush: null }],
      flat,
    );
    const ctx = {
      player: { x: 0, y: 0, z: 30, activity: 'walk' as const, alive: true, sanctuary: false },
      hour: 12,
      darkness: 0,
      now: 0,
      targets: { targetsNear: () => [], applyHit: () => {} },
      prey: () => [],
    };
    bandits.update(1, ctx);
    expect(bandits.views().length).toBe(3);
    bandits.spawnContestant({
      contestant: 5,
      name: 'Y',
      x: 10,
      z: 10,
      yaw: 0,
      weapon: 'club',
      health: 100,
      maxHealth: BATTLE_ROYALE.near.maxHealth,
      aimScale: 1,
    });
    bandits.setWildEnabled(false);
    bandits.update(1, ctx);
    expect(bandits.views().map((v) => v.contestant)).toEqual([5]);
  });
});
