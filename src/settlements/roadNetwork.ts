import { FRESH_WATER, ROADS } from '../config';
import type { RoadClass, RoadData, SettlementRank } from '../data/settlements';
import { findRoute, type RouteField } from './routeFinder';
import { smoothPath, type NearestWater } from './roadRouting';

/**
 * Yol ağı düzeni (saf): yumuşatılmış veri yollarını kavşaklarında böler, çıkmaz yolları budar, kırsalda tali yolu
 * patikaya indirir, kopuk parçaları birbirine ve yerleşimlere bağlar. Amaç: yollar bir yerden bir yere gitsin;
 * hiçbir yere varmayan, tek başına duran, birbirinden kopuk çizgi kalmasın.
 */

/** Yerleşim diski: yol ağı için "varış noktası" (çıkmaz yol buraya varıyorsa budanmaz). */
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
  /** Dünya kenarı (yollar orada kesilmiştir; kenardaki çıkmazlar budanmaz). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Düzenin sayımları (test ve ölçüm). */
export interface NetworkReport {
  edgesIn: number;
  edgesOut: number;
  pruned: number;
  demoted: number;
  linked: number;
  removedComponents: number;
  accessLinks: number;
}

interface Edge {
  cls: RoadClass;
  pts: number[];
  a: number;
  b: number;
  alive: boolean;
}

const WATER_AREA = new Set(['lake', 'reservoir', 'pond', 'water']);

/** Çizgi uzunluğu (oyun m). */
export function pathLength(pts: readonly number[]): number {
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
export function samplePath(pts: readonly number[], step: number): number[] {
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

/**
 * Yolların uç noktaları başka bir yolun gövdesine değiyorsa o yolu orada böler (T kavşağı). Yalnızca `focusFrom` ve
 * sonrası dizinli yolların uçları denetlenir (bağlantı turlarında yalnız yeni yollar). Arama, yolların sınır kutusu
 * ızgarasıyla daraltılır.
 */
function splitAtJunctions(roads: readonly RoadData[], focusFrom = 0): RoadData[] {
  const cellSize = 48;
  const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
  const cells = new Map<number, number[]>();
  const snap = ROADS.junctionSnap;
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
    // Uzun yollar için sınır kutusu hücreleri çok olabilir; yol boyunca örnek hücreler yeterlidir.
    const seen = new Set<number>();
    const mark = (x: number, z: number) => {
      const k = key(Math.floor(x / cellSize), Math.floor(z / cellSize));
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
  for (let ri = focusFrom; ri < roads.length; ri++) {
    const own = pts[ri] as number[];
    for (const end of [0, own.length - 2]) {
      const px = own[end] as number;
      const pz = own[end + 1] as number;
      let best: { rj: number; seg: number; t: number; x: number; z: number; d2: number } | null =
        null;
      const candidates = new Set<number>();
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const rj of cells.get(
            key(Math.floor(px / cellSize) + dx, Math.floor(pz / cellSize) + dz),
          ) ?? []) {
            candidates.add(rj);
          }
        }
      }
      for (const rj of candidates) {
        if (rj === ri) continue;
        // İlk geçişte yalnız farklı sınıftaki yollar denenir: veri hattı aynı sınıfın yollarını kavşaklarında zaten böler.
        if (focusFrom === 0 && roads[rj]!.cls === roads[ri]!.cls) continue;
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
      // Karşı yolun uç noktasına zaten yakınsa düğüm eşleştirmesi halleder (bölmeye gerek yok).
      const other = roads[best.rj]!.xz;
      const nearEnd = [0, other.length - 2].some(
        (e) =>
          ((other[e] as number) - best!.x) ** 2 + ((other[e + 1] as number) - best!.z) ** 2 <=
          node2,
      );
      if (nearEnd) continue;
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
      out.push(ri >= focusFrom ? { cls: road.cls, xz: Float32Array.from(p) } : road);
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

  private key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  /** (x, z)'ye `nodeSnap` içindeki düğüm; yoksa yeni düğüm açar. */
  node(x: number, z: number): number {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    const r2 = ROADS.nodeSnap ** 2;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const id of this.grid.get(this.key(cx + dx, cz + dz)) ?? []) {
          const n = this.nodes[id] as { x: number; z: number };
          if ((n.x - x) ** 2 + (n.z - z) ** 2 <= r2) return id;
        }
      }
    }
    const id = this.nodes.push({ x, z }) - 1;
    const k = this.key(cx, cz);
    const list = this.grid.get(k);
    if (list) list.push(id);
    else this.grid.set(k, [id]);
    return id;
  }
}

