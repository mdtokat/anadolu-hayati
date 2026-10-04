import { BATTLE_ROYALE } from '../config';
import type { ProvinceShape } from '../data/region';
import type { Random } from '../utils/random';
import type { BrAreaChoice } from './kinds';

/**
 * Battle Royale oyun alanı (saf): il komşuluğu, bağlı il seçimi ve seçili illerin birleşiminin ızgara maskesi.
 *
 * Komşuluk il çokgenlerinden türetilir: iki ilin ortak sınır çizgisi `adjacency.minSharedLength`'ten uzunsa komşudur
 * (veri hattı il sınırlarını topolojiyi koruyarak sadeleştirdiğinden ortak köşeler birebir aynıdır; `tolerance` küçük
 * yuvarlama farkları içindir). Birden çok il seçilirken seçim **bağlı** kalmalıdır: her il seçimdeki başka bir ile
 * komşu olmalı (`toggleProvince` bunu korur).
 */

export type Adjacency = ReadonlyMap<string, ReadonlySet<string>>;

/** Hedef iller (oyuncunun oynayabileceği iller; komşu iller alan olamaz). */
export function targetProvinces(provinces: readonly ProvinceShape[]): ProvinceShape[] {
  return provinces.filter((p) => p.inRegion);
}

/** İllerin sınır komşuluğu (yalnız verilen iller arasında; simetrik). */
export function provinceAdjacency(provinces: readonly ProvinceShape[]): Adjacency {
  const { tolerance, minSharedLength } = BATTLE_ROYALE.area.adjacency;
  // Köşe hash'i: ilin köşeleri `tolerance` hücrelerinde; komşu hücrelere de bakılır.
  const key = (cx: number, cz: number): number => cx * 1_000_003 + cz;
  const vertexSets = provinces.map((province) => {
    const cells = new Map<number, Array<[number, number]>>();
    for (const polygon of province.polygons) {
      for (const ring of polygon) {
        for (let i = 0; i < ring.length; i += 2) {
          const x = ring[i]!;
          const z = ring[i + 1]!;
          const k = key(Math.floor(x / tolerance), Math.floor(z / tolerance));
          let list = cells.get(k);
          if (!list) cells.set(k, (list = []));
          list.push([x, z]);
        }
      }
    }
    return cells;
  });
  const near = (cells: Map<number, Array<[number, number]>>, x: number, z: number): boolean => {
    const cx = Math.floor(x / tolerance);
    const cz = Math.floor(z / tolerance);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = cells.get(key(cx + dx, cz + dz));
        if (list?.some(([px, pz]) => Math.hypot(px - x, pz - z) <= tolerance)) return true;
      }
    }
    return false;
  };
  const result = new Map<string, Set<string>>(provinces.map((p) => [p.name, new Set<string>()]));
  for (let a = 0; a < provinces.length; a++) {
    for (let b = a + 1; b < provinces.length; b++) {
      const pa = provinces[a]!;
      const pb = provinces[b]!;
      const ba = pa.bounds;
      const bb = pb.bounds;
      if (
        ba.maxX + tolerance < bb.minX ||
        bb.maxX + tolerance < ba.minX ||
        ba.maxZ + tolerance < bb.minZ ||
        bb.maxZ + tolerance < ba.minZ
      )
        continue;
      // A'nın iki ucu da B'nin bir köşesinde olan kenarlarının toplam uzunluğu = ortak sınır.
      const cells = vertexSets[b]!;
      let shared = 0;
      for (const polygon of pa.polygons) {
        for (const ring of polygon) {
          const n = ring.length / 2;
          for (let i = 0, j = n - 1; i < n && shared < minSharedLength; j = i++) {
            const x0 = ring[j * 2]!;
            const z0 = ring[j * 2 + 1]!;
            const x1 = ring[i * 2]!;
            const z1 = ring[i * 2 + 1]!;
            if (near(cells, x0, z0) && near(cells, x1, z1)) shared += Math.hypot(x1 - x0, z1 - z0);
          }
        }
      }
      if (shared >= minSharedLength) {
        result.get(pa.name)!.add(pb.name);
        result.get(pb.name)!.add(pa.name);
      }
    }
  }
  return result;
}

