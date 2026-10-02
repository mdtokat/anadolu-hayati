import { ROADS, SETTLEMENT_LAYOUT, TERRAIN_OVERLAY } from '../config';
import type { LandmarkData, RoadData, SettlementData, SettlementsData } from '../data/settlements';
import { BUILDING_SHAPES, MAX_BURY, isMosque } from './kinds';
import { FootprintRegistry } from './footprints';
import {
  STAIR_MIN_RISE,
  STAIR_SLOPE,
  footprintRadius,
  stairWidth,
  layoutSettlement,
  settlementCenter,
  type Building,
  type LayoutTerrain,
} from './layout';
import { RoadIndex } from './roadIndex';
import { groundRuns, planRoadProfiles, surfaceRuns, type RoadPlan } from './roadProfile';
import {
  buildRoadNetwork,
  terrainRouteField,
  type NetworkReport,
  type TownDisc,
} from './roadNetwork';
import { findRoute } from './routeFinder';
import { connectTownRoads } from './townNetwork';
import {
  StreamGrid,
  separateRoadsFromWater,
  smoothRoads,
  uncrossStreams,
  type NearestWater,
} from './roadRouting';

/** Bir yerleşimin oyundaki hâli: veri + düzen. */
export interface SettlementView {
  data: SettlementData;
  buildings: Building[];
  /** Ayak izi yarıçapı (oyun m; büyütülmüş). */
  radius: number;
}

/**
 * Kapı önü taş merdiveni: kat zemini kapı önündeki araziden yüksekse (yamaç, cami terası) kapıya çıkılır.
 * Yerel kural: merdiven kapıdan dışarı (+z) iner.
 */
export interface Stair {
  building: number;
  /** Merdivenin kapı kenarındaki ortası (dünya X/Z). */
  x: number;
  z: number;
  yaw: number;
  /** Alt (zemin) yüksekliği ve yükselti (oyun m). */
  y0: number;
  rise: number;
  run: number;
  width: number;
}

/** Yolların sınır kutusu (dünya kenarı verilmediğinde). */
function boundsOf(roads: readonly RoadData[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const road of roads) {
    for (let i = 0; i + 1 < road.xz.length; i += 2) {
      b.minX = Math.min(b.minX, road.xz[i] as number);
      b.maxX = Math.max(b.maxX, road.xz[i] as number);
      b.minZ = Math.min(b.minZ, road.xz[i + 1] as number);
      b.maxZ = Math.max(b.maxZ, road.xz[i + 1] as number);
    }
  }
  return b;
}

/** Barınak/iç mekân sorgusu sonucu. */
export interface BuildingInterior {
  building: Building;
  /** Cami: kutsal ve güvenli alan (yırtıcılar oyuncuyu izlemez). */
  sacred: boolean;
}

/**
 * Yolları dairelerin (kent içleri) içinde keser: köy yolu ve patikanın dairenin içine düşen parçaları atılır (kalan
 * parçalar ayrı çizgiler olur; uçları `townNetwork.ts` sokaklara bağlar). Anayol kesilmez: kentin içinden geçen kısmı
 * kentin ana caddesi olur (sınıf 3, `ROADS.avenueWidth`).
 */
