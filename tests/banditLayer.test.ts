import { describe, expect, it } from 'vitest';
import { campLayout, type Camp } from '../src/bandits/camps';
import type { BanditView } from '../src/bandits/kinds';
import { triangleCount } from '../src/world/propGeometry';
import { BanditLayer } from '../src/world/BanditLayer';
import { buildBanditGeometry, buildPickpocketGeometry } from '../src/world/banditGeometry';
import { buildCampGeometry, campSolidBoxes } from '../src/world/campGeometry';

const camp: Camp = {
  id: 5,
  x: 100,
  z: -40,
  yaw: 0.7,
  members: 5,
  leaderWeapon: 'sniper_rifle',
  ambush: null,
};
const slope = (x: number, z: number) => 0.1 * x + 0.05 * z;

function finite(g: { getAttribute(n: string): { array: ArrayLike<number> } }): boolean {
  const a = g.getAttribute('position').array;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}

describe('kamp geometrisi', () => {
  it('tek birleşik geometri, renkli, sonlu, üçgen bütçesi içinde; kamp yarıçapında', () => {
    const layout = campLayout(camp);
    const g = buildCampGeometry(camp, layout, slope, slope(camp.x, camp.z));
    expect(triangleCount(g)).toBeGreaterThan(50);
    expect(triangleCount(g)).toBeLessThan(2500);
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    expect(finite(g)).toBe(true);
    g.computeBoundingBox();
    const box = g.boundingBox!;
    expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThan(16);
    g.dispose();
  });

  it('katı kutular: çadırlar ve sandık, zemine oturur', () => {
    const layout = campLayout(camp);
    const boxes = campSolidBoxes(layout, slope);
    expect(boxes).toHaveLength(layout.tents.length + 1);
    for (const b of boxes) {
      expect(b.y - b.hy).toBeLessThanOrEqual(slope(b.x, b.z) + 0.05);
      expect(b.hx).toBeGreaterThan(0.2);
    }
  });
});

describe('eşkıya modelleri ve katman', () => {
  it('her rol ve silah için model; yankesici modeli', () => {
    for (const role of ['leader', 'guard', 'member'] as const) {
      for (const weapon of [
        'pala',
        'club',
        'pistol',
        'shotgun',
        'rifle',
        'sniper_rifle',
      ] as const) {
        const g = buildBanditGeometry(role, weapon);
        expect(finite(g.body)).toBe(true);
        expect(triangleCount(g.body)).toBeLessThan(800);
        g.body.dispose();
        g.leg.dispose();
        g.arm.dispose();
      }
    }
    const p = buildPickpocketGeometry();
    expect(triangleCount(p.body)).toBeGreaterThan(10);
  });

  it('katman eşkıya/yankesici düğümlerini ve kampları eşitler, kaldırılanları siler', () => {
    const layer = new BanditLayer(() => 0);
    const view = (id: number, state: BanditView['state']): BanditView => ({
      id,
      camp: 5,
      name: 'Kara Ali',
      role: 'member',
      weapon: 'pistol',
      x: id,
      y: 0,
      z: 0,
      yaw: 0,
      speed: 0,
      state,
      health: 10,
      maxHealth: 80,
      stride: 0,
      hitFlash: 0,
      searched: false,
    });
    layer.syncPeople([view(1, 'sit'), view(2, 'dead'), view(3, 'surrender')], []);
    layer.syncCamps([{ camp, layout: campLayout(camp), lit: true }], 0);
    expect(layer.stats).toEqual({ bandits: 3, camps: 1 });
    layer.syncPeople([view(1, 'shoot')], []);
    layer.syncCamps([], 1);
    expect(layer.stats).toEqual({ bandits: 1, camps: 0 });
    layer.dispose();
  });
});
