import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Matrix4,
  Vector3,
} from 'three';
import { PIECES, PIECES_II, STRUCTURE_LOOK } from '../config';
import { parseFoundationVariant, type FoundationVariant } from '../placement/pieces';
import {
  CHEST,
  HUT,
  PIECE2_SHAPE as Q,
  PIECE_SHAPE as P,
  WORKBENCH,
  wellRims,
} from '../placement/structureShapes';
import type { StructureKind } from '../placement/structures';
import { createRandom } from '../utils/random';
import { blob, merge, place, type Part } from './propGeometry';

/**
 * Yapılar için düşük poligonlu prosedürel geometri (doku yok; renk vertex renginde, düz gölgeli). Geometri
 * yerel uzayda kuruludur: zemin y = 0, açık yüz +Z (yerleştirme oyuncuya çevirir). Dik yamaçta yapının bir
 * yanı havada kalmasın diye zeminin altına inen "etek" parçaları vardır (y < 0). Çağıran `dispose()` eder.
 */
const C = STRUCTURE_LOOK.colors;
const SEED = 4801;

function rotate(geometry: BufferGeometry, m: Matrix4): BufferGeometry {
  return geometry.applyMatrix4(m);
}

/** Yatay (X ekseni boyunca) ya da verilen eksende eğik silindir: iki uç noktayı birleştirir. */
function beam(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  radius: number,
  color: number,
  segments = 5,
): Part {
  const [ax, ay, az] = from;
  const [bx, by, bz] = to;
  const length = Math.hypot(bx - ax, by - ay, bz - az);
  const geometry = new CylinderGeometry(radius, radius, length, segments, 1, false);
  // Silindir Y ekseninde; Y'yi (b − a) yönüne döndür.
  const dir = [(bx - ax) / length, (by - ay) / length, (bz - az) / length] as const;
  const axis = [dir[2], 0, -dir[0]] as const; // Y × dir
  const axisLen = Math.hypot(axis[0], axis[2]);
  if (axisLen > 1e-6) {
    const angle = Math.acos(Math.min(1, Math.max(-1, dir[1])));
    const m = new Matrix4().makeRotationAxis(
      new Vector3(axis[0] / axisLen, 0, axis[2] / axisLen),
      angle,
    );
    rotate(geometry, m);
  } else if (dir[1] < 0) {
    rotate(geometry, new Matrix4().makeRotationX(Math.PI));
  }
  return { geometry: place(geometry, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), color };
}

function campfireParts(): Part[] {
  const parts: Part[] = [];
  const stones = 8;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2;
    parts.push(
      blob(
        0.17,
        0,
        [1, 0.75, 1],
        [Math.cos(a) * 0.58, 0.1, Math.sin(a) * 0.58],
        C.stone,
        0.3,
        SEED + i,
      ),
    );
  }
  // Etek: zeminin altına inen kül dolgusu (dik yamaçta havada kalmasın).
  parts.push({
    geometry: place(new CylinderGeometry(0.62, 0.62, 0.7, 10, 1, true), 0, -0.3, 0),
    color: C.skirt,
  });
  parts.push({
    geometry: place(new CylinderGeometry(0.5, 0.5, 0.05, 10), 0, 0.03, 0),
    color: C.ash,
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    parts.push(
      beam(
        [Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45],
        [-Math.cos(a) * 0.3, 0.3, -Math.sin(a) * 0.3],
        0.07,
        C.log,
        6,
      ),
    );
  }
  return parts;
}

/** Alev: birkaç koni (iç içe); yanıkken görünür. Kendi ışığı yoktur, materyali aydınlatmasızdır. */
function flameParts(): Part[] {
  const cone = (r: number, h: number, x: number, z: number, color: number): Part => ({
    geometry: place(new ConeGeometry(r, h, 6, 1, true), x, 0.25 + h / 2, z),
    color,
  });
  return [
    cone(0.26, 0.85, 0, 0, C.flameOuter),
    cone(0.17, 0.62, 0.05, 0.03, C.flameInner),
    cone(0.09, 0.42, -0.03, 0, C.flameCore),
    cone(0.13, 0.5, -0.17, 0.1, C.flameOuter),
    cone(0.12, 0.45, 0.15, -0.14, C.flameOuter),
  ];
}

