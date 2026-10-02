import { describe, expect, it } from 'vitest';
import { RangedSystem, type RangedInput } from '../src/combat/RangedSystem';
import { ammoOf, loadRounds, reloadCheck } from '../src/combat/ammo';
import type { HitSource, HitTarget, TargetProvider } from '../src/combat/targets';
import { RANGED } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory } from '../src/items/Inventory';
import type { ItemId } from '../src/items/itemDefs';
import { WeaponState } from '../src/items/weaponState';

/** Faz 11.5: şarjör, doldurma, atış arası, gecikmeli isabet, saçma toplama, nişan/dürbün/nefes. */

const STEP = 1 / 60;

function survivalFake(energy = 100) {
  const s = { alive: true, state: { energy, exhausted: false }, spent: 0 };
  return {
    s,
    survival: {
      get alive() {
        return s.alive;
      },
      get state() {
        return s.state as never;
      },
      spendEnergy(amount: number) {
        s.spent += amount;
        s.state.energy = Math.max(0, s.state.energy - amount);
      },
    },
  };
}

function targetsFake(targets: HitTarget[]) {
  const hits: Array<{ id: string; damage: number; from: HitSource }> = [];
  const provider: TargetProvider = {
    targetsNear: (x, z, r) => targets.filter((t) => Math.hypot(t.x - x, t.z - z) <= r + t.radius),
    applyHit: (id, damage, from) => hits.push({ id, damage, from }),
  };
  return { provider, hits };
}

function setup(items: Array<[ItemId, number]>, energy = 100) {
  const events = new EventBus<GameEvents>();
  const inventory = new Inventory();
  for (const [id, n] of items) inventory.add(id, n);
  const weapons = new WeaponState();
  const { s, survival } = survivalFake(energy);
  // Sabit "rastgele": saçılma deterministik (merkezde).
  const ranged = new RangedSystem(events, inventory, weapons, survival, () => 0);
  const log: string[] = [];
  events.on('weapon:fired', ({ weapon, hits }) => log.push(`fired:${weapon}:${hits}`));
  events.on('weapon:reloaded', ({ weapon, rounds }) => log.push(`reloaded:${weapon}:${rounds}`));
  events.on('weapon:empty', ({ weapon }) => log.push(`empty:${weapon}`));
  events.on('noise:made', ({ radius }) => log.push(`noise:${radius}`));
  return { events, inventory, weapons, ranged, s, log };
}

const input = (held: ItemId | null, extra: Partial<RangedInput> = {}): RangedInput => ({
  held,
  aiming: false,
  steady: false,
  moving: false,
  running: false,
  ...extra,
});

function run(ranged: RangedSystem, seconds: number, inp: RangedInput): void {
  for (let t = 0; t < seconds; t += STEP) ranged.update(STEP, inp);
}

const pose = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 };
const flat = () => 0;
const creature = (id: string, z: number): HitTarget => ({
  id,
  kind: 'creature',
  x: 0,
  y: 0,
  z,
  radius: 0.6,
  height: 1.8,
});

describe('ammo', () => {
  it('doldurma atomik: eksik kadar ve yedek kadar', () => {
    const inv = new Inventory();
    inv.add('pistol_ammo', 5);
    const state = new WeaponState();
    expect(ammoOf('slingshot')).toBe('stone');
    expect(reloadCheck(state, inv, 'pistol')).toBe('ok');
    expect(loadRounds(state, inv, 'pistol')).toBe(5);
    expect(state.loaded('pistol')).toBe(5);
    expect(inv.count('pistol_ammo')).toBe(0);
    expect(reloadCheck(state, inv, 'pistol')).toBe('no_ammo');
    inv.add('pistol_ammo', 20);
    expect(loadRounds(state, inv, 'pistol')).toBe(RANGED.weapons.pistol.magazine - 5);
    expect(reloadCheck(state, inv, 'pistol')).toBe('full');
    expect(loadRounds(state, inv, 'pistol')).toBe(0);
  });
});

