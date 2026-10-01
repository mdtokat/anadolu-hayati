import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { BUILDING_LOOK } from '../config';
import { GOVERNMENT_FLAG, SHAPE_DIMS, mosqueOffset, type BuildingKind } from '../settlements/kinds';
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
}

/** Geometri varyantı: tür + (yıkık | apartman kat sayısı) + kademe. */
export type BuildingLod = 'near' | 'far';

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

/** Yüzeydeki pencereler: `face` ön (+z) / arka / sol (−x) / sağ (+x); satır başına `cols` pencere. */
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
): Part[] {
  const parts: Part[] = [];
  const [ww, wh] = size;
  const t = 0.08;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols; c++) {
      if (skipCenterBottom && r === 0 && cols % 2 === 1 && c === (cols - 1) / 2) continue;
      const along = -span / 2 + (span / cols) * (c + 0.5);
      const y = rows[r] as number;
      const color = random.next() < boardedChance ? C.boarded : C.window;
      if (face === 'front') parts.push(box(ww, wh, t, along, y, offset, color));
      else if (face === 'back') parts.push(box(ww, wh, t, along, y, -offset, color));
      else if (face === 'left') parts.push(box(t, wh, ww, -offset, y, along, color));
      else parts.push(box(t, wh, ww, offset, y, along, color));
    }
  }
  return parts;
}