function leanToParts(): Part[] {
  const parts: Part[] = [];
  const front = 0.9;
  const back = -1.2;
  const frontTop = 1.75;
  const backTop = 0.9;
  const halfWidth = 1.6;
  const skirt = -1.2; // direkler zeminin altına iner
  for (const x of [-halfWidth, halfWidth]) {
    parts.push(beam([x, skirt, front], [x, frontTop, front], 0.07, C.pole));
    parts.push(beam([x, skirt, back], [x, backTop, back], 0.07, C.pole));
  }
  // Eğik çatı: ön üst kenardan arka üst kenara.
  const rise = frontTop - backTop;
  const run = front - back;
  const slope = Math.atan2(rise, run);
  const roofLength = Math.hypot(rise, run) + 0.25;
  const roof = new BoxGeometry(halfWidth * 2 + 0.5, 0.09, roofLength);
  rotate(roof, new Matrix4().makeRotationX(-slope));
  parts.push({
    geometry: place(roof, 0, (frontTop + backTop) / 2 + 0.05, (front + back) / 2),
    color: C.roof,
  });
  // Arka duvar (zemine gömülü kısmıyla) ve yaprak yatak.
  parts.push({
    geometry: place(new BoxGeometry(halfWidth * 2, 1.9, 0.09), 0, -0.25, back - 0.02),
    color: C.roof,
  });
  parts.push({
    geometry: place(new CylinderGeometry(1.25, 1.25, 0.07, 9), 0, 0.03, -0.1),
    color: C.leaves,
  });
  // Etek: yan kenarlarda zemine inen kısa perde (yamaçta boşluk kalmasın).
  parts.push({
    geometry: place(new BoxGeometry(halfWidth * 2, 1.2, 0.09), 0, -0.55, front),
    color: C.leaves,
  });
  return parts;
}

/** Kutu parçası: alt-üst sınırlarla (yerel uzay). */
function slab(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  color: number,
): Part {
  return {
    geometry: place(
      new BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ),
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    ),
    color,
  };
}

/** Sandık (Faz 9): tahta gövde, koyu kapak, demir kuşaklar ve kilit; zemine gömülü etek. */
function chestParts(): Part[] {
  const w = CHEST.width / 2;
  const d = CHEST.depth / 2;
  const h = CHEST.height;
  const lid = h * 0.3;
  return [
    slab(-w, w, -0.35, h - lid, -d, d, C.plank),
    slab(-w - 0.02, w + 0.02, h - lid, h, -d - 0.02, d + 0.02, C.darkPlank),
    slab(-w + 0.12, -w + 0.2, -0.05, h + 0.01, -d - 0.03, d + 0.03, C.iron),
    slab(w - 0.2, w - 0.12, -0.05, h + 0.01, -d - 0.03, d + 0.03, C.iron),
    slab(-0.06, 0.06, h - lid - 0.12, h - lid + 0.04, d, d + 0.05, C.iron),
  ];
}

/** Çalışma tezgâhı (Faz 9): kalın tabla, dört bacak, üstünde taş örs ve dal demeti. */
function workbenchParts(): Part[] {
  const w = WORKBENCH.width / 2;
  const d = WORKBENCH.depth / 2;
  const h = WORKBENCH.height;
  const parts: Part[] = [slab(-w, w, h - 0.12, h, -d, d, C.plank)];
  for (const x of [-w + 0.1, w - 0.1]) {
    for (const z of [-d + 0.1, d - 0.1]) {
      parts.push(slab(x - 0.06, x + 0.06, -0.5, h - 0.12, z - 0.06, z + 0.06, C.darkPlank));
    }
  }
  parts.push(slab(-w + 0.08, w - 0.08, 0.18, 0.24, -d + 0.08, d - 0.08, C.darkPlank)); // alt raf
  parts.push(blob(0.16, 0, [1.3, 0.7, 1], [w * 0.45, h + 0.08, 0], C.stone, 0.25, SEED + 40));
  parts.push(beam([-w * 0.8, h + 0.05, -0.12], [-w * 0.1, h + 0.05, -0.15], 0.04, C.log, 5));
  parts.push(beam([-w * 0.8, h + 0.05, 0.02], [-w * 0.15, h + 0.05, 0.06], 0.04, C.log, 5));
  return parts;
}

