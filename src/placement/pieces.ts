import { PIECES, PLACEMENT, PLAYER, SCATTER, VERTICAL_SCALE } from '../config';
import type { PlaceCheck, PlaceContext } from './placeRules';
import type { Structure, StructureKind, StructureSet } from './structures';

/**
 * Modüler yapı parçaları (saf mantık, Three.js'siz): taban, duvar, kapılı/pencereli duvar, kapı, çatı. Parçalar küresel
 * bir ızgaraya (hücre `PIECES.cell`) oturur; böylece ayrı ayrı kurulan parçalar birbirine tam bitişir.
 *
 * - **Plaka** (taban, çatı): hücre merkezinde, `y` = plakanın alt yüzü. Taban zemine (kat 0), çatı bir alt katın duvarlarının
 *   üstüne (ya da komşu çatıya) oturur; çatı plakası bir üst katın zemini de olur.
 * - **Duvar** (duvar, kapılı duvar, pencereli duvar): hücre kenarının ortasında; `y` = oturduğu plakanın `y`'si
 *   (duvar plakanın üstünden başlar). Dünya X boyunca uzanan kenarın yaw'ı 0/π, Z boyunca uzananın π/2 ya da 3π/2'dir
 *   (π'lik fark yalnızca iç/dış yüzü çevirir).
 * - **Kapı**: kapılı duvarın aynı konumuna ve yönüne oturur (yönüne π eklenirse menteşe öbür yana geçer).
 */
export const PIECE_KINDS = [
  'foundation',
  'wall',
  'doorway',
  'window_wall',
  'door',
  'roof',
] as const satisfies readonly StructureKind[];
export type PieceKind = (typeof PIECE_KINDS)[number];

export function isPieceKind(kind: StructureKind): kind is PieceKind {
  return (PIECE_KINDS as readonly StructureKind[]).includes(kind);
}

/** Aynı yuvayı paylaşan parça sınıfı: aynı sınıftan iki parça aynı yuvaya konamaz. */
export type SlotClass = 'floor' | 'wall' | 'door';

export function slotClassOf(kind: PieceKind): SlotClass {
  if (kind === 'foundation' || kind === 'roof') return 'floor';
  return kind === 'door' ? 'door' : 'wall';
}

/** Duvar benzeri (kenara oturan, boşluğu kapatan) parça mı? */
export function isWallKind(kind: StructureKind): boolean {
  return kind === 'wall' || kind === 'doorway' || kind === 'window_wall';
}

export const CELL = PIECES.cell;
const HALF = CELL / 2;
/** Kat yüksekliği: plaka + duvar. */
export const STOREY = PIECES.slab + PIECES.wallHeight;
/** İki parçanın "aynı yükseklikte" sayılma toleransı (kat aralığından çok küçük). */
const SAME_Y = 0.3;
/** Plakanın zemin örnekleme ofseti (köşelerden biraz içeride). */
const SAMPLE = HALF - 0.1;

export type EdgeAxis = 'x' | 'z';

/** Hücre kenarı: merkezi (dünya X/Z) ve uzandığı eksen. */
export interface Edge {
  axis: EdgeAxis;
  x: number;
  z: number;
}

/** Kenarın yaw'ı (`flip`: iç/dış yüzü çevir). */
export function yawForAxis(axis: EdgeAxis, flip: boolean): number {
  return (axis === 'x' ? 0 : Math.PI / 2) + (flip ? Math.PI : 0);
}

/** Yaw'dan kenar ekseni: 0/π → 'x', π/2 ve 3π/2 → 'z'. */
export function axisOfYaw(yaw: number): EdgeAxis {
  const quarter = Math.round(yaw / (Math.PI / 2));
  return ((quarter % 2) + 2) % 2 === 0 ? 'x' : 'z';
}

/** Değeri en yakın hücre merkezine oturtur. */
export function snapCell(value: number): number {
  return Math.round(value / CELL) * CELL;
}

