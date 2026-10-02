import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  Path,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { BUILDING_LOOK } from '../config';
import {
  BUILDING_SHAPES,
  CONTAINER_DIMS,
  GOVERNMENT_FLAG,
  ROOMS,
  SHAPE_DIMS,
  WALL_THICKNESS,
  mosqueOffset,
  type BuildingKind,
  type LocalBox,
} from '../settlements/kinds';
import {
  boxesOverlap,
  paneHole,
  subtractHoles,
  windowPanes,
  withoutOffset,
} from '../settlements/windows';
import { createRandom, type Random } from '../utils/random';

/**
 * Yerleşim yapıları için düşük poligonlu prosedürel geometri (Faz 10; doku yok, renk vertex renginde, düz
 * gölgeli). Yerel uzay: zemin katı döşemesi y = 0, ön yüz (kapı) +z. Taş temel ayrı bir örnekli kutudur
 * (`SettlementLayer`), burada yoktur. Mimari: Batı Karadeniz'in gerçek dokusu — kireç badanalı köy evleri ve
 * serenderler, çıkmalı ahşap Osmanlı konakları (Safranbolu), beton apartmanlar ve maden lojmanları (Zonguldak),
 * kubbeli/kurşun örtülü taş camiler ve kalem minareler, ahşap köy camileri, kitabeli çeşmeler, şahideli
 * mezarlıklar, hanlar, hamamlar, saat kuleleri, kuyu kuleleri. Çağıran `dispose()` eder.
 */

const C = BUILDING_LOOK.colors;
const D = SHAPE_DIMS;

interface Part {
  geometry: BufferGeometry;
  color: number;
  /** Yalnızca içeriden görünen parça (sıva, döşeme, eşya): `interior` kademesinde çizilir. */
  inner?: boolean;
  /** Yalnızca iç mekân çizilmezken (`near`) gerekli parça (kapı boşluğunun karanlığı). */
  outer?: boolean;
  /** Camlı pencerede delinecek duvar/sıva kutusu (eksene hizalı; `interior` kademesinde delinir). */
  cut?: boolean;
  /** Dış pencere levhası (cam/tahta): camlı pencerede `interior` kademesinde kaldırılır (içi görünsün). */
  pane?: boolean;
}

/**
 * Geometri varyantı: tür + (yıkık | apartman kat sayısı) + kademe. `interior` (oyuncuya en yakın yapılar) iç mekânı da
 * çizer (eşya, sıva, döşeme, içten pencereler); `near` yalnızca dış cepheyi ayrıntılı; `far` kaba siluet.
 */
export type BuildingLod = 'interior' | 'near' | 'far';

/** Parçaları iç mekân parçası olarak işaretler. */
function indoor(parts: Part[]): Part[] {
  for (const p of parts) p.inner = true;
  return parts;
}

function at(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  return geometry.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
}

/** Tabanı `y0`'da, merkezi (x, z) olan kutu. */
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y0: number,
  z: number,
  color: number,
): Part {
  return { geometry: at(new BoxGeometry(w, h, d), x, y0 + h / 2, z), color };
}

/** Kırma çatı (dört eğimli yüz): w × d tabanlı, `h` yüksekliğinde piramit; saçak `eave` taşar. */
function hipRoof(w: number, d: number, h: number, y0: number, color: number, eave = 0.45): Part {
  const g = new ConeGeometry(Math.SQRT1_2 * 2, h, 4, 1);
  g.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 4));
  g.applyMatrix4(new Matrix4().makeScale((w + eave * 2) / 2, 1, (d + eave * 2) / 2));
  return { geometry: at(g, 0, y0 + h / 2, 0), color };
}

/** Beşik çatı: mahya x ekseninde; iki eğimli yüz + iki üçgen alın. */
function gableRoof(w: number, d: number, h: number, y0: number, color: number, eave = 0.4): Part {
  const hw = w / 2 + eave;
  const hd = d / 2 + eave;
  const top = y0 + h;
  // Üçgenler (sarım dışa bakar).
  const v = [
    // ön eğim
    -hw,
    y0,
    hd,
    hw,
    y0,
    hd,
    hw,
    top,
    0,
    -hw,
    y0,
    hd,
    hw,
    top,
    0,
    -hw,
    top,
    0,
    // arka eğim
    hw,
    y0,
    -hd,
    -hw,
    y0,
    -hd,
    -hw,
    top,
    0,
    hw,
    y0,
    -hd,
    -hw,
    top,
    0,
    hw,
    top,
    0,
    // sağ alın
    hw,
    y0,
    hd,
    hw,
    y0,
    -hd,
    hw,
    top,
    0,
    // sol alın
    -hw,
    y0,
    -hd,
    -hw,
    y0,
    hd,
    -hw,
    top,
    0,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  return { geometry: g, color };
}

/** Yarım küre kubbe (taban y0). */
function dome(r: number, x: number, y0: number, z: number, color: number, segments = 12): Part {
  const g = new SphereGeometry(
    r,
    segments,
    Math.max(3, segments >> 1),
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  return { geometry: at(g, x, y0, z), color };
}

function cylinder(
  r: number,
  h: number,
  x: number,
  y0: number,
  z: number,
  color: number,
  seg = 8,
  rTop = r,
): Part {
  return { geometry: at(new CylinderGeometry(rTop, r, h, seg, 1), x, y0 + h / 2, z), color };
}

function cone(
  r: number,
  h: number,
  x: number,
  y0: number,
  z: number,
  color: number,
  seg = 8,
): Part {
  return { geometry: at(new ConeGeometry(r, h, seg, 1), x, y0 + h / 2, z), color };
}

/** Hilal alem (cami kubbesi ve minare tepesi): kısa direk + yarım halka. */
function alem(x: number, y0: number, z: number, size = 0.5): Part[] {
  const ring = new TorusGeometry(size * 0.45, size * 0.08, 4, 10, Math.PI * 1.4);
  ring.applyMatrix4(new Matrix4().makeRotationZ(-Math.PI * 0.2));
  return [
    cylinder(size * 0.06, size * 0.9, x, y0, z, C.gold, 4),
    { geometry: at(ring, x, y0 + size * 1.25, z), color: C.gold },
  ];
}

/**
 * Yüzeydeki pencereler: `face` ön (+z) / arka / sol (−x) / sağ (+x); satır başına `cols` pencere. Açık pencerelerde
 * kayıt (orta kayıt + yatay kuşak) ve altta taş denizlik vardır. `avoid`: alt satırda bu yerel konumlara (kapılar)
 * 0,9 m'den yakın pencere atlanır.
 */
function windows(
  face: 'front' | 'back' | 'left' | 'right',
  span: number,
  offset: number,
  rows: readonly number[],
  cols: number,
  size: readonly [number, number],
  random: Random,
  boardedChance = 0.25,
  skipCenterBottom = false,
  avoid: readonly number[] = [],
): Part[] {
  const parts: Part[] = [];
  const [ww, wh] = size;
  const t = 0.08;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols; c++) {
      if (skipCenterBottom && r === 0 && cols % 2 === 1 && c === (cols - 1) / 2) continue;
      const along = -span / 2 + (span / cols) * (c + 0.5);
      if (r === 0 && avoid.some((a) => Math.abs(a - along) < ww / 2 + 0.9)) continue;
      const y = rows[r] as number;
      const boarded = random.next() < boardedChance;
      const local: Part[] = [
        { ...box(ww, wh, t, 0, y, 0, boarded ? C.boarded : C.window), pane: true },
      ];
      if (!boarded) {
        // orta kayıt: yalnız yakın ayrıntı kademesinde (`interior`)
        local.push(...indoor([box(0.06, wh, 0.04, 0, y, 0.03, C.timber)]));
      }
      local.push(box(ww + 0.2, 0.07, 0.1, 0, y - 0.07, 0.02, C.sill)); // denizlik
      parts.push(...orient(local, face, along, offset));
    }
  }
  return parts;
}

/** Yerel (+z'ye bakan) parçaları bir cepheye taşır: ön/arka/sol/sağ yüzde `along` konumu, yüzün `offset` uzaklığı. */
function orient(
  parts: Part[],
  face: 'front' | 'back' | 'left' | 'right',
  along: number,
  offset: number,
): Part[] {
  const m = new Matrix4();
  if (face === 'front') m.makeTranslation(along, 0, offset);
  else if (face === 'back') m.makeRotationY(Math.PI).setPosition(along, 0, -offset);
  else if (face === 'left') m.makeRotationY(-Math.PI / 2).setPosition(-offset, 0, along);
  else m.makeRotationY(Math.PI / 2).setPosition(offset, 0, -along);
  for (const p of parts) p.geometry.applyMatrix4(m);
  return parts;
}

/**
 * Camlı pencerelerin iç kasası (girilebilir yapılar; `settlements/windows.ts`): iç sıvanın önünde ahşap kasa ve duvar
 * kalınlığınca orta kayıt. Cam ayrı katmandadır (`GlassLayer`); duvar `cut` parçalarında delinir.
 */
function windowFrames(kind: BuildingKind): Part[] {
  const parts: Part[] = [];
  const t = WALL_THICKNESS;
  for (const pane of windowPanes(kind)) {
    const hole = withoutOffset(paneHole(pane, 0), kind);
    const { w: ww, h: wh } = pane;
    const y = hole.cy - wh / 2;
    const inset = t / 2 + 0.035;
    // İç yüz: duvar orta düzleminden içeri t/2 + 0.035.
    const local: Part[] = [
      box(ww + 0.14, 0.07, 0.07, 0, y - 0.07, 0, C.timber),
      box(ww + 0.14, 0.07, 0.07, 0, y + wh, 0, C.timber),
      box(0.07, wh, 0.07, -ww / 2 - 0.035, y, 0, C.timber),
      box(0.07, wh, 0.07, ww / 2 + 0.035, y, 0, C.timber),
      // orta kayıt duvarın içinden geçer (cam iki yanında)
      box(0.05, wh, t, 0, y, inset, C.timber),
      // pencere içi denizlik (duvar kalınlığınca)
      box(ww, 0.04, t, 0, y - 0.04, inset, C.sill),
    ];
    const m = new Matrix4();
    // Yerel +z dışarı bakar: kasa z = 0'da (iç yüz), orta kayıt z = inset'te (duvar ortası).
    if (pane.face === 'front') m.makeTranslation(hole.cx, 0, hole.cz - inset);
    else if (pane.face === 'back')
      m.makeRotationY(Math.PI).setPosition(hole.cx, 0, hole.cz + inset);
    else if (pane.face === 'left')
      m.makeRotationY(-Math.PI / 2).setPosition(hole.cx + inset, 0, hole.cz);
    else m.makeRotationY(Math.PI / 2).setPosition(hole.cx - inset, 0, hole.cz);
    for (const p of local) p.geometry.applyMatrix4(m);
    parts.push(...local);
  }
  return indoor(parts);
}

/**
 * Camlı pencereler (kullanıcı talimatı: içeriden dışarısı görünsün). Dış pencere levhası camlı pencerede hiç tahtalı
 * olmaz (kademeler arası tutarlı); `interior` kademesinde levha kaldırılır ve duvar/sıva (`cut`) delinir.
 */