/**
 * Ahşap kulübe (Faz 9): dört duvar (önde kapı boşluğu ve lento), iki eğik çatı yüzü ve iki üçgen alın; duvarlar
 * zeminin altına iner (yamaç). Ölçüler `HUT` (collider'larla aynı).
 */
function hutParts(): Part[] {
  const { inner, wallThickness: t, wallHeight: top, skirt, doorWidth, doorHeight } = HUT;
  const outer = inner + t;
  const bottom = -skirt;
  const door = doorWidth / 2;
  const parts: Part[] = [
    slab(-outer, outer, bottom, top, -outer, -inner, C.wall),
    slab(-outer, -inner, bottom, top, -outer, outer, C.wall),
    slab(inner, outer, bottom, top, -outer, outer, C.wall),
    slab(-outer, -door, bottom, top, inner, outer, C.wall),
    slab(door, outer, bottom, top, inner, outer, C.wall),
    slab(-door, door, doorHeight, top, inner, outer, C.wall), // lento
    slab(-door, door, bottom, 0.02, inner, outer, C.darkPlank), // eşik
  ];
  // Köşe direkleri (koyu): duvar birleşimlerini belirginleştirir.
  for (const x of [-outer, outer]) {
    for (const z of [-outer, outer]) {
      parts.push(slab(x - 0.12, x + 0.12, bottom, top + 0.05, z - 0.12, z + 0.12, C.darkPlank));
    }
  }
  // Yatay kütük çizgileri (dış yüzde ince şeritler).
  for (let y = 0.45; y < top; y += 0.55) {
    parts.push(slab(-outer - 0.03, outer + 0.03, y, y + 0.06, -outer - 0.03, -outer, C.darkPlank));
    parts.push(slab(-outer - 0.03, -outer, y, y + 0.06, -outer, outer, C.darkPlank));
    parts.push(slab(outer, outer + 0.03, y, y + 0.06, -outer, outer, C.darkPlank));
  }
  // Çatı: mahya X ekseni boyunca; ön (+Z) ve arka (−Z) eğik yüzler.
  const eave = outer + HUT.roofOverhang;
  const rise = HUT.ridgeHeight - top;
  const slope = Math.atan2(rise, eave);
  const length = Math.hypot(rise, eave) + 0.1;
  for (const side of [1, -1]) {
    const roof = new BoxGeometry(eave * 2 + 0.1, 0.1, length);
    rotate(roof, new Matrix4().makeRotationX(side * slope));
    parts.push({
      geometry: place(roof, 0, top + rise / 2 + 0.05, (side * eave) / 2),
      color: C.hutRoof,
    });
  }
  // Alınlar: yan duvarların üstünde üçgen (çatıyla duvar arası kapansın).
  for (const x of [-outer + t / 2, outer - t / 2]) {
    const gable = new CylinderGeometry(0.0001, outer * Math.SQRT2, rise, 4, 1);
    rotate(gable, new Matrix4().makeRotationY(Math.PI / 4));
    gable.scale(t / (outer * 2), 1, 1);
    parts.push({ geometry: place(gable, x, top + rise / 2, 0), color: C.wall });
  }
  return parts;
}

/** Taban plakasının tahta çizgileri (üst yüzde ince koyu şeritler). */
function plankLines(minY: number, color: number, from: number, to: number, step: number): Part[] {
  const lines: Part[] = [];
  for (let z = from + step; z < to - 1e-6; z += step) {
    lines.push(slab(-P.half, P.half, minY, minY + 0.012, z - 0.015, z + 0.015, color));
  }
  return lines;
}

/** Taban (modüler): tahta kaplı plaka ve zemine inen toprak tonlu etek. */
function foundationParts(): Part[] {
  return [
    slab(-P.half, P.half, 0, P.slab, -P.half, P.half, C.slab),
    ...plankLines(P.slab, C.darkPlank, -P.half, P.half, 0.5),
    slab(-P.half + 0.04, P.half - 0.04, -PIECES.skirt, 0, -P.half + 0.04, P.half - 0.04, C.skirt),
  ];
}

