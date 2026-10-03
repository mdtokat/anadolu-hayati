import { beforeAll, describe, expect, it } from 'vitest';
import { CREATURES, FRESH_WATER } from '../src/config';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import {
  CREATURE_KINDS,
  type CreatureContext,
  type CreatureKind,
  type CreatureTerrain,
} from '../src/creatures/kinds';
import { createRegionCreatureTerrain } from '../src/creatures/regionTerrain';
import {
  candidatesForCell,
  cellKey,
  habitatSuitability,
  makeSpawnGrid,
  passable,
} from '../src/creatures/spawn';
import { SPECIES } from '../src/creatures/species';
import type { RegionData } from '../src/data/region';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealRegion } from './helpers/realRegion';

let region: RegionData;
let terrain: CreatureTerrain;
let grid: ReturnType<typeof makeSpawnGrid>;

beforeAll(async () => {
  region = await loadRealRegion();
  const source = RegionHeightSource.fromRegion(region);
  const cover = LandCoverMap.fromRegion(region);
  const water = new FreshWaterIndex(region.features!.water, FRESH_WATER.indexCellSize);
  terrain = createRegionCreatureTerrain({ source, cover, freshWater: water });
  grid = makeSpawnGrid(terrain.bounds);
});

function allCandidates(epoch: number) {
  const out = [];
  for (let cy = grid.cy0; cy < grid.cy0 + grid.rows; cy++) {
    for (let cx = grid.cx0; cx < grid.cx0 + grid.cols; cx++) {
      out.push(...candidatesForCell({ grid, terrain, cx, cy, epoch }));
    }
  }
  return out;
}

describe('gerçek bölge: doğma kuralları', () => {
  it('ızgara chunk ızgarasıyla aynı: 52×25 hücre, ilk hücre kafes chunk’ı (−13, −3)', () => {
    expect(grid.cols).toBe(52);
    expect(grid.rows).toBe(25);
    expect([grid.cx0, grid.cy0]).toEqual([-13, -3]);
  });

  it('her aday kendi türünün arazi örtüsü/rakım/eğim/su kuralına uyar', () => {
    const candidates = allCandidates(0);
    expect(candidates.length).toBeGreaterThan(100);
    const leaders = new Set<string>();
    const seen = new Set<string>();
    for (const c of candidates) {
      const sp = SPECIES[c.kind];
      // Hücre içinde tekil kimlik.
      expect(seen.has(String(c.id))).toBe(false);
      seen.add(String(c.id));
      expect(c.cell).toBe(
        cellKey(
          Math.floor((c.x - grid.minX) / grid.size),
          Math.floor((c.z - grid.minZ) / grid.size),
        ),
      );

      // Her aday: kara, eğim sınırı altı, deniz değil, kar/yerleşim/veri yok değil.
      expect(passable(sp, terrain, c.x, c.z)).toBe(true);
      expect(terrain.isSea(c.x, c.z)).toBe(false);
      expect(terrain.elevationAt(c.x, c.z)).toBeGreaterThanOrEqual(CREATURES.seaElevationMeters);

      // Grup lideri (aynı hücre, tür, u'nun ilk üyesi) biyom uygunluğunu tam sağlar.
      const key = `${c.cell}:${c.kind}:${c.u}`;
      if (!leaders.has(key)) {
        leaders.add(key);
        expect(habitatSuitability(sp, terrain, c.x, c.z)).toBeGreaterThan(0);
        expect(Object.keys(sp.habitat.cover)).toContain(terrain.coverAt(c.x, c.z));
        const [a, , , d] = sp.habitat.elevation;
        const elevation = terrain.elevationAt(c.x, c.z);
        expect(elevation).toBeGreaterThan(a);
        expect(elevation).toBeLessThan(d);
        expect(terrain.waterNear(c.x, c.z, CREATURES.spawnWaterClearance)).toBe(false);
      }
    }
  });

  it('hiçbir aday kar, yerleşim, veri-yok ya da çıplak arazide değil (sürü üyesi kaya kenarında olabilir)', () => {
    const banned = new Set(['snow', 'urban', 'none', 'barren', 'wetland']);
    // Sürü/grup üyeleri liderin çevresine yalnızca geçilebilirlik denetimiyle dağılır (spawn.ts); Bolu dağlarında
    // ormanın kaya kenarına düşebilirler (7.9'da gerçek veride görüldü). Kar/yerleşim/veri-yok yine yasak.
    const memberBanned = new Set(['snow', 'urban', 'none']);
    for (const epoch of [0, 1, 2]) {
      const leaders = new Set<string>();
      for (const c of allCandidates(epoch)) {
        const group = `${c.cell}:${c.kind}:${c.u}`;
        const leader = !leaders.has(group);
        leaders.add(group);
        if (c.kind === 'wolf' || c.kind === 'brown_bear') {
          const cover = terrain.coverAt(c.x, c.z);
          expect((leader ? banned : memberBanned).has(cover), `${c.kind} ${cover}`).toBe(false);
        }
        expect(terrain.isSea(c.x, c.z)).toBe(false);
      }
    }
  });

  it('dönem aynı kaldıkça aynı, değişince farklı (determinizm)', () => {
    expect(JSON.stringify(allCandidates(0))).toBe(JSON.stringify(allCandidates(0)));
    expect(JSON.stringify(allCandidates(1))).not.toBe(JSON.stringify(allCandidates(0)));
  });

  it('tür dağılımı makul: karaca/domuz bol, kurt az, ayı en seyrek ve yüksek rakımda', () => {
    const count = Object.fromEntries(CREATURE_KINDS.map((k) => [k, 0])) as Record<
      CreatureKind,
      number
    >;
    const bearElevations: number[] = [];
    for (let epoch = 0; epoch < 3; epoch++) {
      for (const c of allCandidates(epoch)) {
        count[c.kind]++;
        if (c.kind === 'brown_bear') bearElevations.push(terrain.elevationAt(c.x, c.z));
      }
    }
    expect(count.roe_deer).toBeGreaterThan(count.wolf);
    expect(count.wild_boar).toBeGreaterThan(count.wolf);
    expect(count.wolf).toBeGreaterThan(count.brown_bear);
    if (bearElevations.length > 0) expect(Math.min(...bearElevations)).toBeGreaterThan(500);
  });
});

