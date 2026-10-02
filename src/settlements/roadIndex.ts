import { ROADS } from '../config';
import type { RoadClass, RoadData } from '../data/settlements';
import { roadHalfWidth } from './roadWidth';

/** Bir sorgu sonucu: en yakın yol parçası. */
export interface RoadHit {
  /** Eksene yatay uzaklık (oyun m). */
  distance: number;
  /** Yol kenarına uzaklık (eksen uzaklığı − yarı genişlik; içerideyse negatif). */
  edgeDistance: number;
  cls: RoadClass;
  /** Parçanın yönü (radyan, atan2(dz, dx)). */
  angle: number;
}

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cls: RoadClass;
  /** Yarı genişlik (oyun m). */
  half: number;
}

/**
 * Yol parçalarının uzamsal ızgarası (saf): "bu nokta yolda mı / yola ne kadar uzak", "burada yol hangi yönde".
 * Yerleşim düzeni (parsel eleme, sokak yönü), nesne eleme (yolda ağaç olmasın) ve insanların yürüyüşü kullanır.
 */
export class RoadIndex {
  private readonly cells = new Map<number, Segment[]>();
  private count = 0;

  constructor(
    roads: readonly RoadData[],
    private readonly cellSize: number = ROADS.indexCellSize,
  ) {
    for (const road of roads) this.add(road);
  }

  get segmentCount(): number {
    return this.count;
  }

  /** Yolu dizine ekler (yerleşim düzeni, önceki yerleşimlerin sokaklarını sonrakilere bildirmek için kullanır). */
  add(road: RoadData): void {
    const xz = road.xz;
    for (let i = 0; i + 3 < xz.length; i += 2) {
      this.insert({
        ax: xz[i] as number,
        az: xz[i + 1] as number,
        bx: xz[i + 2] as number,
        bz: xz[i + 3] as number,
        cls: road.cls,
        half: roadHalfWidth(road),
      });
      this.count++;
    }
  }

  private key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  private insert(seg: Segment): void {
    const pad = seg.half;
    const c0x = Math.floor((Math.min(seg.ax, seg.bx) - pad) / this.cellSize);
    const c1x = Math.floor((Math.max(seg.ax, seg.bx) + pad) / this.cellSize);
    const c0z = Math.floor((Math.min(seg.az, seg.bz) - pad) / this.cellSize);
    const c1z = Math.floor((Math.max(seg.az, seg.bz) + pad) / this.cellSize);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(seg);
      }
    }
  }

  /** (x, z)'ye `radius` içindeki en yakın yol parçası (kenar uzaklığına göre); yoksa null. */
  nearest(x: number, z: number, radius: number): RoadHit | null {
    const c0x = Math.floor((x - radius) / this.cellSize);
    const c1x = Math.floor((x + radius) / this.cellSize);
    const c0z = Math.floor((z - radius) / this.cellSize);
    const c1z = Math.floor((z + radius) / this.cellSize);
    const r2 = radius * radius;
    let best: Segment | null = null;
    let bestEdge = Infinity;
    let bestDistance = 0;
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const s of list) {
          const d2 = distance2(s, x, z);
          if (d2 > r2) continue;
          const distance = Math.sqrt(d2);
          const edge = distance - s.half;
          if (edge < bestEdge) {
            best = s;
            bestEdge = edge;
            bestDistance = distance;
          }
        }
      }
    }
    if (!best) return null;
    return {
      distance: bestDistance,
      edgeDistance: bestEdge,
      cls: best.cls,
      angle: Math.atan2(best.bz - best.az, best.bx - best.ax),
    };
  }

  /** (x, z) bir yolun üstünde mi (kenara `margin` pay dahil)? İlk değen parçada döner. */
  onRoad(x: number, z: number, margin = 0): boolean {
    const radius = MAX_HALF + margin;
    const c0x = Math.floor((x - radius) / this.cellSize);
    const c1x = Math.floor((x + radius) / this.cellSize);
    const c0z = Math.floor((z - radius) / this.cellSize);
    const c1z = Math.floor((z + radius) / this.cellSize);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const s of list) {
          const reach = s.half + margin;
          if (distance2(s, x, z) <= reach * reach) return true;
        }
      }
    }
    return false;
  }
}

/** En geniş yolun yarı genişliği (oyun m). */
const MAX_HALF = Math.max(...ROADS.width, ROADS.avenueWidth) / 2;

/** Noktanın parçaya en kısa uzaklığının karesi. */
function distance2(s: Segment, x: number, z: number): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2)) : 0;
  const px = x - (s.ax + t * dx);
  const pz = z - (s.az + t * dz);
  return px * px + pz * pz;
}