/** Çatı (modüler): koyu plaka, üstünde kiremit/tahta şeritleri ve çıkıntılı saçak. */
function roofParts(): Part[] {
  const o = P.half + 0.1;
  const parts: Part[] = [slab(-o, o, 0, P.slab, -o, o, C.roofSlab)];
  for (let z = -P.half + 0.4; z < P.half; z += 0.4) {
    parts.push(slab(-o, o, P.slab, P.slab + 0.025, z - 0.02, z + 0.02, C.darkPlank));
  }
  return parts;
}

/** Duvar gövdesi için ortak: iki yan direk ve kütük çizgileri; `openings` doğrudan kutu verir. */
function wallFrame(): Part[] {
  const t = P.thickness / 2 + 0.03;
  const parts: Part[] = [];
  for (const x of [-P.half, P.half]) {
    const inner = x < 0 ? x : x - 0.1;
    parts.push(slab(inner, inner + 0.1, P.wallBottom, P.wallTop, -t, t, C.darkPlank));
  }
  return parts;
}

/** Yatay kütük çizgileri: `[minX, maxX]` aralığında, `[minY, maxY]` bandında, iki yüzde. */
function logLines(minX: number, maxX: number, minY: number, maxY: number): Part[] {
  const t = P.thickness / 2;
  const lines: Part[] = [];
  for (let y = minY + 0.3; y < maxY - 0.1; y += 0.5) {
    lines.push(slab(minX, maxX, y, y + 0.05, -t - 0.02, t + 0.02, C.darkPlank));
  }
  return lines;
}

function wallParts(): Part[] {
  const t = P.thickness / 2;
  return [
    slab(-P.half, P.half, P.wallBottom, P.wallTop, -t, t, C.wall),
    ...logLines(-P.half, P.half, P.wallBottom, P.wallTop),
    ...wallFrame(),
  ];
}

function doorwayParts(): Part[] {
  const t = P.thickness / 2;
  const d = P.doorHalf;
  return [
    slab(-P.half, -d, P.wallBottom, P.wallTop, -t, t, C.wall),
    slab(d, P.half, P.wallBottom, P.wallTop, -t, t, C.wall),
    slab(-d, d, P.doorTop, P.wallTop, -t, t, C.wall),
    ...logLines(-P.half, -d, P.wallBottom, P.wallTop),
    ...logLines(d, P.half, P.wallBottom, P.wallTop),
    ...logLines(-d, d, P.doorTop, P.wallTop),
    // Kasa: iki yan söve ve üst lento (koyu).
    slab(-d - 0.07, -d, P.wallBottom, P.doorTop + 0.07, -t - 0.03, t + 0.03, C.darkPlank),
    slab(d, d + 0.07, P.wallBottom, P.doorTop + 0.07, -t - 0.03, t + 0.03, C.darkPlank),
    slab(-d - 0.07, d + 0.07, P.doorTop, P.doorTop + 0.07, -t - 0.03, t + 0.03, C.darkPlank),
    ...wallFrame(),
  ];
}

function windowWallParts(): Part[] {
  const t = P.thickness / 2;
  const w = P.windowHalf;
  return [
    slab(-P.half, -w, P.wallBottom, P.wallTop, -t, t, C.wall),
    slab(w, P.half, P.wallBottom, P.wallTop, -t, t, C.wall),
    slab(-w, w, P.wallBottom, P.windowBottom, -t, t, C.wall),
    slab(-w, w, P.windowTop, P.wallTop, -t, t, C.wall),
    ...logLines(-P.half, -w, P.wallBottom, P.wallTop),
    ...logLines(w, P.half, P.wallBottom, P.wallTop),
    ...logLines(-w, w, P.wallBottom, P.windowBottom),
    ...logLines(-w, w, P.windowTop, P.wallTop),
    // Pencere çerçevesi ve denizlik.
    slab(-w - 0.06, -w, P.windowBottom, P.windowTop, -t - 0.03, t + 0.03, C.darkPlank),
    slab(w, w + 0.06, P.windowBottom, P.windowTop, -t - 0.03, t + 0.03, C.darkPlank),
    slab(
      -w - 0.08,
      w + 0.08,
      P.windowBottom - 0.05,
      P.windowBottom + 0.03,
      -t - 0.07,
      t + 0.07,
      C.darkPlank,
    ),
    slab(-w - 0.06, w + 0.06, P.windowTop, P.windowTop + 0.06, -t - 0.03, t + 0.03, C.darkPlank),
    ...wallFrame(),
  ];
}

