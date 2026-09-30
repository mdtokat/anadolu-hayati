import { beforeAll, describe, expect, it } from 'vitest';
import { REGION_PLAYER, RESPAWN, SPAWN_SEARCH } from '../src/config';
import type { RegionData } from '../src/data/region';
import { pickRespawnPoint, respawnRandom } from '../src/survival/respawn';
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

describe('pickRespawnPoint (gerçek bölge)', () => {
  it('her ölüm için bir nokta bulur; hedef ilin (inRegion) içinde, kara ve yürünebilir', () => {
    const limit = REGION_PLAYER.maxSlopeDeg - SPAWN_SEARCH.slopeMarginDeg;
    for (let n = 0; n < 60; n++) {
      const p = pick(n);
      expect(p, `ölüm ${n}`).not.toBeNull();
      const point = p as { x: number; y: number; z: number };
      const province = provinceAt(region.provinces, point.x, point.z);
      expect(province?.inRegion).toBe(true);
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

  it('üç ile de dağılır (Zonguldak, Bartın, Karabük hepsi görülür)', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 80; n++) {
      const p = pick(n) as { x: number; z: number };
      seen.add(provinceAt(region.provinces, p.x, p.z)?.name ?? '?');
    }
    expect([...seen].sort()).toEqual(['Bartın', 'Karabük', 'Zonguldak']);
  });

  it('komşu illere (inRegion=false) doğmaz', () => {
    for (let n = 0; n < 60; n++) {
      const p = pick(n) as { x: number; z: number };
      expect(['Bolu', 'Düzce', 'Kastamonu', 'Çankırı']).not.toContain(
        provinceAt(region.provinces, p.x, p.z)?.name,
      );
    }
  });

  it('hedef il yoksa ya da deneme hakkı bitince null', () => {
    const neighborsOnly = region.provinces.filter((p) => !p.inRegion);
    expect(pickRespawnPoint(neighborsOnly, source, 60, respawnRandom(0))).toBeNull();
    expect(pickRespawnPoint(region.provinces, source, 60, respawnRandom(0), 0)).toBeNull();
  });

  it('config: RESPAWN.attempts pozitif ve maxDrift makul', () => {
    expect(RESPAWN.attempts).toBeGreaterThan(50);
    expect(RESPAWN.maxDrift).toBeGreaterThan(0);
  });
});