function openWindows(kind: BuildingKind, parts: Part[], lod: BuildingLod): Part[] {
  const holes = windowPanes(kind).map((pane) => withoutOffset(paneHole(pane), kind));
  if (holes.length === 0) return parts;
  const out: Part[] = [];
  for (const part of parts) {
    if (!part.pane && !(part.cut && lod === 'interior')) {
      out.push(part);
      continue;
    }
    part.geometry.computeBoundingBox();
    const bb = part.geometry.boundingBox!;
    const local: LocalBox = {
      cx: (bb.min.x + bb.max.x) / 2,
      cy: (bb.min.y + bb.max.y) / 2,
      cz: (bb.min.z + bb.max.z) / 2,
      hx: (bb.max.x - bb.min.x) / 2,
      hy: (bb.max.y - bb.min.y) / 2,
      hz: (bb.max.z - bb.min.z) / 2,
    };
    const hit = holes.some((h) => boxesOverlap(local, h));
    if (!hit) {
      out.push(part);
      continue;
    }
    if (part.pane) {
      if (lod === 'interior') part.geometry.dispose();
      else out.push({ ...part, color: C.window });
      continue;
    }
    part.geometry.dispose();
    for (const b of subtractHoles([local], holes)) {
      out.push({
        ...box(b.hx * 2, b.hy * 2, b.hz * 2, b.cx, b.cy - b.hy, b.cz, part.color),
        ...(part.inner ? { inner: true } : {}),
      });
    }
  }
  return out;
}

function door(w: number, h: number, z: number, x = 0): Part {
  return box(w, h, 0.1, x, 0, z, C.door);
}

/** Kapı kasası (dış yüzde): iki pervaz ve üst söve. */
function doorFrame(w: number, h: number, z: number, x = 0, color: number = C.timber): Part[] {
  return [
    box(0.14, h + 0.14, 0.1, x - w / 2 - 0.07, 0, z, color),
    box(0.14, h + 0.14, 0.1, x + w / 2 + 0.07, 0, z, color),
    box(w + 0.42, 0.16, 0.14, x, h, z, color),
  ];
}

/** Dışa taşan kuşak (kat silmesi): dört cephede ince bant (içi boş yapılarda gövdeyi kesmesin). */
function band(w: number, d: number, y: number, h: number, color: number, out = 0.04): Part[] {
  const t = 0.08;
  return [
    box(w + out * 2, h, t, 0, y, d / 2 + out - t / 2, color),
    box(w + out * 2, h, t, 0, y, -d / 2 - out + t / 2, color),
    box(t, h, d, -w / 2 - out + t / 2, y, 0, color),
    box(t, h, d, w / 2 + out - t / 2, y, 0, color),
  ];
}

/** Köşe taşları (dış köşelerde kesme taş dişleri). */
function quoins(w: number, d: number, h: number, color: number): Part[] {
  const parts: Part[] = [];
  const n = Math.max(2, Math.floor(h / 0.7));
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const long = i % 2 === 0;
      const hx = long ? 0.31 : 0.18;
      const hz = long ? 0.18 : 0.31;
      parts.push(
        box(
          hx * 2,
          0.3,
          hz * 2,
          sx * (w / 2 - hx + 0.02),
          i * (h / n) + 0.1,
          sz * (d / 2 - hz + 0.02),
          color,
        ),
      );
    }
  }
  return parts;
}

/** Oda duvarlarının döşeme altına inen payı (oyun m). */
const SKIRT = 0.5;

interface RoomOptions {
  w: number;
  d: number;
  /** Duvar yüksekliği (tavan). */
  h: number;
  door: number;
  doorX: number;
  doorH: number;
  wall: number;
  inner?: number;
  floor?: number;
  /** Tavan levhası (false: üstteki gövde/çatı tavan olur). */
  ceiling?: boolean;
  ceilingColor?: number;
  /** Tavan kirişleri (ahşap evler). */
  beams?: number;
  /** Açık kapı kanadı (içe açılmış). */
  leaf?: boolean;
}

/**
 * Girilebilir oda kabuğu: kapı boşluklu dört duvar (dış renk), iç sıva, süpürgelik, ahşap/taş döşeme, eşik, kapı
 * kasası, içe açılmış kanat ve tavan. Ölçüler `ROOMS`/`WALL_THICKNESS` ile collider'larla aynıdır.
 */
function roomShell(o: RoomOptions): Part[] {
  const { w, d, h, door: dw, doorX, doorH, wall } = o;
  const t = WALL_THICKNESS;
  const inner = o.inner ?? C.plasterInner;
  const floor = o.floor ?? C.plank;
  const fz = d / 2 - t / 2;
  const left = doorX - dw / 2 + w / 2;
  const right = w / 2 - (doorX + dw / 2);
  const iw = w - 2 * t;
  const id = d - 2 * t;
  const L = 0.02;
  // Dış duvarlar döşemenin altına `SKIRT` iner: yamaçta duvar dibi ile zemin arasında boşluk görünmesin.
  const walls: Part[] = [
    box(w, h + SKIRT, t, 0, -SKIRT, -d / 2 + t / 2, wall),
    box(t, h + SKIRT, id, -w / 2 + t / 2, -SKIRT, 0, wall),
    box(t, h + SKIRT, id, w / 2 - t / 2, -SKIRT, 0, wall),
    box(left, h + SKIRT, t, -w / 2 + left / 2, -SKIRT, fz, wall),
    box(right, h + SKIRT, t, w / 2 - right / 2, -SKIRT, fz, wall),
    box(dw, h - doorH, t, doorX, doorH, fz, wall),
  ];
  // Camlı pencerelerde (`settlements/windows.ts`) duvar ve iç sıva delinir.
  for (const p of walls) p.cut = true;
  const parts: Part[] = [
    ...walls,
    box(dw, 0.08, t + 0.1, doorX, -0.04, fz + 0.05, C.darkStone), // eşik
    ...doorFrame(dw, doorH, d / 2 + 0.03, doorX),
    // Uzaktan (iç mekân çizilmezken) kapı boşluğu karanlık görünür.
    { ...box(dw, doorH, 0.03, doorX, 0, fz - 0.05, C.window), outer: true },
  ];
  const plaster: Part[] = [
    box(iw, h, L, 0, 0, -d / 2 + t + L / 2, inner),
    box(L, h, id, -w / 2 + t + L / 2, 0, 0, inner),
    box(L, h, id, w / 2 - t - L / 2, 0, 0, inner),
    box(left - t, h, L, -w / 2 + t + (left - t) / 2, 0, d / 2 - t - L / 2, inner),
    box(right - t, h, L, w / 2 - t - (right - t) / 2, 0, d / 2 - t - L / 2, inner),
    box(dw, h - doorH, L, doorX, doorH, d / 2 - t - L / 2, inner),
  ];
  for (const p of plaster) p.cut = true;
  const inside: Part[] = [
    // iç sıva
    ...plaster,
    // süpürgelik
    box(iw, 0.14, 0.04, 0, 0, -d / 2 + t + 0.03, C.plankDark),
    box(0.04, 0.14, id, -w / 2 + t + 0.03, 0, 0, C.plankDark),
    box(0.04, 0.14, id, w / 2 - t - 0.03, 0, 0, C.plankDark),
    // döşeme
    box(iw, 0.07, id, 0, -0.04, 0, floor),
  ];
  parts.push(...indoor(inside));
  // Döşeme tahtası çizgileri (koyu derz).
  if (floor === C.plank) {
    for (let x = -iw / 2 + 0.45; x < iw / 2; x += 0.45) {
      parts.push(...indoor([box(0.025, 0.01, id, x, 0.03, 0, C.plankDark)]));
    }
  }
  if (o.leaf !== false) {
    // İçe açılmış kanat: menteşe kapının sol kenarında, kanat iç duvara dik durur.
    const lw = dw * 0.92;
    parts.push(
      ...indoor([
        box(0.06, doorH - 0.04, lw, doorX - dw / 2 + 0.06, 0.02, d / 2 - t - lw / 2, C.door),
        box(0.03, 0.08, 0.14, doorX - dw / 2 + 0.11, doorH * 0.48, d / 2 - t - lw + 0.12, C.gold),
      ]),
    );
  }
  if (o.ceiling !== false) {
    parts.push(...indoor([box(iw, 0.08, id, 0, h - 0.08, 0, o.ceilingColor ?? C.ceiling)]));
    const beams = o.beams ?? 0;
    for (let i = 0; i < beams; i++) {
      const x = -iw / 2 + (iw / (beams + 1)) * (i + 1);
      parts.push(...indoor([box(0.16, 0.18, id, x, h - 0.26, 0, C.timber)]));
    }
  }
  return parts;
}

/** Yıkık oda: kapı boşluklu ama kırık duvarlar, çatısız; döşeme ve yıkıntı (kaplar ayrıca eklenir). */
function ruinedRoom(
  w: number,
  d: number,
  h: number,
  dw: number,
  doorX: number,
  wall: number,
  random: Random,
): Part[] {
  const t = WALL_THICKNESS;
  const low = h * (0.35 + random.next() * 0.3);
  const left = doorX - dw / 2 + w / 2;
  const right = w / 2 - (doorX + dw / 2);
  const fz = d / 2 - t / 2;
  return [
    box(w, h, t, 0, 0, -d / 2 + t / 2, wall),
    box(t, h * 0.85, d - 2 * t, -w / 2 + t / 2, 0, 0, wall),
    box(t, low, d - 2 * t, w / 2 - t / 2, 0, 0, wall),
    box(left, h * 0.7, t, -w / 2 + left / 2, 0, fz, wall),
    box(right, low, t, w / 2 - right / 2, 0, fz, wall),
    box(w - 2 * t, 0.07, d - 2 * t, 0, -0.04, 0, C.plankDark),
    ...rubble(w * 0.12, d * 0.08, Math.min(w, d) * 0.4, random),
  ];
}

/** Yerel parçaları (x, z)'ye `facing` dönüşüyle (0 = ön yüz +z) taşır. */
function placeParts(parts: Part[], x: number, z: number, facing: number, y = 0): Part[] {
  const m = new Matrix4().makeRotationY(facing).setPosition(x, y, z);
  for (const p of parts) p.geometry.applyMatrix4(m);
  return parts;
}

/** Sandık (CONTAINER_DIMS.chest): ahşap gövde, kapak, demir kuşaklar, kilit. */
function chestParts(): Part[] {
  const { w, d, h } = CONTAINER_DIMS.chest;
  const body = h * 0.72;
  return indoor([
    box(w, body, d, 0, 0, 0, C.wood),
    box(w + 0.04, h - body, d + 0.04, 0, body, 0, C.timber),
    box(0.06, h + 0.01, d + 0.06, -w * 0.3, 0, 0, C.steel),
    box(0.06, h + 0.01, d + 0.06, w * 0.3, 0, 0, C.steel),
    box(0.14, 0.16, 0.04, 0, body - 0.1, d / 2 + 0.02, C.gold),
  ]);
}

/** Dolap (CONTAINER_DIMS.cupboard): çift kapaklı ahşap dolap, kaide ve korniş. */
function cupboardParts(): Part[] {
  const { w, d, h } = CONTAINER_DIMS.cupboard;
  return indoor([
    box(w - 0.04, 0.12, d - 0.04, 0, 0, 0, C.timber),
    box(w, h - 0.2, d, 0, 0.12, 0, C.woodLight),
    box(w + 0.08, 0.08, d + 0.06, 0, h - 0.08, 0, C.timber),
    box(w / 2 - 0.08, h - 0.5, 0.03, -w / 4, 0.28, d / 2 + 0.015, C.wood),
    box(w / 2 - 0.08, h - 0.5, 0.03, w / 4, 0.28, d / 2 + 0.015, C.wood),
    box(0.035, 0.14, 0.04, -0.06, h * 0.52, d / 2 + 0.04, C.gold),
    box(0.035, 0.14, 0.04, 0.06, h * 0.52, d / 2 + 0.04, C.gold),
  ]);
}

