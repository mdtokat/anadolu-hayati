import { PIECES, PIECES_II } from '../config';
import { GABLE_RISE, STOREY, parseFoundationVariant, type FoundationVariant } from './pieces';
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
  /**
   * Faz 11 (A): yerel X ekseni etrafında eğim (radyan; yaw'dan önce uygulanır). Yalnızca `pieceColliderBoxes`'in
   * rampa/beşik çatı kutularında bulunur; `solidBoxes` her zaman eksen hizalıdır.
   */
  pitch?: number;
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
    // ── 11.1 (A) ── eksen hizalı kutular (mermi isabeti vb.); yürünen yüzeyler `pieceColliderBoxes`'te eğiktir.
    case 'stairs':
    case 'entry_step':
    case 'pillar':
    case 'railing':
    case 'half_wall':
    case 'gable_roof':
    case 'gable_wall':
      return pieces2Boxes(kind);
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

// ── 11.1 (A) ──

/**
 * Modüler inşa II parça ölçüleri (yerel uzay; `PIECES_II`'den türer). Merdiven yerel −Z yönüne çıkar (alt uç
 * z = +cell, üst uç z = −cell); giriş basamağı tabanın kenarından (z = 0) dışarı (+Z) iner; korkuluk ve yarım duvar
 * duvar gibi kenar boyunca (X) uzanır; beşik çatının mahyası X boyuncadır, yüzleri ±Z'ye iner; alın duvarı X boyunca
 * üçgendir. Hepsinde y = 0 oturduğu plakanın alt yüzü (beşik çatı ve alın duvarında duvar üstü).
 */
export const PIECE2_SHAPE = {
  stairHalf: PIECES_II.stairs.halfWidth,
  stairRun: PIECES.cell * PIECES_II.stairs.cells,
  stairRise: STOREY,
  stepHalf: PIECES_II.entryStep.halfWidth,
  stepDepth: PIECES_II.entryStep.depth,
  stepRise: PIECES_II.entryStep.maxRise,
  pillarHalf: PIECES_II.pillar.size / 2,
  pillarTop: STOREY,
  railTop: PIECES.slab + PIECES_II.railing.height,
  railHalf: PIECES_II.railing.thickness / 2,
  railSolidHalf: PIECES_II.railing.solidThickness / 2,
  halfWallTop: PIECES.slab + PIECES_II.halfWall.height,
  gableRise: GABLE_RISE,
  gablePitch: (PIECES_II.gableRoof.pitchDeg * Math.PI) / 180,
  gableEave: PIECES.cell + PIECES_II.gableRoof.overhang,
  gableThickness: PIECES_II.gableRoof.thickness,
  rim: PIECES_II.stairwell.rim,
} as const;