/** Kapı kanadı (kapalı): boşluğu doldurur; açıkken menteşe yanında öne açılır. */
function doorParts(open: boolean): Part[] {
  const d = P.doorHalf;
  const th = P.doorLeafThickness / 2;
  if (!open) {
    return [
      slab(-d, d, P.wallBottom, P.doorTop, -th, th, C.plank),
      slab(-d, d, P.wallBottom + 0.3, P.wallBottom + 0.42, -th - 0.02, th + 0.02, C.darkPlank),
      slab(-d, d, P.doorTop - 0.5, P.doorTop - 0.38, -th - 0.02, th + 0.02, C.darkPlank),
      slab(d - 0.2, d - 0.14, 1.0, 1.1, th, th + 0.05, C.iron),
    ];
  }
  // Açık: kanat x = −d'de, +Z'ye doğru 2d uzunlukta.
  const z0 = 0;
  const z1 = 2 * d;
  return [
    slab(-d - th, -d + th, P.wallBottom, P.doorTop, z0, z1, C.plank),
    slab(
      -d - th - 0.02,
      -d + th + 0.02,
      P.wallBottom + 0.3,
      P.wallBottom + 0.42,
      z0,
      z1,
      C.darkPlank,
    ),
    slab(-d - th - 0.02, -d + th + 0.02, P.doorTop - 0.5, P.doorTop - 0.38, z0, z1, C.darkPlank),
    slab(-d + th, -d + th + 0.05, 1.0, 1.1, z1 - 0.2, z1 - 0.14, C.iron),
  ];
}

/**
 * Faz 11 (11.0) yer tutucu: zemine gömülü etek + tek renkli gövde kutusu. Sahibi akış (A, B, C, F) kendi bölüm
 * başlığı altında gerçek geometriyi yazar ve `PARTS`'taki satırını değiştirir.
 */
function placeholderParts(width: number, height: number, depth: number, color: number): Part[] {
  const w = width / 2;
  const d = depth / 2;
  return [
    slab(-w, w, -0.5, 0, -d, d, C.skirt),
    slab(-w, w, 0, Math.max(height, 0.35), -d, d, color),
  ];
}

// ── 11.1 (A) ──

/** Yerel X ekseni etrafında eğik kutu: üst yüzü (a → b) doğru parçası, X'te [x0, x1], kalınlık yüzeyin altında. */
function slopePart(
  x0: number,
  x1: number,
  a: readonly [number, number],
  b: readonly [number, number],
  thickness: number,
  color: number,
): Part {
  const [ay, az] = a;
  const [by, bz] = b;
  const length = Math.hypot(bz - az, by - ay);
  const pitch = Math.atan2(-(by - ay), bz - az);
  let ny = Math.cos(pitch);
  let nz = Math.sin(pitch);
  if (ny < 0) {
    ny = -ny;
    nz = -nz;
  }
  const geometry = new BoxGeometry(x1 - x0, thickness, length);
  rotate(geometry, new Matrix4().makeRotationX(pitch));
  return {
    geometry: place(
      geometry,
      (x0 + x1) / 2,
      (ay + by) / 2 - (ny * thickness) / 2,
      (az + bz) / 2 - (nz * thickness) / 2,
    ),
    color,
  };
}