/** Yapının iç kapları (`BUILDING_SHAPES.containers`) görsel olarak. */
function containerParts(kind: BuildingKind): Part[] {
  const parts: Part[] = [];
  for (const c of BUILDING_SHAPES[kind].containers) {
    parts.push(
      ...placeParts(c.kind === 'chest' ? chestParts() : cupboardParts(), c.x, c.z, c.facing),
    );
  }
  return indoor(parts);
}

/** Kilim/halı: kenar bordürlü ince döşeme (y: zemin). */
function rug(x: number, z: number, w: number, d: number, color: number, accent: number): Part[] {
  return indoor([
    box(w, 0.02, d, x, 0.03, z, accent),
    box(w - 0.24, 0.022, d - 0.24, x, 0.031, z, color),
    box(w * 0.5, 0.024, d * 0.18, x, 0.032, z, accent),
  ]);
}

/** Sedir: duvar boyunca alçak divan, minder ve yaslanma yastıkları (yerel: arkası −z). */
function sedir(len: number): Part[] {
  const parts: Part[] = [
    box(len, 0.36, 0.72, 0, 0, 0, C.wood),
    box(len - 0.04, 0.12, 0.68, 0, 0.36, 0, C.cushion),
  ];
  const n = Math.max(1, Math.round(len / 0.8));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len / n) * (i + 0.5);
    parts.push(box(len / n - 0.08, 0.42, 0.16, x, 0.46, -0.26, C.kilim));
  }
  return indoor(parts);
}

/** Alçak sini sofrası / masa (yuvarlak üst). */
function table(x: number, z: number, r: number, h: number, color: number = C.wood): Part[] {
  return indoor([
    cylinder(r, 0.05, x, h - 0.05, z, color, 10),
    cylinder(0.08, h - 0.05, x, 0, z, C.timber, 6),
  ]);
}

/** Tabure. */
function stool(x: number, z: number): Part[] {
  return indoor([
    box(0.36, 0.06, 0.36, x, 0.4, z, C.woodLight),
    box(0.3, 0.4, 0.3, x, 0, z, C.timber),
  ]);
}

/** Ocak (şömine): taş gövde, koyu ağız, davlumbaz (yerel: arkası −z, duvara dayalı). */
function hearth(): Part[] {
  return indoor([
    box(1.3, 1.2, 0.5, 0, 0, 0, C.stone),
    box(0.75, 0.7, 0.04, 0, 0.12, 0.25, C.window),
    box(1.0, 1.2, 0.4, 0, 1.2, -0.05, C.plaster),
    box(1.45, 0.1, 0.62, 0, 1.15, 0.02, C.darkStone),
  ]);
}

/** Uzun tezgâh/masa (yerel: uzun kenar x). */
function counter(len: number, depth: number, h: number, color: number = C.wood): Part[] {
  return indoor([
    box(len, h - 0.06, depth, 0, 0, 0, color),
    box(len + 0.06, 0.06, depth + 0.06, 0, h - 0.06, 0, C.timber),
  ]);
}

/** Raf dolabı (dükkân; arkası −z): dikmeler ve dört raf, üstünde mallar. */
function shelf(len: number, random: Random): Part[] {
  const parts: Part[] = [
    box(0.06, 2, 0.4, -len / 2, 0, 0, C.timber),
    box(0.06, 2, 0.4, len / 2, 0, 0, C.timber),
  ];
  const goods = [C.kilim, C.tank, C.woodLight, C.sign, C.kilimAccent];
  for (let k = 0; k < 4; k++) {
    const y = 0.25 + k * 0.5;
    parts.push(box(len, 0.04, 0.4, 0, y, 0, C.woodLight));
    for (let i = 0; i < 4; i++) {
      if (random.next() < 0.35) continue;
      const gw = 0.15 + random.next() * 0.2;
      parts.push(
        box(
          gw,
          0.18 + random.next() * 0.12,
          0.25,
          -len / 2 + 0.25 + i * (len / 4),
          y + 0.04,
          0,
          goods[(i + k) % goods.length] as number,
        ),
      );
    }
  }
  return indoor(parts);
}

/** Ters sarım (içten görünen yüzler: kubbe içi, kasnak içi). */
function inward(geometry: BufferGeometry): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i += 3) {
    const x = pos.getX(i + 1);
    const y = pos.getY(i + 1);
    const z = pos.getZ(i + 1);
    pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g;
}

/** Ortasında yuvarlak delik olan yatay levha (cami tavanı: kubbe içten görünsün); `down` alttan görünür. */
function holedSlab(w: number, d: number, r: number, y: number, color: number, down: boolean): Part {
  const shape = new Shape();
  shape.moveTo(-w / 2, -d / 2);
  shape.lineTo(w / 2, -d / 2);
  shape.lineTo(w / 2, d / 2);
  shape.lineTo(-w / 2, d / 2);
  shape.lineTo(-w / 2, -d / 2);
  const hole = new Path();
  hole.absarc(0, 0, r, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new ShapeGeometry(shape, 16);
  g.applyMatrix4(new Matrix4().makeRotationX(down ? Math.PI / 2 : -Math.PI / 2));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return { geometry: at(g, 0, y, 0), color };
}

/** Yıkıntı yığını (yıkık yapıların içinde/yanında). */
function rubble(x: number, z: number, size: number, random: Random): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < 4; i++) {
    const s = size * (0.4 + random.next() * 0.5);
    parts.push(
      box(
        s,
        s * 0.45,
        s * 0.8,
        x + (random.next() - 0.5) * size,
        0,
        z + (random.next() - 0.5) * size,
        i % 2 ? C.rubble : C.roofTileDark,
      ),
    );
  }
  return parts;
}

// -- konutlar -------------------------------------------------------------------

/** Oda tablosu (`ROOMS`) kaydı: tanımlı olmalı. */
function room(kind: BuildingKind): NonNullable<(typeof ROOMS)[BuildingKind]> {
  const r = ROOMS[kind];
  if (!r) throw new Error(`oda tanımı yok: ${kind}`);
  return r;
}

/** İç dikdörtgen (duvar içi) yarı genişlik ve derinlik. */
function innerHalf(w: number, d: number): { hw: number; hd: number } {
  return { hw: w / 2 - WALL_THICKNESS, hd: d / 2 - WALL_THICKNESS };
}

function houseParts(random: Random, ruined: boolean): Part[] {
  const { w, d, h } = D.house;
  const r = room('house');
  const wallH = r.room;
  if (ruined) {
    return [
      ...ruinedRoom(w, d, wallH, r.door, r.doorX, C.whitewash, random),
      ...containerParts('house'),
    ];
  }
  const { hw, hd } = innerHalf(w, d);
  const rows = [1.05];
  const size = [0.85, 1.15] as const;
  return [
    ...roomShell({
      w,
      d,
      h: wallH,
      door: r.door,
      doorX: r.doorX,
      doorH: 2.1,
      wall: C.whitewash,
      beams: 3,
    }),
    // taş subasman ve ahşap kuşak (dış cephe)
    ...band(w, d, 0, 0.45, C.stone, 0.03),
    ...band(w, d, wallH - 0.32, 0.16, C.timber, 0.04),
    hipRoof(w, d, h - wallH, wallH, C.roofTile),
    ...windows('front', w, d / 2 + 0.02, rows, 3, size, random, 0.3, true),
    ...windows('left', d, w / 2 + 0.02, rows, 2, size, random),
    ...windows('right', d, w / 2 + 0.02, rows, 2, size, random),
    ...windows('back', w, d / 2 + 0.02, rows, 3, size, random),
    // baca
    box(0.55, 1.4, 0.55, 0.5, wallH + 0.5, -hd + 0.3, C.plaster),
    box(0.7, 0.12, 0.7, 0.5, wallH + 1.9, -hd + 0.3, C.darkStone),
    // iç: ocak, sedir, kilim, sini
    ...placeParts(hearth(), 0.5, -hd + 0.25, 0),
    ...placeParts(sedir(2.4), -hw + 0.36, -0.2, Math.PI / 2),
    ...rug(0, 0.3, 2.4, 1.8, C.kilim, C.kilimAccent),
    ...table(0.1, 0.4, 0.45, 0.32),
    ...containerParts('house'),
  ];
}

function konakParts(random: Random, ruined: boolean): Part[] {
  const { w, d, h } = D.konak;
  const r = room('konak');
  const ground = r.room;
  const upper = 2.6;
  const over = 0.7; // çıkma
  if (ruined) {
    return [
      ...ruinedRoom(w, d, ground, r.door, r.doorX, C.stone, random),
      ...containerParts('konak'),
    ];
  }
  const { hw, hd } = innerHalf(w, d);
  const parts: Part[] = [
    // taş zemin kat (oda) ve çıkmalı ahşap üst kat (bağdadi: badanalı sıva + ahşap dikmeler)
    ...roomShell({
      w,
      d,
      h: ground,
      door: r.door,
      doorX: r.doorX,
      doorH: 2.2,
      wall: C.stone,
      ceiling: true,
      ceilingColor: C.woodLight,
      beams: 4,
    }),
    ...quoins(w, d, ground, C.cutStone),
    box(w + over, upper, d + over, 0, ground, 0, C.konakWall),
    // çıkma altı payandaları (dış kenarda kuşak) ve eğik destekler
    ...band(w + over - 0.1, d + over - 0.1, ground - 0.1, 0.2, C.timber, 0.05),
    hipRoof(w + over, d + over, h - ground - upper, ground + upper, C.roofTile, 0.75),
    ...windows('front', w, d / 2 + 0.02, [1], 2, [0.6, 0.8], random, 0.4, false, [r.doorX]),
    // üst kat: sık, dikdörtgen pencereler (kafesli görünüm: koyu)
    ...windows(
      'front',
      w + over,
      (d + over) / 2 + 0.02,
      [ground + 0.7],
      5,
      [0.7, 1.2],
      random,
      0.25,
    ),
    ...windows('left', d + over, (w + over) / 2 + 0.02, [ground + 0.7], 3, [0.7, 1.2], random),
    ...windows('right', d + over, (w + over) / 2 + 0.02, [ground + 0.7], 3, [0.7, 1.2], random),
    ...windows('back', w + over, (d + over) / 2 + 0.02, [ground + 0.7], 4, [0.7, 1.2], random),
    // iç: ocak, sedir, kilim, sini
    ...placeParts(hearth(), 0, -hd + 0.25, 0),
    ...placeParts(sedir(3.4), hw - 0.36, 0.3, -Math.PI / 2),
    ...rug(0, 0.6, 3.2, 2.4, C.kilim, C.kilimAccent),
    ...table(0.2, 0.6, 0.5, 0.32),
    ...containerParts('konak'),
  ];
  // Payandalar (çıkmanın altında eğik ahşap).
  for (const x of [-w / 2 + 0.6, -w / 6, w / 6, w / 2 - 0.6]) {
    const brace = new BoxGeometry(0.12, 0.85, 0.12);
    brace.applyMatrix4(new Matrix4().makeRotationX(-0.6));
    parts.push({ geometry: at(brace, x, ground - 0.42, d / 2 + 0.2), color: C.timber });
  }
  // Ahşap dikmeler (ön cephe) ve üst kuşak.
  for (let i = 0; i <= 4; i++) {
    const x = -(w + over) / 2 + ((w + over) / 4) * i;
    parts.push(box(0.12, upper, 0.06, x, ground, (d + over) / 2 + 0.03, C.timber));
  }
  parts.push(...band(w + over, d + over, ground + upper - 0.12, 0.12, C.timber, 0.03));
  return parts;
}