/** İl kümesi sınır komşuluğuyla bağlı mı (boş küme hayır; bilinmeyen il hayır)? */
export function isConnectedSelection(names: readonly string[], adjacency: Adjacency): boolean {
  if (names.length === 0 || names.some((n) => !adjacency.has(n))) return false;
  const wanted = new Set(names);
  const seen = new Set<string>([names[0]!]);
  const queue = [names[0]!];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const next of adjacency.get(current) ?? []) {
      if (wanted.has(next) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === wanted.size;
}

/** Seçime eklenebilecek iller: seçim boşsa hepsi, değilse seçimdekilerin seçilmemiş komşuları. */
export function addableProvinces(selection: readonly string[], adjacency: Adjacency): string[] {
  if (selection.length === 0) return [...adjacency.keys()];
  const chosen = new Set(selection);
  const out = new Set<string>();
  for (const name of selection) {
    for (const next of adjacency.get(name) ?? []) if (!chosen.has(next)) out.add(next);
  }
  return [...out];
}

/** Seçimden çıkarılabilir mi (kalan iller bağlı kalıyor ya da seçim boşalıyor)? */
export function canRemoveProvince(
  selection: readonly string[],
  name: string,
  adjacency: Adjacency,
): boolean {
  if (!selection.includes(name)) return false;
  const rest = selection.filter((n) => n !== name);
  return rest.length === 0 || isConnectedSelection(rest, adjacency);
}

/**
 * Bir ili seçime ekler ya da çıkarır; sonuç bağlı kalmıyorsa (komşu olmayan il eklemek, seçimi ikiye bölen ili
 * çıkarmak) null. Sıra korunur (eklenen sona).
 */
export function toggleProvince(
  selection: readonly string[],
  name: string,
  adjacency: Adjacency,
): string[] | null {
  if (selection.includes(name)) {
    return canRemoveProvince(selection, name, adjacency)
      ? selection.filter((n) => n !== name)
      : null;
  }
  return addableProvinces(selection, adjacency).includes(name) ? [...selection, name] : null;
}

/** Seçimin il adları (tüm harita = bütün hedef iller). */
export function areaProvinceNames(
  choice: BrAreaChoice,
  provinces: readonly ProvinceShape[],
): string[] {
  return choice.kind === 'world'
    ? targetProvinces(provinces).map((p) => p.name)
    : [...choice.names];
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Çift-tek kuralıyla tarama: bir çokgenin (halkalar: dış + delikler) `z` satırındaki kesişim x'leri. */
function rowCrossings(polygon: readonly Float64Array[], z: number, out: number[]): void {
  out.length = 0;
  for (const ring of polygon) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i * 2]!;
      const zi = ring[i * 2 + 1]!;
      const xj = ring[j * 2]!;
      const zj = ring[j * 2 + 1]!;
      if (zi > z !== zj > z) out.push(xi + ((z - zi) * (xj - xi)) / (zj - zi));
    }
  }
  out.sort((a, b) => a - b);
}

/**
 * Seçili illerin birleşimi, `maskCell` ızgarasında. Hücre, merkezi bir ilin çokgenindeyse o ile aittir; hiçbir ilin
 * içinde olmayan (kıyı şeridi) hücre `coastBufferM` içindeki en yakın ilin hücresinden ili alır. Alan = seçili illere
 * ait hücreler. Komşu (hedef olmayan) iller de rasterlenir: sınırdaki kıyı şeridi yanlış ile atanmasın.
 */
export class BrArea {
  readonly names: readonly string[];
  readonly cell: number;
  /** Izgaranın sol üst köşesi (oyun X/Z) ve boyutu. */
  readonly x0: number;
  readonly z0: number;
  readonly cols: number;
  readonly rows: number;
  /** Alandaki hücrelerin indeksleri (satır · cols + sütun). */
  readonly cells: Int32Array;
  private readonly mask: Uint8Array;

