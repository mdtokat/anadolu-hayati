import type { ProvinceShape } from '../data/region';
import { createRandom, seedFrom } from '../utils/random';
import { BrArea } from './area';
import type { BrSetup } from './kinds';
import { BrMatch } from './match';
import { contestantNames } from './names';
import { planSpawns, type BrSpawn } from './spawn';
import { planZone, type ZonePlan } from './zone';

/**
 * Maç planı (saf): kurulum + tohum → alan, bölge planı, başlangıç noktaları ve yarışmacılar. Aynı kurulum, tohum ve
 * dünya aynı planı verir (oyuncunun eylemleri hariç maç yeniden üretilebilir; tohum sonuç ekranında gösterilir).
 */

/** Planın dünyadan istediği (Game/RegionWorld karşılar; testte gerçek arazi ya da sahte). */
export interface MatchWorld {
  provinces: readonly ProvinceShape[];
  /** Yarışmacı başlayabilir mi (karada, yürünebilir, su ve yapı dışı)? */
  spawnOpen(x: number, z: number): boolean;
  /** Bölge dairesinin merkezi olabilir mi (`phase`: aşama sırası; son aşamalarda cami ayak izi dışı vb.)? */
  zoneCenterOk(x: number, z: number, phase: number): boolean;
}

export interface MatchPlan {
  seed: number;
  setup: BrSetup;
  area: BrArea;
  zone: ZonePlan;
  /** Başlangıç noktaları (0. oyuncunun). */
  spawns: BrSpawn[];
  match: BrMatch;
}

export function planMatch(
  setup: BrSetup,
  seed: number,
  world: MatchWorld,
  playerName = 'Sen',
): MatchPlan {
  const area = BrArea.fromChoice(setup.area, world.provinces);
  const zone = planZone(area, createRandom(seedFrom(seed, 1)), setup.shrinkMinutes, (x, z, phase) =>
    world.zoneCenterOk(x, z, phase),
  );
  const spawns = planSpawns(area, setup.players, createRandom(seedFrom(seed, 2)), (x, z) =>
    world.spawnOpen(x, z),
  );
  const names = contestantNames(setup.players - 1, createRandom(seedFrom(seed, 3)));
  const match = new BrMatch([playerName, ...names]);
  return { seed, setup, area, zone, spawns, match };
}
