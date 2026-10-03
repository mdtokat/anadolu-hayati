import { ROADS, SETTLEMENT_LAYOUT } from '../config';
import type { RoadData, SettlementsData } from '../data/settlements';
import type { FootprintRegistry } from './footprints';
import { footprintRadius, settlementCenter, type LayoutTerrain } from './layout';
import { NodeIndex, PointIndex, samplePath, terrainRouteField } from './roadNetwork';
import type { NearestWater } from './roadRouting';
import { findRoute, MinHeap, type RouteField } from './routeFinder';

/**
 * Kent içi yol ağı (saf): il/ilçe merkezlerinde veri yolları kentin içinde kesilir (`cutRoads`) ve yerlerini kent
 * sokakları (sınıf 3) alır. Düzen (`layout.ts`) yapılı blokların kenarlarını sokak **adayı** olarak verir; bu modül:
 *
 * 1. Kentin içinde/kenarında boşta biten yol uçlarını (kesilen köy yolu, kente varan anayol) en yakın adaya yapı ayak
 *    izlerinden kaçan kısa bağlantılarla bağlar (kent girişleri).
 * 2. Yolları, adayları ve bağlantıları kesişimlerinden böler; kentin merkezine en yakın düğümden (kök) her yapının
 *    kapısına ve her kent girişine en kısa yolu bulur (var olan yollar ucuzdur) ve yalnızca bu yolların geçtiği sokakları
 *    tutar: her sokak bir kapıyı ya da girişi kente bağlar, girişler sokaklar üzerinden birbirine bağlanır; hiçbir yere
 *    gitmeyen sokak parçası ve kopuk sokak adası kalmaz. Köke ulaşamayan öbek A* ile bağlanır.
 * 3. Çok kapıya hizmet eden sokaklar (kentin omurgası) ana caddedir (`ROADS.avenueWidth`).
 */

export interface TownRoads {
  /** Kesilen yol uçlarından sokaklara giden bağlantılar (sınıf 3). */
  joins: RoadData[];
  /** Tutulan sokaklar (sınıf 3; ana caddeler geniş). */
  streets: RoadData[];
}

/** Kapı önünden sokağa en çok bu kadar (oyun m). */
const DOOR_REACH = 16;
/** Bu kadar kapıya giden yolun geçtiği sokak ana caddedir. */
const AVENUE_USES = 6;

interface Line {
  xz: number[];
  /** Var olan yol mu (kentin yol ağı)? */
  road: boolean;
}

