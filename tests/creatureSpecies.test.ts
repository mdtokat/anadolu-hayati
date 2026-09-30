import { describe, expect, it } from 'vitest';
import { CREATURES, REGION_PLAYER } from '../src/config';
import { LANDCOVER_CLASSES } from '../src/data/landcover';
import { CREATURE_KINDS } from '../src/creatures/kinds';
import {
  MAX_CREATURES_PER_CELL,
  SPECIES,
  creatureId,
  decodeCreatureId,
  speciesOf,
  speciesTableComplete,
} from '../src/creatures/species';

describe('tür tablosu (5.1)', () => {
  it('her tür için kayıt var ve kimlikleri tutarlı', () => {
    expect(speciesTableComplete()).toBe(true);
    for (const kind of CREATURE_KINDS) expect(speciesOf(kind).kind).toBe(kind);
  });

  it('plan §3.5 değerleri: sağlık, saldırı, hızlar', () => {
    expect(SPECIES.roe_deer).toMatchObject({
      maxHealth: 40,
      attackDamage: 0,
      walkSpeed: 1.5,
      runSpeed: 9,
    });
    expect(SPECIES.wild_boar).toMatchObject({
      maxHealth: 90,
      attackDamage: 18,
      walkSpeed: 1.4,
      runSpeed: 7,
    });
    expect(SPECIES.wolf).toMatchObject({
      maxHealth: 70,
      attackDamage: 12,
      walkSpeed: 2,
      runSpeed: 9,
    });
    expect(SPECIES.brown_bear).toMatchObject({
      maxHealth: 250,
      attackDamage: 40,
      walkSpeed: 1.6,
      runSpeed: 8,
    });
  });

  it.each(CREATURE_KINDS)('%s: sayılar geçerli', (kind) => {
    const s = SPECIES[kind];
    expect(s.maxHealth).toBeGreaterThan(0);
    expect(s.walkSpeed).toBeGreaterThan(0);
    expect(s.runSpeed).toBeGreaterThan(s.walkSpeed);
    expect(s.turnRate).toBeGreaterThan(0);
    expect(s.radius).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
    // Oyuncunun tırmanma sınırını aşmaz.
    expect(s.maxSlopeDeg).toBeGreaterThan(0);
    expect(s.maxSlopeDeg).toBeLessThanOrEqual(REGION_PLAYER.maxSlopeDeg);
    // Algı
    expect(s.perception.sightRange).toBeGreaterThan(0);
    expect(s.perception.sightHalfAngleDeg).toBeGreaterThan(0);
    expect(s.perception.sightHalfAngleDeg).toBeLessThanOrEqual(180);
    expect(s.perception.nightSightFactor).toBeGreaterThan(0);
    expect(s.perception.nightSightFactor).toBeLessThanOrEqual(1);
    expect(s.perception.hearRange).toBeGreaterThan(0);
    // Etkinlik pencereleri 0–1 ve en az biri > 0
    for (const w of Object.values(s.activity)) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...Object.values(s.activity))).toBeGreaterThan(0);
    // Grup
    expect(s.group[0]).toBeGreaterThanOrEqual(1);
    expect(s.group[1]).toBeGreaterThanOrEqual(s.group[0]);
    // Ateş
    expect(s.fireAvoidRadius).toBeGreaterThanOrEqual(0);
    expect(s.wanderRadius).toBeGreaterThan(0);
    // Biyom
    const [a, b, c, d] = s.habitat.elevation;
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
    expect(c).toBeLessThanOrEqual(d);
    expect(s.habitat.density).toBeGreaterThan(0);
    const covers = Object.entries(s.habitat.cover);
    expect(covers.length).toBeGreaterThan(0);
    for (const [cover, weight] of covers) {
      expect(LANDCOVER_CLASSES).toContain(cover);
      // Deniz/veri yok, kar ve yerleşimde doğmaz.
      expect(['none', 'snow', 'urban']).not.toContain(cover);
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it('saldıranlar (attackDamage > 0) zamanlama ve menzil tanımlar; saldırmayanlar sıfırdır', () => {
    for (const kind of CREATURE_KINDS) {
      const s = SPECIES[kind];
      if (s.attackDamage > 0) {
        expect(s.attackRange).toBeGreaterThan(0);
        expect(s.attackWindup).toBeGreaterThan(0);
        expect(s.attackRecover).toBeGreaterThan(0);
        expect(s.woundedFraction).toBeLessThan(1);
      } else {
        expect(s.attackRange).toBe(0);
      }
    }
  });

  it('davranış aileleri ve yırtıcılar', () => {
    expect(SPECIES.roe_deer.behavior).toBe('skittish');
    expect(SPECIES.wild_boar.behavior).toBe('defensive');
    expect(SPECIES.brown_bear.behavior).toBe('defensive');
    expect(SPECIES.wolf.behavior).toBe('hunter');
    expect(CREATURE_KINDS.filter((k) => SPECIES[k].predator)).toEqual(['wolf', 'brown_bear']);
    // Ayı için ateş yarıçapı kurttan küçük (cesaret ateşe karşı kırılır, ama yakında).
    expect(SPECIES.brown_bear.fireAvoidRadius).toBeLessThan(SPECIES.wolf.fireAvoidRadius);
  });

  it('kurt gece etkin, gündüz seyrek; ayı en seyrek', () => {
    expect(SPECIES.wolf.activity.night).toBeGreaterThan(SPECIES.wolf.activity.day);
    const densities = CREATURE_KINDS.map((k) => SPECIES[k].habitat.density);
    expect(SPECIES.brown_bear.habitat.density).toBe(Math.min(...densities));
  });

  it('config: doğma yarıçapları tutarlı', () => {
    expect(CREATURES.minSpawnDistance).toBeLessThan(CREATURES.simRadius);
    expect(CREATURES.simRadius).toBeLessThan(CREATURES.despawnRadius);
    expect(CREATURES.lodNearRadius).toBeLessThan(CREATURES.simRadius);
  });
});

describe('canlı kimliği', () => {
  it('gidiş-dönüş', () => {
    for (const [cell, index] of [
      [0, 0],
      [0, 255],
      [1, 0],
      [129, 17],
      [130 * 100 + 7, 200],
    ] as const) {
      const id = creatureId(cell, index);
      expect(id).toBe(cell * 256 + index);
      expect(decodeCreatureId(id)).toEqual({ cellKey: cell, index });
    }
  });

  it('farklı (hücre, dizin) farklı kimlik verir', () => {
    const ids = new Set<number>();
    for (let cell = 0; cell < 20; cell++) {
      for (let i = 0; i < MAX_CREATURES_PER_CELL; i++) ids.add(creatureId(cell, i));
    }
    expect(ids.size).toBe(20 * MAX_CREATURES_PER_CELL);
  });

  it('geçersiz girdi hata verir', () => {
    expect(() => creatureId(-1, 0)).toThrow();
    expect(() => creatureId(0, 256)).toThrow();
    expect(() => creatureId(0, 1.5)).toThrow();
  });
});
