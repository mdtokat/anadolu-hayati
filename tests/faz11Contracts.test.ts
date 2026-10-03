import { describe, expect, it, vi } from 'vitest';
import { CREATURES, RANGED } from '../src/config';
import { fireShot, rayCylinder, rayTerrain } from '../src/combat/ranged';
import {
  TargetRegistry,
  creatureTargetProvider,
  playerTargetProvider,
  type HitTarget,
  type TargetProvider,
} from '../src/combat/targets';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import type { CreatureContext } from '../src/creatures/kinds';
import { WEAPON_IDS, WeaponState, isWeaponId } from '../src/items/weaponState';
import { NO_OBSTACLES } from '../src/placement/obstacles';
import { fakeTerrain } from './helpers/fakeTerrain';

/** Faz 11 (11.0) ortak arayüzleri: hedefler, `fireShot`, silah durumu, engel sorgusu, gürültü kaçışı. */

const flat = () => 0;

function staticProvider(targets: HitTarget[]): TargetProvider & { hits: string[] } {
  const hits: string[] = [];
  return {
    hits,
    targetsNear: (x, z, r) => targets.filter((t) => Math.hypot(t.x - x, t.z - z) <= r + t.radius),
    applyHit: (id) => {
      if (targets.some((t) => t.id === id)) hits.push(id);
    },
  };
}

const target = (id: string, x: number, z: number, y = 0): HitTarget => ({
  id,
  kind: 'bandit',
  x,
  y,
  z,
  radius: 0.4,
  height: 1.8,
});

