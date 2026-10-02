import { ROADS, ROAD_STRUCTURES } from '../config';
import {
  SPAN_KIND,
  type PlannedRoad,
  type RoadPlan,
  type RoadSpan,
} from '../settlements/roadProfile';
import { PORTAL_APRON } from './roadTunnels';

/**
 * Yol yapılarının (köprü, viyadük, tünel) geometrisi (saf mantık, Three.js'siz): her yapı yönlü kutulardan kurulur.
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
  /** Işıklı (tünel lambası): ışıktan bağımsız parlak çizilir. */
  emissive?: boolean;
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

/** Noktadaki (komşu noktalar arası) birim yatay yol yönü. */
function levelAxis(road: PlannedRoad, i: number): { fx: number; fz: number } {
  const n = road.xz.length / 2;
  const a = Math.max(0, i - 1);
  const b = Math.min(n - 1, i + 1);
  const dx = (road.xz[b * 2] as number) - (road.xz[a * 2] as number);
  const dz = (road.xz[b * 2 + 1] as number) - (road.xz[a * 2 + 1] as number);
  const h = Math.hypot(dx, dz) || 1;
  return { fx: dx / h, fz: dz / h };
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
 * Yapının kutuları (türe göre):
 *
 * - **beam** (beton kirişli köprü): beton güverte ve altında kiriş, alçak beton bordür + çelik korkuluk, köşeli ayaklar,
 *   uçlarda istinat (ayak) blokları.
 * - **viaduct**: beton güverte, yüksek beton korkuluk (parapet), yüksek çift ayaklar ve başlıkları.
 * - **arch** (taş kemer): taş güverte; yanlar kemer eğrisine kadar inen taş duvar (kemerin altı boştur), taş korkuluk.
 * - **wooden** (ahşap patika köprüsü): kalas güverte, dikmeli ahşap trabzan, kütük ayaklar.
 * - **tunnel**: beton zemin, kalın yan duvarlar ve tavan (iç yüzü koyu), tavan lambaları (ışıklı), iki ağızda taş/beton
 *   cephe (açıklığın iki yanı ve üstü).
 *
 * Güverte her zaman yatağın (bed) üstündedir ve iki ayak arasında düzdür (profil öyle tasarlar).
 */
export function structureShape(plan: RoadPlan, span: RoadSpan): StructureShape {
  const road = plan.roads[span.road] as PlannedRoad;
  const half = (ROADS.width[road.cls] as number) / 2;
  const S = ROAD_STRUCTURES;
  const C = S.colors;
  const boxes: StructureBox[] = [];
  const mid = (a: number, b: number, k: 'xz0' | 'xz1' | 'bed') =>
    k === 'bed'
      ? ((road.bed[a] as number) + (road.bed[b] as number)) / 2
      : k === 'xz0'
        ? ((road.xz[a * 2] as number) + (road.xz[b * 2] as number)) / 2
        : ((road.xz[a * 2 + 1] as number) + (road.xz[b * 2 + 1] as number)) / 2;

  /** Parça (a → b) boyunca, eksenden `lateral` yanda, üst yüzü yatak + `top` olan eğimli kutu. */
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
    emissive = false,
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
      ...(emissive ? { emissive: true } : {}),
    });
  };
  /** Yatay (eğimsiz) kutu: merkez (x, alt, z), yön noktası i'deki yol doğrultusu. */
  const level = (
    i: number,
    lateral: number,
    along: number,
    bottom: number,
    topY: number,
    hl: number,
    hw: number,
    color: number,
    solid: boolean,
  ) => {
    const ax = levelAxis(road, i);
    const rx = ax.fz;
    const rz = -ax.fx;
    const hh = Math.max(0.05, (topY - bottom) / 2);
    boxes.push({
      x: (road.xz[i * 2] as number) + rx * lateral + ax.fx * along,
      y: bottom + hh,
      z: (road.xz[i * 2 + 1] as number) + rz * lateral + ax.fz * along,
      hl,
      hw,
      hh,
      fx: ax.fx,
      fy: 0,
      fz: ax.fz,
      rx,
      rz,
      color,
      solid,
    });
  };

  const i0 = span.i0;
  const i1 = span.i1;
  if (span.kind === SPAN_KIND.tunnel) {
    const inner = half + S.tunnelSidePad;
    const H = S.tunnelHeight;
    const W = S.tunnelWall;
    for (let i = i0; i < i1; i++) {
      push(i, i + 1, 0, 0, inner + W, 0.35, C.tunnelFloor, true);
      for (const side of [-1, 1]) {
        push(i, i + 1, side * (inner + W / 2), H, W / 2, (H + 0.7) / 2, C.tunnel, true);
      }
      push(i, i + 1, 0, H + W, inner + W, W / 2, C.tunnel, true);
    }
    // Ağız önü zemini (beton): yolun ağızdan önceki parçası boyunca, yol eğimiyle (delinen kenar hücresini örter).
    const last = road.xz.length / 2 - 1;
    if (i0 > 0) push(i0 - 1, i0, 0, 0, inner, 0.35, C.tunnelFloor, true);
    if (i1 < last) push(i1, i1 + 1, 0, 0, inner, 0.35, C.tunnelFloor, true);
    // Lambalar: tavanın ortasında, ışıklı (ayrı malzeme).
    const every = Math.max(1, Math.round(S.lampSpacing / road.step));
    for (let i = i0 + Math.max(1, Math.floor(every / 2)); i < i1; i += every) {
      push(i, i + 1, 0, H, 0.18, 0.06, C.lamp, false, -road.step * 0.35, true);
    }
    // Ağız cepheleri: açıklığın iki yanı ve üstü (yolun doğal zeminine kadar iner). Cephe ağız düzleminin dışındadır ve
    // delinen kenar hücresini örtecek kalınlıktadır; önünde beton zemin.
    for (const [i, out] of [
      [i0, -1],
      [i1, 1],
    ] as const) {
      const bed = road.bed[i] as number;
      const wing = inner + W + S.portalWing;
      const crown = bed + H + W + S.portalCrown;
      const bottom = Math.min(bed, road.natural[i] as number) - 1;
      const sideHalf = (wing - inner) / 2;
      const along = out * (PORTAL_APRON / 2 + 0.2);
      const thick = PORTAL_APRON / 2;
      for (const side of [-1, 1]) {
        level(i, side * (inner + sideHalf), along, bottom, crown, thick, sideHalf, C.portal, true);
      }
      level(i, 0, along, bed + H, crown, thick, inner, C.portal, true);
      // Saçak: cephenin üstünde ince taşma.
      level(i, 0, along, crown, crown + 0.35, thick + 0.25, wing + 0.3, C.stoneDark, false);
    }
  } else {
    const type = span.type;
    const deckHalf = half + (S.widthPad[road.cls] as number);
    const stone = type === 'arch';
    const wooden = type === 'wooden';
    const deckColor = stone ? C.stone : wooden ? C.wood : C.deck;
    const deckThick = wooden ? 0.25 : stone ? 0.9 : S.deckThickness;
    for (let i = i0; i < i1; i++) {
      push(i, i + 1, 0, 0, deckHalf, deckThick / 2, deckColor, true);
      for (const side of [-1, 1]) {
        if (type === 'beam') {
          // Bordür + çelik korkuluk.
          push(i, i + 1, side * (deckHalf - 0.18), 0.32, 0.18, 0.16, C.parapet, true);
          push(i, i + 1, side * (deckHalf - 0.12), 0.95, 0.06, 0.13, C.guardRail, true);
        } else if (type === 'viaduct') {
          push(
            i,
            i + 1,
            side * (deckHalf - S.parapetThickness / 2),
            S.parapetHeight,
            S.parapetThickness / 2,
            S.parapetHeight / 2,
            C.parapet,
            true,
          );
        } else if (stone) {
          push(i, i + 1, side * (deckHalf - 0.22), 0.75, 0.22, 0.375, C.stoneDark, true);
        } else {
          // Ahşap trabzan: üst kuşak (dikmeler aşağıda).
          push(i, i + 1, side * (deckHalf - 0.08), 1.0, 0.06, 0.06, C.woodLight, true);
        }
      }
    }
    const length = (i1 - i0) * road.step;
    if (type === 'beam') {
      // Kiriş: güvertenin altında, ayak aralarında.
      for (let i = i0; i < i1; i++)
        push(i, i + 1, 0, -deckThick, deckHalf * 0.7, 0.3, C.pier, false);
      // Çelik korkuluk dikmeleri.
      for (let i = i0; i <= i1; i++) {
        for (const side of [-1, 1]) {
          const bed = road.bed[i] as number;
          level(
            i,
            side * (deckHalf - 0.12),
            0,
            bed + 0.3,
            bed + 1.05,
            0.07,
            0.07,
            C.guardRail,
            false,
          );
        }
      }
    }
    if (wooden) {
      for (let i = i0; i <= i1; i++) {
        for (const side of [-1, 1]) {
          const bed = road.bed[i] as number;
          level(
            i,
            side * (deckHalf - 0.08),
            0,
            bed - 0.1,
            bed + 1.06,
            0.08,
            0.08,
            C.woodLight,
            false,
          );
        }
      }
    }
    if (stone) {
      // Kemer: kenar duvarları, güvertenin altından kemer eğrisine kadar iner. Kemerin üzengisi açıklığın altındaki en
      // alçak zeminde (dere yatağı); kemer yüksekliği açıklığın yarısını ve güverte altını aşmaz.
      let spring = Number.POSITIVE_INFINITY;
      for (let i = i0; i <= i1; i++) spring = Math.min(spring, road.natural[i] as number);
      spring -= 0.3;
      const deckLow = Math.min(road.bed[i0] as number, road.bed[i1] as number) - deckThick - 0.35;
      const rise = Math.max(0.6, Math.min(length / 2, deckLow - spring));
      for (let i = i0; i < i1; i++) {
        const t = (i + 0.5 - i0) / (i1 - i0);
        const archY = spring + rise * Math.sin(Math.PI * t);
        const bedHere = ((road.bed[i] as number) + (road.bed[i + 1] as number)) / 2;
        const depth = Math.max(0.2, bedHere - deckThick - archY);
        for (const side of [-1, 1]) {
          push(
            i,
            i + 1,
            side * (deckHalf - 0.35),
            -deckThick,
            0.35,
            depth / 2,
            C.stone,
            false,
            0.02,
          );
        }
        // Kemer taşı (alt kuşak): kemer eğrisini belirginleştirir.
        push(i, i + 1, 0, -deckThick - depth, deckHalf, 0.18, C.stoneDark, false, 0.02);
      }
    }
    // Ayaklar ve istinat blokları.
    const pierColor = stone ? C.stone : wooden ? C.wood : C.pier;
    for (const [i, out] of [
      [i0, -1],
      [i1, 1],
    ] as const) {
      const bed = road.bed[i] as number;
      const ground = road.natural[i] as number;
      const bottom = Math.min(ground, bed) - 1.2;
      if (wooden) {
        for (const side of [-1, 1]) {
          level(i, side * (deckHalf - 0.2), 0, bottom, bed - 0.12, 0.16, 0.16, C.wood, false);
        }
      } else {
        level(i, 0, out * 0.6, bottom, bed - deckThick, 0.8, deckHalf + 0.3, pierColor, true);
      }
    }
    const every = Math.max(1, Math.round((wooden ? 6 : S.pierSpacing) / road.step));
    if (!stone) {
      for (let i = i0 + every; i < i1 - every / 2; i += every) {
        const ground = road.natural[i] as number;
        const bottomOfDeck = (road.bed[i] as number) - deckThick - (type === 'beam' ? 0.6 : 0);
        if (bottomOfDeck - ground < (wooden ? 0.4 : S.pierMinHeight)) continue;
        if (wooden) {
          for (const side of [-1, 1])
            level(
              i,
              side * (deckHalf - 0.2),
              0,
              ground - 0.5,
              bottomOfDeck,
              0.15,
              0.15,
              C.wood,
              false,
            );
        } else if (type === 'viaduct') {
          // Çift ayak + başlık.
          for (const side of [-1, 1]) {
            level(
              i,
              side * deckHalf * 0.45,
              0,
              ground - 0.6,
              bottomOfDeck - 0.6,
              S.pierSize / 2,
              S.pierSize / 2,
              C.pier,
              false,
            );
          }
          level(
            i,
            0,
            0,
            bottomOfDeck - 0.6,
            bottomOfDeck,
            S.pierSize * 0.7,
            deckHalf * 0.85,
            C.pier,
            false,
          );
        } else {
          level(i, 0, 0, ground - 0.6, bottomOfDeck, S.pierSize / 2, deckHalf * 0.7, C.pier, false);
        }
      }
    }
  }

  const cx = ((road.xz[i0 * 2] as number) + (road.xz[i1 * 2] as number)) / 2;
  const cz = ((road.xz[i0 * 2 + 1] as number) + (road.xz[i1 * 2 + 1] as number)) / 2;
  const radius =
    Math.hypot(
      (road.xz[i1 * 2] as number) - (road.xz[i0 * 2] as number),
      (road.xz[i1 * 2 + 1] as number) - (road.xz[i0 * 2 + 1] as number),
    ) /
      2 +
    8;
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
