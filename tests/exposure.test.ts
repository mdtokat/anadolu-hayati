import { describe, expect, it } from 'vitest';
import { FIRE, SHELTER_EFFECTS } from '../src/config';
import { exposureAt, fireWarmthAt, isUnderShelter } from '../src/placement/exposure';
import { StructureSet } from '../src/placement/structures';

const { fireWarmth, shelter } = SHELTER_EFFECTS;

describe('fireWarmthAt', () => {
  it('çekirdekte tam, yarıçapta sıfır, arada doğrusal ve tekdüze azalır', () => {
    expect(fireWarmthAt(0)).toBe(fireWarmth.maxC);
    expect(fireWarmthAt(fireWarmth.coreRadius)).toBe(fireWarmth.maxC);
    expect(fireWarmthAt(fireWarmth.radius)).toBe(0);
    expect(fireWarmthAt(fireWarmth.radius + 10)).toBe(0);
    const mid = (fireWarmth.coreRadius + fireWarmth.radius) / 2;
    expect(fireWarmthAt(mid)).toBeCloseTo(fireWarmth.maxC / 2, 9);
    let prev = Infinity;
    for (let d = 0; d <= fireWarmth.radius; d += 0.25) {
      const w = fireWarmthAt(d);
      expect(w).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });
});

describe('isUnderShelter', () => {
  const set = new StructureSet();
  const lean = set.add('lean_to', 10, 5, 20, 0);

  it('yaw = 0: altlık yapının çevresindeki dikdörtgendir (ön = +z)', () => {
    expect(isUnderShelter(lean, 10, 5, 20)).toBe(true);
    expect(isUnderShelter(lean, 10 + shelter.halfWidth - 0.01, 5, 20)).toBe(true);
    expect(isUnderShelter(lean, 10 + shelter.halfWidth + 0.01, 5, 20)).toBe(false);
    expect(isUnderShelter(lean, 10, 5, 20 + shelter.front - 0.01)).toBe(true);
    expect(isUnderShelter(lean, 10, 5, 20 + shelter.front + 0.01)).toBe(false);
    expect(isUnderShelter(lean, 10, 5, 20 + shelter.back - 0.01)).toBe(false);
  });

  it('yaw döndürür: 90° dönünce ön yüz +x olur (mesh.rotation.y ile aynı sözleşme)', () => {
    const turned = new StructureSet().add('lean_to', 0, 0, 0, Math.PI / 2);
    // yerel +z → dünya (sin, cos) = (+1, 0)
    expect(isUnderShelter(turned, shelter.front - 0.05, 0, 0)).toBe(true);
    expect(isUnderShelter(turned, shelter.front + 0.05, 0, 0)).toBe(false);
    expect(isUnderShelter(turned, shelter.back + 0.05, 0, 0)).toBe(true);
    expect(isUnderShelter(turned, shelter.back - 0.05, 0, 0)).toBe(false);
    // yerel x → dünya (cos, −sin) = (0, −1)
    expect(isUnderShelter(turned, 0, 0, -(shelter.halfWidth - 0.05))).toBe(true);
    expect(isUnderShelter(turned, 0, 0, -(shelter.halfWidth + 0.05))).toBe(false);
  });

  it('çok yüksekte/alçakta (yamaçta uzak kot) korunma yok; ateş sundurma değildir', () => {
    expect(isUnderShelter(lean, 10, 5 + shelter.verticalReach + 0.1, 20)).toBe(false);
    expect(isUnderShelter(lean, 10, 5 - shelter.verticalReach - 0.1, 20)).toBe(false);
    const fire = new StructureSet().add('campfire', 0, 0, 0);
    expect(isUnderShelter(fire, 0, 0, 0)).toBe(false);
  });
});

describe('exposureAt', () => {
  it('yapı yokken etki yok', () => {
    expect(exposureAt(new StructureSet(), 0, 0, 0)).toEqual({ warmthC: 0, sheltered: false });
  });

  it('yanık ateş ısıtır; sönük ateş ısıtmaz', () => {
    const set = new StructureSet();
    const fire = set.add('campfire', 0, 0, 0);
    expect(exposureAt(set, 1, 0, 0).warmthC).toBe(fireWarmth.maxC);
    expect(exposureAt(set, fireWarmth.radius - 0.1, 0, 0).warmthC).toBeGreaterThan(0);
    expect(exposureAt(set, fireWarmth.radius + 0.1, 0, 0).warmthC).toBe(0);
    set.update(FIRE.burnSeconds + 1);
    expect(set.get(fire.id)?.fuelSeconds).toBe(0);
    expect(exposureAt(set, 1, 0, 0).warmthC).toBe(0);
    set.refuel(fire.id, 60);
    expect(exposureAt(set, 1, 0, 0).warmthC).toBe(fireWarmth.maxC);
  });

  it('başka kottaki ateş ısıtmaz (uçurumun altı/üstü)', () => {
    const set = new StructureSet();
    set.add('campfire', 0, 0, 0);
    expect(exposureAt(set, 1, shelter.verticalReach + 1, 0).warmthC).toBe(0);
  });

  it('birden çok ateş toplanır ama maxTotalC ile sınırlanır', () => {
    const set = new StructureSet();
    set.add('campfire', 0, 0, 0);
    set.add('campfire', 0.5, 0, 0);
    set.add('campfire', -0.5, 0, 0);
    expect(exposureAt(set, 0, 0, 0).warmthC).toBe(fireWarmth.maxTotalC);
    const two = new StructureSet();
    two.add('campfire', 0, 0, 0);
    two.add('campfire', 0, 0, 5.5); // (6−5,5)/(6−1,5) ≈ 0,11 → 0,67 °C
    expect(exposureAt(two, 0, 0, 0).warmthC).toBeGreaterThan(fireWarmth.maxC);
    expect(exposureAt(two, 0, 0, 0).warmthC).toBeLessThan(fireWarmth.maxTotalC);
  });

  it('barınak altında sheltered; ateşle birlikte ikisi birden', () => {
    const set = new StructureSet();
    set.add('lean_to', 0, 0, 0, 0);
    expect(exposureAt(set, 0, 0, 0)).toEqual({ warmthC: 0, sheltered: true });
    expect(exposureAt(set, 3, 0, 0).sheltered).toBe(false);
    set.add('campfire', 0, 0, 2);
    const both = exposureAt(set, 0, 0, 0);
    expect(both.sheltered).toBe(true);
    expect(both.warmthC).toBeGreaterThan(0);
  });

  it('girdi yapı kümesini değiştirmez', () => {
    const set = new StructureSet();
    set.add('campfire', 0, 0, 0);
    const before = JSON.stringify(set.toJSON());
    exposureAt(set, 1, 0, 1);
    expect(JSON.stringify(set.toJSON())).toBe(before);
  });
});