  constructor(
    provinces: readonly ProvinceShape[],
    names: readonly string[],
    cell: number = BATTLE_ROYALE.area.maskCell,
    coastBufferM: number = BATTLE_ROYALE.area.coastBufferM,
  ) {
    const selected = provinces.filter((p) => names.includes(p.name));
    if (selected.length === 0) throw new Error('Battle Royale alanı boş: il bulunamadı');
    this.names = selected.map((p) => p.name);
    this.cell = cell;
    const pad = coastBufferM + cell;
    const minX = Math.min(...selected.map((p) => p.bounds.minX)) - pad;
    const minZ = Math.min(...selected.map((p) => p.bounds.minZ)) - pad;
    const maxX = Math.max(...selected.map((p) => p.bounds.maxX)) + pad;
    const maxZ = Math.max(...selected.map((p) => p.bounds.maxZ)) + pad;
    this.x0 = minX;
    this.z0 = minZ;
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    const owner = new Uint8Array(this.cols * this.rows); // 0: il yok; i + 1: provinces[i]
    const crossings: number[] = [];
    provinces.forEach((province, index) => {
      const b = province.bounds;
      if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) return;
      const r0 = Math.max(0, Math.floor((b.minZ - minZ) / cell));
      const r1 = Math.min(this.rows - 1, Math.ceil((b.maxZ - minZ) / cell));
      for (const polygon of province.polygons) {
        for (let r = r0; r <= r1; r++) {
          const z = minZ + (r + 0.5) * cell;
          rowCrossings(polygon, z, crossings);
          for (let k = 0; k + 1 < crossings.length; k += 2) {
            // Merkezi [xa, xb) aralığında olan hücreler.
            const c0 = Math.max(0, Math.ceil((crossings[k]! - minX) / cell - 0.5));
            const c1 = Math.min(
              this.cols - 1,
              Math.ceil((crossings[k + 1]! - minX) / cell - 0.5) - 1,
            );
            for (let c = c0; c <= c1; c++) owner[r * this.cols + c] = index + 1;
          }
        }
      }
    });
    // Kıyı şeridi: ilsiz hücre, `coastBufferM` içindeki en yakın il hücresinin ilini alır.
    const reach = Math.ceil(coastBufferM / cell);
    const filled = owner.slice();
    if (reach > 0) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (owner[r * this.cols + c] !== 0) continue;
          let best = Infinity;
          let bestOwner = 0;
          for (let dr = -reach; dr <= reach; dr++) {
            const rr = r + dr;
            if (rr < 0 || rr >= this.rows) continue;
            for (let dc = -reach; dc <= reach; dc++) {
              const cc = c + dc;
              if (cc < 0 || cc >= this.cols) continue;
              const o = owner[rr * this.cols + cc]!;
              if (o === 0) continue;
              const d = Math.hypot(dr, dc) * cell;
              if (d <= coastBufferM + cell * 0.5 && d < best) {
                best = d;
                bestOwner = o;
              }
            }
          }
          filled[r * this.cols + c] = bestOwner;
        }
      }
    }
    const wanted = new Set(selected.map((p) => provinces.indexOf(p) + 1));
    this.mask = new Uint8Array(this.cols * this.rows);
    const list: number[] = [];
    for (let i = 0; i < filled.length; i++) {
      if (wanted.has(filled[i]!)) {
        this.mask[i] = 1;
        list.push(i);
      }
    }
    this.cells = Int32Array.from(list);
  }

  /** Seçimden alan kurar (tüm harita = bütün hedef iller). */
  static fromChoice(choice: BrAreaChoice, provinces: readonly ProvinceShape[]): BrArea {
    return new BrArea(provinces, areaProvinceNames(choice, provinces));
  }

  /** (x, z) alanın içinde mi? */
  contains(x: number, z: number): boolean {
    const c = Math.floor((x - this.x0) / this.cell);
    const r = Math.floor((z - this.z0) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    return this.mask[r * this.cols + c] === 1;
  }

  /** Alanın yüzölçümü (oyun m²; deniz hücreleri dahil değil — il çokgenleri karadadır). */
  get areaM2(): number {
    return this.cells.length * this.cell * this.cell;
  }

  /** Bir alan hücresinin merkezi. */
  cellCenter(index: number): { x: number; z: number } {
    const r = Math.floor(index / this.cols);
    const c = index - r * this.cols;
    return { x: this.x0 + (c + 0.5) * this.cell, z: this.z0 + (r + 0.5) * this.cell };
  }

  /** Alanın içinde düzgün dağılımlı rastgele nokta. */
  randomPoint(random: Random): { x: number; z: number } {
    const index = this.cells[Math.floor(random.next() * this.cells.length)]!;
    const r = Math.floor(index / this.cols);
    const c = index - r * this.cols;
    return {
      x: this.x0 + (c + random.next()) * this.cell,
      z: this.z0 + (r + random.next()) * this.cell,
    };
  }

  /** Alanı çevreleyen en küçük daire (hücre köşeleri dahil). */
  enclosingCircle(): Circle {
    // Dış bükey zarf için yalnız her satırın en batı/en doğu hücresi yeter.
    const points: Array<[number, number]> = [];
    let row = -1;
    let first = -1;
    let last = -1;
    const flush = (): void => {
      if (row < 0) return;
      const z0 = this.z0 + row * this.cell;
      for (const c of first === last ? [first] : [first, last]) {
        const xa = this.x0 + c * this.cell;
        points.push(
          [xa, z0],
          [xa + this.cell, z0],
          [xa, z0 + this.cell],
          [xa + this.cell, z0 + this.cell],
        );
      }
    };
    for (const index of this.cells) {
      const r = Math.floor(index / this.cols);
      const c = index - r * this.cols;
      if (r !== row) {
        flush();
        row = r;
        first = c;
      }
      last = c;
    }
    flush();
    return minimalEnclosingCircle(convexHull(points));
  }
}