/** Merdiven, giriş basamağı, direk, korkuluk, yarım duvar, beşik çatı, alın duvarının eksen hizalı kutuları. */
function pieces2Boxes(kind: StructureKind): LocalBox[] {
  const P = PIECE_SHAPE;
  const Q = PIECE2_SHAPE;
  switch (kind) {
    case 'stairs': {
      // Eğimin altında kalan basamaklı dolgu (yüzeyi aşmaz): dört dilimden alçak ucu sıfır olan atlanır.
      const out: LocalBox[] = [];
      const slices = 4;
      const length = Q.stairRun / slices;
      for (let k = 1; k < slices; k++) {
        const z1 = Q.stairRun / 2 - k * length;
        out.push(
          box(
            -Q.stairHalf,
            Q.stairHalf,
            P.slab,
            P.slab + (Q.stairRise * k) / slices,
            z1 - length,
            z1,
          ),
        );
      }
      return out;
    }
    case 'entry_step': {
      const steps = PIECES_II.entryStep.steps;
      const run = Q.stepDepth / steps;
      const rise = Q.stepRise / steps;
      const bottom = P.slab - Q.stepRise - 0.4;
      const out: LocalBox[] = [];
      for (let k = 0; k < steps; k++) {
        out.push(
          box(-Q.stepHalf, Q.stepHalf, bottom, P.slab - (k + 0.5) * rise, k * run, (k + 1) * run),
        );
      }
      return out;
    }
    case 'pillar':
      return [box(-Q.pillarHalf, Q.pillarHalf, P.slab, Q.pillarTop, -Q.pillarHalf, Q.pillarHalf)];
    case 'railing':
      return [box(-P.half, P.half, P.slab, Q.railTop, -Q.railSolidHalf, Q.railSolidHalf)];
    case 'half_wall': {
      const t = P.thickness / 2;
      return [box(-P.half, P.half, P.wallBottom, Q.halfWallTop, -t, t)];
    }
    case 'gable_roof':
      // Kaba: mahya altında yarım yükseklikte orta kutu ve saçağa kadar ince taban (mermi için).
      return [
        box(-P.half, P.half, 0, Q.gableRise / 2, -P.half, P.half),
        box(-P.half, P.half, 0, 0.1, -PIECES.cell, PIECES.cell),
      ];
    case 'gable_wall':
      return gableWallBands();
    default:
      return [];
  }
}

/** Alın duvarı üçgeni: üç yatay bant (her bandın genişliği orta yüksekliğindeki üçgen genişliği). */
function gableWallBands(): LocalBox[] {
  const t = PIECE_SHAPE.thickness / 2;
  const bands = 3;
  const out: LocalBox[] = [];
  for (let i = 0; i < bands; i++) {
    const half = PIECES.cell * (1 - (i + 0.5) / bands);
    const y0 = (GABLE_RISE * i) / bands;
    out.push(box(-half, half, y0, y0 + GABLE_RISE / bands, -t, t));
  }
  return out;
}

/**
 * Üst yüzü (a → b) doğru parçası olan eğik ince kutu (yerel YZ düzleminde; X'te yarı genişlik `hx`). Kalınlık yüzeyin
 * altına doğrudur; `pitch` yerel X etrafında.
 */
function slopeBox(
  hx: number,
  a: { y: number; z: number },
  b: { y: number; z: number },
  thickness: number,
): LocalBox {
  const dz = b.z - a.z;
  const dy = b.y - a.y;
  const length = Math.hypot(dz, dy);
  // Kutunun yerel +Z'si (a → b) yönüne: Rx(θ)(0, 0, 1) = (0, −sin θ, cos θ).
  const pitch = Math.atan2(-dy, dz);
  // Yukarı normal: Rx(θ)(0, 1, 0) = (0, cos θ, sin θ); ters yöndeyse çevir.
  let ny = Math.cos(pitch);
  let nz = Math.sin(pitch);
  if (ny < 0) {
    ny = -ny;
    nz = -nz;
  }
  return {
    cx: 0,
    cy: (a.y + b.y) / 2 - (ny * thickness) / 2,
    cz: (a.z + b.z) / 2 - (nz * thickness) / 2,
    hx,
    hy: thickness / 2,
    hz: length / 2,
    pitch,
  };
}

/** Merdivenin rampası: alt uçta plaka üstü, üst uçta bir kat yukarısı (basamak burunlarından geçer). */
function stairRamp(): LocalBox {
  const Q = PIECE2_SHAPE;
  const slab = PIECE_SHAPE.slab;
  return slopeBox(
    Q.stairHalf,
    { y: slab, z: Q.stairRun / 2 },
    { y: slab + Q.stairRise, z: -Q.stairRun / 2 },
    0.2,
  );
}

/** Giriş basamağının rampası: tabanın üst yüzünden dışarı iner; basamak ortalarından geçer, zemine doğru uzar. */
function entryRamp(): LocalBox {
  const Q = PIECE2_SHAPE;
  const slab = PIECE_SHAPE.slab;
  const extra = 0.3;
  const slope = Q.stepRise / Q.stepDepth;
  return slopeBox(
    Q.stepHalf,
    { y: slab, z: 0 },
    { y: slab - slope * (Q.stepDepth + extra), z: Q.stepDepth + extra },
    0.25,
  );
}