/** Belirli bir türden aday çevresinde, oyuncuyu adayın arkasına koyan başlangıç (aday görüş dışı kalır). */
function anchors(kind: CreatureKind, count: number, epoch = 0) {
  const found: Array<{ x: number; z: number }> = [];
  for (const c of allCandidates(epoch)) {
    if (c.kind !== kind) continue;
    if (found.every((f) => Math.hypot(f.x - c.x, f.z - c.z) > 600)) found.push({ x: c.x, z: c.z });
    if (found.length >= count) break;
  }
  return found;
}

describe('gerçek bölge: araziye oturma ve takılmama (kabul 1)', () => {
  /** `CREATURE_STRESS=4 npm test` gibi: süre ve başlangıç noktası sayısını çarpar (5.5 ölçümü). */
  const STRESS = Math.max(1, Number(process.env.CREATURE_STRESS ?? 1));
  const SECONDS = 90 * STRESS;
  const DT = 1 / 60;

  it.each(CREATURE_KINDS)(
    '%s: zemine oturur, denize/dik yamaca girmez, hareketliyken takılı kalmaz',
    (kind) => {
      const spots = anchors(kind, (kind === 'brown_bear' ? 2 : 4) * STRESS, 0);
      expect(spots.length).toBeGreaterThan(0);

      let stuck = 0;
      let observed = 0;
      let movingSeconds = 0;
      let waterSteps = 0;
      const maxSlope = Object.fromEntries(CREATURE_KINDS.map((k) => [k, SPECIES[k].maxSlopeDeg]));

      for (const spot of spots) {
        const system = new CreatureSystem();
        const ctx: CreatureContext = {
          player: { x: spot.x, y: 0, z: spot.z + 130, activity: 'walk', alive: true, yaw: Math.PI },
          hour: kind === 'wolf' ? 23 : 12,
          sunAltitudeDeg: kind === 'wolf' ? -30 : 50,
          isNight: kind === 'wolf',
          fires: [],
          terrain,
        };
        // Pencere: hareketli durumdaki canlının yer değiştirmesi.
        const windows = new Map<
          number,
          { x: number; z: number; t: number; moving: boolean; reach: number }
        >();
        const windowSeconds = CREATURES.stuckSeconds * 2;

        for (let i = 0; i < SECONDS / DT; i++) {
          // Oyuncu yavaş bir daire çizer (canlılarla etkileşim: fark etme/kaçma/kovalama).
          const angle = (i * DT) / 25;
          ctx.player.x = spot.x + Math.sin(angle) * 40;
          ctx.player.z = spot.z + 130 - Math.cos(angle) * 40;
          ctx.player.yaw = Math.PI + Math.sin(angle * 0.7);
          system.update(DT, ctx);

          for (const v of system.views()) {
            if (v.dead) continue;
            // Zemine oturma.
            expect(Math.abs(v.y - terrain.heightAt(v.x, v.z))).toBeLessThan(1e-6);
            // Deniz ve eğim sınırı.
            expect(terrain.isSea(v.x, v.z)).toBe(false);
            expect(terrain.slopeDegAt(v.x, v.z)).toBeLessThanOrEqual(maxSlope[v.kind]! + 1e-6);
            if (terrain.waterNear(v.x, v.z, 0.001)) waterSteps++;

            // Takılma penceresi.
            const moving = ['wander', 'flee', 'stalk', 'chase'].includes(v.state);
            let w = windows.get(v.id);
            if (!w) {
              w = { x: v.x, z: v.z, t: 0, moving, reach: 0 };
              windows.set(v.id, w);
            }
            w.t += DT;
            w.reach = Math.max(w.reach, Math.hypot(v.x - w.x, v.z - w.z));
            w.moving = w.moving && moving;
            if (moving) movingSeconds += DT;
            if (w.t >= windowSeconds) {
              if (w.moving) {
                observed++;
                if (w.reach < CREATURES.stuckMinDistance) {
                  stuck++;
                  if (process.env.CREATURE_DEBUG)
                    console.log(
                      'STUCK',
                      kind,
                      v.kind,
                      v.state,
                      v.x.toFixed(1),
                      v.z.toFixed(1),
                      'spd',
                      v.speed.toFixed(2),
                      'slope',
                      terrain.slopeDegAt(v.x, v.z).toFixed(1),
                      't',
                      (i * DT).toFixed(0),
                    );
                }
              }
              w.x = v.x;
              w.z = v.z;
              w.t = 0;
              w.reach = 0;
              w.moving = moving;
            }
          }
        }
        system.dispose();
      }
      // Hareket gerçekten gözlendi ve takılan yok.
      expect(movingSeconds).toBeGreaterThan(0);
      expect(stuck).toBe(0);
      // Göl içine girme yalnızca nadir bir aşımdır (göl denetimi aralıklıdır); burada raporlanır.
      expect(waterSteps).toBeLessThan(SECONDS * 60 * 0.5);
      void observed;
    },
    120_000 * STRESS * STRESS,
  );
});