/** Düğümlü çizge: yol uçları `nodeSnap` içinde aynı düğümdür. */
class Graph {
  private readonly index = new NodeIndex();
  readonly edges: Edge[] = [];
  /** Düğüm → kenar indeksleri (ölü kenarlar da kalır; `alive` ile süzülür). */
  readonly adj: number[][] = [];

  get nodes(): Array<{ x: number; z: number }> {
    return this.index.nodes;
  }

  node(x: number, z: number): number {
    const before = this.index.nodes.length;
    const id = this.index.node(x, z);
    if (this.index.nodes.length > before) this.adj.push([]);
    return id;
  }

  addEdge(cls: RoadClass, pts: number[]): number | null {
    if (pts.length < 4) return null;
    const a = this.node(pts[0] as number, pts[1] as number);
    const b = this.node(pts[pts.length - 2] as number, pts[pts.length - 1] as number);
    if (a === b && pathLength(pts) < ROADS.nodeSnap * 3) return null;
    const id = this.edges.push({ cls, pts, a, b, alive: true }) - 1;
    (this.adj[a] as number[]).push(id);
    (this.adj[b] as number[]).push(id);
    return id;
  }

  /** Düğümdeki canlı kenar uçlarının sayısı (kendine dönen kenar iki sayılır). */
  degree(n: number): number {
    let d = 0;
    for (const id of this.adj[n] as number[]) {
      const e = this.edges[id] as Edge;
      if (!e.alive) continue;
      if (e.a === n) d++;
      if (e.b === n) d++;
    }
    return d;
  }

  liveEdgesAt(n: number): number[] {
    return (this.adj[n] as number[]).filter((id) => (this.edges[id] as Edge).alive);
  }

  toRoads(): RoadData[] {
    return this.edges
      .filter((e) => e.alive)
      .map((e) => ({ cls: e.cls, xz: Float32Array.from(e.pts) }));
  }
}

function buildGraph(roads: readonly RoadData[], focusFrom = 0): Graph {
  const g = new Graph();
  for (const road of splitAtJunctions(roads, focusFrom)) g.addEdge(road.cls, Array.from(road.xz));
  return g;
}

/** Yerleşim disklerinin uzamsal ızgarası: "bu nokta bir disk kenarına ne kadar yakın". */
class TownIndex {
  private readonly cells = new Map<number, TownDisc[]>();
  private readonly cell = 256;

  constructor(towns: readonly TownDisc[]) {
    for (const t of towns) {
      const reach = t.r + 80;
      for (
        let cx = Math.floor((t.x - reach) / this.cell);
        cx <= Math.floor((t.x + reach) / this.cell);
        cx++
      ) {
        for (
          let cz = Math.floor((t.z - reach) / this.cell);
          cz <= Math.floor((t.z + reach) / this.cell);
          cz++
        ) {
          const k = (cx + 32768) * 65536 + (cz + 32768);
          const list = this.cells.get(k);
          if (list) list.push(t);
          else this.cells.set(k, [t]);
        }
      }
    }
  }

