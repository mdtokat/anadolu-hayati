import { describe, expect, it } from 'vitest';
import {
  damageAt,
  pitchUp,
  rayBox,
  spreadDirection,
  traceProjectile,
  zeroElevation,
  type SolidBox,
} from '../src/combat/ballistics';
import { fireShot, fireVolley } from '../src/combat/ranged';
import { buildingSolids, shotSolids } from '../src/combat/shotSolids';
import type { HitTarget, TargetProvider } from '../src/combat/targets';
import { RANGED } from '../src/config';
import { StructureSet } from '../src/placement/structures';
import type { Building } from '../src/settlements/layout';
import { createRandom } from '../src/utils/random';

/** Faz 11.5 balistik: düşüş, menzil, isabet sınırları (arazi, katı), saçılma, sıfırlama, hasar azalması. */

const deep = () => -1000; // zemin çok aşağıda: mermi menzil sonuna kadar uçar
const flat = () => 0;
const g = RANGED.gravity;

function provider(targets: HitTarget[]): Pick<TargetProvider, 'targetsNear'> {
  return {
    targetsNear: (x, z, r) => targets.filter((t) => Math.hypot(t.x - x, t.z - z) <= r + t.radius),
  };
}
const none = provider([]);

const target = (id: string, x: number, z: number, y = 0): HitTarget => ({
  id,
  kind: 'creature',
  x,
  y,
  z,
  radius: 0.5,
  height: 1.8,
});

const eye = { x: 0, y: 1.6, z: 0 };
const north = { x: 0, y: 0, z: -1 };

describe('düşüş ve menzil', () => {
  it('tüfek mermisi 200 m yatay atışta g·t²/2 kadar düşer (~0,4 m)', () => {
    const shot = fireShot(eye, north, 'rifle', { heightAt: deep, targets: none, range: 200 });
    const t = 200 / RANGED.weapons.rifle.speed;
    expect(shot.distance).toBeCloseTo(200, 6);
    expect(eye.y - shot.point.y).toBeCloseTo(0.5 * g * t * t, 2);
    expect(eye.y - shot.point.y).toBeLessThan(0.5);
    expect(shot.time).toBeCloseTo(t, 2);
  });

  it('ok 60 m yatay atışta metrelerce düşer; menzil sonunda durur', () => {
    const shot = fireShot(eye, north, 'bow', { heightAt: deep, targets: none, range: 60 });
    const drop = eye.y - shot.point.y;
    expect(drop).toBeGreaterThan(3.5);
    expect(drop).toBeLessThan(5.5);
    const full = fireShot(eye, north, 'bow', { heightAt: deep, targets: none });
    expect(full.distance).toBeCloseTo(RANGED.weapons.bow.range, 6);
  });

  it('yatay atılan taş düz zemine düşer (menzilinden önce)', () => {
    const shot = fireShot(eye, north, 'slingshot', { heightAt: flat, targets: none });
    expect(shot.terrain).toBe(true);
    expect(shot.point.y).toBeCloseTo(0, 2);
    // Yerden 1,6 m: t = √(2h/g) ≈ 0,57 sn → ~22 m.
    expect(-shot.point.z).toBeGreaterThan(18);
    expect(-shot.point.z).toBeLessThan(26);
  });

  it('kavisli atış: yükseltilerek atılan ok 50 m ötedeki hedefi vurur, düz atılan vurmaz', () => {
    const targets = provider([target('deer', 0, -50)]);
    const straight = fireShot(eye, north, 'bow', { heightAt: flat, targets });
    expect(straight.hit).toBeNull();
    // Göz hizasındaki hedefe düz yolun düşüşünü karşılayan yükseltme.
    const v = RANGED.weapons.bow.speed;
    const angle = 0.5 * Math.asin((g * 50) / (v * v));
    const lofted = fireShot(eye, pitchUp(north, angle), 'bow', { heightAt: flat, targets });
    expect(lofted.hit?.id).toBe('deer');
  });

  it('keskin nişancı: 200 m sıfırlı nişangâh 200 m’de tam, 400 m’de ~0,5 m alçak vurur', () => {
    const v = RANGED.weapons.sniper_rifle.speed;
    const zero = RANGED.weapons.sniper_rifle.zeroMeters;
    const at = (x: number) => {
      const shot = fireShot(eye, north, 'sniper_rifle', {
        heightAt: deep,
        targets: none,
        range: x,
        sighted: true,
      });
      return shot.point.y - eye.y;
    };
    expect(at(zero)).toBeCloseTo(0, 2);
    const expected400 = (g * 400 * (zero - 400)) / (2 * v * v);
    expect(at(400)).toBeCloseTo(expected400, 1);
    expect(at(400)).toBeLessThan(-0.4);
    // Kafaya nişan alınan 400 m'deki hedef yine de gövdeden vurulur.
    const head = { x: 0, y: 1.7, z: -400 };
    const dir = { x: head.x - eye.x, y: head.y - eye.y, z: head.z - eye.z };
    const shot = fireShot(eye, dir, 'sniper_rifle', {
      heightAt: flat,
      targets: provider([target('bear', 0, -400)]),
      sighted: true,
    });
    expect(shot.hit?.id).toBe('bear');
    expect(shot.point.y).toBeLessThan(1.4);
  });

  it('zeroElevation: düz atış yaklaşımı', () => {
    expect(zeroElevation(100, 10, 100)).toBeCloseTo(Math.atan(0.05), 9);
    expect(zeroElevation(0, 10, 100)).toBe(0);
  });
});

