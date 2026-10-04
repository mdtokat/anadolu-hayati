import { HORIZONTAL_SCALE, ROADS, ROAD_SIGNS, SETTLEMENT_LAYOUT } from '../config';
import type { RoadData } from '../data/settlements';
import { NodeIndex, pathLength } from './roadNetwork';
import { roadHalfWidth } from './roadWidth';

/**
 * Yol levhaları (saf mantık): kavşaklarda il merkezlerinin (ve yakın ilçe merkezlerinin) hangi kolda, yol ağı üzerinden
 * kaç kilometre ötede olduğunu gösteren yön levhaları; il/ilçe merkezlerine giren yollarda yerleşimin adı, nüfusu ve
 * rakımını gösteren giriş levhaları. Yerler ve yazılar yerleşim haritasıyla birlikte bir kez hesaplanır (bake'e girer).
 */

/** Levhadaki bir hedef: yerleşim adı ve yol ağı üzerinden gerçek uzaklık (km). */
export interface SignLine {
  name: string;
  km: number;
}

/** Yön levhasının bir kolu: plakanın gösterdiği yön (radyan, atan2(dz, dx)) ve hedefler (yakından uzağa). */
export interface SignArm {
  dir: number;
  lines: SignLine[];
}

export interface DirectionSign {
  kind: 'direction';
  x: number;
  z: number;
  /** Direğin dibindeki zemin (oyun y). */
  y: number;
  arms: SignArm[];
}

export interface EntranceSign {
  kind: 'entrance';
  x: number;
  z: number;
  y: number;
  /** Levha yüzünün baktığı yön (gelen sürücüye; radyan, atan2(dz, dx)). */
  face: number;
  name: string;
  rank: 'il' | 'ilce';
  population: number | null;
  /** Yerleşim merkezinin rakımı (gerçek m). */
  elevation: number;
}

export type RoadSign = DirectionSign | EntranceSign;

/** İl/ilçe merkezi: konum, kesim dairesinin yarıçapı (kent içi yollar kesilmiştir) ve levha bilgileri. */
export interface SignTown {
  x: number;
  z: number;
  r: number;
  name: string;
  rank: 'il' | 'ilce';
  population: number | null;
  elevation: number;
}

export interface SignTerrain {
  heightAt(x: number, z: number): number;
  /** Levha direği buraya konamaz (yol, yapı, su). */
  blocked(x: number, z: number): boolean;
}

/** Kenar: yol ve hangi ucundan girildiği. */
interface Edge {
  to: number;
  length: number;
  road: number;
  /** Yol bu düğümden başlıyorsa true (xz baştan okunur). */
  forward: boolean;
}

/** Gerçek kilometre (en az 1). */
export function realKm(gameMeters: number): number {
  return Math.max(1, Math.round((gameMeters * HORIZONTAL_SCALE) / 1000));
}

/** Çizgi boyunca baştan (ya da sondan) `s` oyun m ilerideki nokta ve o noktadaki ilerleme yönü. */
export function alongLine(
  xz: ArrayLike<number>,
  s: number,
  fromStart: boolean,
): { x: number; z: number; dx: number; dz: number } {
  const n = xz.length / 2;
  const at = (k: number) => (fromStart ? k : n - 1 - k);
  let left = s;
  for (let k = 0; k + 1 < n; k++) {
    const ax = xz[at(k) * 2] as number;
    const az = xz[at(k) * 2 + 1] as number;
    const bx = xz[at(k + 1) * 2] as number;
    const bz = xz[at(k + 1) * 2 + 1] as number;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-9) continue;
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    if (left <= len || k + 2 === n) {
      const t = Math.min(left, len);
      return { x: ax + dx * t, z: az + dz * t, dx, dz };
    }
    left -= len;
  }
  const x = xz[at(0) * 2] as number;
  const z = xz[at(0) * 2 + 1] as number;
  return { x, z, dx: 1, dz: 0 };
}

