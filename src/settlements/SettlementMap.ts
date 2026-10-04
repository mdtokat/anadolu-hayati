import { ROADS, ROAD_SIGNS, ROAD_STRUCTURES, SETTLEMENT_LAYOUT, TERRAIN_OVERLAY } from '../config';
import { placeRoadSigns, signPosts, type RoadSign, type SignTown } from './roadSigns';
import type { LandmarkData, RoadData, SettlementData, SettlementsData } from '../data/settlements';
import { BUILDING_SHAPES, MAX_BURY, isMosque, shapeVariant } from './kinds';
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
import { BAKED_MAP_VERSION, type BakedSettlementMap } from './bakedMap';
import {
  groundRuns,
  planRoadProfiles,
  planStreetProfiles,
  surfaceRuns,
  type RoadPlan,
} from './roadProfile';
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
 * kentin ana caddesi olur (sınıf 3, `ROADS.avenueWidth`). `sea` verilirse uzun deniz geçişleri (köprü: körfezi geçen
 * otoyol, Osman Gazi Köprüsü) ve iki yanındaki yaklaşım kentin içinde de kesilmez, sınıfını korur: deniz üstündeki yol
 * cadde sayılmaz, köprü tek parça kalır (kavşak denizin ortasına düşmez).
 */
export function cutRoads(
  roads: readonly RoadData[],
  circles: ReadonlyArray<{ x: number; z: number; r: number }>,
  sea?: { isSea: (x: number, z: number) => boolean; minLength: number; approach: number },
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
    const kept = sea ? seaCrossingMask(xz, sea) : null;
    const insideIdx = (k: number) =>
      !kept?.[k] && insideAt(xz[k * 2] as number, xz[k * 2 + 1] as number);
    let run: number[] = [];
    let runInside = insideIdx(0);
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
      const inside = insideIdx(i / 2);
      if (i > 0 && inside !== runInside && kept && kept[i / 2] !== kept[i / 2 - 1]) {
        // Deniz geçişinin sınırı: parçalar bu noktada buluşur.
        run.push(x, z);
        flush();
        runInside = inside;
        run.push(x, z);
        continue;
      }
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
 * Yolun (sık örnekli) noktalarından uzun deniz geçişine ait olanlar: denizdeki ardışık noktaların toplam uzunluğu
 * `minLength`'i aşan kesim ve iki yanında `approach` kadar kara (oyun m).
 */
function seaCrossingMask(
  xz: Float32Array,
  sea: { isSea: (x: number, z: number) => boolean; minLength: number; approach: number },
): Uint8Array {
  const n = xz.length / 2;
  const along = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    along[k] =
      (along[k - 1] as number) +
      Math.hypot(
        (xz[k * 2] as number) - (xz[k * 2 - 2] as number),
        (xz[k * 2 + 1] as number) - (xz[k * 2 - 1] as number),
      );
  }
  const mask = new Uint8Array(n);
  let start = -1;
  for (let k = 0; k <= n; k++) {
    const wet = k < n && sea.isSea(xz[k * 2] as number, xz[k * 2 + 1] as number);
    if (wet && start < 0) start = k;
    if (!wet && start >= 0) {
      const a = along[start] as number;
      const b = along[k - 1] as number;
      if (b - a >= sea.minLength) {
        for (let j = 0; j < n; j++) {
          const s = along[j] as number;
          if (s >= a - sea.approach && s <= b + sea.approach) mask[j] = 1;
        }
      }
      start = -1;
    }
  }
  return mask;
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

/** Yerleşim düzeninin okuduğu arazi ve isteğe bağlı araçlar (`RegionWorld`/`worldPrep` sağlar). */
export type SettlementTerrain = LayoutTerrain & {
  /** Varsa akarsuya paralel yollar sudan ayrılır (`roadRouting.ts`). */
  nearestWater?: NearestWater;
  /** Varsa akarsu çizgileri: köprüler yalnız yolun bunları kestiği yerde kurulur (`roadProfile.ts`). */
  waterLines?: ReadonlyArray<{ kind: string; xz: ArrayLike<number> }>;
  /**
   * Varsa yol planı zemine uygulanır (`world/roadGrading.ts`): çağrıdan sonra `heightAt` düzeltilmiş zemini
   * verir ve yapı düzeni onun üstünde kurulur. Yoksa zemin doğal kalır.
   */
  grade?: (plan: RoadPlan) => void;
  /**
   * Varsa kent sokakları ve bağlantıları (yapı düzeninden sonra) zemine uygulanır; kilitli hücrelere (yapı ayak izleri,
   * ana yol yatağı) dokunulmaz.
   */
  gradeStreets?: (plan: RoadPlan) => void;
  /** Dünya kenarı (yol ağı düzeni: kenardaki çıkmazlar budanmaz); yoksa yolların sınır kutusu. */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
};

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
  /** Yol levhaları: kavşaklarda yön levhaları, il/ilçe girişlerinde ad/nüfus levhaları (`roadSigns.ts`). */
  readonly signs: RoadSign[] = [];
  private readonly byId = new Map<number, Building>();
  private readonly grid = new Map<string, Building[]>();
  private readonly cell = 64;
  private signGrid: Map<string, RoadSign[]> | null = null;

  /** Tüm yapıların görsel ayak izleri (taşma payı ve merdiven dahil): yerleşimler arası çakışma, sokak eleme. */
  readonly footprints: FootprintRegistry;
  /** Yol ağının (kentlerde kesilmiş) hâli: `toBaked` için saklanır; kurulumda dolar. */
  private readonly networkRoads: RoadData[];

  /** Veri hattında önceden hesaplanmış haritadan kurar (açılışta ~0,1 sn; hesap yok). */
  constructor(baked: BakedSettlementMap);
  constructor(
    data: SettlementsData,
    terrain: SettlementTerrain,
    seed?: number,
    /** Ölçüm/test: yol ağı düzeninin sayımları doldurulur. */
    networkReport?: NetworkReport,
  );
  constructor(
    input: SettlementsData | BakedSettlementMap,
    terrainArg?: SettlementTerrain,
    seed: number = SETTLEMENT_LAYOUT.seed,
    networkReport?: NetworkReport,
  ) {
    if ('settlements' in input && 'networkRoads' in input) {
      // Önceden hesaplanmış harita: yalnızca kurulur ve dizinlenir.
      const baked = input;
      if (baked.version !== BAKED_MAP_VERSION) {
        throw new Error(
          `Baked yerleşim haritası sürümü ${baked.version}, beklenen ${BAKED_MAP_VERSION}`,
        );
      }
      this.footprints = FootprintRegistry.restore(baked.footprints);
      this.plan = baked.plan;
      this.networkRoads = baked.networkRoads;
      this.streetLines = baked.streetLines;
      this.joinLines = baked.joinLines;
      this.roadLines = [...baked.networkRoads, ...baked.joinLines, ...baked.streetLines];
      this.paintLines = [...groundRuns(baked.plan), ...baked.joinLines, ...baked.streetLines];
      this.roads = new RoadIndex([
        ...surfaceRuns(baked.plan),
        ...baked.joinLines,
        ...baked.streetLines,
      ]);
      for (const s of baked.settlements) {
        const view: SettlementView = {
          data: { ...s.data, cells: new Int16Array(0) },
          buildings: s.buildings,
          radius: s.radius,
        };
        this.settlements.push(view);
        for (const b of view.buildings) this.register(b);
      }
      this.stairs.push(...baked.stairs);
      this.signs.push(...baked.signs);
      return;
    }
    const data = input;
    const terrain = terrainArg as SettlementTerrain;
    this.footprints = new FootprintRegistry();
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
    const roads = cutRoads(shaped, cuts, {
      isSea: (x, z) => terrain.heightAt(x, z) < 0,
      minLength: ROAD_STRUCTURES.suspensionMinLength,
      approach: ROAD_STRUCTURES.seaApproach,
    });
    this.networkRoads = roads;
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
        this.register(b);
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
    // Kent sokakları ve bağlantılar da zemine uydurulur (enine kesit düz; yamaçta yan yatmaz). Yapıların ayak izi ve
    // merdiven yerleri önce kilitlenir: zeminleri (temel, döşeme, merdiven ucu) değişmez.
    if (terrain.gradeStreets) {
      if (terrain.lock) {
        const m = SETTLEMENT_LAYOUT.streetLockMargin;
        for (const b of this.buildings) {
          const shape = BUILDING_SHAPES[b.kind];
          const hz = shape.depth / 2 + m;
          terrain.lock({ x: b.x, z: b.z, hx: shape.width / 2 + m, hz, yaw: b.yaw });
          if (b.stairRun > 0) {
            const c = buildingLocalToWorld(b, shape.door.x, shape.depth / 2 + b.stairRun / 2);
            terrain.lock({
              x: c.x,
              z: c.z,
              hx: stairWidth(b.kind) / 2 + m,
              hz: b.stairRun / 2 + m,
              yaw: b.yaw,
            });
          }
        }
      }
      terrain.gradeStreets(planStreetProfiles([...town.joins, ...town.streets], terrain.heightAt));
    }
    this.roadLines = [...roads, ...town.joins, ...town.streets];
    this.paintLines = [...groundRuns(this.plan), ...town.joins, ...town.streets];
    // Dizin yüzeydeki yollardır: tünelin içi dağın altındadır (üstünde ağaç kalır, insanlar oradan yürümez).
    this.roads = new RoadIndex([...surfaceRuns(this.plan), ...town.joins, ...town.streets]);
    for (const b of this.buildings) {
      const stair = stairFor(b, terrain);
      if (stair) this.stairs.push(stair);
    }
    // Yol levhaları: kavşak yön levhaları ve il/ilçe giriş levhaları (zemin düzeltmesinden sonra; yerleri yol, yapı ve
    // sudan uzak).
    const signTowns: SignTown[] = data.settlements
      .filter((s) => s.rank !== 'koy')
      .map((s) => {
        const c = settlementCenter(s);
        return {
          ...c,
          r: footprintRadius(s) * SETTLEMENT_LAYOUT.innerRoadCut,
          name: s.name,
          rank: s.rank as 'il' | 'ilce',
          population: s.population,
          elevation: Math.max(0, Math.round(terrain.elevationAt(c.x, c.z))),
        };
      });
    this.signs.push(
      ...placeRoadSigns(roads, signTowns, {
        heightAt: terrain.heightAt,
        blocked: (x, z) =>
          this.roads.onRoad(x, z, 0.6) ||
          this.footprints.contains(x, z, 0.6) ||
          terrain.isWater(x, z, 0.8),
      }),
    );
  }

  /** Yapıyı listeye, kimlik haritasına ve uzamsal ızgaraya ekler. */
  private register(b: Building): void {
    this.buildings.push(b);
    this.byId.set(b.id, b);
    const key = this.key(Math.floor(b.x / this.cell), Math.floor(b.z / this.cell));
    const list = this.grid.get(key) ?? [];
    list.push(b);
    this.grid.set(key, list);
  }

  /** Veri hattı için: haritanın tüm hesaplanmış durumu (`new SettlementMap(baked)` ile geri kurulur). */
  toBaked(): BakedSettlementMap {
    return {
      version: BAKED_MAP_VERSION,
      settlements: this.settlements.map((s) => {
        const { cells: _cells, ...data } = s.data;
        void _cells;
        return { data, buildings: s.buildings, radius: s.radius };
      }),
      networkRoads: this.networkRoads,
      joinLines: this.joinLines,
      streetLines: this.streetLines,
      plan: this.plan,
      stairs: this.stairs,
      signs: this.signs,
      footprints: this.footprints.dump(),
    };
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
      this.signNear(x, z, radius + ROAD_SIGNS.board.width / 2 + 0.3) ||
      this.roads.onRoad(x, z, radius + TERRAIN_OVERLAY.shoulderWidth)
    );
  }

  /** (x, z)'ye `radius` içinde levha var mı (levha yerinde ağaç/kaya gizlenir)? */
  private signNear(x: number, z: number, radius: number): boolean {
    return this.signsNear(x, z, radius).length > 0;
  }

  /** (x, z)'ye `radius` içinde levha direği var mı (canlı/insan yürüyüşü engeli)? */
  signPostNear(x: number, z: number, radius: number): boolean {
    const r = radius + ROAD_SIGNS.post / 2;
    for (const sign of this.signsNear(x, z, radius + ROAD_SIGNS.boardPosts)) {
      for (const p of signPosts(sign)) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true;
    }
    return false;
  }

  /** (x, z)'ye `radius` içindeki levhalar (uzamsal ızgarayla). */
  signsNear(x: number, z: number, radius: number): RoadSign[] {
    if (this.signs.length === 0) return [];
    if (!this.signGrid) {
      this.signGrid = new Map();
      for (const sign of this.signs) {
        const k = this.key(Math.floor(sign.x / this.cell), Math.floor(sign.z / this.cell));
        const list = this.signGrid.get(k) ?? [];
        list.push(sign);
        this.signGrid.set(k, list);
      }
    }
    const out: RoadSign[] = [];
    const r2 = radius * radius;
    for (
      let cx = Math.floor((x - radius) / this.cell);
      cx <= Math.floor((x + radius) / this.cell);
      cx++
    ) {
      for (
        let cz = Math.floor((z - radius) / this.cell);
        cz <= Math.floor((z + radius) / this.cell);
        cz++
      ) {
        for (const sign of this.signGrid.get(this.key(cx, cz)) ?? []) {
          if ((sign.x - x) ** 2 + (sign.z - z) ** 2 <= r2) out.push(sign);
        }
      }
    }
    return out;
  }

  /** (x, y, z) girilebilir bir yapının (cami, han) içinde mi? */
  interiorAt(x: number, y: number, z: number): BuildingInterior | null {
    for (const b of this.buildingsNear(x, z, MAX_HALF_DIAGONAL)) {
      const shape = shapeVariant(b.kind, b.floors, b.ruined);
      if (!shape.interior) continue;
      // Katlı yapıda çatı terası açık havadır (döşemenin üstü): yalnızca terasın altı iç mekândır.
      if (y < b.y - 1 || y > b.y + shape.indoorTop) continue;
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
