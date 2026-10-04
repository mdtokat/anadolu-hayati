import type { Circle } from './area';

/**
 * Kaba yürüme ızgarası ve akış alanı (BR.2; saf). Uzak kademedeki NPC'ler bölgeye giderken düz çizgide dağ sırtına ya
 * da kıyıya takılmasın diye: güvenli daire başına bir kez, daireden dışa doğru (Dijkstra, 8 komşu) her ızgara hücresine
 * yürüme uzaklığı hesaplanır; NPC bulunduğu hücrenin en yakın komşusuna doğru yürür.
 */

export interface GridBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Yürünebilirlik ızgarası (bir kez kurulur). */
export class WalkGrid {
  readonly cols: number;
  readonly rows: number;
  readonly walk: Uint8Array;

  /** Hücre seçili alanın içinde mi (alan dışı geçişler pahalıdır)? */
  readonly inside: Uint8Array;

  constructor(
    readonly bounds: GridBounds,
    readonly cell: number,
    walkable: (x: number, z: number) => boolean,
    inArea: (x: number, z: number) => boolean = () => true,
  ) {
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
    this.rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
    this.walk = new Uint8Array(this.cols * this.rows);
    this.inside = new Uint8Array(this.cols * this.rows);
    // Hücre, merkezi ve dört yanındaki (`±0,35 · hücre`) noktalar yürünebilirse yürünebilirdir: kaba yol dik cep ve
    // dar sırtlardan geçmesin (ince adımda takılırdı).
    const o = cell * 0.35;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.center(r * this.cols + c);
        this.walk[r * this.cols + c] =
          walkable(p.x, p.z) &&
          walkable(p.x + o, p.z) &&
          walkable(p.x - o, p.z) &&
          walkable(p.x, p.z + o) &&
          walkable(p.x, p.z - o)
            ? 1
            : 0;
        this.inside[r * this.cols + c] = inArea(p.x, p.z) ? 1 : 0;
      }
    }
  }

  /** (x, z)'nin hücresi; ızgara dışındaysa −1. */
  index(x: number, z: number): number {
    const c = Math.floor((x - this.bounds.minX) / this.cell);
    const r = Math.floor((z - this.bounds.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  center(index: number): { x: number; z: number } {
    const r = Math.floor(index / this.cols);
    const c = index - r * this.cols;
    return {
      x: this.bounds.minX + (c + 0.5) * this.cell,
      z: this.bounds.minZ + (r + 0.5) * this.cell,
    };
  }
}

/** Alan dışı hücreden geçmenin maliyet çarpanı (yol alanın içinde kalmayı yeğler). */
const OUTSIDE_COST = 6;

const NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** İkili yığın (öncelik = uzaklık). */
class MinHeap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    const items = this.items;
    const keys = this.keys;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= key) break;
      items[i] = items[parent]!;
      keys[i] = keys[parent]!;
      i = parent;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop(): number {
    const items = this.items;
    const keys = this.keys;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const child = r < n && keys[r]! < keys[l]! ? r : l;
        if (keys[child]! >= lastKey) break;
        items[i] = items[child]!;
        keys[i] = keys[child]!;
        i = child;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

/** Bir güvenli daireye yürüme uzaklıkları (oyun m; ulaşılamayan hücre sonsuz). */
export class FlowField {
  private readonly dist: Float32Array;

  constructor(
    readonly grid: WalkGrid,
    readonly circle: Circle,
  ) {
    const { cols, rows, walk, cell } = grid;
    const dist = new Float32Array(cols * rows).fill(Infinity);
    const heap = new MinHeap();
    // Kaynaklar: dairenin içindeki yürünebilir hücreler (daire hücreden küçükse merkezin hücresi).
    for (let i = 0; i < dist.length; i++) {
      if (!walk[i]) continue;
      const p = grid.center(i);
      if (Math.hypot(p.x - circle.x, p.z - circle.z) <= Math.max(circle.r, cell * 0.75)) {
        dist[i] = 0;
        heap.push(i, 0);
      }
    }
    while (heap.size > 0) {
      const i = heap.pop();
      const d = dist[i]!;
      const r = Math.floor(i / cols);
      const c = i - r * cols;
      for (const [dc, dr, w] of NEIGHBORS) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const j = rr * cols + cc;
        if (!walk[j]) continue;
        // Çaprazda iki yan hücre de yürünebilir olmalı (köşeden geçilmez).
        if (dc !== 0 && dr !== 0 && (!walk[r * cols + cc] || !walk[rr * cols + c])) continue;
        const nd = d + w * cell * (grid.inside[j] ? 1 : OUTSIDE_COST);
        if (nd < dist[j]!) {
          dist[j] = nd;
          heap.push(j, nd);
        }
      }
    }
    this.dist = dist;
  }

  /** (x, z)'den daireye yürüme maliyeti (alan dışı adımlar pahalı) (ızgara dışı ya da ulaşılamazsa sonsuz). */
  distanceAt(x: number, z: number): number {
    const i = this.grid.index(x, z);
    return i < 0 ? Infinity : this.dist[i]!;
  }

  /**
   * Daireye doğru bir sonraki ara nokta: bulunduğu hücrenin en kısa uzaklıklı komşusunun merkezi. Daire hücresindeyse,
   * ızgara dışındaysa ya da ulaşılamazsa null (çağıran doğrudan hedefe yürür).
   */
  nextWaypoint(x: number, z: number): { x: number; z: number } | null {
    const grid = this.grid;
    const i = grid.index(x, z);
    if (i < 0) return null;
    const here = this.dist[i]!;
    if (here === 0 || here === Infinity) return null;
    const r = Math.floor(i / grid.cols);
    const c = i - r * grid.cols;
    let best = here;
    let bestIndex = -1;
    for (const [dc, dr] of NEIGHBORS) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= grid.cols || rr >= grid.rows) continue;
      const j = rr * grid.cols + cc;
      if (this.dist[j]! < best) {
        best = this.dist[j]!;
        bestIndex = j;
      }
    }
    return bestIndex < 0 ? null : grid.center(bestIndex);
  }
}
