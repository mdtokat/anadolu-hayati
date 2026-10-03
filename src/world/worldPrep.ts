import type { RegionData } from '../data/region';
import { SettlementMap } from '../settlements/SettlementMap';
import { levelPad, lockFootprint } from './buildingPads';
import { RegionHeightSource } from './RegionHeightSource';
import { applyRoadGrading } from './roadGrading';
import { tunnelHoles, type TerrainHoles } from './roadTunnels';
import { carveStreams } from './streamCarving';
import type { FreshWaterIndex } from './waterIndex';

/**
 * Yoğun kipte (tüm dünya bellekte) arazi ve yerleşim hazırlığı: yumuşatılmış kaynak, dere yatakları, yerleşim haritası
 * (yol planı zemine uygulanır, yapı terasları düzlenir) ve tünel delikleri. `RegionWorld` yoğun yolu ve veri hattının
 * bake adımı **aynı işlevi** çağırır: baked sonuç, açılışta hesaplananla bire bir aynıdır.
 */
export interface PreparedWorld {
  source: RegionHeightSource;
  settlementMap: SettlementMap | null;
  holes: TerrainHoles | null;
}

export function prepareDenseWorld(
  region: RegionData,
  freshWater: FreshWaterIndex | null,
): PreparedWorld {
  const source = RegionHeightSource.fromRegion(region);
  // Akarsu yatakları oyulur (dere yamaçta değil, kendi yatağında akar); yollar oyulmuş araziye göre tasarlanır.
  if (region.features) carveStreams(source, region.features.water.lines);
  const settlementMap = region.settlements
    ? new SettlementMap(region.settlements, {
        heightAt: (x, z) => source.heightAt(x, z),
        elevationAt: (x, z) => source.elevationAt(x, z),
        isWater: (x, z, clearance) => freshWater?.nearest(x, z, clearance) != null,
        nearestWater: freshWater ? (x, z, r) => freshWater.nearest(x, z, r) : undefined,
        waterLines: region.features?.water.lines,
        bounds: source.bounds,
        // Yol planı zemine uygulanır; yapı düzeni düzeltilmiş zeminin üstünde kurulur.
        grade: (plan) => applyRoadGrading(source, plan, region.features?.water.lines),
        level: (box, y) => levelPad(source, box, y),
        lock: (box) => lockFootprint(source, box),
      })
    : null;
  // Tünel ağızlarında arazi delinir (mesh + çarpışma); tünelin kendisi yol yapılarıyla çizilir.
  const holes = settlementMap ? tunnelHoles(settlementMap.plan, source) : null;
  return { source, settlementMap, holes };
}
