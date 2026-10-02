import { ROADS } from '../config';

/**
 * Rota arama (saf): iki nokta arasında maliyeti en düşük yolu A* ile bulur. Maliyet alanı çağıranındır
 * (eğim, dere geçişi, yasak bölge); ağ düzeni bağlantı yollarını (`roadNetwork.ts`), kent içi bağlantılar ise
 * yapı ayak izlerinden kaçan yolları bu arama ile çizer.
 */

/** Rota maliyet alanı. */
export interface RouteField {
  /** (x, z) noktasının maliyet çarpanı (≥ 1); `Infinity` = geçilemez. */
  cost(x: number, z: number): number;
}

export interface RouteOptions {
  /** Arama ızgarasının hücresi ve başlangıç/bitiş kutusunun pay'ı (oyun m). */
  cell?: number;
  pad?: number;
  /** Açılabilecek en çok düğüm; aşılırsa arama vazgeçer (null). */
  maxNodes?: number;
  /** Sonuç çizgisinin sadeleştirme toleransı (oyun m). */
  tolerance?: number;
}

/** Sekiz komşu yönü ve uzunlukları (hücre birimi). */
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

/** Küçük ikili yığın: (öncelik, düğüm) çiftleri. */
export class MinHeap {
  private keys: number[] = [];
  private items: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  /** En küçük önceliğin değeri (yığın boşken tanımsız). */
  peekKey(): number {
    return this.keys[0] as number;
  }

  push(key: number, item: number): void {
    const keys = this.keys;
    const items = this.items;
    let i = keys.length;
    keys.push(key);
    items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((keys[parent] as number) <= key) break;
      keys[i] = keys[parent] as number;
      items[i] = items[parent] as number;
      i = parent;
    }
    keys[i] = key;
    items[i] = item;
  }

  pop(): number {
    const keys = this.keys;
    const items = this.items;
    const top = items[0] as number;
    const lastKey = keys.pop() as number;
    const lastItem = items.pop() as number;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let child = i * 2 + 1;
        if (child >= n) break;
        if (child + 1 < n && (keys[child + 1] as number) < (keys[child] as number)) child++;
        if ((keys[child] as number) >= lastKey) break;
        keys[i] = keys[child] as number;
        items[i] = items[child] as number;
        i = child;
      }
      keys[i] = lastKey;
      items[i] = lastItem;
    }
    return top;
  }
}

/**
 * (ax, az) → (bx, bz) en düşük maliyetli rota: [x0, z0, x1, z1, …] (uçlar tam verilen noktalar). Yol bulunamazsa
 * ya da arama `maxNodes`'u aşarsa null. Başlangıç ve bitiş hücreleri maliyet alanında geçilemez olsa da kullanılır.
 */
