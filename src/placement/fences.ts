import { FENCES, SCATTER, VERTICAL_SCALE } from '../config';
import {
  CELL,
  edgeOf,
  edgesOfCell,
  floorTopAt,
  isEdgeKind,
  isPieceKind,
  pieceDistance,
  snapCell,
  type Edge,
  type EdgeAxis,
} from './pieces';
import {
  aimDistanceOf,
  maxReachOf,
  radiusOf,
  type PlaceCheck,
  type PlaceContext,
} from './placeRules';
import { isFenceKind, type Structure, type StructureKind } from './structures';

/**
 * Çitler (Faz 11, 11.3; saf mantık): ahşap çit, kuru taş duvar ve çit kapısı, modüler parçalarla aynı küresel 2 m
 * ızgaranın kenarlarına oturur, ama **iki ucundaki zemine göre eğimlenir**: parçanın merkezi iki ucun ortalama
 * yüksekliğindedir, `rise` uçlar arasındaki yükseklik farkıdır (yerel +Z ucu eksi −Z ucu). Çit yerel Z boyunca uzanır:
 * `yaw = 0` kenar Z boyunca, `yaw = π/2` kenar X boyunca. Eşya sürdükçe art arda kurulur.
 */

export { isFenceKind };

/** Çit yaw'ı: X ekseni boyunca uzanan kenar π/2, Z boyunca uzanan kenar 0 (yerel uzunluk ekseni Z'dir). */
export function fenceYawForAxis(axis: EdgeAxis): number {
  return axis === 'x' ? Math.PI / 2 : 0;
}

/** Çitin uzandığı dünya ekseni (yaw çeyrek tura yuvarlanır). */
export function fenceAxisOf(structure: { yaw: number }): EdgeAxis {
  const quarter = Math.round(structure.yaw / (Math.PI / 2));
  return ((quarter % 2) + 2) % 2 === 1 ? 'x' : 'z';
}

/** Çitin oturduğu ızgara kenarı. */
export function fenceEdge(structure: { x: number; z: number; yaw: number }): Edge {
  return { axis: fenceAxisOf(structure), x: structure.x, z: structure.z };
}