describe('isabet sınırları', () => {
  it('tepenin arkasındaki hedef vurulmaz (uzun menzil, düşüşlü yol)', () => {
    const hill = (_x: number, z: number) => (z < -140 && z > -160 ? 4 : 0);
    const shot = fireShot(eye, north, 'sniper_rifle', {
      heightAt: hill,
      targets: provider([target('hidden', 0, -300)]),
    });
    expect(shot.hit).toBeNull();
    expect(shot.terrain).toBe(true);
    expect(shot.point.z).toBeLessThanOrEqual(-140);
  });

  it('duvarın (katı kutu) arkasındaki hedef vurulmaz; kutusuz vurulur', () => {
    const wall: SolidBox = { x: 0, z: -10, hx: 2, hz: 0.1, yaw: 0, y0: 0, y1: 3 };
    const targets = provider([target('t', 0, -20)]);
    const blocked = fireShot(eye, north, 'pistol', {
      heightAt: flat,
      targets,
      solids: { boxesNear: () => [wall] },
    });
    expect(blocked.hit).toBeNull();
    expect(blocked.solid).toBe(true);
    expect(blocked.point.z).toBeCloseTo(-9.9, 2);
    const clear = fireShot(eye, north, 'pistol', { heightAt: flat, targets });
    expect(clear.hit?.id).toBe('t');
    // Duvarın üstünden aşan atış hedefi vurur.
    const low: SolidBox = { ...wall, y1: 1 };
    const over = fireShot(eye, north, 'pistol', {
      heightAt: flat,
      targets,
      solids: { boxesNear: () => [low] },
    });
    expect(over.hit?.id).toBe('t');
  });

  it('rayBox: dönük kutu, içten başlama, ıskalama', () => {
    const box: SolidBox = { x: 0, z: -10, hx: 1, hz: 1, yaw: Math.PI / 4, y0: 0, y1: 2 };
    // 45° dönük kare: köşesi bakışa dönük (√2 ≈ 1,414 önde).
    expect(rayBox({ x: 0, y: 1, z: 0 }, north, box, 100)).toBeCloseTo(10 - Math.SQRT2, 5);
    expect(rayBox({ x: 0, y: 1, z: -10 }, north, box, 100)).toBe(0);
    expect(rayBox({ x: 0, y: 3, z: 0 }, north, box, 100)).toBeNull();
    expect(rayBox({ x: 0, y: 1, z: 0 }, north, box, 5)).toBeNull();
  });

  it('tünelin içinden atış arazi tavanına takılmaz; yüzeydeki atış takılır', () => {
    const mountain = () => 30;
    const inside = { x: 0, y: 1.6, z: 0 };
    const shot = fireShot(inside, north, 'pistol', {
      heightAt: mountain,
      targets: provider([target('t', 0, -20)]),
    });
    expect(shot.hit?.id).toBe('t');
    const shallow = { x: 0, y: 29, z: 0 }; // yüzeyin hemen altı: tünel sayılmaz
    expect(fireShot(shallow, north, 'pistol', { heightAt: mountain, targets: none }).distance).toBe(
      0,
    );
  });
});