/** Beşik çatının iki eğik yüzü (üst yüzleri çatı yüzeyidir). */
function gableSlopes(): LocalBox[] {
  const Q = PIECE2_SHAPE;
  const drop = Q.gableEave * Math.tan(Q.gablePitch);
  const ridge = { y: Q.gableRise, z: 0 };
  return [1, -1].map((side) =>
    slopeBox(
      PIECE_SHAPE.half,
      ridge,
      { y: Q.gableRise - drop, z: side * Q.gableEave },
      Q.gableThickness,
    ),
  );
}

/**
 * Merdiven boşluklu tabanın kenar şeritleri (yatay dikdörtgenler): `open` maskesindeki kenarda şerit yoktur. Kuzey/güney
 * şeritleri tam boy; batı/doğu şeritleri, kuzey/güney şeridi olan uçlarda onlara kadar.
 */
export function wellRims(
  open: number,
): Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
  const h = PIECE_SHAPE.half;
  const r = PIECE2_SHAPE.rim;
  const north = !(open & 1);
  const south = !(open & 2);
  const z0 = north ? -h + r : -h;
  const z1 = south ? h - r : h;
  const rims: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  if (north) rims.push({ minX: -h, maxX: h, minZ: -h, maxZ: -h + r });
  if (south) rims.push({ minX: -h, maxX: h, minZ: h - r, maxZ: h });
  if (!(open & 4)) rims.push({ minX: -h, maxX: -h + r, minZ: z0, maxZ: z1 });
  if (!(open & 8)) rims.push({ minX: h - r, maxX: h, minZ: z0, maxZ: z1 });
  return rims;
}

/** Tabanın varyant kutuları: yükseltilmiş (etek yok) ya da merdiven boşluklu (kenar şeridi + korkuluklar). */
function foundationVariantBoxes(v: FoundationVariant): LocalBox[] {
  const P = PIECE_SHAPE;
  const Q = PIECE2_SHAPE;
  const h = P.half;
  if (!v.well) {
    return v.raised ? [box(-h, h, 0, P.slab, -h, h)] : solidBoxes('foundation');
  }
  const out = wellRims(v.open).map((b) => box(b.minX, b.maxX, 0, P.slab, b.minZ, b.maxZ));
  const t = Q.railSolidHalf;
  // Korkuluk bitleri `edgesOfCell` sırasıyla: kuzey, güney, batı, doğu.
  if (v.rails & 1) out.push(box(-h, h, P.slab, Q.railTop, -h - t, -h + t));
  if (v.rails & 2) out.push(box(-h, h, P.slab, Q.railTop, h - t, h + t));
  if (v.rails & 4) out.push(box(-h - t, -h + t, P.slab, Q.railTop, -h, h));
  if (v.rails & 8) out.push(box(h - t, h + t, P.slab, Q.railTop, -h, h));
  return out;
}

/**
 * Fizik collider'ı kutuları (yerel uzay): `solidBoxes` gibi, ama yürünen yüzeyler eğiktir (merdiven ve giriş basamağı
 * rampası, beşik çatı yüzleri) ve taban varyantına (`pieceVariantKey`) göre şekil alır.
 */
export function pieceColliderBoxes(kind: StructureKind, variant: string, open = false): LocalBox[] {
  switch (kind) {
    case 'foundation':
      return variant ? foundationVariantBoxes(parseFoundationVariant(variant)) : solidBoxes(kind);
    case 'stairs':
      return [stairRamp()];
    case 'entry_step':
      return [entryRamp()];
    case 'gable_roof':
      return gableSlopes();
    default:
      return solidBoxes(kind, open);
  }
}