export function cutRoads(
  roads: readonly RoadData[],
  circles: ReadonlyArray<{ x: number; z: number; r: number }>,
): RoadData[] {
  const out: RoadData[] = [];
  for (const road of roads) {
    const raw = road.xz;
    // Yalnızca yolun sınır kutusuna değen daireler denetlenir.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i + 1 < raw.length; i += 2) {
      minX = Math.min(minX, raw[i] as number);
      maxX = Math.max(maxX, raw[i] as number);
      minZ = Math.min(minZ, raw[i + 1] as number);
      maxZ = Math.max(maxZ, raw[i + 1] as number);
    }
    const near = circles.filter(
      (c) => c.x + c.r > minX && c.x - c.r < maxX && c.z + c.r > minZ && c.z - c.r < maxZ,
    );
    if (near.length === 0) {
      out.push(road);
      continue;
    }
    const insideAt = (x: number, z: number) => near.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
    // Uzun düz parça daireyi köşesiz geçebilir: daireye değen parçalar sıklaştırılır (sınır noktası bulunsun).
    const dense: number[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const ax = raw[i] as number;
      const az = raw[i + 1] as number;
      if (i + 3 >= raw.length) {
        dense.push(ax, az);
        break;
      }
      const bx = raw[i + 2] as number;
      const bz = raw[i + 3] as number;
      const touches = near.some((c) => {
        const dx = bx - ax;
        const dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / l2));
        return Math.hypot(ax + t * dx - c.x, az + t * dz - c.z) < c.r;
      });
      const n = touches ? Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2)) : 1;
      for (let k = 0; k < n; k++) dense.push(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
    }
    const xz = Float32Array.from(dense);
    const trunk = road.cls === 0;
    let run: number[] = [];
    let runInside = insideAt(xz[0] as number, xz[1] as number);
    const flush = () => {
      if (run.length >= 4) {
        if (!runInside) out.push({ cls: road.cls, xz: Float32Array.from(run) });
        else if (trunk) out.push({ cls: 3, xz: Float32Array.from(run), width: ROADS.avenueWidth });
      }
      run = [];
    };
    for (let i = 0; i + 1 < xz.length; i += 2) {
      const x = xz[i] as number;
      const z = xz[i + 1] as number;
      const inside = insideAt(x, z);
      if (i > 0 && inside !== runInside) {
        // Sınır noktası (ikiye bölme): iki parça aynı noktada buluşur.
        let ax = xz[i - 2] as number;
        let az = xz[i - 1] as number;
        let bx = x;
        let bz = z;
        for (let k = 0; k < 12; k++) {
          const mx = (ax + bx) / 2;
          const mz = (az + bz) / 2;
          if (insideAt(mx, mz) === runInside) {
            ax = mx;
            az = mz;
          } else {
            bx = mx;
            bz = mz;
          }
        }
        run.push(ax, az);
        flush();
        runInside = inside;
        run.push(ax, az);
      }
      run.push(x, z);
    }
    flush();
  }
  return out;
}

/**
 * Girilebilir/aranabilir yapının kapısı zeminden yüksekse taş merdiven. Uzunluk düzenin ayırdığı yeri
 * (`Building.stairRun`) aşmaz: ucun zemini beklenenden alçaksa merdiven biraz dikleşir (komşu yapıya girmesin).
 */
function stairFor(b: Building, terrain: LayoutTerrain): Stair | null {
  const shape = BUILDING_SHAPES[b.kind];
  if (!shape.enterable && !shape.searchable) return null;
  // Düzen merdiven ayırmadıysa (teras üstü ya da kapı önü düz) merdiven yoktur.
  if (b.stairRun <= 0) return null;
  const doorX = shape.door.x;
  const front = shape.depth / 2;
  const start = buildingLocalToWorld(b, doorX, front);
  // Merdivenin ucunda zemin: yükseltiye göre uzunluk, ucun zemini yeniden ölçülür (iki adım yakınsar).
  let rise = b.y - terrain.heightAt(start.x, start.z);
  if (rise < STAIR_MIN_RISE) return null;
  const maxRun = b.stairRun > 0 ? b.stairRun : Infinity;
  let run = Math.min(maxRun, Math.max(1, rise / STAIR_SLOPE));
  for (let k = 0; k < 2; k++) {
    const end = buildingLocalToWorld(b, doorX, front + run);
    rise = Math.max(STAIR_MIN_RISE, b.y - terrain.heightAt(end.x, end.z));
    run = Math.min(maxRun, Math.max(1, rise / STAIR_SLOPE));
  }
  return {
    building: b.id,
    x: start.x,
    z: start.z,
    yaw: b.yaw,
    y0: b.y - rise,
    rise,
    run,
    width: stairWidth(b.kind),
  };
}

/**
 * Komşu teraslar yüzünden arka kenarı sınırdan (`MAX_BURY` + `buryTolerance`) fazla gömülen yapı (cami ve hükümet konağı
 * hariç: kentin temel yapıları kalır).
 */
function buriedBySlope(b: Building, terrain: LayoutTerrain): boolean {
  if (isMosque(b.kind) || b.kind === 'government') return false;
  const shape = BUILDING_SHAPES[b.kind];
  if (shape.interior) {
    // Girilebilir yapı: komşu terasın şevi odaya fazla taşıyorsa atılır (azı `raiseFloor` ile döşemeyi yükseltir).
    return interiorTop(b, terrain) - b.y > SETTLEMENT_LAYOUT.interiorTolerance;
  }
  const back = buildingLocalToWorld(b, 0, -shape.depth / 2);
  return (
    terrain.heightAt(back.x, back.z) - b.y > MAX_BURY[b.kind] + SETTLEMENT_LAYOUT.buryTolerance
  );
}