describe('saçılma', () => {
  it('spreadDirection koni içinde kalır, birimdir; saçılma 0 ise yön aynı', () => {
    const random = createRandom(7).next;
    for (let i = 0; i < 200; i++) {
      const d = spreadDirection(north, 5, random);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
      const angle = (Math.acos(-d.z) * 180) / Math.PI;
      expect(angle).toBeLessThanOrEqual(5 + 1e-6);
    }
    expect(spreadDirection({ x: 0, y: 0, z: -2 }, 0, random)).toEqual(north);
  });

  it('av tüfeği 8 tane atar; 15 m’de saçılma dairesi içinde dağılır; aynı tohum aynı sonuç', () => {
    const run = () =>
      fireVolley(eye, north, 'shotgun', {
        heightAt: deep,
        targets: none,
        range: 15,
        random: createRandom(42).next,
      });
    const pellets = run();
    expect(pellets).toHaveLength(RANGED.weapons.shotgun.pellets);
    const radius = Math.tan((RANGED.weapons.shotgun.spreadDeg * Math.PI) / 180) * 15 + 0.05;
    const spread = new Set<string>();
    for (const p of pellets) {
      expect(Math.hypot(p.point.x, p.point.y - eye.y)).toBeLessThan(radius);
      spread.add(p.point.x.toFixed(3));
    }
    expect(spread.size).toBe(pellets.length);
    expect(run().map((p) => p.point)).toEqual(pellets.map((p) => p.point));
  });

  it('random verilmezse atış saçılmasız ve deterministik', () => {
    const a = fireShot(eye, north, 'shotgun', { heightAt: deep, targets: none, range: 30 });
    expect(a.point.x).toBe(0);
  });
});

describe('hasar azalması', () => {
  it('menzilin başında tam, sonunda en az oran', () => {
    expect(damageAt(40, 0, 100)).toBe(40);
    expect(damageAt(40, RANGED.falloff.start * 100, 100)).toBeCloseTo(40, 9);
    expect(damageAt(40, 100, 100)).toBeCloseTo(40 * RANGED.falloff.min, 9);
    expect(damageAt(40, 200, 100)).toBeCloseTo(40 * RANGED.falloff.min, 9);
  });
});

describe('traceProjectile uç durumları', () => {
  it('hızsız mermi hiçbir yere gitmez', () => {
    const f = traceProjectile(
      { origin: eye, velocity: { x: 0, y: 0, z: 0 }, gravity: g, maxDistance: 10 },
      { heightAt: flat, targets: none },
    );
    expect(f.distance).toBe(0);
    expect(f.path).toHaveLength(1);
  });

  it('yol köşeleri başlangıçtan bitişe sıralı; son köşe durma noktası', () => {
    const shot = fireShot(eye, north, 'bow', { heightAt: flat, targets: none });
    const path = shot.path ?? [];
    expect(path[0]).toEqual(eye);
    expect(path[path.length - 1]).toEqual(shot.point);
    for (let i = 1; i < path.length; i++) {
      expect(path[i]!.z).toBeLessThan(path[i - 1]!.z);
    }
  });
});

describe('shotSolids', () => {
  it('oyuncu yapısının katı kutuları dünyaya taşınır; ateş/sundurma katı değildir', () => {
    const set = new StructureSet();
    set.add('wall', 10, 2, -5, 0);
    set.add('campfire', 30, 0, 0, 0);
    const query = shotSolids(set, null);
    const near = query.boxesNear(10, -5, 3);
    expect(near.length).toBeGreaterThan(0);
    for (const b of near) {
      expect(b.y0).toBeGreaterThanOrEqual(1.5);
      expect(Math.hypot(b.x - 10, b.z + 5)).toBeLessThan(2);
    }
    expect(query.boxesNear(30, 0, 1)).toHaveLength(0);
    // Duvara ateş edilen mermi duvarda durur.
    const shot = fireShot({ x: 10, y: 3, z: 5 }, north, 'rifle', {
      heightAt: flat,
      targets: none,
      solids: query,
    });
    expect(shot.solid).toBe(true);
    expect(shot.point.z).toBeGreaterThan(-6);
  });

  it('bina kutuları ve yamaçtaki taş temel', () => {
    const b: Building = {
      id: 1,
      settlement: 1,
      kind: 'house',
      x: 0,
      z: -30,
      y: 5,
      base: 2,
      yaw: 0.3,
      ruin: 0,
      ruined: false,
      tone: 0,
      floors: 1,
      name: null,
      stairRun: 0,
    };
    const boxes = buildingSolids(b);
    expect(boxes.length).toBeGreaterThan(1);
    const plinth = boxes[boxes.length - 1]!;
    expect(plinth.y1).toBe(5);
    expect(plinth.y0).toBeLessThan(2);
    const query = shotSolids(null, { buildingsNear: () => [b] });
    const shot = fireShot({ x: 0, y: 6, z: 0 }, north, 'rifle', {
      heightAt: flat,
      targets: provider([target('behind', 0, -60, 5)]),
      solids: query,
    });
    expect(shot.hit).toBeNull();
    expect(shot.solid).toBe(true);
  });
});
