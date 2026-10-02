import { PIECES } from '../config';
import type { StructureKind } from './structures';

/**
 * Yapıların ölçüleri ve katı (çarpışan) kutuları (Faz 9; saf, Three.js/Rapier'siz). Görsel geometri
 * (`world/structureGeometry.ts`) ve fizik collider'ları (`world/StructureColliders.ts`) aynı ölçüleri buradan okur.
 * Yerel uzay: zemin y = 0, açık yüz / kapı +Z. Duvarlar ve kutular yamaçta havada kalmasın diye zeminin altına iner.
 */

/** Ahşap kulübe: iç yarı genişlik, duvar kalınlığı/yüksekliği, kapı genişliği, çatı (oyun m). */
export const HUT = {
  /** Duvarların iç yüzüne yarı genişlik (kare plan). */
  inner: 1.85,
  wallThickness: 0.2,
  wallHeight: 2.2,
  /** Duvarların zemine gömülü kısmı (yamaç için). */
  skirt: 1,
  doorWidth: 1.2,
  doorHeight: 1.95,
  ridgeHeight: 3.15,
  roofOverhang: 0.3,
} as const;

/** Sandık: genişlik (X), derinlik (Z), yükseklik. */
export const CHEST = { width: 0.9, depth: 0.55, height: 0.55 } as const;

/** Çalışma tezgâhı: tabla genişliği (X), derinliği (Z), yüksekliği. */
export const WORKBENCH = { width: 1.4, depth: 0.7, height: 0.85 } as const;

/**
 * Modüler parça ölçüleri (yerel uzay; `PIECES`'ten türer): plaka hücre merkezinde `y ∈ [0, slab]`, duvar kenarın
 * ortasında X boyunca uzanır, plakanın üstünden başlar. Görsel geometri ve collider'lar buradan okur.
 */
export const PIECE_SHAPE = {
  half: PIECES.cell / 2,
  slab: PIECES.slab,
  wallBottom: PIECES.slab,
  wallTop: PIECES.slab + PIECES.wallHeight,
  thickness: PIECES.wallThickness,
  doorHalf: PIECES.doorway.width / 2,
  doorTop: PIECES.slab + PIECES.doorway.height,
  windowHalf: PIECES.window.width / 2,
  windowBottom: PIECES.slab + PIECES.window.sill,
  windowTop: PIECES.slab + PIECES.window.sill + PIECES.window.height,
  doorLeafThickness: PIECES.doorThickness,
} as const;

/** Eksen hizalı yerel kutu: merkez ve yarı uzunluklar (oyun m). */
export interface LocalBox {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
}

function box(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): LocalBox {
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    cz: (minZ + maxZ) / 2,
    hx: (maxX - minX) / 2,
    hy: (maxY - minY) / 2,
    hz: (maxZ - minZ) / 2,
  };
}

/** Kulübenin dört duvarı (önde kapı boşluğuyla iki parça): beş kutu. */
function hutWalls(): LocalBox[] {
  const { inner, wallThickness: t, wallHeight, skirt, doorWidth } = HUT;
  const outer = inner + t;
  const bottom = -skirt;
  const door = doorWidth / 2;
  return [
    box(-outer, outer, bottom, wallHeight, -outer, -inner), // arka
    box(-outer, -inner, bottom, wallHeight, -outer, outer), // sol
    box(inner, outer, bottom, wallHeight, -outer, outer), // sağ
    box(-outer, -door, bottom, wallHeight, inner, outer), // ön sol
    box(door, outer, bottom, wallHeight, inner, outer), // ön sağ
  ];
}