/** Merdiven: iki yan kiriş (eğik) ve açık basamaklar; yerel −Z'ye bir kat çıkar (basamak ortası rampadadır). */
function stairsParts(): Part[] {
  const steps = PIECES_II.stairs.steps;
  const run = Q.stairRun / steps;
  const rise = Q.stairRise / steps;
  const low = Q.stairRun / 2;
  const parts: Part[] = [];
  for (let i = 0; i < steps; i++) {
    const top = P.slab + (i + 0.5) * rise;
    const z1 = low - i * run;
    parts.push(
      slab(
        -Q.stairHalf,
        Q.stairHalf,
        top - 0.06,
        top,
        Math.max(z1 - run - 0.02, -low),
        z1,
        C.plank,
      ),
    );
  }
  // Yan kirişler: basamakları taşıyan eğik kalaslar (alt uçta tabana, üst uçta üst kat tabanına değer); üst ucu,
  // kalınlığı ayak izinden taşmasın diye biraz kısa.
  const trim = 0.2;
  const endY = P.slab + 0.12 + Q.stairRise * (1 - trim / Q.stairRun);
  for (const x of [-Q.stairHalf - 0.05, Q.stairHalf + 0.05]) {
    parts.push(
      slopePart(x - 0.05, x + 0.05, [P.slab + 0.12, low], [endY, -low + trim], 0.32, C.darkPlank),
    );
  }
  return parts;
}

/** Giriş basamağı: tabanın kenarından dışarı inen taş basamaklar (alt kısmı zemine gömülür). */
function entryStepParts(): Part[] {
  const steps = PIECES_II.entryStep.steps;
  const run = Q.stepDepth / steps;
  const rise = Q.stepRise / steps;
  const bottom = P.slab - Q.stepRise - 0.4;
  // Eşik: tabanın kenarında, üst yüzüyle hizalı koyu kalas.
  const parts: Part[] = [
    slab(-Q.stepHalf, Q.stepHalf, P.slab - 0.12, P.slab + 0.01, -0.04, 0.06, C.darkPlank),
  ];
  for (let k = 0; k < steps; k++) {
    const top = P.slab - (k + 0.5) * rise;
    parts.push(slab(-Q.stepHalf, Q.stepHalf, bottom, top, k * run, (k + 1) * run, C.stone));
    // Basamak burnu (koyu şerit).
    parts.push(
      slab(
        -Q.stepHalf,
        Q.stepHalf,
        top - 0.04,
        top + 0.005,
        (k + 1) * run - 0.06,
        (k + 1) * run,
        C.skirt,
      ),
    );
  }
  return parts;
}

/** Direk: köşede kalın dikme, altında taş kaide, üstünde başlık. */
function pillarParts(): Part[] {
  const h = Q.pillarHalf;
  return [
    slab(-h - 0.06, h + 0.06, P.slab - 0.02, P.slab + 0.14, -h - 0.06, h + 0.06, C.stone),
    slab(-h, h, P.slab + 0.14, Q.pillarTop - 0.12, -h, h, C.log),
    slab(-h - 0.05, h + 0.05, Q.pillarTop - 0.12, Q.pillarTop, -h - 0.05, h + 0.05, C.darkPlank),
  ];
}

/** Korkuluk (yerel X boyunca, merkez z = `z0`, X'te [−len, len]): uç dikmeleri, üst/alt tırabzan, parmaklıklar. */
function railingAlongX(len: number, z0: number): Part[] {
  const t = Q.railHalf;
  const top = Q.railTop;
  const parts: Part[] = [
    slab(-len, len, top - 0.07, top, z0 - t - 0.01, z0 + t + 0.01, C.darkPlank),
    slab(-len, len, P.slab + 0.12, P.slab + 0.18, z0 - t, z0 + t, C.plank),
  ];
  for (const x of [-len + 0.05, len - 0.05]) {
    parts.push(slab(x - 0.05, x + 0.05, P.slab, top, z0 - 0.05, z0 + 0.05, C.darkPlank));
  }
  const count = Math.round((len * 2) / 0.24);
  for (let i = 1; i < count; i++) {
    const x = -len + (i * len * 2) / count;
    parts.push(
      slab(x - 0.025, x + 0.025, P.slab + 0.18, top - 0.07, z0 - 0.025, z0 + 0.025, C.plank),
    );
  }
  return parts;
}

/** Korkuluk: plaka kenarında, kenar boyunca. */
function railingParts(): Part[] {
  return railingAlongX(P.half, 0);
}