describe('gerçek bölge: CPU', () => {
  it('bir update adımı gevşek üst sınırın altında; durum haritası büyümez', () => {
    const system = new CreatureSystem();
    const DT = 1 / 60;
    const spot = anchors('roe_deer', 1)[0]!;
    const ctx: CreatureContext = {
      player: { x: spot.x, y: 0, z: spot.z + 130, activity: 'walk', alive: true, yaw: Math.PI },
      hour: 12,
      sunAltitudeDeg: 50,
      isNight: false,
      fires: [],
      terrain,
    };
    let worst = 0;
    let total = 0;
    let steps = 0;
    let peakActive = 0;
    for (let i = 0; i < 60 * 60; i++) {
      // Oyuncu koşarak ilerler: sürekli doğma/kaldırma.
      ctx.player.z -= 0.12;
      ctx.player.x += 0.05;
      const t0 = performance.now();
      system.update(DT, ctx);
      const ms = performance.now() - t0;
      worst = Math.max(worst, ms);
      total += ms;
      steps++;
      peakActive = Math.max(peakActive, system.stats.active);
    }
    expect(peakActive).toBeLessThanOrEqual(CREATURES.maxActive);
    expect(total / steps).toBeLessThan(2);
    // En kötü tek adım (aday üretimi dahil) CI gürültüsüne cömert bir sınırın altında.
    expect(worst).toBeLessThan(60);
    system.dispose();
  }, 60_000);
});
