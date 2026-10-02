/**
 * Yapı ayak izlerinin (döndürülmüş dikdörtgen) uzamsal kaydı (saf): yerleşim düzeni yeni bir yapıyı, merdivenini
 * ya da sokağı daha önce konmuş tüm yapılarla (komşu yerleşimlerinkiler dahil) çakışmaya karşı denetler.
 */

/** Dünya X/Z'de döndürülmüş dikdörtgen: merkez, yarı boyutlar (yerel x, z) ve dönüş (yapılarla aynı kural). */
export interface OrientedBox {
  x: number;
  z: number;
  hx: number;
  hz: number;
  yaw: number;
}

interface Entry {
  owner: number;
  corners: Float64Array; // 4 köşe: x0, z0, … x3, z3
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Kutunun dört köşesi (dünya). Yerel (lx, lz) → (x + lx·cos + lz·sin, z − lx·sin + lz·cos). */
export function boxCorners(b: OrientedBox): Float64Array {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const out = new Float64Array(8);
  const local = [
    [-b.hx, -b.hz],
    [b.hx, -b.hz],
    [b.hx, b.hz],
    [-b.hx, b.hz],
  ] as const;
  for (let i = 0; i < 4; i++) {
    const [lx, lz] = local[i] as readonly [number, number];
    out[i * 2] = b.x + lx * c + lz * s;
    out[i * 2 + 1] = b.z - lx * s + lz * c;
  }
  return out;
}

/** İki dışbükey dörtgen kesişiyor mu (ayırma ekseni sınaması; değme kesişme sayılmaz)? */
export function quadsOverlap(a: Float64Array, b: Float64Array): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const nx = -((poly[j * 2 + 1] as number) - (poly[i * 2 + 1] as number));
      const nz = (poly[j * 2] as number) - (poly[i * 2] as number);
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (let k = 0; k < 4; k++) {
        const pa = (a[k * 2] as number) * nx + (a[k * 2 + 1] as number) * nz;
        const pb = (b[k * 2] as number) * nx + (b[k * 2 + 1] as number) * nz;
        a0 = Math.min(a0, pa);
        a1 = Math.max(a1, pa);
        b0 = Math.min(b0, pb);
        b1 = Math.max(b1, pb);
      }
      if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
    }
  }
  return true;
}

/** Nokta dörtgenin (kenarlarından `margin` dışarısı dahil) içinde mi? Köşeler sırayla (saat yönü ya da tersi). */
function pointInQuad(q: Float64Array, x: number, z: number, margin: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const ex = (q[j * 2] as number) - (q[i * 2] as number);
    const ez = (q[j * 2 + 1] as number) - (q[i * 2 + 1] as number);
    const len = Math.hypot(ex, ez) || 1;
    const cross = (ex * (z - (q[i * 2 + 1] as number)) - ez * (x - (q[i * 2] as number))) / len;
    if (sign === 0) sign = Math.sign(cross) || 1;
    // İçeride: tüm kenarlarda aynı işaret; `margin` kadar dışarısı da sayılır.
    if (cross * sign < -margin) return false;
  }
  return true;
}

export class FootprintRegistry {
  private readonly cells = new Map<number, Entry[]>();

  constructor(private readonly cellSize = 32) {}

  private key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  private entry(owner: number, box: OrientedBox): Entry {
    const corners = boxCorners(box);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < 4; i++) {
      minX = Math.min(minX, corners[i * 2] as number);
      maxX = Math.max(maxX, corners[i * 2] as number);
      minZ = Math.min(minZ, corners[i * 2 + 1] as number);
      maxZ = Math.max(maxZ, corners[i * 2 + 1] as number);
    }
    return { owner, corners, minX, maxX, minZ, maxZ };
  }

  /** Kutuyu `owner` (yapı kimliği) adına ekler. */
  add(owner: number, box: OrientedBox): void {
    const e = this.entry(owner, box);
    for (
      let cx = Math.floor(e.minX / this.cellSize);
      cx <= Math.floor(e.maxX / this.cellSize);
      cx++
    ) {
      for (
        let cz = Math.floor(e.minZ / this.cellSize);
        cz <= Math.floor(e.maxZ / this.cellSize);
        cz++
      ) {
        const k = this.key(cx, cz);
        const list = this.cells.get(k);
        if (list) list.push(e);
        else this.cells.set(k, [e]);
      }
    }
  }

  /** Kutu kayıttaki bir kutuyla çakışıyor mu (`ignore` sahibininkiler hariç)? */
  overlaps(box: OrientedBox, ignore: number | null = null): boolean {
    const e = this.entry(-1, box);
    for (
      let cx = Math.floor(e.minX / this.cellSize);
      cx <= Math.floor(e.maxX / this.cellSize);
      cx++
    ) {
      for (
        let cz = Math.floor(e.minZ / this.cellSize);
        cz <= Math.floor(e.maxZ / this.cellSize);
        cz++
      ) {
        for (const o of this.cells.get(this.key(cx, cz)) ?? []) {
          if (o.owner === ignore) continue;
          if (o.maxX <= e.minX || o.minX >= e.maxX || o.maxZ <= e.minZ || o.minZ >= e.maxZ)
            continue;
          if (quadsOverlap(e.corners, o.corners)) return true;
        }
      }
    }
    return false;
  }

  /** (x, z) bir kutunun içinde ya da ona `margin` kadar yakın mı? */
  contains(x: number, z: number, margin = 0): boolean {
    const c0x = Math.floor((x - margin) / this.cellSize);
    const c1x = Math.floor((x + margin) / this.cellSize);
    const c0z = Math.floor((z - margin) / this.cellSize);
    const c1z = Math.floor((z + margin) / this.cellSize);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        for (const o of this.cells.get(this.key(cx, cz)) ?? []) {
          if (x < o.minX - margin || x > o.maxX + margin) continue;
          if (z < o.minZ - margin || z > o.maxZ + margin) continue;
          if (pointInQuad(o.corners, x, z, margin)) return true;
        }
      }
    }
    return false;
  }
}
