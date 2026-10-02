import { FRESH_WATER, ROADS } from '../config';
import type { RoadClass, RoadData, SettlementRank } from '../data/settlements';
import { findRoute, MinHeap, type RouteField } from './routeFinder';
import type { NearestWater } from './roadRouting';

/**
 * Yol ağı düzeni (saf): veri yollarından **seyrek ve bağlı bir omurga** seçer. Ham veri (OSM türevi) her sokağı, çift
 * şeritli yolun iki yönünü, kavşak kollarını, göbekleri ve ormandaki sayısız toprak yolu ayrı çizgi olarak taşır;
 * hepsini çizmek parça parça, birbirine değmeyen, ikiz ve halkalı bir ağ verir. Bunun yerine:
 *
 * 1. Veri yolları kavşaklarında bölünür, kopuk uçlar yakındaki yola eklenir; düğümlü çizge kurulur.
 * 2. **Anayol:** il ve ilçe merkezleri (ve dünya kenarından çıkan anayollar) çizgede en kısa yollarla birbirine
 *    bağlanır: en küçük kapsayan ağaç + çok dolaşan çiftlere ek bağlantı (seyrek "örücü").
 * 3. **Köy yolu:** her köy ağa en kısa yoldan bağlanır (ağ büyüdükçe en yakın köy önce; Prim benzeri). Çizgede yolu
 *    olmayan köy en yakın yola A* ile bağlanır. Dik arazide giden bağlantı **dağ patikasıdır**.
 * 4. **Dağ patikası:** komşu köyler arasında ağ çok dolaşıyorsa (dağın etrafından) veri yolundan kısa bir patika eklenir.
 * 5. Temizlik: aynı sınıftaki zincirler birleşir; kısa halkalar (göbek, kavşak kolu, çift şeritli yolun ikizi)
 *    çözülür; hiçbir yere varmayan kısa uçlar silinir.
 *
 * Sonuç: her yol bir yerleşimden bir yerleşime (ya da dünya kenarına) gider; ağ tek parçadır.
 */

/** Yerleşim diski: yol ağının bağladığı yer. */
export interface TownDisc {
  x: number;
  z: number;
  /** Büyütülmüş ayak izi yarıçapı (oyun m). */
  r: number;
  rank: SettlementRank;
}

/** Ağ düzeninin okuduğu arazi sorguları. */
export interface NetworkTerrain {
  heightAt(x: number, z: number): number;
  /** Gerçek rakım (m; deniz ≤ 0). */
  elevationAt(x: number, z: number): number;
  /** Varsa tatlı su sorgusu: göl/gölet geçilemez, akarsu geçişi köprü maliyetlidir. */
  nearestWater?: NearestWater;
  /** Dünya kenarı (yollar orada kesilmiştir). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Düzenin sayımları (test ve ölçüm). */
export interface NetworkReport {
  /** Veri yolu çizgisi ve çizge kenarı sayısı. */
  edgesIn: number;
  graphEdges: number;
  /** Çıkan çizgi sayısı. */
  edgesOut: number;
  /** Anayol bağlantıları (il/ilçe çifti) ve dünya kenarı çıkışları. */
  trunkLinks: number;
  exits: number;
  /** Çizgeden ağa bağlanan yerleşim, A* ile bağlanan yerleşim, bağlanamayan yerleşim. */
  townLinks: number;
  routedLinks: number;
  unlinked: number;
  /** Ağ bileşenlerini birleştiren bağlantı. */
  componentLinks: number;
  /** Köy merkezine eklenen giriş yolu. */
  villageSpurs: number;
  /** Eklenen dağ patikası. */
  trails: number;
  /** Çözülen halka (göbek, ayrım), çökertilen ikiz şerit ve silinen kısa uç. */
  loopsRemoved: number;
  twinsRemoved: number;
  spursRemoved: number;
}

export function emptyNetworkReport(): NetworkReport {
  return {
    edgesIn: 0,
    graphEdges: 0,
    edgesOut: 0,
    trunkLinks: 0,
    exits: 0,
    townLinks: 0,
    routedLinks: 0,
    unlinked: 0,
    villageSpurs: 0,
    componentLinks: 0,
    trails: 0,
    loopsRemoved: 0,
    twinsRemoved: 0,
    spursRemoved: 0,
  };
}

const WATER_AREA = new Set(['lake', 'reservoir', 'pond', 'water']);

/** Çizgi uzunluğu (oyun m). */
export function pathLength(pts: ArrayLike<number>): number {
  let l = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    l += Math.hypot(
      (pts[i + 2] as number) - (pts[i] as number),
      (pts[i + 3] as number) - (pts[i + 1] as number),
    );
  }
  return l;
}

/** Çizgi üzerinde en çok `step` aralıklı noktalar (ilk ve son dahil). */
export function samplePath(pts: ArrayLike<number>, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const ax = pts[i] as number;
    const az = pts[i + 1] as number;
    if (i + 3 >= pts.length) {
      out.push(ax, az);
      break;
    }
    const bx = pts[i + 2] as number;
    const bz = pts[i + 3] as number;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
  }
  return out;
}

/** Noktanın parçaya izdüşümü: [t, x, z, uzaklık²]. */
function project(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): [number, number, number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  const x = ax + t * dx;
  const z = az + t * dz;
  return [t, x, z, (px - x) ** 2 + (pz - z) ** 2];
}

const gridKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

export interface SplitOptions {
  /** Yalnızca bu dizin ve sonrasındaki yolların uçları denetlenir (yeni eklenen yollar). */
  focusFrom?: number;
  /** Uç, başka yolun gövdesine bu kadar (oyun m) yakınsa yol orada bölünür. */
  snap?: number;
  /** Aynı sınıftaki yollar da bölünsün mü (veri hattı aynı sınıfı zaten böler). */
  sameClass?: boolean;
  /** Varsa yalnızca bu uçlar denetlenir (yol dizini, 0 = baş / 1 = son). */
  endFilter?: (road: number, end: 0 | 1) => boolean;
}

/**
 * Yolların uç noktaları başka bir yolun gövdesine değiyorsa o yolu orada böler (T kavşağı) ve ucu kavşağa taşır.
 * Arama, yol boyunca örnek hücrelerin ızgarasıyla daraltılır.
 */