  /** (x, z)'nin en yakın disk kenarına uzaklığı (içerideyse negatif); `limit`'ten uzaksa `limit`. */
  edgeDistance(x: number, z: number, limit: number): number {
    const list = this.cells.get(
      (Math.floor(x / this.cell) + 32768) * 65536 + (Math.floor(z / this.cell) + 32768),
    );
    let best = limit;
    for (const t of list ?? []) best = Math.min(best, Math.hypot(x - t.x, z - t.z) - t.r);
    return best;
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
    const k = (Math.floor(x / this.cell) + 32768) * 65536 + (Math.floor(z / this.cell) + 32768);
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
  ): { x: number; z: number; d: number; cls: RoadClass } | null {
    let best: { x: number; z: number; d: number; cls: RoadClass } | null = null;
    const c0x = Math.floor((x - radius) / this.cell);
    const c1x = Math.floor((x + radius) / this.cell);
    const c0z = Math.floor((z - radius) / this.cell);
    const c1z = Math.floor((z + radius) / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        for (const p of this.cells.get((cx + 32768) * 65536 + (cz + 32768)) ?? []) {
          if (p.comp === comp) continue;
          const d = Math.hypot(p.x - x, p.z - z);
          if (d <= radius && (best === null || d < best.d))
            best = { x: p.x, z: p.z, d, cls: p.cls };
        }
      }
    }
    return best;
  }

  nearest(
    x: number,
    z: number,
    radius: number,
  ): { x: number; z: number; d: number; cls: RoadClass } | null {
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

interface Components {
  of: Int32Array;
  count: number;
  length: number[];
  anchored: boolean[];
}

function components(g: Graph, anchoredNode: (n: number) => boolean): Components {
  const parent = Int32Array.from({ length: g.nodes.length }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i] as number] as number;
      i = parent[i] as number;
    }
    return i;
  };
  for (const e of g.edges) if (e.alive) parent[find(e.a)] = find(e.b);
  const index = new Map<number, number>();
  const of = new Int32Array(g.nodes.length).fill(-1);
  const length: number[] = [];
  const anchored: boolean[] = [];
  for (const e of g.edges) {
    if (!e.alive) continue;
    const root = find(e.a);
    let c = index.get(root);
    if (c === undefined) {
      c = length.length;
      index.set(root, c);
      length.push(0);
      anchored.push(false);
    }
    of[e.a] = c;
    of[e.b] = c;
    length[c] = (length[c] as number) + pathLength(e.pts);
  }
  for (let n = 0; n < g.nodes.length; n++) {
    const c = of[n] as number;
    if (c >= 0 && !anchored[c] && anchoredNode(n)) anchored[c] = true;
  }
  return { of, count: length.length, length, anchored };
}

/**
 * Yol ağını düzenler (saf; gerçek veride ~1 sn): bkz. dosya başı. `roads` yumuşatılmış, sudan ayrılmış yollardır.
 * Dönen yollar kavşaklarında bölünmüş, zincirleme düğümleri birleştirilmiş, sınıfları kırsal yoğunluğa göre
 * düzeltilmiş çizgilerdir.
 */
