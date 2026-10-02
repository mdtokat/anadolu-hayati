import { PIECES, PIECES_II, PLACEMENT, PLAYER, SCATTER, VERTICAL_SCALE } from '../config';
import type { PlaceCheck, PlaceContext, PlaceFailure } from './placeRules';
import type { Structure, StructureKind, StructureSet } from './structures';

/**
 * Modüler yapı parçaları (saf mantık, Three.js'siz): taban, duvar, kapılı/pencereli duvar, kapı, çatı; Faz 11 (11.1):
 * merdiven, giriş basamağı, direk, korkuluk, yarım duvar, beşik çatı, alın duvarı. Parçalar küresel bir ızgaraya
 * (hücre `PIECES.cell`) oturur; böylece ayrı ayrı kurulan parçalar birbirine tam bitişir.
 *
 * - **Plaka** (taban, çatı): hücre merkezinde, `y` = plakanın alt yüzü. Taban zemine (kat 0) ya da bir alt katın
 *   duvarlarının/direklerinin üstüne (üst kat tabanı, `y` = duvar.y + `STOREY`) oturur; desteklenen üst tabana bitişik
 *   `PIECES_II.upperFloor.overhangCells` hücre çıkıntı (balkon) serbesttir. Çatı bir alt katın duvarlarının üstüne
 *   (ya da komşu çatıya) oturur ve **en üst parçadır**: üstüne hiçbir parça kurulamaz (eski kayıtlardaki çatı üstü
 *   duvarlar olduğu gibi yüklenir).
 * - **Kenar parçası** (duvar, kapılı/pencereli duvar, korkuluk, yarım duvar): hücre kenarının ortasında; `y` = oturduğu
 *   tabanın `y`'si. Dünya X boyunca uzanan kenarın yaw'ı 0/π, Z boyunca uzananın π/2 ya da 3π/2'dir (π'lik fark yalnızca
 *   iç/dış yüzü çevirir). Yalnızca **taban** plakalarına kurulur.
 * - **Kapı**: kapılı duvarın aynı konumuna ve yönüne oturur (yönüne π eklenirse menteşe öbür yana geçer).
 * - **Merdiven**: iki tabanlı hücre (1 × 2) üstünde, yaw'ın ileri yönüne (−sin, −cos) bir kat çıkar; konumu iki hücrenin
 *   ortak kenarıdır. Üstündeki taban **merdiven boşluklu** varyanta döner (`pieceVariantKey`).
 * - **Giriş basamağı**: bir tabanın kenarına dışarıdan; konumu kenarın ortası, yerel +Z dışarı bakar.
 * - **Direk**: bir tabanın hücre köşesinde; üst kat tabanını ve çatıyı taşır.
 * - **Beşik çatı**: mahya boyunca 1, mahyaya dik 2 hücre; konumu iki hücrenin ortak kenarı (yaw'ın ekseni = mahya).
 *   **Alın duvarı** sıranın ucunda, hücre köşesinde, üçgen.
 */
export const PIECE_KINDS = [
  'foundation',
  'wall',
  'doorway',
  'window_wall',
  'door',
  'roof',
  // ── Faz 11: A (11.1) ──
  'stairs',
  'entry_step',
  'pillar',
  'railing',
  'half_wall',
  'gable_roof',
  'gable_wall',
] as const satisfies readonly StructureKind[];
export type PieceKind = (typeof PIECE_KINDS)[number];

export function isPieceKind(kind: StructureKind): kind is PieceKind {
  return (PIECE_KINDS as readonly StructureKind[]).includes(kind);
}

/**
 * Aynı yuvayı paylaşan parça sınıfı: aynı sınıftan iki parça aynı yuvaya (aynı katta) konamaz. Merdiven ve beşik çatı
 * iki hücrelik yuvaya birden yazılır (`slotsOf`).
 */
export type SlotClass = 'floor' | 'wall' | 'door' | 'stair' | 'post' | 'step' | 'gable_end';

export function slotClassOf(kind: PieceKind): SlotClass {
  switch (kind) {
    case 'foundation':
    case 'roof':
    case 'gable_roof':
      return 'floor';
    case 'door':
      return 'door';
    case 'stairs':
      return 'stair';
    case 'pillar':
      return 'post';
    case 'entry_step':
      return 'step';
    case 'gable_wall':
      return 'gable_end';
    default:
      return 'wall';
  }
}

/** Tam boy duvar (kenarı kapatır, üst katı/çatıyı taşır): duvar, kapılı duvar, pencereli duvar. */
export function isWallKind(kind: StructureKind): boolean {
  return kind === 'wall' || kind === 'doorway' || kind === 'window_wall';
}

/** Kenar yuvasına oturan parça (tam boy duvarlar + korkuluk + yarım duvar). */
export function isEdgeKind(kind: StructureKind): boolean {
  return isWallKind(kind) || kind === 'railing' || kind === 'half_wall';
}

/** Çatı türü (en üst parça): düz çatı ve beşik çatı. */
export function isRoofKind(kind: StructureKind): boolean {
  return kind === 'roof' || kind === 'gable_roof';
}

/** Üstünde durulan / altında kalınan geniş parça (odakta duvarlara yenilir, sökme ipucu göstermez). */
export function isPlateKind(kind: StructureKind): boolean {
  return kind === 'foundation' || isRoofKind(kind);
}

/**
 * `R` tuşunun parçadaki etkisi: `none` (taban, düz çatı, direk, giriş basamağı, alın duvarı: yönü yuvadan gelir),
 * `face` (duvar sınıfı, kapı: iç-dış yüz), `direction` (merdiven: çıkış yönünü tersine), `ridge` (beşik çatı: mahya ekseni).
 */
export type PieceRotation = 'none' | 'face' | 'direction' | 'ridge';

export function pieceRotation(kind: PieceKind): PieceRotation {
  switch (kind) {
    case 'foundation':
    case 'roof':
    case 'pillar':
    case 'entry_step':
    case 'gable_wall':
      return 'none';
    case 'stairs':
      return 'direction';
    case 'gable_roof':
      return 'ridge';
    default:
      return 'face';
  }
}

export const CELL = PIECES.cell;
const HALF = CELL / 2;
/** Kat yüksekliği: plaka + duvar. */
export const STOREY = PIECES.slab + PIECES.wallHeight;
/** İki parçanın "aynı yükseklikte" sayılma toleransı (kat aralığından çok küçük). */
const SAME_Y = 0.3;
/** Plakanın zemin örnekleme ofseti (köşelerden biraz içeride). */
const SAMPLE = HALF - 0.1;
/** Beşik çatının mahya yüksekliği (duvar üstünden). */
export const GABLE_RISE = CELL * Math.tan((PIECES_II.gableRoof.pitchDeg * Math.PI) / 180);

