import { beforeAll, describe, expect, it } from 'vitest';
import { FarSim, lootSpotsOf } from '../src/battleRoyale/farSim';
import { defaultSetup, type BrAreaChoice } from '../src/battleRoyale/kinds';
import { planMatch } from '../src/battleRoyale/plan';
import { BATTLE_ROYALE } from '../src/config';
import type { RegionData } from '../src/data/region';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealWorld } from './helpers/realRegion';

/**
 * Uzak kademe simülasyonu gerçek dünyada (BR.2): NPC'ler dağ sırtına/kıyıya takılmadan bölgeye yetişir, maç bölge
 * kapanmadan tek kazananla biter. Ölçüm tablosu `docs/battle-royale-plan.md` §9.
 */

let world: RegionData;
let source: RegionHeightSource;
/** Oyuncunun eğim sınırıyla aynı (`REGION_PLAYER.maxSlopeDeg`). */
const walk = (x: number, z: number): boolean =>
  source.contains(x, z) && source.elevationAt(x, z) >= 1 && source.slopeDegAt(x, z) <= 60;
const spawnOk = (x: number, z: number): boolean => walk(x, z) && source.slopeDegAt(x, z) <= 40;

beforeAll(async () => {
  world = await loadRealWorld();
  source = RegionHeightSource.fromRegion(world);
}, 60_000);

/** Testte yerleşim yarıçapı rütbeden (oyunda `SettlementMap` ayak izi). */
const RADIUS = { il: 60, ilce: 35, koy: 15 } as const;

function run(area: BrAreaChoice, players: number, seed: number) {
  const plan = planMatch({ ...defaultSetup(), area, players }, seed, {
    provinces: world.provinces,
    spawnOpen: spawnOk,
    zoneCenterOk: spawnOk,
  });
  const spots = lootSpotsOf(
    (world.settlements?.settlements ?? []).map((s) => ({
      x: s.x,
      z: s.z,
      rank: s.rank,
      radius: RADIUS[s.rank],
    })),
  );
  const sim = new FarSim(
    plan.match,
    { plan: plan.zone, area: plan.area },
    { walkable: walk, lootSpots: spots },
    seed,
    plan.spawns.map((s, id) => ({ id, ...s })),
  );
  let offTrack = 0;
  for (let t = 30; plan.match.aliveCount > 1 && t < plan.zone.total + 120; t += 30) {
    sim.update(t);
    for (const a of sim.all()) if (!walk(a.x, a.z)) offTrack++;
  }
  return { plan, sim, offTrack };
}

describe('uzak kademe (gerçek dünya)', () => {
  it.each([
    ['tüm harita', { kind: 'world' } as BrAreaChoice, 100],
    ['Zonguldak', { kind: 'provinces', names: ['Zonguldak'] } as BrAreaChoice, 24],
    ['Ankara', { kind: 'provinces', names: ['Ankara'] } as BrAreaChoice, 100],
  ])(
    '%s: tek kazanan, bölge kapanmadan; bölge ölümleri az',
    (_, area, players) => {
      const { plan, offTrack } = run(area, players, 1);
      const events = plan.match.eliminations;
      expect(plan.match.aliveCount).toBe(1);
      expect(events.at(-1)!.time).toBeLessThan(plan.zone.total);
      // Ateşkes boyunca kimse çatışmada ölmez.
      expect(
        events.filter((e) => e.cause === 'kill' && e.time < BATTLE_ROYALE.far.graceSeconds),
      ).toHaveLength(0);
      const zoneDeaths = events.filter((e) => e.cause === 'zone').length;
      expect(zoneDeaths / players).toBeLessThanOrEqual(0.1);
      expect(offTrack).toBe(0);
    },
    60_000,
  );
});
