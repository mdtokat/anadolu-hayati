import { beforeAll, describe, expect, it } from 'vitest';
import { BanditSystem, type BanditContext, type BanditWorld } from '../src/bandits/BanditSystem';
import type { BanditPlayer } from '../src/bandits/perception';
import { TargetRegistry, playerTargetProvider } from '../src/combat/targets';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { NO_OBSTACLES } from '../src/placement/obstacles';
import { BuildingWalk } from '../src/settlements/buildingWalk';
import { isMosque, shapeVariant } from '../src/settlements/kinds';
import type { Building } from '../src/settlements/layout';
import { buildingLocalToWorld } from '../src/settlements/SettlementMap';
import { loadBanditWorld, type BanditWorld as RealWorld } from './helpers/banditWorld';

/**
 * Gerçek dünyada NPC'lerin binaya girmesi (kullanıcı talimatı): il/ilçe merkezlerindeki girilebilir yapılardan örnekler;
 * oyuncu odanın ortasında, eşkıya kapının 12 m önünde doğar ve yan yollardan, merdivenden, teraslardan geçip odaya girer.
 */

const DT = 1 / 60;
let real: RealWorld;

// Gerçek dünya + yerleşim haritası kurulumu CI'da yük altında 30 sn'yi aşabiliyor (banditCamps gibi).
beforeAll(async () => {
  real = await loadBanditWorld();
}, 120_000);

function sample(buildings: readonly Building[], count: number): Building[] {
  const pool = buildings.filter((b) => {
    const shape = shapeVariant(b.kind, b.floors, b.ruined);
    return shape.interior !== null && !isMosque(b.kind) && !b.ruined;
  });
  const step = Math.max(1, Math.floor(pool.length / count));
  return pool.filter((_, i) => i % step === 0).slice(0, count);
}

describe('gerçek dünyada eşkıya binaya girer', () => {
  it('örnek yapıların çoğunda kapıdan girip odadaki oyuncuya ulaşır', () => {
    const { map, source } = real.settlement;
    const world: BanditWorld = {
      heightAt: (x, z) => source.heightAt(x, z),
      slopeDegAt: (x, z) => source.slopeDegAt(x, z),
      isSea: (x, z) => source.elevationAt(x, z) < 0.5,
    };
    const walk = new BuildingWalk(map, (x, z) => source.heightAt(x, z));
    const towns = map.settlements.filter((s) => s.data.rank !== 'koy');
    const picked = sample(
      towns.flatMap((s) => s.buildings),
      24,
    );
    expect(picked.length).toBeGreaterThanOrEqual(16);
    let entered = 0;
    const failures: string[] = [];
    for (const b of picked) {
      const shape = shapeVariant(b.kind, b.floors, b.ruined);
      const area = shape.interior!;
      const spot = buildingLocalToWorld(b, shape.door.x * 0.5, (area.back + area.front) / 2);
      const player: BanditPlayer = {
        x: spot.x,
        y: walk.surfaceAt(spot.x, spot.z, b.y + 0.3),
        z: spot.z,
        // Koşan oyuncu duyulur (içeride görüş hattı teraslara kesilse de eşkıya sesin geldiği yere gider).
        activity: 'run',
        alive: true,
        sanctuary: false,
      };
      const events = new EventBus<GameEvents>();
      const system = new BanditSystem(events, [], world);
      const registry = new TargetRegistry();
      registry.register(
        playerTargetProvider({
          position: () => player,
          radius: 0.35,
          height: 1.8,
          damage: () => undefined,
        }),
      );
      registry.register(system);
      const ctx: BanditContext = {
        player,
        hour: 12,
        darkness: 0,
        now: 10 * 86_400 + 12 * 3600,
        targets: registry,
        prey: () => [],
        obstacles: NO_OBSTACLES,
        walk,
      };
      const doors = walk.doorPoints(b);
      const out = { x: doors.outside.x - doors.inside.x, z: doors.outside.z - doors.inside.z };
      const len = Math.hypot(out.x, out.z) || 1;
      const start = {
        x: doors.outside.x + (out.x / len) * 8,
        z: doors.outside.z + (out.z / len) * 8,
      };
      const id = system.spawnAt(start.x, start.z, 'pala', 'patrol');
      let ok = false;
      for (let i = 0; i < 45 / DT && !ok; i++) {
        system.update(DT, ctx);
        const v = system.views().find((m) => m.id === id)!;
        ok = walk.locate(v.x, v.y, v.z)?.building.id === b.id;
      }
      if (ok) entered += 1;
      else failures.push(`${b.kind}#${b.id}`);
    }
    if (process.env.NPC_REPORT) console.log(entered, picked.length, failures.join(' '));
    // Bazı yapıların kapı önü terasın kenarıdır (merdivensiz, birkaç metre aşağısı yamaç): oraya başka yandan çıkılır.
    // Ölçüm: 24 yapının 23'ü.
    expect(entered / picked.length).toBeGreaterThanOrEqual(0.85);
  }, 120_000);
});
