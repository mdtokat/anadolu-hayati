import { FRESH_WATER } from '../config';
import type { WaterFeatures } from '../data/region';

/** Tatlı su türü; `fountain` = yerleşim çeşmesi (Faz 10; veri katmanında yok, `RegionWorld` ekler). */
export type WaterKind =
  'river' | 'stream' | 'canal' | 'lake' | 'reservoir' | 'pond' | 'water' | 'spring' | 'fountain';

/** En yakın tatlı su sorgusunun sonucu. */
export interface WaterHit {
  kind: WaterKind;
  name?: string;
  /** Sorgu noktasından su kenarına/çizgisine uzaklık (oyun m); çokgenin içindeyse 0. */
  distance: number;
  /** Suyun üzerindeki en yakın nokta. */
  x: number;
  z: number;
}

interface Segment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  kind: WaterKind;
  name?: string;
}

/** Noktanın doğru parçasına en yakın noktası. */
function closestOnSegment(
  px: number,
  pz: number,
  s: Segment,
): { x: number; z: number; d2: number } {
  const dx = s.x1 - s.x0;
  const dz = s.z1 - s.z0;
  const length2 = dx * dx + dz * dz;
  const t =
    length2 === 0 ? 0 : Math.min(Math.max(((px - s.x0) * dx + (pz - s.z0) * dz) / length2, 0), 1);
  const x = s.x0 + t * dx;
  const z = s.z0 + t * dz;
  return { x, z, d2: (px - x) ** 2 + (pz - z) ** 2 };
}

function inRing(ring: Float64Array, x: number, z: number): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2] as number;
    const zi = ring[i * 2 + 1] as number;
    const xj = ring[j * 2] as number;
    const zj = ring[j * 2 + 1] as number;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Tatlı su özellikleri için uzamsal ızgara: akarsu parçaları, göl kıyı kenarları ve kaynak noktaları
 * hücrelere dağıtılır; `nearest` yalnızca yakın hücrelere bakar. Göl içinde olmak uzaklığı 0 yapar.
 */
export class FreshWaterIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly segments: Segment[] = [];
  private readonly points: Array<{ x: number; z: number; kind: WaterKind; name?: string }> = [];
  private readonly polygons: WaterFeatures['polygons'];
  private readonly cellSize: number;

  constructor(water: WaterFeatures, cellSize: number = FRESH_WATER.indexCellSize) {
    this.cellSize = cellSize;
    this.polygons = water.polygons;

    for (const line of water.lines) this.addPath(line.xz, line.kind, line.name);
    for (const polygon of water.polygons) {
      for (const ring of polygon.rings) this.addPath(ring, polygon.kind, polygon.name);
    }
    for (const point of water.points)
      this.points.push({ x: point.x, z: point.z, kind: point.kind, name: point.name });
  }

  /** İndeksteki toplam çizgi parçası (akarsu + göl kenarı) sayısı. */
  get segmentCount(): number {
    return this.segments.length;
  }

  /**
   * (x, z)'ye `maxDistance` içindeki en yakın tatlı su; yoksa null. Çokgenin içindeyse uzaklık 0.
   * `maxDistance` hücre boyunu aşabilir; taranan hücre sayısı buna göre artar.
   */
  nearest(x: number, z: number, maxDistance: number = FRESH_WATER.reachDistance): WaterHit | null {
    let best: WaterHit | null = null;
    const consider = (hit: WaterHit) => {
      if (hit.distance <= maxDistance && (best === null || hit.distance < best.distance))
        best = hit;
    };

    // Göl/gölet/rezervuar içi
    for (const polygon of this.polygons) {
      const b = polygon.bounds;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      const [outer, ...holes] = polygon.rings;
      if (outer && inRing(outer, x, z) && !holes.some((h) => inRing(h, x, z))) {
        consider({ kind: polygon.kind, name: polygon.name, distance: 0, x, z });
      }
    }
    if (best !== null && (best as WaterHit).distance === 0) return best;

    // Çizgi parçaları (akarsu + kıyı kenarları)
    const c0 = Math.floor((x - maxDistance) / this.cellSize);
    const c1 = Math.floor((x + maxDistance) / this.cellSize);
    const r0 = Math.floor((z - maxDistance) / this.cellSize);
    const r1 = Math.floor((z + maxDistance) / this.cellSize);
    const seen = new Set<number>();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const bucket = this.cells.get(this.key(c, r));
        if (!bucket) continue;
        for (const id of bucket) {
          if (seen.has(id)) continue;
          seen.add(id);
          const segment = this.segments[id] as Segment;
          const closest = closestOnSegment(x, z, segment);
          consider({
            kind: segment.kind,
            name: segment.name,
            distance: Math.sqrt(closest.d2),
            x: closest.x,
            z: closest.z,
          });
        }
      }
    }

    for (const point of this.points) {
      consider({
        kind: point.kind,
        name: point.name,
        distance: Math.hypot(point.x - x, point.z - z),
        x: point.x,
        z: point.z,
      });
    }
    return best;
  }

  private key(cx: number, cz: number): number {
    // 32 bitlik tamsayı anahtar: hücre indeksleri ±32768 aralığında
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  /** Kırık çizgiyi parçalara böler (halkalar veride zaten kapalıdır: ilk nokta = son nokta). */
  private addPath(coords: Float64Array, kind: WaterKind, name: string | undefined): void {
    const count = coords.length / 2;
    for (let i = 0; i < count - 1; i++) {
      const j = i + 1;
      const segment: Segment = {
        x0: coords[i * 2] as number,
        z0: coords[i * 2 + 1] as number,
        x1: coords[j * 2] as number,
        z1: coords[j * 2 + 1] as number,
        kind,
        name,
      };
      const id = this.segments.push(segment) - 1;
      this.insert(id, segment);
    }
  }

  /** Parçayı kapladığı tüm hücrelere ekler (sınır kutusu üzerinden). */
  private insert(id: number, s: Segment): void {
    const c0 = Math.floor(Math.min(s.x0, s.x1) / this.cellSize);
    const c1 = Math.floor(Math.max(s.x0, s.x1) / this.cellSize);
    const r0 = Math.floor(Math.min(s.z0, s.z1) / this.cellSize);
    const r1 = Math.floor(Math.max(s.z0, s.z1) / this.cellSize);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = this.key(c, r);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(id);
        else this.cells.set(key, [id]);
      }
    }
  }
}
