import { BoxGeometry, type BufferGeometry } from 'three';
import type { CreatureKind } from '../creatures/kinds';

/**
 * Canlı modelleri: gerçek boyutta (oyun m = gerçek m), düşük poligonlu kutu parçalardan kurulu dörtayaklılar
 * (doku yok; renk örnek rengidir). Model yerel uzayda kuruludur: zemin y = 0, gövde merkezi x = z = 0, **ön
 * −Z** (yaw 0 = −Z ile aynı). Bir parça dinlenme pozundaki merkezi/boyutuyla tanımlanır; hareketli parçalar
 * (bacak, baş, kuyruk) kendi eksenleri (`pivot`) etrafında `creaturePose.ts`'te döndürülür. Yalnızca `box` ve
 * `taper` (alta doğru daralan) iki şekil vardır: çizim iki `InstancedMesh`'tir.
 */
export const CREATURE_SHAPES = ['box', 'taper'] as const;
export type PartShape = (typeof CREATURE_SHAPES)[number];
export type PartMotion = 'none' | 'head' | 'leg' | 'tail';

export interface PartSpec {
  shape: PartShape;
  /** Genişlik (x), yükseklik (y), uzunluk (z) — oyun m. */
  size: readonly [number, number, number];
  /** Dinlenme pozunda merkez. */
  center: readonly [number, number, number];
  /** Statik dönüş (Euler XYZ, radyan): merkez etrafında. */
  rot?: readonly [number, number, number];
  motion: PartMotion;
  /** Hareketin döndüğü nokta (bacakta kalça, başta boyun, kuyrukta kök). */
  pivot?: readonly [number, number, number];
  /** Bacak faz kayması (çapraz bacaklar aynı fazda yürür). */
  phase?: number;
  /** `shade`: tür renginin çarpanı; `rgb`: sabit renk (leke, diş). */
  color: { shade: number } | { rgb: number };
}

export interface ModelSpec {
  parts: ReadonlyArray<PartSpec>;
  /** Bir adım döngüsünün yer değiştirmesi (oyun m): animasyon fazı `hız·dt / strideLength` ilerler. */
  strideLength: number;
  /** Gövde merkezinin yüksekliği: leş yatışının ekseni. */
  bodyCenterY: number;
  /** Yanlara en çok taşan uzaklık: yan yatınca zeminde kalması için. */
  halfWidth: number;
}

interface Quadruped {
  bodyL: number;
  bodyW: number;
  bodyH: number;
  legL: number;
  legW: number;
  neckL: number;
  headL: number;
  headW: number;
  headH: number;
  snoutL: number;
  tailL: number;
  earSize: number;
}

/** Dörtayaklı iskelet: gövde, boyun, baş, burun, kulaklar, kuyruk, dört bacak (+ türe özgü ekler). */
interface Anchors {
  bodyY: number;
  /** Gövde üst yüzü. */
  top: number;
  /** Baş grubunun dönme noktası. */
  pivot: readonly [number, number, number];
  /** Burun ucunun z'si (öne doğru eksi). */
  snoutFrontZ: number;
}

function quadruped(q: Quadruped, extras: (a: Anchors) => PartSpec[] = () => []): ModelSpec {
  const bodyY = q.legL + q.bodyH / 2 - 0.03; // bacaklar gövdeye biraz girer
  const top = bodyY + q.bodyH / 2;
  const front = -q.bodyL / 2;
  const parts: PartSpec[] = [];

  parts.push({
    shape: 'box',
    size: [q.bodyW, q.bodyH, q.bodyL],
    center: [0, bodyY, 0],
    motion: 'none',
    color: { shade: 1 },
  });

  // Bacaklar: çapraz çiftler (ön sol + arka sağ, ön sağ + arka sol) aynı fazda.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (q.bodyW / 2 - q.legW * 0.55);
      const z = sz * (q.bodyL / 2 - q.legW * 0.8);
      parts.push({
        shape: 'taper',
        size: [q.legW, q.legL, q.legW],
        center: [x, q.legL / 2, z],
        motion: 'leg',
        pivot: [x, q.legL, z],
        phase: sx * sz > 0 ? 0 : Math.PI,
        color: { shade: 0.72 },
      });
    }
  }

  // Boyun (yukarı eğik) ve baş grubu: baş, burun, kulaklar boyun ucundaki eksende döner.
  const neckFrontZ = front - q.neckL * 0.6;
  parts.push({
    shape: 'box',
    size: [q.headW * 0.85, q.headH * 1.05, q.neckL],
    center: [0, top - q.headH * 0.05, front - q.neckL * 0.15],
    rot: [0.5, 0, 0],
    motion: 'none',
    color: { shade: 1 },
  });
  const pivot: [number, number, number] = [0, top + q.headH * 0.25, neckFrontZ];
  const headZ = neckFrontZ - q.headL * 0.4;
  parts.push({
    shape: 'box',
    size: [q.headW, q.headH, q.headL],
    center: [0, pivot[1], headZ],
    motion: 'head',
    pivot,
    color: { shade: 1 },
  });
  parts.push({
    shape: 'box',
    size: [q.headW * 0.6, q.headH * 0.6, q.snoutL],
    center: [0, pivot[1] - q.headH * 0.15, headZ - q.headL / 2 - q.snoutL / 2 + 0.02],
    motion: 'head',
    pivot,
    color: { shade: 0.8 },
  });
  for (const sx of [-1, 1]) {
    parts.push({
      shape: 'taper',
      size: [q.earSize * 0.6, q.earSize, q.earSize * 0.35],
      center: [
        sx * q.headW * 0.35,
        pivot[1] + q.headH / 2 + q.earSize * 0.35,
        headZ + q.headL * 0.25,
      ],
      rot: [Math.PI, 0, sx * 0.25], // dar uç yukarı
      motion: 'head',
      pivot,
      color: { shade: 0.7 },
    });
  }

  parts.push({
    shape: 'taper',
    size: [q.bodyW * 0.3, q.tailL, q.bodyW * 0.3],
    center: [0, bodyY + q.bodyH * 0.15, q.bodyL / 2 + q.tailL * 0.35],
    rot: [0.9, 0, 0],
    motion: 'tail',
    pivot: [0, bodyY + q.bodyH * 0.25, q.bodyL / 2],
    color: { shade: 0.85 },
  });

  const snoutFrontZ = headZ - q.headL / 2 - q.snoutL + 0.02;
  parts.push(...extras({ bodyY, top, pivot, snoutFrontZ }));

  const halfWidth = Math.max(
    ...parts.map(
      (p) => Math.abs(p.center[0]) + (p.rot ? Math.max(p.size[0], p.size[2]) : p.size[0]) / 2,
    ),
  );
  return { parts, strideLength: q.bodyL * 1.6, bodyCenterY: bodyY, halfWidth };
}

