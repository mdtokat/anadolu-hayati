import { describe, expect, it } from 'vitest';
import { PLACEMENT, SCATTER, VERTICAL_SCALE } from '../src/config';
import { slopeDegAt, validatePlacement, type PlaceContext } from '../src/placement/placeRules';
import { StructureSet } from '../src/placement/structures';

const FLAT_Y = 100 / VERTICAL_SCALE; // 100 m gerçek rakım: denizden uzak
const ctxWith = (
  heightAt: (x: number, z: number) => number,
  extra: Partial<PlaceContext> = {},
) => ({
  heightAt,
  structures: new StructureSet(),
  ...extra,
});
const flat = () => ctxWith(() => FLAT_Y);
/** Belirli bir eğimde (derece) doğu-batı yamaç. */
const ramp = (deg: number) => (x: number) => x * Math.tan((deg * Math.PI) / 180) + FLAT_Y;

const PLAYER = { x: 0, z: 0 };
const TARGET = { x: PLACEMENT.aimDistance, z: 0 };

describe('slopeDegAt', () => {
  it('düz zemin 0°, belirli eğim verilen açıya eşit (yönden bağımsız)', () => {
    expect(slopeDegAt(() => 5, 0, 0)).toBeCloseTo(0, 6);
    for (const deg of [10, 25, 40, 60]) {
      expect(slopeDegAt((x) => x * Math.tan((deg * Math.PI) / 180), 3, 4)).toBeCloseTo(deg, 4);
      expect(slopeDegAt((_x, z) => z * Math.tan((deg * Math.PI) / 180), 3, 4)).toBeCloseTo(deg, 4);
    }
  });
});

describe('validatePlacement', () => {
  it('düz, kuru, boş zeminde geçerli; y ve eğim döner', () => {
    const r = validatePlacement('campfire', TARGET, PLAYER, flat());
    expect(r).toMatchObject({ ok: true, y: FLAT_Y });
    if (r.ok) expect(r.slopeDeg).toBeCloseTo(0, 6);
  });

  it('erişim dışı: too_far (sınır dahil geçerli)', () => {
    const edge = { x: PLACEMENT.maxReach, z: 0 };
    expect(validatePlacement('campfire', edge, PLAYER, flat()).ok).toBe(true);
    expect(
      validatePlacement('campfire', { x: PLACEMENT.maxReach + 0.01, z: 0 }, PLAYER, flat()),
    ).toEqual({
      ok: false,
      reason: 'too_far',
    });
  });

  it('deniz ve kıyı: in_sea (rakım eşiği dahil)', () => {
    const at = (elev: number) => ctxWith(() => elev / VERTICAL_SCALE);
    expect(validatePlacement('campfire', TARGET, PLAYER, at(0))).toEqual({
      ok: false,
      reason: 'in_sea',
    });
    expect(validatePlacement('campfire', TARGET, PLAYER, at(-5))).toEqual({
      ok: false,
      reason: 'in_sea',
    });
    expect(validatePlacement('campfire', TARGET, PLAYER, at(SCATTER.minElevation))).toEqual({
      ok: false,
      reason: 'in_sea',
    });
    expect(validatePlacement('campfire', TARGET, PLAYER, at(SCATTER.minElevation + 1)).ok).toBe(
      true,
    );
  });

  it('eğim: tür başına sınır; sundurma ateşten daha az eğim kabul eder', () => {
    const { campfire, lean_to } = PLACEMENT.kinds;
    expect(campfire.maxSlopeDeg).toBeGreaterThan(lean_to.maxSlopeDeg);
    const between = (campfire.maxSlopeDeg + lean_to.maxSlopeDeg) / 2;
    expect(validatePlacement('campfire', TARGET, PLAYER, ctxWith(ramp(between))).ok).toBe(true);
    expect(validatePlacement('lean_to', TARGET, PLAYER, ctxWith(ramp(between)))).toEqual({
      ok: false,
      reason: 'too_steep',
    });
    expect(
      validatePlacement('campfire', TARGET, PLAYER, ctxWith(ramp(campfire.maxSlopeDeg + 2))),
    ).toEqual({ ok: false, reason: 'too_steep' });
  });

  it('tatlı su yakınında near_water; destek yoksa denetlenmez', () => {
    const wet = ctxWith(() => FLAT_Y, { nearFreshWater: () => true });
    expect(validatePlacement('campfire', TARGET, PLAYER, wet)).toEqual({
      ok: false,
      reason: 'near_water',
    });
    const dry = ctxWith(() => FLAT_Y, { nearFreshWater: () => false });
    expect(validatePlacement('campfire', TARGET, PLAYER, dry).ok).toBe(true);
  });

  it('başka yapıya yakın: too_close; uzaklık yarıçapların toplamı + pay', () => {
    const ctx = flat();
    const { campfire, lean_to } = PLACEMENT.kinds;
    ctx.structures.add('lean_to', 10, FLAT_Y, 0);
    const minGap = campfire.radius + lean_to.radius + PLACEMENT.spacingMargin;
    const player = { x: 10 - minGap, z: 0 };
    const justInside = { x: 10 - minGap + 0.05, z: 0 };
    const justOutside = { x: 10 - minGap - 0.05, z: 0 };
    expect(validatePlacement('campfire', justInside, player, ctx)).toEqual({
      ok: false,
      reason: 'too_close',
    });
    expect(validatePlacement('campfire', justOutside, player, ctx).ok).toBe(true);
  });

  it('iki sundurma birbirine kendi yarıçaplarıyla bakar (en büyük yarıçaplı komşu da bulunur)', () => {
    const ctx = flat();
    const r = PLACEMENT.kinds.lean_to.radius;
    ctx.structures.add('lean_to', 0, FLAT_Y, 0);
    const gap = 2 * r + PLACEMENT.spacingMargin;
    const player = { x: gap, z: 0 };
    expect(validatePlacement('lean_to', { x: gap - 0.1, z: 0 }, player, ctx)).toEqual({
      ok: false,
      reason: 'too_close',
    });
    expect(validatePlacement('lean_to', { x: gap + 0.1, z: 0 }, player, ctx).ok).toBe(true);
  });

  it('başarısızlık sırası: erişim > deniz > eğim > su > yakınlık', () => {
    const ctx = ctxWith(ramp(80), { nearFreshWater: () => true });
    ctx.structures.add('campfire', TARGET.x, FLAT_Y, 0);
    expect(validatePlacement('campfire', TARGET, PLAYER, ctx)).toEqual({
      ok: false,
      reason: 'too_steep',
    });
    const far = { x: 50, z: 0 };
    expect(validatePlacement('campfire', far, PLAYER, ctx)).toEqual({
      ok: false,
      reason: 'too_far',
    });
  });
});
