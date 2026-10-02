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
  /** Hücre → sınır kutusu o hücreye değen çokgenler / o hücredeki kaynak noktaları (sorgu hızı). */
  private readonly polygonCells = new Map<number, number[]>();
  private readonly pointCells = new Map<number, number[]>();
  /** Aynı parçayı bir sorguda iki kez ölçmemek için sorgu damgası (Set ayırmadan). */
  private stamps = new Uint32Array(0);
  private stamp = 0;
  private readonly cellSize: number;

  constructor(water: WaterFeatures, cellSize: number = FRESH_WATER.indexCellSize) {
    this.cellSize = cellSize;
    this.polygons = water.polygons;

    for (const line of water.lines) this.addPath(line.xz, line.kind, line.name);
    for (const polygon of water.polygons) {
      for (const ring of polygon.rings) this.addPath(ring, polygon.kind, polygon.name);
    }
    this.stamps = new Uint32Array(this.segments.length);
    water.polygons.forEach((polygon, id) => {
      const b = polygon.bounds;
      for (let r = Math.floor(b.minZ / cellSize); r <= Math.floor(b.maxZ / cellSize); r++) {
        for (let c = Math.floor(b.minX / cellSize); c <= Math.floor(b.maxX / cellSize); c++) {
          push(this.polygonCells, this.key(c, r), id);
        }
      }
    });
    for (const point of water.points) {
      const id =
        this.points.push({ x: point.x, z: point.z, kind: point.kind, name: point.name }) - 1;
      push(
        this.pointCells,
        this.key(Math.floor(point.x / cellSize), Math.floor(point.z / cellSize)),
        id,
      );
    }
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

    // Göl/gölet/rezervuar içi: yalnızca noktanın hücresine değen çokgenler.
    const home = this.key(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize));
    for (const id of this.polygonCells.get(home) ?? []) {
      const polygon = this.polygons[id] as WaterFeatures['polygons'][number];
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
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.stamps.fill(0);
      this.stamp = 1;
    }
    const stamp = this.stamp;
    // Sıcak döngü (yerleşim düzeni, nesne dağıtımı): nesne ayırmadan en yakın parça aranır.
    const max2 = maxDistance * maxDistance;
    let bestId = -1;
    let bestD2 = max2;
    let bestX = 0;
    let bestZ = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const bucket = this.cells.get(this.key(c, r));
        if (!bucket) continue;
        for (const id of bucket) {
          if (this.stamps[id] === stamp) continue;
          this.stamps[id] = stamp;
          const sg = this.segments[id] as Segment;
          const dx = sg.x1 - sg.x0;
          const dz = sg.z1 - sg.z0;
          const length2 = dx * dx + dz * dz;
          const t =
            length2 === 0
              ? 0
              : Math.min(Math.max(((x - sg.x0) * dx + (z - sg.z0) * dz) / length2, 0), 1);
          const px = sg.x0 + t * dx;
          const pz = sg.z0 + t * dz;
          const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
          if (bestId < 0 ? d2 <= bestD2 : d2 < bestD2) {
            bestId = id;
            bestD2 = d2;
            bestX = px;
            bestZ = pz;
          }
        }
      }
    }
    if (bestId >= 0) {
      const sg = this.segments[bestId] as Segment;
      consider({ kind: sg.kind, name: sg.name, distance: Math.sqrt(bestD2), x: bestX, z: bestZ });
    }

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const id of this.pointCells.get(this.key(c, r)) ?? []) {
          const point = this.points[id] as (typeof this.points)[number];
          consider({
            kind: point.kind,
            name: point.name,
            distance: Math.hypot(point.x - x, point.z - z),
            x: point.x,
            z: point.z,
          });
        }
      }
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

function push(map: Map<number, number[]>, key: number, id: number): void {
  const list = map.get(key);
  if (list) list.push(id);
  else map.set(key, [id]);
}