/** Basit ikili yığınla Dijkstra: `sources` düğümlerinden (başlangıç maliyetiyle) tüm düğümlere en kısa uzaklık. */
function dijkstra(
  adjacency: ReadonlyArray<ReadonlyArray<{ to: number; length: number }>>,
  sources: ReadonlyArray<{ node: number; cost: number }>,
): Float64Array {
  const dist = new Float64Array(adjacency.length).fill(Number.POSITIVE_INFINITY);
  const heap: Array<[number, number]> = [];
  const push = (d: number, v: number) => {
    heap.push([d, v]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((heap[p] as [number, number])[0] <= d) break;
      heap[i] = heap[p] as [number, number];
      i = p;
    }
    heap[i] = [d, v];
  };
  const pop = (): [number, number] => {
    const top = heap[0] as [number, number];
    const last = heap.pop() as [number, number];
    if (heap.length > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        let md = last[0];
        if (l < heap.length && (heap[l] as [number, number])[0] < md) {
          m = l;
          md = (heap[l] as [number, number])[0];
        }
        if (r < heap.length && (heap[r] as [number, number])[0] < md) m = r;
        if (m === i) break;
        heap[i] = heap[m] as [number, number];
        i = m;
      }
      heap[i] = last;
    }
    return top;
  };
  for (const s of sources) {
    if (s.cost < (dist[s.node] as number)) {
      dist[s.node] = s.cost;
      push(s.cost, s.node);
    }
  }
  while (heap.length > 0) {
    const [d, v] = pop();
    if (d > (dist[v] as number)) continue;
    for (const e of adjacency[v] as ReadonlyArray<{ to: number; length: number }>) {
      const nd = d + e.length;
      if (nd < (dist[e.to] as number)) {
        dist[e.to] = nd;
        push(nd, e.to);
      }
    }
  }
  return dist;
}

/** Açıyı (−π, π] aralığına getirir. */
function wrap(a: number): number {
  let v = a;
  while (v <= -Math.PI) v += Math.PI * 2;
  while (v > Math.PI) v -= Math.PI * 2;
  return v;
}

/**
 * Yön ve giriş levhalarını hesaplar. `roads`: kentlerde kesilmiş yol ağı (uçları kavşaklarda buluşur; kentten geçen
 * anayolun kent içi kesimi sınıf 3 caddedir).
 */