export function splitAtJunctions(
  roads: readonly RoadData[],
  options: SplitOptions = {},
): RoadData[] {
  const focusFrom = options.focusFrom ?? 0;
  const snap = options.snap ?? ROADS.junctionSnap;
  const sameClass = options.sameClass ?? focusFrom > 0;
  const cellSize = 48;
  const cells = new Map<number, number[]>();
  const bounds = new Float32Array(roads.length * 4);
  roads.forEach((road, ri) => {
    const xz = road.xz;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i + 1 < xz.length; i += 2) {
      x0 = Math.min(x0, xz[i] as number);
      x1 = Math.max(x1, xz[i] as number);
      z0 = Math.min(z0, xz[i + 1] as number);
      z1 = Math.max(z1, xz[i + 1] as number);
    }
    bounds.set([x0 - snap, x1 + snap, z0 - snap, z1 + snap], ri * 4);
    const seen = new Set<number>();
    const mark = (x: number, z: number) => {
      const k = gridKey(Math.floor(x / cellSize), Math.floor(z / cellSize));
      if (seen.has(k)) return;
      seen.add(k);
      const list = cells.get(k);
      if (list) list.push(ri);
      else cells.set(k, [ri]);
    };
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const ax = xz[i] as number;
      const az = xz[i + 1] as number;
      const bx = xz[i + 2] as number;
      const bz = xz[i + 3] as number;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (cellSize / 2)));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        mark(ax + (bx - ax) * t, az + (bz - az) * t);
      }
    }
    if (xz.length === 2) mark(xz[0] as number, xz[1] as number);
  });

  const pts = roads.map((r) => Array.from(r.xz));
  const splits = new Map<number, Array<{ seg: number; t: number; x: number; z: number }>>();
  const snap2 = snap ** 2;
  const node2 = ROADS.nodeSnap ** 2;
  const reach = Math.ceil(snap / cellSize);
  for (let ri = focusFrom; ri < roads.length; ri++) {
    const own = pts[ri] as number[];
    for (const end of [0, own.length - 2]) {
      if (options.endFilter && !options.endFilter(ri, end === 0 ? 0 : 1)) continue;
      const px = own[end] as number;
      const pz = own[end + 1] as number;
      let best: { rj: number; seg: number; t: number; x: number; z: number; d2: number } | null =
        null;
      const candidates = new Set<number>();
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
          for (const rj of cells.get(
            gridKey(Math.floor(px / cellSize) + dx, Math.floor(pz / cellSize) + dz),
          ) ?? []) {
            candidates.add(rj);
          }
        }
      }
      for (const rj of candidates) {
        if (rj === ri) continue;
        if (!sameClass && roads[rj]!.cls === roads[ri]!.cls) continue;
        if (
          px < (bounds[rj * 4] as number) ||
          px > (bounds[rj * 4 + 1] as number) ||
          pz < (bounds[rj * 4 + 2] as number) ||
          pz > (bounds[rj * 4 + 3] as number)
        ) {
          continue;
        }
        const other = roads[rj]!.xz;
        for (let seg = 0; seg + 1 < other.length / 2; seg++) {
          const ax = other[seg * 2] as number;
          const az = other[seg * 2 + 1] as number;
          const bx = other[seg * 2 + 2] as number;
          const bz = other[seg * 2 + 3] as number;
          if (
            px < Math.min(ax, bx) - snap ||
            px > Math.max(ax, bx) + snap ||
            pz < Math.min(az, bz) - snap ||
            pz > Math.max(az, bz) + snap
          ) {
            continue;
          }
          const [t, x, z, d2] = project(px, pz, ax, az, bx, bz);
          if (d2 <= snap2 && (best === null || d2 < best.d2)) best = { rj, seg, t, x, z, d2 };
        }
      }
      if (!best) continue;
      const other = roads[best.rj]!.xz;
      // Karşı yolun ucuna yakınsa uç oraya taşınır (düğüm eşleştirmesi bağlar; bölmeye gerek yok).
      const nearEnd = [0, other.length - 2].find(
        (e) =>
          ((other[e] as number) - best!.x) ** 2 + ((other[e + 1] as number) - best!.z) ** 2 <=
          Math.max(node2, snap2 * 0.25),
      );
      if (nearEnd !== undefined) {
        own[end] = other[nearEnd] as number;
        own[end + 1] = other[nearEnd + 1] as number;
        continue;
      }
      own[end] = best.x;
      own[end + 1] = best.z;
      const list = splits.get(best.rj) ?? [];
      list.push({ seg: best.seg, t: best.t, x: best.x, z: best.z });
      splits.set(best.rj, list);
    }
  }

  const out: RoadData[] = [];
  roads.forEach((road, ri) => {
    const p = pts[ri] as number[];
    const list = splits.get(ri);
    if (!list) {
      out.push({ cls: road.cls, xz: Float32Array.from(p) });
      return;
    }
    list.sort((a, b) => a.seg - b.seg || a.t - b.t);
    let run: number[] = [p[0] as number, p[1] as number];
    let li = 0;
    for (let s = 0; s + 1 < p.length / 2; s++) {
      while (li < list.length && (list[li] as { seg: number }).seg === s) {
        const sp = list[li] as { x: number; z: number };
        run.push(sp.x, sp.z);
        if (run.length >= 4) out.push({ cls: road.cls, xz: Float32Array.from(run) });
        run = [sp.x, sp.z];
        li++;
      }
      run.push(p[(s + 1) * 2] as number, p[(s + 1) * 2 + 1] as number);
    }
    if (run.length >= 4) out.push({ cls: road.cls, xz: Float32Array.from(run) });
  });
  return out;
}

/** Yol uçlarını `nodeSnap` içinde aynı düğüme toplar (uzamsal ızgara). */
export class NodeIndex {
  readonly nodes: Array<{ x: number; z: number }> = [];
  private readonly grid = new Map<number, number[]>();
  private readonly cell = 8;

  /** (x, z)'ye `nodeSnap` içindeki düğüm; yoksa yeni düğüm açar. */
  node(x: number, z: number): number {
    const found = this.find(x, z);
    if (found >= 0) return found;
    const id = this.nodes.push({ x, z }) - 1;
    const k = gridKey(Math.floor(x / this.cell), Math.floor(z / this.cell));
    const list = this.grid.get(k);
    if (list) list.push(id);
    else this.grid.set(k, [id]);
    return id;
  }

  /** (x, z)'ye `nodeSnap` içindeki düğüm; yoksa −1. */
  find(x: number, z: number): number {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    const r2 = ROADS.nodeSnap ** 2;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const id of this.grid.get(gridKey(cx + dx, cz + dz)) ?? []) {
          const n = this.nodes[id] as { x: number; z: number };
          if ((n.x - x) ** 2 + (n.z - z) ** 2 <= r2) return id;
        }
      }
    }
    return -1;
  }

  /** (x, z)'ye `radius` içindeki düğümler ve uzaklıkları. */
  within(x: number, z: number, radius: number): Array<{ id: number; d: number }> {
    const out: Array<{ id: number; d: number }> = [];
    const c0x = Math.floor((x - radius) / this.cell);
    const c1x = Math.floor((x + radius) / this.cell);
    const c0z = Math.floor((z - radius) / this.cell);
    const c1z = Math.floor((z + radius) / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        for (const id of this.grid.get(gridKey(cx, cz)) ?? []) {
          const n = this.nodes[id] as { x: number; z: number };
          const d = Math.hypot(n.x - x, n.z - z);
          if (d <= radius) out.push({ id, d });
        }
      }
    }
    return out;
  }
}

/** Yol noktası dizini (bağlantı için en yakın başka bileşen noktası). */
export class PointIndex {
  private readonly cells = new Map<
    number,
    Array<{ x: number; z: number; comp: number; cls: RoadClass }>
  >();
  private readonly cell = 24;

  add(x: number, z: number, comp: number, cls: RoadClass): void {
    const k = gridKey(Math.floor(x / this.cell), Math.floor(z / this.cell));
    const list = this.cells.get(k);
    const item = { x, z, comp, cls };
    if (list) list.push(item);
    else this.cells.set(k, [item]);
  }

