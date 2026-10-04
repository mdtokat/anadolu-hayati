/**
 * NPC yol bulma (kullanıcı talimatı: "NPC'lerin hareketleri daha akıllı olsun"; saf mantık). Kinematik NPC doğrudan
 * yürüyemediğinde (duvar, çit, ağaç, kaya, bina köşesi) çevresindeki küçük bir ızgarada A* ile yol arar: kenarlar
 * `probe` ile sınanır (eğim, deniz, engeller, bina duvarları, merdiven/döşeme yüksekliği), bulunan yol ip çekmeyle
 * kısaltılır. Hedefe varılamıyorsa hedefe en çok yaklaşan düğüme giden kısmi yol döner (takılıp kalmasın).
 */

export interface Point {
  x: number;
  z: number;
}

/** (x0, z0)'da ayağı `y0`'da olan gövde (x1, z1)'e adım atabilir mi? Atabiliyorsa yeni ayak yüksekliği, değilse null. */
export type StepProbe = (
  x0: number,
  z0: number,
  y0: number,
  x1: number,
  z1: number,
) => number | null;

export interface PlanOptions {
  /** Izgara hücresi (oyun m). */
  cell: number;
  /** Başlangıçtan hedefe en uzak planlama (oyun m; uzak hedef bu uzaklıkta ara hedefe kırpılır). */
  maxDistance: number;
  /** Hedef ile başlangıcın çevresine bırakılan pay (oyun m). */
  margin: number;
  /** En çok genişletilen düğüm (bütçe). */
  maxExpand: number;
}

export const PLAN_DEFAULTS: PlanOptions = { cell: 1, maxDistance: 26, margin: 7, maxExpand: 900 };

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** İkili yığın (en küçük f önce). */
class Heap {
  private readonly items: number[] = [];
  constructor(private readonly f: Float64Array) {}
  get size(): number {
    return this.items.length;
  }
  push(i: number): void {
    const a = this.items;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.f[a[p]!]! <= this.f[a[k]!]!) break;
      [a[p], a[k]] = [a[k]!, a[p]!];
      k = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && this.f[a[l]!]! < this.f[a[m]!]!) m = l;
        if (r < a.length && this.f[a[r]!]! < this.f[a[m]!]!) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k]!, a[m]!];
        k = m;
      }
    }
    return top;
  }
}

/**
 * `start`'tan `goal`'a yol (başlangıç hariç ara noktalar, son nokta hedef ya da hedefe en yakın ulaşılan yer); hiç
 * ilerleme yoksa null.
 */
export function planPath(
  start: { x: number; y: number; z: number },
  goal: Point,
  probe: StepProbe,
  options: Partial<PlanOptions> = {},
): Point[] | null {
  const o = { ...PLAN_DEFAULTS, ...options };
  let gx = goal.x;
  let gz = goal.z;
  const dist = Math.hypot(gx - start.x, gz - start.z);
  if (dist > o.maxDistance) {
    const k = o.maxDistance / dist;
    gx = start.x + (gx - start.x) * k;
    gz = start.z + (gz - start.z) * k;
  }
  const minX = Math.min(start.x, gx) - o.margin;
  const minZ = Math.min(start.z, gz) - o.margin;
  const w = Math.ceil((Math.max(start.x, gx) + o.margin - minX) / o.cell) + 1;
  const h = Math.ceil((Math.max(start.z, gz) + o.margin - minZ) / o.cell) + 1;
  const n = w * h;
  const cx = (i: number): number => minX + (i % w) * o.cell;
  const cz = (i: number): number => minZ + Math.floor(i / w) * o.cell;
  const idx = (x: number, z: number): number =>
    Math.min(Math.max(Math.round((x - minX) / o.cell), 0), w - 1) +
    Math.min(Math.max(Math.round((z - minZ) / o.cell), 0), h - 1) * w;

  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const ys = new Float64Array(n);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const s = idx(start.x, start.z);
  const t = idx(gx, gz);
  const heuristic = (i: number): number => {
    const dx = Math.abs(cx(i) - gx);
    const dz = Math.abs(cz(i) - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  // Başlangıç düğümü gövdenin gerçek konumundadır (hücre merkezine ilk adım da sınanır).
  g[s] = 0;
  ys[s] = start.y;
  f[s] = heuristic(s);
  const open = new Heap(f);
  open.push(s);
  let best = s;
  let bestH = heuristic(s);
  let expanded = 0;
  while (open.size > 0 && expanded < o.maxExpand) {
    const i = open.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    expanded += 1;
    const hi = heuristic(i);
    if (hi < bestH) {
      bestH = hi;
      best = i;
    }
    if (i === t) break;
    const ix = i % w;
    const iz = Math.floor(i / w);
    const fx = i === s ? start.x : cx(i);
    const fz = i === s ? start.z : cz(i);
    for (const [dx, dz, cost] of DIRS) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const j = nx + nz * w;
      if (closed[j]) continue;
      const tentative = g[i]! + cost * o.cell;
      if (tentative >= g[j]!) continue;
      const y = probe(fx, fz, ys[i]!, cx(j), cz(j));
      if (y === null) continue;
      g[j] = tentative;
      ys[j] = y;
      parent[j] = i;
      f[j] = tentative + heuristic(j);
      open.push(j);
    }
  }
  if (best === s) return null;
  const chain: number[] = [];
  for (let k = best; k !== s && k !== -1; k = parent[k]!) chain.push(k);
  chain.reverse();
  const points = chain.map((k) => ({ x: cx(k), z: cz(k), y: ys[k]! }));
  if (best === t) points[points.length - 1] = { x: gx, z: gz, y: points[points.length - 1]!.y };
  return smooth({ x: start.x, z: start.z, y: start.y }, points, probe);
}

/** Doğrudan yürünebilir mi (0,5 m adımlarla)? */
export function lineWalkable(
  a: { x: number; z: number; y: number },
  b: Point,
  probe: StepProbe,
): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(len / 0.5));
  let x = a.x;
  let z = a.z;
  let y = a.y;
  for (let k = 1; k <= steps; k++) {
    const nx = a.x + ((b.x - a.x) * k) / steps;
    const nz = a.z + ((b.z - a.z) * k) / steps;
    const ny = probe(x, z, y, nx, nz);
    if (ny === null) return false;
    x = nx;
    z = nz;
    y = ny;
  }
  return true;
}

/** İp çekme: art arda düğümlerden doğrudan görülen en uzağına atlar. */
function smooth(
  start: { x: number; z: number; y: number },
  points: Array<{ x: number; z: number; y: number }>,
  probe: StepProbe,
): Point[] {
  const out: Point[] = [];
  let from = start;
  let i = 0;
  while (i < points.length) {
    // En çok 10 düğüm ileriye bakılır (bütçe: her deneme çizgiyi 0,5 m adımlarla sınar).
    let j = Math.min(points.length - 1, i + 10);
    while (j > i && !lineWalkable(from, points[j]!, probe)) j--;
    const p = points[j]!;
    out.push({ x: p.x, z: p.z });
    from = p;
    i = j + 1;
  }
  return out;
}