/** Girilebilir yapının odasındaki en yüksek arazi (0,25 m aralıkla örneklenir; oda yoksa −∞). */
function interiorTop(b: Building, terrain: LayoutTerrain): number {
  const a = BUILDING_SHAPES[b.kind].interior;
  if (!a) return -Infinity;
  const step = 0.25;
  const nx = Math.ceil((2 * a.halfWidth) / step);
  const nz = Math.ceil((a.front - a.back) / step);
  let top = -Infinity;
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const p = buildingLocalToWorld(
        b,
        -a.halfWidth + (2 * a.halfWidth * i) / nx,
        a.back + ((a.front - a.back) * j) / nz,
      );
      top = Math.max(top, terrain.heightAt(p.x, p.z));
    }
  }
  return top;
}

/** Odasında arazi döşemeye değen yapının döşemesini arazinin biraz üstüne yükseltir (taş temel aşağıda kalır). */
function raiseFloor(b: Building, terrain: LayoutTerrain): void {
  const top = interiorTop(b, terrain) + FLOOR_CLEARANCE;
  if (top > b.y) b.y = top;
}

/** Döşeme ile odadaki en yüksek arazi arasında kalan en az pay (oyun m; döşeme kalınlığı). */
const FLOOR_CLEARANCE = 0.05;

/** Yapının ayak izi altındaki en alçak zemin (taş temelin ineceği yer); en çok `maxTerrace` aşağıda. */
function settledBase(b: Building, terrain: LayoutTerrain): number {
  const shape = BUILDING_SHAPES[b.kind];
  let low = b.y;
  for (const [u, v] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
    [0, 0],
    [0, -0.5],
    [0, 0.5],
  ] as const) {
    const p = buildingLocalToWorld(b, u * shape.width, v * shape.depth);
    low = Math.min(low, terrain.heightAt(p.x, p.z));
  }
  return Math.max(low, b.y - SETTLEMENT_LAYOUT.maxTerrace);
}

/** Yapı yerel → dünya (yapılarla aynı kural: `mesh.rotation.y = yaw`). */
export function buildingLocalToWorld(
  b: Building,
  lx: number,
  lz: number,
): { x: number; z: number } {
  const cos = Math.cos(b.yaw);
  const sin = Math.sin(b.yaw);
  return { x: b.x + lx * cos + lz * sin, z: b.z - lx * sin + lz * cos };
}