  /** `comp` dışındaki en yakın nokta (`radius` içinde); yoksa null. */
  nearestOther(
    x: number,
    z: number,
    comp: number,
    radius: number,
  ): { x: number; z: number; d: number; cls: RoadClass; comp: number } | null {
    let best: { x: number; z: number; d: number; cls: RoadClass; comp: number } | null = null;
    const c0x = Math.floor((x - radius) / this.cell);
    const c1x = Math.floor((x + radius) / this.cell);
    const c0z = Math.floor((z - radius) / this.cell);
    const c1z = Math.floor((z + radius) / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        for (const p of this.cells.get(gridKey(cx, cz)) ?? []) {
          if (p.comp === comp) continue;
          const d = Math.hypot(p.x - x, p.z - z);
          if (d <= radius && (best === null || d < best.d))
            best = { x: p.x, z: p.z, d, cls: p.cls, comp: p.comp };
        }
      }
    }
    return best;
  }

  nearest(
    x: number,
    z: number,
    radius: number,
  ): { x: number; z: number; d: number; cls: RoadClass; comp: number } | null {
    return this.nearestOther(x, z, -1, radius);
  }
}

/** Arazi eğimi + dere geçişi + göl/deniz yasağından rota maliyet alanı. */
export function terrainRouteField(terrain: NetworkTerrain): RouteField {
  const probe = 2;
  return {
    cost(x, z) {
      if (terrain.elevationAt(x, z) < 2) return Number.POSITIVE_INFINITY; // deniz/kıyı
      let m = 1;
      const hit = terrain.nearestWater?.(x, z, 3.5) ?? null;
      if (hit) {
        if (WATER_AREA.has(hit.kind)) {
          if (hit.distance < 0.5) return Number.POSITIVE_INFINITY;
        } else {
          const half = ((FRESH_WATER.lineWidth as Record<string, number>)[hit.kind] ?? 1.2) / 2;
          if (hit.distance <= half + 1) m += ROADS.routeBridgeCost; // dere: köprü
        }
      }
      const gx = (terrain.heightAt(x + probe, z) - terrain.heightAt(x - probe, z)) / (2 * probe);
      const gz = (terrain.heightAt(x, z + probe) - terrain.heightAt(x, z - probe)) / (2 * probe);
      const grade = Math.hypot(gx, gz) / ROADS.routeSlopeScale;
      return m + grade * grade;
    },
  };
}

/** Çizge kenarı: veri yolu parçası (kavşaktan kavşağa). */
interface GraphEdge {
  /** Veri sınıfı (0 anayol, 1 il-ilçe, 2 köy yolu). */
  data: RoadClass;
  pts: number[];
  a: number;
  b: number;
  len: number;
  /** Uzunluk ağırlıklı ortalama arazi eğimi (derece). */
  slope: number;
  /** Seçilen sınıf; seçilmediyse −1. */
  sel: number;
  alive: boolean;
}

/** Düğümlü çizge: yol uçları `nodeSnap` içinde aynı düğümdür. */
class RoadGraph {
  readonly index = new NodeIndex();
  readonly edges: GraphEdge[] = [];
  readonly adj: number[][] = [];

  constructor(private readonly slopeOf: (pts: readonly number[]) => number) {}

  get nodes(): Array<{ x: number; z: number }> {
    return this.index.nodes;
  }

  node(x: number, z: number): number {
    const before = this.index.nodes.length;
    const id = this.index.node(x, z);
    if (this.index.nodes.length > before) this.adj.push([]);
    return id;
  }

  addEdge(data: RoadClass, pts: number[], sel = -1): number | null {
    if (pts.length < 4) return null;
    const a = this.node(pts[0] as number, pts[1] as number);
    const b = this.node(pts[pts.length - 2] as number, pts[pts.length - 1] as number);
    const len = pathLength(pts);
    if (a === b && len < ROADS.nodeSnap * 3) return null;
    const id =
      this.edges.push({ data, pts, a, b, len, slope: this.slopeOf(pts), sel, alive: true }) - 1;
    (this.adj[a] as number[]).push(id);
    (this.adj[b] as number[]).push(id);
    return id;
  }

  /** Kenarı (x, z)'ye en yakın noktasından ikiye böler; ortadaki düğümü döndürür. */
  splitEdge(id: number, x: number, z: number): number {
    const e = this.edges[id] as GraphEdge;
    let best = { seg: 0, t: 0, x: e.pts[0] as number, z: e.pts[1] as number, d2: Infinity };
    for (let seg = 0; seg + 3 < e.pts.length; seg += 2) {
      const [t, px, pz, d2] = project(
        x,
        z,
        e.pts[seg] as number,
        e.pts[seg + 1] as number,
        e.pts[seg + 2] as number,
        e.pts[seg + 3] as number,
      );
      if (d2 < best.d2) best = { seg, t, x: px, z: pz, d2 };
    }
    const existing = this.index.find(best.x, best.z);
    if (existing === e.a || existing === e.b) return existing;
    const first = [...e.pts.slice(0, best.seg + 2), best.x, best.z];
    const second = [best.x, best.z, ...e.pts.slice(best.seg + 2)];
    if (pathLength(first) < 0.5) return e.a;
    if (pathLength(second) < 0.5) return e.b;
    e.alive = false;
    const id1 = this.addEdge(e.data, first, e.sel);
    const id2 = this.addEdge(e.data, second, e.sel);
    const mid = this.index.find(best.x, best.z);
    if (id1 === null || id2 === null || mid < 0) {
      e.alive = true;
      if (id1 !== null) (this.edges[id1] as GraphEdge).alive = false;
      if (id2 !== null) (this.edges[id2] as GraphEdge).alive = false;
      return Math.hypot(x - this.nodes[e.a]!.x, z - this.nodes[e.a]!.z) <
        Math.hypot(x - this.nodes[e.b]!.x, z - this.nodes[e.b]!.z)
        ? e.a
        : e.b;
    }
    return mid;
  }

  liveEdgesAt(n: number): number[] {
    return (this.adj[n] as number[]).filter((id) => (this.edges[id] as GraphEdge).alive);
  }
}

/** Kenar dizini: (x, z)'ye en yakın kenar noktası (kenar kimliğiyle). */
class EdgePointIndex {
  private readonly cells = new Map<number, Array<{ x: number; z: number; edge: number }>>();
  private readonly cell = 24;

  add(graph: RoadGraph, edge: number): void {
    const sp = samplePath((graph.edges[edge] as GraphEdge).pts, 6);
    for (let i = 0; i + 1 < sp.length; i += 2) {
      const x = sp[i] as number;
      const z = sp[i + 1] as number;
      const k = gridKey(Math.floor(x / this.cell), Math.floor(z / this.cell));
      const list = this.cells.get(k);
      const item = { x, z, edge };
      if (list) list.push(item);
      else this.cells.set(k, [item]);
    }
  }

  nearest(
    graph: RoadGraph,
    x: number,
    z: number,
    radius: number,
    accept: (e: GraphEdge) => boolean,
  ): { x: number; z: number; d: number; edge: number } | null {
    let best: { x: number; z: number; d: number; edge: number } | null = null;
    const c0x = Math.floor((x - radius) / this.cell);
    const c1x = Math.floor((x + radius) / this.cell);
    const c0z = Math.floor((z - radius) / this.cell);
    const c1z = Math.floor((z + radius) / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        for (const p of this.cells.get(gridKey(cx, cz)) ?? []) {
          const e = graph.edges[p.edge] as GraphEdge;
          if (!e.alive || !accept(e)) continue;
          const d = Math.hypot(p.x - x, p.z - z);
          if (d <= radius && (best === null || d < best.d)) best = { ...p, d };
        }
      }
    }
    return best;
  }
}

