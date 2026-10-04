import { FRESH_WATER } from '../../src/config';
import type { RegionData } from '../../src/data/region';
import { SettlementMap } from '../../src/settlements/SettlementMap';
import { emptyNetworkReport, type NetworkReport } from '../../src/settlements/roadNetwork';
import type { LayoutTerrain } from '../../src/settlements/layout';
import type { NearestWater } from '../../src/settlements/roadRouting';
import { levelPad, lockFootprint } from '../../src/world/buildingPads';
import { RegionHeightSource } from '../../src/world/RegionHeightSource';
import { applyRoadGrading, type GradingStats } from '../../src/world/roadGrading';
import { FreshWaterIndex } from '../../src/world/waterIndex';
import { carveStreams } from '../../src/world/streamCarving';

/** Gerçek dünyada `RegionWorld`'ün kurduğu gibi yerleşim haritası: yol düzeltmesi ve yapı terasları dahil. */
export interface SettlementWorld {
  source: RegionHeightSource;
  water: FreshWaterIndex | null;
  terrain: LayoutTerrain & { nearestWater?: NearestWater };
  map: SettlementMap;
  /** Yol düzeltmesinin sayımları (düzeltme kapalıysa null). */
  grading: GradingStats | null;
  /** Yol ağı düzeninin sayımları. */
  network: NetworkReport;
  /** Kurulum süresi (ms). */
  buildMs: number;
}

export function buildSettlementWorld(
  world: RegionData,
  options: { graded?: boolean } = {},
): SettlementWorld {
  const graded = options.graded ?? true;
  const source = RegionHeightSource.fromRegion(world);
  const water = world.features
    ? new FreshWaterIndex(world.features.water, FRESH_WATER.indexCellSize)
    : null;
  if (graded && world.features && !process.env.NOCARVE)
    carveStreams(source, world.features.water.lines);
  let grading: GradingStats | null = null;
  const terrain: LayoutTerrain & { nearestWater?: NearestWater } = {
    heightAt: (x, z) => source.heightAt(x, z),
    elevationAt: (x, z) => source.elevationAt(x, z),
    isWater: (x, z, c) => water?.nearest(x, z, c) != null,
    nearestWater: (x, z, r) => water?.nearest(x, z, r) ?? null,
    ...(graded
      ? {
          level: (box, y) => levelPad(source, box, y),
          lock: (box) => lockFootprint(source, box),
        }
      : {}),
  };
  const network: NetworkReport = emptyNetworkReport();
  const t0 = performance.now();
  const map = new SettlementMap(
    world.settlements!,
    {
      ...terrain,
      waterLines: world.features?.water.lines,
      bounds: source.bounds,
      ...(graded
        ? {
            grade: (plan: Parameters<typeof applyRoadGrading>[1]) =>
              (grading = applyRoadGrading(source, plan, world.features?.water.lines)),
            gradeStreets: (plan: Parameters<typeof applyRoadGrading>[1]) =>
              applyRoadGrading(source, plan, world.features?.water.lines, { respectLocks: true }),
          }
        : {}),
    },
    undefined,
    network,
  );
  return { source, water, terrain, map, grading, network, buildMs: performance.now() - t0 };
}
