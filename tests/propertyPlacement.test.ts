import { describe, expect, it } from 'vitest';
import { PIECES, VERTICAL_SCALE } from '../src/config';
import { resolvePiece } from '../src/placement/pieces';
import {
  buildingClash,
  validatePlacement,
  type PlaceBuilding,
  type PlaceContext,
} from '../src/placement/placeRules';
import { StructureSet } from '../src/placement/structures';

const GROUND = 100 / VERTICAL_SCALE;

/** (−5…5, −15…−5) karesinde bir yerleşim yapısı; içi (−4…4, −14…−6) oda, döşeme zeminin 0,5 m üstünde. */
function house(
  owned: boolean,
): PlaceBuilding & { contains(x: number, z: number, m: number): boolean } {
  return {
    owned,
    floorY: GROUND + 0.5,
    contains: (x, z, m) => Math.abs(x) <= 5 + m && z >= -15 - m && z <= -5 + m,
    insideRoom: (x, z, m) => Math.abs(x) <= 4 - m && z >= -14 + m && z <= -6 - m,
  };
}

function context(owned: boolean): PlaceContext {
  const b = house(owned);
  return {
    heightAt: () => GROUND,
    structures: new StructureSet(),
    buildingAt: (x, z, m) => (b.contains(x, z, m) ? b : null),
    ownedFloorNear: (x, z, reach) => (owned && b.contains(x, z, reach) ? b.floorY : null),
  };
}

describe('tapu: yerleşim yapısına kurulum', () => {
  it('başkasının yapısına kurulamaz', () => {
    const check = validatePlacement(
      'storage_chest',
      { x: 0, z: -10 },
      { x: 0, z: -8, y: GROUND + 0.5 },
      context(false),
    );
    expect(check).toEqual({ ok: false, reason: 'not_owned' });
  });

  it('sahip olunan yapının odasına döşeme seviyesinde kurulur', () => {
    const check = validatePlacement(
      'storage_chest',
      { x: 0, z: -10 },
      { x: 0, z: -8, y: GROUND + 0.5 },
      context(true),
    );
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.y).toBeCloseTo(GROUND + 0.5, 6);
  });

  it('duvara değen, dışarıdan kurulan ya da büyük yapı (kulübe) içeri kurulmaz', () => {
    const ctx = context(true);
    expect(validatePlacement('storage_chest', { x: 4.9, z: -10 }, { x: 3, z: -10 }, ctx)).toEqual({
      ok: false,
      reason: 'too_close',
    });
    expect(
      validatePlacement('storage_chest', { x: 0, z: -10 }, { x: 0, z: -8, y: GROUND - 3 }, ctx),
    ).toEqual({ ok: false, reason: 'too_close' });
    expect(
      validatePlacement('wooden_hut', { x: 0, z: -10 }, { x: 0, z: -6, y: GROUND + 0.5 }, ctx),
    ).toEqual({ ok: false, reason: 'too_close' });
  });

  it('yapı dışında kurallar değişmez', () => {
    expect(
      validatePlacement('storage_chest', { x: 0, z: 3 }, { x: 0, z: 5 }, context(false)).ok,
    ).toBe(true);
  });

  it('ızgara parçaları yapıya çakışmaz', () => {
    const ok = { ok: true as const, y: 0, slopeDeg: 0 };
    expect(buildingClash(ok, { x: 0, z: -10 }, 0.9, context(false))).toEqual({
      ok: false,
      reason: 'not_owned',
    });
    expect(buildingClash(ok, { x: 0, z: -10 }, 0.9, context(true))).toEqual({
      ok: false,
      reason: 'too_close',
    });
    expect(buildingClash(ok, { x: 0, z: 3 }, 0.9, context(true))).toBe(ok);
  });

  it('sahip olunan yapının yanındaki ilk taban döşemeyle aynı seviyeye oturur', () => {
    // Oyuncu (0, 1.5) kuzeye bakar: bakış hücresi z = −2 (yapının kenarına 3 m).
    const pose = { x: 0, z: 1.5, yaw: 0 };
    const owned = resolvePiece('foundation', pose, false, context(true));
    expect(owned.check.ok).toBe(true);
    expect(owned.target.y + PIECES.slab).toBeCloseTo(GROUND + 0.5, 6);
    const other = resolvePiece('foundation', pose, false, context(false));
    expect(other.target.y).toBeCloseTo(GROUND - PIECES.floorSink, 6);
  });
});