export function placeRoadSigns(
  roads: readonly RoadData[],
  towns: readonly SignTown[],
  terrain: SignTerrain,
): RoadSign[] {
  const S = ROAD_SIGNS;
  const index = new NodeIndex();
  const edges: Edge[][] = [];
  const nodeOf = (x: number, z: number) => {
    const id = index.node(x, z);
    while (edges.length <= id) edges.push([]);
    return id;
  };
  const lengths = roads.map((r) => pathLength(r.xz));
  roads.forEach((road, ri) => {
    const xz = road.xz;
    if (xz.length < 4) return;
    const a = nodeOf(xz[0] as number, xz[1] as number);
    const b = nodeOf(xz[xz.length - 2] as number, xz[xz.length - 1] as number);
    if (a === b) return;
    const length = lengths[ri] as number;
    (edges[a] as Edge[]).push({ to: b, length, road: ri, forward: true });
    (edges[b] as Edge[]).push({ to: a, length, road: ri, forward: false });
  });
  const roadNodes = edges.length;
  // Yol ağı merkeze kesim dairesinde ya da (kente varan bağlantı) ayak izi + `attachPad` içinde biter.
  const reachOf = (t: SignTown) =>
    t.r / SETTLEMENT_LAYOUT.innerRoadCut + ROADS.attachPad + S.edgeTolerance;
  // Kent merkezleri sanal düğümdür: kesim dairesine yakın her yol düğümüne düz uzaklıkla bağlanır (kentin içi sokaktır).
  const adjacency: Array<Array<{ to: number; length: number }>> = edges.map((list) =>
    list.map((e) => ({ to: e.to, length: e.length })),
  );
  const townNode = towns.map((t, ti) => {
    const id = roadNodes + ti;
    adjacency.push([]);
    for (const { id: n, d } of index.within(t.x, t.z, reachOf(t))) {
      (adjacency[id] as Array<{ to: number; length: number }>).push({ to: n, length: d });
      (adjacency[n] as Array<{ to: number; length: number }>).push({ to: id, length: d });
    }
    return id;
  });
  const fromTown = towns.map((_, ti) =>
    dijkstra(adjacency, [{ node: townNode[ti] as number, cost: 0 }]),
  );

  const insideTown = (x: number, z: number, factor: number) =>
    towns.some((t) => Math.hypot(x - t.x, z - t.z) < t.r * factor);
  const groundAt = (x: number, z: number) => terrain.heightAt(x, z);
  const signs: RoadSign[] = [];

  // --- Yön levhaları (kavşaklar) ---
  const junctionSites: Array<{ x: number; z: number }> = [];
  const order = Array.from({ length: roadNodes }, (_, i) => i).sort(
    (a, b) => (edges[b] as Edge[]).length - (edges[a] as Edge[]).length || a - b,
  );
  for (const node of order) {
    const list = edges[node] as Edge[];
    if (list.length < S.junctionMinArms) continue;
    if (!list.some((e) => (roads[e.road] as RoadData).cls <= 1)) continue;
    const at = index.nodes[node] as { x: number; z: number };
    if (insideTown(at.x, at.z, S.townClearance)) continue;
    if (junctionSites.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < S.mergeDistance)) continue;
    // Kollar: yönü ve her il/ilçe için o koldan uzaklık.
    interface Arm {
      dir: number;
      edges: Edge[];
    }
    const arms: Arm[] = [];
    for (const e of list) {
      const road = roads[e.road] as RoadData;
      const probe = alongLine(
        road.xz,
        Math.min(S.armProbe, (lengths[e.road] as number) * 0.5),
        e.forward,
      );
      const dir = Math.atan2(probe.z - at.z, probe.x - at.x);
      const same = arms.find((a) => Math.abs(wrap(a.dir - dir)) < (S.armMergeDeg * Math.PI) / 180);
      if (same) same.edges.push(e);
      else arms.push({ dir, edges: [e] });
    }
    if (arms.length < S.junctionMinArms) continue;
    // Her merkez için en kısa yolun ilk kolu.
    const best = towns.map((_, ti) => {
      const dist = fromTown[ti] as Float64Array;
      let arm = -1;
      let d = Number.POSITIVE_INFINITY;
      arms.forEach((a, ai) => {
        for (const e of a.edges) {
          const v = e.length + (dist[e.to] as number);
          if (v < d) {
            d = v;
            arm = ai;
          }
        }
      });
      return { arm, d };
    });
    const signArms: SignArm[] = [];
    arms.forEach((a, ai) => {
      const via = towns
        .map((t, ti) => ({ t, ...(best[ti] as { arm: number; d: number }) }))
        .filter((v) => v.arm === ai && Number.isFinite(v.d))
        .sort((p, q) => p.d - q.d);
      const ils = via.filter((v) => v.t.rank === 'il');
      const ilce = via.find((v) => v.t.rank === 'ilce');
      const lines: SignLine[] = [];
      const nearestIl = ils[0];
      if (
        ilce &&
        realKm(ilce.d) <= S.ilceMaxKm &&
        (!nearestIl || ilce.d < nearestIl.d * S.ilceShare)
      )
        lines.push({ name: ilce.t.name, km: realKm(ilce.d) });
      for (const v of ils) {
        if (lines.length >= S.maxLinesPerArm) break;
        lines.push({ name: v.t.name, km: realKm(v.d) });
      }
      if (lines.length > 0) signArms.push({ dir: a.dir, lines });
    });
    if (signArms.length === 0) continue;
    // Plaka sınırı: kollar sırayla birer hedef bırakır (en uzak hedefler önce düşer).
    let plates = signArms.reduce((n, a) => n + a.lines.length, 0);
    while (plates > S.maxPlates) {
      const longest = signArms.reduce((m, a) => (a.lines.length > m.lines.length ? a : m));
      if (longest.lines.length <= 1) break;
      longest.lines.pop();
      plates--;
    }
    // Direk: kolların arasındaki en geniş açının ortasında, yolların kenarının dışında.
    const dirs = arms.map((a) => a.dir).sort((p, q) => p - q);
    const gaps = dirs.map((d, i) => {
      const next =
        i + 1 < dirs.length ? (dirs[i + 1] as number) : (dirs[0] as number) + Math.PI * 2;
      return { mid: d + (next - d) / 2, size: next - d };
    });
    gaps.sort((p, q) => q.size - p.size);
    const half = Math.max(...list.map((e) => roadHalfWidth(roads[e.road] as RoadData)));
    let site: { x: number; z: number } | null = null;
    for (const g of gaps) {
      // Dar açıda direk yoldan uzaklaşmalı: kenara dik uzaklık = d · sin(açı/2).
      const spread = Math.max(0.35, Math.sin(Math.min(g.size, Math.PI) / 2));
      for (const extra of [0, 1.5, 3]) {
        const d = (half + S.sideOffset + extra) / spread;
        const x = at.x + Math.cos(g.mid) * d;
        const z = at.z + Math.sin(g.mid) * d;
        if (!terrain.blocked(x, z) && groundAt(x, z) > 0.1) {
          site = { x, z };
          break;
        }
      }
      if (site) break;
    }
    if (!site) continue;
    junctionSites.push(at);
    signs.push({
      kind: 'direction',
      x: site.x,
      z: site.z,
      y: groundAt(site.x, site.z),
      arms: signArms,
    });
  }

  // --- Giriş levhaları (il/ilçe merkezlerine giren yollar) ---
  // Her yol ucu, içinde (kesim dairesi + pay) kaldığı merkezlerden dairesinin sınırına en yakın olanına aittir: komşu
  // merkezlerin daireleri örtüşse de (Zonguldak–Kozlu) her giriş tek merkezi gösterir.
  const entranceSites: Array<{ x: number; z: number }> = [];
  const entrances: Array<{ t: SignTown; road: RoadData; ri: number; fromStart: boolean }> = [];
  roads.forEach((road, ri) => {
    if (road.cls > 2 || road.xz.length < 4) return;
    if ((lengths[ri] as number) < S.entranceOutward * 1.5) return;
    for (const fromStart of [true, false]) {
      const xz = road.xz;
      const ex = xz[fromStart ? 0 : xz.length - 2] as number;
      const ez = xz[fromStart ? 1 : xz.length - 1] as number;
      let owner: SignTown | null = null;
      let gap = Number.POSITIVE_INFINITY;
      for (const t of towns) {
        const d = Math.hypot(ex - t.x, ez - t.z);
        if (d > reachOf(t)) continue;
        if (Math.abs(d - t.r) < gap) {
          gap = Math.abs(d - t.r);
          owner = t;
        }
      }
      if (owner) entrances.push({ t: owner, road, ri, fromStart });
    }
  });
  // İl merkezleri önce: aynı yerdeki girişte il adı kalır.
  entrances.sort((p, q) => (p.t.rank === q.t.rank ? 0 : p.t.rank === 'il' ? -1 : 1));
  for (const { t, road, ri, fromStart } of entrances) {
    const xz = road.xz;
    const half = roadHalfWidth(road);
    let placed: { x: number; z: number; face: number } | null = null;
    // Kesim noktasından dışarı doğru; yer yoksa biraz daha dışarıda.
    for (const outward of [S.entranceOutward, S.entranceOutward * 1.8, S.entranceOutward * 2.8]) {
      if (outward > (lengths[ri] as number) * 0.7) break;
      const p = alongLine(xz, outward, fromStart);
      // Gelen sürücü kente doğru ilerler (yol kentten uzaklaşıyorsa giriş değildir).
      const hx = -p.dx;
      const hz = -p.dz;
      if ((t.x - p.x) * hx + (t.z - p.z) * hz <= 0) break;
      const face = Math.atan2(-hz, -hx);
      // Sağ taraf (gelen sürücünün); olmazsa sol. Levha yola dik durur: iç kenarı (ve iç direği) yol kenarından
      // `sideOffset` dışarıda.
      for (const side of [1, -1]) {
        const off = half + S.sideOffset + S.board.width / 2;
        const x = p.x - hz * side * off;
        const z = p.z + hx * side * off;
        const posts = signPosts({ kind: 'entrance', x, z, face } as EntranceSign);
        if (
          !terrain.blocked(x, z) &&
          posts.every((q) => !terrain.blocked(q.x, q.z)) &&
          groundAt(x, z) > 0.1
        ) {
          placed = { x, z, face };
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) continue;
    const at = placed;
    if (entranceSites.some((q) => Math.hypot(q.x - at.x, q.z - at.z) < S.entranceMerge)) continue;
    entranceSites.push(at);
    signs.push({
      kind: 'entrance',
      x: at.x,
      z: at.z,
      y: groundAt(at.x, at.z),
      face: at.face,
      name: t.name,
      rank: t.rank,
      population: t.population,
      elevation: t.elevation,
    });
  }
  return signs;
}

/** Direklerin yatay konumları (çizim ve çarpışma aynı noktayı kullanır). */
export function signPosts(sign: RoadSign): Array<{ x: number; z: number }> {
  if (sign.kind === 'direction') return [{ x: sign.x, z: sign.z }];
  const S = ROAD_SIGNS;
  const nx = Math.cos(sign.face);
  const nz = Math.sin(sign.face);
  // Levhanın yatay ekseni (ön yüze bakanın sağı) = (nz, −nx); direkler levhanın arkasında.
  const back = S.board.depth / 2 + S.post / 2;
  return [-1, 1].map((s) => ({
    x: sign.x + nz * s * (S.boardPosts / 2) - nx * back,
    z: sign.z - nx * s * (S.boardPosts / 2) - nz * back,
  }));
}

/** Levha yazısı için Türkçe büyük harf. */
export function signText(name: string): string {
  return name.toLocaleUpperCase('tr-TR');
}

/** Nüfus yazısı: binlik ayırıcı nokta (104.276). */
export function formatPopulation(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