/** Dijkstra durumu (artımlı kullanılabilir: yeni kaynaklar 0 maliyetle eklenip yeniden gevşetilir). */
class ShortestPaths {
  readonly dist: Float64Array;
  readonly prev: Int32Array;
  private readonly heap = new MinHeap();

  constructor(
    private readonly graph: RoadGraph,
    private readonly weight: (e: GraphEdge) => number,
    private readonly limit: number,
  ) {
    this.dist = new Float64Array(graph.nodes.length).fill(Number.POSITIVE_INFINITY);
    this.prev = new Int32Array(graph.nodes.length).fill(-1);
  }

  source(node: number, cost: number): void {
    if (cost < (this.dist[node] as number)) {
      this.dist[node] = cost;
      this.prev[node] = -1;
      this.heap.push(cost, node);
    }
  }

  run(): void {
    const { dist, prev, graph } = this;
    while (this.heap.size > 0) {
      const d0 = this.heap.peekKey();
      const n = this.heap.pop();
      if (d0 > (dist[n] as number)) continue;
      for (const id of graph.adj[n] as number[]) {
        const e = graph.edges[id] as GraphEdge;
        if (!e.alive) continue;
        const w = this.weight(e);
        if (!Number.isFinite(w)) continue;
        const m = e.a === n ? e.b : e.a;
        const nd = d0 + w;
        if (nd < (dist[m] as number) && nd <= this.limit) {
          dist[m] = nd;
          prev[m] = id;
          this.heap.push(nd, m);
        }
      }
    }
  }

  /** Düğümden kaynağa kadar kenarlar (kaynak düğümde biter). */
  pathTo(node: number): number[] {
    const out: number[] = [];
    let n = node;
    for (let guard = 0; guard < 1_000_000 && (this.prev[n] as number) >= 0; guard++) {
      const id = this.prev[n] as number;
      out.push(id);
      const e = this.graph.edges[id] as GraphEdge;
      n = e.a === n ? e.b : e.a;
    }
    return out;
  }
}

/** Yerleşimin çizgeye bağlanabileceği düğümler (merkeze yakın olan ucuz). */
interface Attach {
  node: number;
  cost: number;
}

function reversePts(pts: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i] as number, pts[i + 1] as number);
  return out;
}

/**
 * Çift şeritli yolun öbür yönü ve kavşak kolları (veri, seçimden önce): anayol çizgisinin örneklerinin en az
 * `twinShare` oranı, başka bir (en az kendisi kadar önemli, hâlâ duran) yola `twinDistance` içinde ve paralelse çizgi
 * atılır. Dönüş: kalan çizgiler ve atılan çizgilerin uçları (yan yollar sonra kalan şeride bağlanır).
 */
export function dropTwins(roads: readonly RoadData[]): {
  kept: RoadData[];
  droppedEnds: Array<{ x: number; z: number }>;
} {
  const cell = 16;
  const step = ROADS.twinSample;
  const angleAt = (sp: readonly number[], i: number) => {
    const j = Math.min(i + 2, sp.length - 2);
    const k = Math.max(0, i - 2);
    return Math.atan2(
      (sp[j + 1] as number) - (sp[k + 1] as number),
      (sp[j] as number) - (sp[k] as number),
    );
  };
  const samples = roads.map((r) => samplePath(r.xz, step));
  const cells = new Map<number, Array<{ x: number; z: number; a: number; id: number }>>();
  samples.forEach((sp, id) => {
    for (let i = 0; i + 1 < sp.length; i += 2) {
      const x = sp[i] as number;
      const z = sp[i + 1] as number;
      const k = gridKey(Math.floor(x / cell), Math.floor(z / cell));
      const item = { x, z, a: angleAt(sp, i), id };
      const list = cells.get(k);
      if (list) list.push(item);
      else cells.set(k, [item]);
    }
  });
  // Uç uca devam eden parçalar (aynı yolun komşu kesimleri) ikiz sayılmaz: ortak uçlu çizgiler.
  const nodes = new NodeIndex();
  const byNode = new Map<number, number[]>();
  const endNodes = roads.map((r, id) =>
    [0, r.xz.length - 2].map((at) => {
      const n = nodes.node(r.xz[at] as number, r.xz[at + 1] as number);
      const list = byNode.get(n) ?? [];
      list.push(id);
      byNode.set(n, list);
      return n;
    }),
  );
  const neighbors = (id: number): Set<number> => {
    const out = new Set<number>();
    for (const n of endNodes[id] as number[]) for (const o of byNode.get(n) ?? []) out.add(o);
    return out;
  };
  const alive = new Uint8Array(roads.length).fill(1);
  const share = (id: number): number => {
    const adjacent = neighbors(id);
    const road = roads[id] as RoadData;
    const sp = samples[id] as number[];
    let hits = 0;
    let n = 0;
    for (let i = 0; i + 1 < sp.length; i += 2) {
      const x = sp[i] as number;
      const z = sp[i + 1] as number;
      const a = angleAt(sp, i);
      n++;
      let found = false;
      for (let dx = -1; dx <= 1 && !found; dx++) {
        for (let dz = -1; dz <= 1 && !found; dz++) {
          for (const p of cells.get(
            gridKey(Math.floor(x / cell) + dx, Math.floor(z / cell) + dz),
          ) ?? []) {
            if (adjacent.has(p.id) || !alive[p.id] || (roads[p.id] as RoadData).cls > road.cls)
              continue;
            const d = Math.hypot(p.x - x, p.z - z);
            if (d > ROADS.twinDistance) continue;
            let da = Math.abs(p.a - a) % Math.PI;
            if (da > Math.PI / 2) da = Math.PI - da;
            if (da < ROADS.twinAngle) {
              found = true;
              break;
            }
          }
        }
      }
      if (found) hits++;
    }
    return n > 0 ? hits / n : 0;
  };
  // Kısa olanlar önce: kavşak kolları ve parçalı şeritler uzun ikizin yanında atılır.
  const order = roads
    .map((r, id) => ({ id, len: pathLength(r.xz), cls: r.cls }))
    .filter((o) => o.cls === 0)
    .sort((p, q) => p.len - q.len || p.id - q.id);
  const droppedEnds: Array<{ x: number; z: number }> = [];
  for (const { id } of order) {
    if (share(id) < ROADS.twinShare) continue;
    alive[id] = 0;
    const xz = (roads[id] as RoadData).xz;
    droppedEnds.push(
      { x: xz[0] as number, z: xz[1] as number },
      { x: xz[xz.length - 2] as number, z: xz[xz.length - 1] as number },
    );
  }
  return { kept: roads.filter((_, id) => alive[id] === 1), droppedEnds };
}

