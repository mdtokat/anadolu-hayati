import { beforeAll, describe, expect, it } from 'vitest';
import type { MoveIntent } from '../src/core/inputMapping';
import type { RegionData } from '../src/data/region';
import { initPhysics } from '../src/physics/PhysicsWorld';
import { BUILDING_SHAPES } from '../src/settlements/kinds';
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
    // Merdivenli bir mahalle camisi (terasa çıkılır).
    const stair = map.stairs.find(
      (s) => map.building(s.building)?.kind === 'mosque' && s.rise > 0.8,
    )!;
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