export type EdgeAxis = 'x' | 'z';

/** Hücre kenarı: merkezi (dünya X/Z) ve uzandığı eksen. */
export interface Edge {
  axis: EdgeAxis;
  x: number;
  z: number;
}

interface Point {
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

const otherAxis = (axis: EdgeAxis): EdgeAxis => (axis === 'x' ? 'z' : 'x');

/** Yaw'ı en yakın çeyrek tura oturtur ([0, 2π)). */
export function snapYaw(yaw: number): number {
  const quarter = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
  return quarter * (Math.PI / 2);
}

/** Çeyrek tura oturmuş yaw'ın ileri yönü (−sin, −cos), eksene yuvarlanmış. */
function forwardOf(yaw: number): Point {
  return { x: -Math.round(Math.sin(yaw)), z: -Math.round(Math.cos(yaw)) };
}

/** Değeri en yakın hücre merkezine oturtur. */
export function snapCell(value: number): number {
  return Math.round(value / CELL) * CELL;
}

/** Hücrenin dört kenarı (sıra: kuzey, güney, batı, doğu). */
export function edgesOfCell(cx: number, cz: number): Edge[] {
  return [
    { axis: 'x', x: cx, z: cz - HALF },
    { axis: 'x', x: cx, z: cz + HALF },
    { axis: 'z', x: cx - HALF, z: cz },
    { axis: 'z', x: cx + HALF, z: cz },
  ];
}

/** Hücrenin dört köşesi. */
function cornersOfCell(cx: number, cz: number): Point[] {
  return [
    { x: cx - HALF, z: cz - HALF },
    { x: cx + HALF, z: cz - HALF },
    { x: cx - HALF, z: cz + HALF },
    { x: cx + HALF, z: cz + HALF },
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

/** Hücrenin kenar komşusu (kenarın öbür yanı). */
function neighborAcross(cx: number, cz: number, edge: Edge): Point {
  return cellsOfEdge(edge).find((c) => c.x !== cx || c.z !== cz) as Point;
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

const sameEdge = (a: Edge, b: Edge): boolean =>
  a.axis === b.axis && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01;

/** Merdivenin iki hücresi (alt uç, üst uç), çıkış yönü ve giriş/iç/çıkış kenarları. */
export interface StairLayout {
  low: Point;
  high: Point;
  dir: Point;
  entry: Edge;
  inner: Edge;
  exit: Edge;
}

export function stairLayout(s: { x: number; z: number; yaw: number }): StairLayout {
  const dir = forwardOf(snapYaw(s.yaw));
  const axis: EdgeAxis = dir.x === 0 ? 'x' : 'z';
  const low = { x: s.x - dir.x * HALF, z: s.z - dir.z * HALF };
  const high = { x: s.x + dir.x * HALF, z: s.z + dir.z * HALF };
  return {
    low,
    high,
    dir,
    entry: { axis, x: low.x - dir.x * HALF, z: low.z - dir.z * HALF },
    inner: { axis, x: s.x, z: s.z },
    exit: { axis, x: high.x + dir.x * HALF, z: high.z + dir.z * HALF },
  };
}

/** Giriş basamağının dışarı yönü (yerel +Z) ve oturduğu dış hücre. */
function stepLayout(s: { x: number; z: number; yaw: number }): { out: Point; cell: Point } {
  const yaw = snapYaw(s.yaw);
  const out = { x: Math.round(Math.sin(yaw)), z: Math.round(Math.cos(yaw)) };
  return { out, cell: { x: s.x + out.x * HALF, z: s.z + out.z * HALF } };
}

/** Beşik çatının iki hücresi (mahyaya dik) ve iki ucu (alın duvarı konumları). */
function gableLayout(s: { x: number; z: number; yaw: number }): {
  axis: EdgeAxis;
  cells: Point[];
  ends: Point[];
} {
  const axis = axisOfYaw(s.yaw);
  const along = axis === 'x' ? { x: 1, z: 0 } : { x: 0, z: 1 };
  return {
    axis,
    cells: cellsOfEdge({ axis, x: s.x, z: s.z }),
    ends: [
      { x: s.x - along.x * HALF, z: s.z - along.z * HALF },
      { x: s.x + along.x * HALF, z: s.z + along.z * HALF },
    ],
  };
}

/** Parçanın dizinde yazıldığı yuvalar (çok hücreli parçalar birden çok yuvaya). */
function slotsOf(s: Readonly<Structure>): Array<{ cls: SlotClass; x: number; z: number }> {
  const kind = s.kind as PieceKind;
  if (kind === 'stairs') {
    const { low, high } = stairLayout(s);
    return [
      { cls: 'stair', ...low },
      { cls: 'stair', ...high },
    ];
  }
  if (kind === 'gable_roof') {
    return gableLayout(s).cells.map((c) => ({ cls: 'floor' as const, ...c }));
  }
  if (kind === 'entry_step') return [{ cls: 'step', ...stepLayout(s).cell }];
  return [{ cls: slotClassOf(kind), x: s.x, z: s.z }];
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
  /** Oda/barınak ve varyant sonuçları için önbellek (bu sürüme özel). */
  readonly cache = new Map<string, unknown>();
  private readonly slots = new Map<string, Array<Readonly<Structure>>>();

  private constructor(structures: StructureSet) {
    this.version = structures.version;
    for (const s of structures.all()) {
      if (!isPieceKind(s.kind)) continue;
      for (const slot of slotsOf(s)) {
        const key = slotKey(slot.cls, slot.x, slot.z);
        const list = this.slots.get(key);
        if (list) list.push(s);
        else this.slots.set(key, [s]);
      }
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

  /** Hücredeki plakalar (taban/çatı/beşik çatı; tüm katlar). */
  floors(cx: number, cz: number): ReadonlyArray<Readonly<Structure>> {
    return this.all('floor', cx, cz);
  }

  /** Hücrenin `y` katındaki taban. */
  foundationAt(cx: number, cz: number, y: number): Readonly<Structure> | undefined {
    return this.floors(cx, cz).find((s) => s.kind === 'foundation' && Math.abs(s.y - y) < SAME_Y);
  }

  /** Hücreyi `y` katında kaplayan merdiven (merdiven `y` tabanına oturur). */
  stairsAt(cx: number, cz: number, y: number): Readonly<Structure> | undefined {
    return this.find('stair', cx, cz, y);
  }

  /** Kenarda `y` katındaki kenar parçası (duvar, kapılı/pencereli duvar, korkuluk, yarım duvar). */
  edgePiece(edge: Edge, y: number): Readonly<Structure> | undefined {
    return this.find('wall', edge.x, edge.z, y);
  }

  /** Hücrede `y`'den aşağıda (ya da aynı katta) bir çatı var mı? Çatı en üst parçadır. */
  roofAtOrBelow(cx: number, cz: number, y: number): boolean {
    return this.floors(cx, cz).some((s) => isRoofKind(s.kind) && s.y < y + SAME_Y);
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

const fail = (reason: PlaceFailure): PlaceCheck => ({ ok: false, reason });

/** Aday yuva: hedef, bakışa uzaklık puanı ve (geçersizse) neden. */
interface Candidate {
  target: PieceTarget;
  score: number;
  reason: PlaceFailure | null;
}

/**
 * Aday sırası: önce geçerli, sonra boş ama başka nedenle geçersiz, en son dolu yuvalar; her grupta bakışa en yakını.
 * Böylece dolu bir yuvanın yanında boş yuva varsa engel nedeni (ör. oyuncuya çok yakın) o boş yuvadan gelir.
 */
function choose(candidates: Candidate[]): PieceResolution | null {
  const tier = (c: Candidate): number => (c.reason === null ? 0 : c.reason === 'occupied' ? 2 : 1);
  let pick: Candidate | null = null;
  for (const c of candidates) {
    if (!pick || tier(c) < tier(pick) || (tier(c) === tier(pick) && c.score < pick.score)) pick = c;
  }
  if (!pick) return null;
  return {
    target: pick.target,
    check: pick.reason === null ? { ok: true, y: pick.target.y, slopeDeg: 0 } : fail(pick.reason),
  };
}

/** Bakış ışınının yatay `distance` uzaklığındaki yüksekliği (parça katını seçmek için). */
function aimHeight(pose: PiecePose, ground: number, distance: number): number {
  const feetY = pose.y ?? ground;
  const pitch = Math.max(-1.2, Math.min(1.2, pose.pitch ?? 0));
  return feetY + PLAYER.eyeHeight + Math.tan(pitch) * distance;
}

/** Bakış noktasına uzaklık puanı: yatay uzaklık² + (0,6 · yükseklik farkı)². */
function aimScore(x: number, z: number, y: number, aim: Aim): number {
  return (x - aim.x) ** 2 + (z - aim.z) ** 2 + (0.6 * (aim.y - y)) ** 2;
}

interface Aim {
  x: number;
  y: number;
  z: number;
}

/**
 * Diğer (parça olmayan) yapılara çakışma: aynı kattaki (`levelY` ± yarım kat) yapı, parçanın `distanceTo` ayak izine
 * kendi kaplama yarıçapından yakınsa engeldir.
 */
function blockedByOther(
  structures: StructureSet,
  searchX: number,
  searchZ: number,
  levelY: number,
  distanceTo: (x: number, z: number) => number,
): boolean {
  for (const other of structures.near(searchX, searchZ, CELL * 2 + 2)) {
    if (isPieceKind(other.kind)) continue;
    if (Math.abs(other.y - levelY) > STOREY / 2) continue;
    const radius = PLACEMENT.kinds[other.kind].radius;
    if (distanceTo(other.x, other.z) < radius + 0.15) return true;
  }
  return false;
}

/** Noktanın hücre karesi (yarı kenar `HALF`) uzaklığı. */
function distanceToCell(cx: number, cz: number, x: number, z: number): number {
  return Math.hypot(Math.max(0, Math.abs(x - cx) - HALF), Math.max(0, Math.abs(z - cz) - HALF));
}

/** Noktanın yaw'a göre dönük dikdörtgen (yerel yarı genişlik `hx`, yerel z aralığı [z0, z1]) uzaklığı. */
function distanceToRect(
  s: { x: number; z: number; yaw: number },
  hx: number,
  z0: number,
  z1: number,
  x: number,
  z: number,
): number {
  const dx = x - s.x;
  const dz = z - s.z;
  const cos = Math.cos(s.yaw);
  const sin = Math.sin(s.yaw);
  // Dünyadan yerele (localToWorld'ün tersi).
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.hypot(Math.max(0, Math.abs(lx) - hx), Math.max(0, z0 - lz, lz - z1));
}

/**
 * Parça için hedef yuvayı bulur: oyuncunun bakış noktasına en yakın, geçerli yuva (destek, boşluk, zemin); yoksa
 * en yakın yuvayı geçersiz (neden ile) döner. `flip`: duvar/kapı iç-dış yüzünü, merdivenin yönünü, beşik çatının
 * mahya eksenini çevirir.
 */
export function resolvePiece(
  kind: PieceKind,
  pose: PiecePose,
  flip: boolean,
  ctx: PlaceContext,
): PieceResolution {
  const spec = PLACEMENT.kinds[kind];
  const index = PieceIndex.of(ctx.structures);
  const aim: Aim = {
    x: pose.x - Math.sin(pose.yaw) * spec.aimDistance,
    z: pose.z - Math.cos(pose.yaw) * spec.aimDistance,
    y: aimHeight(pose, ctx.heightAt(pose.x, pose.z), spec.aimDistance),
  };

  let resolution: PieceResolution | null;
  switch (kind) {
    case 'foundation':
      resolution = resolveFoundation(index, aim, ctx);
      break;
    case 'roof':
      resolution = resolveRoof(index, aim, ctx);
      break;
    case 'door':
      resolution = resolveDoor(index, flip, aim, ctx);
      break;
    case 'stairs':
      resolution = resolveStairs(index, flip, pose, aim, ctx);
      break;
    case 'entry_step':
      resolution = resolveEntryStep(index, aim, ctx);
      break;
    case 'pillar':
      resolution = resolvePillar(index, pose, aim, ctx);
      break;
    case 'gable_roof':
      resolution = resolveGableRoof(index, flip, pose, aim, ctx);
      break;
    case 'gable_wall':
      resolution = resolveGableWall(index, aim, ctx);
      break;
    default:
      resolution = resolveWall(index, kind, flip, pose, aim, ctx);
  }
  if (!resolution) return noSupport(aim, ctx);

  if (
    resolution.check.ok &&
    Math.hypot(resolution.target.x - pose.x, resolution.target.z - pose.z) > spec.maxReach
  ) {
    return { target: resolution.target, check: fail('too_far') };
  }
  return resolution;
}

/** Bakış hücresi ve çevresindeki 3 × 3 hücre merkezleri. */
function cellsAround(x: number, z: number): Point[] {
  const cx0 = snapCell(x);
  const cz0 = snapCell(z);
  const cells: Point[] = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) cells.push({ x: cx0 + di * CELL, z: cz0 + dj * CELL });
  }
  return cells;
}

/** Kat yüksekliği payı: tabanın bakış hedefi, üst yüzünün biraz üstüdür (düz bakışta zemin tabanı seçilsin). */
const FLOOR_AIM_LIFT = 0.6;

/**
 * Taban: bakış hücresinde zemin tabanı ya da çevredeki duvarlı/direkli hücrelerin üstünde üst kat tabanı (balkon
 * çıkıntısı dahil); bakış yüksekliğine göre en yakını.
 */
function resolveFoundation(index: PieceIndex, aim: Aim, ctx: PlaceContext): PieceResolution {
  const candidates: Candidate[] = [groundFoundation(index, aim, ctx)];
  for (const cell of cellsAround(aim.x, aim.z)) {
    for (const y of upperFloorLevels(index, cell.x, cell.z)) {
      candidates.push(upperFoundation(index, cell.x, cell.z, y, aim, ctx));
    }
  }
  return choose(candidates) as PieceResolution;
}

/** Zemin tabanı: zemin uygunluğu ve boşluk. Aynı kattaki komşu tabanla aynı yükseklikte kurulur (zemin sürekli olsun). */
function groundFoundation(index: PieceIndex, aim: Aim, ctx: PlaceContext): Candidate {
  const cx = snapCell(aim.x);
  const cz = snapCell(aim.z);
  const samples = [
    ctx.heightAt(cx, cz),
    ctx.heightAt(cx - SAMPLE, cz - SAMPLE),
    ctx.heightAt(cx + SAMPLE, cz - SAMPLE),
    ctx.heightAt(cx - SAMPLE, cz + SAMPLE),
    ctx.heightAt(cx + SAMPLE, cz + SAMPLE),
  ];
  const highest = Math.max(...samples);
  const lowest = Math.min(...samples);

  const natural = highest - PIECES.floorSink;
  let y = natural;
  for (const edge of edgesOfCell(cx, cz)) {
    const neighbor = neighborAcross(cx, cz, edge);
    // Yalnızca aynı kattaki (zemin) komşu: üst kat tabanının yüksekliği alınmaz.
    const base = index
      .floors(neighbor.x, neighbor.z)
      .find((s) => s.kind === 'foundation' && Math.abs(s.y - natural) < STOREY / 2);
    if (base) {
      y = base.y;
      break;
    }
  }
  const target: PieceTarget = { x: cx, y, z: cz, yaw: 0 };
  const candidate = (reason: PlaceFailure | null): Candidate => ({
    target,
    score: aimScore(cx, cz, y + PIECES.slab + FLOOR_AIM_LIFT, aim),
    reason,
  });

  if (index.floors(cx, cz).some((s) => Math.abs(s.y - y) < STOREY / 2)) {
    return candidate('occupied');
  }
  if (index.all('step', cx, cz).length > 0) return candidate('too_close');
  if (lowest * VERTICAL_SCALE <= SCATTER.minElevation) return candidate('in_sea');
  if (highest > y + PIECES.maxBury || lowest < y - PIECES.maxDrop) {
    return candidate('too_steep');
  }
  if (ctx.nearFreshWater?.(cx, cz)) return candidate('near_water');
  if (blockedByOther(ctx.structures, cx, cz, y, (x, z) => distanceToCell(cx, cz, x, z))) {
    return candidate('too_close');
  }
  return candidate(null);
}

/**
 * Hücrenin kendi üst kat desteği olan katlar (taban `y`'leri): kenarlarındaki tam boy duvarların, köşelerindeki
 * direklerin ve üstünde durduğu merdivenin bir kat üstü.
 */
function ownUpperLevels(index: PieceIndex, cx: number, cz: number): number[] {
  const levels: number[] = [];
  const add = (y: number): void => {
    if (!levels.some((l) => Math.abs(l - y) < SAME_Y)) levels.push(y);
  };
  for (const edge of edgesOfCell(cx, cz)) {
    for (const w of index.all('wall', edge.x, edge.z)) if (isWallKind(w.kind)) add(w.y + STOREY);
  }
  for (const corner of cornersOfCell(cx, cz)) {
    for (const p of index.all('post', corner.x, corner.z)) add(p.y + STOREY);
  }
  for (const s of index.all('stair', cx, cz)) add(s.y + STOREY);
  return levels;
}

/** Hücre `y` katında kendi desteğiyle (duvar/direk/merdiven) mi taşınıyor? */
function hasOwnSupport(index: PieceIndex, cx: number, cz: number, y: number): boolean {
  return ownUpperLevels(index, cx, cz).some((l) => Math.abs(l - y) < SAME_Y);
}

/**
 * Hücrenin `y` katındaki desteğe uzaklığı (hücre): 0 kendi desteği, n desteklenen üst tabandan n hücre çıkıntı;
 * `limit`'i aşarsa sonsuz. Aradaki hücrelerde aynı katta taban bulunmalıdır.
 */
function supportDistance(
  index: PieceIndex,
  cx: number,
  cz: number,
  y: number,
  limit = PIECES_II.upperFloor.overhangCells,
): number {
  if (hasOwnSupport(index, cx, cz, y)) return 0;
  const seen = new Set<string>([`${cx}|${cz}`]);
  let frontier: Point[] = [{ x: cx, z: cz }];
  for (let depth = 1; depth <= limit; depth++) {
    const next: Point[] = [];
    for (const cell of frontier) {
      for (const edge of edgesOfCell(cell.x, cell.z)) {
        const n = neighborAcross(cell.x, cell.z, edge);
        const key = `${n.x}|${n.z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!index.foundationAt(n.x, n.z, y)) continue;
        if (hasOwnSupport(index, n.x, n.z, y)) return depth;
        next.push(n);
      }
    }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}

/** Hücreye üst kat tabanı konabilecek katlar: kendi desteği ve desteklenen komşu üst tabanlardan çıkıntı (balkon). */
function upperFloorLevels(index: PieceIndex, cx: number, cz: number): number[] {
  const levels = ownUpperLevels(index, cx, cz);
  for (const edge of edgesOfCell(cx, cz)) {
    const n = neighborAcross(cx, cz, edge);
    for (const f of index.floors(n.x, n.z)) {
      if (f.kind !== 'foundation') continue;
      if (levels.some((l) => Math.abs(l - f.y) < SAME_Y)) continue;
      if (supportDistance(index, n.x, n.z, f.y) < PIECES_II.upperFloor.overhangCells) {
        levels.push(f.y);
      }
    }
  }
  return levels;
}

/** Üst kat tabanı adayı: duvarların/direklerin üstünde ya da balkon. */
function upperFoundation(
  index: PieceIndex,
  cx: number,
  cz: number,
  y: number,
  aim: Aim,
  ctx: PlaceContext,
): Candidate {
  const target: PieceTarget = { x: cx, y, z: cz, yaw: 0 };
  const candidate = (reason: PlaceFailure | null): Candidate => ({
    target,
    score: aimScore(cx, cz, y + PIECES.slab + FLOOR_AIM_LIFT, aim),
    reason,
  });
  if (index.floors(cx, cz).some((s) => Math.abs(s.y - y) < STOREY / 2)) {
    return candidate('occupied');
  }
  if (index.roofAtOrBelow(cx, cz, y)) return candidate('on_roof');
  if (y - ctx.heightAt(cx, cz) > PIECES.maxBuildHeight) return candidate('too_far');
  if (blockedByOther(ctx.structures, cx, cz, y, (x, z) => distanceToCell(cx, cz, x, z))) {
    return candidate('too_close');
  }
  return candidate(null);
}

/**
 * Kenar parçası (duvar sınıfı, korkuluk, yarım duvar): bir **tabanın** kenarına oturur. Çatı plakası destek değildir
 * (çatı en üst parça); bakılan yerde yalnızca çatı varsa neden `on_roof` olur.
 */
function resolveWall(
  index: PieceIndex,
  kind: PieceKind,
  flip: boolean,
  pose: PiecePose,
  aim: Aim,
  ctx: PlaceContext,
): PieceResolution | null {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const height = isWallKind(kind)
    ? PIECES.wallHeight
    : kind === 'railing'
      ? PIECES_II.railing.height
      : PIECES_II.halfWall.height;
  for (const cell of cellsAround(aim.x, aim.z)) {
    for (const floor of index.floors(cell.x, cell.z)) {
      const onRoof = isRoofKind(floor.kind);
      if (floor.kind === 'gable_roof') continue;
      for (const edge of edgesOfCell(cell.x, cell.z)) {
        const key = `${edge.x}|${edge.z}|${Math.round(floor.y * 4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const target: PieceTarget = {
          x: edge.x,
          y: floor.y,
          z: edge.z,
          yaw: yawForAxis(edge.axis, flip),
        };
        const score = aimScore(edge.x, edge.z, floor.y + PIECES.slab + height / 2, aim);
        const reason = onRoof ? 'on_roof' : wallFailure(index, edge, floor.y, height, pose, ctx);
        candidates.push({ target, score, reason });
      }
    }
  }
  return choose(candidates);
}

function wallFailure(
  index: PieceIndex,
  edge: Edge,
  y: number,
  height: number,
  pose: PiecePose,
  ctx: PlaceContext,
): PlaceFailure | null {
  if (index.edgePiece(edge, y)) return 'occupied';
  if (y - ctx.heightAt(edge.x, edge.z) > PIECES.maxBuildHeight) return 'too_far';
  if (blocksStairs(index, edge, y)) return 'stairwell';
  const feetY = pose.y ?? y;
  if (
    distanceToEdge(edge, pose.x, pose.z) < PIECES.playerClearance &&
    feetY > y - 0.5 &&
    feetY < y + PIECES.slab + height
  ) {
    return 'too_close';
  }
  if (blockedByOther(ctx.structures, edge.x, edge.z, y, (x, z) => distanceToEdge(edge, x, z))) {
    return 'too_close';
  }
  return null;
}

/**
 * Kenar parçası bir merdiveni tıkar mı: `y` katındaki merdivenin girişi ya da iç kenarı, bir alt kattaki merdivenin
 * çıkışı (üst kat tabanının kenarı).
 */
function blocksStairs(index: PieceIndex, edge: Edge, y: number): boolean {
  for (const cell of cellsOfEdge(edge)) {
    for (const s of index.all('stair', cell.x, cell.z)) {
      const layout = stairLayout(s);
      if (
        Math.abs(s.y - y) < SAME_Y &&
        (sameEdge(edge, layout.entry) || sameEdge(edge, layout.inner))
      ) {
        return true;
      }
    }
  }
  // Bir alt kattaki merdivenin çıkışı: kenarın bir yanındaki hücre o merdivenin üst ucudur.
  for (const cell of cellsOfEdge(edge)) {
    for (const s of index.all('stair', cell.x, cell.z)) {
      if (Math.abs(s.y + STOREY - y) < SAME_Y && sameEdge(edge, stairLayout(s).exit)) return true;
    }
  }
  return false;
}

/** Kapı: bakışa en yakın, kapısız kapılı duvarın yerine. */
function resolveDoor(
  index: PieceIndex,
  flip: boolean,
  aim: Aim,
  ctx: PlaceContext,
): PieceResolution | null {
  let best: { s: Readonly<Structure>; score: number } | null = null;
  for (const s of ctx.structures.near(aim.x, aim.z, PIECES.searchRadius + CELL)) {
    if (s.kind !== 'doorway') continue;
    if (index.find('door', s.x, s.z, s.y) !== undefined) continue;
    const score = aimScore(s.x, s.z, s.y + PIECES.slab + PIECES.doorway.height / 2, aim);
    if (!best || score < best.score) best = { s, score };
  }
  if (!best) return null;
  const { s } = best;
  const target: PieceTarget = { x: s.x, y: s.y, z: s.z, yaw: yawForAxis(axisOfYaw(s.yaw), flip) };
  return { target, check: { ok: true, y: s.y, slopeDeg: 0 } };
}

/** Çatı/üst yapı destek katları: kenarlardaki tam boy duvarların ve köşelerdeki direklerin bir kat üstü. */
function roofLevels(index: PieceIndex, cx: number, cz: number): number[] {
  const levels: number[] = [];
  const add = (y: number): void => {
    if (!levels.some((l) => Math.abs(l - y) < SAME_Y)) levels.push(y);
  };
  for (const edge of edgesOfCell(cx, cz)) {
    for (const w of index.all('wall', edge.x, edge.z)) if (isWallKind(w.kind)) add(w.y + STOREY);
  }
  for (const corner of cornersOfCell(cx, cz)) {
    for (const p of index.all('post', corner.x, corner.z)) add(p.y + STOREY);
  }
  return levels;
}

/** Çatı benzeri parçanın hücrede `y` katına konamama nedeni (yoksa null). */
function roofCellFailure(
  index: PieceIndex,
  cx: number,
  cz: number,
  y: number,
): PlaceFailure | null {
  if (index.floors(cx, cz).some((s) => Math.abs(s.y - y) < SAME_Y)) return 'occupied';
  if (index.roofAtOrBelow(cx, cz, y)) return 'on_roof';
  // Merdiven hücresinin üstü açık kalır (çatı konmaz; üst kat tabanı merdiven boşluklu olur).
  if (index.stairsAt(cx, cz, y - STOREY)) return 'stairwell';
  return null;
}

/** Çatı: duvarların/direklerin üstüne ya da komşu çatıya bitişik hücre. */
function resolveRoof(index: PieceIndex, aim: Aim, ctx: PlaceContext): PieceResolution | null {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const add = (cx: number, cz: number, y: number): void => {
    const key = `${cx}|${cz}|${Math.round(y * 4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (y - ctx.heightAt(cx, cz) > PIECES.maxBuildHeight) return;
    const target: PieceTarget = { x: cx, y, z: cz, yaw: 0 };
    let reason = roofCellFailure(index, cx, cz, y);
    if (
      reason === null &&
      blockedByOther(ctx.structures, cx, cz, y, (x, z) => distanceToCell(cx, cz, x, z))
    ) {
      reason = 'too_close';
    }
    candidates.push({ target, score: aimScore(cx, cz, y + PIECES.slab / 2, aim), reason });
  };
  for (const cell of cellsAround(aim.x, aim.z)) {
    for (const y of roofLevels(index, cell.x, cell.z)) add(cell.x, cell.z, y);
    for (const edge of edgesOfCell(cell.x, cell.z)) {
      const other = neighborAcross(cell.x, cell.z, edge);
      for (const floor of index.floors(other.x, other.z)) {
        if (floor.kind === 'roof') add(cell.x, cell.z, floor.y);
      }
    }
  }
  return choose(candidates);
}

/**
 * Merdiven: bakılan yöne (yaw çeyrek tura oturur; `flip` tersine çevirir) bir kat çıkar; iki hücresinde aynı katta
 * taban bulunmalı. Giriş, iç kenar ve (bir kat üstte) çıkış kenarı açık; üstünde çatı olamaz.
 */
function resolveStairs(
  index: PieceIndex,
  flip: boolean,
  pose: PiecePose,
  aim: Aim,
  ctx: PlaceContext,
): PieceResolution | null {
  const yaw = snapYaw(pose.yaw + (flip ? Math.PI : 0));
  const dir = forwardOf(yaw);
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const cell of cellsAround(aim.x, aim.z)) {
    for (const floor of index.floors(cell.x, cell.z)) {
      const key = `${cell.x}|${cell.z}|${Math.round(floor.y * 4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const target: PieceTarget = {
        x: cell.x + dir.x * HALF,
        y: floor.y,
        z: cell.z + dir.z * HALF,
        yaw,
      };
      const score = aimScore(target.x, target.z, floor.y + PIECES.slab + STOREY / 2, aim);
      const reason = isRoofKind(floor.kind) ? 'on_roof' : stairsFailure(index, target, pose, ctx);
      candidates.push({ target, score, reason });
    }
  }
  return choose(candidates);
}

function stairsFailure(
  index: PieceIndex,
  target: PieceTarget,
  pose: PiecePose,
  ctx: PlaceContext,
): PlaceFailure | null {
  const { y } = target;
  const layout = stairLayout(target);
  if (!index.foundationAt(layout.high.x, layout.high.z, y)) return 'no_support';
  if (
    index.stairsAt(layout.low.x, layout.low.z, y) ||
    index.stairsAt(layout.high.x, layout.high.z, y)
  ) {
    return 'occupied';
  }
  // Merdiven boşluklu tabanın (delik) üstüne merdiven konmaz.
  if (
    index.stairsAt(layout.low.x, layout.low.z, y - STOREY) ||
    index.stairsAt(layout.high.x, layout.high.z, y - STOREY)
  ) {
    return 'stairwell';
  }
  if (y - ctx.heightAt(target.x, target.z) > PIECES.maxBuildHeight) return 'too_far';
  // Giriş ve iç kenarda duvar, çıkışta (bir kat üstte) duvar, hücrelerin üstünde çatı olamaz.
  if (index.edgePiece(layout.entry, y) || index.edgePiece(layout.inner, y)) return 'stairwell';
  if (index.edgePiece(layout.exit, y + STOREY)) return 'stairwell';
  for (const cell of [layout.low, layout.high]) {
    if (
      index
        .floors(cell.x, cell.z)
        .some((s) => isRoofKind(s.kind) && Math.abs(s.y - (y + STOREY)) < SAME_Y)
    ) {
      return 'stairwell';
    }
  }
  const halfWidth = PIECES_II.stairs.halfWidth;
  const feetY = pose.y ?? y;
  if (
    distanceToRect(target, halfWidth, -CELL, CELL, pose.x, pose.z) < PLAYER.radius &&
    feetY > y - 0.5 &&
    feetY < y + STOREY
  ) {
    return 'too_close';
  }
  const distance = (x: number, z: number): number =>
    distanceToRect(target, HALF, -CELL, CELL, x, z);
  if (blockedByOther(ctx.structures, target.x, target.z, y + PIECES.slab, distance)) {
    return 'too_close';
  }
  return null;
}

/**
 * Giriş basamağı: bir tabanın kenarına dışarıdan (dış hücrede aynı katta taban yok); dış ucunda zemin tabanın üst
 * yüzünden en çok `maxRise` (+ pay) aşağıda olmalı.
 */
function resolveEntryStep(index: PieceIndex, aim: Aim, ctx: PlaceContext): PieceResolution | null {
  const step = PIECES_II.entryStep;
  const candidates: Candidate[] = [];
  for (const cell of cellsAround(aim.x, aim.z)) {
    for (const floor of index.floors(cell.x, cell.z)) {
      for (const edge of edgesOfCell(cell.x, cell.z)) {
        const outer = neighborAcross(cell.x, cell.z, edge);
        if (index.floors(outer.x, outer.z).some((s) => Math.abs(s.y - floor.y) < STOREY / 2)) {
          continue;
        }
        const out = { x: Math.sign(outer.x - cell.x), z: Math.sign(outer.z - cell.z) };
        const target: PieceTarget = {
          x: edge.x,
          y: floor.y,
          z: edge.z,
          yaw: Math.atan2(out.x, out.z),
        };
        const mid = { x: edge.x + (out.x * step.depth) / 2, z: edge.z + (out.z * step.depth) / 2 };
        const score = aimScore(mid.x, mid.z, floor.y + PIECES.slab - step.maxRise / 2, aim);
        const reason = isRoofKind(floor.kind)
          ? 'on_roof'
          : entryStepFailure(index, target, outer, out, ctx);
        candidates.push({ target, score, reason });
      }
    }
  }
  return choose(candidates);
}

function entryStepFailure(
  index: PieceIndex,
  target: PieceTarget,
  outer: Point,
  out: Point,
  ctx: PlaceContext,
): PlaceFailure | null {
  const step = PIECES_II.entryStep;
  if (index.all('step', outer.x, outer.z).length > 0) return 'occupied';
  const top = target.y + PIECES.slab;
  // Dış uç (merkez ve iki köşe) zemini.
  const side = { x: out.z, z: out.x };
  const endX = target.x + out.x * step.depth;
  const endZ = target.z + out.z * step.depth;
  const ends = [-1, 0, 1].map((k) =>
    ctx.heightAt(endX + side.x * step.halfWidth * k, endZ + side.z * step.halfWidth * k),
  );
  const lowest = Math.min(...ends);
  if (lowest * VERTICAL_SCALE <= SCATTER.minElevation) return 'in_sea';
  if (lowest < top - step.maxRise - step.gapTolerance) return 'too_steep';
  const distance = (x: number, z: number): number =>
    distanceToRect(target, step.halfWidth, 0, step.depth, x, z);
  if (blockedByOther(ctx.structures, target.x, target.z, top, distance)) return 'too_close';
  return null;
}

/** Direk: bir tabanın hücre köşesine; üst kat tabanını ve çatıyı taşır. */
function resolvePillar(
  index: PieceIndex,
  pose: PiecePose,
  aim: Aim,
  ctx: PlaceContext,
): PieceResolution | null {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const cell of cellsAround(aim.x, aim.z)) {
    for (const floor of index.floors(cell.x, cell.z)) {
      for (const corner of cornersOfCell(cell.x, cell.z)) {
        const key = `${corner.x}|${corner.z}|${Math.round(floor.y * 4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const target: PieceTarget = { x: corner.x, y: floor.y, z: corner.z, yaw: 0 };
        const score = aimScore(corner.x, corner.z, floor.y + PIECES.slab + 1.2, aim);
        let reason: PlaceFailure | null = null;
        if (isRoofKind(floor.kind)) reason = 'on_roof';
        else if (index.find('post', corner.x, corner.z, floor.y)) reason = 'occupied';
        else if (floor.y - ctx.heightAt(corner.x, corner.z) > PIECES.maxBuildHeight) {
          reason = 'too_far';
        } else if (
          Math.hypot(pose.x - corner.x, pose.z - corner.z) < PLAYER.radius + 0.2 &&
          (pose.y ?? floor.y) > floor.y - 0.5 &&
          (pose.y ?? floor.y) < floor.y + STOREY
        ) {
          reason = 'too_close';
        } else if (
          blockedByOther(ctx.structures, corner.x, corner.z, floor.y + PIECES.slab, (x, z) =>
            Math.hypot(x - corner.x, z - corner.z),
          )
        ) {
          reason = 'too_close';
        }
        candidates.push({ target, score, reason });
      }
    }
  }
  return choose(candidates);
}

/**
 * Beşik çatı: mahya ekseni bakışa dik (`flip` ile paralel); iki hücresi (mahyaya dik) duvar/direk üstünde ya da aynı
 * eksende komşu beşik çatının uzantısı. En üst parçadır.
 */
function resolveGableRoof(
  index: PieceIndex,
  flip: boolean,
  pose: PiecePose,
  aim: Aim,
  ctx: PlaceContext,
): PieceResolution | null {
  const lookAlongZ = Math.abs(Math.cos(pose.yaw)) >= Math.abs(Math.sin(pose.yaw));
  const viewAxis: EdgeAxis = lookAlongZ ? 'x' : 'z';
  const axis = flip ? otherAxis(viewAxis) : viewAxis;
  const along = axis === 'x' ? { x: 1, z: 0 } : { x: 0, z: 1 };
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const cell of cellsAround(aim.x, aim.z)) {
    for (const edge of edgesOfCell(cell.x, cell.z)) {
      if (edge.axis !== axis) continue;
      const cells = cellsOfEdge(edge);
      const levels: number[] = [];
      const addLevel = (y: number): void => {
        if (!levels.some((l) => Math.abs(l - y) < SAME_Y)) levels.push(y);
      };
      for (const c of cells) for (const y of roofLevels(index, c.x, c.z)) addLevel(y);
      for (const sign of [-1, 1]) {
        const nx = edge.x + sign * along.x * CELL;
        const nz = edge.z + sign * along.z * CELL;
        for (const c of cellsOfEdge({ axis, x: nx, z: nz })) {
          for (const g of index.floors(c.x, c.z)) {
            if (
              g.kind === 'gable_roof' &&
              axisOfYaw(g.yaw) === axis &&
              Math.abs(g.x - nx) < 0.01 &&
              Math.abs(g.z - nz) < 0.01
            ) {
              addLevel(g.y);
            }
          }
        }
      }
      for (const y of levels) {
        const key = `${edge.x}|${edge.z}|${Math.round(y * 4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const target: PieceTarget = { x: edge.x, y, z: edge.z, yaw: yawForAxis(axis, false) };
        let reason: PlaceFailure | null = null;
        for (const c of cells) reason ??= roofCellFailure(index, c.x, c.z, y);
        if (reason === null && y - ctx.heightAt(edge.x, edge.z) > PIECES.maxBuildHeight) {
          reason = 'too_far';
        }
        const score = aimScore(edge.x, edge.z, y + GABLE_RISE / 2, aim);
        candidates.push({ target, score, reason });
      }
    }
  }
  return choose(candidates);
}

/** Alın duvarı: beşik çatı sırasının açık ucuna (komşu beşik çatı yoksa), çatıyla aynı katta. */
function resolveGableWall(index: PieceIndex, aim: Aim, ctx: PlaceContext): PieceResolution | null {
  const candidates: Candidate[] = [];
  for (const g of ctx.structures.near(aim.x, aim.z, PIECES.searchRadius + CELL * 2)) {
    if (g.kind !== 'gable_roof') continue;
    const { axis, ends } = gableLayout(g);
    for (const end of ends) {
      // Sıra bu uçta sürüyorsa (aynı eksende komşu beşik çatı) uç iç kısımdır.
      const beyond = { x: 2 * end.x - g.x, z: 2 * end.z - g.z };
      const continues = cellsOfEdge({ axis, x: beyond.x, z: beyond.z }).some((c) =>
        index
          .floors(c.x, c.z)
          .some(
            (o) =>
              o.kind === 'gable_roof' &&
              Math.abs(o.x - beyond.x) < 0.01 &&
              Math.abs(o.z - beyond.z) < 0.01 &&
              Math.abs(o.y - g.y) < SAME_Y,
          ),
      );
      if (continues) continue;
      const target: PieceTarget = {
        x: end.x,
        y: g.y,
        z: end.z,
        yaw: yawForAxis(otherAxis(axis), false),
      };
      const reason = index.find('gable_end', end.x, end.z, g.y) ? 'occupied' : null;
      candidates.push({ target, score: aimScore(end.x, end.z, g.y + GABLE_RISE / 3, aim), reason });
    }
  }
  return choose(candidates);
}

/** Destek bulunamadı: hayalet zeminde bakış noktasında kırmızı görünür. */
function noSupport(aim: Aim, ctx: PlaceContext): PieceResolution {
  const x = snapCell(aim.x);
  const z = snapCell(aim.z);
  return { target: { x, y: ctx.heightAt(x, z), z, yaw: 0 }, check: fail('no_support') };
}

/**
 * (x, z) bir tabanın hücresindeyse tabanın üst yüzü (oyun m); değilse null. Küçük yapılar (ateş, tezgâh, sandık)
 * taban üstüne kurulur ve zemine gömülmez. Hücrede birden çok kat varsa `nearY` (oyuncunun ayak yüksekliği) verilirse
 * ona en yakın kat, verilmezse en üst kat seçilir. Merdiven boşluklu tabanlar (delik) sayılmaz.
 */
export function floorTopAt(
  structures: StructureSet,
  x: number,
  z: number,
  nearY?: number,
): number | null {
  const index = PieceIndex.of(structures);
  const cx = snapCell(x);
  const cz = snapCell(z);
  let top: number | null = null;
  for (const s of index.floors(cx, cz)) {
    if (s.kind !== 'foundation') continue;
    if (index.stairsAt(cx, cz, s.y - STOREY)) continue;
    const t = s.y + PIECES.slab;
    if (top === null) top = t;
    else if (nearY === undefined) top = Math.max(top, t);
    else if (Math.abs(t - nearY) < Math.abs(top - nearY)) top = t;
  }
  return top;
}

/** Diğer parçaların (plaka/duvar) bir noktaya yatay uzaklığı: parça olmayan yapıların yerleştirilmesinde engel denetimi. */
export function pieceDistance(piece: Readonly<Structure>, x: number, z: number): number {
  switch (piece.kind) {
    case 'foundation':
    case 'roof':
      return distanceToCell(piece.x, piece.z, x, z);
    case 'stairs':
      return distanceToRect(piece, PIECES_II.stairs.halfWidth, -CELL, CELL, x, z);
    case 'entry_step':
      return distanceToRect(
        piece,
        PIECES_II.entryStep.halfWidth,
        0,
        PIECES_II.entryStep.depth,
        x,
        z,
      );
    case 'pillar':
      return Math.hypot(x - piece.x, z - piece.z);
    default:
      // Beşik çatı ve alın duvarı yukarıdadır (altına kurulabilir); kapı kapılı duvarın içindedir.
      return isEdgeKind(piece.kind)
        ? distanceToEdge(edgeOf(piece), x, z)
        : Number.POSITIVE_INFINITY;
  }
}

// ── Varyantlar (görsel geometri ve collider'lar komşu parçalara göre şekil alır) ──

/**
 * Tabanın varyantı: `raised` (zemine değmez: üst kat ya da balkon; etek çizilmez, collider plaka kalınlığında), `well`
 * (bir alt kattaki merdivenin üstünde: delik + çıkış dışındaki kenarlarda korkuluk). Kenar bit maskeleri `edgesOfCell`
 * sırasıyla kuzey 1, güney 2, batı 4, doğu 8: `rails` korkuluklu kenarlar, `open` kenar şeridi olmayan kenar (merdivenin
 * iki hücresi arasındaki iç kenar: delik iki hücre boyunca kesintisizdir, başın üstünde kiriş kalmaz).
 */
export interface FoundationVariant {
  raised: boolean;
  well: boolean;
  rails: number;
  open: number;
}

/** (x, y, z)'deki (var olan ya da hayalet) tabanın varyantı. */
export function foundationVariant(
  structures: StructureSet,
  x: number,
  y: number,
  z: number,
): FoundationVariant {
  const index = PieceIndex.of(structures);
  const cx = snapCell(x);
  const cz = snapCell(z);
  const key = `variant|${cx}|${cz}|${Math.round(y * 4)}`;
  const cached = index.cache.get(key) as FoundationVariant | undefined;
  if (cached) return cached;

  const below = index.stairsAt(cx, cz, y - STOREY);
  let variant: FoundationVariant;
  if (below) {
    const layout = stairLayout(below);
    let rails = 0;
    let open = 0;
    edgesOfCell(cx, cz).forEach((edge, i) => {
      if (sameEdge(edge, layout.inner)) {
        open |= 1 << i;
        return;
      }
      if (sameEdge(edge, layout.exit)) return;
      if (index.edgePiece(edge, y)) return; // kenarda duvar/korkuluk zaten var
      rails |= 1 << i;
    });
    variant = { raised: true, well: true, rails, open };
  } else {
    const raised = supportDistance(index, cx, cz, y) <= PIECES_II.upperFloor.overhangCells;
    variant = { raised, well: false, rails: 0, open: 0 };
  }
  index.cache.set(key, variant);
  return variant;
}

/**
 * Parçanın varyant anahtarı (`''` = varsayılan geometri/collider): görsel katman ve collider'lar bunu yerleşim
 * imzasına ekler; komşu parçalar değişince parça yeniden kurulur.
 */
export function pieceVariantKey(
  structures: StructureSet,
  s: { kind: StructureKind; x: number; y: number; z: number },
): string {
  if (s.kind !== 'foundation') return '';
  const v = foundationVariant(structures, s.x, s.y, s.z);
  if (v.well) return `well${v.rails}-${v.open}`;
  return v.raised ? 'raised' : '';
}

/** Varyant anahtarını çözer (`pieceVariantKey`'in tersi; bilinmeyen anahtar varsayılandır). */
export function parseFoundationVariant(key: string): FoundationVariant {
  if (key === 'raised') return { raised: true, well: false, rails: 0, open: 0 };
  const match = /^well(\d+)-(\d+)$/.exec(key);
  if (match) {
    return { raised: true, well: true, rails: Number(match[1]) & 15, open: Number(match[2]) & 15 };
  }
  return { raised: false, well: false, rails: 0, open: 0 };
}
