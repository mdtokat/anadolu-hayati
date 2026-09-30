import { VERTICAL_SCALE } from '../../src/config';
import type { RegionHeightSource } from '../../src/world/RegionHeightSource';

export interface Point {
  x: number;
  z: number;
}

/** Basit ikili yığın (min-heap): A* için. */
class MinHeap {
  private readonly items: Array<{ node: number; priority: number }> = [];

  get size(): number {
    return this.items.length;
  }

  push(node: number, priority: number): void {
    const items = this.items;
    items.push({ node, priority });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (
        (items[parent] as { priority: number }).priority <=
        (items[i] as { priority: number }).priority
      )
        break;
      [items[parent], items[i]] = [items[i] as never, items[parent] as never];
      i = parent;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0] as { node: number };
    const last = items.pop() as { node: number; priority: number };
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (
          l < items.length &&
          (items[l] as { priority: number }).priority < (items[m] as { priority: number }).priority
        )
          m = l;
        if (
          r < items.length &&
          (items[r] as { priority: number }).priority < (items[m] as { priority: number }).priority
        )
          m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i] as never, items[m] as never];
        i = m;
      }
    }
    return top.node;
  }
}

/**
 * Heightmap üzerinde A*: komşu düğümler arası eğim (oyun uzayı) `maxSlopeDeg`'i aşan kenarlar geçilemez.
 * `stride` örnek atlamasıyla düğüm seyrekleştirilir. `minElevation` (gerçek metre) altındaki düğümler
 * (deniz, kıyı çizgisi) geçilemez: rota yalnızca kara üzerindedir. Bulamazsa null. (Yalnızca test yardımcısı.)
 */
export function findWalkablePath(
  source: RegionHeightSource,
  from: Point,
  to: Point,
  maxSlopeDeg: number,
  stride = 4,
  minElevation = 1,
): Point[] | null {
  const w = Math.floor((source.width - 1) / stride) + 1;
  const h = Math.floor((source.height - 1) / stride) + 1;
  const step = source.cell * stride;
  const tan = Math.tan((maxSlopeDeg * Math.PI) / 180);

  const toNode = (p: Point): number => {
    const c = Math.min(
      Math.max(Math.round((p.x / source.cell + (source.width - 1) / 2) / stride), 0),
      w - 1,
    );
    const r = Math.min(
      Math.max(Math.round((p.z / source.cell + (source.height - 1) / 2) / stride), 0),
      h - 1,
    );
    return r * w + c;
  };
  const nodeX = (n: number) => source.xAt((n % w) * stride);
  const nodeZ = (n: number) => source.zAt(Math.floor(n / w) * stride);
  const heightAt = (n: number) => source.sample((n % w) * stride, Math.floor(n / w) * stride);
  const minHeight = minElevation / VERTICAL_SCALE;

  const start = toNode(from);
  const goal = toNode(to);
  const gScore = new Float32Array(w * h).fill(Infinity);
  const cameFrom = new Int32Array(w * h).fill(-1);
  const heap = new MinHeap();
  gScore[start] = 0;
  heap.push(start, 0);

  const heuristic = (n: number) => Math.hypot(nodeX(n) - nodeX(goal), nodeZ(n) - nodeZ(goal));

  while (heap.size > 0) {
    const current = heap.pop();
    if (current === goal) {
      const path: Point[] = [];
      for (let n = goal; n !== -1; n = cameFrom[n] as number)
        path.push({ x: nodeX(n), z: nodeZ(n) });
      return path.reverse();
    }
    const c = current % w;
    const r = Math.floor(current / w);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
        const next = nr * w + nc;
        if (heightAt(next) < minHeight) continue; // deniz/kıyı çizgisi
        const distance = step * Math.hypot(dc, dr);
        const rise = Math.abs(heightAt(next) - heightAt(current));
        if (rise / distance > tan) continue; // fazla dik
        // Eğim arttıkça maliyet artar: rota doğal olarak düz yerleri tercih eder.
        const cost = distance * (1 + (rise / distance) * 2);
        const tentative = (gScore[current] as number) + cost;
        if (tentative < (gScore[next] as number)) {
          gScore[next] = tentative;
          cameFrom[next] = current;
          heap.push(next, tentative + heuristic(next));
        }
      }
    }
  }
  return null;
}
