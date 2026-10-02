import { ROADS, ROAD_STRUCTURES } from '../config';
import { type PlannedRoad, type RoadPlan, type RoadSpan } from '../settlements/roadProfile';

/**
 * Yol yapılarının (köprü, viyadük) geometrisi (saf mantık, Three.js'siz): her yapı yönlü kutulardan kurulur.
 * Aynı kutular hem çizilir (`RoadStructureLayer`) hem çarpıştırılır (`RoadStructureColliders`); böylece görünen ile
 * basılan aynıdır. Kutu yönü: ileri (yol boyunca, eğimli), yan (yola dik, yatay) ve yukarı eksenlerinden oluşur.
 */

export interface StructureBox {
  /** Merkez (dünya). */
  x: number;
  y: number;
  z: number;
  /** Yarı boyutlar: ileri, yan, yukarı. */
  hl: number;
  hw: number;
  hh: number;
  /** İleri yön (birim, eğimli) ve yan yön (birim, yatay); yukarı = ileri × yan düzeltmesi. */
  fx: number;
  fy: number;
  fz: number;
  rx: number;
  rz: number;
  color: number;
  /** Çarpışır mı (ayaklar ve süs kutuları değil)? */
  solid: boolean;
}

/** Bir yapının kutuları ve sınırları. */
export interface StructureShape {
  span: RoadSpan;
  boxes: StructureBox[];
  /** Orta nokta ve yarıçap (yatay): uzamsal indeks ve eleme. */
  cx: number;
  cz: number;
  radius: number;
}

/** İleri yönden (fx, fy, fz) yan yön (yatay, sağ) ve yukarı yön: u = f × r düzeltmesi değil; r = yukarı × f. */
function frame(
  fx: number,
  fy: number,
  fz: number,
): { rx: number; rz: number; ux: number; uy: number; uz: number } {
  // r = normalize(up × f) = (fz, 0, -fx) / |…|
  const rl = Math.hypot(fz, fx) || 1;
  const rx = fz / rl;
  const rz = -fx / rl;
  // u = f × r
  const ux = fy * rz;
  const uy = fz * rx - fx * rz;
  const uz = -fy * rx;
  return { rx, rz, ux, uy, uz };
}

/** Birim yatay ileri yön (eğimsiz kutular: ayak, çerçeve). */
function level(ax: { fx: number; fz: number }): { fx: number; fz: number } {
  const h = Math.hypot(ax.fx, ax.fz) || 1;
  return { fx: ax.fx / h, fz: ax.fz / h };
}

/** Yol noktası dizinindeki (a → b) parça ekseni: birim ileri yön ve uzunluk. */
function segmentAxis(road: PlannedRoad, a: number, b: number) {
  const dx = (road.xz[b * 2] as number) - (road.xz[a * 2] as number);
  const dz = (road.xz[b * 2 + 1] as number) - (road.xz[a * 2 + 1] as number);
  const dy = (road.bed[b] as number) - (road.bed[a] as number);
  const len = Math.hypot(dx, dy, dz) || 1;
  return { fx: dx / len, fy: dy / len, fz: dz / len, len };
}

/**
 * Köprünün kutuları: güverte (yolun bedinde üst yüz), iki yan korkuluk, yüksekse ayaklar.
 */
