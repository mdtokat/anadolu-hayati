import { PIECES } from '../config';
import { PieceIndex, STOREY, cellsOfEdge, edgesOfCell, snapCell, type Edge } from './pieces';
import type { StructureSet } from './structures';

/** Modüler yapının verdiği barınak: çatılı (açık) → sundurma etkisi, kapalı oda → kulübe etkisi. */
export type PieceShelter = 'lean_to' | 'hut' | null;

/** İki plaka/çatının "aynı yükseklikte" sayılma toleransı. */
const SAME_Y = 0.3;

/**
 * (x, y, z) modüler bir yapının altında mı? Ayağın altında bir plaka (taban/üst kat zemini) ve üstünde (bir kat yukarıda)
 * bir çatı varsa çatılı sayılır (`'lean_to'`). Çatılı hücrelerin bitişik bölgesi (oda) her kenarında duvar, pencereli
 * duvar ya da kapalı kapı taşıyorsa (en çok `PIECES.shelter.maxOpenings` açıklıkla) kapalı odadır (`'hut'`).
 * Sonuçlar yapı sürümü başına önbelleğe alınır.
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
  const floors = index.floors(cx, cz);
  if (floors.length === 0) return null;
  const floor = floors.find((f) => {
    const top = f.y + PIECES.slab;
    return y >= top - 0.5 && y <= top + PIECES.wallHeight / 2;
  });
  if (!floor || !covered(index, cx, cz, floor.y)) return null;

  const key = `shelter|${cx}|${cz}|${Math.round(floor.y * 4)}`;
  const cached = index.cache.get(key) as PieceShelter | undefined;
  if (cached !== undefined) return cached;
  const result = roomShelter(index, cx, cz, floor.y);
  index.cache.set(key, result);
  return result;
}

/** Hücrenin `floorY` katında plakası ve bir kat üstünde çatısı var mı? */
function covered(index: PieceIndex, cx: number, cz: number, floorY: number): boolean {
  const floors = index.floors(cx, cz);
  const hasFloor = floors.some((f) => Math.abs(f.y - floorY) < SAME_Y);
  const hasRoof = floors.some(
    (f) => f.kind === 'roof' && Math.abs(f.y - (floorY + STOREY)) < SAME_Y,
  );
  return hasFloor && hasRoof;
}

/** Kenar bu katta kapalı mı: duvar/pencereli duvar ya da kapalı kapılı kapılı duvar. */
function edgeClosed(index: PieceIndex, edge: Edge, floorY: number): boolean {
  const wall = index.all('wall', edge.x, edge.z).find((w) => Math.abs(w.y - floorY) < SAME_Y);
  if (!wall) return false;
  if (wall.kind !== 'doorway') return true;
  const door = index.find('door', edge.x, edge.z, floorY);
  return door !== undefined && door.open !== true;
}

function roomShelter(index: PieceIndex, cx: number, cz: number, floorY: number): PieceShelter {
  const visited = new Set<string>([`${cx}|${cz}`]);
  const queue: Array<{ x: number; z: number }> = [{ x: cx, z: cz }];
  let openings = 0;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head] as { x: number; z: number };
    for (const edge of edgesOfCell(cell.x, cell.z)) {
      const other = cellsOfEdge(edge).find((c) => c.x !== cell.x || c.z !== cell.z);
      if (!other) continue;
      if (covered(index, other.x, other.z, floorY)) {
        const key = `${other.x}|${other.z}`;
        if (!visited.has(key)) {
          visited.add(key);
          if (visited.size > PIECES.shelter.maxCells) return 'lean_to';
          queue.push(other);
        }
        continue;
      }
      if (!edgeClosed(index, edge, floorY)) openings += 1;
    }
  }
  return openings <= PIECES.shelter.maxOpenings ? 'hut' : 'lean_to';
}