/** Ağ düzeni: bkz. dosya başı. `roads` veri yollarıdır (yumuşatılmamış olabilir). */
export function buildRoadNetwork(
  roads: readonly RoadData[],
  towns: readonly TownDisc[],
  terrain: NetworkTerrain,
  report?: NetworkReport,
): RoadData[] {
  const stats = report ?? emptyNetworkReport();
  stats.edgesIn = roads.length;
  const { bounds } = terrain;
  const nearBounds = (x: number, z: number) =>
    x < bounds.minX + ROADS.boundsMargin ||
    x > bounds.maxX - ROADS.boundsMargin ||
    z < bounds.minZ + ROADS.boundsMargin ||
    z > bounds.maxZ - ROADS.boundsMargin;
  const field = terrainRouteField(terrain);
  const slopeOf = (pts: readonly number[]): number => {
    const sp = samplePath(pts, 8);
    let sum = 0;
    let n = 0;
    for (let i = 0; i + 1 < sp.length; i += 2) {
      const x = sp[i] as number;
      const z = sp[i + 1] as number;
      const gx = (terrain.heightAt(x + 2, z) - terrain.heightAt(x - 2, z)) / 4;
      const gz = (terrain.heightAt(x, z + 2) - terrain.heightAt(x, z - 2)) / 4;
      sum += (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
      n++;
    }
    return n > 0 ? sum / n : 0;
  };

  // 1. Çizge: farklı sınıfların T kavşakları bölünür; çift şeritli yolun öbür yönü ve kavşak kolları atılır (onlara
  // bağlı yan yollar kalan şeride eklenir); boşta kalan uçlar yakındaki yola (her sınıf) eklenir.
  let split = splitAtJunctions(roads);
  {
    const { kept, droppedEnds } = dropTwins(split);
    stats.twinsRemoved = split.length - kept.length;
    const orphan = new NodeIndex();
    for (const p of droppedEnds) orphan.node(p.x, p.z);
    const ends = new NodeIndex();
    const count: number[] = [];
    const endIds = kept.map((r) => {
      const ids = [0, r.xz.length - 2].map((at) => {
        const id = ends.node(r.xz[at] as number, r.xz[at + 1] as number);
        count[id] = (count[id] ?? 0) + 1;
        return id;
      });
      return ids as [number, number];
    });
    split = splitAtJunctions(kept, {
      snap: ROADS.twinDistance * 1.4,
      sameClass: true,
      endFilter: (ri, end) => {
        if (count[(endIds[ri] as [number, number])[end]] !== 1) return false;
        const xz = (kept[ri] as RoadData).xz;
        const at = end === 0 ? 0 : xz.length - 2;
        return orphan.find(xz[at] as number, xz[at + 1] as number) >= 0;
      },
    });
  }
  {
    const ends = new NodeIndex();
    const count: number[] = [];
    const endIds = split.map((r) => {
      const ids = [0, r.xz.length - 2].map((at) => {
        const id = ends.node(r.xz[at] as number, r.xz[at + 1] as number);
        count[id] = (count[id] ?? 0) + 1;
        return id;
      });
      return ids as [number, number];
    });
    split = splitAtJunctions(split, {
      snap: ROADS.gapSnap,
      sameClass: true,
      endFilter: (ri, end) => count[(endIds[ri] as [number, number])[end]] === 1,
    });
  }
  const g = new RoadGraph(slopeOf);
  for (const road of split) g.addEdge(road.cls, Array.from(road.xz));
  stats.graphEdges = g.edges.length;
  const edgeIndex = new EdgePointIndex();
  for (let id = 0; id < g.edges.length; id++) edgeIndex.add(g, id);

  // Yerleşimin bağlanma düğümleri. Diskin içinden geçen ama düğümü olmayan yol merkeze en yakın noktasında bölünür.
  const attachOf = (t: TownDisc): Attach[] => {
    const inner = t.r + ROADS.attachPad;
    let list = g.index.within(t.x, t.z, inner).map(({ id, d }) => ({
      node: id,
      cost: d * ROADS.attachCostFactor,
    }));
    if (list.length === 0) {
      const hit = edgeIndex.nearest(g, t.x, t.z, inner, () => true);
      if (hit) {
        const node = g.splitEdge(hit.edge, hit.x, hit.z);
        for (const id of g.liveEdgesAt(node)) edgeIndex.add(g, id);
        list = [{ node, cost: hit.d * ROADS.attachCostFactor }];
      }
    }
    return list.filter((a) => g.liveEdgesAt(a.node).length > 0);
  };
  const isBig = (t: TownDisc) => t.rank !== 'koy';
  const attaches = towns.map(attachOf);

  const slopePenalty = (e: GraphEdge) => 1 + (e.slope / ROADS.slopePenaltyDeg) ** 2;
  const trunkWeight = (e: GraphEdge) =>
    e.len * (ROADS.trunkClassCost[e.data] as number) * slopePenalty(e);
  const localWeight = (e: GraphEdge) =>
    e.len * (ROADS.localClassCost[e.data] as number) * slopePenalty(e);

  const select = (ids: readonly number[], cls: RoadClass): void => {
    for (const id of ids) {
      const e = g.edges[id] as GraphEdge;
      if (e.sel < 0 || cls < e.sel) e.sel = cls;
    }
  };

  // 2. Anayol: il/ilçe merkezleri arası en kısa yollar (en küçük kapsayan ağaç + çok dolaşan çiftlere ek bağlantı).
  const big = towns.map((_, i) => i).filter((i) => isBig(towns[i] as TownDisc));
  type Pair = { i: number; j: number; cost: number; path: number[] };
  const pairs: Pair[] = [];
  for (const i of big) {
    const ti = towns[i] as TownDisc;
    const near = big
      .filter((j) => j !== i)
      .map((j) => ({ j, d: Math.hypot(towns[j]!.x - ti.x, towns[j]!.z - ti.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, ROADS.trunkNeighbors);
    if (near.length === 0 || (attaches[i] as Attach[]).length === 0) continue;
    const sp = new ShortestPaths(g, trunkWeight, ROADS.trunkMaxCost);
    for (const a of attaches[i] as Attach[]) sp.source(a.node, a.cost);
    sp.run();
    for (const { j } of near) {
      let best: { cost: number; node: number } | null = null;
      for (const a of attaches[j] as Attach[]) {
        const c = (sp.dist[a.node] as number) + a.cost;
        if (Number.isFinite(c) && (best === null || c < best.cost))
          best = { cost: c, node: a.node };
      }
      if (best) pairs.push({ i, j, cost: best.cost, path: sp.pathTo(best.node) });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost);
  {
    const parent = towns.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i] as number] as number;
      return i;
    };
    const rest: Pair[] = [];
    for (const p of pairs) {
      const a = find(p.i);
      const b = find(p.j);
      if (a === b) {
        rest.push(p);
        continue;
      }
      parent[a] = b;
      select(p.path, 0);
      stats.trunkLinks++;
    }
    // Örücü: seçili ağda iki merkez arası, doğrudan en kısa yolun `trunkDetour` katından uzunsa ek bağlantı.
    const onNetwork = (e: GraphEdge) => (e.sel === 0 ? trunkWeight(e) : Number.POSITIVE_INFINITY);
    for (const p of rest) {
      if (p.i > p.j && rest.some((q) => q.i === p.j && q.j === p.i)) continue;
      const sp = new ShortestPaths(g, onNetwork, p.cost * ROADS.trunkDetour);
      for (const a of attaches[p.i] as Attach[]) sp.source(a.node, a.cost);
      sp.run();
      const reached = (attaches[p.j] as Attach[]).some((a) =>
        Number.isFinite((sp.dist[a.node] as number) + a.cost),
      );
      if (!reached) {
        select(p.path, 0);
        stats.trunkLinks++;
      }
    }
  }

  // 3. Ağa bağlanacak yerler: köyler, anayola bağlanamayan il/ilçe merkezleri, dünya kenarından çıkan anayollar.
  interface Target {
    attach: Attach[];
    cls: RoadClass;
    town: TownDisc | null;
  }
  const targets: Target[] = [];
  const networkNodes = (): number[] => {
    const set = new Set<number>();
    for (const e of g.edges) {
      if (!e.alive || e.sel < 0) continue;
      set.add(e.a);
      set.add(e.b);
    }
    return [...set];
  };
  const reachedTowns = new Set<number>();
  {
    const nodes = new Set(networkNodes());
    towns.forEach((t, i) => {
      const at = attaches[i] as Attach[];
      if (isBig(t) && at.some((a) => nodes.has(a.node))) reachedTowns.add(i);
    });
  }
  towns.forEach((t, i) => {
    if (reachedTowns.has(i)) return;
    targets.push({ attach: attaches[i] as Attach[], cls: isBig(t) ? 0 : 1, town: t });
  });
  {
    // Dünya kenarındaki anayol uçları (kümelenmiş): komşu illere giden yollar.
    const exits: Array<{ x: number; z: number; node: number }> = [];
    for (let n = 0; n < g.nodes.length; n++) {
      const live = g.liveEdgesAt(n);
      if (live.length !== 1) continue;
      const node = g.nodes[n] as { x: number; z: number };
      if (!nearBounds(node.x, node.z)) continue;
      if ((g.edges[live[0] as number] as GraphEdge).data !== 0) continue;
      if (exits.some((e) => Math.hypot(e.x - node.x, e.z - node.z) < ROADS.exitCluster)) continue;
      exits.push({ ...node, node: n });
    }
    for (const exit of exits)
      targets.push({ attach: [{ node: exit.node, cost: 0 }], cls: 0, town: null });
    stats.exits = exits.length;
  }

  // Ağ boşsa (anayolu olmayan bölge) en büyük yerleşim tohum olur.
  let seeds = networkNodes();
  if (seeds.length === 0 && targets.length > 0) {
    const first = targets.findIndex((t) => t.town !== null && t.attach.length > 0);
    if (first >= 0) {
      const seed = targets[first] as Target;
      seeds = seed.attach.map((a) => a.node);
      // Tohum yerleşimin içinden geçen yollar ağın ilk parçasıdır (başka yerleşim ona bağlanabilsin).
      for (const n of seeds) select(g.liveEdgesAt(n), seed.cls);
      targets.splice(first, 1);
    }
  }

  // Prim benzeri büyüme: ağa en ucuz bağlanan hedef önce; yeni ağ düğümleri kaynak olur.
  const grow = new ShortestPaths(g, localWeight, ROADS.linkMaxCost);
  for (const n of seeds) grow.source(n, 0);
  const pending = new Set(targets.map((_, i) => i));
  const villagePaths: Array<{ ids: number[]; target: Target }> = [];
  for (;;) {
    grow.run();
    let best: { t: number; cost: number; node: number } | null = null;
    for (const ti of pending) {
      const target = targets[ti] as Target;
      for (const a of target.attach) {
        const c = (grow.dist[a.node] as number) + a.cost;
        if (Number.isFinite(c) && (best === null || c < best.cost))
          best = { t: ti, cost: c, node: a.node };
      }
    }
    if (best === null) break;
    pending.delete(best.t);
    const target = targets[best.t] as Target;
    const ids = grow.pathTo(best.node);
    if (target.cls === 0) select(ids, 0);
    else villagePaths.push({ ids, target });
    select(ids, target.cls);
    for (const id of ids) {
      const e = g.edges[id] as GraphEdge;
      grow.source(e.a, 0);
      grow.source(e.b, 0);
    }
    // Hedefin bütün bağlanma düğümleri artık ağdadır (aynı köye ikinci yol çizilmez).
    if (target.town) stats.townLinks++;
  }

  // Çizgede yolu olmayan yerleşim: en yakın seçili yola A* ile (yeni kenar).
  const selectedNear = (x: number, z: number, radius: number) =>
    edgeIndex.nearest(g, x, z, radius, (e) => e.sel >= 0);
  const routed: Array<{ ids: number[]; target: Target }> = [];
  for (const ti of pending) {
    const target = targets[ti] as Target;
    const t = target.town;
    if (!t) continue;
    const hit = selectedNear(t.x, t.z, t.r + ROADS.linkMax);
    if (!hit) {
      stats.unlinked++;
      continue;
    }
    // Il/ilçe: yol diskin kenarına kadar uzanır (içi sokaklardır); köy: merkeze.
    let tx = t.x;
    let tz = t.z;
    const d = Math.hypot(hit.x - t.x, hit.z - t.z) || 1;
    if (t.rank !== 'koy') {
      const rim = Math.min(d, t.r * 0.95);
      tx = t.x + ((hit.x - t.x) / d) * rim;
      tz = t.z + ((hit.z - t.z) / d) * rim;
    }
    if (Math.hypot(hit.x - tx, hit.z - tz) < 3) continue; // zaten değiyor
    const route = findRoute(hit.x, hit.z, tx, tz, field);
    if (!route) {
      stats.unlinked++;
      continue;
    }
    const node = g.splitEdge(hit.edge, hit.x, hit.z);
    for (const id of g.liveEdgesAt(node)) edgeIndex.add(g, id);
    const n = g.nodes[node] as { x: number; z: number };
    route[0] = n.x;
    route[1] = n.z;
    const id = g.addEdge(1, route, target.cls);
    if (id === null) continue;
    edgeIndex.add(g, id);
    stats.routedLinks++;
    if (target.cls !== 0) routed.push({ ids: [id], target });
  }

  // Köy bağlantılarının sınıfı: dik arazide giden bağlantı dağ patikasıdır (yol boyunca tek tip).
  for (const { ids } of [...villagePaths, ...routed]) {
    let len = 0;
    let slope = 0;
    let dirt = 0;
    for (const id of ids) {
      const e = g.edges[id] as GraphEdge;
      len += e.len;
      slope += e.slope * e.len;
      if (e.data === 2) dirt += e.len;
    }
    if (len === 0) continue;
    slope /= len;
    const trail =
      slope > ROADS.trailSlopeDeg || (dirt / len > 0.6 && slope > ROADS.trailDirtSlopeDeg);
    if (!trail) continue;
    for (const id of ids) {
      const e = g.edges[id] as GraphEdge;
      if (e.sel === 1) e.sel = 2;
    }
  }

  // Köyün içine giriş: ağın köye en yakın noktası merkezden uzaksa merkeze kısa bir yol (köy evleri onun çevresine dizilir).
  towns.forEach((t) => {
    if (t.rank !== 'koy') return;
    const hit = selectedNear(t.x, t.z, t.r + ROADS.attachPad + 6);
    if (!hit || hit.d <= ROADS.villageSpurMin) return;
    const route = findRoute(hit.x, hit.z, t.x, t.z, field, { pad: 16 });
    if (!route) return;
    const joined = g.edges[hit.edge] as GraphEdge;
    const cls = Math.max(1, joined.sel) as RoadClass;
    const node = g.splitEdge(hit.edge, hit.x, hit.z);
    for (const id of g.liveEdgesAt(node)) edgeIndex.add(g, id);
    const n = g.nodes[node] as { x: number; z: number };
    route[0] = n.x;
    route[1] = n.z;
    const id = g.addEdge(1, route, cls);
    if (id === null) return;
    edgeIndex.add(g, id);
    stats.villageSpurs++;
  });

  // 4. Dağ patikaları: komşu köyler arasında ağ çok dolaşıyorsa veri yolundan kısa bir patika.
  {
    const villages = towns.map((_, i) => i).filter((i) => (attaches[i] as Attach[]).length > 0);
    const onNetwork = (e: GraphEdge) => (e.sel >= 0 ? e.len : Number.POSITIVE_INFINITY);
    const anyRoad = (e: GraphEdge) => e.len * (e.sel >= 0 ? 0.8 : 1) * (1 + (e.slope / 60) ** 2);
    const done = new Set<string>();
    for (const i of villages) {
      if (stats.trails >= ROADS.trailMax) break;
      const ti = towns[i] as TownDisc;
      const near = villages
        .filter((j) => j !== i)
        .map((j) => ({ j, d: Math.hypot(towns[j]!.x - ti.x, towns[j]!.z - ti.z) }))
        .filter((c) => c.d <= ROADS.trailRadius)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      if (near.length === 0) continue;
      const net = new ShortestPaths(g, onNetwork, ROADS.trailRadius * ROADS.trailDetour * 1.2);
      for (const a of attaches[i] as Attach[]) net.source(a.node, 0);
      net.run();
      for (const { j, d } of near) {
        const pairKey = i < j ? `${i}/${j}` : `${j}/${i}`;
        if (done.has(pairKey)) continue;
        done.add(pairKey);
        const netDist = Math.min(
          ...(attaches[j] as Attach[]).map((a) => net.dist[a.node] as number),
        );
        if (netDist <= d * ROADS.trailDetour) continue;
        const sp = new ShortestPaths(g, anyRoad, d * ROADS.trailMaxStretch + 40);
        for (const a of attaches[i] as Attach[]) sp.source(a.node, 0);
        sp.run();
        let best: { node: number; c: number } | null = null;
        for (const a of attaches[j] as Attach[]) {
          const c = sp.dist[a.node] as number;
          if (Number.isFinite(c) && (best === null || c < best.c)) best = { node: a.node, c };
        }
        if (!best) continue;
        const ids = sp.pathTo(best.node).filter((id) => (g.edges[id] as GraphEdge).sel < 0);
        if (ids.length === 0) continue;
        select(ids, 2);
        stats.trails++;
      }
    }
  }

  // 5. Tek parça ağ: seçili ağın bileşenleri (küçükten büyüğe) en ucuz veri yoluyla, yoksa A* ile birbirine bağlanır.
  for (let round = 0; round < ROADS.joinRounds; round++) {
    const parent = new Int32Array(g.nodes.length).map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i] as number] as number;
      return i;
    };
    const size = new Map<number, number>();
    for (const e of g.edges) if (e.alive && e.sel >= 0) parent[find(e.a)] = find(e.b);
    const trunkOf = new Set<number>();
    for (const e of g.edges) {
      if (!e.alive || e.sel < 0) continue;
      const root = find(e.a);
      size.set(root, (size.get(root) ?? 0) + e.len);
      if (e.sel === 0) trunkOf.add(root);
    }
    if (size.size <= 1) break;
    const order = [...size.entries()].sort((a, b) => a[1] - b[1]).map(([root]) => root);
    const largest = order[order.length - 1] as number;
    const joinedRoots = new Set<number>();
    let joined = 0;
    for (const root of order) {
      if (root === largest || joinedRoots.has(root)) continue;
      const sp = new ShortestPaths(g, localWeight, ROADS.joinMaxCost);
      const members: number[] = [];
      for (const e of g.edges) {
        if (!e.alive || e.sel < 0 || find(e.a) !== root) continue;
        members.push(e.a, e.b);
      }
      for (const n of members) sp.source(n, 0);
      sp.run();
      let best: { node: number; cost: number } | null = null;
      for (const e of g.edges) {
        if (!e.alive || e.sel < 0) continue;
        const other = find(e.a);
        if (other === root) continue;
        for (const n of [e.a, e.b]) {
          const c = sp.dist[n] as number;
          if (Number.isFinite(c) && (best === null || c < best.cost)) best = { node: n, cost: c };
        }
      }
      const otherRoot = best ? find(best.node) : -1;
      const cls: RoadClass = trunkOf.has(root) && trunkOf.has(otherRoot) ? 0 : 1;
      if (best) {
        const ids = sp.pathTo(best.node);
        select(ids, cls);
        joinedRoots.add(root).add(otherRoot);
        joined++;
        stats.componentLinks++;
        continue;
      }
      // Çizgede bağ yok: en yakın başka bileşen noktasına A*.
      const pts = new PointIndex();
      for (const e of g.edges) {
        if (!e.alive || e.sel < 0) continue;
        const sp2 = samplePath(e.pts, 8);
        for (let i = 0; i + 1 < sp2.length; i += 2)
          pts.add(sp2[i] as number, sp2[i + 1] as number, find(e.a), e.sel as RoadClass);
      }
      let near: { ax: number; az: number; q: { x: number; z: number; d: number } } | null = null;
      for (const e of g.edges) {
        if (!e.alive || e.sel < 0 || find(e.a) !== root) continue;
        const sp2 = samplePath(e.pts, 8);
        for (let i = 0; i + 1 < sp2.length; i += 2) {
          const q = pts.nearestOther(
            sp2[i] as number,
            sp2[i + 1] as number,
            root,
            near ? near.q.d : ROADS.joinRouteMax,
          );
          if (q && (near === null || q.d < near.q.d))
            near = { ax: sp2[i] as number, az: sp2[i + 1] as number, q };
        }
      }
      if (!near) continue;
      const route = findRoute(near.ax, near.az, near.q.x, near.q.z, field);
      if (!route) continue;
      const ha = edgeIndex.nearest(g, near.ax, near.az, 8, (e) => e.sel >= 0 && find(e.a) === root);
      const hb = edgeIndex.nearest(
        g,
        near.q.x,
        near.q.z,
        8,
        (e) => e.sel >= 0 && find(e.a) !== root,
      );
      if (!ha || !hb) continue;
      const na = g.splitEdge(ha.edge, ha.x, ha.z);
      const nb = g.splitEdge(hb.edge, hb.x, hb.z);
      for (const n of [na, nb]) for (const id of g.liveEdgesAt(n)) edgeIndex.add(g, id);
      route[0] = g.nodes[na]!.x;
      route[1] = g.nodes[na]!.z;
      route[route.length - 2] = g.nodes[nb]!.x;
      route[route.length - 1] = g.nodes[nb]!.z;
      const id = g.addEdge(1, route, 1);
      if (id === null) continue;
      edgeIndex.add(g, id);
      joinedRoots.add(root);
      joined++;
      stats.componentLinks++;
    }
    if (joined === 0) break;
  }

  // 6. Temizlik: seçilen kenarlardan yeni çizge; zincirler birleşir, kısa halkalar ve kısa boş uçlar çözülür.
  const chosen: RoadData[] = [];
  for (const e of g.edges) {
    if (!e.alive || e.sel < 0) continue;
    // Uçlar düğüm konumuna oturur: aynı düğümdeki uçlar `nodeSnap` kadar ayrık olabilir (iki uç arası 2 × nodeSnap).
    const pts = Float32Array.from(e.pts);
    const a = g.nodes[e.a] as { x: number; z: number };
    const b = g.nodes[e.b] as { x: number; z: number };
    pts[0] = a.x;
    pts[1] = a.z;
    pts[pts.length - 2] = b.x;
    pts[pts.length - 1] = b.z;
    chosen.push({ cls: e.sel as RoadClass, xz: pts });
  }
  const out = cleanNetwork(chosen, towns, nearBounds, stats);
  stats.edgesOut = out.length;
  return out;
}

