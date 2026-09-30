import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Matrix4,
  Vector3,
} from 'three';
import { STRUCTURE_LOOK } from '../config';
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
    color: C.ash,
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

/** Yapı türünün gövde geometrisi (alev hariç). */
export function buildStructureGeometry(kind: StructureKind): BufferGeometry {
  const random = createRandom(SEED + (kind === 'campfire' ? 1 : 2));
  return merge(kind === 'campfire' ? campfireParts() : leanToParts(), random);
}

/** Kamp ateşi alevi (yerel uzay; gövdeyle aynı orijin). Köşe rengi var, doku yok. */
export function buildFlameGeometry(): BufferGeometry {
  return merge(flameParts(), createRandom(SEED + 3));
}
