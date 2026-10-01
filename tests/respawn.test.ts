import { beforeAll, describe, expect, it } from 'vitest';
import { PILOT, REGION_PLAYER, RESPAWN, SPAWN_SEARCH } from '../src/config';
import type { RegionData } from '../src/data/region';
import { pickRespawnPoint, respawnRandom } from '../src/survival/respawn';
import { isInPilotProvince } from '../src/world/pilot';
import { provinceAt } from '../src/world/provinces';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealRegion } from './helpers/realRegion';

let region: RegionData;
let source: RegionHeightSource;

beforeAll(async () => {
  region = await loadRealRegion();
  source = RegionHeightSource.fromRegion(region);
});

const pick = (deathIndex: number, seed?: number) =>
  pickRespawnPoint(
    region.provinces,
    source,
    REGION_PLAYER.maxSlopeDeg,
    respawnRandom(deathIndex, seed),
  );

describe('pickRespawnPoint (gerçek bölge, pilot il)', () => {
  it('her ölüm için bir nokta bulur; pilot ilde, kara ve yürünebilir', () => {
    const limit = REGION_PLAYER.maxSlopeDeg - SPAWN_SEARCH.slopeMarginDeg;
    for (let n = 0; n < 60; n++) {
      const p = pick(n);
      expect(p, `ölüm ${n}`).not.toBeNull();
      const point = p as { x: number; y: number; z: number };
      expect(isInPilotProvince(region.provinces, point.x, point.z)).toBe(true);
      expect(source.elevationAt(point.x, point.z)).toBeGreaterThanOrEqual(
        SPAWN_SEARCH.minElevation,
      );
      expect(source.slopeDegAt(point.x, point.z)).toBeLessThanOrEqual(limit);
      expect(point.y).toBeCloseTo(source.heightAt(point.x, point.z) + 0.05, 5);
    }
  });

  it('deterministik: aynı seed ve ölüm sırası → aynı nokta', () => {
    expect(pick(3)).toEqual(pick(3));
    expect(pick(3, 111)).toEqual(pick(3, 111));
  });

  it("farklı ölümlerde ve farklı seed'lerde farklı noktalar", () => {
    const points = new Set(Array.from({ length: 12 }, (_, n) => JSON.stringify(pick(n))));
    expect(points.size).toBeGreaterThan(10);
    expect(JSON.stringify(pick(3, 111))).not.toBe(JSON.stringify(pick(3, 222)));
  });

  it('yalnızca pilot ile doğar: diğer hedef illere (Bartın, Karabük, Düzce, Bolu) ve komşulara asla', () => {
    for (let n = 0; n < 200; n++) {
      const p = pick(n) as { x: number; z: number };
      const name = provinceAt(region.provinces, p.x, p.z)?.name ?? null;
      // Kıyı şeridinde il çokgeni yoktur (null); yoksa pilot il olmalıdır.
      expect(name === null || name === PILOT.province, `ölüm ${n}: ${name}`).toBe(true);
    }
  });

  it('pilot il yoksa ya da deneme hakkı bitince null', () => {
    const withoutPilot = region.provinces.filter((p) => p.name !== PILOT.province);
    expect(pickRespawnPoint(withoutPilot, source, 60, respawnRandom(0))).toBeNull();
    expect(pickRespawnPoint(region.provinces, source, 60, respawnRandom(0), 0)).toBeNull();
  });

  it('config: RESPAWN.attempts pozitif ve maxDrift makul', () => {
    expect(RESPAWN.attempts).toBeGreaterThan(50);
    expect(RESPAWN.maxDrift).toBeGreaterThan(0);
  });
});
