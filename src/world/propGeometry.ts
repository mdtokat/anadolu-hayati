import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  OctahedronGeometry,
  Vector3,
} from 'three';
import { SCATTER } from '../config';
import { createRandom, seedFrom, type Random } from '../utils/random';
import { valueNoise2D } from '../utils/noise';
import type { PropKind } from './propKinds';

/**
 * Nesne türleri için düşük poligonlu prosedürel geometri (doku yok; renk vertex renginde, düz gölgeli).
 * Her tür iki kademeli: `near` (yakın, ayrıntılı) ve `far` (uzak, ucuz). Geometri taban ölçeğinde
 * (`SCATTER.kinds[kind].height` oyun m) ve zemin düzleminde (y = 0) kuruludur; örnek matrisi ölçek ve
 * dönüşü uygular. Geometriyi oluşturan çağıran `dispose()` eder.
 */
export type PropLod = 'near' | 'far';

interface Part {
  geometry: BufferGeometry;
  color: number;
}

const COLORS = SCATTER.colors;

function place(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  return geometry.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
}

/** Gövde: üstü `top`, altı `bottom` yarıçaplı silindir; tabanı `y0`'da. */
function trunk(bottom: number, top: number, height: number, segments: number, y0 = 0): Part {
  const geometry = new CylinderGeometry(top, bottom, height, segments, 1, true);
  return { geometry: place(geometry, 0, y0 + height / 2, 0), color: COLORS.trunk };
}

/** Yatay koni (çam katı): tabanı `y0`'da. */
function cone(radius: number, height: number, segments: number, y0: number, color: number): Part {
  const geometry = new ConeGeometry(radius, height, segments, 1, true);
  return { geometry: place(geometry, 0, y0 + height / 2, 0), color };
}

/**
 * Deforme ikosaedron (taç, çalı, kaya): köşeler yönlerine bağlı gürültüyle oynatılır. Aynı konumdaki
 * köşeler aynı yönde olduğundan çatlak oluşmaz. Elipsoit ölçeği (sx, sy, sz) ve merkez (x, y, z) verilir.
 */
function blob(
  radius: number,
  detail: number | 'octa',
  scale: readonly [number, number, number],
  center: readonly [number, number, number],
  color: number,
  roughness: number,
  seed: number,
): Part {
  const geometry =
    detail === 'octa' ? new OctahedronGeometry(radius, 0) : new IcosahedronGeometry(radius, detail);
  const position = geometry.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();
    const noise = valueNoise2D(v.x * 2.1 + v.z * 1.3, v.y * 2.7 - v.z * 0.9, seed);
    v.multiplyScalar(radius * (1 + roughness * noise));
    position.setXYZ(i, v.x * scale[0], v.y * scale[1], v.z * scale[2]);
  }
  position.needsUpdate = true;
  return { geometry: place(geometry, center[0], center[1], center[2]), color };
}

