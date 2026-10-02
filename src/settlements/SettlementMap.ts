import { SETTLEMENT_LAYOUT } from '../config';
import type { LandmarkData, RoadData, SettlementData, SettlementsData } from '../data/settlements';
import { BUILDING_SHAPES, isMosque } from './kinds';
import {
  footprintRadius,
  layoutSettlement,
  settlementCenter,
  type Building,
  type LayoutTerrain,
} from './layout';
import { RoadIndex } from './roadIndex';

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
    const inside = (i: number) =>
      circles.some((c) => Math.hypot((xz[i] as number) - c.x, (xz[i + 1] as number) - c.z) < c.r);
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

/** Merdiven eğimi (yükselti / uzunluk) ve en kısa yükselti (altı basamaksız geçilir). */
const STAIR_SLOPE = 0.7;
const STAIR_MIN_RISE = 0.3;

/** Girilebilir/aranabilir yapının kapısı zeminden yüksekse taş merdiven. */
function stairFor(b: Building, terrain: LayoutTerrain): Stair | null {
  const shape = BUILDING_SHAPES[b.kind];
  if (!shape.enterable && !shape.searchable) return null;
  const doorX = shape.door.x;
  const front = shape.depth / 2;
  const start = buildingLocalToWorld(b, doorX, front);
  // Merdivenin ucunda zemin: yükseltiye göre uzunluk, ucun zemini yeniden ölçülür (iki adım yakınsar).
  let rise = b.y - terrain.heightAt(start.x, start.z);
  if (rise < STAIR_MIN_RISE) return null;
  let run = Math.max(1, rise / STAIR_SLOPE);
  for (let k = 0; k < 2; k++) {
    const end = buildingLocalToWorld(b, doorX, front + run);
    rise = Math.max(STAIR_MIN_RISE, b.y - terrain.heightAt(end.x, end.z));
    run = Math.max(1, rise / STAIR_SLOPE);
  }
  return {
    building: b.id,
    x: start.x,
    z: start.z,
    yaw: b.yaw,
    y0: b.y - rise,
    rise,
    run,
    width: shape.enterable ? 2.6 : 1.6,
  };
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
  /** Yol + sokak dizini (nesne eleme, insanların yürüyüşü). */
  readonly roads: RoadIndex;
  /** Kapı önü merdivenleri (görsel + collider). */
  readonly stairs: Stair[] = [];
  private readonly byId = new Map<number, Building>();
  private readonly grid = new Map<string, Building[]>();
  private readonly cell = 64;

  constructor(
    data: SettlementsData,
    terrain: LayoutTerrain,
    seed: number = SETTLEMENT_LAYOUT.seed,
  ) {
    // Il/ilçe merkezlerinin içinde il-ilçe ve köy yolları çizilmez: kentin içi kendi sokak ızgarasıdır.
    const cuts = data.settlements
      .filter((s) => s.rank !== 'koy')
      .map((s) => ({
        ...settlementCenter(s),
        r: footprintRadius(s) * SETTLEMENT_LAYOUT.innerRoadCut,
      }));
    const roads = cutRoads(data.roads, cuts);
    const layoutRoads = new RoadIndex(roads);
    const streets: RoadData[] = [];
    const landmarksOf = new Map<number, LandmarkData[]>();
    for (const lm of data.landmarks) {
      const list = landmarksOf.get(lm.settlement) ?? [];
      list.push(lm);
      landmarksOf.set(lm.settlement, list);
    }
    for (const s of data.settlements) {
      const layout = layoutSettlement(s, landmarksOf.get(s.id) ?? [], terrain, layoutRoads, seed);
      this.settlements.push({ data: s, buildings: layout.buildings, radius: layout.radius });
      for (const xz of layout.streets) streets.push({ cls: 1, xz });
      for (const b of layout.buildings) {
        this.buildings.push(b);
        this.byId.set(b.id, b);
        const key = this.key(Math.floor(b.x / this.cell), Math.floor(b.z / this.cell));
        const list = this.grid.get(key) ?? [];
        list.push(b);
        this.grid.set(key, list);
      }
    }
    this.roadLines = [...roads, ...streets];
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
   * Nesne (ağaç, kaya, bitki) burada çizilmesin mi? Yapı ayak izinde ya da yol üstünde olan nesne gizlenir
   * (kimlikler değişmez; yalnızca görünmez ve toplanamaz olur).
   */
  blocksProp(x: number, z: number): boolean {
    return this.buildingAt(x, z, 0.8) !== null || this.roads.onRoad(x, z, 0.4);
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