export const MODELS: Readonly<Record<CreatureKind, ModelSpec>> = {
  // Karaca: ince uzun bacaklı, küçük başlı; kıç beyaz (ayna).
  roe_deer: quadruped(
    {
      bodyL: 0.85,
      bodyW: 0.3,
      bodyH: 0.32,
      legL: 0.5,
      legW: 0.06,
      neckL: 0.3,
      headL: 0.2,
      headW: 0.11,
      headH: 0.12,
      snoutL: 0.1,
      tailL: 0.08,
      earSize: 0.12,
    },
    ({ bodyY }) => [
      {
        shape: 'box',
        size: [0.26, 0.22, 0.05],
        center: [0, bodyY + 0.02, 0.43],
        motion: 'none',
        color: { rgb: 0xe9e1d3 },
      },
    ],
  ),
  // Yaban domuzu: kısa bacaklı, iri başlı, sırtında koyu yele, yanlarda dişler.
  wild_boar: quadruped(
    {
      bodyL: 1.1,
      bodyW: 0.5,
      bodyH: 0.5,
      legL: 0.35,
      legW: 0.1,
      neckL: 0.15,
      headL: 0.35,
      headW: 0.25,
      headH: 0.25,
      snoutL: 0.2,
      tailL: 0.2,
      earSize: 0.12,
    },
    ({ top, pivot, snoutFrontZ }) => [
      {
        shape: 'box',
        size: [0.12, 0.1, 0.9],
        center: [0, top + 0.03, 0],
        motion: 'none',
        color: { shade: 0.6 },
      },
      ...[-1, 1].map<PartSpec>((sx) => ({
        shape: 'taper',
        size: [0.03, 0.12, 0.03],
        center: [sx * 0.09, pivot[1] - 0.09, snoutFrontZ + 0.1],
        rot: [Math.PI - 0.4, 0, 0],
        motion: 'head',
        pivot,
        color: { rgb: 0xe6dcc4 },
      })),
    ],
  ),
  // Kurt: ince, uzun bacaklı, sarkık kuyruk, açık renkli göğüs.
  wolf: quadruped(
    {
      bodyL: 0.95,
      bodyW: 0.26,
      bodyH: 0.3,
      legL: 0.5,
      legW: 0.07,
      neckL: 0.25,
      headL: 0.22,
      headW: 0.14,
      headH: 0.14,
      snoutL: 0.14,
      tailL: 0.4,
      earSize: 0.1,
    },
    ({ bodyY }) => [
      {
        shape: 'box',
        size: [0.2, 0.16, 0.3],
        center: [0, bodyY - 0.08, -0.3],
        motion: 'none',
        color: { shade: 1.45 },
      },
    ],
  ),
  // Boz ayı: iri, kalın bacaklı, omuzda kambur, kısa kuyruk.
  brown_bear: quadruped(
    {
      bodyL: 1.5,
      bodyW: 0.7,
      bodyH: 0.7,
      legL: 0.5,
      legW: 0.22,
      neckL: 0.25,
      headL: 0.4,
      headW: 0.3,
      headH: 0.3,
      snoutL: 0.18,
      tailL: 0.08,
      earSize: 0.12,
    },
    ({ top }) => [
      {
        shape: 'box',
        size: [0.55, 0.3, 0.5],
        center: [0, top + 0.1, -0.3],
        motion: 'none',
        color: { shade: 1.1 },
      },
    ],
  ),
};

/** En çok parçalı modelin parça sayısı: örnek tamponu kapasitesi için. */
export const MAX_PARTS = Math.max(...Object.values(MODELS).map((m) => m.parts.length));

/** `box` şeklinin birim geometrisi; çağıran `dispose()` eder. */
export function buildBoxGeometry(): BufferGeometry {
  return new BoxGeometry(1, 1, 1);
}

/** `taper`: alt yüz (y = −0,5) üst yüzün %55'i kadar daralan birim kutu; çağıran `dispose()` eder. */
export function buildTaperGeometry(): BufferGeometry {
  const geometry = new BoxGeometry(1, 1, 1);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) < 0) {
      position.setX(i, position.getX(i) * 0.55);
      position.setZ(i, position.getZ(i) * 0.55);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