/** Modüler parçanın katı kutuları (yerel uzay). `open`: kapı kanadı açık mı? */
function pieceBoxes(kind: StructureKind, open: boolean): LocalBox[] {
  const P = PIECE_SHAPE;
  const t = P.thickness / 2;
  switch (kind) {
    case 'foundation':
      return [box(-P.half, P.half, -0.5, P.slab, -P.half, P.half)];
    case 'roof':
      return [box(-P.half, P.half, 0, P.slab, -P.half, P.half)];
    case 'wall':
      return [box(-P.half, P.half, P.wallBottom, P.wallTop, -t, t)];
    case 'doorway':
      return [
        box(-P.half, -P.doorHalf, P.wallBottom, P.wallTop, -t, t),
        box(P.doorHalf, P.half, P.wallBottom, P.wallTop, -t, t),
        box(-P.doorHalf, P.doorHalf, P.doorTop, P.wallTop, -t, t),
      ];
    case 'window_wall':
      return [
        box(-P.half, -P.windowHalf, P.wallBottom, P.wallTop, -t, t),
        box(P.windowHalf, P.half, P.wallBottom, P.wallTop, -t, t),
        box(-P.windowHalf, P.windowHalf, P.wallBottom, P.windowBottom, -t, t),
        box(-P.windowHalf, P.windowHalf, P.windowTop, P.wallTop, -t, t),
      ];
    case 'door': {
      const leaf = P.doorLeafThickness / 2;
      // Açıkken kanat menteşe yanında (x = −doorHalf) öne (+Z) doğru uzanır; kapalıyken boşluğu kapatır.
      return open
        ? [box(-P.doorHalf - leaf, -P.doorHalf + leaf, P.wallBottom, P.doorTop, 0, 2 * P.doorHalf)]
        : [box(-P.doorHalf, P.doorHalf, P.wallBottom, P.doorTop, -leaf, leaf)];
    }
    default:
      return [];
  }
}

/**
 * Yapının katı kutuları (yerel uzay). Kamp ateşi ve sundurma katı değildir (içinden geçilir; eski davranış);
 * sandık ve tezgâh tek kutu, kulübe kapılı dört duvardır (içine kapıdan girilir).
 */
export function solidBoxes(kind: StructureKind, open = false): LocalBox[] {
  switch (kind) {
    case 'storage_chest':
      return [
        box(
          -CHEST.width / 2,
          CHEST.width / 2,
          -0.3,
          CHEST.height,
          -CHEST.depth / 2,
          CHEST.depth / 2,
        ),
      ];
    case 'workbench':
      return [
        box(
          -WORKBENCH.width / 2,
          WORKBENCH.width / 2,
          -0.3,
          WORKBENCH.height,
          -WORKBENCH.depth / 2,
          WORKBENCH.depth / 2,
        ),
      ];
    case 'wooden_hut':
      return hutWalls();
    case 'campfire':
    case 'lean_to':
      return [];
    case 'foundation':
    case 'wall':
    case 'doorway':
    case 'window_wall':
    case 'door':
    case 'roof':
      return pieceBoxes(kind, open);
    // ── 11.1 (A) ── yer tutucu: katı değil (A merdiven rampası, direk, korkuluk… kutularını yazar).
    case 'stairs':
    case 'entry_step':
    case 'pillar':
    case 'railing':
    case 'half_wall':
    case 'gable_roof':
    case 'gable_wall':
      return [];
    // ── 11.2/11.3 (B) ── yer tutucu: katı değil (B istasyon, çit ve çit kapısı kutularını yazar).
    case 'forge':
    case 'stone_oven':
    case 'hand_mill':
    case 'drying_rack':
    case 'bedroll':
    case 'solar_panel':
    case 'wood_fence':
    case 'stone_fence':
    case 'fence_gate':
      return [];
    // Tarla (C) ve yere inmiş drone (F) içinden geçilir.
    case 'farm_plot':
    case 'drone':
      return [];
  }
}

/** Yerel (x, z) noktasını yapının dünya konumuna çevirir (`rotation.y = yaw`, Three.js sözleşmesi). */
export function localToWorld(
  structure: { x: number; z: number; yaw: number },
  localX: number,
  localZ: number,
): { x: number; z: number } {
  const cos = Math.cos(structure.yaw);
  const sin = Math.sin(structure.yaw);
  return {
    x: structure.x + localX * cos + localZ * sin,
    z: structure.z - localX * sin + localZ * cos,
  };
}