/** Yarım duvar: duvarın alt kısmı, üstünde kapak kalası; kenarlarda dikme. */
function halfWallParts(): Part[] {
  const t = P.thickness / 2;
  const top = Q.halfWallTop;
  const parts: Part[] = [
    slab(-P.half, P.half, P.wallBottom, top - 0.05, -t, t, C.wall),
    ...logLines(-P.half, P.half, P.wallBottom, top - 0.05),
    slab(-P.half, P.half, top - 0.05, top, -t - 0.04, t + 0.04, C.darkPlank),
  ];
  for (const x of [-P.half, P.half - 0.1]) {
    parts.push(slab(x, x + 0.1, P.wallBottom, top - 0.05, -t - 0.03, t + 0.03, C.darkPlank));
  }
  return parts;
}

/** Beşik çatı: mahya X boyunca; ±Z'ye inen iki eğik yüz, üstlerinde kiremit şeritleri ve mahya kapağı. */
function gableRoofParts(): Part[] {
  const drop = Q.gableEave * Math.tan(Q.gablePitch);
  const h = P.half + 0.005; // komşu parçayla ek yeri kapansın
  const parts: Part[] = [];
  for (const side of [1, -1]) {
    parts.push(
      slopePart(
        -h,
        h,
        [Q.gableRise, 0],
        [Q.gableRise - drop, side * Q.gableEave],
        Q.gableThickness,
        C.roofSlab,
      ),
    );
    // Kiremit şeritleri: yüzeyin hemen üstünde, mahyaya paralel.
    for (let k = 1; k <= 4; k++) {
      const z = (side * Q.gableEave * k) / 5;
      const y = Q.gableRise - Math.abs(z) * Math.tan(Q.gablePitch);
      parts.push(slab(-h, h, y, y + 0.03, z - 0.03, z + 0.03, C.darkPlank));
    }
  }
  parts.push(slab(-h, h, Q.gableRise - 0.02, Q.gableRise + 0.08, -0.1, 0.1, C.darkPlank));
  return parts;
}

/** Alın duvarı: beşik çatının ucunda, duvar üstünden mahyaya üçgen (yerel X boyunca, z = 0'da). */
function gableWallParts(): Part[] {
  const t = P.thickness;
  const base = PIECES.cell;
  const gable = new CylinderGeometry(0.0001, base * Math.SQRT2, Q.gableRise, 4, 1);
  rotate(gable, new Matrix4().makeRotationY(Math.PI / 4));
  gable.scale(1, 1, t / (base * 2));
  return [
    { geometry: place(gable, 0, Q.gableRise / 2, 0), color: C.wall },
    slab(-base, base, 0, 0.08, -t / 2 - 0.03, t / 2 + 0.03, C.darkPlank),
  ];
}

/**
 * Tabanın varyant geometrisi: yükseltilmiş (üst kat/balkon: etek yerine kiriş çerçevesi) ya da merdiven boşluklu
 * (kenar şeridi + maskedeki kenarlarda korkuluk; `edgesOfCell` sırası kuzey, güney, batı, doğu).
 */
function foundationVariantParts(v: FoundationVariant): Part[] {
  if (!v.raised && !v.well) return foundationParts();
  const h = P.half;
  const beam = (minX: number, maxX: number, minZ: number, maxZ: number): Part =>
    slab(minX, maxX, -0.14, 0.001, minZ, maxZ, C.darkPlank);
  if (!v.well) {
    return [
      slab(-h, h, 0, P.slab, -h, h, C.slab),
      ...plankLines(P.slab, C.darkPlank, -h, h, 0.5),
      beam(-h, h, -h, -h + 0.12),
      beam(-h, h, h - 0.12, h),
      beam(-h, -h + 0.12, -h, h),
      beam(h - 0.12, h, -h, h),
    ];
  }
  const parts: Part[] = wellRims(v.open).map((b) =>
    slab(b.minX, b.maxX, 0, P.slab, b.minZ, b.maxZ, C.slab),
  );
  const rails: Array<[number, Matrix4]> = [
    [1, new Matrix4().makeTranslation(0, 0, -h)],
    [2, new Matrix4().makeTranslation(0, 0, h)],
    [4, new Matrix4().makeTranslation(-h, 0, 0).multiply(new Matrix4().makeRotationY(Math.PI / 2))],
    [8, new Matrix4().makeTranslation(h, 0, 0).multiply(new Matrix4().makeRotationY(Math.PI / 2))],
  ];
  for (const [bit, m] of rails) {
    if (!(v.rails & bit)) continue;
    for (const part of railingAlongX(h, 0)) {
      parts.push({ geometry: rotate(part.geometry, m), color: part.color });
    }
  }
  return parts;
}