export function shapeRoadNetwork(
  roads: readonly RoadData[],
  towns: readonly TownDisc[],
  terrain: NetworkTerrain,
  report?: NetworkReport,
): RoadData[] {
  const stats: NetworkReport = report ?? {
    edgesIn: 0,
    edgesOut: 0,
    pruned: 0,
    demoted: 0,
    linked: 0,
    removedComponents: 0,
    accessLinks: 0,
  };
  stats.edgesIn = roads.length;
  const townIndex = new TownIndex(towns);
  const { bounds } = terrain;
  const nearBounds = (x: number, z: number) =>
    x < bounds.minX + ROADS.boundsMargin ||
    x > bounds.maxX - ROADS.boundsMargin ||
    z < bounds.minZ + ROADS.boundsMargin ||
    z > bounds.maxZ - ROADS.boundsMargin;
  const anchoredAt = (x: number, z: number) =>
    townIndex.edgeDistance(x, z, ROADS.anchorMargin + 1) <= ROADS.anchorMargin;
  const field = terrainRouteField(terrain);

  let g = buildGraph(roads);

  const touchesTown = (e: Edge): boolean => {
    // Seyrek köşeli düz yol yerleşimin içinden geçebilir: köşeler değil, 20 m'lik örnekler denetlenir.
    const sp = samplePath(e.pts, 20);
    for (let i = 0; i + 1 < sp.length; i += 2) {
      if (anchoredAt(sp[i] as number, sp[i + 1] as number)) return true;
    }
    return false;
  };

  // 1. Çıkmaz budama: ucu hiçbir yerleşime/dünya kenarına varmayan (anayol olmayan) yol silinir.
  const prune = (graph: Graph): void => {
    const queue: number[] = [];
    for (let n = 0; n < graph.nodes.length; n++) if (graph.degree(n) === 1) queue.push(n);
    while (queue.length > 0) {
      const n = queue.pop() as number;
      if (graph.degree(n) !== 1) continue;
      const node = graph.nodes[n] as { x: number; z: number };
      if (anchoredAt(node.x, node.z) || nearBounds(node.x, node.z)) continue;
      const [id] = graph.liveEdgesAt(n) as [number];
      const e = graph.edges[id] as Edge;
      if (e.cls === 0) continue;
      // Yerleşime varan yol (öbür ucu ya da herhangi bir noktası yerleşimde) silinmez: ucu boşta kalsa da yerleşimin
      // yoludur; boşta ucu bağlantı turunda en yakın yola bağlanır.
      if (touchesTown(e)) continue;
      e.alive = false;
      stats.pruned++;
      const other = e.a === n ? e.b : e.a;
      if (other !== n && graph.degree(other) === 1) queue.push(other);
    }
  };
  prune(g);

  // 2. Derece-2 düğümleri birleştir (aynı sınıf), kırsalda tali yolu patikaya indir, tekrar birleştir.
  const merge = (graph: Graph): Graph => {
    for (let n = 0; n < graph.nodes.length; n++) {
      if (graph.degree(n) !== 2) continue;
      const ids = graph.liveEdgesAt(n);
      if (ids.length !== 2) continue; // kendine dönen kenar
      const e1 = graph.edges[ids[0] as number] as Edge;
      const e2 = graph.edges[ids[1] as number] as Edge;
      if (e1.cls !== e2.cls) continue;
      // e1 düğümde biter, e2 düğümde başlar olacak şekilde yönlendir.
      const p1 = e1.b === n ? e1.pts : reversePts(e1.pts);
      const a1 = e1.b === n ? e1.a : e1.b;
      const p2 = e2.a === n ? e2.pts : reversePts(e2.pts);
      const b2 = e2.a === n ? e2.b : e2.a;
      e1.alive = false;
      e2.alive = false;
      // Birleşme noktasındaki köşe (iki parçanın uçları) tekrar yumuşatılır.
      const merged = Array.from(smoothPath([...p1, ...p2.slice(2)], e1.cls));
      const id = graph.edges.push({ cls: e1.cls, pts: merged, a: a1, b: b2, alive: true }) - 1;
      (graph.adj[a1] as number[]).push(id);
      (graph.adj[b2] as number[]).push(id);
    }
    return graph;
  };
  merge(g);
  for (const e of g.edges) {
    if (!e.alive || e.cls !== 1) continue;
    let far = true;
    const sp = samplePath(e.pts, 20);
    for (let i = 0; i + 1 < sp.length && far; i += 2) {
      far =
        townIndex.edgeDistance(sp[i] as number, sp[i + 1] as number, ROADS.ruralDistance + 1) >
        ROADS.ruralDistance;
    }
    if (far) {
      e.cls = 2;
      stats.demoted++;
    }
  }
  merge(g);

  // 3. Bağlantı: kopuk bileşenler en yakın yola bağlanır; bağlanamayan, yerleşimsiz olanlar silinir.
  const anchoredNode = (graph: Graph) => (n: number) => {
    const node = graph.nodes[n] as { x: number; z: number };
    return anchoredAt(node.x, node.z);
  };
  const connectors: RoadData[] = [];
  const addRoute = (ax: number, az: number, bx: number, bz: number, cls: RoadClass): boolean => {
    const route = findRoute(ax, az, bx, bz, field);
    if (!route) return false;
    connectors.push({ cls, xz: smoothPath(route, cls) });
    return true;
  };
  for (let round = 0; round < ROADS.linkRounds; round++) {
    const base = g.toRoads();
    g = merge(buildGraph([...base, ...connectors.splice(0)], base.length));
    const comps = components(g, anchoredNode(g));
    if (comps.count <= 1) break;
    // Ana bileşen: en uzun olan.
    let main = 0;
    for (let c = 1; c < comps.count; c++)
      if ((comps.length[c] as number) > (comps.length[main] as number)) main = c;
    const index = new PointIndex();
    const edgesOf: Edge[][] = Array.from({ length: comps.count }, () => []);
    for (const e of g.edges) {
      if (!e.alive) continue;
      const comp = comps.of[e.a] as number;
      (edgesOf[comp] as Edge[]).push(e);
      const sp = samplePath(e.pts, 12);
      for (let i = 0; i + 1 < sp.length; i += 2)
        index.add(sp[i] as number, sp[i + 1] as number, comp, e.cls);
    }
    const order = Array.from({ length: comps.count }, (_, c) => c)
      .filter((c) => c !== main)
      .sort((a, b) => (comps.length[a] as number) - (comps.length[b] as number));
    const removed = new Set<number>();
    for (const c of order) {
      // Bu bileşenin noktalarından başka bileşene en yakın olanı.
      let best: {
        ax: number;
        az: number;
        q: { x: number; z: number; d: number; cls: RoadClass };
      } | null = null;
      for (const e of edgesOf[c] as Edge[]) {
        const sp = samplePath(e.pts, 12);
        for (let i = 0; i + 1 < sp.length; i += 2) {
          const q = index.nearestOther(
            sp[i] as number,
            sp[i + 1] as number,
            c,
            best ? best.q.d : ROADS.linkMax,
          );
          if (q && (best === null || q.d < best.q.d))
            best = { ax: sp[i] as number, az: sp[i + 1] as number, q };
        }
      }
      if (best && best.q.d > 0.5) {
        // Bağlantı, vardığı yoldan daha önemli olmaz: anayola bağlanan tali yol, patikaya bağlanan patika olur.
        const cls: RoadClass = best.q.cls === 0 ? 1 : best.q.cls;
        if (addRoute(best.ax, best.az, best.q.x, best.q.z, cls)) {
          stats.linked++;
          continue;
        }
      }
      if (!(comps.anchored[c] as boolean)) removed.add(c);
    }
    for (const e of g.edges) {
      if (e.alive && removed.has(comps.of[e.a] as number)) e.alive = false;
    }
    stats.removedComponents += removed.size;
  }
  {
    const base = g.toRoads();
    g = merge(buildGraph([...base, ...connectors.splice(0)], base.length));
  }

  // 4. Yerleşim erişimi: yakınında yol olmayan yerleşim en yakın yola bağlanır.
  const points = new PointIndex();
  for (const e of g.edges) {
    if (!e.alive) continue;
    const sp = samplePath(e.pts, 10);
    for (let i = 0; i + 1 < sp.length; i += 2)
      points.add(sp[i] as number, sp[i + 1] as number, 0, e.cls);
  }
  for (const town of towns) {
    const reach = town.r + ROADS.accessPad;
    if (points.nearest(town.x, town.z, reach)) continue;
    const q = points.nearest(town.x, town.z, ROADS.linkMax);
    if (!q) continue;
    // İl/ilçe: kent içi sokak ızgarasıdır, yol diskin kenarına kadar uzanır; köy: merkeze.
    let tx = town.x;
    let tz = town.z;
    if (town.rank !== 'koy') {
      const d = Math.hypot(q.x - town.x, q.z - town.z) || 1;
      const rim = Math.min(d, town.r * 0.95);
      tx = town.x + ((q.x - town.x) / d) * rim;
      tz = town.z + ((q.z - town.z) / d) * rim;
    }
    if (addRoute(q.x, q.z, tx, tz, town.rank === 'koy' ? 2 : 1)) stats.accessLinks++;
  }
  {
    const base = g.toRoads();
    g = merge(buildGraph([...base, ...connectors.splice(0)], base.length));
  }
  prune(g);

  const out = g.toRoads();
  stats.edgesOut = out.length;
  return out;
}

function reversePts(pts: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i] as number, pts[i + 1] as number);
  return out;
}