/** Çizgileri birbirini kestikleri ve birinin ucunun öbürüne değdiği yerlerden böler (T ve X kavşakları). */
function splitLines<T extends Line>(lines: readonly T[], snap: number): T[] {
  const cell = 16;
  const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
  // Parçalar: (çizgi, parça başlangıç dizini); kutusu (`snap` paylı) değdiği hücrelere yazılır.
  const segLine: number[] = [];
  const segAt: number[] = [];
  const grid = new Map<number, number[]>();
  lines.forEach((line, li) => {
    for (let s = 0; s + 3 < line.xz.length; s += 2) {
      const ax = line.xz[s] as number;
      const az = line.xz[s + 1] as number;
      const bx = line.xz[s + 2] as number;
      const bz = line.xz[s + 3] as number;
      const id = segLine.push(li) - 1;
      segAt.push(s);
      for (
        let cx = Math.floor((Math.min(ax, bx) - snap) / cell);
        cx <= Math.floor((Math.max(ax, bx) + snap) / cell);
        cx++
      ) {
        for (
          let cz = Math.floor((Math.min(az, bz) - snap) / cell);
          cz <= Math.floor((Math.max(az, bz) + snap) / cell);
          cz++
        ) {
          const k = key(cx, cz);
          const list = grid.get(k);
          if (list) list.push(id);
          else grid.set(k, [id]);
        }
      }
    }
  });
  const total = segLine.length;
  const pairs: Array<[number, number, number, number]> = [];
  const done = new Set<number>();
  for (const list of grid.values()) {
    for (let p = 0; p < list.length; p++) {
      for (let q = p + 1; q < list.length; q++) {
        const ga = list[p] as number;
        const gb = list[q] as number;
        const li = segLine[ga] as number;
        const lj = segLine[gb] as number;
        if (li === lj) continue;
        const k = ga < gb ? ga * total + gb : gb * total + ga;
        if (done.has(k)) continue;
        done.add(k);
        pairs.push([li, segAt[ga] as number, lj, segAt[gb] as number]);
      }
    }
  }
  const pts = lines.map((l) => [...l.xz]);
  const cuts = lines.map(() => [] as Array<{ seg: number; t: number; x: number; z: number }>);
  for (const [li, si, lj, sj] of pairs) {
    {
      {
        const A = lines[li] as Line;
        const B = lines[lj] as Line;
        const ax = A.xz[si] as number;
        const az = A.xz[si + 1] as number;
        const bx = A.xz[si + 2] as number;
        const bz = A.xz[si + 3] as number;
        const cx = B.xz[sj] as number;
        const cz = B.xz[sj + 1] as number;
        const dx = B.xz[sj + 2] as number;
        const dz = B.xz[sj + 3] as number;
        const rx = bx - ax;
        const rz = bz - az;
        const sx = dx - cx;
        const sz = dz - cz;
        const den = rx * sz - rz * sx;
        if (Math.abs(den) > 1e-9) {
          const t = ((cx - ax) * sz - (cz - az) * sx) / den;
          const u = ((cx - ax) * rz - (cz - az) * rx) / den;
          if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) {
            const x = ax + t * rx;
            const z = az + t * rz;
            (cuts[li] as Array<{ seg: number; t: number; x: number; z: number }>).push({
              seg: si / 2,
              t,
              x,
              z,
            });
            (cuts[lj] as Array<{ seg: number; t: number; x: number; z: number }>).push({
              seg: sj / 2,
              t: u,
              x,
              z,
            });
            continue;
          }
        }
        // T: bir çizginin ucu öbür parçaya `snap` içinde.
        for (const [own, os, oth, ot] of [
          [li, si, lj, sj],
          [lj, sj, li, si],
        ] as const) {
          const O = lines[own] as Line;
          const T = lines[oth] as Line;
          for (const end of [0, O.xz.length - 2]) {
            if (end !== os && end !== os + 2) continue;
            const px = O.xz[end] as number;
            const pz = O.xz[end + 1] as number;
            const tx0 = T.xz[ot] as number;
            const tz0 = T.xz[ot + 1] as number;
            const tx1 = T.xz[ot + 2] as number;
            const tz1 = T.xz[ot + 3] as number;
            const ddx = tx1 - tx0;
            const ddz = tz1 - tz0;
            const len2 = ddx * ddx + ddz * ddz;
            const tt =
              len2 > 0 ? Math.max(0, Math.min(1, ((px - tx0) * ddx + (pz - tz0) * ddz) / len2)) : 0;
            const qx = tx0 + tt * ddx;
            const qz = tz0 + tt * ddz;
            if (Math.hypot(px - qx, pz - qz) > snap) continue;
            (pts[own] as number[])[end] = qx;
            (pts[own] as number[])[end + 1] = qz;
            if (tt > 1e-6 && tt < 1 - 1e-6) {
              (cuts[oth] as Array<{ seg: number; t: number; x: number; z: number }>).push({
                seg: ot / 2,
                t: tt,
                x: qx,
                z: qz,
              });
            }
          }
        }
      }
    }
  }
  const out: T[] = [];
  lines.forEach((line, li) => {
    const p = pts[li] as number[];
    const list = (cuts[li] as Array<{ seg: number; t: number; x: number; z: number }>).sort(
      (a, b) => a.seg - b.seg || a.t - b.t,
    );
    let run: number[] = [p[0] as number, p[1] as number];
    let k = 0;
    for (let s = 0; s + 1 < p.length / 2; s++) {
      while (k < list.length && (list[k] as { seg: number }).seg === s) {
        const c = list[k] as { x: number; z: number };
        run.push(c.x, c.z);
        if (run.length >= 4) out.push({ ...line, xz: run });
        run = [c.x, c.z];
        k++;
      }
      run.push(p[(s + 1) * 2] as number, p[(s + 1) * 2 + 1] as number);
    }
    if (run.length >= 4) out.push({ ...line, xz: run });
  });
  return out.filter((l) => samplePathLength(l.xz) > 0.2);
}