/** Andrew'un tekdüze zincir algoritması (dış bükey zarf, saat yönünün tersine). */
export function convexHull(points: ReadonlyArray<[number, number]>): Array<[number, number]> {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function circleFrom2(a: [number, number], b: [number, number]): Circle {
  const x = (a[0] + b[0]) / 2;
  const z = (a[1] + b[1]) / 2;
  return { x, z, r: Math.hypot(a[0] - x, a[1] - z) };
}

function circleFrom3(a: [number, number], b: [number, number], c: [number, number]): Circle {
  const bx = b[0] - a[0];
  const bz = b[1] - a[1];
  const cx = c[0] - a[0];
  const cz = c[1] - a[1];
  const d = 2 * (bx * cz - bz * cx);
  if (Math.abs(d) < 1e-12) {
    // Doğrusal: en uzak iki nokta.
    const pairs: Array<[[number, number], [number, number]]> = [
      [a, b],
      [a, c],
      [b, c],
    ];
    return pairs.map(([p, q]) => circleFrom2(p, q)).reduce((m, k) => (k.r > m.r ? k : m));
  }
  const ux = (cz * (bx * bx + bz * bz) - bz * (cx * cx + cz * cz)) / d;
  const uz = (bx * (cx * cx + cz * cz) - cx * (bx * bx + bz * bz)) / d;
  return { x: a[0] + ux, z: a[1] + uz, r: Math.hypot(ux, uz) };
}

function inCircle(circle: Circle, p: [number, number]): boolean {
  return Math.hypot(p[0] - circle.x, p[1] - circle.z) <= circle.r * (1 + 1e-9) + 1e-7;
}

/**
 * Noktaları çevreleyen en küçük daire (Welzl, yinelemeli; girdi sırası deterministik: zarf noktaları sıralı gelir,
 * beklenen doğrusal süre için yerinde karıştırma sabit bir LCG ile yapılır).
 */
export function minimalEnclosingCircle(points: ReadonlyArray<[number, number]>): Circle {
  const pts = [...points];
  if (pts.length === 0) return { x: 0, z: 0, r: 0 };
  let state = 0x2545f491;
  for (let i = pts.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [pts[i], pts[j]] = [pts[j]!, pts[i]!];
  }
  let c: Circle = { x: pts[0]![0], z: pts[0]![1], r: 0 };
  for (let i = 1; i < pts.length; i++) {
    if (inCircle(c, pts[i]!)) continue;
    c = { x: pts[i]![0], z: pts[i]![1], r: 0 };
    for (let j = 0; j < i; j++) {
      if (inCircle(c, pts[j]!)) continue;
      c = circleFrom2(pts[i]!, pts[j]!);
      for (let k = 0; k < j; k++) {
        if (!inCircle(c, pts[k]!)) c = circleFrom3(pts[i]!, pts[j]!, pts[k]!);
      }
    }
  }
  return c;
}
