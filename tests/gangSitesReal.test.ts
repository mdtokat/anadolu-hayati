import { beforeAll, describe, expect, it } from 'vitest';
import { GANGS } from '../src/config';
import { placeGangSites } from '../src/bandits/gangs';
import type { RegionData } from '../src/data/region';
import { initPhysics } from '../src/physics/PhysicsWorld';
import type { RegionWorld } from '../src/world/RegionWorld';
import { loadRealRegion } from './helpers/realRegion';
import { setupWorld } from './helpers/walker';

let region: RegionData;
beforeAll(async () => {
  await initPhysics();
  region = await loadRealRegion();
});

describe('gerçek dünyada sokak çetesi yerleri', () => {
  it('il ve ilçe merkezlerinin çoğunda cadde üzerinde, binadan açık iki rakip nokta bulunur', () => {
    const { world, dispose } = setupWorld(region, true);
    const rw = world as RegionWorld;
    const map = rw.settlementMap!;
    const terrain = rw.creatureTerrain;
    const centers = map.settlements
      .filter((s) => GANGS.ranks.includes(s.data.rank))
      .map((s) => ({
        id: s.data.id,
        name: s.data.name,
        x: s.data.x,
        z: s.data.z,
        radius: s.radius,
      }));
    const sites = placeGangSites({
      centers,
      onStreet: (x, z, d) => map.roads.nearest(x, z, d) !== null,
      open: (x, z, margin) =>
        map.buildingAt(x, z, margin) === null &&
        !terrain.isSea(x, z) &&
        terrain.slopeDegAt(x, z) <= 25,
    });
    expect(centers.length).toBeGreaterThan(50);
    expect(sites.length / centers.length).toBeGreaterThan(0.5);
    for (const site of sites.slice(0, 40)) {
      for (const p of [site.a, site.b]) {
        expect(map.buildingAt(p.x, p.z, GANGS.buildingClearance - 0.2)).toBeNull();
        expect(map.roads.nearest(p.x, p.z, GANGS.streetDistance + 0.1)).not.toBeNull();
      }
    }
    dispose();
  }, 120_000);
});
