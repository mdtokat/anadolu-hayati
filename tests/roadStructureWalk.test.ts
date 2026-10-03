import { describe, expect, it } from 'vitest';
import { ROADS, ROAD_STRUCTURES } from '../src/config';
import { SPAN_KIND, type PlannedRoad, type RoadPlan } from '../src/settlements/roadProfile';
import { StructureIndex } from '../src/world/roadStructureGeometry';
import { StructureWalkSolids } from '../src/world/roadStructureWalk';

/** x ekseninde 30 m'lik düz beton köprü; güverte 5 m yükseklikte, altta 4 m'lik dere yatağı. */
function bridgePlan(): RoadPlan {
  const count = 15;
  const xz = new Float32Array(count * 2);
  const natural = new Float32Array(count);
  const bed = new Float32Array(count);
  const kind = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    xz[i * 2] = i * 3;
    natural[i] = i < 3 || i > 11 ? 5 : 4;
    bed[i] = 5;
    if (i >= 3 && i <= 11) kind[i] = SPAN_KIND.bridge;
  }
  return {
    roads: [{ cls: 0, xz, step: 3, natural, bed, kind } satisfies PlannedRoad],
    spans: [{ road: 0, i0: 2, i1: 12, kind: SPAN_KIND.bridge, viaduct: false, type: 'beam' }],
  };
}

describe('StructureWalkSolids (köprü/tünel kutuları yürüyen gövdeyi keser)', () => {
  const solids = new StructureWalkSolids(new StructureIndex(bridgePlan()));
  const half = (ROADS.width[0] as number) / 2 + (ROAD_STRUCTURES.widthPad[0] as number);

  it('güvertede yol boyunca yürümek serbest', () => {
    expect(solids.blocks(10, 0, 11, 0, 0.4, 5)).toBe(false);
  });

  it('güverteden korkuluğu aşıp yana atlamak engellenir', () => {
    expect(solids.blocks(15, half - 1.2, 15, half + 0.9, 0.4, 5)).toBe(true);
    expect(solids.blocks(15, -half + 1.2, 15, -half - 0.9, 0.4, 5)).toBe(true);
  });

  it('köprüden uzakta engel yok', () => {
    expect(solids.blocks(10, 80, 11, 80, 0.4, 5)).toBe(false);
  });
});
