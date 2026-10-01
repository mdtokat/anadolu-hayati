import { beforeAll, describe, expect, it } from 'vitest';
import { TELEPORTS } from '../src/config';
import type { MoveIntent } from '../src/core/inputMapping';
import type { RegionData } from '../src/data/region';
import { initPhysics } from '../src/physics/PhysicsWorld';
import { latLonToGame } from '../src/world/geo';
import { provinceAt } from '../src/world/provinces';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { findSafeSpawn } from '../src/world/spawn';
import { loadRealRegion } from './helpers/realRegion';
import type { Point } from './helpers/pathfinding';
import { routeBetween, setupWorld, walkPath } from './helpers/walker';

const idle: MoveIntent = { forward: 0, strafe: 0, run: false, jump: false };

let region: RegionData;
let heightSource: RegionHeightSource;

beforeAll(async () => {
  await initPhysics();
  region = await loadRealRegion();
  heightSource = RegionHeightSource.fromRegion(region);
});

const setup = () => setupWorld(region);

describe('RegionWorld (gerçek bölge, fizik)', () => {
  it('doğma noktası Zonguldak yakınında, yürünebilir ve oyuncu zeminde durur', () => {
    const { world, player, step, dispose } = setup();
    const zonguldak = latLonToGame(TELEPORTS[0].lat, TELEPORTS[0].lon, region.meta.originUtm);
    expect(Math.hypot(world.spawn.x - zonguldak.x, world.spawn.z - zonguldak.z)).toBeLessThan(400);

    for (let i = 0; i < 180; i++) step(idle, 0);
    expect(player.grounded).toBe(true);
    // Yerde kalır: doğma yüksekliğinden çok uzaklaşmadı (kayma yok)
    expect(
      Math.abs(player.position.y - world.terrain.heightAt(player.position.x, player.position.z)),
    ).toBeLessThan(0.3);
    expect(provinceAt(region.provinces, player.position.x, player.position.z)?.name).toBe(
      'Zonguldak',
    );
    dispose();
  });

  it("başlangıçta yalnızca yakın chunk'ların collider'ı vardır, hepsi değil", () => {
    const { world, dispose } = setup();
    expect(world.stats.colliders).toBeGreaterThan(0);
    expect(world.stats.colliders).toBeLessThanOrEqual(9);
    expect(world.stats.chunks).toBeGreaterThan(50); // görsel chunk'lar başlangıçta hazır
    dispose();
  });

  it("locationInfo: il adı ve gerçek rakım; deniz altında rakım 0'ın altına inmez", () => {
    const { world, dispose } = setup();
    const safranbolu = world.safePointFor(TELEPORTS[1].lat, TELEPORTS[1].lon) as {
      x: number;
      y: number;
      z: number;
    };
    const info = world.locationInfo(safranbolu.x, safranbolu.z, safranbolu.y);
    expect(info.province).toBe('Karabük');
    expect(info.elevation).toBeGreaterThan(200); // ayak y'sinden × VERTICAL_SCALE
    expect(info.elevation).toBeCloseTo(safranbolu.y * 15, 5);

    const sea = latLonToGame(41.9, 32.0, region.meta.originUtm);
    const underwater = world.locationInfo(sea.x, sea.z, world.terrain.heightAt(sea.x, sea.z));
    expect(underwater.province).toBeNull();
    expect(underwater.elevation).toBe(0);
    dispose();
  });

  it('harita kenarındaki görünmez duvar oyuncuyu içeride tutar', () => {
    const { world, physics, player, step, dispose } = setup();
    const { maxX } = world.source.bounds;
    // Doğu kenarına yakın yürünebilir bir nokta bul
    let target: { x: number; y: number; z: number } | null = null;
    for (let z = -400; z <= 400 && !target; z += 50) {
      const s = findSafeSpawn(world.source, maxX - 20, z, world.maxSlopeDeg);
      if (s && s.x > maxX - 80) target = s;
    }
    expect(target).not.toBeNull();
    const t = target as { x: number; y: number; z: number };
    world.prepare(t.x, t.z);
    player.teleport(t);
    physics.step();

    for (let i = 0; i < 60 * 8; i++) step({ ...idle, forward: 1, run: true }, -Math.PI / 2); // doğuya
    expect(player.position.x).toBeLessThanOrEqual(maxX + 0.05);
    expect(player.position.x).toBeGreaterThan(t.x - 1); // ilerledi/kenara dayandı
    dispose();
  });

  it('ışınlanma: hedef çevresinde collider yokken bile senkron hazırlanır, oyuncu düşmez', () => {
    const { world, physics, player, step, dispose } = setup();
    const place = TELEPORTS[1]; // Safranbolu: spawn'dan ~90 km (oyunda ~1,8 km) uzak
    const target = world.safePointFor(place.lat, place.lon);
    expect(target).not.toBeNull();
    const t = target as { x: number; y: number; z: number };
    world.prepare(t.x, t.z);
    player.teleport(t);
    physics.step();
    for (let i = 0; i < 180; i++) step(idle, 0);
    expect(player.grounded).toBe(true);
    expect(Math.abs(player.position.y - world.terrain.heightAt(t.x, t.z))).toBeLessThan(0.5);
    expect(provinceAt(region.provinces, t.x, t.z)?.name).toBe('Karabük');
    dispose();
  });
});

describe('üç il boyunca kesintisiz yürüyüş', () => {
  const walk = (path: Point[], maxSeconds: number) => walkPath(region, path, maxSeconds);

  function route(from: [number, number], to: [number, number]): Point[] {
    const path = routeBetween(heightSource, region, from, to);
    expect(path, 'heightmap üzerinde yürünebilir rota bulunmalı').not.toBeNull();
    return path as Point[];
  }

  it('Zonguldak → Amasra (Bartın): rota var ve oyuncu fizikle varır', () => {
    const path = route([TELEPORTS[0].lat, TELEPORTS[0].lon], [TELEPORTS[2].lat, TELEPORTS[2].lon]);
    const result = walk(path, 60 * 12);
    expect(
      result.reached,
      `varmalı (süre ${result.seconds.toFixed(0)} sn, takılma ${result.stuck}, kalan ${result.remaining.toFixed(1)} m, son konum ${JSON.stringify(result.end)}, hedef ${JSON.stringify(result.goal)})`,
    ).toBe(true);
    expect(result.maxJump).toBeLessThan(3); // ışınlanma/respawn/düşme yok
    expect(result.provinces.has('Zonguldak')).toBe(true);
    expect(result.provinces.has('Bartın')).toBe(true);
  }, 240_000);

  it('Amasra (Bartın) → Safranbolu (Karabük): rota var ve oyuncu fizikle varır', () => {
    const path = route([TELEPORTS[2].lat, TELEPORTS[2].lon], [TELEPORTS[1].lat, TELEPORTS[1].lon]);
    const result = walk(path, 60 * 20);
    expect(
      result.reached,
      `varmalı (süre ${result.seconds.toFixed(0)} sn, takılma ${result.stuck}, kalan ${result.remaining.toFixed(1)} m, son konum ${JSON.stringify(result.end)}, hedef ${JSON.stringify(result.goal)})`,
    ).toBe(true);
    expect(result.maxJump).toBeLessThan(3);
    expect(result.provinces.has('Bartın')).toBe(true);
    expect(result.provinces.has('Karabük')).toBe(true);
  }, 360_000);
});