function apartmentParts(random: Random, floors: number): Part[] {
  const { w, d, floorH } = D.apartment;
  const r = room('apartment');
  const h = floors * floorH;
  const { hw, hd } = innerHalf(w, d);
  const parts: Part[] = [
    ...roomShell({
      w,
      d,
      h: r.room,
      door: r.door,
      doorX: r.doorX,
      doorH: 2.2,
      wall: C.concrete,
      floor: C.sill,
      ceilingColor: C.marble,
    }),
    // üst katlar (girilmez) ve kat silmeleri
    box(w, h - r.room, d, 0, r.room, 0, C.concrete),
    // çatı korkuluğu ve su deposu/güneş paneli (Türkiye'de yaygın)
    box(w, 0.5, 0.2, 0, h, d / 2 - 0.1, C.concreteDark),
    box(w, 0.5, 0.2, 0, h, -d / 2 + 0.1, C.concreteDark),
    box(0.2, 0.5, d, -w / 2 + 0.1, h, 0, C.concreteDark),
    box(0.2, 0.5, d, w / 2 - 0.1, h, 0, C.concreteDark),
    cylinder(0.35, 1.4, w * 0.25, h, -d * 0.2, C.tank, 6),
    box(1.6, 0.08, 1.1, w * 0.25 - 1, h + 0.5, -d * 0.2, C.window),
    box(2.4, 0.15, 1.2, 0, 2.4, d / 2 + 0.6, C.concreteDark), // giriş saçağı
    // giriş holü: posta kutuları, bank, paspas
    ...indoor([box(0.12, 0.6, 1.3, hw - 0.08, 1.2, 1.2, C.steel)]),
    ...counter(1.6, 0.4, 0.45, C.woodLight).map((p) => ({
      ...p,
      geometry: p.geometry.applyMatrix4(new Matrix4().makeTranslation(-1.5, 0, -hd + 0.3)),
    })),
    ...rug(r.doorX, hd - 0.9, 1.2, 0.8, C.plankDark, C.darkStone),
    ...containerParts('apartment'),
  ];
  for (let f = 1; f < floors; f++) {
    parts.push(...band(w, d, f * floorH - 0.08, 0.16, C.concreteDark, 0.03));
  }
  const rows: number[] = [];
  for (let f = 0; f < floors; f++) rows.push(f * floorH + 0.9);
  parts.push(
    ...windows('front', w, d / 2 + 0.02, rows, 4, [1.1, 1.2], random, 0.2, false, [r.doorX]),
  );
  parts.push(...windows('back', w, d / 2 + 0.02, rows, 4, [1.1, 1.2], random));
  parts.push(...windows('left', d, w / 2 + 0.02, rows, 2, [1, 1.2], random));
  parts.push(...windows('right', d, w / 2 + 0.02, rows, 2, [1, 1.2], random));
  parts.push();
  // Balkonlar (ön cephe, birinci kattan itibaren).
  for (let f = 1; f < floors; f++) {
    const y = f * floorH;
    for (const sx of [-1, 1]) {
      parts.push(box(w * 0.36, 0.15, 1, sx * w * 0.28, y, d / 2 + 0.5, C.concreteDark));
      parts.push(box(w * 0.36, 0.8, 0.08, sx * w * 0.28, y + 0.15, d / 2 + 0.96, C.concreteDark));
      parts.push(box(w * 0.36 - 0.1, 0.05, 0.05, sx * w * 0.28, y + 0.98, d / 2 + 0.96, C.steel));
    }
  }
  return parts;
}

function lojmanParts(random: Random, ruined: boolean): Part[] {
  const { w, d, h } = D.lojman;
  const r = room('lojman');
  const wallH = r.top;
  if (ruined) {
    return [
      ...ruinedRoom(w, d, r.room + 0.8, r.door, r.doorX, C.plaster, random),
      ...containerParts('lojman'),
    ];
  }
  const { hw, hd } = innerHalf(w, d);
  const other = -r.doorX; // ikinci (kapalı) kapı
  return [
    ...roomShell({ w, d, h: r.room, door: r.door, doorX: r.doorX, doorH: 2.1, wall: C.plaster }),
    box(w, wallH - r.room, d, 0, r.room, 0, C.plaster),
    ...band(w, d, 0, 0.3, C.darkStone, 0.03),
    ...band(w, d, r.room - 0.06, 0.14, C.brick, 0.03),
    gableRoof(w, d, h - wallH, wallH, C.roofTile),
    door(1, 2, d / 2 + 0.02, other),
    ...doorFrame(1, 2, d / 2 + 0.03, other),
    ...windows('front', w, d / 2 + 0.02, [0.9, 3.4], 6, [0.8, 1], random, 0.3, false, [
      r.doorX,
      other,
    ]),
    ...windows('back', w, d / 2 + 0.02, [0.9, 3.4], 6, [0.8, 1], random),
    box(0.5, 1.3, 0.5, -w * 0.3, wallH + 0.5, 0, C.brick),
    box(0.5, 1.3, 0.5, w * 0.3, wallH + 0.5, 0, C.brick),
    // iç: soba, ranza (kerevet), masa
    ...indoor([
      cylinder(0.3, 0.9, 1.2, 0, -hd + 0.6, C.steel, 8),
      cylinder(0.07, r.room - 0.9, 1.2, 0.9, -hd + 0.6, C.steel, 5),
    ]),
    ...placeParts(sedir(2.6), -hw + 0.36, 0.8, Math.PI / 2),
    ...counter(1.4, 0.7, 0.75).map((p) => ({
      ...p,
      geometry: p.geometry.applyMatrix4(new Matrix4().makeTranslation(1.6, 0, 1.2)),
    })),
    ...stool(1.2, 2.0),
    ...stool(2.1, 2.0),
    ...containerParts('lojman'),
  ];
}

function serenderParts(random: Random, ruined: boolean): Part[] {
  const { w, d, h } = D.serender;
  const lift = 1.4;
  const parts: Part[] = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(box(0.2, lift, 0.2, sx * (w / 2 - 0.2), 0, sz * (d / 2 - 0.2), C.wood));
    // fare taşı (direk başı yassı taş)
    parts.push(box(0.5, 0.1, 0.5, sx * (w / 2 - 0.2), lift - 0.1, sz * (d / 2 - 0.2), C.stone));
  }
  if (ruined) {
    parts.push(box(w, 0.15, d, 0, lift, 0, C.wood));
    parts.push(...rubble(0, 0, 1.4, random));
    return parts;
  }
  parts.push(box(w, 1.8, d, 0, lift, 0, C.woodLight));
  parts.push(hipRoof(w, d, h - lift - 1.8, lift + 1.8, C.roofTileDark, 0.4));
  parts.push(box(0.8, 1.2, 0.08, 0, lift + 0.2, d / 2 + 0.03, C.door));
  return parts;
}

// -- çarşı ve kamu --------------------------------------------------------------

function shopRowParts(random: Random, ruined: boolean): Part[] {
  const { w, d, h } = D.shop_row;
  const r = room('shop_row');
  if (ruined) {
    return [
      ...ruinedRoom(w, d, h * 0.8, r.door, r.doorX, C.plaster, random),
      ...containerParts('shop_row'),
    ];
  }
  const { hd } = innerHalf(w, d);
  const parts: Part[] = [
    ...roomShell({
      w,
      d,
      h,
      door: r.door,
      doorX: r.doorX,
      doorH: 2.4,
      wall: C.plaster,
      floor: C.sill,
      leaf: false,
    }),
    box(w + 0.3, 0.25, d + 0.3, 0, h, 0, C.concreteDark),
    box(w, 0.6, 0.1, 0, h - 0.9, d / 2 + 0.05, C.sign), // tabela bandı (solmuş)
    ...band(w, d, 0, 0.35, C.darkStone, 0.03),
  ];
  // Dört dükkân: inik kepenkler (bir kısmı yarım açık, içi karanlık); kapı olan dükkânın kepengi tepede sarılı.
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + (w / 4) * (i + 0.5);
    if (Math.abs(x - r.doorX) < 0.01) {
      parts.push(box(w / 4 - 0.5, 0.45, 0.3, x, 2.45, d / 2 + 0.12, C.shutter));
      parts.push(box(0.08, 2.45, 0.1, x - (w / 4 - 0.5) / 2, 0, d / 2 + 0.06, C.steel));
      parts.push(box(0.08, 2.45, 0.1, x + (w / 4 - 0.5) / 2, 0, d / 2 + 0.06, C.steel));
      continue;
    }
    const open = random.next() < 0.3;
    parts.push(
      box(w / 4 - 0.5, open ? 1.2 : 2.5, 0.08, x, open ? 1.3 : 0, d / 2 + 0.05, C.shutter),
    );
    if (open) parts.push(box(w / 4 - 0.5, 1.3, 0.06, x, 0, d / 2 + 0.03, C.window));
    // Kepenk çizgileri
    for (let k = 1; k < 6; k++) {
      const y = (open ? 1.3 : 0) + k * ((open ? 1.2 : 2.5) / 6);
      parts.push(box(w / 4 - 0.5, 0.025, 0.02, x, y, d / 2 + 0.1, C.concreteDark));
    }
  }
  // İç: raflar, tezgâh, terazi
  parts.push(...placeParts(shelf(2.6, random), -1.8, -hd + 0.22, 0));
  parts.push(...placeParts(shelf(2.2, random), 3.6, -hd + 0.22, 0));
  parts.push(
    ...placeParts(counter(2.2, 0.6, 0.95), r.doorX + 2.6, -0.3, 0),
    ...indoor([box(0.3, 0.2, 0.25, r.doorX + 2.2, 0.95, -0.3, C.steel)]),
  );
  parts.push(...containerParts('shop_row'));
  return parts;
}

function kahvehaneParts(random: Random, ruined: boolean): Part[] {
  const { w, d, h } = D.kahvehane;
  const r = room('kahvehane');
  const wallH = r.room;
  if (ruined) {
    return [
      ...ruinedRoom(w, d, wallH, r.door, r.doorX, C.whitewash, random),
      ...containerParts('kahvehane'),
    ];
  }
  const { hd } = innerHalf(w, d);
  const big = [1.8, 1.4] as const;
  return [
    ...roomShell({
      w,
      d,
      h: wallH,
      door: r.door,
      doorX: r.doorX,
      doorH: 2.1,
      wall: C.whitewash,
      beams: 3,
    }),
    ...band(w, d, 0, 0.4, C.stone, 0.03),
    hipRoof(w, d, h - wallH, wallH, C.roofTile),
    ...windows('front', w, d / 2 + 0.02, [0.8], 2, big, random, 0.15),
    ...windows('left', d, w / 2 + 0.02, [1], 2, [0.8, 1.1], random),
    // tente (yırtık, solmuş) ve önde taş sedir
    box(w, 0.08, 1.6, 0, 2.5, d / 2 + 0.8, C.awning),
    box(w * 0.7, 0.45, 0.5, 0, 0, d / 2 + 1.4, C.stone),
    // iç: ocak tezgâhı ve semaver, masalar ve tabureler
    ...placeParts(counter(2.6, 0.6, 0.95), -0.6, -hd + 0.35, 0),
    ...indoor([
      cylinder(0.18, 0.5, -1.2, 0.95, -hd + 0.35, C.gold, 8),
      cylinder(0.1, 0.2, -0.4, 0.95, -hd + 0.35, C.brick, 6),
    ]),
    ...table(-1.6, 1.1, 0.42, 0.72),
    ...stool(-2.3, 1.1),
    ...stool(-0.9, 1.1),
    ...table(1.5, 0.6, 0.42, 0.72),
    ...stool(1.5, 1.35),
    ...stool(2.25, 0.6),
    ...table(0.3, -0.6, 0.42, 0.72),
    ...stool(-0.4, -0.6),
    ...containerParts('kahvehane'),
  ];
}

