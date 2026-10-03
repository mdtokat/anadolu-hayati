import type { MoveIntent } from '../../src/core/inputMapping';
import type { RegionData } from '../../src/data/region';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { Player } from '../../src/player/Player';
import { REGION_PLAYER } from '../../src/config';
import { latLonToGame } from '../../src/world/geo';
import { provinceAt } from '../../src/world/provinces';
import type { RegionHeightSource } from '../../src/world/RegionHeightSource';
import { RegionWorld } from '../../src/world/RegionWorld';
import { findSafeSpawn } from '../../src/world/spawn';
import { findWalkablePath, type Point } from './pathfinding';

/**
 * Gerçek dünyada fizikli yürüyüş yardımcıları (testler; `initPhysics()` önceden çağrılmış olmalı):
 * `RegionWorld` + Rapier oyuncusu kurar, A* rotasını saf-takip ile koşarak izler.
 */
export const DT = 1 / 60;

export function setupWorld(region: RegionData, withSettlements = false) {
  const physics = new PhysicsWorld();
  // Yürüyüş testleri arazi sürekliliğini sınar; A* rotası yapıları bilmez (kasaba merkezinde duvara takılır).
  // Yerleşimler (Faz 10) bu yüzden varsayılan olarak kapalıdır.
  const world = new RegionWorld(
    withSettlements ? region : { ...region, settlements: null },
    physics,
  );
  const player = new Player(physics, world.spawn, { maxSlopeDeg: world.maxSlopeDeg });
  const step = (intent: MoveIntent, yaw: number) => {
    player.update(DT, intent, yaw);
    physics.step();
    world.update(player.position.x, player.position.z, 0);
  };
  const dispose = () => {
    player.dispose();
    world.dispose();
    physics.dispose();
  };
  return { physics, world, player, step, dispose };
}

/** yaw: −Z (kuzey) = 0; ileri = (−sin yaw, −cos yaw). Hedefe bakan yaw. */
export const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);

export interface WalkResult {
  /** Yürüyüşte görülen iller. */
  provinces: Set<string>;
  /** En büyük tek-adım konum sıçraması (ışınlanma/düşme tespiti). */
  maxJump: number;
  /** Takılıp zıplama sayısı. */
  stuck: number;
  reached: boolean;
  seconds: number;
  remaining: number;
  end: { x: number; y: number; z: number };
  goal: Point;
}

/**
 * Oyuncuyu waypoint'ler boyunca fizik motoruyla yürütür. Dönen: ziyaret edilen iller, en büyük
 * konum sıçraması (ışınlanma/respawn tespiti), takılma sayısı ve hedefe varış.
 */
export function walkPath(region: RegionData, path: Point[], maxSeconds: number): WalkResult {
  const ctx = setupWorld(region);
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
  let steerSign = 1;
  let last = { ...player.position };
  let steps = 0;

  for (; steps < maxSeconds * 60; steps++) {
    // Pure pursuit: en yakın waypoint'e ilerle, sonra `LOOKAHEAD` kadar ötesini hedefle.
    // (Waypoint'in yakınından biraz uzaktan geçmek oyuncuyu daire çizdirmesin.)
    while (index < path.length - 1 && dist(path[index + 1] as Point) <= dist(path[index] as Point))
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
    // Ağaç/kaya/çalı katıdır (A* bilmez): oyuncu gibi, önü kapalıysa yönü yana kırar (önceki tarafı tercih eder).
    let heading = yawToward(dx, dz);
    if (world.walkBlocked) {
      const px = player.position.x;
      const pz = player.position.z;
      for (const offset of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4]) {
        const o = offset * steerSign;
        const yaw = heading + o;
        const reach = 3;
        if (
          !world.walkBlocked(px, pz, px - Math.sin(yaw) * reach, pz - Math.cos(yaw) * reach, 0.55)
        ) {
          if (offset !== 0) steerSign = Math.sign(o) || steerSign;
          heading = yaw;
          break;
        }
      }
    }
    if (slowSteps > 240) {
      jumpFor = 20;
      slowSteps = 0;
      stuck++;
    }
    const jump = jumpFor > 0;
    if (jump) jumpFor--;
    step({ forward: 1, strafe: 0, run: true, jump }, heading);

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

/**
 * İki enlem/boylam arasında heightmap üzerinde yürünebilir rota; ~16 m arayla waypoint, rota yoksa null.
 * A* eğim sınırı varsayılan 50°: fizikle izlenecek rota oyuncu sınırının (60°) biraz altında kalsın (düğümler
 * 8 m arayla, arada daha dik yer olabilir). Var olup olmadığını sınamak için `REGION_PLAYER.maxSlopeDeg` verilir.
 */
export function routeBetween(
  source: RegionHeightSource,
  region: RegionData,
  from: readonly [number, number],
  to: readonly [number, number],
  maxSlopeDeg = 50,
): Point[] | null {
  const a = latLonToGame(from[0], from[1], region.meta.originUtm);
  const b = latLonToGame(to[0], to[1], region.meta.originUtm);
  const start = findSafeSpawn(source, a.x, a.z, REGION_PLAYER.maxSlopeDeg);
  const goal = findSafeSpawn(source, b.x, b.z, REGION_PLAYER.maxSlopeDeg);
  if (!start || !goal) return null;
  const path = findWalkablePath(source, start, goal, maxSlopeDeg);
  // her ikinci düğümü al
  return path && path.filter((_, i, all) => i % 2 === 0 || i === all.length - 1);
}
