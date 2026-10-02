import { describe, expect, it } from 'vitest';
import { BUILDING_KINDS, BUILDING_OVERHANG, BUILDING_SHAPES } from '../src/settlements/kinds';
import { FootprintRegistry, boxCorners, quadsOverlap } from '../src/settlements/footprints';
import { buildBuildingGeometry } from '../src/world/buildingGeometry';

describe('FootprintRegistry', () => {
  it('döndürülmüş kutular: köşe değmesi çakışma değil, iç içe geçme çakışma', () => {
    const reg = new FootprintRegistry();
    reg.add(1, { x: 0, z: 0, hx: 2, hz: 1, yaw: 0 });
    expect(reg.overlaps({ x: 4, z: 0, hx: 2, hz: 1, yaw: 0 })).toBe(false); // kenar kenara
    expect(reg.overlaps({ x: 3.9, z: 0, hx: 2, hz: 1, yaw: 0 })).toBe(true);
    // 45° dönük kare, eksen hizalı kutunun köşesine yaklaşır ama değmez.
    expect(reg.overlaps({ x: 3.5, z: 2.5, hx: 1, hz: 1, yaw: Math.PI / 4 })).toBe(false);
    expect(reg.overlaps({ x: 2.5, z: 1.5, hx: 1, hz: 1, yaw: Math.PI / 4 })).toBe(true);
    // Sahibi yok sayılabilir (cami avlusundaki çeşme).
    expect(reg.overlaps({ x: 0, z: 0, hx: 1, hz: 1, yaw: 0 }, 1)).toBe(false);
  });

  it('nokta sorgusu payla; hücre sınırındaki kutular da bulunur', () => {
    const reg = new FootprintRegistry(32);
    reg.add(7, { x: 31, z: 31, hx: 3, hz: 3, yaw: 0.3 });
    expect(reg.contains(31, 31)).toBe(true);
    expect(reg.contains(36, 31)).toBe(false);
    expect(reg.contains(36, 31, 3)).toBe(true);
    expect(reg.contains(80, 80, 3)).toBe(false);
  });

  it('boxCorners yapıların yerel→dünya kuralıyla aynı', () => {
    const c = boxCorners({ x: 10, z: 5, hx: 1, hz: 2, yaw: Math.PI / 2 });
    // yaw = 90°: yerel +z dünyada +x'e döner.
    expect(c[4]).toBeCloseTo(10 + 2, 5); // köşe (hx, hz) → x = 10 + 1·cos + 2·sin
    expect(c[5]).toBeCloseTo(5 - 1, 5);
    expect(quadsOverlap(c, c)).toBe(true);
  });
});

describe('BUILDING_OVERHANG', () => {
  it('her yapının geometrisi ayak izi + taşma payı içinde kalır (saçaklar komşuya girmesin)', () => {
    for (const kind of BUILDING_KINDS) {
      const shape = BUILDING_SHAPES[kind];
      const pad = BUILDING_OVERHANG[kind];
      for (const lod of ['near', 'far'] as const) {
        for (const ruined of [false, true]) {
          const g = buildBuildingGeometry(kind, lod, { ruined, floors: 6 });
          g.computeBoundingBox();
          const bb = g.boundingBox!;
          expect(Math.max(-bb.min.x, bb.max.x), `${kind} ${lod} x`).toBeLessThanOrEqual(
            shape.width / 2 + pad.x + 1e-3,
          );
          expect(Math.max(-bb.min.z, bb.max.z), `${kind} ${lod} z`).toBeLessThanOrEqual(
            shape.depth / 2 + pad.z + 1e-3,
          );
          g.dispose();
        }
      }
    }
  });
});