/** Hükümet konağı girişinin üçgen alınlığı: mahya önden arkaya, alın ön cepheye bakar. */
function pediment(depth: number): Part {
  const roof = gableRoof(1.8, 4.8, 1.2, 3.6, C.cutStone, 0.1);
  roof.geometry.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2));
  roof.geometry.applyMatrix4(new Matrix4().makeTranslation(0, 0, depth / 2 + 0.8));
  return roof;
}

function governmentParts(random: Random): Part[] {
  const { w, d, h } = D.government;
  const r = room('government');
  const wallH = r.top;
  const { hd } = innerHalf(w, d);
  const parts: Part[] = [
    ...roomShell({
      w,
      d,
      h: r.room,
      door: r.door,
      doorX: r.doorX,
      doorH: 2.6,
      wall: C.cutStone,
      floor: C.marble,
    }),
    ...quoins(w, d, wallH, C.darkStone),
    box(w, wallH - r.room, d, 0, r.room, 0, C.cutStone),
    ...band(w, d, r.room - 0.05, 0.3, C.darkStone, 0.1),
    ...band(w, d, wallH - 0.3, 0.3, C.darkStone, 0.1),
    hipRoof(w, d, h - wallH, wallH, C.roofTileDark, 0.5),
    // giriş: dört sütunlu revak, üstünde levha ve üçgen alınlık
    box(4.6, 0.25, 1.6, 0, 3.35, d / 2 + 0.8, C.cutStone),
    pediment(d),
    ...windows('front', w, d / 2 + 0.02, [1, 4], 7, [0.9, 1.6], random, 0.15, false, [r.doorX]),
    ...windows('back', w, d / 2 + 0.02, [1, 4], 7, [0.9, 1.6], random),
    ...windows('left', d, w / 2 + 0.02, [1, 4], 3, [0.9, 1.6], random),
    ...windows('right', d, w / 2 + 0.02, [1, 4], 3, [0.9, 1.6], random),
    // bayrak direği (bayrak ayrı çizilir: SettlementLayer)
    cylinder(
      0.08,
      GOVERNMENT_FLAG.poleHeight,
      GOVERNMENT_FLAG.poleX,
      0,
      GOVERNMENT_FLAG.poleZ,
      C.steel,
      5,
    ),
    // iç: kırmızı yolluk, makam masası ve sandalyeler, dosya dolapları (kaplar)
    ...rug(0, 0, 2, hd * 1.6, C.carpet, C.kilimAccent),
    ...placeParts(counter(2.4, 1, 0.78, C.timber), 0, -hd + 1.6, 0),
    ...stool(0, -hd + 0.75),
    ...stool(-0.8, -hd + 2.6),
    ...stool(0.8, -hd + 2.6),
    ...containerParts('government'),
  ];
  for (const x of [-2.1, -0.9, 0.9, 2.1]) {
    parts.push(cylinder(0.18, 3.35, x, 0, d / 2 + 1.4, C.marble, 8));
    parts.push(box(0.46, 0.14, 0.46, x, 3.2, d / 2 + 1.4, C.cutStone));
  }
  return parts;
}

// -- dinî ve kültürel -----------------------------------------------------------

/** Kalem minare: kare kaide, çokgen gövde, şerefe(ler), külah, alem. */
function minaret(
  x: number,
  z: number,
  height: number,
  balconies: number,
  body: number,
  cap: number,
): Part[] {
  const r = height > 20 ? 0.75 : 0.6;
  const baseH = height * 0.12;
  const parts: Part[] = [box(r * 2.4, baseH, r * 2.4, x, 0, z, body)];
  parts.push(box(r * 2.5, 0.2, r * 2.5, x, baseH - 0.2, z, C.darkStone));
  const shaftTop = height * 0.82;
  parts.push(cylinder(r, shaftTop - baseH, x, baseH, z, body, 12));
  // Pabuç (kaideden gövdeye geçiş)
  parts.push(cylinder(r, 0.8, x, baseH, z, body, 12, r * 1.15));
  for (let i = 0; i < balconies; i++) {
    const y = shaftTop - 0.6 - i * (height * 0.2);
    parts.push(cylinder(r * 1.6, 0.35, x, y, z, body, 12, r * 1.6));
    parts.push(cylinder(r * 1.05, 0.5, x, y - 0.5, z, body, 12, r * 1.6)); // şerefe altı (mukarnas yerine)
    parts.push(cylinder(r * 1.6, 0.6, x, y + 0.35, z, C.darkStone, 12, r * 1.6));
  }
  parts.push(cylinder(r * 0.85, height * 0.04, x, shaftTop, z, body, 12));
  parts.push(cone(r * 1.05, height * 0.14, x, shaftTop + height * 0.04, z, cap, 12));
  parts.push(...alem(x, height, z, 0.7));
  return parts;
}

/** Mihrap (kıble duvarında; yerel: arkası −z): çini çerçeve, niş, mukarnas başlık. */
function mihrab(height: number): Part[] {
  return indoor([
    box(2, height, 0.2, 0, 0, 0, C.tile),
    box(1.3, height - 0.6, 0.06, 0, 0.3, 0.1, C.tileDark),
    box(0.9, height - 1.2, 0.04, 0, 0.3, 0.14, C.marble),
    cone(0.6, 0.7, 0, height - 0.95, 0.15, C.gold, 4),
    box(2.2, 0.2, 0.3, 0, height, 0.02, C.gold),
  ]);
}

/** Minber (mihrabın sağında; yerel: merdiven +z'den çıkar, tepe −z'de köşk). */
function minber(height: number): Part[] {
  const parts: Part[] = [];
  const steps = 7;
  const run = 3;
  for (let i = 0; i < steps; i++) {
    const h = ((i + 1) / steps) * height * 0.55;
    parts.push(box(0.9, h, run / steps, 0, 0, run / 2 - (i + 0.5) * (run / steps), C.marble));
  }
  // yan korkuluk ve köşk
  parts.push(box(0.08, height * 0.55 + 0.9, run, -0.48, 0, 0, C.cutStone));
  parts.push(box(0.08, height * 0.55 + 0.9, run, 0.48, 0, 0, C.cutStone));
  for (const sx of [-0.4, 0.4]) {
    for (const sz of [-run / 2 + 0.1, -run / 2 + 0.8]) {
      parts.push(box(0.1, 1.6, 0.1, sx, height * 0.55, sz, C.marble));
    }
  }
  parts.push(cone(0.7, 1.4, 0, height * 0.55 + 1.6, -run / 2 + 0.45, C.lead, 4));
  // giriş kapısı (taçkapı)
  parts.push(box(1.1, 2.4, 0.15, 0, 0, run / 2 + 0.05, C.marble));
  parts.push(box(0.6, 1.8, 0.04, 0, 0, run / 2 + 0.14, C.tileDark));
  return indoor(parts);
}

/** Avize: halka ve tavandan inen askı. */
function chandelier(y: number, r: number, top: number): Part[] {
  const ring = new TorusGeometry(r, 0.05, 4, 16);
  ring.applyMatrix4(new Matrix4().makeRotationX(Math.PI / 2));
  return indoor([
    { geometry: at(ring, 0, y, 0), color: C.gold },
    cylinder(0.025, top - y, 0, y, 0, C.steel, 4),
    cylinder(r * 0.4, 0.3, 0, y - 0.15, 0, C.gold, 8, r * 0.15),
  ]);
}

/** Halı: harimi kaplayan kırmızı halı ve saf çizgileri (kıbleye dik). */
function prayerCarpet(iw: number, id: number): Part[] {
  const parts: Part[] = [box(iw, 0.03, id, 0, 0.02, 0, C.carpet)];
  for (let z = -id / 2 + 1.2; z < id / 2 - 0.4; z += 1.1) {
    parts.push(box(iw, 0.005, 0.06, 0, 0.051, z, C.carpetAccent));
  }
  return indoor(parts);
}

function mosqueParts(kind: 'mosque_grand' | 'mosque'): Part[] {
  const s = D[kind];
  const grand = kind === 'mosque_grand';
  const t = WALL_THICKNESS;
  const iw = s.w - 2 * t;
  const id = s.d - 2 * t;
  const doorW = 2.4;
  const ring = s.dome * 0.92;
  const parts: Part[] = [
    // harim: kesme taş beden (kapı boşluklu), iç sıva, mermer döşeme
    ...roomShell({
      w: s.w,
      d: s.d,
      h: s.h,
      door: doorW,
      doorX: 0,
      doorH: 3,
      wall: C.cutStone,
      inner: C.plasterInner,
      floor: C.marble,
      ceiling: false,
      leaf: false,
    }),
    ...band(s.w, s.d, s.h - 0.3, 0.3, C.darkStone, 0.1),
    ...band(s.w, s.d, 0, 0.5, C.darkStone, 0.03),
    // çatı: dışta kurşun levha, içte sıvalı tavan; ortada kubbeye açılan delik
    holedSlab(s.w, s.d, ring, s.h, C.lead, false),
    { ...holedSlab(iw, id, ring, s.h - 0.02, C.ceiling, true), inner: true },
    // kasnak (dışı taş, içi sıva) + ana kubbe (dışı kurşun, içi lacivert): iç yüzeyler tavan deliğinden biraz geniştir
    // (çokgen delik ile silindir arasında gökyüzü görünmesin).
    {
      geometry: at(new CylinderGeometry(ring + 0.2, ring + 0.2, 1, 24, 1, true), 0, s.h + 0.5, 0),
      color: C.cutStone,
    },
    {
      geometry: inward(
        at(new CylinderGeometry(ring + 0.12, ring + 0.12, 1, 24, 1, true), 0, s.h + 0.5, 0),
      ),
      color: C.ceiling,
      inner: true,
    },
    dome(s.dome, 0, s.h + 1, 0, C.lead, 16),
    {
      geometry: inward(dome(ring + 0.12, 0, s.h + 1, 0, 0, 24).geometry),
      color: C.tileDark,
      inner: true,
    },
    ...alem(0, s.h + 1 + s.dome, 0, 0.9),
    // son cemaat yeri: revak + küçük kubbeler
    box(s.w, 0.5, s.portico, 0, s.h * 0.55, s.d / 2 + s.portico / 2, C.cutStone),
    // taçkapı: kapının çevresinde çıkıntılı çerçeve ve çini pano
    box(0.6, s.h * 0.55 - 0.1, 0.25, -doorW / 2 - 0.3, 0, s.d / 2 + 0.12, C.marble),
    box(doorW + 0.6, 0.8, 0.08, 0, 3.15, s.d / 2 + 0.05, C.tile),
    // iç: mihrap (kıble duvarı = arka), minber (sağda), vaaz kürsüsü (solda), halı, avize
    ...placeParts(mihrab(Math.min(4.2, s.h * 0.6)), 0, -s.d / 2 + t + 0.1, 0),
    ...placeParts(minber(Math.min(5, s.h * 0.7)), 2.4, -s.d / 2 + t + 1.6, 0),
    ...placeParts(counter(1.2, 1.2, 1.1, C.wood), -2.8, -s.d / 2 + t + 2.4, 0),
    ...prayerCarpet(iw - 0.1, id - 0.1),
    ...chandelier(s.h - 1.6, Math.min(3, s.w * 0.22), s.h + 1 + s.dome * 0.9),
  ];
  // Taçkapı yan ayağı (sağ): solun simetriği.
  parts.push(box(0.6, s.h * 0.55 - 0.1, 0.25, doorW / 2 + 0.3, 0, s.d / 2 + 0.12, C.marble));
  const domes = grand ? 5 : 3;
  for (let i = 0; i < domes; i++) {
    const x = -s.w / 2 + (s.w / domes) * (i + 0.5);
    parts.push(dome(s.portico * 0.42, x, s.h * 0.55 + 0.5, s.d / 2 + s.portico / 2, C.lead, 10));
    // revak sütunları (başlıklı)
    const cx = x - s.w / domes / 2 + 0.2;
    parts.push(cylinder(0.2, s.h * 0.55, cx, 0, s.d / 2 + s.portico - 0.3, C.marble, 8));
    parts.push(box(0.5, 0.2, 0.5, cx, s.h * 0.55 - 0.2, s.d / 2 + s.portico - 0.3, C.cutStone));
  }
  parts.push(cylinder(0.2, s.h * 0.55, s.w / 2 - 0.2, 0, s.d / 2 + s.portico - 0.3, C.marble, 8));
  parts.push(
    box(0.5, 0.2, 0.5, s.w / 2 - 0.2, s.h * 0.55 - 0.2, s.d / 2 + s.portico - 0.3, C.cutStone),
  );
  if (grand) {
    // köşe kubbecikleri ve ağırlık kuleleri
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      parts.push(dome(2, sx * (s.w / 2 - 2.2), s.h, sz * (s.d / 2 - 2.2), C.lead, 10));
      parts.push(
        cylinder(0.35, 2.4, sx * (s.w / 2 - 0.4), s.h, sz * (s.d / 2 - 0.4), C.cutStone, 8),
      );
      parts.push(cone(0.45, 1.2, sx * (s.w / 2 - 0.4), s.h + 2.4, sz * (s.d / 2 - 0.4), C.lead, 8));
    }
  }
  // Pencereler: iki sıra (alt dikdörtgen, üst kemerli — koyu).
  const flat = createRandom(17);
  const n = grand ? 4 : 3;
  parts.push(...windows('left', s.d, s.w / 2 + 0.02, [1.4, s.h * 0.62], n, [0.9, 1.6], flat, 0));
  parts.push(...windows('right', s.d, s.w / 2 + 0.02, [1.4, s.h * 0.62], n, [0.9, 1.6], flat, 0));
  parts.push(...windows('back', s.w, s.d / 2 + 0.02, [s.h * 0.62], n, [0.9, 1.6], flat, 0));
  // Kemer alınlıkları (pencere üstünde yarım daire yerine sivri koni).
  for (const face of ['left', 'right'] as const) {
    for (let c = 0; c < n; c++) {
      const along = -s.d / 2 + (s.d / n) * (c + 0.5);
      parts.push(
        ...orient(
          [cone(0.5, 0.45, 0, 1.4 + 1.6 + 0.06, 0.02, C.darkStone, 3)],
          face,
          along,
          s.w / 2 + 0.02,
        ),
      );
    }
  }
  // Minare(ler): sağ ön köşe; büyük camide iki minare, iki şerefe.
  parts.push(
    ...minaret(s.w / 2 + 1.2, s.d / 2 - 1.2, s.minaret, grand ? 2 : 1, C.cutStone, C.lead),
  );
  if (grand)
    parts.push(...minaret(-s.w / 2 - 1.2, s.d / 2 - 1.2, s.minaret, 2, C.cutStone, C.lead));
  return parts;
}

