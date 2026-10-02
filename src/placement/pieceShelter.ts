import { PIECES } from '../config';
import {
  PieceIndex,
  STOREY,
  cellsOfEdge,
  edgesOfCell,
  isRoofKind,
  snapCell,
  type Edge,
} from './pieces';
import type { StructureSet } from './structures';

/** Modüler yapının verdiği barınak: çatılı (açık) → sundurma etkisi, kapalı oda → kulübe etkisi. */
export type PieceShelter = 'lean_to' | 'hut' | null;

/** İki plaka/çatının "aynı yükseklikte" sayılma toleransı. */
const SAME_Y = 0.3;

/** Oda hücresi: hücre merkezi ve kat (tabanın `y`'si). */
interface Node {
  x: number;
  z: number;
  y: number;
}

/**
 * (x, y, z) modüler bir yapının altında mı? Ayağın altında bir plaka (taban; eski kayıtlarda çatı) ve bir kat üstünde
 * tavan — çatı, beşik çatı ya da üst kat tabanı — varsa örtülü sayılır (`'lean_to'`). Örtülü hücrelerin bitişik bölgesi
 * (oda) her kenarında duvar, pencereli duvar ya da kapalı kapı taşıyorsa (en çok `PIECES.shelter.maxOpenings` açıklıkla)
 * kapalı odadır (`'hut'`). Faz 11 (11.1): merdiven boşluğu iki katı **tek oda** yapar (alt kattaki merdiven hücresi
 * üstteki boşluklu tabanın hücresine bağlanır); yarım duvar ve korkuluk açıklıktır; merdivende duran oyuncu
 * merdivenin katındadır. Sonuçlar yapı sürümü başına önbelleğe alınır.
 */
export function pieceShelterAt(
  structures: StructureSet,
  x: number,
  y: number,
  z: number,
): PieceShelter {
  const index = PieceIndex.of(structures);
  const cx = snapCell(x);
  const cz = snapCell(z);
  const level = standingLevel(index, cx, cz, y);
  if (level === null) return null;
  const start: Node = { x: cx, z: cz, y: level };
  if (!isRoomCell(index, start)) return null;

  const key = `shelter|${cx}|${cz}|${Math.round(level * 4)}`;
  const cached = index.cache.get(key) as PieceShelter | undefined;
  if (cached !== undefined) return cached;
  const result = roomShelter(index, start);
  index.cache.set(key, result);
  return result;
}

/** Ayağın bulunduğu kat: üstünde durulan plaka ya da üzerinde yürünen merdivenin oturduğu taban; yoksa null. */
function standingLevel(index: PieceIndex, cx: number, cz: number, y: number): number | null {
  for (const f of index.floors(cx, cz)) {
    if (f.kind === 'gable_roof') continue;
    const top = f.y + PIECES.slab;
    if (y >= top - 0.5 && y <= top + PIECES.wallHeight / 2) return f.y;
  }
  for (const s of index.all('stair', cx, cz)) {
    const top = s.y + PIECES.slab;
    if (y >= top - 0.5 && y <= top + STOREY) return s.y;
  }
  return null;
}

/** Hücrenin `y` katında plakası var mı (taban; eski kayıtlarda çatı da zemin olabilir)? */
function hasFloor(index: PieceIndex, node: Node): boolean {
  return index
    .floors(node.x, node.z)
    .some((f) => f.kind !== 'gable_roof' && Math.abs(f.y - node.y) < SAME_Y);
}

/** Hücrenin tavanı: `'cover'` (çatı ya da üst kat tabanı), `'well'` (merdiven boşluklu üst taban) ya da null. */
function ceilingOf(index: PieceIndex, node: Node): 'cover' | 'well' | null {
  const above = node.y + STOREY;
  let result: 'cover' | 'well' | null = null;
  for (const f of index.floors(node.x, node.z)) {
    if (Math.abs(f.y - above) >= SAME_Y) continue;
    if (isRoofKind(f.kind)) return 'cover';
    result = index.stairsAt(node.x, node.z, node.y) ? 'well' : 'cover';
  }
  return result;
}

/** Oda hücresi: zemini ve tavanı (ya da yukarı açılan merdiven boşluğu) olan hücre. */
function isRoomCell(index: PieceIndex, node: Node): boolean {
  return hasFloor(index, node) && ceilingOf(index, node) !== null;
}

/** Kenar bu katta kapalı mı: duvar/pencereli duvar ya da kapalı kapılı kapılı duvar (yarım duvar, korkuluk açıktır). */
function edgeClosed(index: PieceIndex, edge: Edge, floorY: number): boolean {
  const wall = index.edgePiece(edge, floorY);
  if (!wall) return false;
  if (wall.kind === 'wall' || wall.kind === 'window_wall') return true;
  if (wall.kind !== 'doorway') return false;
  const door = index.find('door', edge.x, edge.z, floorY);
  return door !== undefined && door.open !== true;
}

/** Hücre `node`, bir alt kattaki merdivenin üstündeki boşluklu taban mı? */
function isWellFloor(index: PieceIndex, node: Node): boolean {
  return index.stairsAt(node.x, node.z, node.y - STOREY) !== undefined;
}

function roomShelter(index: PieceIndex, start: Node): PieceShelter {
  const keyOf = (n: Node): string => `${n.x}|${n.z}|${Math.round(n.y * 4)}`;
  const visited = new Set<string>([keyOf(start)]);
  const queue: Node[] = [start];
  let openings = 0;
  const visit = (n: Node): boolean => {
    const key = keyOf(n);
    if (visited.has(key)) return true;
    visited.add(key);
    if (visited.size > PIECES.shelter.maxCells) return false;
    queue.push(n);
    return true;
  };
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head] as Node;
    // Merdiven boşluğu: yukarıdaki boşluklu taban ya da aşağıdaki merdiven hücresi aynı odadır.
    if (ceilingOf(index, cell) === 'well') {
      const up: Node = { x: cell.x, z: cell.z, y: cell.y + STOREY };
      if (isRoomCell(index, up)) {
        if (!visit(up)) return 'lean_to';
      } else {
        openings += 1; // üst kat çatısız: boşluk göğe açılır
      }
    }
    if (isWellFloor(index, cell)) {
      const stairs = index.stairsAt(cell.x, cell.z, cell.y - STOREY);
      const down: Node = { x: cell.x, z: cell.z, y: cell.y - STOREY };
      if (stairs && isRoomCell(index, down) && !visit(down)) return 'lean_to';
    }
    for (const edge of edgesOfCell(cell.x, cell.z)) {
      const other = cellsOfEdge(edge).find((c) => c.x !== cell.x || c.z !== cell.z);
      if (!other) continue;
      const next: Node = { x: other.x, z: other.z, y: cell.y };
      // Komşu oda hücresine kenar açıksa geçilir; kapalıysa (bölme duvarı) ne geçilir ne açıklık sayılır.
      if (isRoomCell(index, next) && !edgeClosed(index, edge, cell.y)) {
        if (!visit(next)) return 'lean_to';
        continue;
      }
      if (isRoomCell(index, next)) continue; // odanın içindeki bölme duvarı
      if (!edgeClosed(index, edge, cell.y)) openings += 1;
    }
  }
  return openings <= PIECES.shelter.maxOpenings ? 'hut' : 'lean_to';
}