describe('fireShot (11.0 hitscan)', () => {
  const eye = { x: 0, y: 1.6, z: 0 };
  const north = { x: 0, y: 0, z: -1 };

  it('önündeki hedefi vurur; en yakın hedef kazanır', () => {
    const targets = staticProvider([target('a', 0, -30), target('b', 0, -10)]);
    const shot = fireShot(eye, north, 'rifle', { heightAt: flat, targets });
    expect(shot.hit?.id).toBe('b');
    expect(shot.terrain).toBe(false);
    expect(shot.distance).toBeCloseTo(9.6, 1);
  });

  it('menzil dışındaki ya da yan taraftaki hedefi vurmaz', () => {
    const targets = staticProvider([target('far', 0, -50), target('side', 3, -10)]);
    const shot = fireShot(eye, north, 'pistol', { heightAt: flat, targets, range: 40 });
    expect(shot.hit).toBeNull();
    expect(shot.distance).toBe(40);
  });

  it('arazinin (tepenin) arkasındaki hedef vurulmaz; mermi araziye gömülür', () => {
    const hill = (_x: number, z: number) => (z < -15 && z > -25 ? 5 : 0);
    const targets = staticProvider([target('hidden', 0, -40)]);
    const shot = fireShot(eye, north, 'rifle', { heightAt: hill, targets });
    expect(shot.hit).toBeNull();
    expect(shot.terrain).toBe(true);
    expect(shot.point.z).toBeLessThanOrEqual(-15);
    expect(shot.point.z).toBeGreaterThan(-16);
  });

  it('atanın kendisi (ignore) vurulmaz; yöne bakılmaksızın sıfır yön atış değildir', () => {
    const targets = staticProvider([target('self', 0, 0), target('other', 0, -5)]);
    const shot = fireShot(eye, north, 'pistol', { heightAt: flat, targets, ignore: 'self' });
    expect(shot.hit?.id).toBe('other');
    const none = fireShot(eye, { x: 0, y: 0, z: 0 }, 'pistol', { heightAt: flat, targets });
    expect(none).toMatchObject({ hit: null, distance: 0, terrain: false });
  });

  it('aşağı ateş edilen mermi zemine iner; varsayılan menzil silahın menzilidir', () => {
    const down = fireShot(eye, { x: 0, y: -1, z: -1 }, 'shotgun', {
      heightAt: flat,
      targets: staticProvider([]),
    });
    expect(down.terrain).toBe(true);
    expect(down.point.y).toBeCloseTo(0, 2);
    const air = fireShot(eye, { x: 0, y: 1, z: -1 }, 'shotgun', {
      heightAt: flat,
      targets: staticProvider([]),
    });
    expect(air.distance).toBe(RANGED.weapons.shotgun.range);
  });

  it('rayCylinder ve rayTerrain uç durumları', () => {
    const c = { x: 0, y: 0, z: -5, radius: 0.5, height: 2 };
    expect(rayCylinder({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: -1 }, c, 100)).toBeNull(); // üstünden
    expect(rayCylinder({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, c, 100)).toBeNull(); // arkasında
    expect(rayCylinder({ x: 0, y: 5, z: -5 }, { x: 0, y: -1, z: 0 }, c, 100)).toBeCloseTo(3); // tepeden
    expect(rayTerrain({ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: -1 }, 10, flat)).toBe(0);
  });
});

describe('TargetRegistry ve sağlayıcılar', () => {
  it('kayıtlı sağlayıcıların hedeflerini birleştirir, isabeti sahibine yönlendirir; kayıt kaldırılabilir', () => {
    const registry = new TargetRegistry();
    const a = staticProvider([target('a', 0, -5)]);
    const b = staticProvider([target('b', 0, -8)]);
    registry.register(a);
    const off = registry.register(b);
    expect(registry.targetsNear(0, 0, 10).map((t) => t.id)).toEqual(['a', 'b']);
    registry.applyHit('b', 10, { x: 0, y: 0, z: 0, by: 'player' });
    expect(a.hits).toEqual([]);
    expect(b.hits).toEqual(['b']);
    off();
    expect(registry.targetsNear(0, 0, 10).map((t) => t.id)).toEqual(['a']);
  });

  it('oyuncu sağlayıcısı: menzildeyse hedef verir, ölüyken vermez; isabet hasara gider', () => {
    let alive = true;
    const damage = vi.fn();
    const provider = playerTargetProvider({
      position: () => (alive ? { x: 2, y: 0, z: 0 } : null),
      radius: 0.35,
      height: 1.8,
      damage,
    });
    expect(provider.targetsNear(0, 0, 5)).toHaveLength(1);
    expect(provider.targetsNear(20, 0, 5)).toHaveLength(0);
    provider.applyHit('player', 12, { x: 0, y: 0, z: 0, by: 'bandit', weapon: 'pistol' });
    expect(damage).toHaveBeenCalledWith(12, expect.objectContaining({ by: 'bandit' }));
    provider.applyHit('creature:1', 12, { x: 0, y: 0, z: 0, by: 'bandit' });
    expect(damage).toHaveBeenCalledTimes(1);
    alive = false;
    expect(provider.targetsNear(0, 0, 5)).toHaveLength(0);
  });

  it('canlı sağlayıcısı: yaşayan canlıyı hedef verir, isabet canlıya hasar verir, leş hedef değildir', () => {
    const system = new CreatureSystem();
    const ctx = quietContext();
    system.update(1 / 60, ctx);
    const id = system.spawnAt('wild_boar', 0, -10)!;
    const provider = creatureTargetProvider(system);
    const found = provider.targetsNear(0, -10, 5);
    expect(found.map((t) => t.id)).toEqual([`creature:${id}`]);
    expect(found[0]).toMatchObject({ kind: 'creature', x: 0, z: -10 });
    const terrain = ctx.terrain!;
    const muzzle = { x: 0, y: found[0]!.y + found[0]!.height / 2, z: 0 };
    const shot = fireShot(muzzle, { x: 0, y: 0, z: -1 }, 'rifle', {
      heightAt: (x, z) => terrain.heightAt(x, z) - 5, // düz zemin altında (yalnızca hedef sınanır)
      targets: provider,
    });
    expect(shot.hit?.id).toBe(`creature:${id}`);
    provider.applyHit(shot.hit!.id, 1000, { x: 0, y: 0, z: 0, by: 'player', weapon: 'rifle' });
    expect(system.views().find((v) => v.id === id)?.dead).toBe(true);
    expect(provider.targetsNear(0, -10, 5)).toEqual([]);
  });
});

describe('WeaponState', () => {
  it('silah kimlikleri RANGED tablosuyla aynı; kapasiteye kırpar, harcar, kaydeder', () => {
    expect([...WEAPON_IDS].sort()).toEqual(Object.keys(RANGED.weapons).sort());
    expect(isWeaponId('rifle')).toBe(true);
    expect(isWeaponId('club')).toBe(false);
    const state = new WeaponState();
    expect(state.loaded('pistol')).toBe(0);
    expect(state.set('pistol', 99)).toBe(RANGED.weapons.pistol.magazine);
    expect(state.consume('pistol')).toBe(true);
    expect(state.loaded('pistol')).toBe(RANGED.weapons.pistol.magazine - 1);
    expect(state.consume('rifle')).toBe(false);
    const save = state.toSave();
    expect(save).toEqual({
      loaded: { pistol: RANGED.weapons.pistol.magazine - 1 },
      suppressed: [],
    });
    const other = new WeaponState();
    other.loadSave(save);
    expect(other.loaded('pistol')).toBe(RANGED.weapons.pistol.magazine - 1);
    other.loadSave({ loaded: {} });
    expect(other.toSave()).toEqual({ loaded: {}, suppressed: [] });
  });
});

describe('ObstacleQuery (11.0)', () => {
  it('varsayılan sorguda hiçbir şey engel değildir', () => {
    expect(NO_OBSTACLES.blocked(0, 0, 10, 10, 0.5)).toBe(false);
  });
});

function quietContext(): CreatureContext {
  return {
    // Oyuncu ölü: canlılar algılamaz (yalnızca gürültü/ateş tepkisi sınanır).
    player: { x: 0, y: 0, z: 0, activity: 'rest', alive: false },
    hour: 12,
    sunAltitudeDeg: 50,
    isNight: false,
    fires: [],
    terrain: fakeTerrain({ half: 3000, cover: 'urban' }),
  };
}

describe('gürültü kaçışı (noise:made → CreatureSystem.hearNoise)', () => {
  it('yarıçap içindeki canlılar kaynaktan kaçar, dışındakiler etkilenmez; süre bitince sakinleşir', () => {
    const system = new CreatureSystem();
    const ctx = quietContext();
    system.update(1 / 60, ctx);
    const near = system.spawnAt('roe_deer', 0, -20)!;
    const bear = system.spawnAt('brown_bear', 20, 0)!;
    const far = system.spawnAt('roe_deer', 0, -200)!;
    expect(system.hearNoise(0, 0, 60)).toBe(2);
    for (let i = 0; i < 60; i++) system.update(1 / 60, ctx);
    const state = (id: number) => system.views().find((v) => v.id === id)!;
    expect(state(near).state).toBe('flee');
    expect(state(bear).state).toBe('flee');
    expect(state(far).state).not.toBe('flee');
    // Kaçan karaca kaynaktan uzaklaşır.
    expect(Math.hypot(state(near).x, state(near).z)).toBeGreaterThan(20);
    for (let i = 0; i < 60 * (CREATURES.noiseFleeSeconds + 20); i++) system.update(1 / 60, ctx);
    expect(state(near).state).not.toBe('flee');
    expect(system.hearNoise(0, 0, 0)).toBe(0);
  });
});
