import { beforeAll, describe, expect, it } from 'vitest';
import { REGION_PLAYER, SPAWN_SEARCH, TELEPORTS } from '../src/config';
import type { RegionData } from '../src/data/region';
import { latLonToGame } from '../src/world/geo';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { findSafeSpawn } from '../src/world/spawn';
import { loadRealRegion } from './helpers/realRegion';

let region: RegionData;
let source: RegionHeightSource;

beforeAll(async () => {
  region = await loadRealRegion();
  source = RegionHeightSource.fromRegion(region);
});

describe('findSafeSpawn (gerçek bölge)', () => {
  const limit = REGION_PLAYER.maxSlopeDeg - SPAWN_SEARCH.slopeMarginDeg;

  for (const place of TELEPORTS) {
    it(`${place.name}: yakında yürünebilir, kara bir nokta bulunur`, () => {
      const { x, z } = latLonToGame(place.lat, place.lon, region.meta.originUtm);
      const spawn = findSafeSpawn(source, x, z, REGION_PLAYER.maxSlopeDeg);
      expect(spawn).not.toBeNull();
      const s = spawn as { x: number; y: number; z: number };
      expect(Math.hypot(s.x - x, s.z - z)).toBeLessThan(400); // istenen yere yakın
      expect(source.slopeDegAt(s.x, s.z)).toBeLessThanOrEqual(limit);
      expect(source.elevationAt(s.x, s.z)).toBeGreaterThanOrEqual(SPAWN_SEARCH.minElevation);
      expect(s.y).toBeCloseTo(source.heightAt(s.x, s.z) + 0.05, 5);
    });
  }

  it('zaten uygun bir noktayı olduğu gibi döndürür (Karabük merkez)', () => {
    const { x, z } = latLonToGame(41.2061, 32.6204, region.meta.originUtm);
    const spawn = findSafeSpawn(source, x, z, REGION_PLAYER.maxSlopeDeg);
    expect(spawn).not.toBeNull();
    expect(spawn?.x).toBe(x);
    expect(spawn?.z).toBe(z);
  });

  it('deniz (açık deniz) için yürünebilir kıyı noktasına kayar ya da null verir; asla deniz değil', () => {
    const { x, z } = latLonToGame(41.85, 32.0, region.meta.originUtm);
    const spawn = findSafeSpawn(source, x, z, REGION_PLAYER.maxSlopeDeg);
    if (spawn)
      expect(source.elevationAt(spawn.x, spawn.z)).toBeGreaterThanOrEqual(
        SPAWN_SEARCH.minElevation,
      );
  });

  it('eğim sınırı düşükse (20°) Zonguldak merkezden daha uzak bir nokta seçer', () => {
    const { x, z } = latLonToGame(41.4564, 31.7987, region.meta.originUtm);
    const normal = findSafeSpawn(source, x, z, REGION_PLAYER.maxSlopeDeg) as {
      x: number;
      z: number;
    };
    const strict = findSafeSpawn(source, x, z, 25) as { x: number; z: number } | null;
    expect(strict).not.toBeNull();
    const dNormal = Math.hypot(normal.x - x, normal.z - z);
    const dStrict = Math.hypot((strict as { x: number }).x - x, (strict as { z: number }).z - z);
    expect(dStrict).toBeGreaterThanOrEqual(dNormal);
  });
});
