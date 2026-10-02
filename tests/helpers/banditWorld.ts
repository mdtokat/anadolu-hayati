import { campSiteQuery, placeCamps, type Camp, type CampSiteQuery } from '../../src/bandits/camps';
import { createRegionCreatureTerrain } from '../../src/creatures/regionTerrain';
import type { CreatureTerrain } from '../../src/creatures/kinds';
import { LandCoverMap } from '../../src/world/LandCoverMap';
import { loadRealWorld } from './realRegion';
import { buildSettlementWorld, type SettlementWorld } from './settlementWorld';

/** Gerçek dünyada eşkıya testleri için: yerleşim haritası, canlı arazisi, kamp sorgusu ve kamplar (bir kez kurulur). */
export interface BanditWorld {
  settlement: SettlementWorld;
  terrain: CreatureTerrain;
  query: CampSiteQuery;
  camps: Camp[];
}

let cached: Promise<BanditWorld> | null = null;

export function loadBanditWorld(): Promise<BanditWorld> {
  cached ??= (async () => {
    const world = await loadRealWorld();
    const settlement = buildSettlementWorld(world);
    const cover = LandCoverMap.fromRegion(world);
    const terrain = createRegionCreatureTerrain({
      source: settlement.source,
      cover,
      freshWater: settlement.water,
    });
    const query = campSiteQuery(terrain, settlement.map);
    return { settlement, terrain, query, camps: placeCamps(query) };
  })();
  return cached;
}