describe('RangedSystem', () => {
  it('elde menzilli silah yoksa (ya da envanterde değilse) ateş etmez', () => {
    const { ranged } = setup([['pistol_ammo', 10]]);
    ranged.update(STEP, input('pistol'));
    const { provider } = targetsFake([]);
    expect(ranged.fire(pose, { heightAt: flat, targets: provider }).status).toBe('no_weapon');
    ranged.update(STEP, input(null));
    expect(ranged.hudState()).toBeNull();
  });

  it('boş şarjör + mühimmat: tetik doldurmayı başlatır; süre sonunda şarjör dolar', () => {
    const { ranged, inventory, weapons, log } = setup([
      ['pistol', 1],
      ['pistol_ammo', 20],
    ]);
    const { provider } = targetsFake([]);
    ranged.update(STEP, input('pistol'));
    const r = ranged.fire(pose, { heightAt: flat, targets: provider });
    expect(r).toMatchObject({ status: 'empty', reloadStarted: true });
    expect(ranged.fire(pose, { heightAt: flat, targets: provider }).status).toBe('reloading');
    expect(ranged.reload()).toBe('busy');
    run(ranged, RANGED.weapons.pistol.reloadSeconds * 0.5, input('pistol'));
    expect(ranged.reloading?.progress).toBeGreaterThan(0.4);
    expect(weapons.loaded('pistol')).toBe(0);
    run(ranged, RANGED.weapons.pistol.reloadSeconds * 0.6, input('pistol'));
    expect(weapons.loaded('pistol')).toBe(RANGED.weapons.pistol.magazine);
    expect(inventory.count('pistol_ammo')).toBe(20 - RANGED.weapons.pistol.magazine);
    expect(log).toContain(`reloaded:pistol:${RANGED.weapons.pistol.magazine}`);
    expect(ranged.reload()).toBe('full');
  });

  it('boş şarjör, mühimmat yok: boş tetik olayı', () => {
    const { ranged, log } = setup([['rifle', 1]]);
    const { provider } = targetsFake([]);
    ranged.update(STEP, input('rifle'));
    expect(ranged.reload()).toBe('no_ammo');
    expect(ranged.fire(pose, { heightAt: flat, targets: provider }).status).toBe('empty');
    expect(log).toEqual(['empty:rifle']);
  });

  it('silah değişince doldurma iptal olur, mühimmat düşmez', () => {
    const { ranged, inventory, weapons } = setup([
      ['rifle', 1],
      ['pistol', 1],
      ['rifle_ammo', 10],
    ]);
    ranged.update(STEP, input('rifle'));
    expect(ranged.reload()).toBe('started');
    run(ranged, 1, input('pistol'));
    run(ranged, 3, input('rifle'));
    expect(weapons.loaded('rifle')).toBe(0);
    expect(inventory.count('rifle_ammo')).toBe(10);
  });

  it('atış mermi harcar, atış arası bekletir; isabet uçuş süresi kadar gecikir; gürültü yayınlanır', () => {
    const { ranged, weapons, log } = setup([['rifle', 1]]);
    weapons.set('rifle', 5);
    const { provider, hits } = targetsFake([creature('creature:1', -140)]);
    ranged.update(STEP, input('rifle'));
    const shot = ranged.fire(pose, { heightAt: flat, targets: provider });
    expect(shot.status).toBe('fired');
    expect(shot.shots[0]?.hit?.id).toBe('creature:1');
    expect(shot.recoil).toBeGreaterThan(0);
    expect(weapons.loaded('rifle')).toBe(4);
    expect(log).toEqual(['fired:rifle:1', `noise:${RANGED.noiseRadius.rifle}`]);
    expect(ranged.fire(pose, { heightAt: flat, targets: provider }).status).toBe('cooldown');
    expect(hits).toHaveLength(0);
    expect(ranged.pendingHits).toBe(1);
    run(ranged, 0.1, input('rifle'));
    expect(hits).toHaveLength(0); // 140 m / 700 m/s = 0,2 sn
    run(ranged, 0.15, input('rifle'));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: 'creature:1', from: { by: 'player', weapon: 'rifle' } });
    expect(hits[0]!.damage).toBeCloseTo(RANGED.weapons.rifle.damage, 6);
    run(ranged, RANGED.weapons.rifle.cooldownSeconds, input('rifle'));
    expect(ranged.fire(pose, { heightAt: flat, targets: provider }).status).toBe('fired');
  });

  it('av tüfeği: aynı hedefe isabet eden taneler tek isabette toplanır', () => {
    const { ranged, weapons } = setup([['shotgun', 1]]);
    weapons.set('shotgun', 2);
    const { provider, hits } = targetsFake([creature('creature:2', -5)]);
    ranged.update(STEP, input('shotgun'));
    const shot = ranged.fire(pose, { heightAt: flat, targets: provider });
    expect(shot.shots).toHaveLength(RANGED.weapons.shotgun.pellets);
    run(ranged, 0.1, input('shotgun'));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.damage).toBeCloseTo(
      RANGED.weapons.shotgun.damage * RANGED.weapons.shotgun.pellets,
      6,
    );
  });

  it('yay: atıştan sonra ok varsa kendiliğinden gerilir; enerji harcar; bitkinken atmaz', () => {
    const { ranged, weapons, inventory, s } = setup([
      ['bow', 1],
      ['arrow', 3],
    ]);
    const { provider } = targetsFake([]);
    ranged.update(STEP, input('bow'));
    expect(ranged.reload()).toBe('started');
    run(ranged, RANGED.weapons.bow.reloadSeconds + 0.05, input('bow'));
    expect(weapons.loaded('bow')).toBe(1);
    expect(ranged.fire(pose, { heightAt: flat, targets: provider }).status).toBe('fired');
    expect(s.spent).toBeCloseTo(RANGED.weapons.bow.energyCost, 6);
    expect(ranged.reloading?.weapon).toBe('bow');
    run(ranged, RANGED.weapons.bow.reloadSeconds + 0.05, input('bow'));
    expect(weapons.loaded('bow')).toBe(1);
    expect(inventory.count('arrow')).toBe(1);
    s.state.exhausted = true;
    expect(ranged.fire(pose, { heightAt: flat, targets: provider }).status).toBe('exhausted');
  });

  it('nişan: yumuşak geçiş, saçılmayı azaltır; koşu artırır; dürbün yalnızca keskin nişancıda', () => {
    const { ranged } = setup([
      ['rifle', 1],
      ['sniper_rifle', 1],
    ]);
    run(ranged, 0.02, input('rifle', { aiming: true }));
    expect(ranged.aimFraction).toBeGreaterThan(0);
    expect(ranged.aimFraction).toBeLessThan(1);
    run(ranged, 0.5, input('rifle', { aiming: true }));
    expect(ranged.aimFraction).toBe(1);
    expect(ranged.scoped).toBe(false);
    const aimed = ranged.spreadScale('rifle', input('rifle', { aiming: true }));
    const hip = ranged.spreadScale('rifle', input('rifle'));
    const runningScale = ranged.spreadScale('rifle', input('rifle', { running: true }));
    expect(aimed).toBeLessThan(hip);
    expect(runningScale).toBeGreaterThan(hip);
    run(ranged, 0.5, input('sniper_rifle', { aiming: true }));
    expect(ranged.scoped).toBe(true);
    expect(ranged.hudState()?.scoped).toBe(true);
    run(ranged, 0.5, input('sniper_rifle'));
    expect(ranged.aimFraction).toBe(0);
  });

  it('dürbün salınımı; nefes tutma salınımı azaltır, enerji harcar, süresi biter, toparlanır', () => {
    const { ranged, s } = setup([['sniper_rifle', 1]]);
    const scoped = input('sniper_rifle', { aiming: true });
    const amplitude = (inp: RangedInput) => {
      let max = 0;
      for (let t = 0; t < 2; t += STEP) {
        ranged.update(STEP, inp);
        const sw = ranged.sway;
        max = Math.max(max, Math.abs(sw.yaw), Math.abs(sw.pitch));
      }
      return max;
    };
    run(ranged, 0.5, scoped);
    const free = amplitude(scoped);
    expect(free).toBeGreaterThan(RANGED.sway.amplitude * 0.5);
    const steady = { ...scoped, steady: true };
    const held = amplitude(steady); // 2 sn nefes
    expect(held).toBeLessThan(free * 0.3);
    expect(s.spent).toBeGreaterThan(RANGED.steadyEnergyPerSecond * 1.5);
    run(ranged, RANGED.steadySeconds, steady);
    expect(ranged.hudState()?.breathExhausted).toBe(true);
    expect(ranged.steadying).toBe(false);
    run(ranged, RANGED.breathRecoverSeconds + 0.1, scoped);
    expect(ranged.hudState()?.breathExhausted).toBe(false);
    expect(ranged.hudState()?.breath).toBe(1);
    // Kalçadan salınım yok.
    run(ranged, 0.5, input('sniper_rifle'));
    expect(ranged.sway).toEqual({ yaw: 0, pitch: 0 });
  });

  it('reset uçuştaki isabetleri ve doldurmayı siler, şarjör kalır', () => {
    const { ranged, weapons } = setup([
      ['rifle', 1],
      ['rifle_ammo', 5],
    ]);
    weapons.set('rifle', 2);
    const { provider, hits } = targetsFake([creature('creature:3', -100)]);
    ranged.update(STEP, input('rifle'));
    ranged.fire(pose, { heightAt: flat, targets: provider });
    ranged.reset();
    run(ranged, 1, input('rifle'));
    expect(hits).toHaveLength(0);
    expect(weapons.loaded('rifle')).toBe(1);
  });
});
