import { Scene } from 'three';
import { CHUNK, REGION_PLAYER, REGION_SCENE, TELEPORTS, VERTICAL_SCALE } from '../config';
import type { RegionData } from '../data/region';
import { createBoundsWalls } from '../physics/bounds';
import type { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import type { Vec3 } from '../player/movement';
import type { SkyPosition } from '../survival/astronomy';
import { ChunkColliders } from './ChunkColliders';
import { ChunkManager } from './ChunkManager';
import { Environment } from './Environment';
import type { GameWorld, LocationInfo } from './GameWorld';
import { latLonToGame } from './geo';
import { ProvinceBorders } from './ProvinceBorders';
import { provinceAt } from './provinces';
import { RegionHeightSource } from './RegionHeightSource';
import { findSafeSpawn } from './spawn';
import { createTerrainMaterial } from './TerrainMaterial';
import { Water } from './Water';

/**
 * Gerçek bölge dünyası: chunk'lanmış LOD'lu arazi mesh'leri, yakın chunk'lar için Rapier
 * collider'ları, harita kenarı duvarları, gökyüzü/sis/ışık. (Deniz, il sınırları ve HUD bilgisi
 * sonraki adımlarda eklenir.)
 */
export class RegionWorld implements GameWorld {
  readonly scene = new Scene();
  readonly source: RegionHeightSource;
  readonly terrain: RegionHeightSource;
  readonly spawn: Vec3;
  readonly maxSlopeDeg = REGION_PLAYER.maxSlopeDeg;

  private readonly environment: Environment;
  private readonly material = createTerrainMaterial();
  private readonly chunks: ChunkManager;
  private readonly colliders: ChunkColliders;
  private readonly walls: RAPIER.Collider[];
  private readonly water: Water;
  private readonly borders: ProvinceBorders;

  constructor(
    readonly region: RegionData,
    private readonly physics: PhysicsWorld,
  ) {
    this.source = RegionHeightSource.fromRegion(region);
    this.terrain = this.source;
    this.environment = new Environment(this.scene, {
      near: REGION_SCENE.fogNear,
      far: REGION_SCENE.fogFar,
    });

    this.chunks = new ChunkManager(this.source, this.material);
    this.scene.add(this.chunks.group);
    this.colliders = new ChunkColliders(physics, this.source);
    this.walls = createBoundsWalls(physics, this.source.bounds);
    this.water = new Water(this.source.bounds);
    this.scene.add(this.water.mesh);
    this.borders = new ProvinceBorders(region.provinces, (x, z) => this.source.heightAt(x, z));
    this.scene.add(this.borders.object);

    // Başlangıç noktası: ilk ışınlanma hedefinin en yakın yürünebilir noktası.
    const start = this.safePointFor(TELEPORTS[0].lat, TELEPORTS[0].lon);
    if (!start) throw new Error('Başlangıç için yürünebilir nokta bulunamadı');
    this.spawn = start;

    // İlk kare boş kalmasın: başlangıç çevresini önceden kur.
    this.prepare(start.x, start.z);
    this.chunks.update(start.x, start.z, Infinity);
  }

  /** Enlem/boylam için en yakın yürünebilir nokta (ayak tabanı, oyun koordinatı). */
  safePointFor(lat: number, lon: number): Vec3 | null {
    const { x, z } = latLonToGame(lat, lon, this.region.meta.originUtm);
    return findSafeSpawn(this.source, x, z, this.maxSlopeDeg);
  }

  update(focusX: number, focusZ: number, timeSeconds: number): void {
    this.colliders.update(focusX, focusZ);
    this.chunks.update(focusX, focusZ);
    this.water.update(timeSeconds);
    this.environment.follow(focusX, focusZ);
  }

  setSun(sun: SkyPosition): void {
    this.environment.setSun(sun);
  }

  prepare(x: number, z: number): void {
    this.colliders.ensureAround(x, z);
  }

  toggleBorders(): void {
    this.borders.toggle();
  }

  locationInfo(x: number, z: number, feetY: number): LocationInfo {
    const province = provinceAt(this.region.provinces, x, z);
    return {
      province: province?.name ?? null,
      inRegion: province?.inRegion ?? false,
      // Deniz tabanı kurgusaldır (bkz. SEABED); rakım deniz seviyesinin altına inmez.
      elevation: Math.max(0, feetY * VERTICAL_SCALE),
    };
  }

  /** Test/HUD için: şu an yüklü collider ve mesh sayıları. */
  get stats(): { colliders: number; chunks: number; viewDistance: number } {
    return {
      colliders: this.colliders.count,
      chunks: this.chunks.chunkCount,
      viewDistance: CHUNK.viewDistance,
    };
  }

  dispose(): void {
    this.borders.dispose();
    this.water.dispose();
    this.chunks.dispose();
    this.colliders.dispose();
    for (const wall of this.walls) this.physics.removeCollider(wall);
    this.material.dispose();
    this.environment.dispose();
    this.scene.clear();
  }
}
