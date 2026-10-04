import { beforeAll, describe, expect, it } from 'vitest';
import { BanditSystem, type BanditContext } from '../src/bandits/BanditSystem';
import type { BanditPlayer } from '../src/bandits/perception';
import { FarSim, lootSpotsOf } from '../src/battleRoyale/farSim';
import { defaultSetup } from '../src/battleRoyale/kinds';
import { BrNearTier, contestantOfBandit } from '../src/battleRoyale/nearTier';
import { planMatch } from '../src/battleRoyale/plan';
import { TargetRegistry, playerTargetProvider } from '../src/combat/targets';
import { BATTLE_ROYALE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import type { RegionData } from '../src/data/region';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealWorld } from './helpers/realRegion';

/**
 * Yakın kademe gerçek arazide (BR.3): Zonguldak'ta 40 kişilik maç, oyuncu il merkezinde durur. Uzak NPC'ler yaklaştıkça
 * yarışmacıya dönüşür, gerçek arazide yürür ve çatışır; maç tutarlı ilerler. Adım maliyeti ölçülür.
 */

let world: RegionData;
let source: RegionHeightSource;
const walk = (x: number, z: number): boolean =>
  source.contains(x, z) && source.elevationAt(x, z) >= 1 && source.slopeDegAt(x, z) <= 60;
const spawnOk = (x: number, z: number): boolean => walk(x, z) && source.slopeDegAt(x, z) <= 40;

beforeAll(async () => {
  world = await loadRealWorld();
  source = RegionHeightSource.fromRegion(world);
}, 60_000);

const RADIUS = { il: 60, ilce: 35, koy: 15 } as const;
const DT = 1 / 60;

describe('yakın kademe (gerçek arazi)', () => {
  it('Zonguldak, 40 kişi: yarışmacılar karada kalır, çatışır; maç tutarlı', () => {
    const plan = planMatch(
      { ...defaultSetup(), area: { kind: 'provinces', names: ['Zonguldak'] }, players: 40 },
      11,
      { provinces: world.provinces, spawnOpen: spawnOk, zoneCenterOk: spawnOk },
    );
    const zone = { plan: plan.zone, area: plan.area };
    const spots = lootSpotsOf(
      (world.settlements?.settlements ?? []).map((s) => ({ ...s, radius: RADIUS[s.rank] })),
    );
    const far = new FarSim(
      plan.match,
      zone,
      { walkable: walk, lootSpots: spots },
      11,
      plan.spawns.slice(1).map((s, i) => ({ id: i + 1, ...s })),
    );
    const events = new EventBus<GameEvents>();
    const bandits = new BanditSystem(events, [], {
      heightAt: (x, z) => source.heightAt(x, z),
      slopeDegAt: (x, z) => source.slopeDegAt(x, z),
      isSea: (x, z) => source.elevationAt(x, z) < 0.5,
    });
    const tier = new BrNearTier(plan.match, far, bandits, { ready: () => true }, zone, 'normal');
    // Oyuncu: Zonguldak il merkezi (yerleşimlerin çoğu çevrede); kıpırdamaz, ölmez.
    const center = world.settlements!.settlements.find(
      (s) => s.rank === 'il' && s.province === 'Zonguldak',
    )!;
    const player: BanditPlayer = {
      x: center.x,
      y: source.heightAt(center.x, center.z),
      z: center.z,
      activity: 'rest',
      alive: true,
      sanctuary: false,
    };
    const registry = new TargetRegistry();
    let playerHits = 0;
    registry.register(
      playerTargetProvider({
        position: () => player,
        radius: 0.35,
        height: 1.8,
        damage: () => playerHits++,
      }),
    );
    registry.register(bandits);
    let t = 0;
    events.on('bandit:damaged', (e) => {
      const c = contestantOfBandit(e.id);
      if (e.killed && c !== null) tier.onKilled(c, BrNearTier.killerOf(e), e.weapon ?? null, t);
    });
    const ctx: BanditContext = {
      player,
      hour: 12,
      darkness: 0,
      now: 0,
      targets: registry,
      prey: () => [],
    };
    let maxNear = 0;
    let offLand = 0;
    let promoted = 0;
    const seen = new Set<number>();
    const started = performance.now();
    const seconds = 300;
    for (let i = 0; i < seconds / DT; i++) {
      t += DT;
      far.update(t);
      tier.update(DT, t, player);
      bandits.update(DT, ctx);
      if (i % 60 === 0) {
        maxNear = Math.max(maxNear, tier.aliveCount);
        for (const c of bandits.contestants()) {
          if (!seen.has(c.contestant)) {
            seen.add(c.contestant);
            promoted++;
          }
          if (c.state !== 'dead' && source.elevationAt(c.x, c.z) < 0.5) offLand++;
        }
      }
    }
    const msPerStep = (performance.now() - started) / (seconds / DT);
    const nearKills = plan.match.eliminations.filter(
      (e) => e.cause === 'kill' && e.killer !== null && seen.has(e.victim),
    );
    console.info(
      `BR.3 Zonguldak 40: yakına geçen ${promoted}, aynı anda en çok ${maxNear}, elenen ${plan.match.eliminations.length} ` +
        `(yakında öldürülen ${nearKills.length}), oyuncuya isabet ${playerHits}, adım ${msPerStep.toFixed(3)} ms`,
    );
    expect(promoted).toBeGreaterThan(3);
    expect(maxNear).toBeLessThanOrEqual(BATTLE_ROYALE.near.maxAgents);
    expect(offLand).toBe(0);
    expect(nearKills.length).toBeGreaterThan(0);
    // Maç tutarlı: kalan + elenen = toplam, sıralar eşsiz.
    expect(plan.match.aliveCount + plan.match.eliminations.length).toBe(40);
    expect(new Set(plan.match.eliminations.map((e) => e.placement)).size).toBe(
      plan.match.eliminations.length,
    );
    expect(msPerStep).toBeLessThan(2);
  }, 120_000);
});
