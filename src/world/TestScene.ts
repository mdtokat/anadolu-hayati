import { Scene } from 'three';
import { PLAYER, TERRAIN_TEST } from '../config';
import { createHeightfieldDesc } from '../physics/heightfield';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { Vec3 } from '../player/movement';
import type { SkyPosition } from '../survival/astronomy';
import { Environment } from './Environment';
import type { GameWorld } from './GameWorld';
import { sampleGrid, type GridSpec, type HeightSource } from './HeightSource';
import { Obstacles } from './Obstacles';
import { createTerrainMesh } from './TerrainMesh';

/**
 * Faz 1 test arenası (`?world=test`): engebeli prosedürel arazi, rampalar ve hareket parkuru.
 * Mesh ve collider aynı yükseklik ızgarasından üretilir. Karakter kontrolünün regresyon testi için durur.
 */
export class TestScene implements GameWorld {
  readonly scene = new Scene();
  readonly spawn: Vec3;
  readonly maxSlopeDeg = PLAYER.maxSlopeDeg;

  private readonly groundMesh: ReturnType<typeof createTerrainMesh>;
  private readonly obstacles: Obstacles;
  private readonly environment: Environment;

  constructor(
    physics: PhysicsWorld,
    readonly terrain: HeightSource,
  ) {
    const grid: GridSpec = { size: TERRAIN_TEST.size, cellSize: TERRAIN_TEST.cellSize };
    const heights = sampleGrid(terrain, grid);

    this.environment = new Environment(this.scene);

    this.groundMesh = createTerrainMesh(heights, grid);
    this.scene.add(this.groundMesh);
    physics.addStaticCollider(createHeightfieldDesc(heights, grid));

    this.obstacles = new Obstacles(physics, terrain);
    this.scene.add(this.obstacles.mesh);

    const { x, z } = TERRAIN_TEST.spawn;
    this.spawn = { x, y: terrain.heightAt(x, z) + 0.05, z };
  }

  /** Test arenasında akış yok: her şey baştan yüklüdür. */
  update(focusX: number, focusZ: number): void {
    this.environment.follow(focusX, focusZ);
  }

  setSun(sun: SkyPosition): void {
    this.environment.setSun(sun);
  }

  prepare(): void {}

  /** Geometry ve materyalleri serbest bırakır (kaynak temizliği kuralı). */
  dispose(): void {
    this.obstacles.dispose();
    this.groundMesh.geometry.dispose();
    this.groundMesh.material.dispose();
    this.environment.dispose();
    this.scene.clear();
  }
}
