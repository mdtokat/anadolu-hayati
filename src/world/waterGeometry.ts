import { ShapeUtils, Vector2 } from 'three';
import type { WaterLine, WaterPolygon } from '../data/region';

/** Doldurulmuş üçgen ağı: dünya konumları (x, y, z) ve üçgen indeksleri. */
export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export type HeightFn = (x: number, z: number) => number;

/** Köşe normalinin dönüş açısına göre uzama sınırı (dar dönüşlerde şerit sivrilmesin). */
const MAX_MITER_SCALE = 2;
/** Bundan kısa (oyun m) ardışık çizgi parçaları atlanır (sıfıra bölünme ve dejenere üçgen olmasın). */
const MIN_SEGMENT = 1e-3;

/** Ardışık tekrar eden noktaları ayıklar. */
function dedupe(xz: Float64Array): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < xz.length; i += 2) {
    const x = xz[i] as number;
    const z = xz[i + 1] as number;
    const last = points[points.length - 1];
    if (last && Math.hypot(x - last[0], z - last[1]) < MIN_SEGMENT) continue;
    points.push([x, z]);
  }
  return points;
}

/**
 * Akarsu çizgilerini zemine oturan şeritlere çevirir. Şerit genişliği tür başına `widthOf`'tan gelir.
 * Her kesitin iki köşesi de (orta, sol, sağ) zemin yüksekliklerinin en büyüğü + `lift` yüksekliğindedir:
 * yamaç kesitinde şerit yarım gömülü kalmaz.
 */
export function buildRiverRibbons(
  lines: readonly WaterLine[],
  heightAt: HeightFn,
  widthOf: (line: WaterLine) => number,
  lift: number,
): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const line of lines) {
    const points = dedupe(line.xz);
    if (points.length < 2) continue;
    const half = widthOf(line) / 2;
    const base = positions.length / 3;

    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i] as [number, number];
      // Parça yönleri: önceki ve sonraki; köşe normali ikisinin (birim) normallerinin ortalaması.
      const prev = points[i - 1];
      const next = points[i + 1];
      let nx = 0;
      let nz = 0;
      let count = 0;
      if (prev) {
        const dx = x - prev[0];
        const dz = z - prev[1];
        const len = Math.hypot(dx, dz);
        nx += -dz / len;
        nz += dx / len;
        count++;
      }
      if (next) {
        const dx = next[0] - x;
        const dz = next[1] - z;
        const len = Math.hypot(dx, dz);
        nx += -dz / len;
        nz += dx / len;
        count++;
      }
      nx /= count;
      nz /= count;
      const nLen = Math.hypot(nx, nz);
      // Ortalama normal kısaldıkça (keskin dönüş) genişlik 1/nLen kadar açılır, sınırlı.
      const scale = nLen < 1e-6 ? 0 : Math.min(1 / nLen, MAX_MITER_SCALE) / nLen;
      nx *= scale * half;
      nz *= scale * half;

      const lx = x + nx;
      const lz = z + nz;
      const rx = x - nx;
      const rz = z - nz;
      const y = Math.max(heightAt(x, z), heightAt(lx, lz), heightAt(rx, rz)) + lift;
      positions.push(lx, y, lz, rx, y, rz);
    }

    for (let i = 0; i < points.length - 1; i++) {
      const a = base + i * 2; // sol, sağ
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      // Normal +Y olacak sarım: (sol_i, sol_i+1, sağ_i) ve (sağ_i, sol_i+1, sağ_i+1)
      indices.push(a, c, b, b, c, d);
    }
  }

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

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
): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const polygon of polygons) {
    const [outerRing, ...holeRings] = polygon.rings;
    if (!outerRing) continue;
    const contour = ringPoints(outerRing);
    if (contour.length < 3) continue;
    const holes = holeRings.map(ringPoints).filter((h) => h.length >= 3);

    const triangles = ShapeUtils.triangulateShape(contour, holes);
    if (triangles.length === 0) continue;

    const y = median(contour.map((p) => heightAt(p.x, p.y))) + lift;
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
