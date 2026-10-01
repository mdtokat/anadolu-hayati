import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Matrix4,
  Vector3,
} from 'three';
import { STRUCTURE_LOOK } from '../config';
import { CHEST, HUT, WORKBENCH } from '../placement/structureShapes';
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

const PARTS: Readonly<Record<StructureKind, () => Part[]>> = {
  campfire: campfireParts,
  lean_to: leanToParts,
  workbench: workbenchParts,
  storage_chest: chestParts,
  wooden_hut: hutParts,
};

/** Yapı türünün gövde geometrisi (alev hariç). */
export function buildStructureGeometry(kind: StructureKind): BufferGeometry {
  const random = createRandom(SEED + (kind === 'campfire' ? 1 : kind === 'lean_to' ? 2 : 10));
  return merge(PARTS[kind](), random);
}

/** Kamp ateşi alevi (yerel uzay; gövdeyle aynı orijin). Köşe rengi var, doku yok. */
export function buildFlameGeometry(): BufferGeometry {
  return merge(flameParts(), createRandom(SEED + 3));
}
