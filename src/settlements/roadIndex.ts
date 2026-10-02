import { ROADS } from '../config';
import type { RoadClass, RoadData } from '../data/settlements';

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
}

/**
 * Yol parçalarının uzamsal ızgarası (saf): "bu nokta yolda mı / yola ne kadar uzak", "burada yol hangi yönde".
 * Yerleşim düzeni (parsel eleme, sokak yönü), nesne eleme (yolda ağaç olmasın) ve insanların yürüyüşü kullanır.
 */
export class RoadIndex {
  private readonly cells = new Map<string, Segment[]>();
  readonly segmentCount: number;

  constructor(
    roads: readonly RoadData[],
    private readonly cellSize: number = ROADS.indexCellSize,
  ) {
    let count = 0;
    for (const road of roads) {
      const xz = road.xz;
      for (let i = 0; i + 3 < xz.length; i += 2) {
        const seg: Segment = {
          ax: xz[i] as number,
          az: xz[i + 1] as number,
          bx: xz[i + 2] as number,
          bz: xz[i + 3] as number,
          cls: road.cls,
        };
        this.insert(seg);
        count++;
      }
    }
    this.segmentCount = count;
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private insert(seg: Segment): void {
    const pad = (ROADS.width[seg.cls] as number) / 2;
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
    let best: RoadHit | null = null;
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const s of list) {
          const dx = s.bx - s.ax;
          const dz = s.bz - s.az;
          const len2 = dx * dx + dz * dz;
          const t =
            len2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2)) : 0;
          const distance = Math.hypot(x - (s.ax + t * dx), z - (s.az + t * dz));
          if (distance > radius) continue;
          const edgeDistance = distance - (ROADS.width[s.cls] as number) / 2;
          if (best === null || edgeDistance < best.edgeDistance) {
            best = { distance, edgeDistance, cls: s.cls, angle: Math.atan2(dz, dx) };
          }
        }
      }
    }
    return best;
  }

  /** (x, z) bir yolun üstünde mi (kenara `margin` pay dahil)? */
  onRoad(x: number, z: number, margin = 0): boolean {
    const hit = this.nearest(x, z, (ROADS.width[0] as number) / 2 + margin + 0.01);
    return hit !== null && hit.edgeDistance <= margin;
  }
}