/** Yerel +Z yönünün dünyadaki birim vektörü (`rotation.y = yaw`). */
function localZ(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** Çitin iki ucu: −Z ucu ve +Z ucu (dünya X/Z). */
export function fenceEnds(structure: { x: number; z: number; yaw: number }): {
  a: { x: number; z: number };
  b: { x: number; z: number };
} {
  const d = localZ(structure.yaw);
  const h = FENCES.length / 2;
  return {
    a: { x: structure.x - d.x * h, z: structure.z - d.z * h },
    b: { x: structure.x + d.x * h, z: structure.z + d.z * h },
  };
}

/** Uç yükseklik farkını `FENCES.riseStep` adımına yuvarlar (−0 → 0). */
export function quantizeRise(rise: number): number {
  const q = Math.round(rise / FENCES.riseStep) * FENCES.riseStep;
  return Math.abs(q) < 1e-9 ? 0 : Math.round(q * 1000) / 1000;
}

/** Çitin görsel/collider varyant anahtarı: eğim adımı ve (çit kapısında) açık durumu; düz kapalı çitte boş. */
export function fenceVariantKey(structure: Readonly<Pick<Structure, 'rise' | 'open'>>): string {
  const steps = Math.round((structure.rise ?? 0) / FENCES.riseStep);
  const open = structure.open === true;
  if (steps === 0 && !open) return '';
  return `r${steps}${open ? 'o' : ''}`;
}

/** `fenceVariantKey`'in tersi. */
export function parseFenceVariant(key: string): { rise: number; open: boolean } {
  const match = /^r(-?\d+)(o?)$/.exec(key);
  if (!match) return { rise: 0, open: false };
  return { rise: quantizeRise(Number(match[1]) * FENCES.riseStep), open: match[2] === 'o' };
}

/** Bir noktanın çit doğru parçasına (iki uç arası) yatay uzaklığı. */
export function distanceToFence(
  structure: { x: number; z: number; yaw: number },
  x: number,
  z: number,
): number {
  const d = localZ(structure.yaw);
  const along = (x - structure.x) * d.x + (z - structure.z) * d.z;
  const across = (x - structure.x) * d.z - (z - structure.z) * d.x;
  const overshoot = Math.max(0, Math.abs(along) - FENCES.length / 2);
  return Math.hypot(overshoot, across);
}

/** Bir çit hedefi (hayalet/yeni yapı): konum (orta nokta), zemin yüksekliği, yön ve uç farkı. */
export interface FenceTarget {
  x: number;
  y: number;
  z: number;
  yaw: number;
  rise: number;
}

export interface FencePose {
  x: number;
  z: number;
  yaw: number;
  y?: number;
}

export interface FenceResolution {
  target: FenceTarget;
  check: PlaceCheck;
}

/** Bir kenar için hedefi kurar: uç yüksekliklerinden orta nokta yüksekliği ve eğim. */
function targetOf(edge: Edge, heightAt: (x: number, z: number) => number): FenceTarget {
  const yaw = fenceYawForAxis(edge.axis);
  const ends = fenceEnds({ x: edge.x, z: edge.z, yaw });
  const ha = heightAt(ends.a.x, ends.a.z);
  const hb = heightAt(ends.b.x, ends.b.z);
  return { x: edge.x, y: (ha + hb) / 2, z: edge.z, yaw, rise: quantizeRise(hb - ha) };
}

/** Hedefin (ızgara kenarı) geçerliliği: erişim, oyuncunun üstüne gelme, zemin, su, taban, başka yapılar. */
function checkTarget(
  kind: StructureKind,
  target: FenceTarget,
  player: { x: number; z: number },
  ctx: PlaceContext,
): PlaceCheck {
  const { structures, heightAt } = ctx;
  if (Math.hypot(target.x - player.x, target.z - player.z) > maxReachOf(kind)) {
    return { ok: false, reason: 'too_far' };
  }
  const ends = fenceEnds(target);
  for (const p of [ends.a, ends.b, target]) {
    if (heightAt(p.x, p.z) * VERTICAL_SCALE <= SCATTER.minElevation) {
      return { ok: false, reason: 'in_sea' };
    }
  }
  if (Math.abs(target.rise) > FENCES.maxEndRise + 1e-6) return { ok: false, reason: 'too_steep' };
  if (ctx.nearFreshWater?.(target.x, target.z)) return { ok: false, reason: 'near_water' };
  if (distanceToFence(target, player.x, player.z) < 0.5) return { ok: false, reason: 'too_close' };

  // Taban üstüne çit kurulmaz (plakaya gömülür): kenarın iki yanındaki hücrede taban var mı?
  const edge = fenceEdge(target);
  const across = edge.axis === 'x' ? { x: 0, z: 0.4 } : { x: 0.4, z: 0 };
  if (
    floorTopAt(structures, target.x + across.x, target.z + across.z) !== null ||
    floorTopAt(structures, target.x - across.x, target.z - across.z) !== null
  ) {
    return { ok: false, reason: 'too_close' };
  }

  const searchRadius = FENCES.length + radiusOf('wooden_hut') + 0.5;
  for (const other of structures.near(target.x, target.z, searchRadius)) {
    if (isFenceKind(other.kind)) {
      const same =
        fenceAxisOf(other) === edge.axis &&
        Math.abs(other.x - target.x) < 0.05 &&
        Math.abs(other.z - target.z) < 0.05;
      if (same) return { ok: false, reason: 'occupied' };
      continue;
    }
    if (isPieceKind(other.kind)) {
      // Aynı kenardaki duvar/korkuluk yuvayı doldurur; diğer parçaların ayak izine değmemeli.
      if (isEdgeKind(other.kind)) {
        const e = edgeOf(other);
        if (
          e.axis === edge.axis &&
          Math.abs(e.x - edge.x) < 0.05 &&
          Math.abs(e.z - edge.z) < 0.05
        ) {
          return { ok: false, reason: 'occupied' };
        }
      }
      if (
        other.kind !== 'roof' &&
        other.kind !== 'gable_roof' &&
        pieceDistance(other, target.x, target.z) < 0.3
      ) {
        return { ok: false, reason: 'too_close' };
      }
      continue;
    }
    // Ateş, sandık, tezgâh vb.: çit doğru parçasına yarıçap + pay içinde olmamalı.
    if (distanceToFence(target, other.x, other.z) < radiusOf(other.kind) + 0.15) {
      return { ok: false, reason: 'too_close' };
    }
  }
  return { ok: true, y: target.y, slopeDeg: 0 };
}

/**
 * Bakış noktasına en uygun çit yuvası. Aday kenarlar: nişan noktasının hücresinin dört kenarı. Sıralama: nişan
 * noktasına uzaklık + bakışa paralel uzanan kenara `FENCES.axisBias` payı (çit bakışın önünden geçer). `flip` (`R`)
 * yalnızca bakışa paralel kenarları aday yapar (çit bakış doğrultusunda ilerler). Geçerli aday yoksa en iyi geçersiz
 * yuva ve nedeni döner.
 */
export function resolveFence(
  kind: StructureKind,
  pose: FencePose,
  flip: boolean,
  ctx: PlaceContext,
): FenceResolution {
  const distance = aimDistanceOf(kind);
  const aimX = pose.x - Math.sin(pose.yaw) * distance;
  const aimZ = pose.z - Math.cos(pose.yaw) * distance;
  const forwardX = -Math.sin(pose.yaw);
  const forwardZ = -Math.cos(pose.yaw);
  // Bakışa dik kenar (kuzey/güneye bakarken X boyunca) tercih edilir.
  const perpendicular: EdgeAxis = Math.abs(forwardZ) >= Math.abs(forwardX) ? 'x' : 'z';

  const cx = snapCell(aimX);
  const cz = snapCell(aimZ);
  const scored = edgesOfCell(cx, cz)
    .filter((edge) => !flip || edge.axis !== perpendicular)
    .map((edge) => ({
      edge,
      score:
        Math.hypot(edge.x - aimX, edge.z - aimZ) +
        (edge.axis === perpendicular ? 0 : FENCES.axisBias),
    }))
    .sort((a, b) => a.score - b.score);

  let fallback: FenceResolution | null = null;
  for (const { edge } of scored) {
    const target = targetOf(edge, ctx.heightAt);
    const check = checkTarget(kind, target, pose, ctx);
    if (check.ok) return { target, check };
    fallback ??= { target, check };
  }
  return fallback as FenceResolution;
}

/** Izgara hücre kenarı uzunluğu (testler/geometri için). */
export const FENCE_CELL = CELL;