// ── 11.2/11.3 (B) ──
const forgeParts = (): Part[] => placeholderParts(1.4, 1.1, 1, C.stone);
const stoneOvenParts = (): Part[] => placeholderParts(1.6, 1.4, 1.4, C.stone);
const handMillParts = (): Part[] => placeholderParts(0.9, 0.6, 0.9, C.stone);
const dryingRackParts = (): Part[] => placeholderParts(1.6, 1.6, 0.5, C.pole);
const bedrollParts = (): Part[] => placeholderParts(0.9, 0.35, 2, C.hutRoof);
const solarPanelParts = (): Part[] => placeholderParts(1.4, 1, 1, C.iron);
const woodFenceParts = (): Part[] => placeholderParts(2, 1.1, 0.1, C.plank);
const stoneFenceParts = (): Part[] => placeholderParts(2, 0.9, 0.5, C.stone);
const fenceGateParts = (): Part[] => placeholderParts(2, 1.1, 0.1, C.darkPlank);

// ── 11.4 (C) ──
const farmPlotParts = (): Part[] => placeholderParts(2, 0.35, 2, C.skirt);

// ── 11.8 (F) ──
const droneParts = (): Part[] => placeholderParts(0.6, 0.35, 0.6, C.iron);

const PARTS: Readonly<Record<StructureKind, () => Part[]>> = {
  campfire: campfireParts,
  lean_to: leanToParts,
  workbench: workbenchParts,
  storage_chest: chestParts,
  wooden_hut: hutParts,
  foundation: foundationParts,
  wall: wallParts,
  doorway: doorwayParts,
  window_wall: windowWallParts,
  door: () => doorParts(false),
  roof: roofParts,
  // ── 11.1 (A) ──
  stairs: stairsParts,
  entry_step: entryStepParts,
  pillar: pillarParts,
  railing: railingParts,
  half_wall: halfWallParts,
  gable_roof: gableRoofParts,
  gable_wall: gableWallParts,
  // ── 11.2/11.3 (B) ──
  forge: forgeParts,
  stone_oven: stoneOvenParts,
  hand_mill: handMillParts,
  drying_rack: dryingRackParts,
  bedroll: bedrollParts,
  solar_panel: solarPanelParts,
  wood_fence: woodFenceParts,
  stone_fence: stoneFenceParts,
  fence_gate: fenceGateParts,
  // ── 11.4 (C) ──
  farm_plot: farmPlotParts,
  // ── 11.8 (F) ──
  drone: droneParts,
};

/** Yapı türünün gövde geometrisi (alev hariç). */
export function buildStructureGeometry(kind: StructureKind): BufferGeometry {
  const random = createRandom(SEED + (kind === 'campfire' ? 1 : kind === 'lean_to' ? 2 : 10));
  return merge(PARTS[kind](), random);
}

/**
 * Faz 11 (11.1): modüler parçanın varyant geometrisi (`pieceVariantKey`; boş anahtar varsayılan geometridir). Şimdilik
 * yalnızca taban şekil alır (yükseltilmiş, merdiven boşluklu).
 */
export function buildPieceVariantGeometry(kind: StructureKind, variant: string): BufferGeometry {
  if (kind !== 'foundation' || variant === '') return buildStructureGeometry(kind);
  return merge(foundationVariantParts(parseFoundationVariant(variant)), createRandom(SEED + 10));
}

/** Açık kapı kanadı geometrisi (kapalı olanı `buildStructureGeometry('door')`). */
export function buildOpenDoorGeometry(): BufferGeometry {
  return merge(doorParts(true), createRandom(SEED + 11));
}

/** Kamp ateşi alevi (yerel uzay; gövdeyle aynı orijin). Köşe rengi var, doku yok. */
export function buildFlameGeometry(): BufferGeometry {
  return merge(flameParts(), createRandom(SEED + 3));
}