export function structureShape(plan: RoadPlan, span: RoadSpan): StructureShape {
  const road = plan.roads[span.road] as PlannedRoad;
  const half = (ROADS.width[road.cls] as number) / 2;
  const S = ROAD_STRUCTURES;
  const boxes: StructureBox[] = [];
  const mid = (a: number, b: number, k: 'xz0' | 'xz1' | 'bed') =>
    k === 'bed'
      ? ((road.bed[a] as number) + (road.bed[b] as number)) / 2
      : k === 'xz0'
        ? ((road.xz[a * 2] as number) + (road.xz[b * 2] as number)) / 2
        : ((road.xz[a * 2 + 1] as number) + (road.xz[b * 2 + 1] as number)) / 2;

  const push = (
    a: number,
    b: number,
    lateral: number,
    top: number,
    hw: number,
    hh: number,
    color: number,
    solid: boolean,
    stretch = 0.06,
  ) => {
    const ax = segmentAxis(road, a, b);
    const f = frame(ax.fx, ax.fy, ax.fz);
    const cx = mid(a, b, 'xz0') + f.rx * lateral;
    const cz = mid(a, b, 'xz1') + f.rz * lateral;
    // `top`: kutunun üst yüzünün eksene göre yüksekliği (yatak + top); merkez hh kadar aşağıda.
    const cy = mid(a, b, 'bed') + top - hh * f.uy;
    boxes.push({
      x: cx - hh * f.ux,
      y: cy,
      z: cz - hh * f.uz,
      hl: ax.len / 2 + stretch,
      hw,
      hh,
      fx: ax.fx,
      fy: ax.fy,
      fz: ax.fz,
      rx: f.rx,
      rz: f.rz,
      color,
      solid,
    });
  };

  {
    const deckHalf = half + (S.widthPad[road.cls] as number);
    for (let i = span.i0; i < span.i1; i++) {
      push(i, i + 1, 0, 0, deckHalf, S.deckThickness / 2, S.colors.deck, true);
      for (const side of [-1, 1]) {
        push(
          i,
          i + 1,
          side * (deckHalf - S.parapetThickness / 2),
          S.parapetHeight,
          S.parapetThickness / 2,
          S.parapetHeight / 2,
          S.colors.parapet,
          true,
        );
      }
    }
    // Ayaklar: güverte zeminden yüksekse `pierSpacing` aralıkla (doğal zemine kadar).
    const every = Math.max(1, Math.round(S.pierSpacing / road.step));
    for (let i = span.i0 + every; i < span.i1; i += every) {
      const ground = road.natural[i] as number;
      const bottom = (road.bed[i] as number) - S.deckThickness;
      if (bottom - ground < S.pierMinHeight) continue;
      const hh = (bottom - ground) / 2 + 0.4;
      const ax = level(segmentAxis(road, i - 1, i));
      const f = frame(ax.fx, 0, ax.fz);
      boxes.push({
        x: road.xz[i * 2] as number,
        y: (bottom + ground) / 2 - 0.4 / 2,
        z: road.xz[i * 2 + 1] as number,
        hl: S.pierSize / 2,
        hw: deckHalf * 0.8,
        hh,
        fx: ax.fx,
        fy: 0,
        fz: ax.fz,
        rx: f.rx,
        rz: f.rz,
        color: S.colors.pier,
        solid: false,
      });
    }
  }

  const i0 = span.i0;
  const i1 = span.i1;
  const cx = ((road.xz[i0 * 2] as number) + (road.xz[i1 * 2] as number)) / 2;
  const cz = ((road.xz[i0 * 2 + 1] as number) + (road.xz[i1 * 2 + 1] as number)) / 2;
  const radius =
    Math.hypot(
      (road.xz[i1 * 2] as number) - (road.xz[i0 * 2] as number),
      (road.xz[i1 * 2 + 1] as number) - (road.xz[i0 * 2 + 1] as number),
    ) /
      2 +
    6;
  return { span, boxes, cx, cz, radius };
}