function door(w: number, h: number, z: number, x = 0): Part {
  return box(w, h, 0.1, x, 0, z, C.door);
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

/** Yıkık duvar: dört duvar, biri yarım, çatısız; içi yıkıntılı. */
function ruinedWalls(w: number, d: number, h: number, wall: number, random: Random): Part[] {
  const t = 0.3;
  const low = h * (0.35 + random.next() * 0.3);
  return [
    box(w, h, t, 0, 0, -d / 2 + t / 2, wall),
    box(t, h * 0.85, d, -w / 2 + t / 2, 0, 0, wall),
    box(t, low, d, w / 2 - t / 2, 0, 0, wall),
    box(w * 0.4, h * 0.7, t, -w * 0.3, 0, d / 2 - t / 2, wall),
    box(w * 0.25, low, t, w * 0.375, 0, d / 2 - t / 2, wall),
    ...rubble(0, 0, Math.min(w, d) * 0.5, random),
  ];
}

// -- konutlar -------------------------------------------------------------------

function houseParts(random: Random, ruined: boolean): Part[] {
  const { w, d, h } = D.house;
  const wallH = h * 0.62;
  if (ruined) return ruinedWalls(w, d, wallH, C.whitewash, random);
  return [
    box(w, wallH, d, 0, 0, 0, C.whitewash),
    // ahşap kuşak (kat silmesi)
    box(w + 0.06, 0.18, d + 0.06, 0, wallH * 0.48, 0, C.timber),
    hipRoof(w, d, h - wallH, wallH, C.roofTile),
    door(1, 2, d / 2 + 0.02),
    ...windows('front', w, d / 2 + 0.02, [0.9, wallH * 0.6], 3, [0.8, 0.9], random, 0.3, true),
    ...windows('left', d, w / 2 + 0.02, [0.9, wallH * 0.6], 2, [0.8, 0.9], random),
    ...windows('right', d, w / 2 + 0.02, [0.9, wallH * 0.6], 2, [0.8, 0.9], random),
    ...windows('back', w, d / 2 + 0.02, [wallH * 0.6], 3, [0.8, 0.9], random),
    // baca
    box(0.5, 1.2, 0.5, w * 0.25, wallH + 0.6, -d * 0.15, C.plaster),
  ];
}

function konakParts(random: Random, ruined: boolean): Part[] {
  const { w, d, h } = D.konak;
  const ground = 2.8;
  const upper = 2.6;
  const over = 0.7; // çıkma
  if (ruined) {
    return [
      box(w, ground, d, 0, 0, 0, C.stone),
      ...ruinedWalls(w + over, d + over, upper * 0.9, C.konakWall, random).map((p) => ({
        ...p,
        geometry: at(p.geometry, 0, ground, 0),
      })),
    ];
  }
  const parts: Part[] = [
    // taş zemin kat
    box(w, ground, d, 0, 0, 0, C.stone),
    // çıkmalı ahşap üst kat (bağdadi: badanalı sıva + ahşap dikmeler)
    box(w + over, upper, d + over, 0, ground, 0, C.konakWall),
    // çıkma altı payandaları
    box(w + over, 0.2, d + over, 0, ground - 0.1, 0, C.timber),
    hipRoof(w + over, d + over, h - ground - upper, ground + upper, C.roofTile, 0.75),
    door(1.4, 2.2, d / 2 + 0.02),
    ...windows('front', w, d / 2 + 0.02, [1], 2, [0.6, 0.7], random, 0.4),
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
  ];
  // Ahşap dikmeler (ön ve yan cephe).
  for (let i = 0; i <= 4; i++) {
    const x = -(w + over) / 2 + ((w + over) / 4) * i;
    parts.push(box(0.12, upper, 0.06, x, ground, (d + over) / 2 + 0.03, C.timber));
  }
  parts.push(box(w + over + 0.05, 0.12, d + over + 0.05, 0, ground + upper - 0.12, 0, C.timber));
  return parts;
}

function apartmentParts(random: Random, floors: number): Part[] {
  const { w, d, floorH } = D.apartment;
  const h = floors * floorH;
  const parts: Part[] = [
    box(w, h, d, 0, 0, 0, C.concrete),
    // çatı korkuluğu ve su deposu/güneş paneli (Türkiye'de yaygın)
    box(w, 0.5, 0.2, 0, h, d / 2 - 0.1, C.concreteDark),
    box(w, 0.5, 0.2, 0, h, -d / 2 + 0.1, C.concreteDark),
    box(0.2, 0.5, d, -w / 2 + 0.1, h, 0, C.concreteDark),
    box(0.2, 0.5, d, w / 2 - 0.1, h, 0, C.concreteDark),
    cylinder(0.35, 1.4, w * 0.25, h, -d * 0.2, C.tank, 6),
    box(1.6, 0.08, 1.1, w * 0.25 - 1, h + 0.5, -d * 0.2, C.window),
    door(1.4, 2.2, d / 2 + 0.02),
    box(2.2, 0.15, 1.2, 0, 2.4, d / 2 + 0.6, C.concreteDark), // giriş saçağı
  ];
  const rows: number[] = [];
  for (let f = 0; f < floors; f++) rows.push(f * floorH + 0.9);
  parts.push(...windows('front', w, d / 2 + 0.02, rows, 4, [1.1, 1.2], random, 0.2, false));
  parts.push(...windows('back', w, d / 2 + 0.02, rows, 4, [1.1, 1.2], random));
  parts.push(...windows('left', d, w / 2 + 0.02, rows, 2, [1, 1.2], random));
  parts.push(...windows('right', d, w / 2 + 0.02, rows, 2, [1, 1.2], random));
  // Balkonlar (ön cephe, birinci kattan itibaren).
  for (let f = 1; f < floors; f++) {
    const y = f * floorH;
    parts.push(box(w * 0.36, 0.15, 1, -w * 0.28, y, d / 2 + 0.5, C.concreteDark));
    parts.push(box(w * 0.36, 0.8, 0.08, -w * 0.28, y + 0.15, d / 2 + 1, C.concreteDark));
    parts.push(box(w * 0.36, 0.15, 1, w * 0.28, y, d / 2 + 0.5, C.concreteDark));
    parts.push(box(w * 0.36, 0.8, 0.08, w * 0.28, y + 0.15, d / 2 + 1, C.concreteDark));
  }
  return parts;
}

function lojmanParts(random: Random, ruined: boolean): Part[] {
  const { w, d, h } = D.lojman;
  const wallH = 4.8;
  if (ruined) return ruinedWalls(w, d, wallH, C.plaster, random);
  return [
    box(w, wallH, d, 0, 0, 0, C.plaster),
    box(w + 0.05, 0.25, d + 0.05, 0, 0, 0, C.darkStone),
    gableRoof(w, d, h - wallH, wallH, C.roofTile),
    door(1, 2, d / 2 + 0.02, -w * 0.25),
    door(1, 2, d / 2 + 0.02, w * 0.25),
    ...windows('front', w, d / 2 + 0.02, [0.9, 3.2], 6, [0.8, 1], random, 0.3),
    ...windows('back', w, d / 2 + 0.02, [0.9, 3.2], 6, [0.8, 1], random),
    box(0.5, 1.3, 0.5, -w * 0.3, wallH + 0.5, 0, C.brick),
    box(0.5, 1.3, 0.5, w * 0.3, wallH + 0.5, 0, C.brick),
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
  if (ruined) return ruinedWalls(w, d, h * 0.8, C.plaster, random);
  const parts: Part[] = [
    box(w, h, d, 0, 0, 0, C.plaster),
    box(w + 0.3, 0.25, d + 0.3, 0, h, 0, C.concreteDark),
    box(w, 0.6, 0.1, 0, h - 0.9, d / 2 + 0.05, C.sign), // tabela bandı (solmuş)
  ];
  // Dört dükkân: inik kepenkler (bir kısmı yarım açık, içi karanlık).
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + (w / 4) * (i + 0.5);
    const open = random.next() < 0.3;
    parts.push(
      box(w / 4 - 0.5, open ? 1.2 : 2.5, 0.08, x, open ? 1.3 : 0, d / 2 + 0.05, C.shutter),
    );
    if (open) parts.push(box(w / 4 - 0.5, 1.3, 0.06, x, 0, d / 2 + 0.03, C.window));
  }
  return parts;
}

function kahvehaneParts(random: Random, ruined: boolean): Part[] {
  const { w, d, h } = D.kahvehane;
  const wallH = 3.2;
  if (ruined) return ruinedWalls(w, d, wallH, C.whitewash, random);
  return [
    box(w, wallH, d, 0, 0, 0, C.whitewash),
    hipRoof(w, d, h - wallH, wallH, C.roofTile),
    door(1.2, 2.1, d / 2 + 0.02),
    ...windows('front', w, d / 2 + 0.02, [0.8], 2, [1.8, 1.4], random, 0.15),
    // tente (yırtık, solmuş) ve önde taş sedir
    box(w, 0.08, 1.6, 0, 2.5, d / 2 + 0.8, C.awning),
    box(w * 0.7, 0.45, 0.5, 0, 0, d / 2 + 1.4, C.stone),
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
  const wallH = 6.2;
  return [
    box(w, wallH, d, 0, 0, 0, C.cutStone),
    box(w + 0.2, 0.3, d + 0.2, 0, 3, 0, C.darkStone),
    hipRoof(w, d, h - wallH, wallH, C.roofTileDark, 0.5),
    // giriş: üçgen alınlıklı revak
    box(4.5, 3.6, 1.6, 0, 0, d / 2 + 0.8, C.cutStone),
    pediment(d),
    door(1.6, 2.6, d / 2 + 1.62),
    ...windows('front', w, d / 2 + 0.02, [1, 4], 7, [0.9, 1.6], random, 0.15),
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
  ];
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
  const shaftTop = height * 0.82;
  parts.push(cylinder(r, shaftTop - baseH, x, baseH, z, body, 8));
  for (let i = 0; i < balconies; i++) {
    const y = shaftTop - 0.6 - i * (height * 0.2);
    parts.push(cylinder(r * 1.6, 0.35, x, y, z, body, 10, r * 1.6));
    parts.push(cylinder(r * 1.6, 0.6, x, y + 0.35, z, C.darkStone, 10, r * 1.6));
  }
  parts.push(cylinder(r * 0.85, height * 0.04, x, shaftTop, z, body, 8));
  parts.push(cone(r * 1.05, height * 0.14, x, shaftTop + height * 0.04, z, cap, 8));
  parts.push(...alem(x, height, z, 0.7));
  return parts;
}

function mosqueParts(kind: 'mosque_grand' | 'mosque'): Part[] {
  const s = D[kind];
  const grand = kind === 'mosque_grand';
  const parts: Part[] = [
    // harim: kesme taş beden
    box(s.w, s.h, s.d, 0, 0, 0, C.cutStone),
    box(s.w + 0.2, 0.3, s.d + 0.2, 0, s.h - 0.3, 0, C.darkStone),
    // kasnak + ana kubbe (kurşun)
    cylinder(s.dome * 0.92, 1, 0, s.h, 0, C.cutStone, 12),
    dome(s.dome, 0, s.h + 1, 0, C.lead, 14),
    ...alem(0, s.h + 1 + s.dome, 0, 0.9),
    // son cemaat yeri: revak + küçük kubbeler
    box(s.w, 0.5, s.portico, 0, s.h * 0.55, s.d / 2 + s.portico / 2, C.cutStone),
    door(2.4, 3, s.d / 2 + 0.02),
  ];
  const domes = grand ? 5 : 3;
  for (let i = 0; i < domes; i++) {
    const x = -s.w / 2 + (s.w / domes) * (i + 0.5);
    parts.push(dome(s.portico * 0.42, x, s.h * 0.55 + 0.5, s.d / 2 + s.portico / 2, C.lead, 8));
    // revak sütunları
    parts.push(
      cylinder(
        0.2,
        s.h * 0.55,
        x - s.w / domes / 2 + 0.2,
        0,
        s.d / 2 + s.portico - 0.3,
        C.marble,
        6,
      ),
    );
  }
  parts.push(cylinder(0.2, s.h * 0.55, s.w / 2 - 0.2, 0, s.d / 2 + s.portico - 0.3, C.marble, 6));
  if (grand) {
    // yarım kubbeler ve köşe kubbecikleri
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      parts.push(dome(2, sx * (s.w / 2 - 2.2), s.h, sz * (s.d / 2 - 2.2), C.lead, 8));
      parts.push(
        cylinder(0.35, 2.4, sx * (s.w / 2 - 0.4), s.h, sz * (s.d / 2 - 0.4), C.cutStone, 6),
      );
      parts.push(cone(0.45, 1.2, sx * (s.w / 2 - 0.4), s.h + 2.4, sz * (s.d / 2 - 0.4), C.lead, 6));
    }
  }
  // Pencereler: iki sıra (alt dikdörtgen, üst kemerli — koyu).
  const flat = createRandom(17);
  parts.push(
    ...windows('left', s.d, s.w / 2 + 0.02, [1.4, s.h * 0.62], grand ? 4 : 3, [0.9, 1.6], flat, 0),
  );
  parts.push(
    ...windows('right', s.d, s.w / 2 + 0.02, [1.4, s.h * 0.62], grand ? 4 : 3, [0.9, 1.6], flat, 0),
  );
  parts.push(
    ...windows('back', s.w, s.d / 2 + 0.02, [1.4, s.h * 0.62], grand ? 4 : 3, [0.9, 1.6], flat, 0),
  );
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
  const parts: Part[] = [
    box(s.w, 0.6, s.d, 0, 0, 0, C.stone),
    box(s.w, s.h - 0.6, s.d, 0, 0.6, 0, C.whitewash),
    // ahşap kaplama kuşağı
    box(s.w + 0.05, 1.2, s.d + 0.05, 0, s.h - 1.4, 0, C.woodLight),
    hipRoof(s.w, s.d, 2.4, s.h, C.roofTileDark, 0.7),
    door(1.6, 2.2, s.d / 2 + 0.02),
    box(s.w, 0.15, 1.6, 0, 2.6, s.d / 2 + 0.8, C.wood), // sundurma
    box(0.15, 2.6, 0.15, -s.w / 2 + 0.3, 0, s.d / 2 + 1.5, C.wood),
    box(0.15, 2.6, 0.15, s.w / 2 - 0.3, 0, s.d / 2 + 1.5, C.wood),
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
  parts.push(cone(0.6, s.minaret * 0.22, x, 1.2 + s.minaret * 0.7, z, C.lead, 8));
  parts.push(...alem(x, 1.2 + s.minaret * 0.92, z, 0.45));
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
  // Avluda şadırvan/mescit kaidesi
  parts.push(box(2, 0.6, 2, 0, 0, 0, C.cutStone));
  return parts;
}

function hamamParts(): Part[] {
  const { w, d, h } = D.hamam;
  const wallH = h * 0.62;
  return [
    box(w, wallH, d, 0, 0, 0, C.stone),
    dome(3, -w * 0.18, wallH, -d * 0.1, C.lead, 10),
    dome(2.2, w * 0.28, wallH, -d * 0.18, C.lead, 8),
    dome(1.8, w * 0.28, wallH, d * 0.25, C.lead, 8),
    dome(1.5, -w * 0.3, wallH, d * 0.3, C.lead, 8),
    door(1.2, 2.2, d / 2 + 0.02),
    box(0.8, 3.4, 0.8, w / 2 - 0.6, wallH, -d / 2 + 0.6, C.brick), // külhan bacası
  ];
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
  const parts =
    lod === 'near' ? nearParts(kind, ruined, floors, random) : farParts(kind, ruined, floors);
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