export function findRoute(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  field: RouteField,
  options: RouteOptions = {},
): number[] | null {
  const cell = options.cell ?? ROADS.routeCell;
  const pad = options.pad ?? ROADS.routePad;
  const maxNodes = options.maxNodes ?? ROADS.routeMaxNodes;
  const tolerance = options.tolerance ?? ROADS.routeSimplifyTolerance;

  const x0 = Math.min(ax, bx) - pad;
  const z0 = Math.min(az, bz) - pad;
  const w = Math.ceil((Math.abs(bx - ax) + 2 * pad) / cell) + 1;
  const h = Math.ceil((Math.abs(bz - az) + 2 * pad) / cell) + 1;
  if (w * h > maxNodes * 4) return null;
  const toCol = (x: number) => Math.min(w - 1, Math.max(0, Math.round((x - x0) / cell)));
  const toRow = (z: number) => Math.min(h - 1, Math.max(0, Math.round((z - z0) / cell)));
  const start = toRow(az) * w + toCol(ax);
  const goal = toRow(bz) * w + toCol(bx);

  if (start === goal) return [ax, az, bx, bz];

  const costs = new Float32Array(w * h).fill(Number.NaN);
  const costAt = (index: number): number => {
    if (index === start || index === goal) return 1;
    let c = costs[index] as number;
    if (Number.isNaN(c)) {
      const col = index % w;
      const row = (index - col) / w;
      c = Math.max(1, field.cost(x0 + col * cell, z0 + row * cell));
      costs[index] = c;
    }
    return c;
  };

  const g = new Float32Array(w * h).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const gc = goal % w;
  const gr = (goal - gc) / w;
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(0, start);
  let opened = 0;
  let found = false;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) {
      found = true;
      break;
    }
    if (++opened > maxNodes) return null;
    const col = cur % w;
    const row = (cur - col) / w;
    const curCost = costAt(cur);
    for (const [dc, dr, len] of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
      const next = nr * w + nc;
      if (closed[next]) continue;
      const nextCost = costAt(next);
      if (!Number.isFinite(nextCost)) continue;
      const step = (len * cell * (curCost + nextCost)) / 2;
      const ng = (g[cur] as number) + step;
      if (ng < (g[next] as number)) {
        g[next] = ng;
        parent[next] = cur;
        heap.push(ng + Math.hypot(nc - gc, nr - gr) * cell, next);
      }
    }
  }
  if (!found) return null;

  const path: number[] = [];
  for (let at = goal; at !== -1; at = parent[at] as number) {
    const col = at % w;
    const row = (at - col) / w;
    path.push(x0 + col * cell, z0 + row * cell);
  }
  // Sondan başa dizildi: ters çevir (çiftleri koruyarak), uçları tam noktalara oturt.
  const out: number[] = [];
  for (let i = path.length - 2; i >= 0; i -= 2) out.push(path[i] as number, path[i + 1] as number);
  out[0] = ax;
  out[1] = az;
  out[out.length - 2] = bx;
  out[out.length - 1] = bz;
  return pullString(out, field, cell, tolerance);
}

/**
 * İp çekme: ızgara rotasındaki ara noktalar, iki nokta arasındaki düz çizgi tümüyle geçilebilirse ve maliyeti ızgara
 * rotasından belirgin yüksek değilse atılır. Sekiz yönlü ızgara rotası ≈ %8'e kadar uzundur; bu adımla düzleşir ve
 * geçilemez hücrelerin köşelerinden kesmez (düz çizgi örneklenerek denetlenir).
 */
function pullString(path: number[], field: RouteField, cell: number, slack: number): number[] {
  const n = path.length / 2;
  if (n <= 2) return path;
  const segmentCost = (ax: number, az: number, bx: number, bz: number): number => {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / (cell * 0.5)));
    let sum = 0;
    for (let k = 0; k <= steps; k++) {
      const c = field.cost(ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps);
      if (!Number.isFinite(c)) return Number.POSITIVE_INFINITY;
      sum += Math.max(1, c);
    }
    return (sum / (steps + 1)) * len;
  };
  const out: number[] = [path[0] as number, path[1] as number];
  let i = 0;
  while (i < n - 1) {
    let best = i + 1;
    let pathCost = 0;
    for (let j = i + 1; j < n; j++) {
      pathCost += segmentCost(
        path[(j - 1) * 2] as number,
        path[(j - 1) * 2 + 1] as number,
        path[j * 2] as number,
        path[j * 2 + 1] as number,
      );
      if (j === i + 1) continue;
      const direct = segmentCost(
        path[i * 2] as number,
        path[i * 2 + 1] as number,
        path[j * 2] as number,
        path[j * 2 + 1] as number,
      );
      // Düz çizgi geçilebilir ve ızgara rotasından (pay ile) pahalı değilse j'ye atlanabilir.
      if (Number.isFinite(direct) && direct <= pathCost * 1.02 + slack) best = j;
      else if (!Number.isFinite(direct) && j - i > 6) break;
    }
    out.push(path[best * 2] as number, path[best * 2 + 1] as number);
    i = best;
  }
  return out;
}
