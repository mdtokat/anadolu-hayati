import { beforeAll, describe, expect, it } from 'vitest';
import { TELEPORTS } from '../src/config';
import type { MoveIntent } from '../src/core/inputMapping';
import type { RegionData } from '../src/data/region';
import { initPhysics } from '../src/physics/PhysicsWorld';
import { BUILDING_SHAPES } from '../src/settlements/kinds';
import { SPAN_KIND } from '../src/settlements/roadProfile';
import { buildingLocalToWorld } from '../src/settlements/SettlementMap';
import { loadRealRegion } from './helpers/realRegion';
import { setupWorld, yawToward } from './helpers/walker';

let region: RegionData;

beforeAll(async () => {
  await initPhysics();
  region = await loadRealRegion();
}, 60_000);

const walk: MoveIntent = { forward: 1, strafe: 0, run: false, jump: false };

describe('yerleşimlerde fizik (Faz 10)', () => {
  it('oyuncu cami merdiveninden çıkıp harime girer (içerisi kutsal barınak)', () => {
    const { world, player, step, dispose } = setupWorld(region, true);
    const map = world.settlementMap!;
    // Merdivenli bir mahalle camisi (terasa çıkılır); merdiven ayağının önü yürünebilir (komşu terasın şevi değil).
    const footOf = (s: (typeof map.stairs)[number]) => {
      const b = map.building(s.building)!;
      return buildingLocalToWorld(b, 0, BUILDING_SHAPES[b.kind].depth / 2 + s.run + 1.5);
    };
    const stair = map.stairs.find((s) => {
      if (map.building(s.building)?.kind !== 'mosque' || s.rise <= 0.8) return false;
      const f = footOf(s);
      const b = map.building(s.building)!;
      const side = buildingLocalToWorld(b, 1.5, BUILDING_SHAPES[b.kind].depth / 2 + s.run + 1.5);
      const h = world.terrain.heightAt(f.x, f.z);
      return Math.abs(h - s.y0) < 0.6 && Math.abs(world.terrain.heightAt(side.x, side.z) - h) < 0.6;
    })!;
    expect(stair).toBeDefined();
    const mosque = map.building(stair.building)!;
    const shape = BUILDING_SHAPES[mosque.kind];
    const foot = buildingLocalToWorld(mosque, 0, shape.depth / 2 + stair.run + 1.5);
    world.prepare(foot.x, foot.z);
    player.teleport({ x: foot.x, y: world.terrain.heightAt(foot.x, foot.z) + 0.1, z: foot.z });
    const inside = buildingLocalToWorld(mosque, 0, shape.interior!.back + 2);
    let entered = false;
    for (let i = 0; i < 60 * 25 && !entered; i++) {
      const p = player.position;
      step(walk, yawToward(inside.x - p.x, inside.z - p.z));
      entered =
        map.interiorAt(player.position.x, player.position.y, player.position.z)?.sacred === true;
    }
    expect(entered).toBe(true);
    dispose();
  }, 120_000);

  it('oyuncu tünelin bir ağzından girip öbüründen çıkar (ağızda arazi delik, içeride zemin)', () => {
    const { world, player, step, dispose } = setupWorld(region, true);
    const plan = world.settlementMap!.plan;
    const span = plan.spans
      .filter((s) => s.kind === SPAN_KIND.tunnel)
      .sort((a, b) => a.i1 - a.i0 - (b.i1 - b.i0))[0]!;
    expect(span).toBeDefined();
    const road = plan.roads[span.road]!;
    const at = (i: number) => ({ x: road.xz[i * 2]!, z: road.xz[i * 2 + 1]! });
    const start = at(Math.max(0, span.i0 - 4));
    world.prepare(start.x, start.z);
    player.teleport({ x: start.x, y: world.terrain.heightAt(start.x, start.z) + 0.2, z: start.z });
    let target = Math.max(0, span.i0 - 3);
    let lowest = Infinity;
    const end = Math.min(road.bed.length - 1, span.i1 + 4);
    for (let k = 0; k < 60 * 120 && target <= end; k++) {
      const p = player.position;
      const t = at(target);
      if (Math.hypot(t.x - p.x, t.z - p.z) < 2.5) {
        target++;
        continue;
      }
      step(walk, yawToward(t.x - p.x, t.z - p.z));
      // Tünel içinde arazi yüzeyinin altında, zeminde yürür (düşmez).
      if (target > span.i0 + 1 && target < span.i1 - 1) {
        lowest = Math.min(lowest, player.position.y - road.bed[target]!);
      }
    }
    expect(target).toBeGreaterThan(end);
    expect(lowest).toBeGreaterThan(-1.5);
    dispose();
  }, 180_000);

  it('konutun duvarından geçilmez', () => {
    const { world, player, step, dispose } = setupWorld(region, true);
    const map = world.settlementMap!;
    const house = map.buildings.find((b) => b.kind === 'house' && !b.ruined && b.y - b.base < 0.3)!;
    const shape = BUILDING_SHAPES.house;
    const start = buildingLocalToWorld(house, shape.width / 2 + 4, 0);
    world.prepare(start.x, start.z);
    player.teleport({ x: start.x, y: world.terrain.heightAt(start.x, start.z) + 0.1, z: start.z });
    for (let i = 0; i < 60 * 6; i++) {
      const p = player.position;
      step(walk, yawToward(house.x - p.x, house.z - p.z));
    }
    const p = player.position;
    // Oyuncu ayak izinin dışında kaldı (kapsül yarıçapı payıyla).
    const local = {
      x: (p.x - house.x) * Math.cos(house.yaw) - (p.z - house.z) * Math.sin(house.yaw),
      z: (p.x - house.x) * Math.sin(house.yaw) + (p.z - house.z) * Math.cos(house.yaw),
    };
    expect(
      Math.abs(local.x) > shape.width / 2 - 0.05 || Math.abs(local.z) > shape.depth / 2 - 0.05,
    ).toBe(true);
    dispose();
  }, 120_000);

  it('başlangıç, ışınlanma yerleri ve yeniden doğma noktaları yapıların içine düşmez', () => {
    const { world, dispose } = setupWorld(region, true);
    const map = world.settlementMap!;
    expect(map.buildingAt(world.spawn.x, world.spawn.z, 0.5)).toBeNull();
    for (const place of TELEPORTS) {
      const p = world.safePointFor(place.lat, place.lon);
      if (p) expect(map.buildingAt(p.x, p.z, 0.5), place.name).toBeNull();
    }
    for (let i = 0; i < 8; i++) {
      const p = world.respawnPoint(i);
      if (p) expect(map.buildingAt(p.x, p.z, 0.5)).toBeNull();
    }
    dispose();
  }, 120_000);

  it('çeşme tatlı su verir; yollarda ağaç yok', () => {
    const { world, dispose } = setupWorld(region, true);
    const map = world.settlementMap!;
    const fountain = map.buildings.find((b) => b.kind === 'fountain')!;
    const spout = buildingLocalToWorld(fountain, 0, BUILDING_SHAPES.fountain.depth / 2 + 0.8);
    expect(world.freshWaterNear(spout.x, spout.z)).not.toBeNull();
    // Bir şehirlerarası yol noktasının çevresindeki nesneler (yol üstünde) gizli.
    const road = map.roadLines.find((r) => r.cls === 0)!;
    const x = road.xz[0]!;
    const z = road.xz[1]!;
    world.prepare(x, z);
    for (const prop of world.propsNear(x, z, 8)) {
      expect(map.roads.onRoad(prop.x, prop.z, 0.4)).toBe(false);
    }
    dispose();
  }, 120_000);
});