function samplePathLength(xz: ArrayLike<number>): number {
  let l = 0;
  for (let i = 0; i + 3 < xz.length; i += 2)
    l += Math.hypot(
      (xz[i + 2] as number) - (xz[i] as number),
      (xz[i + 3] as number) - (xz[i + 1] as number),
    );
  return l;
}

export function connectTownRoads(
  roads: readonly RoadData[],
  streets: readonly RoadData[],
  data: SettlementsData,
  terrain: LayoutTerrain & { nearestWater?: NearestWater },
  footprints: FootprintRegistry,
  /** Il/ilçe yapılarının kapı önü noktaları (merdiven ucu dahil) ve yerleşim kimlikleri. */
  doors: ReadonlyArray<{ x: number; z: number; settlement: number }> = [],
): TownRoads {
  const towns = data.settlements
    .filter((s) => s.rank !== 'koy')
    .map((s) => ({
      id: s.id,
      ...settlementCenter(s),
      /** Ağın kente bağlandığı en uzak yer: ayak izi + `ROADS.attachPad`. */
      attach: footprintRadius(s) + ROADS.attachPad + 4,
      reach: footprintRadius(s) * 1.4,
    }));
  if (towns.length === 0) return { joins: [], streets: [] };

  const base = terrainRouteField({
    heightAt: terrain.heightAt,
    elevationAt: terrain.elevationAt,
    nearestWater: terrain.nearestWater,
    bounds: { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity },
  });
  const streetHalf = (ROADS.width[3] as number) / 2;
  // Rota ekseni yapıdan yol yarı genişliği + pay kadar uzak kalır (boyanan yol yapıya girmesin).
  const field: RouteField = {
    cost: (x, z) =>
      footprints.contains(x, z, streetHalf + 0.9) ? Number.POSITIVE_INFINITY : base.cost(x, z),
  };
  // Yapının kendisinin (yol yarı genişliği payıyla) içinden geçilmez; yakını yalnız pahalıdır.
  const soft: RouteField = {
    cost: (x, z) =>
      footprints.contains(x, z, streetHalf)
        ? Number.POSITIVE_INFINITY
        : (footprints.contains(x, z, streetHalf + 0.9) ? 60 : 1) * base.cost(x, z),
  };
  const nearTown = (x: number, z: number) =>
    towns.some((t) => Math.hypot(x - t.x, z - t.z) <= t.reach);
  const touches = (xz: ArrayLike<number>, x: number, z: number, r: number) => {
    const sp = samplePath(xz, 10);
    for (let i = 0; i + 1 < sp.length; i += 2) {
      if (Math.hypot((sp[i] as number) - x, (sp[i + 1] as number) - z) <= r) return true;
    }
    return false;
  };
  // Sokak adayı en yakın kente aittir.
  const streetTown = streets.map((st) => {
    const mx = ((st.xz[0] as number) + (st.xz[st.xz.length - 2] as number)) / 2;
    const mz = ((st.xz[1] as number) + (st.xz[st.xz.length - 1] as number)) / 2;
    let best = -1;
    let bestD = Infinity;
    towns.forEach((t, i) => {
      const d = Math.hypot(mx - t.x, mz - t.z);
      if (d <= t.reach && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  });

  const boxes = roads.map((r) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i + 1 < r.xz.length; i += 2) {
      x0 = Math.min(x0, r.xz[i] as number);
      x1 = Math.max(x1, r.xz[i] as number);
      z0 = Math.min(z0, r.xz[i + 1] as number);
      z1 = Math.max(z1, r.xz[i + 1] as number);
    }
    return { x0, x1, z0, z1 };
  });
  const joins: RoadData[] = [];
  const kept: RoadData[] = [];
  towns.forEach((town, ti) => {
    const localRoads = roads.filter((r, i) => {
      const b = boxes[i] as { x0: number; x1: number; z0: number; z1: number };
      if (
        b.x0 > town.x + town.reach ||
        b.x1 < town.x - town.reach ||
        b.z0 > town.z + town.reach ||
        b.z1 < town.z - town.reach
      ) {
        return false;
      }
      return touches(r.xz, town.x, town.z, town.reach);
    });
    const localStreets = streets.filter((_, i) => streetTown[i] === ti);
    const localDoors = doors.filter((d) => d.settlement === town.id);
    if (localStreets.length === 0 && localRoads.length === 0) return;

    // Kent girişleri: kentin içinde ya da kenarında boşta biten yol ucu en yakın sokak adayına (yoksa başka bir yola)
    // yapı ayak izlerinden kaçan kısa bir bağlantıyla bağlanır.
    const bodies = new PointIndex();
    localRoads.forEach((road, ri) => {
      const sp = samplePath(road.xz, 2);
      for (let k = 0; k + 1 < sp.length; k += 2)
        bodies.add(sp[k] as number, sp[k + 1] as number, ri, road.cls);
    });
    const streetTargets = new PointIndex();
    for (const line of localStreets) {
      const sp = samplePath(line.xz, 4);
      for (let i = 0; i + 1 < sp.length; i += 2)
        streetTargets.add(sp[i] as number, sp[i + 1] as number, -1, 3);
    }
    const entryEnds: Array<{ x: number; z: number }> = [];
    const connectors: number[][] = [];
    localRoads.forEach((road, ri) => {
      const n = road.xz.length;
      for (const at of [0, n - 2]) {
        const ex = road.xz[at] as number;
        const ez = road.xz[at + 1] as number;
        if (Math.hypot(ex - town.x, ez - town.z) > town.attach) continue;
        if (bodies.nearestOther(ex, ez, ri, 3)) continue; // başka yola bağlı
        entryEnds.push({ x: ex, z: ez });
        let target = streetTargets.nearest(ex, ez, SETTLEMENT_LAYOUT.joinReach * 1.6);
        if (!target) {
          target = bodies.nearestOther(ex, ez, ri, SETTLEMENT_LAYOUT.joinReach * 1.6);
          if (target && target.d < 15) target = null;
        }
        if (!target || target.d < 3) continue;
        const route =
          findRoute(ex, ez, target.x, target.z, field, { pad: 40 }) ??
          findRoute(ex, ez, target.x, target.z, soft, { pad: 40 });
        if (route) connectors.push(route);
      }
    });

    // Kök: merkeze en yakın yol/sokak noktası. Kapılar ve girişler köke en kısa yolla bağlanır; yollar ucuzdur (var olan
    // yolu kullanmak yeğlenir), sokak adayı ve bağlantı tam uzunluk.
    let links: number[][] = [];
    let used: Array<{ xz: number[]; uses: number; connector: boolean }> = [];
    for (let round = 0; round < 3; round++) {
      const lines: Array<Line & { kind: 0 | 1 | 2 }> = [
        ...localRoads.map((r) => ({ xz: Array.from(r.xz), road: true, kind: 0 as const })),
        ...localStreets.map((r) => ({ xz: Array.from(r.xz), road: false, kind: 1 as const })),
        ...connectors.map((xz) => ({ xz, road: false, kind: 2 as const })),
        ...links.map((xz) => ({ xz, road: false, kind: 2 as const })),
      ];
      const pieces = splitLines(lines, 2.4);
      const index = new NodeIndex();
      const adj: number[][] = [];
      const node = (x: number, z: number) => {
        const before = index.nodes.length;
        const id = index.node(x, z);
        if (index.nodes.length > before) adj.push([]);
        return id;
      };
      const edges = pieces.map((p) => {
        const a = node(p.xz[0] as number, p.xz[1] as number);
        const b = node(p.xz[p.xz.length - 2] as number, p.xz[p.xz.length - 1] as number);
        const len = samplePathLength(p.xz);
        const kind = p.kind;
        return { p, a, b, len, kind, w: len * (kind === 0 ? 0.3 : 1), uses: 0 };
      });
      edges.forEach((e, id) => {
        (adj[e.a] as number[]).push(id);
        if (e.b !== e.a) (adj[e.b] as number[]).push(id);
      });
      if (index.nodes.length === 0) return;
      let root = 0;
      let rootD = Infinity;
      index.nodes.forEach((n, id) => {
        const d = Math.hypot(n.x - town.x, n.z - town.z);
        if (d < rootD) {
          rootD = d;
          root = id;
        }
      });
      const dist = new Float64Array(index.nodes.length).fill(Number.POSITIVE_INFINITY);
      const prev = new Int32Array(index.nodes.length).fill(-1);
      const heap = new MinHeap();
      dist[root] = 0;
      heap.push(0, root);
      while (heap.size > 0) {
        const d = heap.peekKey();
        const n = heap.pop();
        if (d > (dist[n] as number)) continue;
        for (const id of adj[n] as number[]) {
          const e = edges[id] as (typeof edges)[number];
          const m = e.a === n ? e.b : e.a;
          const nd = d + e.w;
          if (nd < (dist[m] as number)) {
            dist[m] = nd;
            prev[m] = id;
            heap.push(nd, m);
          }
        }
      }
      const walk = (start: number) => {
        for (let n = start, guard = 0; (prev[n] as number) >= 0 && guard < 100000; guard++) {
          const pe = edges[prev[n] as number] as (typeof edges)[number];
          pe.uses++;
          n = pe.a === n ? pe.b : pe.a;
        }
      };
      const pointIndex = new PointIndex();
      edges.forEach((e, id) => {
        if (e.kind === 0) return;
        const sp = samplePath(e.p.xz, 2);
        for (let i = 0; i + 1 < sp.length; i += 2)
          pointIndex.add(sp[i] as number, sp[i + 1] as number, id, 3);
      });
      // Köke ulaşamayan noktalar öbeklerine (çizge bileşeni) göre toplanır: öbek başına tek bağlantı.
      const group = new Int32Array(index.nodes.length).map((_, i) => i);
      const find = (i: number): number => {
        while (group[i] !== i) i = group[i] = group[group[i] as number] as number;
        return i;
      };
      for (const e of edges) group[find(e.a)] = find(e.b);
      const unreached = new Map<number, Array<{ x: number; z: number }>>();
      const miss = (node: number, p: { x: number; z: number }) => {
        const g = find(node);
        const list = unreached.get(g) ?? [];
        list.push(p);
        unreached.set(g, list);
      };
      for (const door of localDoors) {
        const hit = pointIndex.nearest(door.x, door.z, DOOR_REACH);
        if (!hit) continue;
        const e = edges[hit.comp] as (typeof edges)[number];
        const start = (dist[e.a] as number) <= (dist[e.b] as number) ? e.a : e.b;
        if (!Number.isFinite(dist[start] as number)) {
          miss(e.a, { x: hit.x, z: hit.z });
          continue;
        }
        e.uses++;
        walk(start);
      }
      for (const end of entryEnds) {
        const n = index.find(end.x, end.z);
        if (n < 0) continue;
        if (!Number.isFinite(dist[n] as number)) {
          miss(n, end);
          continue;
        }
        walk(n);
      }
      used = edges
        .filter((e) => e.kind !== 0 && e.uses > 0)
        .map((e) => ({ xz: e.p.xz, uses: e.uses, connector: e.kind === 2 }));
      if (unreached.size === 0 || round === 2) break;
      // Köke ulaşamayan öbek: en yakın ulaşılan çizgiye A* ile.
      const reachable = new PointIndex();
      edges.forEach((e) => {
        if (!Number.isFinite(dist[e.a] as number)) return;
        const sp = samplePath(e.p.xz, 4);
        for (let i = 0; i + 1 < sp.length; i += 2)
          reachable.add(sp[i] as number, sp[i + 1] as number, 0, 3);
      });
      const next: number[][] = [...links];
      for (const points of unreached.values()) {
        // Öbeğin ulaşılan ağa en yakın noktası.
        let best: { p: { x: number; z: number }; q: { x: number; z: number; d: number } } | null =
          null;
        for (const p of points) {
          const q = reachable.nearest(p.x, p.z, best ? best.q.d : SETTLEMENT_LAYOUT.joinReach * 2);
          if (q && (best === null || q.d < best.q.d)) best = { p, q };
        }
        if (!best) continue;
        const route = findRoute(best.p.x, best.p.z, best.q.x, best.q.z, soft, {
          pad: 30,
          maxNodes: 30000,
        });
        if (route) next.push(route);
      }
      if (next.length === links.length) break;
      links = next;
    }

    // Ana cadde: çok kapıya giden yolların geçtiği sokak geniş olur (yapılara değmiyorsa).
    for (const u of used) {
      const road: RoadData = { cls: 3, xz: Float32Array.from(u.xz) };
      if (u.uses >= AVENUE_USES && avenueClear(u.xz)) road.width = ROADS.avenueWidth;
      (u.connector ? joins : kept).push(road);
    }
  });

  function avenueClear(xz: readonly number[]): boolean {
    const sp = samplePath(xz, 2);
    for (let i = 0; i + 1 < sp.length; i += 2) {
      if (footprints.contains(sp[i] as number, sp[i + 1] as number, ROADS.avenueWidth / 2 + 0.3))
        return false;
    }
    return true;
  }

  // Son güvence: kopuk kalan öbek (çizgede bağ olmayan yer) en yakın başka öbeğe bağlanır.
  const links2 = linkComponents([...roads, ...joins, ...kept], soft, nearTown);
  // Kırdaki bağlantılar (köy yolu) kent sokağı değildir.
  return dropOrphanLines(roads, {
    joins: [...joins, ...links2.filter((l) => l.cls !== 3)],
    streets: [...kept, ...links2.filter((l) => l.cls === 3)],
  });
}

/** Ağa bağlanamayan kent sokağı öbeği bu uzunluğun (oyun m) altındaysa silinir (yolun kopuk parçası kalmasın). */
const ORPHAN_MAX = 150;

/**
 * `linkComponents` rota bulamadığı (yapıların kuşattığı sıkışık merkez) kısa sokak/bağlantı öbekleri atılır: Sinop
 * merkezinde ağdan kopuk 52 m'lik sokak parçası böyleydi. Yalnız kent sokakları (sınıf 3) atılır; yollara ve uzun
 * öbeklere dokunulmaz.
 */
function dropOrphanLines(roads: readonly RoadData[], town: TownRoads): TownRoads {
  const all = [...roads, ...town.joins, ...town.streets];
  const samples = all.map((l) => samplePath(l.xz, 2));
  const comp = componentsOf(samples);
  const length = new Map<number, number>();
  all.forEach((l, i) => {
    const c = comp[i] as number;
    length.set(c, (length.get(c) ?? 0) + samplePathLength(l.xz));
  });
  const largest = [...length.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const orphan = (i: number): boolean => {
    const c = comp[i] as number;
    return c !== largest && (length.get(c) as number) < ORPHAN_MAX;
  };
  const first = roads.length;
  const joins = town.joins.filter((l, i) => l.cls !== 3 || !orphan(first + i));
  const second = first + town.joins.length;
  const streets = town.streets.filter((_, i) => !orphan(second + i));
  return { joins, streets };
}

/** Değme uzaklığı (oyun m): iki çizgi bu kadar yakın noktaya sahipse aynı ağdadır. */
const TOUCH = 2.6;

/**
 * Çizgilerin (yollar + sokaklar) bağlı bileşenleri birleştirilir: küçük bileşen, en yakın başka bileşen noktasına
 * (`joinReach` × 3 içinde) A* ile bağlanır (yapılardan kaçarak). Dönüş: eklenen bağlantılar (kentte sokak, kırda köy yolu).
 */
function linkComponents(
  lines: readonly RoadData[],
  field: RouteField,
  nearTown: (x: number, z: number) => boolean,
): RoadData[] {
  const added: RoadData[] = [];
  const samples = lines.map((l) => samplePath(l.xz, 2));
  for (let round = 0; round < 10; round++) {
    const all = [...samples, ...added.map((l) => samplePath(l.xz, 2))];
    const comp = componentsOf(all);
    const lengths = new Map<number, number>();
    all.forEach((sp, i) => {
      const c = comp[i] as number;
      lengths.set(c, (lengths.get(c) ?? 0) + sp.length);
    });
    if (lengths.size <= 1) break;
    const largest = [...lengths.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const index = new PointIndex();
    all.forEach((sp, i) => {
      for (let k = 0; k + 1 < sp.length; k += 4)
        index.add(sp[k] as number, sp[k + 1] as number, comp[i] as number, 3);
    });
    const order = [...lengths.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);
    const linked = new Set<number>();
    let count = 0;
    for (const c of order) {
      if (c === largest || linked.has(c)) continue;
      let best: {
        ax: number;
        az: number;
        q: { x: number; z: number; d: number; comp: number };
      } | null = null;
      all.forEach((sp, i) => {
        if (comp[i] !== c) return;
        for (let k = 0; k + 1 < sp.length; k += 4) {
          const x = sp[k] as number;
          const z = sp[k + 1] as number;
          const q = index.nearestOther(x, z, c, best ? best.q.d : SETTLEMENT_LAYOUT.joinReach * 3);
          if (q && (best === null || q.d < best.q.d)) best = { ax: x, az: z, q };
        }
      });
      if (!best) continue;
      const b = best as {
        ax: number;
        az: number;
        q: { x: number; z: number; d: number; comp: number };
      };
      const route = findRoute(b.ax, b.az, b.q.x, b.q.z, field, { pad: 60 });
      if (!route) {
        continue;
      }
      // Kentte sokak, kırda köy yolu.
      const mid = route.length >> 1;
      const inTown = nearTown(route[mid & ~1] as number, route[(mid & ~1) + 1] as number);
      added.push({ cls: inTown ? 3 : 1, xz: Float32Array.from(route) });
      linked.add(c).add(b.q.comp);
      count++;
    }
    if (count === 0) break;
  }
  return added;
}

/**
 * Çizgilerin bağlı bileşenleri: iki çizgi herhangi bir noktada `TOUCH` içinde yakınsa aynı bileşendir (kesişen
 * sokaklar, uç uca gelen yollar). Girdi: çizgi başına örnek noktalar. Dönüş: çizgi başına bileşen etiketi.
 */
function componentsOf(samples: ReadonlyArray<readonly number[]>): Int32Array {
  const parent = Int32Array.from({ length: samples.length }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i] as number] as number;
      i = parent[i] as number;
    }
    return i;
  };
  const cell = 4;
  const grid = new Map<number, Array<{ x: number; z: number; line: number }>>();
  const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
  samples.forEach((sp, li) => {
    for (let k = 0; k + 1 < sp.length; k += 2) {
      const x = sp[k] as number;
      const z = sp[k + 1] as number;
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const other of grid.get(key(cx + dx, cz + dz)) ?? []) {
            if (other.line !== li && Math.hypot(other.x - x, other.z - z) <= TOUCH) {
              parent[find(li)] = find(other.line);
            }
          }
        }
      }
      const list = grid.get(key(cx, cz));
      if (list) list.push({ x, z, line: li });
      else grid.set(key(cx, cz), [{ x, z, line: li }]);
    }
  });
  const out = new Int32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = find(i);
  return out;
}
