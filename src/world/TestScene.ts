import { AmbientLight, Color, DirectionalLight, Fog, Scene } from 'three';
import { SCENE, TERRAIN_TEST } from '../config';
import { createHeightfieldDesc } from '../physics/heightfield';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { sampleGrid, type GridSpec, type HeightSource } from './HeightSource';
import { createTerrainMesh } from './TerrainMesh';

/**
 * Faz 1 test ortamı: engebeli prosedürel arazi (mesh + Rapier collider), gökyüzü, sis ve ışık.
 * Mesh ve collider aynı yükseklik ızgarasından üretilir.
 */
export class TestScene {
  readonly scene = new Scene();

  private readonly terrain: ReturnType<typeof createTerrainMesh>;
  private readonly sun = new DirectionalLight(0xffffff, SCENE.sunIntensity);
  private readonly ambient = new AmbientLight(0xffffff, SCENE.ambientIntensity);

  constructor(physics: PhysicsWorld, source: HeightSource) {
    const grid: GridSpec = { size: TERRAIN_TEST.size, cellSize: TERRAIN_TEST.cellSize };
    const heights = sampleGrid(source, grid);

    const sky = new Color(SCENE.skyColor);
    this.scene.background = sky;
    this.scene.fog = new Fog(sky, SCENE.fogNear, SCENE.fogFar);

    this.terrain = createTerrainMesh(heights, grid);
    this.scene.add(this.terrain);
    physics.addStaticCollider(createHeightfieldDesc(heights, grid));

    this.sun.position.set(...SCENE.sunPosition);
    this.scene.add(this.sun, this.ambient);
  }

  /** Geometry ve materyalleri serbest bırakır (kaynak temizliği kuralı). */
  dispose(): void {
    this.terrain.geometry.dispose();
    this.terrain.material.dispose();
    this.scene.clear();
  }
}