function woodenMosqueParts(): Part[] {
  const s = D.mosque_wooden;
  const t = WALL_THICKNESS;
  const iw = s.w - 2 * t;
  const id = s.d - 2 * t;
  const parts: Part[] = [
    ...roomShell({
      w: s.w,
      d: s.d,
      h: s.h,
      door: 1.8,
      doorX: 0,
      doorH: 2.2,
      wall: C.whitewash,
      floor: C.plank,
      ceiling: true,
      ceilingColor: C.woodLight,
      beams: 4,
      leaf: false,
    }),
    ...band(s.w, s.d, 0, 0.6, C.stone, 0.04),
    // ahşap kaplama kuşağı
    ...band(s.w, s.d, s.h - 1.4, 1.2, C.woodLight, 0.05),
    hipRoof(s.w, s.d, 2.4, s.h, C.roofTileDark, 0.7),
    box(s.w, 0.15, 1.6, 0, 2.6, s.d / 2 + 0.8, C.wood), // sundurma
    box(0.15, 2.6, 0.15, -s.w / 2 + 0.3, 0, s.d / 2 + 1.5, C.wood),
    box(0.15, 2.6, 0.15, s.w / 2 - 0.3, 0, s.d / 2 + 1.5, C.wood),
    // iç: ahşap mihrap ve minber, halı, kalem işi tavan şeridi
    ...placeParts(mihrab(2.8), 0, -s.d / 2 + t + 0.1, 0),
    ...placeParts(minber(3.2), 1.9, -s.d / 2 + t + 1.6, 0),
    ...prayerCarpet(iw - 0.1, id - 0.1),
    ...indoor(band(iw - 0.04, id - 0.04, s.h - 0.5, 0.25, C.tile, 0)),
  ];
  const r = createRandom(23);
  parts.push(...windows('left', s.d, s.w / 2 + 0.02, [1.4], 3, [0.8, 1.2], r, 0));
  parts.push(...windows('right', s.d, s.w / 2 + 0.02, [1.4], 3, [0.8, 1.2], r, 0));
  // Ahşap minare: ince gövde, ahşap şerefe, külah.
  const x = s.w / 2 + 0.7;
  const z = s.d / 2 - 0.7;
  parts.push(box(1, 1.2, 1, x, 0, z, C.stone));
  parts.push(box(0.7, s.minaret * 0.7, 0.7, x, 1.2, z, C.whitewash));
  parts.push(box(1.2, 0.5, 1.2, x, 1.2 + s.minaret * 0.7 - 0.5, z, C.wood));
  for (const [ox, oz] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ] as const) {
    parts.push(box(0.08, 0.6, 0.08, x + ox, 1.2 + s.minaret * 0.7, z + oz, C.wood));
  }
  parts.push(cone(0.6, s.minaret * 0.22, x, 1.2 + s.minaret * 0.7 + 0.6, z, C.lead, 8));
  parts.push(...alem(x, 1.2 + s.minaret * 0.92 + 0.6, z, 0.45));
  return parts;
}

function tombParts(): Part[] {
  const { w, h } = D.tomb;
  const r = w / 2;
  return [
    box(w + 0.4, 0.5, w + 0.4, 0, 0, 0, C.darkStone),
    cylinder(r, h * 0.55, 0, 0.5, 0, C.cutStone, 8),
    cone(r * 1.05, h * 0.35, 0, 0.5 + h * 0.55, 0, C.lead, 8),
    ...alem(0, 0.5 + h * 0.9, 0, 0.4),
    door(0.9, 1.8, r * 0.93, 0),
  ];
}

function cemeteryParts(random: Random): Part[] {
  const { w, d } = D.cemetery;
  const parts: Part[] = [
    // alçak taş duvar (kapı boşluklu)
    box(w, 0.7, 0.3, 0, 0, -d / 2, C.stone),
    box(0.3, 0.7, d, -w / 2, 0, 0, C.stone),
    box(0.3, 0.7, d, w / 2, 0, 0, C.stone),
    box(w / 2 - 1, 0.7, 0.3, -w / 4 - 0.5, 0, d / 2, C.stone),
    box(w / 2 - 1, 0.7, 0.3, w / 4 + 0.5, 0, d / 2, C.stone),
  ];
  // Şahideli mezarlar: baş ve ayak taşı, bazı baş taşlarında sarık (erkek mezarı).
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      if (random.next() < 0.15) continue;
      const x = -w / 2 + 1.5 + col * ((w - 3) / 5) + (random.next() - 0.5) * 0.4;
      const z = -d / 2 + 2 + row * ((d - 3.5) / 2);
      const tilt = (random.next() - 0.5) * 0.25; // eğilmiş taşlar
      const head = box(0.45, 1.1 + random.next() * 0.4, 0.12, x, 0, z, C.marble);
      head.geometry.applyMatrix4(new Matrix4().makeRotationZ(tilt));
      parts.push(head);
      if (random.next() < 0.5) parts.push(cylinder(0.2, 0.25, x, 1.3, z, C.marble, 6, 0.24));
      parts.push(box(0.35, 0.5, 0.1, x, 0, z + 1.4, C.marble));
      parts.push(box(0.5, 0.15, 1.3, x, 0, z + 0.7, C.stone));
    }
  }
  // Serviler
  for (const [x, z] of [
    [-w / 2 + 1, d / 2 - 1.2],
    [w / 2 - 1.2, -d / 2 + 1.5],
    [w * 0.1, -d / 2 + 1],
  ] as const) {
    parts.push(cylinder(0.12, 1, x, 0, z, C.timber, 4));
    parts.push(cone(0.6, 6.5, x, 0.8, z, C.cypress, 6));
  }
  return parts;
}

function fountainParts(): Part[] {
  const { w, d, h } = D.fountain;
  return [
    // kitabeli mermer ayna taşı, kemerli niş (koyu), saçak
    box(w, h, d * 0.55, 0, 0, -d * 0.22, C.marble),
    box(w * 0.55, h * 0.6, 0.06, 0, 0.4, d * 0.06 + 0.01, C.darkStone),
    box(w * 0.7, 0.35, 0.08, 0, h * 0.78, d * 0.06 + 0.02, C.cutStone), // kitabe
    box(w + 0.5, 0.18, d + 0.2, 0, h, -d * 0.1, C.lead),
    // yalak (taş tekne) ve lüle
    box(w * 0.8, 0.45, 0.6, 0, 0, d * 0.35, C.stone),
    cylinder(0.05, 0.25, 0, 1.1, d * 0.12, C.gold, 4),
  ];
}

/** Şadırvan: sekizgen mermer havuz, ortada musluklu sütun, oturma taşları, sekiz sütunlu kurşun saçak, alem. */
function sadirvanParts(): Part[] {
  const parts: Part[] = [
    cylinder(2.55, 0.22, 0, 0, 0, C.cutStone, 8),
    cylinder(1.55, 0.7, 0, 0.22, 0, C.marble, 8),
    cylinder(1.4, 0.04, 0, 0.86, 0, C.water, 8),
    cylinder(0.42, 1.5, 0, 0.22, 0, C.marble, 8, 0.32),
    cone(0.5, 0.5, 0, 1.72, 0, C.lead, 8),
    // eave ring and roof
    cylinder(2.7, 0.22, 0, 3, 0, C.woodLight, 8),
    cone(2.72, 1.5, 0, 3.22, 0, C.lead, 8),
    cylinder(0.35, 0.4, 0, 4.4, 0, C.lead, 8),
    ...alem(0, 4.8, 0, 0.45),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // sütun ve başlık
    parts.push(cylinder(0.11, 2.78, ca * 2.3, 0.22, sa * 2.3, C.marble, 6));
    parts.push(box(0.3, 0.12, 0.3, ca * 2.3, 2.88, sa * 2.3, C.cutStone));
    // musluk ve oturma taşı (abdest)
    const ta = (i / 8) * Math.PI * 2;
    parts.push(cylinder(0.035, 0.18, Math.cos(ta) * 1.58, 0.72, Math.sin(ta) * 1.58, C.gold, 4));
    parts.push(box(0.36, 0.32, 0.36, Math.cos(ta) * 1.95, 0.22, Math.sin(ta) * 1.95, C.stone));
  }
  return parts;
}

// -- tarihî ----------------------------------------------------------------------

