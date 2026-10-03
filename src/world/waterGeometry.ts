import { ShapeUtils, Vector2 } from 'three';
import type { WaterPolygon } from '../data/region';

/** Doldurulmuş üçgen ağı: dünya konumları (x, y, z) ve üçgen indeksleri. */
export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export type HeightFn = (x: number, z: number) => number;

/** Sıralanmış dizinin ortancası (boşsa 0). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Halka noktalarını Vector2 dizisine çevirir; kapalı halkanın tekrarlanan son noktası atılır. */
function ringPoints(ring: Float64Array): Vector2[] {
  const points: Vector2[] = [];
  for (let i = 0; i < ring.length; i += 2)
    points.push(new Vector2(ring[i] as number, ring[i + 1] as number));
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && points.length > 1 && first.equals(last)) points.pop();
  return points;
}

/**
 * Göl/gölet/baraj çokgenlerini düz yüzeylere çevirir. Yüzey yüksekliği dış halkanın zemin
 * yüksekliklerinin ortancası + `lift`'tir (göl tek seviyede durur); çokgen delikleriyle üçgenlenir.
 * Üçgenlenemeyen (dejenere) çokgenler atlanır.
 */
export function buildLakeMeshes(
  polygons: readonly WaterPolygon[],
  heightAt: HeightFn,
  lift: number,
  /** Verilirse yüzey yüksekliği (ortanca, `lift` hariç) çokgen sırasıyla buradan okunur (akış kipi: veri hattında hesaplı). */
  levels?: ArrayLike<number>,
): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const [index, polygon] of polygons.entries()) {
    const [outerRing, ...holeRings] = polygon.rings;
    if (!outerRing) continue;
    const contour = ringPoints(outerRing);
    if (contour.length < 3) continue;
    const holes = holeRings.map(ringPoints).filter((h) => h.length >= 3);

    const triangles = ShapeUtils.triangulateShape(contour, holes);
    if (triangles.length === 0) continue;

    const y =
      (levels ? (levels[index] as number) : median(contour.map((p) => heightAt(p.x, p.y)))) + lift;
    const base = positions.length / 3;
    const all = contour.concat(...holes);
    for (const p of all) positions.push(p.x, y, p.y);
    for (const [a, b, c] of triangles) {
      // Three 2B (x, z) sarımı ekranda saat yönü olabilir; normal +Y olacak şekilde çevir:
      const pa = all[a as number] as Vector2;
      const pb = all[b as number] as Vector2;
      const pc = all[c as number] as Vector2;
      const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
      // (x, z) düzleminde çarpım > 0 ise (a, b, c) sırası −Y'ye bakar; +Y için b ve c yer değiştirir.
      if (cross > 0) indices.push(base + (a as number), base + (c as number), base + (b as number));
      else indices.push(base + (a as number), base + (b as number), base + (c as number));
    }
  }

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Çokgen başına göl yüzeyi yüksekliği (dış halka zemin yüksekliklerinin ortancası; `buildLakeMeshes` ile aynı kural). */
export function lakeLevels(polygons: readonly WaterPolygon[], heightAt: HeightFn): Float32Array {
  const out = new Float32Array(polygons.length);
  polygons.forEach((polygon, i) => {
    const outer = polygon.rings[0];
    if (!outer) return;
    const contour = ringPoints(outer);
    if (contour.length < 3) return;
    out[i] = median(contour.map((p) => heightAt(p.x, p.y)));
  });
  return out;
}
