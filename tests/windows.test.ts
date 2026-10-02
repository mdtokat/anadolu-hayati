import { describe, expect, it } from 'vitest';
import { traceProjectile } from '../src/combat/ballistics';
import { buildingPanes, buildingSolids, shotPanes, shotSolids } from '../src/combat/shotSolids';
import type { TargetProvider } from '../src/combat/targets';
import { BUILDING_KINDS, BUILDING_SHAPES, ROOMS } from '../src/settlements/kinds';
import type { Building } from '../src/settlements/layout';
import {
  boxesOverlap,
  paneHole,
  paneId,
  subtractBox,
  subtractHoles,
  windowPanes,
} from '../src/settlements/windows';
import { buildBuildingGeometry } from '../src/world/buildingGeometry';

const none: Pick<TargetProvider, 'targetsNear'> = { targetsNear: () => [] };

function building(kind: Building['kind'], extra: Partial<Building> = {}): Building {
  return {
    id: 7,
    settlement: 0,
    kind,
    x: 10,
    z: 20,
    y: 5,
    base: 5,
    yaw: 0.6,
    ruin: 0,
    ruined: false,
    tone: 0.5,
    floors: 4,
    name: null,
    stairRun: 0,
    ...extra,
  };
}

const volume = (b: { hx: number; hy: number; hz: number }) => 8 * b.hx * b.hy * b.hz;

describe('kutu çıkarma (pencere deliği)', () => {
  it('hacim korunur: parçalar + kesişim = kutu; parçalar delikle kesişmez', () => {
    const box = { cx: 0, cy: 1.5, cz: 0, hx: 3, hy: 1.5, hz: 0.15 };
    const hole = { cx: 1, cy: 1.6, cz: 0, hx: 0.4, hy: 0.6, hz: 0.3 };
    const parts = subtractBox(box, hole);
    const cut = 0.8 * 1.2 * 0.3;
    const sum = parts.reduce((s, p) => s + volume(p), 0);
    expect(sum).toBeCloseTo(volume(box) - cut, 6);
    for (const p of parts) expect(boxesOverlap(p, hole)).toBe(false);
  });

  it('kesişmeyen delik kutuyu değiştirmez', () => {
    const box = { cx: 0, cy: 0, cz: 0, hx: 1, hy: 1, hz: 1 };
    expect(subtractBox(box, { cx: 5, cy: 0, cz: 0, hx: 1, hy: 1, hz: 1 })).toEqual([box]);
  });
});

describe('camlı pencereler (settlements/windows.ts)', () => {
  it('her girilebilir konut/cami türünde pencere var; kimlikler benzersiz', () => {
    for (const kind of ['house', 'konak', 'apartment', 'government', 'mosque'] as const) {
      const panes = windowPanes(kind);
      expect(panes.length, kind).toBeGreaterThan(0);
      expect(new Set(panes.map((p) => p.index)).size).toBe(panes.length);
    }
    expect(windowPanes('cemetery')).toHaveLength(0);
  });

  it('evin ön penceresi kapıyı atlar (kapı ortada)', () => {
    const front = windowPanes('house').filter((p) => p.face === 'front');
    expect(front).toHaveLength(2);
    for (const p of front) expect(Math.abs(p.cx - ROOMS.house!.doorX)).toBeGreaterThan(1);
  });

  it('her cam bir duvar katısının içindedir; delinmiş katılar camla kesişmez', () => {
    for (const kind of BUILDING_KINDS) {
      const panes = windowPanes(kind);
      if (panes.length === 0) continue;
      const solids = BUILDING_SHAPES[kind].solids;
      const holes = panes.map((p) => paneHole(p, 0));
      for (const hole of holes) {
        expect(
          solids.some((s) => boxesOverlap(s, hole)),
          kind,
        ).toBe(true);
      }
      for (const s of subtractHoles(solids, holes)) {
        for (const hole of holes) expect(boxesOverlap(s, hole), kind).toBe(false);
      }
    }
  });

  it('geometri: iç kademe duvarı deler (üçgen artar), yakın kademe kurulur', () => {
    const near = buildBuildingGeometry('house', 'near');
    const interior = buildBuildingGeometry('house', 'interior');
    expect(near.getAttribute('position').count).toBeGreaterThan(0);
    expect(interior.getAttribute('position').count).toBeGreaterThan(
      near.getAttribute('position').count,
    );
    near.dispose();
    interior.dispose();
  });
});

describe('mermi camdan geçer ve kırar', () => {
  const b = building('house');
  const settlements = { buildingsNear: () => [b] };
  const pane = buildingPanes(b).find((p) => p.id === paneId(b.id, 0))!;

  it('camın yerinde mermi katısı yok; camın dışında duvar var', () => {
    const solids = buildingSolids(b);
    const mid = { x: pane.x, y: (pane.y0 + pane.y1) / 2, z: pane.z };
    const inside = (p: { x: number; y: number; z: number }) =>
      solids.some((s) => {
        const dx = p.x - s.x;
        const dz = p.z - s.z;
        const lx = dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw);
        const lz = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
        return Math.abs(lx) < s.hx && Math.abs(lz) < s.hz && p.y > s.y0 && p.y < s.y1;
      });
    expect(inside(mid)).toBe(false);
    expect(inside({ ...mid, y: pane.y1 + 0.3 })).toBe(true);
  });

  it('içeriden pencereye atış duvara takılmaz, camı kırar', () => {
    // Odanın ortasından camın merkezine.
    const origin = { x: b.x, y: (pane.y0 + pane.y1) / 2, z: b.z };
    const dx = pane.x - origin.x;
    const dz = pane.z - origin.z;
    const len = Math.hypot(dx, dz);
    const flight = traceProjectile(
      {
        origin,
        velocity: { x: (dx / len) * 300, y: 0, z: (dz / len) * 300 },
        gravity: 0,
        maxDistance: 40,
      },
      {
        heightAt: () => -100,
        targets: none,
        solids: shotSolids(null, settlements),
        panes: shotPanes(settlements, new Set()),
      },
    );
    expect(flight.panes).toContain(pane.id);
    expect(flight.distance).toBeGreaterThan(len + 1);
  });

  it('kırık cam yeniden kırılmaz; yıkık yapıda cam yok', () => {
    const broken = new Set([pane.id]);
    const query = shotPanes(settlements, broken);
    expect(query.panesNear(b.x, b.z, 10).some((p) => p.id === pane.id)).toBe(false);
    expect(buildingPanes(building('house', { ruined: true }))).toHaveLength(0);
  });
});
