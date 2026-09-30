import { beforeAll, describe, expect, it } from 'vitest';
import { REGION_PLAYER, TELEPORTS } from '../src/config';
import type { MoveIntent } from '../src/core/inputMapping';
import type { RegionData } from '../src/data/region';
import { initPhysics, PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Player } from '../src/player/Player';
import { latLonToGame } from '../src/world/geo';
import { provinceAt } from '../src/world/provinces';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { RegionWorld } from '../src/world/RegionWorld';
import { findSafeSpawn } from '../src/world/spawn';
import { loadRealRegion } from './helpers/realRegion';
import { findWalkablePath, type Point } from './helpers/pathfinding';

const DT = 1 / 60;
const idle: MoveIntent = { forward: 0, strafe: 0, run: false, jump: false };

let region: RegionData;
let heightSource: RegionHeightSource;

beforeAll(async () => {
  await initPhysics();
  region = await loadRealRegion();
  heightSource = RegionHeightSource.fromRegion(region);
});

function setup() {
  const physics = new PhysicsWorld();
  const world = new RegionWorld(region, physics);
  const player = new Player(physics, world.spawn, { maxSlopeDeg: world.maxSlopeDeg });
  const step = (intent: MoveIntent, yaw: number) => {
    player.update(DT, intent, yaw);
    physics.step();
    world.update(player.position.x, player.position.z);
  };
  const dispose = () => {
    player.dispose();
    world.dispose();
    physics.dispose();
  };
  return { physics, world, player, step, dispose };
}

/** yaw: −Z (kuzey) = 0; ileri = (−sin yaw, −cos yaw). Hedefe bakan yaw. */
const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);

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
  /**
   * Oyuncuyu waypoint'ler boyunca fizik motoruyla yürütür. Dönen: ziyaret edilen iller, en büyük
   * konum sıçraması (ışınlanma/respawn tespiti), takılma sayısı ve hedefe varış.
   */
  function walk(path: Point[], maxSeconds: number) {
    const ctx = setup();
    const { world, player, physics, step, dispose } = ctx;
    const first = path[0] as Point;
    const spawn = findSafeSpawn(world.source, first.x, first.z, world.maxSlopeDeg);
    if (!spawn) throw new Error('rota başlangıcı yürünebilir değil');
    world.prepare(spawn.x, spawn.z);
    player.teleport(spawn);
    physics.step();

    const provinces = new Set<string>();
    const goal = path[path.length - 1] as Point;
    const dist = (p: Point) => Math.hypot(p.x - player.position.x, p.z - player.position.z);
    const LOOKAHEAD = 8; // oyun m
    const ARRIVAL = 10; // varış toleransı (oyun m = 500 gerçek m); oyuncu son düğümün çevresinde salınır
    let index = 0;
    let maxJump = 0;
    let stuck = 0;
    let slowSteps = 0;
    let jumpFor = 0;
    let last = { ...player.position };
    let steps = 0;

    for (; steps < maxSeconds * 60; steps++) {
      // Pure pursuit: en yakın waypoint'e ilerle, sonra `LOOKAHEAD` kadar ötesini hedefle.
      // (Waypoint'in yakınından biraz uzaktan geçmek oyuncuyu daire çizdirmesin.)
      while (
        index < path.length - 1 &&
        dist(path[index + 1] as Point) <= dist(path[index] as Point)
      )
        index++;
      // Hedef her zaman en yakın waypoint'ten SONRAKİ olmalı (arkada kalanı hedeflemek salınım yaratır).
      let target = Math.min(index + 1, path.length - 1);
      while (target < path.length - 1 && dist(path[target] as Point) < LOOKAHEAD) target++;
      const ahead = path[target] as Point;
      const dx = ahead.x - player.position.x;
      const dz = ahead.z - player.position.z;

      // Takılırsa kısa süre zıpla
      const speed = Math.hypot(player.currentVelocity.x, player.currentVelocity.z);
      slowSteps = speed < 0.6 ? slowSteps + 1 : 0;
      if (slowSteps > 90) {
        jumpFor = 20;
        slowSteps = 0;
        stuck++;
      }
      const jump = jumpFor > 0;
      if (jump) jumpFor--;

      step({ forward: 1, strafe: 0, run: true, jump }, yawToward(dx, dz));

      const pos = player.position;
      maxJump = Math.max(maxJump, Math.hypot(pos.x - last.x, pos.y - last.y, pos.z - last.z));
      last = { ...pos };
      if (steps % 30 === 0) {
        const name = provinceAt(region.provinces, pos.x, pos.z)?.name;
        if (name) provinces.add(name);
      }
      if (dist(goal) < ARRIVAL) break;
    }

    const end = player.position;
    const reached = Math.hypot(end.x - goal.x, end.z - goal.z) < ARRIVAL + 2;
    dispose();
    return {
      provinces,
      maxJump,
      stuck,
      reached,
      seconds: steps / 60,
      remaining: Math.hypot(end.x - goal.x, end.z - goal.z),
      end: { x: end.x, y: end.y, z: end.z },
      goal,
    };
  }

  function route(from: [number, number], to: [number, number]): Point[] {
    const a = latLonToGame(from[0], from[1], region.meta.originUtm);
    const b = latLonToGame(to[0], to[1], region.meta.originUtm);
    const source = heightSource;
    const start = findSafeSpawn(source, a.x, a.z, REGION_PLAYER.maxSlopeDeg) as Point;
    const goal = findSafeSpawn(source, b.x, b.z, REGION_PLAYER.maxSlopeDeg) as Point;
    const path = findWalkablePath(source, start, goal, 50);
    expect(path, 'heightmap üzerinde yürünebilir rota bulunmalı').not.toBeNull();
    // ~16 m (oyun) arayla waypoint: her ikinci düğümü al
    return (path as Point[]).filter((_, i, all) => i % 2 === 0 || i === all.length - 1);
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
