import { describe, expect, it } from 'vitest';
import { BanditSystem, type BanditContext, type BanditWorld } from '../src/bandits/BanditSystem';
import { lineWalkable, planPath } from '../src/bandits/navigation';
import { TargetRegistry, playerTargetProvider } from '../src/combat/targets';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import type { BanditPlayer } from '../src/bandits/perception';
import { BuildingWalk } from '../src/settlements/buildingWalk';
import { shapeVariant, type BuildingKind } from '../src/settlements/kinds';
import type { Building } from '../src/settlements/layout';
import { buildingLocalToWorld } from '../src/settlements/SettlementMap';
import { NO_OBSTACLES } from '../src/placement/obstacles';

/**
 * Kullanıcı talimatı: "tüm modlarda NPC'ler de binalara girebilsin, hareketleri daha akıllı olsun". Yapı yürüyüşü
 * (kapıdan girilir, duvardan geçilmez, merdivenle kata çıkılır), A* yol bulma ve eşkıyanın binadaki oyuncuya ulaşması.
 */

const DT = 1 / 60;
const flat: BanditWorld = { heightAt: () => 0, slopeDegAt: () => 0, isSea: () => false };

function building(kind: BuildingKind, patch: Partial<Building> = {}): Building {
  return {
    id: 1024 + Math.floor(Math.random() * 1000),
    settlement: 1,
    kind,
    x: 0,
    z: 0,
    y: 0,
    base: 0,
    yaw: 0,
    ruin: 0,
    ruined: false,
    tone: 0.5,
    floors: 1,
    name: null,
    stairRun: 0,
    ...patch,
  };
}

function walkOf(buildings: Building[]): BuildingWalk {
  return new BuildingWalk(
    {
      buildingsNear: (x, z, r) => buildings.filter((b) => Math.hypot(b.x - x, b.z - z) <= r),
      stairs: [],
    },
    () => 0,
  );
}

describe('yapı yürüyüşü', () => {
  const house = building('house', { id: 5001, x: 3, z: -2, yaw: 0.6 });
  const walk = walkOf([house]);
  const shape = shapeVariant('house');
  const local = (lx: number, lz: number) => buildingLocalToWorld(house, lx, lz);

  it('duvardan geçilmez, kapı ekseninden girilir', () => {
    const behind = local(0, -shape.depth / 2 - 1.5);
    const inside = local(0, 0);
    expect(walk.blocked(behind.x, behind.z, inside.x, inside.z, 0.38, 0)).toBe(true);
    const front = local(shape.door.x, shape.depth / 2 + 1.2);
    const threshold = local(shape.door.x, shape.depth / 2 - 0.8);
    expect(walk.blocked(front.x, front.z, threshold.x, threshold.z, 0.38, 0)).toBe(false);
    expect(walk.surfaceAt(inside.x, inside.z, 0)).toBeCloseTo(0, 9);
    expect(walk.locate(inside.x, 0, inside.z)?.building.id).toBe(house.id);
    expect(walk.locate(behind.x, 0, behind.z)).toBeNull();
  });

  it('içerideki hedefe: önce kapı önü, kapı hattında kapı içi; içeriden dışarı tersi', () => {
    const behind = local(0.5, -shape.depth / 2 - 3);
    const target = { ...local(0.4, -0.5), y: 0 };
    const doors = walk.doorPoints(house);
    expect(walk.route({ ...behind, y: 0 }, target)).toEqual(doors.outside);
    expect(walk.route({ ...doors.outside, y: 0 }, target)).toEqual(doors.inside);
    // İçeride aynı odadaysa doğrudan.
    expect(walk.route({ ...local(-0.5, 0.5), y: 0 }, target)).toBeNull();
    // İçeriden dışarı: kapı içi, sonra kapı önü.
    const out = { ...behind, y: 0 };
    expect(walk.route({ ...local(-1, -1), y: 0 }, out)).toEqual(doors.inside);
    expect(walk.route({ ...doors.inside, y: 0 }, out)).toEqual(doors.outside);
  });

  it('katlı yapı: merdiven kolu yüzeyi yükselir, üst kattaki hedefe kolun uçlarından gidilir', () => {
    const apt = building('apartment', { id: 7001, floors: 4 });
    const w = walkOf([apt]);
    const plan = shapeVariant('apartment', 4).storeys!;
    const f = plan.flights[0]!;
    const mid = buildingLocalToWorld(apt, f.x, (f.zFrom + f.zTo) / 2);
    const y = w.surfaceAt(mid.x, mid.z, (f.y0 + f.y1) / 2 - 0.1);
    expect(y).toBeGreaterThan(f.y0 + 0.3);
    expect(y).toBeLessThan(f.y1 - 0.3);
    const ground = { ...buildingLocalToWorld(apt, 0, 0), y: 0 };
    const upstairs = { ...buildingLocalToWorld(apt, 0, 0), y: plan.floorY[2]! };
    expect(w.locate(upstairs.x, upstairs.y, upstairs.z)?.level).toBe(2);
    const step = w.route(ground, upstairs)!;
    expect(step).not.toBeNull();
    // Kolun alt ucunun önündeki nokta (kolun hattında).
    const bottom = buildingLocalToWorld(apt, f.x, f.zFrom - Math.sign(f.zTo - f.zFrom) * 0.7);
    expect(step.x).toBeCloseTo(bottom.x, 6);
    expect(step.z).toBeCloseTo(bottom.z, 6);
  });
});

