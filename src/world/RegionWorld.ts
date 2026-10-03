import { BirdLayer } from './BirdLayer';
import { RainLayer } from './RainLayer';
import type { WeatherState } from '../survival/weather';
import { GlassLayer } from './GlassLayer';
import { scatterWaterOf } from '../data/waterThinning';
import { viewCenters } from './viewFocus';
import { Scene, type MeshStandardMaterial } from 'three';
import {
  CHUNK,
  FRESH_WATER,
  REGION_PLAYER,
  REGION_SCENE,
  PROVINCE_PLACES,
  BORDERS,
  PILOT,
  STREAMING,
  VERTICAL_SCALE,
} from '../config';
import { createRegionCreatureTerrain } from '../creatures/regionTerrain';
import type { CreatureTerrain } from '../creatures/kinds';
import type { RegionData } from '../data/region';
import { createBoundsWalls } from '../physics/bounds';
import type { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import type { Vec3 } from '../player/movement';
import type { SkyPosition } from '../survival/astronomy';
import { FrameBudget } from '../core/FrameBudget';
import type { PerfProbe } from '../core/perfStats';
import { ChunkColliders } from './ChunkColliders';
import { ChunkManager } from './ChunkManager';
import { prepareDenseWorld } from './worldPrep';
import { isStreamedWorld, type StreamedWorldData } from '../data/worldStreamLoader';
import type { TileBlob } from '../data/worldStream';
import { TileStreamer } from './TileStreamer';
import { TerrainTiles } from './terrainTiles';
import { restoreHoles, type TerrainHoles } from './roadTunnels';
import { chunkCol0, chunkGridFor, chunkRow0 } from './chunks';
import { Environment } from './Environment';
import { respawnRandom, pickRespawnPoint } from '../survival/respawn';
import {
  cityCentersOf,
  cityRespawnRandom,
  openYaw,
  pickCityStart,
  type CityStart,
} from '../survival/cityStart';
import type { Random } from '../utils/random';
import type { AmbientSample, GameWorld, LocationInfo, WorldQuality } from './GameWorld';
import { latLonToGame } from './geo';
import { provinceAt } from './provinces';
import { RegionHeightSource } from './RegionHeightSource';
import type { PlaceCenter } from './placeNotice';
import { findSafeSpawn } from './spawn';
import { createTerrainMaterial, terrainUniforms, type TerrainUniforms } from './TerrainMaterial';
import { buildRoadOverlay, buildTerrainOverlay, landBorderSegments } from './terrainOverlay';
import { LandCoverMap } from './LandCoverMap';
import { PropLayer, type PropLayerStats } from './PropLayer';
import type { PropId, PropRef } from './propKinds';
import { Water } from './Water';
import { FreshWaterMesh } from './FreshWaterMesh';
import { FreshWaterIndex, type WaterHit } from './waterIndex';
import { SettlementMap } from '../settlements/SettlementMap';
import type { PeopleWorld } from '../people/PeopleSystem';
import { SettlementLayer } from './SettlementLayer';
import { SettlementColliders } from './SettlementColliders';
import { StructureIndex } from './roadStructureGeometry';
import { RoadStructureLayer } from './RoadStructureLayer';
import { RoadStructureColliders } from './RoadStructureColliders';
import { PropColliders } from './PropColliders';
import { StructureWalkSolids } from './roadStructureWalk';

/**
 * Gerçek bölge dünyası: chunk'lanmış LOD'lu arazi mesh'leri, yakın chunk'lar için Rapier
 * collider'ları, harita kenarı duvarları, gökyüzü/sis/ışık. (Deniz, il sınırları ve HUD bilgisi
 * sonraki adımlarda eklenir.)
 */
export class RegionWorld implements GameWorld {
  readonly scene = new Scene();
  readonly source: RegionHeightSource;
  readonly terrain: RegionHeightSource;
  /** Başlangıç noktası (akış kipinde genel bakıştan bulunur; `preload` sonrası `settlePoint` ile rafine edilebilir). */
  spawn: Vec3;
  private placeCentersCache: readonly PlaceCenter[] | null = null;
  /** Faz 11 (E): ek nesne engelleyiciler (eşkıya kampları); nesne chunk'ı kurulurken sorulur. */
  private readonly propBlockers: Array<(x: number, z: number, radius: number) => boolean> = [];
  /** Faz 11 (F): drone görüş odağı (yoksa oyuncu). */
  private viewFocus: { x: number; z: number } | null = null;
  readonly maxSlopeDeg = REGION_PLAYER.maxSlopeDeg;
  readonly creatureTerrain: CreatureTerrain;

  private readonly environment: Environment;
  private readonly material: MeshStandardMaterial;
  /** Karo akışı (Faz 12): akışlı dünyada karo yaşam döngüsü ve karo başına kaplama; yoğun kipte null. */
  private readonly streamer: TileStreamer<TileBlob> | null = null;
  private readonly tiles: TerrainTiles | null = null;
  private readonly chunks: ChunkManager;
  private readonly colliders: ChunkColliders;
  private readonly walls: RAPIER.Collider[];
  private readonly water: Water;
  private readonly terrainUniforms: TerrainUniforms | null;
  private readonly freshWater: FreshWaterIndex | null;
  private readonly freshWaterMesh: FreshWaterMesh | null;
  private readonly props: PropLayer | null;
  private readonly cover: LandCoverMap | null;
  /** Yerleşimler (Faz 10): veri yoksa null. */
  readonly settlementMap: SettlementMap | null;
  private readonly settlementLayer: SettlementLayer | null;
  /** Pencere camları (kırılabilir; yerleşim verisi yoksa null). */
  readonly glass: GlassLayer | null;
  /** Gökyüzü kuşları (yalnız görsel). */
  private readonly birds: BirdLayer;
  private daylight = 1;
  /** Yağmur damlaları. */
  private readonly rain = new RainLayer();
  /** Performans göstergesinin bölüm ölçümü (yoksa ölçülmez). */
  private probe: PerfProbe | null = null;
  /** Akışlı işlerin kare zaman bütçesi (performans göstergesi de okur). */
  readonly budget = new FrameBudget();
  /**
   * Kare bütçesi (ms; varsayılan `STREAMING.frameBudgetMs`). Fizikli yürüyüş testleri `Infinity` verir: sonuç duvar
   * saatine (makine hızına) bağlı olmasın.
   */
  frameBudgetMs: number = STREAMING.frameBudgetMs;
  private readonly settlementColliders: SettlementColliders | null;
  /** Ağaç, kaya ve çalı collider'ları (nesne katmanı yoksa null). */
  private readonly propColliders: PropColliders | null;
  /** Köprü/viyadük/tünel kutularının yürüyen gövdeler için engel sorgusu (yol yapısı yoksa null). */
  private readonly roadWalk: StructureWalkSolids | null;
  /** Köprü/viyadük/tünel çizimi ve collider'ları (yol planından); yerleşim verisi yoksa null. */
  private readonly structureLayer: RoadStructureLayer | null;
  private readonly structureColliders: RoadStructureColliders | null;
  /** Diğer insanların arazi/yerleşim sorguları (Faz 10); yerleşim verisi yoksa null. */
  readonly peopleWorld: PeopleWorld | null;

  constructor(
    readonly region: RegionData | StreamedWorldData,
    private readonly physics: PhysicsWorld,
  ) {
    const streamed = isStreamedWorld(region) ? region : null;
    this.freshWater = region.features
      ? new FreshWaterIndex(region.features.water, FRESH_WATER.indexCellSize)
      : null;

    // Yerleşimler, yollar (Faz 10): düzen açılışta bir kez hesaplanır (saf; veri hattının bake adımıyla aynı işlev) ya
    // da (akış kipi) veri hattında hesaplanmış hâliyle kurulur. Arazi kaplamasından önce: yollar araziye boyanır.
    let holes: TerrainHoles | null;
    if (streamed) {
      this.source = RegionHeightSource.streamed(streamed.meta, streamed.overview.heights);
      this.settlementMap = streamed.settlements
        ? new SettlementMap(streamed.settlements.map)
        : null;
      holes = streamed.settlements
        ? restoreHoles(streamed.meta.gridWidth, streamed.settlements.holes)
        : null;
    } else {
      const prepared = prepareDenseWorld(region as RegionData, this.freshWater);
      this.source = prepared.source;
      this.settlementMap = prepared.settlementMap;
      holes = prepared.holes;
    }
    this.terrain = this.source;
    const settlements = this.settlementMap;

    // Arazi: örtü renkleri + kaplama (yollar, akarsular, kıyı bantları, il sınırları shader'da boyanır).
    const borders = landBorderSegments(region.provinces);
    if (streamed) {
      // Akış: LOD3 ve yüklü olmayan karolar tek genel bakış materyalini, yüklü karolar kendi dokularını kullanır.
      const live = {
        uTime: { value: 0 },
        uBorderOn: { value: BORDERS.visibleByDefault ? 1 : 0 },
      };
      this.tiles = new TerrainTiles(
        streamed.meta,
        { roads: settlements?.paintLines ?? [], water: region.features?.water ?? null, borders },
        streamed.overview.cover,
        live,
      );
      this.material = this.tiles.overviewMaterial;
    } else {
      const dense = region as RegionData;
      const grid = {
        width: this.source.width,
        height: this.source.height,
        cell: this.source.cell,
        origin: this.source.origin,
      };
      const overlay = buildTerrainOverlay(grid, {
        roads: settlements?.paintLines ?? [],
        water: region.features?.water ?? null,
        borders,
      });
      // Anayol (orta şeritli) ve kent sokağı (parke) ayrı dokuda: dört yol tipi ayrı boyanır.
      const roadOverlay = settlements ? buildRoadOverlay(grid, settlements.paintLines) : null;
      this.material = createTerrainMaterial(
        dense.landcover && { classes: dense.landcover, ...grid },
        { data: overlay.data, ...(roadOverlay ? { roads: roadOverlay.data } : {}), ...grid },
      );
    }
    this.terrainUniforms = terrainUniforms(this.material);
    this.environment = new Environment(this.scene, {
      near: REGION_SCENE.fogNear,
      far: REGION_SCENE.fogFar,
    });

    // Tünel ağızlarında arazi delinir (mesh + çarpışma); tünelin kendisi yol yapılarıyla çizilir.
    const chunkGrid = chunkGridFor(this.source);
    const coarsest = CHUNK.lodStrides.length - 1;
    this.chunks = new ChunkManager(this.source, this.material, {
      holes,
      ...(streamed
        ? {
            resident: (cx: number, cy: number) => this.chunkReady(chunkGrid, cx, cy),
            materialFor: (cx: number, cy: number, lod: number) => {
              if (lod >= coarsest) return this.material;
              const { tx, ty } = this.source.tileOfSample(
                chunkCol0(chunkGrid, cx),
                chunkRow0(chunkGrid, cy),
              );
              return this.tiles?.materialOf(tx, ty) ?? this.material;
            },
          }
        : {}),
    });
    this.scene.add(this.chunks.group);
    this.colliders = new ChunkColliders(physics, this.source, undefined, holes);
    this.walls = createBoundsWalls(physics, this.source.bounds);
    this.water = new Water(this.source.bounds);
    this.scene.add(this.water.mesh);

    // Göl/gölet/baraj yüzeyleri (akarsular araziye boyanır).
    this.freshWaterMesh = region.features
      ? new FreshWaterMesh(
          region.features.water,
          (x, z) => this.source.heightAt(x, z),
          streamed?.overview.lakeLevels,
        )
      : null;
    if (this.freshWaterMesh) this.scene.add(this.freshWaterMesh.object);

    this.settlementLayer = settlements ? new SettlementLayer(settlements) : null;
    if (this.settlementLayer) this.scene.add(this.settlementLayer.group);
    this.glass = settlements ? new GlassLayer(settlements) : null;
    if (this.glass) this.scene.add(this.glass.group);
    this.birds = new BirdLayer(
      (x, z) => this.source.heightAt(x, z),
      (x, z) => this.source.elevationAt(x, z),
    );
    this.scene.add(this.birds.mesh);
    this.scene.add(this.rain.object);
    this.settlementColliders = settlements ? new SettlementColliders(physics, settlements) : null;
    const structures =
      settlements && settlements.plan.spans.length > 0
        ? new StructureIndex(settlements.plan)
        : null;
    this.structureLayer = structures ? new RoadStructureLayer(structures) : null;
    if (this.structureLayer) this.scene.add(this.structureLayer.group);
    this.structureColliders = structures ? new RoadStructureColliders(physics, structures) : null;
    this.roadWalk = structures ? new StructureWalkSolids(structures) : null;
    this.peopleWorld = settlements
      ? {
          heightAt: (x, z) => this.source.heightAt(x, z),
          elevationAt: (x, z) => this.source.elevationAt(x, z),
          slopeDegAt: (x, z) => this.source.slopeDegAt(x, z),
          roadNear: (x, z, r) => settlements.roads.nearest(x, z, r),
          settlementRankAt: (x, z) => settlements.settlementAt(x, z)?.data.rank ?? null,
          blocked: (x, z) => settlements.buildingAt(x, z, 0.4) !== null,
        }
      : null;

    // Nesneler (ağaç, kaya, çalı, yenebilir bitki): arazi örtüsü verisi yoksa yerleşim de yoktur.
    // Yapıların ve yolların üstündeki nesneler gizlenir (kimlikler değişmez).
    const cover = streamed
      ? LandCoverMap.streamed(streamed.meta, streamed.overview.cover)
      : LandCoverMap.fromRegion(region as RegionData);
    this.cover = cover;
    this.props = cover
      ? new PropLayer(
          this.source,
          cover,
          region.features?.minorStreams?.length
            ? new FreshWaterIndex(scatterWaterOf(region.features), FRESH_WATER.indexCellSize)
            : this.freshWater,
          (x, z, r) =>
            (settlements?.blocksProp(x, z, r) ?? false) ||
            this.propBlockers.some((blocks) => blocks(x, z, r)),
          streamed ? (cx, cy) => this.chunkReady(chunkGrid, cx, cy) : null,
        )
      : null;
    if (this.props) this.scene.add(this.props.group);
    this.propColliders = this.props ? new PropColliders(physics, this.props) : null;

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

    // Karo akışı: karolar, odağa yaklaştıkça `update`te yüklenir (`preload` ilk karoları bekler).
    if (streamed) {
      const cell = this.source.cell;
      const origin = this.source.origin;
      const tiles = streamed.manifest.tiles.flatMap(({ tx, ty }) => {
        const core = this.source.tileCore(tx, ty);
        if (!core) return [];
        return [
          {
            tx,
            ty,
            rect: {
              minX: origin.x + core.col0 * cell,
              maxX: origin.x + (core.col0 + core.cols - 1) * cell,
              minZ: origin.z + core.row0 * cell,
              maxZ: origin.z + (core.row0 + core.rows - 1) * cell,
            },
          },
        ];
      });
      this.streamer = new TileStreamer<TileBlob>({
        tiles,
        fetch: (tx, ty) => streamed.fetchTile(tx, ty),
        activate: (tx, ty, blob) => this.activateTile(tx, ty, blob),
        release: (tx, ty) => this.releaseTile(tx, ty),
        onError: (tx, ty, error) => console.error(`Karo (${tx}, ${ty}) yüklenemedi`, error),
      });
      // İlk kare boş kalmasın: tüm arazi genel bakıştan kurulur (karolar sonradan inceleşir).
      this.chunks.update(start.x, start.z, Infinity);
      return;
    }

    // İlk kare boş kalmasın: başlangıç çevresini önceden kur.
    this.prepare(start.x, start.z);
    this.chunks.update(start.x, start.z, Infinity);
  }

  // --- Karo akışı (Faz 12) ---------------------------------------------------------------------------------

  /** Chunk'ın karosu tam çözünürlükte hazır mı (akışsız dünyada her zaman)? */
  private chunkReady(grid: ReturnType<typeof chunkGridFor>, cx: number, cy: number): boolean {
    if (!this.streamer) return true;
    const { tx, ty } = this.source.tileOfSample(chunkCol0(grid, cx), chunkRow0(grid, cy));
    return this.streamer.isTileReady(tx, ty);
  }

  /** Karo etkinleştirme işleri (dilimli): bitene kadar karo başına tek iş nesnesi. */
  private readonly tileJobs = new Map<
    string,
    { phase: number; heights: Generator<void, void> | null; raster: Generator<void, void> | null }
  >();

  /**
   * Karo etkinleştirmesinden bir dilim: yükseklik/deniz tabanı/yumuşatma (≈ 1 ms'lik dilimler), sonra yama + örtü,
   * kaplama rasteri, materyal. Tamamlanınca true.
   */
  private activateTile(tx: number, ty: number, blob: TileBlob): boolean {
    const key = `${tx},${ty}`;
    let job = this.tileJobs.get(key);
    if (!job) {
      job = { phase: 0, heights: null, raster: null };
      this.tileJobs.set(key, job);
    }
    switch (job.phase) {
      case 0: {
        job.heights ??= this.source.loadTileSteps(
          tx,
          ty,
          { ...blob.window, raw: blob.raw },
          undefined,
          { indices: blob.patchIndices, values: blob.patchValues },
        );
        if (job.heights.next().done) job.phase = 1;
        return false;
      }
      case 1:
        (this.cover as LandCoverMap).setTile(tx, ty, blob.window, blob.cover);
        job.phase = 2;
        return false;
      case 2: {
        if (!this.tiles) {
          job.phase = 3;
          return false;
        }
        job.raster ??= this.tiles.rasterizeSteps(blob);
        if (job.raster.next().done) job.phase = 3;
        return false;
      }
      default:
        this.tiles?.createMaterial(blob);
        this.props?.invalidate();
        this.tileJobs.delete(key);
        return true;
    }
  }

  private releaseTile(tx: number, ty: number): void {
    this.tileJobs.delete(`${tx},${ty}`);
    this.tiles?.release(tx, ty);
    this.cover?.removeTile(tx, ty);
    this.source.unloadTile(tx, ty);
    this.props?.invalidate();
  }

  /** (x, z) çevresindeki zemin tam çözünürlükte yüklü mü? Akışsız dünyada her zaman true. */
  isReadyAt(x: number, z: number): boolean {
    return this.streamer?.isReady(x, z, STREAMING.tiles.readyRadius) ?? true;
  }

  /**
   * (x, z) çevresindeki karoları indirir ve etkinleştirir, sonra çevresine collider ve nesneleri kurar (ışınlanma,
   * doğma, kayıt yükleme, ilk açılış). Akışsız dünyada hemen biter.
   */
  async preload(x: number, z: number, timeoutMs = 90_000): Promise<void> {
    const streamer = this.streamer;
    if (!streamer) {
      this.prepare(x, z);
      return;
    }
    const started = performance.now();
    while (!streamer.isReady(x, z, STREAMING.tiles.readyRadius)) {
      streamer.update([{ x, z }], null);
      if (streamer.isReady(x, z, STREAMING.tiles.readyRadius)) break;
      if (performance.now() - started > timeoutMs)
        throw new Error('Karo yüklemesi zaman aşımına uğradı');
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    this.prepare(x, z);
    this.chunks.update(x, z, Infinity);
  }

  /** Yaklaşık noktayı (genel bakışa göre bulunmuş) gerçek zemine göre yeniden oturtur. */
  settlePoint(point: Vec3): Vec3 {
    return this.safePointAt(point.x, point.z) ?? point;
  }

  /** Karo akışı sayıları (performans göstergesi, testler). */
  get tileStats(): { streaming: boolean; ready: number; resident: number; materials: number } {
    return {
      streaming: this.streamer !== null,
      ready: this.streamer?.readyCount ?? 0,
      resident: this.streamer?.residentCount ?? 0,
      materials: this.tiles?.materialCount ?? 0,
    };
  }

  /** Enlem/boylam için en yakın yürünebilir nokta (ayak tabanı, oyun koordinatı). */
  safePointFor(lat: number, lon: number): Vec3 | null {
    const { x, z } = latLonToGame(lat, lon, this.region.meta.originUtm);
    return this.safePointAt(x, z);
  }

  /** Oyun koordinatı (x, z) için en yakın yürünebilir, yapı dışı nokta (ayak tabanı); yoksa null. */
  safePointAt(x: number, z: number): Vec3 | null {
    return this.clearOfBuildings(findSafeSpawn(this.source, x, z, this.maxSlopeDeg));
  }

  /**
   * Rastgele bir il/ilçe merkezinin yakınında başlangıç (yeni oyun, yeniden doğma). Yerleşim verisi yoksa ya da
   * uygun nokta bulunamazsa null.
   */
  cityStart(random: Random): CityStart | null {
    const map = this.settlementMap;
    if (!map) return null;
    const start = pickCityStart(cityCentersOf(map.settlements), random, (x, z) =>
      this.safePointAt(x, z),
    );
    if (!start) return null;
    // Duvara bakarak başlamasın: önü en açık yöne dön.
    return {
      ...start,
      yaw: openYaw(start.point, start.yaw, (x, z) => map.buildingAt(x, z, 0.5) !== null),
    };
  }

  /**
   * Nokta bir yapının (Faz 10) içine düşüyorsa çevresinde (sarmal arama) yapı dışında, yürünebilir en yakın noktayı
   * döner; zaten dışındaysa aynısını. Bulunamazsa null.
   */
  private clearOfBuildings(point: Vec3 | null): Vec3 | null {
    const map = this.settlementMap;
    if (!point || !map || map.buildingAt(point.x, point.z, 1) === null) return point;
    for (let r = 3; r <= 60; r += 3) {
      const steps = Math.max(8, Math.round((2 * Math.PI * r) / 3));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const x = point.x + Math.cos(a) * r;
        const z = point.z + Math.sin(a) * r;
        if (map.buildingAt(x, z, 1) !== null) continue;
        const safe = findSafeSpawn(this.source, x, z, this.maxSlopeDeg);
        if (safe && map.buildingAt(safe.x, safe.z, 1) === null) return safe;
      }
    }
    return null;
  }

  update(focusX: number, focusZ: number, timeSeconds: number): void {
    // Faz 11 (F): collider'lar oyuncuda, çizim görüş odağında (drone görüşü; yoksa oyuncu).
    const { visual } = viewCenters({ x: focusX, z: focusZ }, this.viewFocus);
    // Akışlı işler ortak kare bütçesini paylaşır (öncelik sırasıyla): collider > mesh > nesne > katman yenilemeleri.
    const budget = this.budget;
    const p = this.probe;
    budget.begin(this.frameBudgetMs);
    p?.section('karo akışı');
    this.streamer?.update([{ x: focusX, z: focusZ }, visual], budget);
    p?.section('arazi collider');
    this.colliders.update(focusX, focusZ, budget);
    p?.section('yapı collider');
    this.settlementColliders?.update(focusX, focusZ);
    this.structureColliders?.update(focusX, focusZ);
    p?.section('arazi mesh');
    this.chunks.update(visual.x, visual.z, undefined, budget);
    p?.section('nesneler');
    this.props?.update(visual.x, visual.z, undefined, budget);
    this.propColliders?.update(focusX, focusZ);
    p?.section('yerleşim');
    this.settlementLayer?.update(visual.x, visual.z, budget);
    this.glass?.update(visual.x, visual.z, timeSeconds, budget);
    p?.section('çevre');
    this.birds.update(visual.x, visual.z, timeSeconds, this.daylight);
    this.rain.update(visual.x, this.source.heightAt(visual.x, visual.z), visual.z, timeSeconds);
    this.environment.setTime(timeSeconds);
    p?.section('köprü/tünel');
    this.structureLayer?.update(visual.x, visual.z, budget);
    p?.section('çevre');
    this.water.update(timeSeconds);
    if (this.terrainUniforms) this.terrainUniforms.uTime.value = timeSeconds;
    this.environment.follow(visual.x, visual.z);
  }

  setWeather(weather: WeatherState, indoor: boolean): void {
    this.environment.setWeather(weather);
    this.rain.set(weather.rain, indoor);
  }

  setSun(sun: SkyPosition): void {
    this.environment.setSun(sun);
    this.daylight = Math.min(Math.max((sun.altitudeDeg + 4) / 14, 0), 1);
  }

  freshWaterNear(x: number, z: number): WaterHit | null {
    const hit = this.freshWater?.nearest(x, z) ?? null;
    if (hit) return hit;
    // Yerleşim çeşmeleri (Faz 10): musluğa erişim mesafesinde içilir, su kabı doldurulur.
    const fountain = this.settlementMap?.fountainNear(x, z, FRESH_WATER.fountainReach) ?? null;
    return fountain ? { kind: 'fountain', ...fountain } : null;
  }

  /**
   * (x, z)'ye `radius` içindeki en yakın tatlı su ya da çeşme (yol tarifi için; Faz 10). Yoksa null.
   */
  nearestWater(
    x: number,
    z: number,
    radius: number,
  ): { x: number; z: number; fountain: boolean } | null {
    const hit = this.freshWater?.nearest(x, z, radius) ?? null;
    let best = hit ? { x: hit.x, z: hit.z, fountain: false, d: hit.distance } : null;
    for (const b of this.settlementMap?.buildingsNear(x, z, radius) ?? []) {
      if (b.kind !== 'fountain') continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (best === null || d < best.d) best = { x: b.x, z: b.z, fountain: true, d };
    }
    return best ? { x: best.x, z: best.z, fountain: best.fountain } : null;
  }

  respawnPoint(deathIndex: number): Vec3 | null {
    const city = this.cityStart(cityRespawnRandom(deathIndex));
    if (city) return city.point;
    return this.clearOfBuildings(
      pickRespawnPoint(
        this.region.provinces,
        this.source,
        this.maxSlopeDeg,
        respawnRandom(deathIndex),
      ),
    );
  }

  setPerfProbe(probe: PerfProbe | null): void {
    this.probe = probe;
  }

  walkBlocked(x0: number, z0: number, x1: number, z1: number, radius: number): boolean {
    if (this.props?.solidBlocks(x0, z0, x1, z1, radius)) return true;
    return this.roadWalk?.blocks(x0, z0, x1, z1, radius, this.source.heightAt(x1, z1)) ?? false;
  }

  walkContains(x: number, z: number, radius: number): boolean {
    return this.props?.solidContains(x, z, radius) ?? false;
  }

  prepare(x: number, z: number): void {
    this.colliders.ensureAround(x, z);
    this.settlementColliders?.update(x, z, true);
    this.structureColliders?.update(x, z, true);
    this.props?.prepare(x, z);
    this.propColliders?.update(x, z, true);
    this.settlementLayer?.update(x, z);
    this.structureLayer?.update(x, z);
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

  /** İl sınırı şeridini (arazi kaplaması) açar/kapatır. */
  toggleBorders(): void {
    const on = this.terrainUniforms?.uBorderOn;
    if (on) on.value = on.value > 0 ? 0 : 1;
  }

  /**
   * Tüm hedef illerin yer merkezleri: `PROVINCE_PLACES` (pilot il önce), en yakın yürünebilir noktaya
   * oturtulmuş (bulunamazsa ham konum).
   */
  placeCenters(): readonly PlaceCenter[] {
    this.placeCentersCache ??= Object.values(PROVINCE_PLACES)
      .flat()
      .map((place) => {
        const point = this.safePointFor(place.lat, place.lon);
        const raw = latLonToGame(place.lat, place.lon, this.region.meta.originUtm);
        return { name: place.name, x: point?.x ?? raw.x, z: point?.z ?? raw.z };
      });
    return this.placeCentersCache;
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

  /**
   * Faz 11 (E): ağaç/kaya/çalı gizleyen ek alan (eşkıya kampları). Nesneler chunk kurulurken sorulduğundan ilk karelerden
   * önce (Game kurulumunda) eklenmelidir; kimlikler değişmez.
   */
  addPropBlocker(blocks: (x: number, z: number, radius: number) => boolean): void {
    this.propBlockers.push(blocks);
  }

  /**
   * Görüş odağı (Faz 11 sözleşmesi; F): verilirse arazi LOD'u, nesne/yerleşim/yapı çizimi ve gökyüzü bu noktayı izler
   * (`update`); collider'lar oyuncuda kalır.
   */
  setViewFocus(p: { x: number; z: number } | null): void {
    this.viewFocus = p ? { x: p.x, z: p.z } : null;
  }

  /** Son verilen görüş odağı (yoksa null: oyuncu). */
  get currentViewFocus(): { x: number; z: number } | null {
    return this.viewFocus;
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
    this.streamer?.dispose();
    this.tiles?.dispose();
    this.propColliders?.dispose();
    this.structureColliders?.dispose();
    this.structureLayer?.dispose();
    this.settlementColliders?.dispose();
    this.settlementLayer?.dispose();
    this.glass?.dispose();
    this.birds.dispose();
    this.rain.dispose();
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