/** Hücrenin dört kenarı. */
export function edgesOfCell(cx: number, cz: number): Edge[] {
  return [
    { axis: 'x', x: cx, z: cz - HALF },
    { axis: 'x', x: cx, z: cz + HALF },
    { axis: 'z', x: cx - HALF, z: cz },
    { axis: 'z', x: cx + HALF, z: cz },
  ];
}

/** Kenarın iki yanındaki hücre merkezleri. */
export function cellsOfEdge(edge: Edge): Array<{ x: number; z: number }> {
  return edge.axis === 'x'
    ? [
        { x: edge.x, z: edge.z - HALF },
        { x: edge.x, z: edge.z + HALF },
      ]
    : [
        { x: edge.x - HALF, z: edge.z },
        { x: edge.x + HALF, z: edge.z },
      ];
}

/** Yapının kenar ekseni merkezi (duvar sınıfı parçalar için). */
export function edgeOf(structure: { x: number; z: number; yaw: number }): Edge {
  return { axis: axisOfYaw(structure.yaw), x: structure.x, z: structure.z };
}

/** Noktanın kenar (doğru parçası) uzaklığı (yatay, oyun m). */
export function distanceToEdge(edge: Edge, x: number, z: number): number {
  const along = edge.axis === 'x' ? x - edge.x : z - edge.z;
  const across = edge.axis === 'x' ? z - edge.z : x - edge.x;
  const overshoot = Math.max(0, Math.abs(along) - HALF);
  return Math.hypot(overshoot, across);
}

function slotKey(cls: SlotClass, x: number, z: number): string {
  return `${cls}|${Math.round(x * 2)}|${Math.round(z * 2)}`;
}

const INDEXES = new WeakMap<StructureSet, PieceIndex>();

/**
 * Parça yuva dizini (yapı kümesinin `version`'ına göre tembel yenilenir). Yuva = sınıf + konum; aynı konumda
 * farklı katlardaki parçalar ayrı tutulur (y farkı ≥ `SAME_Y`).
 */
export class PieceIndex {
  readonly version: number;
  /** Oda/barınak sonuçları için önbellek (bu sürüme özel). */
  readonly cache = new Map<string, unknown>();
  private readonly slots = new Map<string, Array<Readonly<Structure>>>();

  private constructor(structures: StructureSet) {
    this.version = structures.version;
    for (const s of structures.all()) {
      if (!isPieceKind(s.kind)) continue;
      const key = slotKey(slotClassOf(s.kind), s.x, s.z);
      const list = this.slots.get(key);
      if (list) list.push(s);
      else this.slots.set(key, [s]);
    }
  }

  /** Küme için güncel dizin. */
  static of(structures: StructureSet): PieceIndex {
    const cached = INDEXES.get(structures);
    if (cached && cached.version === structures.version) return cached;
    const fresh = new PieceIndex(structures);
    INDEXES.set(structures, fresh);
    return fresh;
  }

  /** Bu yuvadaki bütün parçalar (tüm katlar). */
  all(cls: SlotClass, x: number, z: number): ReadonlyArray<Readonly<Structure>> {
    return this.slots.get(slotKey(cls, x, z)) ?? [];
  }

  /** Bu yuvada (≈ aynı yükseklikte) bir parça var mı? */
  find(cls: SlotClass, x: number, z: number, y: number): Readonly<Structure> | undefined {
    return this.all(cls, x, z).find((s) => Math.abs(s.y - y) < SAME_Y);
  }

  /** Hücredeki plakalar (taban/çatı; tüm katlar). */
  floors(cx: number, cz: number): ReadonlyArray<Readonly<Structure>> {
    return this.all('floor', cx, cz);
  }
}

/** Oyuncunun duruşu: ayak konumu, bakış yönü (yaw; ileri = (−sin, −cos)), isteğe bağlı ayak yüksekliği ve bakış eğimi. */
export interface PiecePose {
  x: number;
  z: number;
  yaw: number;
  y?: number;
  pitch?: number;
}