function hanParts(random: Random): Part[] {
  const s = D.han;
  const wing = (s.w - s.court) / 2;
  const hw = s.w / 2;
  const parts: Part[] = [
    // dört kanat (iki katlı taş), avlu ortada açık
    box(s.w, s.h, wing, 0, 0, -hw + wing / 2, C.stone),
    box(wing, s.h, s.w - wing * 2, -hw + wing / 2, 0, 0, C.stone),
    box(wing, s.h, s.w - wing * 2, hw - wing / 2, 0, 0, C.stone),
    box(hw - 1.5, s.h, wing, -hw / 2 - 0.75, 0, hw - wing / 2, C.stone),
    box(hw - 1.5, s.h, wing, hw / 2 + 0.75, 0, hw - wing / 2, C.stone),
    // taçkapı üstü
    box(3, s.h - 4, wing, 0, 4, hw - wing / 2, C.cutStone),
    // kırma çatılar (kanatların üstünde)
    hipRoof(s.w, wing, 1.6, s.h, C.roofTileDark, 0.3),
  ];
  parts[parts.length - 1]!.geometry.applyMatrix4(
    new Matrix4().makeTranslation(0, 0, -hw + wing / 2),
  );
  const front = hipRoof(s.w, wing, 1.6, s.h, C.roofTileDark, 0.3);
  front.geometry.applyMatrix4(new Matrix4().makeTranslation(0, 0, hw - wing / 2));
  parts.push(front);
  const left = hipRoof(wing, s.court, 1.6, s.h, C.roofTileDark, 0.3);
  left.geometry.applyMatrix4(new Matrix4().makeTranslation(-hw + wing / 2, 0, 0));
  const right = hipRoof(wing, s.court, 1.6, s.h, C.roofTileDark, 0.3);
  right.geometry.applyMatrix4(new Matrix4().makeTranslation(hw - wing / 2, 0, 0));
  parts.push(left, right);
  // Avluya bakan revak kemerleri (koyu açıklıklar), dış cephede küçük mazgal pencereler.
  const c = s.court / 2;
  for (let i = 0; i < 4; i++) {
    const t = -c + (s.court / 4) * (i + 0.5);
    for (const y of [0, 3.6]) {
      parts.push(box(1.6, 2.4, 0.06, t, y + 0.3, -c - 0.02, C.window));
      parts.push(box(0.06, 2.4, 1.6, -c - 0.02, y + 0.3, t, C.window));
      parts.push(box(0.06, 2.4, 1.6, c + 0.02, y + 0.3, t, C.window));
    }
  }
  parts.push(...windows('back', s.w, hw + 0.02, [4.4], 6, [0.4, 0.9], random, 0));
  // Avluda şadırvan/mescit kaidesi, taş döşeme ve kaplar (sandık, dolap)
  parts.push(box(2, 0.6, 2, 0, 0, 0, C.cutStone));
  parts.push(box(s.court, 0.05, s.court, 0, -0.02, 0, C.darkStone));
  parts.push(...containerParts('han'));
  return parts;
}

function hamamParts(): Part[] {
  const { w, d, h } = D.hamam;
  const r = room('hamam');
  const wallH = h * 0.62;
  const { hw, hd } = innerHalf(w, d);
  const parts: Part[] = [
    ...roomShell({
      w,
      d,
      h: wallH,
      door: r.door,
      doorX: r.doorX,
      doorH: 2.2,
      wall: C.stone,
      floor: C.marble,
      ceilingColor: C.plasterInner,
    }),
    ...quoins(w, d, wallH, C.cutStone),
    dome(3, -w * 0.18, wallH, -d * 0.1, C.lead, 12),
    dome(2.2, w * 0.28, wallH, -d * 0.18, C.lead, 10),
    dome(1.8, w * 0.28, wallH, d * 0.25, C.lead, 10),
    dome(1.5, -w * 0.3, wallH, d * 0.3, C.lead, 10),
    box(0.8, 3.4, 0.8, w / 2 - 0.6, wallH, -d / 2 + 0.6, C.brick), // külhan bacası
    // iç: göbek taşı, kurnalar, tavanda fil gözleri (ışık delikleri)
    ...indoor([
      cylinder(1.5, 0.45, -0.8, 0, -0.6, C.marble, 8),
      ...[-2.4, 0.4, 2.6].flatMap((x) => [
        box(0.6, 0.45, 0.4, x, 0.4, -hd + 0.2, C.marble),
        cylinder(0.04, 0.2, x, 1.1, -hd + 0.08, C.gold, 4),
      ]),
    ]),
    ...placeParts(sedir(2.6), hw - 0.36, 1.6, -Math.PI / 2),
    ...containerParts('hamam'),
  ];
  for (const [x, z] of [
    [-1.5, -0.5],
    [-0.2, -1.2],
    [0.6, 0.6],
    [-1.6, 1.2],
  ] as const) {
    parts.push(...indoor([box(0.18, 0.02, 0.18, x, wallH - 0.1, z, C.windowInner)]));
  }
  return parts;
}

function clockTowerParts(): Part[] {
  const { w, h } = D.clock_tower;
  const shaft = h * 0.72;
  const parts: Part[] = [
    box(w + 0.6, 1.2, w + 0.6, 0, 0, 0, C.darkStone),
    box(w, shaft, w, 0, 1.2, 0, C.cutStone),
    box(w + 0.5, 2.4, w + 0.5, 0, 1.2 + shaft, 0, C.cutStone),
    hipRoof(w + 0.5, w + 0.5, h - shaft - 3.6, 3.6 + shaft, C.lead, 0.3),
  ];
  // Dört yüzde saat kadranı (ibreler koyu).
  const y = 1.2 + shaft + 1.2;
  const o = (w + 0.5) / 2 + 0.03;
  for (const [nx, nz] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const face = new CylinderGeometry(0.8, 0.8, 0.05, 12);
    face.applyMatrix4(new Matrix4().makeRotationX(Math.PI / 2));
    if (nx !== 0) face.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2));
    parts.push({ geometry: at(face, nx * o, y, nz * o), color: C.clockFace });
    parts.push(
      box(nx ? 0.05 : 0.1, 0.6, nz ? 0.05 : 0.1, nx * (o + 0.03), y, nz * (o + 0.03), C.window),
    );
  }
  return parts;
}

function castleParts(random: Random): Part[] {
  const { w, d, h } = D.castle;
  const hw = w / 2;
  const hd = d / 2;
  const t = 2;
  const parts: Part[] = [
    box(w, h, t, 0, 0, -hd + t / 2, C.darkStone),
    box(t, h, d, -hw + t / 2, 0, 0, C.darkStone),
    box(t, h, d, hw - t / 2, 0, 0, C.darkStone),
    box(hw - 2, h, t, -hw / 2 - 1, 0, hd - t / 2, C.darkStone),
    box(hw - 2, h, t, hw / 2 + 1, 0, hd - t / 2, C.darkStone),
    box(4, h - 4.5, t, 0, 4.5, hd - t / 2, C.darkStone),
  ];
  // Burçlar ve mazgallar (bazıları yıkık).
  for (const [x, z] of [
    [-hw, -hd],
    [hw, -hd],
    [-hw, hd],
    [hw, hd],
  ] as const) {
    parts.push(box(5, h + 3 - random.next() * 2.5, 5, x, 0, z, C.stone));
  }
  for (let i = 0; i < 10; i++) {
    if (random.next() < 0.3) continue;
    const x = -hw + 3 + (w - 6) * (i / 9);
    parts.push(box(1, 1, t, x, h, -hd + t / 2, C.darkStone));
    parts.push(box(1, 1, t, x, h, hd - t / 2, C.darkStone));
  }
  return parts;
}

function monumentParts(): Part[] {
  const { w } = D.monument;
  return [
    box(w, 0.6, w, 0, 0, 0, C.darkStone),
    box(w * 0.7, 0.6, w * 0.7, 0, 0.6, 0, C.cutStone),
    box(w * 0.45, 2.4, w * 0.45, 0, 1.2, 0, C.marble),
    // heykel (bronz): gövde + baş + kaldırılmış kol
    cylinder(0.45, 2.2, 0, 3.6, 0, C.brick, 6, 0.35),
    { geometry: at(new SphereGeometry(0.3, 6, 4), 0, 6.1, 0), color: C.brick },
    box(0.18, 1.1, 0.18, 0.45, 5.4, 0, C.brick),
  ];
}

// -- sanayi ---------------------------------------------------------------------

function mineTowerParts(): Part[] {
  const { h } = D.mine_tower;
  const x = -2.5;
  const parts: Part[] = [];
  // Kuyu kulesi: dört bacak, kuşaklar, tepede iki makara, makine dairesine eğik payanda.
  const half = 2;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    parts.push(box(0.3, h - 2, 0.3, x + sx * half * 0.85, 0, sz * half * 0.85, C.steel));
  }
  for (let k = 1; k <= 4; k++) {
    const y = ((h - 2) / 5) * k;
    parts.push(box(half * 2, 0.2, 0.2, x, y, half * 0.85, C.steel));
    parts.push(box(half * 2, 0.2, 0.2, x, y, -half * 0.85, C.steel));
    parts.push(box(0.2, 0.2, half * 2, x + half * 0.85, y, 0, C.steel));
    parts.push(box(0.2, 0.2, half * 2, x - half * 0.85, y, 0, C.steel));
  }
  parts.push(box(half * 2.2, 0.6, half * 2.2, x, h - 2, 0, C.steel));
  for (const z of [-0.7, 0.7]) {
    const wheel = new TorusGeometry(1.3, 0.12, 4, 14);
    parts.push({ geometry: at(wheel, x, h - 0.4, z), color: C.darkStone });
  }
  const strut = new BoxGeometry(0.35, h * 0.8, 0.35);
  strut.applyMatrix4(new Matrix4().makeRotationZ(-0.45));
  parts.push({ geometry: at(strut, x + 3.2, h * 0.38, 0), color: C.steel });
  // Makine dairesi (tuğla)
  parts.push(box(4.8, 6, 6.4, 2.6, 0, 0, C.brick));
  parts.push(gableRoof(4.8, 6.4, 1.4, 6, C.roofTileDark, 0.2));
  parts[parts.length - 1]!.geometry.applyMatrix4(new Matrix4().makeTranslation(2.6, 0, 0));
  parts.push(door(1.4, 2.4, 3.22, 2.6));
  return parts;
}

function factoryParts(random: Random): Part[] {
  const { w, d, h, chimney } = D.factory;
  const parts: Part[] = [box(w, h, d, 0, 0, 0, C.brick)];
  // Testere dişi çatı (kuzey ışıklığı).
  const teeth = 5;
  for (let i = 0; i < teeth; i++) {
    const roof = gableRoof(w / teeth, d, 2.4, h, C.concreteDark, 0.05);
    roof.geometry.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2));
    roof.geometry.applyMatrix4(
      new Matrix4().makeTranslation(-w / 2 + (w / teeth) * (i + 0.5), 0, 0),
    );
    parts.push(roof);
  }
  parts.push(...windows('front', w, d / 2 + 0.02, [2, 6], 8, [2, 2.4], random, 0.35));
  parts.push(...windows('back', w, d / 2 + 0.02, [2, 6], 8, [2, 2.4], random, 0.35));
  parts.push(box(4, 4.5, 0.1, 0, 0, d / 2 + 0.05, C.shutter));
  // Bacalar
  parts.push(cylinder(1, chimney, w / 2 - 2, 0, -d / 2 + 2, C.brick, 10, 0.7));
  parts.push(cylinder(0.8, chimney * 0.75, w / 2 - 5, 0, -d / 2 + 2, C.brick, 10, 0.55));
  return parts;
}

// -- birleştirme ----------------------------------------------------------------

