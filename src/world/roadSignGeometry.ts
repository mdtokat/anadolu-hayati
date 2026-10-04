import { ROAD_SIGNS } from '../config';
import { signPosts, type RoadSign } from '../settlements/roadSigns';
import { buildBoxVertices, srgbToLinear, type StructureBox } from './roadStructureGeometry';

/**
 * Yol levhalarının geometrisi (saf; Three.js'siz): direkler ve plaka/levha gövdeleri renkli kutular (+ ok uçları),
 * yazı yüzleri doku atlasındaki dikdörtgenlere (`SignSlot`) eşlenen dörtgenlerdir. Yön levhasında her hedef ayrı ok
 * biçimli plakadır (kolun yönüne bakar; iki yüzü de aynı yazıyı okunur biçimde taşır); giriş levhasının ön yüzü ad,
 * nüfus ve rakımı, arka yüzü (kentten çıkarken) kırmızı çizgili adı gösterir.
 */

/** Doku atlasında bir yazı yüzünün UV dikdörtgeni. */
export interface SignSlot {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Bir levhanın yazı yüzü isteği: atlas bunları çizer, geometri aynı sırayla slot bekler. */
export type SignFace =
  | { kind: 'plate'; name: string; km: number }
  | {
      kind: 'entrance';
      name: string;
      rank: 'il' | 'ilce';
      population: number | null;
      elevation: number;
    }
  | { kind: 'exit'; name: string };

export interface SignVertices {
  body: { position: Float32Array; normal: Float32Array; color: Float32Array };
  face: { position: Float32Array; normal: Float32Array; uv: Float32Array };
}

/** Levhanın yazı yüzleri (geometrinin beklediği slot sırasıyla). */
export function signFaces(sign: RoadSign): SignFace[] {
  if (sign.kind === 'entrance') {
    return [
      {
        kind: 'entrance',
        name: sign.name,
        rank: sign.rank,
        population: sign.population,
        elevation: sign.elevation,
      },
      { kind: 'exit', name: sign.name },
    ];
  }
  const out: SignFace[] = [];
  for (const arm of sign.arms) for (const l of arm.lines) out.push({ kind: 'plate', ...l });
  return out;
}

/** Bir yüz atlas'ta kaç birim yer kaplar (birim = plaka yazısı; giriş levhası iki birim yüksekliğinde). */
export function faceUnits(face: SignFace): number {
  return face.kind === 'plate' ? 1 : 2;
}

function hexOf(css: string): number {
  return Number.parseInt(css.slice(1), 16);
}

/** Yatay ileri yönlü kutu. */
function box(
  x: number,
  y: number,
  z: number,
  fx: number,
  fz: number,
  hl: number,
  hw: number,
  hh: number,
  color: string,
): StructureBox {
  const l = Math.hypot(fx, fz) || 1;
  const ux = fx / l;
  const uz = fz / l;
  return {
    x,
    y,
    z,
    hl,
    hw,
    hh,
    fx: ux,
    fy: 0,
    fz: uz,
    rx: uz,
    rz: -ux,
    color: hexOf(color),
    solid: true,
  };
}

class Writer {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly extra: number[] = [];
  tri(
    a: readonly number[],
    b: readonly number[],
    c: readonly number[],
    n: readonly number[],
    ea: readonly number[],
    eb: readonly number[],
    ec: readonly number[],
  ): void {
    this.position.push(...a, ...b, ...c);
    this.normal.push(...n, ...n, ...n);
    this.extra.push(...ea, ...eb, ...ec);
  }
}

/**
 * Düşey dörtgen: merkez, dışa normal (yatay), genişlik × yükseklik; u izleyicinin sağına, v yukarı artar (yazı her iki
 * yüzde de okunur).
 */
function quad(
  w: Writer,
  cx: number,
  cy: number,
  cz: number,
  nx: number,
  nz: number,
  width: number,
  height: number,
  slot: SignSlot,
): void {
  // İzleyicinin sağı = yukarı × normal.
  const rx = nz;
  const rz = -nx;
  const hw = width / 2;
  const hh = height / 2;
  const p = (s: number, t: number) => [cx + rx * s * hw, cy + t * hh, cz + rz * s * hw];
  const uv = (s: number, t: number) => [
    slot.u0 + ((s + 1) / 2) * (slot.u1 - slot.u0),
    slot.v0 + ((t + 1) / 2) * (slot.v1 - slot.v0),
  ];
  const n = [nx, 0, nz];
  // Saat yönü tersi (normal tarafından bakınca).
  w.tri(p(-1, -1), p(1, -1), p(1, 1), n, uv(-1, -1), uv(1, -1), uv(1, 1));
  w.tri(p(-1, -1), p(1, 1), p(-1, 1), n, uv(-1, -1), uv(1, 1), uv(-1, 1));
}

/** Levhanın köşe verisi; `slots` `signFaces(sign)` sırasıyladır. */
export function buildSignVertices(sign: RoadSign, slots: readonly SignSlot[]): SignVertices {
  const S = ROAD_SIGNS;
  const C = S.colors;
  const boxes: StructureBox[] = [];
  const tips = new Writer();
  const faces = new Writer();
  const post = S.post / 2;
  if (sign.kind === 'direction') {
    const plates: Array<{ dir: number }> = [];
    for (const arm of sign.arms) for (let k = 0; k < arm.lines.length; k++) plates.push(arm);
    const H = S.plate.height;
    const D = S.plate.depth / 2;
    const top = S.plateBase + plates.length * (H + S.plateGap) + 0.12;
    boxes.push(
      box(sign.x, sign.y + top / 2 - 0.2, sign.z, 1, 0, post, post, top / 2 + 0.2, C.post),
    );
    plates.forEach((plate, k) => {
      const slot = slots[k];
      const dx = Math.cos(plate.dir);
      const dz = Math.sin(plate.dir);
      // İlk plaka (ilk kolun en yakın hedefi) en üstte.
      const y = sign.y + S.plateBase + (plates.length - 1 - k) * (H + S.plateGap) + H / 2;
      const s0 = post + 0.02;
      const L = S.plate.width - S.plateTip;
      const mid = s0 + L / 2;
      boxes.push(box(sign.x + dx * mid, y, sign.z + dz * mid, dx, dz, L / 2, D, H / 2, C.plate));
      // Ok ucu: üçgen prizma (ön/arka üçgen + iki eğik yüz).
      const rx = dz;
      const rz = -dx;
      const baseS = s0 + L;
      const apexS = s0 + S.plate.width;
      const at = (s: number, side: number, h: number) => [
        sign.x + dx * s + rx * side,
        y + h,
        sign.z + dz * s + rz * side,
      ];
      const col = [
        srgbToLinear(((hexOf(C.plate) >> 16) & 255) / 255),
        srgbToLinear(((hexOf(C.plate) >> 8) & 255) / 255),
        srgbToLinear((hexOf(C.plate) & 255) / 255),
      ];
      for (const side of [D, -D]) {
        const n = side > 0 ? [rx, 0, rz] : [-rx, 0, -rz];
        tips.tri(
          at(baseS, side, -H / 2),
          at(apexS, side, 0),
          at(baseS, side, H / 2),
          n,
          col,
          col,
          col,
        );
      }
      const slope = Math.hypot(S.plateTip, H / 2);
      for (const up of [1, -1]) {
        const n = [(dx * (H / 2)) / slope, (up * S.plateTip) / slope, (dz * (H / 2)) / slope];
        const a = at(baseS, D, (up * H) / 2);
        const b = at(baseS, -D, (up * H) / 2);
        const c = at(apexS, -D, 0);
        const d = at(apexS, D, 0);
        tips.tri(a, b, c, n, col, col, col);
        tips.tri(a, c, d, n, col, col, col);
      }
      if (!slot) return;
      // Yazı yüzleri: dikdörtgen kısmın iki yanında.
      for (const side of [1, -1]) {
        const off = D + 0.004;
        quad(
          faces,
          sign.x + dx * mid + rx * off * side,
          y,
          sign.z + dz * mid + rz * off * side,
          rx * side,
          rz * side,
          L - 0.02,
          H - 0.02,
          slot,
        );
      }
    });
  } else {
    const nx = Math.cos(sign.face);
    const nz = Math.sin(sign.face);
    // Levhanın yatay ekseni (ön yüze bakan izleyicinin sağı).
    const ax = nz;
    const az = -nx;
    const W = S.board.width;
    const H = S.board.height;
    const D = S.board.depth / 2;
    const cy = sign.y + S.boardBase + H / 2;
    const top = S.boardBase + H;
    for (const p of signPosts(sign)) {
      boxes.push(box(p.x, sign.y + top / 2 - 0.2, p.z, 1, 0, post, post, top / 2 + 0.2, C.post));
    }
    boxes.push(box(sign.x, cy, sign.z, ax, az, W / 2, D, H / 2, C.back));
    const front = slots[0];
    const back = slots[1];
    if (front)
      quad(
        faces,
        sign.x + nx * (D + 0.004),
        cy,
        sign.z + nz * (D + 0.004),
        nx,
        nz,
        W - 0.03,
        H - 0.03,
        front,
      );
    if (back)
      quad(
        faces,
        sign.x - nx * (D + 0.004),
        cy,
        sign.z - nz * (D + 0.004),
        -nx,
        -nz,
        W - 0.03,
        H - 0.03,
        back,
      );
  }
  const boxVerts = buildBoxVertices(boxes);
  const n0 = boxVerts.position.length;
  const position = new Float32Array(n0 + tips.position.length);
  const normal = new Float32Array(n0 + tips.normal.length);
  const color = new Float32Array(n0 + tips.extra.length);
  position.set(boxVerts.position);
  position.set(tips.position, n0);
  normal.set(boxVerts.normal);
  normal.set(tips.normal, n0);
  color.set(boxVerts.color);
  color.set(tips.extra, n0);
  return {
    body: { position, normal, color },
    face: {
      position: Float32Array.from(faces.position),
      normal: Float32Array.from(faces.normal),
      uv: Float32Array.from(faces.extra),
    },
  };
}

/** Direklerin çarpışma kutuları (merkez, yarı boyutlar; eksen hizalı). */
export function signPostBoxes(
  sign: RoadSign,
): Array<{ x: number; y: number; z: number; hx: number; hy: number; hz: number }> {
  const S = ROAD_SIGNS;
  const half = Math.max(S.post / 2, 0.06);
  const h = sign.kind === 'direction' ? S.plateBase + 1 : S.boardBase + S.board.height;
  return signPosts(sign).map((p) => ({
    x: p.x,
    y: sign.y + h / 2,
    z: p.z,
    hx: half,
    hy: h / 2,
    hz: half,
  }));
}