export interface PieceTarget {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface PieceResolution {
  target: PieceTarget;
  check: PlaceCheck;
}

const fail = (reason: Extract<PlaceCheck, { ok: false }>['reason']): PlaceCheck => ({
  ok: false,
  reason,
});

/** Bakış ışınının yatay `distance` uzaklığındaki yüksekliği (parça katını seçmek için). */
function aimHeight(pose: PiecePose, ground: number, distance: number): number {
  const feetY = pose.y ?? ground;
  const pitch = Math.max(-1.2, Math.min(1.2, pose.pitch ?? 0));
  return feetY + PLAYER.eyeHeight + Math.tan(pitch) * distance;
}

/** Diğer (parça olmayan) yapılara çakışma: yapı dikdörtgen/segment parçanın `margin` yakınında mı? */
function blockedByOther(
  structures: StructureSet,
  searchX: number,
  searchZ: number,
  distanceTo: (x: number, z: number) => number,
): boolean {
  for (const other of structures.near(searchX, searchZ, CELL * 2 + 2)) {
    if (isPieceKind(other.kind)) continue;
    const radius = PLACEMENT.kinds[other.kind].radius;
    if (distanceTo(other.x, other.z) < radius + 0.15) return true;
  }
  return false;
}

/** Noktanın hücre karesi (yarı kenar `HALF`) uzaklığı. */
function distanceToCell(cx: number, cz: number, x: number, z: number): number {
  return Math.hypot(Math.max(0, Math.abs(x - cx) - HALF), Math.max(0, Math.abs(z - cz) - HALF));
}

/**
 * Parça için hedef yuvayı bulur: oyuncunun bakış noktasına en yakın, geçerli yuva (destek, boşluk, zemin); yoksa
 * en yakın yuvayı geçersiz (neden ile) döner. `flip`: duvar/kapı iç-dış yüzünü çevirir.
 */
export function resolvePiece(
  kind: PieceKind,
  pose: PiecePose,
  flip: boolean,
  ctx: PlaceContext,
): PieceResolution {
  const spec = PLACEMENT.kinds[kind];
  const index = PieceIndex.of(ctx.structures);
  const ax = pose.x - Math.sin(pose.yaw) * spec.aimDistance;
  const az = pose.z - Math.cos(pose.yaw) * spec.aimDistance;
  const aimY = aimHeight(pose, ctx.heightAt(pose.x, pose.z), spec.aimDistance);

  const resolution =
    kind === 'foundation'
      ? resolveFoundation(index, ax, az, ctx)
      : kind === 'roof'
        ? resolveRoof(index, ax, az, aimY, ctx)
        : kind === 'door'
          ? resolveDoor(index, flip, ax, az, aimY, ctx)
          : resolveWall(index, flip, ax, az, aimY, pose, ctx);

  if (
    resolution.check.ok &&
    Math.hypot(resolution.target.x - pose.x, resolution.target.z - pose.z) > spec.maxReach
  ) {
    return { target: resolution.target, check: fail('too_far') };
  }
  return resolution;
}

/** Taban: en yakın hücre; zemin uygunluğu ve boşluk. Komşu tabanla aynı yükseklikte kurulur (zemin sürekli olsun). */
function resolveFoundation(
  index: PieceIndex,
  ax: number,
  az: number,
  ctx: PlaceContext,
): PieceResolution {
  const cx = snapCell(ax);
  const cz = snapCell(az);
  const samples = [
    ctx.heightAt(cx, cz),
    ctx.heightAt(cx - SAMPLE, cz - SAMPLE),
    ctx.heightAt(cx + SAMPLE, cz - SAMPLE),
    ctx.heightAt(cx - SAMPLE, cz + SAMPLE),
    ctx.heightAt(cx + SAMPLE, cz + SAMPLE),
  ];
  const highest = Math.max(...samples);
  const lowest = Math.min(...samples);

  let y = highest - PIECES.floorSink;
  for (const edge of edgesOfCell(cx, cz)) {
    const neighbor = cellsOfEdge(edge).find((c) => c.x !== cx || c.z !== cz);
    const base = neighbor
      ? index.floors(neighbor.x, neighbor.z).find((s) => s.kind === 'foundation')
      : undefined;
    if (base) {
      y = base.y;
      break;
    }
  }
  const target: PieceTarget = { x: cx, y, z: cz, yaw: 0 };

  if (index.floors(cx, cz).some((s) => Math.abs(s.y - y) < STOREY / 2)) {
    return { target, check: fail('occupied') };
  }
  if (lowest * VERTICAL_SCALE <= SCATTER.minElevation) return { target, check: fail('in_sea') };
  if (highest > y + PIECES.maxBury || lowest < y - PIECES.maxDrop) {
    return { target, check: fail('too_steep') };
  }
  if (ctx.nearFreshWater?.(cx, cz)) return { target, check: fail('near_water') };
  if (blockedByOther(ctx.structures, cx, cz, (x, z) => distanceToCell(cx, cz, x, z))) {
    return { target, check: fail('too_close') };
  }
  return { target, check: { ok: true, y, slopeDeg: 0 } };
}

interface WallCandidate {
  edge: Edge;
  y: number;
  occupied: boolean;
  score: number;
}

/** Duvar benzeri: bir plakanın kenarına oturur (tabanın ya da üst katın zemini olan çatının). */
function resolveWall(
  index: PieceIndex,
  flip: boolean,
  ax: number,
  az: number,
  aimY: number,
  pose: PiecePose,
  ctx: PlaceContext,
): PieceResolution {
  const cx0 = snapCell(ax);
  const cz0 = snapCell(az);
  const seen = new Set<string>();
  const candidates: WallCandidate[] = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const cx = cx0 + di * CELL;
      const cz = cz0 + dj * CELL;
      for (const floor of index.floors(cx, cz)) {
        for (const edge of edgesOfCell(cx, cz)) {
          const key = `${edge.x}|${edge.z}|${Math.round(floor.y * 4)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const midY = floor.y + PIECES.slab + PIECES.wallHeight / 2;
          const score = (edge.x - ax) ** 2 + (edge.z - az) ** 2 + (0.6 * (aimY - midY)) ** 2;
          candidates.push({
            edge,
            y: floor.y,
            occupied: index.find('wall', edge.x, edge.z, floor.y) !== undefined,
            score,
          });
        }
      }
    }
  }

  const free = candidates.filter((c) => !c.occupied).sort((a, b) => a.score - b.score);
  const best = free[0] ?? candidates.sort((a, b) => a.score - b.score)[0];
  if (!best) return noSupport(ax, az, ctx);

  const target: PieceTarget = {
    x: best.edge.x,
    y: best.y,
    z: best.edge.z,
    yaw: yawForAxis(best.edge.axis, flip),
  };
  if (best.occupied) return { target, check: fail('occupied') };
  if (best.y - ctx.heightAt(best.edge.x, best.edge.z) > PIECES.maxBuildHeight) {
    return { target, check: fail('too_far') };
  }
  const feetY = pose.y ?? best.y;
  if (
    distanceToEdge(best.edge, pose.x, pose.z) < PIECES.playerClearance &&
    feetY > best.y - 0.5 &&
    feetY < best.y + PIECES.wallHeight
  ) {
    return { target, check: fail('too_close') };
  }
  if (
    blockedByOther(ctx.structures, best.edge.x, best.edge.z, (x, z) =>
      distanceToEdge(best.edge, x, z),
    )
  ) {
    return { target, check: fail('too_close') };
  }
  return { target, check: { ok: true, y: best.y, slopeDeg: 0 } };
}

/** Kapı: bakışa en yakın, kapısız kapılı duvarın yerine. */
function resolveDoor(
  index: PieceIndex,
  flip: boolean,
  ax: number,
  az: number,
  aimY: number,
  ctx: PlaceContext,
): PieceResolution {
  let best: { s: Readonly<Structure>; score: number } | null = null;
  for (const s of ctx.structures.near(ax, az, PIECES.searchRadius + CELL)) {
    if (s.kind !== 'doorway') continue;
    if (index.find('door', s.x, s.z, s.y) !== undefined) continue;
    const midY = s.y + PIECES.slab + PIECES.doorway.height / 2;
    const score = (s.x - ax) ** 2 + (s.z - az) ** 2 + (0.6 * (aimY - midY)) ** 2;
    if (!best || score < best.score) best = { s, score };
  }
  if (!best) return noSupport(ax, az, ctx);
  const { s } = best;
  const target: PieceTarget = { x: s.x, y: s.y, z: s.z, yaw: yawForAxis(axisOfYaw(s.yaw), flip) };
  return { target, check: { ok: true, y: s.y, slopeDeg: 0 } };
}

/** Çatı: duvarların üstüne ya da komşu çatıya bitişik hücre. */
function resolveRoof(
  index: PieceIndex,
  ax: number,
  az: number,
  aimY: number,
  ctx: PlaceContext,
): PieceResolution {
  const cx0 = snapCell(ax);
  const cz0 = snapCell(az);
  const seen = new Set<string>();
  const candidates: Array<{ cx: number; cz: number; y: number; occupied: boolean; score: number }> =
    [];
  const add = (cx: number, cz: number, y: number): void => {
    const key = `${cx}|${cz}|${Math.round(y * 4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (y - ctx.heightAt(cx, cz) > PIECES.maxBuildHeight) return;
    const score = (cx - ax) ** 2 + (cz - az) ** 2 + (0.6 * (aimY - (y + PIECES.slab / 2))) ** 2;
    const occupied = index.floors(cx, cz).some((s) => Math.abs(s.y - y) < SAME_Y);
    candidates.push({ cx, cz, y, occupied, score });
  };
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const cx = cx0 + di * CELL;
      const cz = cz0 + dj * CELL;
      for (const edge of edgesOfCell(cx, cz)) {
        for (const wall of index.all('wall', edge.x, edge.z)) add(cx, cz, wall.y + STOREY);
        for (const other of cellsOfEdge(edge)) {
          if (other.x === cx && other.z === cz) continue;
          for (const floor of index.floors(other.x, other.z)) {
            if (floor.kind === 'roof') add(cx, cz, floor.y);
          }
        }
      }
    }
  }
  const free = candidates.filter((c) => !c.occupied).sort((a, b) => a.score - b.score);
  const best = free[0] ?? candidates.sort((a, b) => a.score - b.score)[0];
  if (!best) return noSupport(ax, az, ctx);
  const target: PieceTarget = { x: best.cx, y: best.y, z: best.cz, yaw: 0 };
  if (best.occupied) return { target, check: fail('occupied') };
  if (
    blockedByOther(ctx.structures, best.cx, best.cz, (x, z) =>
      distanceToCell(best.cx, best.cz, x, z),
    )
  ) {
    return { target, check: fail('too_close') };
  }
  return { target, check: { ok: true, y: best.y, slopeDeg: 0 } };
}

/** Destek bulunamadı: hayalet zeminde bakış noktasında kırmızı görünür. */
function noSupport(ax: number, az: number, ctx: PlaceContext): PieceResolution {
  const x = snapCell(ax);
  const z = snapCell(az);
  return { target: { x, y: ctx.heightAt(x, z), z, yaw: 0 }, check: fail('no_support') };
}

/**
 * (x, z) bir tabanın hücresindeyse tabanın üst yüzü (oyun m); değilse null. Küçük yapılar (ateş, tezgâh, sandık)
 * taban üstüne kurulur ve zemine gömülmez.
 */
export function floorTopAt(structures: StructureSet, x: number, z: number): number | null {
  const index = PieceIndex.of(structures);
  let top: number | null = null;
  for (const s of index.floors(snapCell(x), snapCell(z))) {
    if (s.kind !== 'foundation') continue;
    top = Math.max(top ?? -Infinity, s.y + PIECES.slab);
  }
  return top;
}

/** Diğer parçaların (plaka/duvar) bir noktaya yatay uzaklığı: parça olmayan yapıların yerleştirilmesinde engel denetimi. */
export function pieceDistance(piece: Readonly<Structure>, x: number, z: number): number {
  if (piece.kind === 'foundation' || piece.kind === 'roof') {
    return distanceToCell(piece.x, piece.z, x, z);
  }
  return isWallKind(piece.kind) ? distanceToEdge(edgeOf(piece), x, z) : Number.POSITIVE_INFINITY;
}