/** Temizlik çizgesi kenarı. */
interface CleanEdge {
  cls: RoadClass;
  pts: number[];
  a: number;
  b: number;
  len: number;
  alive: boolean;
}

/**
 * Seçilen ağın temizliği (saf): derece-2 düğümlerde aynı sınıftaki parçalar tek çizgi olur; kısa halkalar (göbek,
 * kavşak kolu, ayrılıp birleşen çatal) ve çift şeritli yolun ikizi çözülür (halkanın en önemsiz kenarı silinir; ağ
 * bağlı kalır); yerleşime ya da dünya kenarına varmayan kısa uçlar silinir.
 */
export function cleanNetwork(
  roads: readonly RoadData[],
  towns: readonly TownDisc[],
  nearBounds: (x: number, z: number) => boolean,
  stats: NetworkReport = emptyNetworkReport(),
): RoadData[] {
  const index = new NodeIndex();
  const edges: CleanEdge[] = [];
  const adj: number[][] = [];
  const node = (x: number, z: number) => {
    const before = index.nodes.length;
    const id = index.node(x, z);
    if (index.nodes.length > before) adj.push([]);
    return id;
  };
  const add = (cls: RoadClass, pts: number[]): void => {
    if (pts.length < 4) return;
    const a = node(pts[0] as number, pts[1] as number);
    const b = node(pts[pts.length - 2] as number, pts[pts.length - 1] as number);
    const len = pathLength(pts);
    if (a === b && len < ROADS.loopMaxPerimeter) return; // tek kenarlı küçük halka (göbek)
    const id = edges.push({ cls, pts, a, b, len, alive: true }) - 1;
    (adj[a] as number[]).push(id);
    if (b !== a) (adj[b] as number[]).push(id);
  };
  for (const r of roads) add(r.cls, Array.from(r.xz));
  const live = (n: number) => (adj[n] as number[]).filter((id) => (edges[id] as CleanEdge).alive);
  const degree = (n: number) => {
    let d = 0;
    for (const id of live(n)) {
      const e = edges[id] as CleanEdge;
      if (e.a === n) d++;
      if (e.b === n) d++;
    }
    return d;
  };
  const merge = (): void => {
    for (let n = 0; n < index.nodes.length; n++) {
      if (degree(n) !== 2) continue;
      const ids = live(n);
      if (ids.length !== 2) continue;
      const e1 = edges[ids[0] as number] as CleanEdge;
      const e2 = edges[ids[1] as number] as CleanEdge;
      if (e1.cls !== e2.cls) continue;
      const p1 = e1.b === n ? e1.pts : reversePts(e1.pts);
      const a1 = e1.b === n ? e1.a : e1.b;
      const p2 = e2.a === n ? e2.pts : reversePts(e2.pts);
      const b2 = e2.a === n ? e2.b : e2.a;
      e1.alive = false;
      e2.alive = false;
      const pts = [...p1, ...p2.slice(2)];
      const id =
        edges.push({ cls: e1.cls, pts, a: a1, b: b2, len: e1.len + e2.len, alive: true }) - 1;
      (adj[a1] as number[]).push(id);
      if (b2 !== a1) (adj[b2] as number[]).push(id);
    }
  };
  merge();

  // Halkalar: kenar olmadan uçları arasında (yalnız kendisi kadar önemli kenarlardan) kısa bir yol varsa kenar silinir.
  const alternative = (skip: number, from: number, to: number, cls: RoadClass, limit: number) => {
    const dist = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, number>();
    const heap = new MinHeap();
    heap.push(0, from);
    while (heap.size > 0) {
      const d = heap.peekKey();
      const n = heap.pop();
      if (d > (dist.get(n) ?? Infinity)) continue;
      if (n === to) {
        const path: number[] = [];
        for (let m = to; m !== from;) {
          const id = prev.get(m) as number;
          path.push(id);
          const e = edges[id] as CleanEdge;
          m = e.a === m ? e.b : e.a;
        }
        return { d, path };
      }
      for (const id of live(n)) {
        if (id === skip) continue;
        const e = edges[id] as CleanEdge;
        if (e.cls > cls) continue;
        const m = e.a === n ? e.b : e.a;
        const nd = d + e.len;
        if (nd <= limit && nd < (dist.get(m) ?? Infinity)) {
          dist.set(m, nd);
          prev.set(m, id);
          heap.push(nd, m);
        }
      }
    }
    return null;
  };
  const twinOf = (e: CleanEdge, path: readonly number[]): boolean => {
    const pts = new PointIndex();
    for (const id of path) {
      const sp = samplePath((edges[id] as CleanEdge).pts, 4);
      for (let i = 0; i + 1 < sp.length; i += 2)
        pts.add(sp[i] as number, sp[i + 1] as number, 0, 0);
    }
    const sp = samplePath(e.pts, 6);
    for (let i = 0; i + 1 < sp.length; i += 2) {
      if (!pts.nearest(sp[i] as number, sp[i + 1] as number, ROADS.twinDistance)) return false;
    }
    return true;
  };
  for (let pass = 0; pass < 3; pass++) {
    let removed = 0;
    // Önce önemsiz (yüksek sınıf numarası), aynı sınıfta uzun olan denenir.
    const order = edges
      .map((e, id) => ({ e, id }))
      .filter(({ e }) => e.alive)
      .sort((p, q) => q.e.cls - p.e.cls || q.e.len - p.e.len);
    for (const { e, id } of order) {
      if (!e.alive || e.a === e.b) continue;
      const limit = Math.max(e.len * ROADS.loopStretch, e.len + ROADS.loopPad);
      const alt = alternative(id, e.a, e.b, e.cls, limit);
      if (!alt) continue;
      const small = e.len + alt.d <= ROADS.loopMaxPerimeter;
      if (!small && !twinOf(e, alt.path)) continue;
      e.alive = false;
      removed++;
    }
    stats.loopsRemoved += removed;
    merge();
    if (removed === 0) break;
  }

  // Kısa boş uçlar: yerleşime/dünya kenarına varmayan, `spurMax`'tan kısa çıkmaz kollar (veri artığı).
  const anchored = (x: number, z: number) =>
    nearBounds(x, z) || towns.some((t) => Math.hypot(x - t.x, z - t.z) <= t.r + ROADS.attachPad);
  for (let pass = 0; pass < 4; pass++) {
    let removed = 0;
    for (let n = 0; n < index.nodes.length; n++) {
      if (degree(n) !== 1) continue;
      const p = index.nodes[n] as { x: number; z: number };
      if (anchored(p.x, p.z)) continue;
      const [id] = live(n) as [number];
      const e = edges[id] as CleanEdge;
      const other = e.a === n ? e.b : e.a;
      // Tek başına duran parça (iki ucu da boşta) ya da kısa kol silinir.
      if (e.len < ROADS.spurMax || degree(other) === 1) {
        e.alive = false;
        removed++;
      }
    }
    stats.spursRemoved += removed;
    merge();
    if (removed === 0) break;
  }

  return edges.filter((e) => e.alive).map((e) => ({ cls: e.cls, xz: Float32Array.from(e.pts) }));
}
