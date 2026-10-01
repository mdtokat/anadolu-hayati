import { Scene, type MeshStandardMaterial } from 'three';
import { CHUNK, FRESH_WATER, REGION_PLAYER, REGION_SCENE, PILOT, VERTICAL_SCALE } from '../config';
import { createRegionCreatureTerrain } from '../creatures/regionTerrain';
import type { CreatureTerrain } from '../creatures/kinds';
import type { RegionData } from '../data/region';
import { createBoundsWalls } from '../physics/bounds';
import type { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import type { Vec3 } from '../player/movement';
import type { SkyPosition } from '../survival/astronomy';
import { ChunkColliders } from './ChunkColliders';
import { ChunkManager } from './ChunkManager';
import { Environment } from './Environment';
import { respawnRandom, pickRespawnPoint } from '../survival/respawn';
import type { AmbientSample, GameWorld, LocationInfo, WorldQuality } from './GameWorld';
import { latLonToGame } from './geo';
import { ProvinceBorders } from './ProvinceBorders';
import { provinceAt } from './provinces';
import { RegionHeightSource } from './RegionHeightSource';
import { findSafeSpawn } from './spawn';
import { createTerrainMaterial } from './TerrainMaterial';
import { LandCoverMap } from './LandCoverMap';
import { PropLayer, type PropLayerStats } from './PropLayer';
import type { PropId, PropRef } from './propKinds';
import { Water } from './Water';
import { FreshWaterMesh } from './FreshWaterMesh';
import { FreshWaterIndex, type WaterHit } from './waterIndex';

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
  readonly creatureTerrain: CreatureTerrain;

  private readonly environment: Environment;
  private readonly material: MeshStandardMaterial;
  private readonly chunks: ChunkManager;
  private readonly colliders: ChunkColliders;
  private readonly walls: RAPIER.Collider[];
  private readonly water: Water;
  private readonly borders: ProvinceBorders;
  private readonly freshWater: FreshWaterIndex | null;
  private readonly freshWaterMesh: FreshWaterMesh | null;
  private readonly props: PropLayer | null;
  private readonly cover: LandCoverMap | null;

  constructor(
    readonly region: RegionData,
    private readonly physics: PhysicsWorld,
  ) {
    this.source = RegionHeightSource.fromRegion(region);
    this.terrain = this.source;
    this.material = createTerrainMaterial(
      region.landcover && {
        classes: region.landcover,
        width: this.source.width,
        height: this.source.height,
        cell: this.source.cell,
        origin: this.source.origin,
      },
    );
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

    this.freshWater = region.features
      ? new FreshWaterIndex(region.features.water, FRESH_WATER.indexCellSize)
      : null;
    this.freshWaterMesh = region.features
      ? new FreshWaterMesh(region.features.water, (x, z) => this.source.heightAt(x, z))
      : null;
    if (this.freshWaterMesh) this.scene.add(this.freshWaterMesh.object);

    // Nesneler (ağaç, kaya, çalı, yenebilir bitki): arazi örtüsü verisi yoksa yerleşim de yoktur.
    const cover = LandCoverMap.fromRegion(region);
    this.cover = cover;
    this.props = cover ? new PropLayer(this.source, cover, this.freshWater) : null;
    if (this.props) this.scene.add(this.props.group);

    // Canlılar (Faz 5): arazi örtüsü yoksa her yer `none` sayılır ve canlı doğmaz.
    this.creatureTerrain = createRegionCreatureTerrain({
      source: this.source,
      cover,
      freshWater: this.freshWater,
    });

    // Başlangıç noktası: pilot ilin başlangıç konumuna en yakın yürünebilir nokta.
    const start = this.safePointFor(PILOT.start.lat, PILOT.start.lon);
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
    this.props?.update(focusX, focusZ);
    this.water.update(timeSeconds);
    this.environment.follow(focusX, focusZ);
  }

  setSun(sun: SkyPosition): void {
    this.environment.setSun(sun);
  }

  freshWaterNear(x: number, z: number): WaterHit | null {
    return this.freshWater?.nearest(x, z) ?? null;
  }

  respawnPoint(deathIndex: number): Vec3 | null {
    return pickRespawnPoint(
      this.region.provinces,
      this.source,
      this.maxSlopeDeg,
      respawnRandom(deathIndex),
    );
  }

  prepare(x: number, z: number): void {
    this.colliders.ensureAround(x, z);
    this.props?.prepare(x, z);
  }

  /** (x, z)'ye `radius` içindeki yüklü nesneler (ağaç, kaya, bitki…), yakından uzağa. */
  propsNear(x: number, z: number, radius: number): PropRef[] {
    return this.props?.propsNear(x, z, radius) ?? [];
  }

  /** Nesneyi gizler/geri getirir (toplanan/kesilen nesne; durumu tutan 4.6'dır). */
  setPropDepleted(id: PropId, depleted: boolean): void {
    this.props?.setPropDepleted(id, depleted);
  }

  /** Dev göstergesi: nesne katmanı sayımları; nesne katmanı yoksa null. */
  get propStats(): PropLayerStats | null {
    return this.props?.stats ?? null;
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

  ambientAt(x: number, z: number): AmbientSample {
    return {
      cover: this.cover?.classAt(x, z) ?? 'none',
      seaDistance: this.source.distanceToSea(x, z),
    };
  }

  setQuality(quality: WorldQuality): void {
    this.chunks.setLodScale(quality.lodScale);
    this.props?.setDrawRadius(quality.propDrawRadius);
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
    this.props?.dispose();
    this.freshWaterMesh?.dispose();
    this.water.dispose();
    this.chunks.dispose();
    this.colliders.dispose();
    for (const wall of this.walls) this.physics.removeCollider(wall);
    this.material.dispose();
    this.environment.dispose();
    this.scene.clear();
  }
}