/** Parçaları tek düz gölgeli (non-indexed) geometride birleştirir; yüz başına hafif ton oynaması ekler. */
function merge(parts: Part[], random: Random): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new Color();
  for (const part of parts) {
    const flat = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const position = flat.getAttribute('position');
    color.setHex(part.color);
    for (let i = 0; i < position.count; i += 3) {
      const shade = 1 + (random.next() * 2 - 1) * COLORS.faceShade;
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
  geometry.computeVertexNormals(); // non-indexed: yüz normalleri (düz gölge)
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

type Builder = (height: number, lod: PropLod, seed: number) => Part[];

/**
 * Yapraklı ağaç / kestane: gövde + 3 (yakın: 1 ayrıntılı + 2 kaba) ya da sekizyüzlü tek taç (uzak).
 * Çok sayıda uzak örnek çizildiğinden uzak kademe üçgen bütçesinin belirleyicisidir.
 */
function broadleaf(crown: number): Builder {
  return (h, lod, seed) => {
    if (lod === 'far') {
      return [
        trunk(h * 0.035, h * 0.02, h * 0.45, 3),
        blob(1, 'octa', [h * 0.3, h * 0.38, h * 0.3], [0, h * 0.64, 0], crown, 0.2, seed),
      ];
    }
    return [
      trunk(h * 0.032, h * 0.018, h * 0.5, 7),
      blob(1, 1, [h * 0.3, h * 0.26, h * 0.3], [0, h * 0.6, 0], crown, 0.22, seed),
      blob(
        1,
        0,
        [h * 0.24, h * 0.22, h * 0.24],
        [h * 0.12, h * 0.8, h * 0.05],
        crown,
        0.22,
        seed + 1,
      ),
      blob(
        1,
        0,
        [h * 0.22, h * 0.2, h * 0.22],
        [-h * 0.1, h * 0.84, -h * 0.08],
        crown,
        0.22,
        seed + 2,
      ),
    ];
  };
}

/** İğne yapraklı ağaç: gövde + üst üste koniler (yakın 4, uzak 2). */
const conifer: Builder = (h, lod) => {
  if (lod === 'far') {
    return [
      cone(h * 0.17, h * 0.55, 6, h * 0.12, COLORS.conifer),
      cone(h * 0.11, h * 0.42, 6, h * 0.58, COLORS.conifer),
    ];
  }
  return [
    trunk(h * 0.028, h * 0.016, h * 0.4, 7),
    cone(h * 0.19, h * 0.3, 8, h * 0.2, COLORS.conifer),
    cone(h * 0.15, h * 0.28, 8, h * 0.4, COLORS.conifer),
    cone(h * 0.11, h * 0.26, 8, h * 0.6, COLORS.conifer),
    cone(h * 0.07, h * 0.24, 8, h * 0.76, COLORS.conifer),
  ];
};

function bush(color: number, detail: 0 | 1): Builder {
  return (h, lod, seed) => [
    blob(
      1,
      lod === 'far' ? 0 : detail,
      [h * 0.7, h * 0.5, h * 0.7],
      [0, h * 0.42, 0],
      color,
      0.25,
      seed,
    ),
  ];
}

const berryBush: Builder = (h, lod, seed) => {
  const parts = bush(COLORS.berryLeaf, 1)(h, lod, seed);
  if (lod === 'near') {
    const r = h * 0.07;
    for (const [x, y, z] of [
      [0.45, 0.55, 0.25],
      [-0.4, 0.5, 0.3],
      [0.1, 0.78, -0.35],
      [-0.25, 0.4, -0.5],
    ] as const) {
      parts.push(blob(r, 0, [1, 1, 1], [x * h, y * h, z * h], COLORS.berry, 0.1, seed + 9));
    }
  }
  return parts;
};

const rock = (color: number, detail: 0 | 1): Builder => {
  return (h, lod, seed) => [
    blob(
      1,
      lod === 'far' ? 0 : detail,
      [h * 0.7, h * 0.45, h * 0.6],
      [0, h * 0.35, 0],
      color,
      0.3,
      seed,
    ),
  ];
};

const mushroom: Builder = (h) => [
  trunk(h * 0.1, h * 0.08, h * 0.55, 5),
  blob(1, 0, [h * 0.4, h * 0.22, h * 0.4], [0, h * 0.62, 0], COLORS.mushroomCap, 0.05, 1),
];

/** Yerde dal: X ekseninde yatan ince silindir (uzunluk ≈ 4 × `height`). */
const stick: Builder = (h) => {
  const geometry = new CylinderGeometry(h * 0.08, h * 0.06, h * 4, 5, 1, true);
  geometry.applyMatrix4(new Matrix4().makeRotationZ(Math.PI / 2));
  return [{ geometry: place(geometry, 0, h * 0.08, 0), color: COLORS.stick }];
};

const BUILDERS: Record<PropKind, Builder> = {
  tree_broadleaf: broadleaf(COLORS.broadleaf),
  tree_conifer: conifer,
  bush: bush(COLORS.bush, 1),
  rock: rock(COLORS.rock, 1),
  berry_bush: berryBush,
  hazel: (h, lod, seed) => [
    trunk(h * 0.03, h * 0.02, h * 0.4, 4),
    blob(
      1,
      lod === 'far' ? 0 : 1,
      [h * 0.35, h * 0.32, h * 0.35],
      [0, h * 0.62, 0],
      COLORS.hazel,
      0.25,
      seed,
    ),
  ],
  chestnut: broadleaf(COLORS.chestnut),
  mushroom,
  stick,
  stone: rock(COLORS.stone, 0),
};

/** Türün belirtilen kademesi için birleşik geometri. Çağıran `dispose()` eder. */
export function buildPropGeometry(kind: PropKind, lod: PropLod): BufferGeometry {
  const seed = seedFrom(
    SCATTER.seed,
    0x67656f,
    kind.length,
    kind.charCodeAt(0),
    kind.charCodeAt(kind.length - 1),
  );
  const random = createRandom(seed);
  return merge(BUILDERS[kind](SCATTER.kinds[kind].height, lod, seed), random);
}

/** Üçgen sayısı (non-indexed geometri). */
export function triangleCount(geometry: BufferGeometry): number {
  return geometry.getAttribute('position').count / 3;
}