function nearParts(kind: BuildingKind, ruined: boolean, floors: number, random: Random): Part[] {
  switch (kind) {
    case 'house':
      return houseParts(random, ruined);
    case 'konak':
      return konakParts(random, ruined);
    case 'apartment':
      return apartmentParts(random, floors);
    case 'lojman':
      return lojmanParts(random, ruined);
    case 'serender':
      return serenderParts(random, ruined);
    case 'shop_row':
      return shopRowParts(random, ruined);
    case 'kahvehane':
      return kahvehaneParts(random, ruined);
    case 'government':
      return governmentParts(random);
    case 'mosque_grand':
    case 'mosque':
      return mosqueParts(kind);
    case 'mosque_wooden':
      return woodenMosqueParts();
    case 'tomb':
      return tombParts();
    case 'cemetery':
      return cemeteryParts(random);
    case 'fountain':
      return fountainParts();
    case 'han':
      return hanParts(random);
    case 'hamam':
      return hamamParts();
    case 'clock_tower':
      return clockTowerParts();
    case 'castle':
      return castleParts(random);
    case 'monument':
      return monumentParts();
    case 'mine_tower':
      return mineTowerParts();
    case 'factory':
      return factoryParts(random);
    case 'sadirvan':
      return sadirvanParts();
  }
}

/** Uzak kademe: gövde kutusu + çatı (+ camide kubbe ve minare: siluet uzaktan seçilsin). */
function farParts(kind: BuildingKind, ruined: boolean, floors: number): Part[] {
  const wallColor = (k: BuildingKind): number => {
    if (k === 'konak') return C.konakWall;
    if (k === 'apartment') return C.concrete;
    if (k === 'factory' || k === 'mine_tower') return C.brick;
    if (k === 'castle' || k === 'han' || k === 'hamam') return C.stone;
    if (k.startsWith('mosque') || k === 'tomb' || k === 'clock_tower' || k === 'government')
      return C.cutStone;
    return C.whitewash;
  };
  switch (kind) {
    case 'mosque_grand':
    case 'mosque': {
      const s = D[kind];
      return [
        box(s.w, s.h, s.d + s.portico, 0, 0, s.portico / 2, C.cutStone),
        dome(s.dome, 0, s.h, 0, C.lead, 8),
        box(1.2, s.minaret, 1.2, s.w / 2 + 1.2, 0, s.d / 2 - 1.2, C.cutStone),
        cone(0.8, s.minaret * 0.15, s.w / 2 + 1.2, s.minaret, s.d / 2 - 1.2, C.lead, 4),
        ...(kind === 'mosque_grand'
          ? [
              box(1.2, s.minaret, 1.2, -s.w / 2 - 1.2, 0, s.d / 2 - 1.2, C.cutStone),
              cone(0.8, s.minaret * 0.15, -s.w / 2 - 1.2, s.minaret, s.d / 2 - 1.2, C.lead, 4),
            ]
          : []),
      ];
    }
    case 'mosque_wooden': {
      const s = D.mosque_wooden;
      return [
        box(s.w, s.h, s.d, 0, 0, 0, C.whitewash),
        hipRoof(s.w, s.d, 2.4, s.h, C.roofTileDark, 0.5),
        box(0.8, s.minaret, 0.8, s.w / 2 + 0.7, 0, s.d / 2 - 0.7, C.whitewash),
      ];
    }
    case 'cemetery': {
      const s = D.cemetery;
      return [
        box(s.w, 0.6, s.d, 0, 0, 0, C.stone),
        cone(0.6, 6.5, -s.w / 2 + 1, 0.5, s.d / 2 - 1.2, C.cypress, 4),
        cone(0.6, 6.5, s.w / 2 - 1.2, 0.5, -s.d / 2 + 1.5, C.cypress, 4),
      ];
    }
    case 'apartment': {
      const s = D.apartment;
      return [box(s.w, floors * s.floorH, s.d, 0, 0, 0, C.concrete)];
    }
    case 'mine_tower': {
      const s = D.mine_tower;
      return [box(3.6, s.h, 3.6, -2.5, 0, 0, C.steel), box(4.8, 6, 6.4, 2.6, 0, 0, C.brick)];
    }
    case 'factory': {
      const s = D.factory;
      return [
        box(s.w, s.h + 1.5, s.d, 0, 0, 0, C.brick),
        cylinder(1, s.chimney, s.w / 2 - 2, 0, -s.d / 2 + 2, C.brick, 5, 0.7),
      ];
    }
    case 'clock_tower':
    case 'monument':
    case 'fountain':
    case 'tomb': {
      const s = D[kind];
      return [box(s.w, s.h, s.d, 0, 0, 0, wallColor(kind))];
    }
    case 'castle':
    case 'han': {
      const s = D[kind];
      return [box(s.w, s.h, s.d, 0, 0, 0, C.stone)];
    }
    default: {
      const s = D[kind];
      const walls = 'h' in s ? s.h * 0.65 : 4;
      if (ruined) return [box(s.w, walls * 0.7, s.d, 0, 0, 0, wallColor(kind))];
      return [
        box(s.w, walls, s.d, 0, 0, 0, wallColor(kind)),
        hipRoof(s.w, s.d, ('h' in s ? s.h : 6) - walls, walls, C.roofTile, 0.3),
      ];
    }
  }
}

/** Parçaları tek geometriye birleştirir (indekssiz, düz gölge, vertex rengi; yüz başına hafif ton oynaması). */
function merge(parts: Part[], random: Random): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new Color();
  for (const part of parts) {
    const flat = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const position = flat.getAttribute('position');
    color.setHex(part.color);
    for (let i = 0; i < position.count; i += 3) {
      const shade = 1 + (random.next() * 2 - 1) * 0.035;
      for (let k = 0; k < 3; k++) {
        positions.push(position.getX(i + k), position.getY(i + k), position.getZ(i + k));
        colors.push(color.r * shade, color.g * shade, color.b * shade);
      }
    }
    if (flat !== part.geometry) flat.dispose();
    part.geometry.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

/** Bir varyantın geometrisi. Aynı girdi aynı geometriyi verir (seed'li ayrıntılar). */
export function buildBuildingGeometry(
  kind: BuildingKind,
  lod: BuildingLod,
  options: { ruined?: boolean; floors?: number } = {},
): BufferGeometry {
  const ruined = options.ruined ?? false;
  const floors = options.floors ?? D.apartment.floors;
  const random = createRandom(0xb1d + kind.length * 131 + floors * 7 + (ruined ? 3 : 0));
  let parts =
    lod === 'far' ? farParts(kind, ruined, floors) : nearParts(kind, ruined, floors, random);
  if (lod !== 'far' && !ruined) {
    // Camlı pencereler: duvar delinir, iç kasa eklenir (yalnız `interior`; kasalar `inner` parçadır).
    parts = [...openWindows(kind, parts, lod), ...windowFrames(kind)];
  }
  if (lod !== 'far') {
    // `near`: iç mekân parçaları atılır; `interior`: kapı boşluğu karartması atılır (içi görünür).
    const keep = (p: Part) => (lod === 'interior' ? !p.outer : !p.inner);
    for (const p of parts) if (!keep(p)) p.geometry.dispose();
    parts = parts.filter(keep);
  }
  // Camide harim ayak izi merkezinden geridedir (önde revak): kinds.ts ile aynı kayma.
  const oz = mosqueOffset(kind);
  if (oz !== 0)
    for (const p of parts) p.geometry.applyMatrix4(new Matrix4().makeTranslation(0, 0, oz));
  return merge(parts, random);
}

/** Taş temel: 1 × 1 × 1 birim kutu (tabanı y = 0); örnek matrisi ayak izine ve yüksekliğe ölçekler. */
export function buildPlinthGeometry(): BufferGeometry {
  return merge([box(1, 1, 1, 0, 0, 0, C.stone)], createRandom(5));
}

/**
 * Taş merdiven (birim): x ∈ [−0,5; 0,5], y ∈ [0; 1], z ∈ [0; 1]; en yüksek basamak z = 0'da (kapı), en alçak
 * z = 1'de. Örnek matrisi genişliğe, yüksekliğe (rise) ve uzunluğa (run) ölçekler.
 */
export function buildStairsGeometry(steps = 6): BufferGeometry {
  const parts: Part[] = [];
  for (let i = 0; i < steps; i++) {
    const h = (steps - i) / steps;
    parts.push(box(1, h, 1 / steps, 0, 0, (i + 0.5) / steps, i % 2 ? C.stone : C.darkStone));
  }
  return merge(parts, createRandom(9));
}

/** Türk bayrağını (oran 2:3) kanvasa çizer: kırmızı zemin, beyaz ay-yıldız (2D bağlam yoksa hiçbir şey yapmaz). */
export function drawTurkishFlag(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const w = canvas.width;
  const h = canvas.height;
  // TS 2994 bayrak ölçüleri (G = yükseklik): ay dış çember 0,5G çapında, merkezi 0,5G'de; iç çember 0,4G
  // çapında, 0,0625G sağda; yıldız 0,25G çaplı çembere çizili, merkezi ay dış merkezinden 0,333G sağda.
  g.fillStyle = '#e30a17';
  g.fillRect(0, 0, w, h);
  const G = h;
  const cx = 0.5 * G;
  const cy = h / 2;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(cx, cy, 0.25 * G, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e30a17';
  g.beginPath();
  g.arc(cx + 0.0625 * G, cy, 0.2 * G, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  const sx = cx + 0.333 * G;
  const r = 0.125 * G;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI + (i * Math.PI) / 5; // bir köşe ayı (sola) gösterir
    const rr = i % 2 === 0 ? r : r * 0.382;
    g.lineTo(sx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/**
 * Uzak kademe ortak geometrileri (draw call tasarrufu): cami dışındaki yapılar uzakta iki ortak mesh'le çizilir.
 * Birim gövde (1 × 1 × 1, taban y = 0; çatılıda gövde 0,65 + kırma çatı 0,35); örnek matrisi yapının ölçülerine
 * ölçekler, örnek rengi yapının duvar tonunu verir (vertex rengi beyaz; çatı kiremit tonundadır).
 */
export function buildFarGenericGeometry(roofed: boolean): BufferGeometry {
  const parts: Part[] = roofed
    ? [box(1, 0.65, 1, 0, 0, 0, 0xffffff), hipRoof(1, 1, 0.35, 0.65, 0xb06a4c, 0.04)]
    : [box(1, 1, 1, 0, 0, 0, 0xffffff)];
  return merge(parts, createRandom(11));
}

/** Uzak ortak geometride yapının ölçüsü (oyun m), çatılı olup olmadığı ve duvar tonu (0xRRGGBB). */
export function farGenericSpec(
  kind: BuildingKind,
  floors: number,
  ruined: boolean,
): { w: number; h: number; d: number; roofed: boolean; tint: number } {
  const s = D[kind] as { w: number; d: number; h?: number; floorH?: number };
  const tint =
    kind === 'konak'
      ? C.konakWall
      : kind === 'apartment'
        ? C.concrete
        : kind === 'factory' || kind === 'mine_tower'
          ? C.brick
          : kind === 'castle' || kind === 'han' || kind === 'hamam' || kind === 'cemetery'
            ? C.stone
            : kind === 'tomb' ||
                kind === 'clock_tower' ||
                kind === 'government' ||
                kind === 'monument'
              ? C.cutStone
              : C.whitewash;
  const flat = [
    'apartment',
    'factory',
    'castle',
    'cemetery',
    'fountain',
    'monument',
    'clock_tower',
    'mine_tower',
  ];
  const h =
    kind === 'apartment'
      ? floors * (s.floorH ?? 2.9)
      : kind === 'cemetery'
        ? 0.7
        : (s.h ?? 4) * (ruined ? 0.55 : 1);
  return { w: s.w, h, d: s.d, roofed: !ruined && !flat.includes(kind), tint };
}