/** Dünya → yapı yerel. */
export function worldToBuildingLocal(b: Building, x: number, z: number): { x: number; z: number } {
  const dx = x - b.x;
  const dz = z - b.z;
  const cos = Math.cos(b.yaw);
  const sin = Math.sin(b.yaw);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

/** Şadırvan musluklarının merkeze uzaklığı (oyun m; havuz kenarı). */
const SADIRVAN_TAP_RADIUS = 1.4;

/** Yerleşimin içinden sorgulanacak en büyük yapı yarı köşegeni (oyun m; kale). */
const MAX_HALF_DIAGONAL = Math.max(
  ...Object.values(BUILDING_SHAPES).map((s) => Math.hypot(s.width, s.depth) / 2),
);

/**
 * Tüm yerleşimler (saf; Three.js'siz): açılışta her yerleşimin düzeni bir kez hesaplanır. Bina, yol, çeşme ve
 * yerleşim sorguları uzamsal ızgarayla yapılır. Görsel (`world/SettlementLayer`), collider
 * (`world/SettlementColliders`), nesne eleme, barınak ve arama bu sınıfı okur.
 */
export class SettlementMap {
  readonly settlements: SettlementView[] = [];
  readonly buildings: Building[] = [];
  /** Tüm yollar: ağ yolları (kentte kesilmiş, kentten geçen anayol cadde), kent bağlantıları ve sokakları. */
  readonly roadLines: RoadData[];
  /** Yol profilleri, köprü ve tünel kesimleri (`roadProfile.ts`). */
  readonly plan: RoadPlan;
  /** Kent sokakları (sınıf 3; ana caddeler geniş) ve kesilen yolların sokaklara bağlantıları. */
  readonly streetLines: RoadData[];
  readonly joinLines: RoadData[];
  /** Arazi kaplamasında boyanan çizgiler: köprü/tünel olmayan yol kesimleri + sokaklar. */
  readonly paintLines: RoadData[];
  /** Yüzeydeki yol + sokak dizini (nesne eleme, insanların yürüyüşü; tünel içi hariç). */
  readonly roads: RoadIndex;
  /** Kapı önü merdivenleri (görsel + collider). */
  readonly stairs: Stair[] = [];
  private readonly byId = new Map<number, Building>();
  private readonly grid = new Map<string, Building[]>();
  private readonly cell = 64;

  /** Tüm yapıların görsel ayak izleri (taşma payı ve merdiven dahil): yerleşimler arası çakışma, sokak eleme. */
  readonly footprints = new FootprintRegistry();

  constructor(
    data: SettlementsData,
    terrain: LayoutTerrain & {
      /** Varsa akarsuya paralel yollar sudan ayrılır (`roadRouting.ts`). */
      nearestWater?: NearestWater;
      /** Varsa akarsu çizgileri: köprüler yalnız yolun bunları kestiği yerde kurulur (`roadProfile.ts`). */
      waterLines?: ReadonlyArray<{ kind: string; xz: ArrayLike<number> }>;
      /**
       * Varsa yol planı zemine uygulanır (`world/roadGrading.ts`): çağrıdan sonra `heightAt` düzeltilmiş zemini
       * verir ve yapı düzeni onun üstünde kurulur. Yoksa zemin doğal kalır.
       */
      grade?: (plan: RoadPlan) => void;
      /** Dünya kenarı (yol ağı düzeni: kenardaki çıkmazlar budanmaz); yoksa yolların sınır kutusu. */
      bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
    },
    seed: number = SETTLEMENT_LAYOUT.seed,
    /** Ölçüm/test: yol ağı düzeninin sayımları doldurulur. */
    networkReport?: NetworkReport,
  ) {
    // Il/ilçe merkezlerinin içinde il-ilçe ve köy yolları çizilmez: kentin içi kendi sokak ızgarasıdır.
    const cuts = data.settlements
      .filter((s) => s.rank !== 'koy')
      .map((s) => ({
        ...settlementCenter(s),
        r: footprintRadius(s) * SETTLEMENT_LAYOUT.innerRoadCut,
      }));
    // Yol ağı: veri yollarından seyrek, bağlı bir omurga seçilir (`roadNetwork.ts`): il/ilçe merkezleri arası anayol,
    // köylere köy yolu / dağ patikası; ikiz şerit, göbek ve kopuk parçalar atılır.
    const towns: TownDisc[] = data.settlements.map((s) => ({
      ...settlementCenter(s),
      r: footprintRadius(s),
      rank: s.rank,
    }));
    const network = buildRoadNetwork(
      data.roads,
      towns,
      { ...terrain, bounds: terrain.bounds ?? boundsOf(data.roads) },
      networkReport,
    );
    // Kafes basamakları yumuşatılır, akarsuya paralel kesimler sudan ayrılır (`roadRouting.ts`).
    let smoothed = smoothRoads(network);
    // Menderesli dereyi tekrar tekrar kesen kesimler derenin bir yakasından yeniden çizilir (köprü kümesi olmasın).
    if (terrain.waterLines) {
      const field = terrainRouteField({
        ...terrain,
        bounds: { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity },
      });
      smoothed = uncrossStreams(smoothed, new StreamGrid(terrain.waterLines), (ax, az, bx, bz) =>
        findRoute(ax, az, bx, bz, field, { pad: 30, maxNodes: 40000 }),
      );
    }
    const shaped = terrain.nearestWater
      ? separateRoadsFromWater(smoothed, terrain.nearestWater)
      : smoothed;
    const roads = cutRoads(shaped, cuts);
    // Yol profili: eğimi sınırlı, düzgün yatak; dere geçişleri köprü, derin vadiler viyadük, sırtlar tünel. Zemin yola
    // uydurulur.
    this.plan = planRoadProfiles(roads, {
      heightAt: terrain.heightAt,
      elevationAt: terrain.elevationAt,
      nearestWater: terrain.nearestWater,
      waterLines: terrain.waterLines,
    });
    terrain.grade?.(this.plan);
    const layoutRoads = new RoadIndex(roads);
    const streets: RoadData[] = [];
    const landmarksOf = new Map<number, LandmarkData[]>();
    for (const lm of data.landmarks) {
      const list = landmarksOf.get(lm.settlement) ?? [];
      list.push(lm);
      landmarksOf.set(lm.settlement, list);
    }
    // Il/ilçe merkezlerinin çekirdeği (meydan, cami) yalnızca kendisine aittir: büyütülmüş ayak izi komşu merkeze
    // taşan yerleşim oraya yapı koymaz (ör. Zonguldak'ın kenar parselleri Kozlu'nun meydanını yutmasın).
    const cores = data.settlements
      .filter((s) => s.rank !== 'koy')
      .map((s) => ({
        id: s.id,
        ...settlementCenter(s),
        r: footprintRadius(s) * SETTLEMENT_LAYOUT.coreReserve,
      }));
    // Düzen sırası: ilçe merkezleri, il merkezleri, köyler (aynı rütbede veri sırası). Büyütülmüş il ayak izi komşu
    // ilçeyi örtebilir (Zonguldak–Kozlu): küçük merkezin meydanı ve camisi önce yer bulur. Kimlikler yerleşim
    // kimliğinden türediğinden sıra kimlikleri değiştirmez.
    const mosqueSites: Array<{ x: number; z: number }> = [];
    const order = { ilce: 0, il: 1, koy: 2 } as const;
    const ordered = [...data.settlements].sort((a, b) => order[a.rank] - order[b.rank]);
    for (const s of ordered) {
      const layout = layoutSettlement(
        s,
        landmarksOf.get(s.id) ?? [],
        terrain,
        layoutRoads,
        seed,
        undefined,
        this.footprints,
        cores.filter((c) => c.id !== s.id),
        mosqueSites,
      );
      this.settlements.push({ data: s, buildings: layout.buildings, radius: layout.radius });
      for (const st of layout.streets) {
        const street: RoadData = { cls: st.cls, xz: st.xz };
        streets.push(street);
        layoutRoads.add(street); // sonraki yerleşimlerin yapıları bu sokağa binmesin
      }
    }
    // Komşu terasların şevi bir yapının ayak izi altındaki zemini sonradan değiştirmiş olabilir: aşırı gömülen (nadir)
    // yapılar atılır, kalanların taş temeli ayak izi altındaki gerçek en alçak zemine göre yeniden ölçülür.
    for (const view of this.settlements) {
      view.buildings = view.buildings.filter((b) => !buriedBySlope(b, terrain));
      for (const b of view.buildings) {
        raiseFloor(b, terrain);
        b.base = settledBase(b, terrain);
        this.buildings.push(b);
        this.byId.set(b.id, b);
        const key = this.key(Math.floor(b.x / this.cell), Math.floor(b.z / this.cell));
        const list = this.grid.get(key) ?? [];
        list.push(b);
        this.grid.set(key, list);
      }
    }
    // Kent içi: kesilen yol uçları sokaklara bağlanır, yalnızca kapıları kente bağlayan sokaklar kalır (`townNetwork.ts`).
    const doors: Array<{ x: number; z: number; settlement: number }> = [];
    for (const view of this.settlements) {
      if (view.data.rank === 'koy') continue;
      for (const b of view.buildings) {
        const shape = BUILDING_SHAPES[b.kind];
        const door = buildingLocalToWorld(b, shape.door.x, shape.depth / 2 + b.stairRun + 1);
        doors.push({ ...door, settlement: view.data.id });
      }
    }
    const town = connectTownRoads(roads, streets, data, terrain, this.footprints, doors);
    this.streetLines = town.streets;
    this.joinLines = town.joins;
    this.roadLines = [...roads, ...town.joins, ...town.streets];
    this.paintLines = [...groundRuns(this.plan), ...town.joins, ...town.streets];
    // Dizin yüzeydeki yollardır: tünelin içi dağın altındadır (üstünde ağaç kalır, insanlar oradan yürümez).
    this.roads = new RoadIndex([...surfaceRuns(this.plan), ...town.joins, ...town.streets]);
    for (const b of this.buildings) {
      const stair = stairFor(b, terrain);
      if (stair) this.stairs.push(stair);
    }
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  building(id: number): Building | null {
    return this.byId.get(id) ?? null;
  }

  /** Merkezi (x, z)'ye `radius` içinde olan yapılar (sırasız). */
  buildingsNear(x: number, z: number, radius: number): Building[] {
    const out: Building[] = [];
    const r = radius + MAX_HALF_DIAGONAL;
    const c0x = Math.floor((x - r) / this.cell);
    const c1x = Math.floor((x + r) / this.cell);
    const c0z = Math.floor((z - r) / this.cell);
    const c1z = Math.floor((z + r) / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        for (const b of this.grid.get(this.key(cx, cz)) ?? []) {
          if (Math.hypot(b.x - x, b.z - z) <= radius) out.push(b);
        }
      }
    }
    return out;
  }

  /** (x, z) bir yapının ayak izinde mi (`margin` pay ile)? İlk bulunanı döndürür. */
  buildingAt(x: number, z: number, margin = 0): Building | null {
    for (const b of this.buildingsNear(x, z, MAX_HALF_DIAGONAL + margin)) {
      const shape = BUILDING_SHAPES[b.kind];
      const local = worldToBuildingLocal(b, x, z);
      if (
        Math.abs(local.x) <= shape.width / 2 + margin &&
        Math.abs(local.z) <= shape.depth / 2 + margin
      ) {
        return b;
      }
    }
    return null;
  }

  /**
   * `radius` yarıçaplı nesne (ağaç tacı, kaya, bitki) burada çizilmesin mi? Yapının görsel ayak izine (saçak,
   * merdiven dahil) ya da yola (banket dahil) değen nesne gizlenir (kimlikler değişmez; yalnızca görünmez ve
   * toplanamaz olur).
   */
  blocksProp(x: number, z: number, radius = 0.8): boolean {
    return (
      this.footprints.contains(x, z, radius) ||
      this.roads.onRoad(x, z, radius + TERRAIN_OVERLAY.shoulderWidth)
    );
  }

  /** (x, y, z) girilebilir bir yapının (cami, han) içinde mi? */
  interiorAt(x: number, y: number, z: number): BuildingInterior | null {
    for (const b of this.buildingsNear(x, z, MAX_HALF_DIAGONAL)) {
      const shape = BUILDING_SHAPES[b.kind];
      if (!shape.interior) continue;
      if (y < b.y - 1 || y > b.y + shape.height) continue;
      const local = worldToBuildingLocal(b, x, z);
      const area = shape.interior;
      if (Math.abs(local.x) <= area.halfWidth && local.z >= area.back && local.z <= area.front) {
        return { building: b, sacred: isMosque(b.kind) };
      }
    }
    return null;
  }

  /** (x, z)'ye en yakın çeşmenin musluğu `reach` içindeyse onun konumu; yoksa null. */
  fountainNear(
    x: number,
    z: number,
    reach: number,
  ): { x: number; z: number; distance: number } | null {
    let best: { x: number; z: number; distance: number } | null = null;
    for (const b of this.buildingsNear(x, z, reach + 4)) {
      let spout: { x: number; z: number };
      let distance: number;
      if (b.kind === 'fountain') {
        spout = buildingLocalToWorld(b, 0, BUILDING_SHAPES.fountain.depth / 2);
        distance = Math.hypot(spout.x - x, spout.z - z);
      } else if (b.kind === 'sadirvan') {
        // Şadırvanın musluklar havuzun çevresindedir: havuz kenarına uzaklık.
        const d = Math.hypot(b.x - x, b.z - z);
        distance = Math.max(0, d - SADIRVAN_TAP_RADIUS);
        const k = d > 1e-6 ? SADIRVAN_TAP_RADIUS / d : 0;
        spout = { x: b.x + (x - b.x) * k, z: b.z + (z - b.z) * k };
      } else {
        continue;
      }
      if (distance <= reach && (best === null || distance < best.distance))
        best = { ...spout, distance };
    }
    return best;
  }

  /** (x, z)'nin içinde bulunduğu yerleşim (ayak izi yarıçapı içindeki en yakın merkez); yoksa null. */
  settlementAt(x: number, z: number): SettlementView | null {
    let best: SettlementView | null = null;
    let bestRatio = Infinity;
    for (const s of this.settlements) {
      const ratio = Math.hypot(s.data.x - x, s.data.z - z) / Math.max(s.radius, 1);
      if (ratio <= 1 && ratio < bestRatio) {
        best = s;
        bestRatio = ratio;
      }
    }
    return best;
  }

  /** (x, z)'ye en yakın yerleşim (`filter` uyanlardan); yoksa null. */
  nearestSettlement(
    x: number,
    z: number,
    filter: (s: SettlementView) => boolean = () => true,
  ): SettlementView | null {
    let best: SettlementView | null = null;
    let bestD = Infinity;
    for (const s of this.settlements) {
      if (!filter(s)) continue;
      const d = Math.hypot(s.data.x - x, s.data.z - z);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }
}