/** Kutu köşeleri için birim küp köşe işaretleri ve yüzler (dışa bakan, saat yönü tersi). */
const FACES: ReadonlyArray<{ n: [number, number, number]; v: Array<[number, number, number]> }> = [
  {
    n: [1, 0, 0],
    v: [
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [1, -1, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    v: [
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
      [-1, -1, -1],
    ],
  },
  {
    n: [0, 1, 0],
    v: [
      [-1, 1, -1],
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
    ],
  },
  {
    n: [0, -1, 0],
    v: [
      [-1, -1, 1],
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
    ],
  },
  {
    n: [0, 0, 1],
    v: [
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    v: [
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ],
  },
];

/** Kutu yerel eksenleri: x = yan, y = yukarı, z = ileri. */
export function boxBasis(b: StructureBox): {
  r: [number, number, number];
  u: [number, number, number];
  f: [number, number, number];
} {
  const fr = frame(b.fx, b.fy, b.fz);
  return { r: [b.rx, 0, b.rz], u: [fr.ux, fr.uy, fr.uz], f: [b.fx, b.fy, b.fz] };
}

/** Kutu listesini (konum, normal, renk) dizilerine döker; üçgen başına köşe indeksi yok (6 köşe/yüz). */
export function buildBoxVertices(boxes: readonly StructureBox[]): {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
} {
  const count = boxes.length * 36;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  let o = 0;
  for (const b of boxes) {
    const { r, u, f } = boxBasis(b);
    const cr = ((b.color >> 16) & 255) / 255;
    const cg = ((b.color >> 8) & 255) / 255;
    const cb = (b.color & 255) / 255;
    for (const face of FACES) {
      const nx = face.n[0] * r[0] + face.n[1] * u[0] + face.n[2] * f[0];
      const ny = face.n[0] * r[1] + face.n[1] * u[1] + face.n[2] * f[1];
      const nz = face.n[0] * r[2] + face.n[1] * u[2] + face.n[2] * f[2];
      const corner = (k: number) => {
        const c = face.v[k] as [number, number, number];
        const sx = c[0] * b.hw;
        const sy = c[1] * b.hh;
        const sz = c[2] * b.hl;
        return [
          b.x + sx * r[0] + sy * u[0] + sz * f[0],
          b.y + sx * r[1] + sy * u[1] + sz * f[1],
          b.z + sx * r[2] + sy * u[2] + sz * f[2],
        ] as const;
      };
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const p = corner(k);
        position[o * 3] = p[0];
        position[o * 3 + 1] = p[1];
        position[o * 3 + 2] = p[2];
        normal[o * 3] = nx;
        normal[o * 3 + 1] = ny;
        normal[o * 3 + 2] = nz;
        color[o * 3] = cr;
        color[o * 3 + 1] = cg;
        color[o * 3 + 2] = cb;
        o++;
      }
    }
  }
  return { position, normal, color };
}

/** Yapıların uzamsal dizini: şekiller (kutular) ilk sorguda tembel hesaplanır. */
export class StructureIndex {
  private readonly cell = 128;
  private readonly cells = new Map<number, number[]>();
  private readonly shapes = new Map<number, StructureShape>();
  private readonly centers: Array<{ x: number; z: number; r: number }> = [];

  constructor(private readonly plan: RoadPlan) {
    plan.spans.forEach((span, i) => {
      const road = plan.roads[span.road] as PlannedRoad;
      const ax = road.xz[span.i0 * 2] as number;
      const az = road.xz[span.i0 * 2 + 1] as number;
      const bx = road.xz[span.i1 * 2] as number;
      const bz = road.xz[span.i1 * 2 + 1] as number;
      const r = Math.hypot(bx - ax, bz - az) / 2 + 8;
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      this.centers.push({ x: cx, z: cz, r });
      const key = (kx: number, kz: number) => (kx + 32768) * 65536 + (kz + 32768);
      const k = key(Math.floor(cx / this.cell), Math.floor(cz / this.cell));
      const list = this.cells.get(k);
      if (list) list.push(i);
      else this.cells.set(k, [i]);
    });
  }

  get count(): number {
    return this.plan.spans.length;
  }

  /** Kimlik (plan.spans indeksi) → yapı şekli. */
  shape(id: number): StructureShape {
    let s = this.shapes.get(id);
    if (!s) {
      s = structureShape(this.plan, this.plan.spans[id] as RoadSpan);
      this.shapes.set(id, s);
    }
    return s;
  }

  /** Merkezi (x, z)'ye `radius` içinde olan yapıların kimlikleri. */
  near(x: number, z: number, radius: number): number[] {
    const out: number[] = [];
    const reach = radius + 160;
    const key = (kx: number, kz: number) => (kx + 32768) * 65536 + (kz + 32768);
    for (
      let kx = Math.floor((x - reach) / this.cell);
      kx <= Math.floor((x + reach) / this.cell);
      kx++
    ) {
      for (
        let kz = Math.floor((z - reach) / this.cell);
        kz <= Math.floor((z + reach) / this.cell);
        kz++
      ) {
        for (const id of this.cells.get(key(kx, kz)) ?? []) {
          const c = this.centers[id] as { x: number; z: number; r: number };
          if (Math.hypot(c.x - x, c.z - z) <= radius + c.r) out.push(id);
        }
      }
    }
    return out;
  }
}