describe('A* yol bulma', () => {
  it('duvarın arkasındaki hedefe dolaşarak gider; ip çekilmiş yol yürünebilir', () => {
    // Dikey duvar: x = 0, z ∈ [−6, 6].
    const probe = (x0: number, z0: number, y0: number, x1: number, z1: number) => {
      if (x0 < 0 !== x1 < 0) {
        const t = -x0 / (x1 - x0);
        if (Math.abs(z0 + t * (z1 - z0)) < 6.4) return null;
      }
      return y0;
    };
    const path = planPath({ x: -3, y: 0, z: 0 }, { x: 3, z: 0 }, probe)!;
    expect(path).not.toBeNull();
    const last = path[path.length - 1]!;
    expect(Math.hypot(last.x - 3, last.z)).toBeLessThan(0.01);
    let from = { x: -3, z: 0, y: 0 };
    for (const p of path) {
      expect(lineWalkable(from, p, probe)).toBe(true);
      from = { ...p, y: 0 };
    }
  });
});

function banditSetup(buildings: Building[], player: BanditPlayer) {
  const events = new EventBus<GameEvents>();
  const system = new BanditSystem(events, [], flat);
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
  const walk = walkOf(buildings);
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
  return { system, walk, ctx };
}

describe('eşkıya binaya girer', () => {
  it('evin içindeki oyuncuya kapıdan girerek ulaşır (arkadan başlasa da)', () => {
    const house = building('house', { id: 9001, yaw: 0.3 });
    const shape = shapeVariant('house');
    const spot = buildingLocalToWorld(house, 0.5, -0.4);
    const player: BanditPlayer = {
      x: spot.x,
      y: 0,
      z: spot.z,
      activity: 'walk',
      alive: true,
      sanctuary: false,
    };
    const { system, walk, ctx } = banditSetup([house], player);
    const start = buildingLocalToWorld(house, 0, -shape.depth / 2 - 8);
    const id = system.spawnAt(start.x, start.z, 'pala', 'patrol');
    let inside = false;
    for (let i = 0; i < 40 / DT && !inside; i++) {
      system.update(DT, ctx);
      const v = system.views().find((b) => b.id === id)!;
      inside = walk.locate(v.x, v.y, v.z)?.building.id === house.id;
    }
    expect(inside).toBe(true);
  });

  it('apartmanın üst katındaki oyuncuya merdivenden çıkar', () => {
    const apt = building('apartment', { id: 9101, floors: 4, yaw: -0.4 });
    const shape = shapeVariant('apartment', 4);
    const plan = shape.storeys!;
    const spot = buildingLocalToWorld(apt, 0, 0);
    const player: BanditPlayer = {
      x: spot.x,
      y: plan.floorY[2]!,
      z: spot.z,
      activity: 'walk',
      alive: true,
      sanctuary: false,
    };
    const { system, walk, ctx } = banditSetup([apt], player);
    const start = buildingLocalToWorld(apt, 4, shape.depth / 2 + 10);
    const id = system.spawnAt(start.x, start.z, 'pala', 'patrol');
    let level = 0;
    for (let i = 0; i < 60 / DT && level < 2; i++) {
      system.update(DT, ctx);
      const v = system.views().find((b) => b.id === id)!;
      level = walk.locate(v.x, v.y, v.z)?.level ?? 0;
    }
    expect(level).toBe(2);
  });
});
