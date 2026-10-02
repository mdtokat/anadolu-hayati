import { SETTLEMENT_LAYOUT, TERRAIN_OVERLAY } from '../config';
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
import { groundRuns, planRoadProfiles, type RoadPlan } from './roadProfile';
import { shapeRoadNetwork, type NetworkReport, type TownDisc } from './roadNetwork';
import { connectTownRoads } from './townNetwork';
import { separateRoadsFromWater, smoothRoads, type NearestWater } from './roadRouting';

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
 * Yolları dairelerin (kent içleri) içinde keser: sınıf 0 (anayol) olduğu gibi kalır, diğerlerinin noktası
 * dairenin içine düşen parçaları atılır (kalan parçalar ayrı çizgiler olur).
 */
export function cutRoads(
  roads: readonly RoadData[],
  circles: ReadonlyArray<{ x: number; z: number; r: number }>,
): RoadData[] {
  const out: RoadData[] = [];
  for (const road of roads) {
    if (road.cls === 0) {
      out.push(road);
      continue;
    }
    const xz = road.xz;
    // Yalnızca yolun sınır kutusuna değen daireler denetlenir.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i + 1 < xz.length; i += 2) {
      minX = Math.min(minX, xz[i] as number);
      maxX = Math.max(maxX, xz[i] as number);
      minZ = Math.min(minZ, xz[i + 1] as number);
      maxZ = Math.max(maxZ, xz[i + 1] as number);
    }
    const near = circles.filter(
      (c) => c.x + c.r > minX && c.x - c.r < maxX && c.z + c.r > minZ && c.z - c.r < maxZ,
    );
    if (near.length === 0) {
      out.push(road);
      continue;
    }
    const inside = (i: number) =>
      near.some((c) => Math.hypot((xz[i] as number) - c.x, (xz[i + 1] as number) - c.z) < c.r);
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 4) out.push({ cls: road.cls, xz: Float32Array.from(run) });
      run = [];
    };
    for (let i = 0; i + 1 < xz.length; i += 2) {
      if (inside(i)) {
        flush();
        continue;
      }
      run.push(xz[i] as number, xz[i + 1] as number);
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
  const back = buildingLocalToWorld(b, 0, -shape.depth / 2);
  return (
    terrain.heightAt(back.x, back.z) - b.y > MAX_BURY[b.kind] + SETTLEMENT_LAYOUT.buryTolerance
  );
}

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
  /** Çizilen yollar: kent içinde kesilmiş yollar + kent sokakları (sınıf 1). */
  readonly roadLines: RoadData[];
  /** Yol profilleri, köprü ve tünel kesimleri (`roadProfile.ts`). */
  readonly plan: RoadPlan;
  /** Kent sokakları (ana cadde sınıf 0, diğerleri 1) ve kesilen yolların sokaklara bağlantıları. */
  readonly streetLines: RoadData[];
  readonly joinLines: RoadData[];
  /** Arazi kaplamasında boyanan çizgiler: köprü/tünel olmayan yol kesimleri + sokaklar. */
  readonly paintLines: RoadData[];
  /** Yol + sokak dizini (nesne eleme, insanların yürüyüşü). */
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
    // Yollar: kafes basamakları yumuşatılır, akarsuya paralel kesimler sudan ayrılır (`roadRouting.ts`).
    const smoothed = smoothRoads(data.roads);
    const routed = terrain.nearestWater
      ? separateRoadsFromWater(smoothed, terrain.nearestWater)
      : smoothed;
    // Yol ağı: çıkmazlar budanır, kırsalda tali yol patikaya iner, kopuk parçalar bağlanır (`roadNetwork.ts`).
    const towns: TownDisc[] = data.settlements.map((s) => ({
      ...settlementCenter(s),
      r: footprintRadius(s),
      rank: s.rank,
    }));
    const shaped = shapeRoadNetwork(
      routed,
      towns,
      { ...terrain, bounds: terrain.bounds ?? boundsOf(routed) },
      networkReport,
    );
    const roads = cutRoads(shaped, cuts);
    // Yol profili: eğimi sınırlı, düzgün yatak; dere geçişleri köprü, derin kazılar tünel. Zemin yola uydurulur.
    this.plan = planRoadProfiles(roads, {
      heightAt: terrain.heightAt,
      elevationAt: terrain.elevationAt,
      nearestWater: terrain.nearestWater,
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
        b.base = settledBase(b, terrain);
        this.buildings.push(b);
        this.byId.set(b.id, b);
        const key = this.key(Math.floor(b.x / this.cell), Math.floor(b.z / this.cell));
        const list = this.grid.get(key) ?? [];
        list.push(b);
        this.grid.set(key, list);
      }
    }
    // Kent içinde kesilen yolların uçları sokak ızgarasına bağlanır (yapıların arasından geçen kısa yollar).
    const town = connectTownRoads(roads, streets, data, terrain, this.footprints);
    this.streetLines = town.streets;
    this.joinLines = town.joins;
    this.roadLines = [...roads, ...town.joins, ...town.streets];
    this.paintLines = [...groundRuns(this.plan), ...town.joins, ...town.streets];
    this.roads = new RoadIndex(this.roadLines);
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
    for (const b of this.buildingsNear(x, z, reach + 3)) {
      if (b.kind !== 'fountain') continue;
      const spout = buildingLocalToWorld(b, 0, BUILDING_SHAPES.fountain.depth / 2);
      const distance = Math.hypot(spout.x - x, spout.z - z);
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
