import { describe, expect, it } from 'vitest';
import { ROADS } from '../src/config';
import type { RoadData } from '../src/data/settlements';
import {
  shapeRoadNetwork,
  type NetworkReport,
  type NetworkTerrain,
  type TownDisc,
} from '../src/settlements/roadNetwork';

const flat: NetworkTerrain = {
  heightAt: () => 5,
  elevationAt: () => 200,
  bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
};

const road = (cls: 0 | 1 | 2, ...xz: number[]): RoadData => ({ cls, xz: Float32Array.from(xz) });
const town = (x: number, z: number, rank: TownDisc['rank'] = 'koy', r = 30): TownDisc => ({
  x,
  z,
  r,
  rank,
});

function report(): NetworkReport {
  return {
    edgesIn: 0,
    edgesOut: 0,
    pruned: 0,
    demoted: 0,
    linked: 0,
    removedComponents: 0,
    accessLinks: 0,
  };
}

/** Uçları `nodeSnap` içinde buluşan yolların bağlı bileşen sayısı. */
function componentCount(roads: readonly RoadData[]): number {
  const parent = roads.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const ends = roads.map((r) => [
    [r.xz[0]!, r.xz[1]!],
    [r.xz[r.xz.length - 2]!, r.xz[r.xz.length - 1]!],
  ]);
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      for (const a of ends[i]!) {
        for (const b of ends[j]!) {
          if (Math.hypot(a![0]! - b![0]!, a![1]! - b![1]!) <= ROADS.nodeSnap + 0.01) {
            parent[find(i)] = find(j);
          }
        }
      }
    }
  }
  return new Set(roads.map((_, i) => find(i))).size;
}

function totalLength(roads: readonly RoadData[], cls?: number): number {
  let l = 0;
  for (const r of roads) {
    if (cls !== undefined && r.cls !== cls) continue;
    for (let i = 0; i + 3 < r.xz.length; i += 2) {
      l += Math.hypot(r.xz[i + 2]! - r.xz[i]!, r.xz[i + 3]! - r.xz[i + 1]!);
    }
  }
  return l;
}

describe('shapeRoadNetwork', () => {
  const main = road(0, -400, 0, 400, 0);

  it('hiçbir yere varmayan çıkmaz tali yol silinir; anayol çıkmazı kalır', () => {
    const stats = report();
    const out = shapeRoadNetwork(
      [main, road(1, 0, 0, 0, 200), road(0, 0, 0, 0, -300)],
      [],
      flat,
      stats,
    );
    expect(totalLength(out, 1) + totalLength(out, 2)).toBe(0);
    expect(totalLength(out, 0)).toBeGreaterThanOrEqual(1099);
    expect(stats.pruned).toBeGreaterThan(0);
  });

  it('yerleşime varan çıkmaz yol kalır (T kavşağı ana yolu böler ve bağlar)', () => {
    const out = shapeRoadNetwork([main, road(1, 0, 0, 0, 300)], [town(0, 300)], flat);
    expect(totalLength(out, 1)).toBeGreaterThan(280);
    // Kavşakta ana yol ikiye bölünmüş: tek bağlı bileşen.
    expect(out.filter((r) => r.cls === 0).length).toBeGreaterThanOrEqual(2);
    expect(componentCount(out)).toBe(1);
  });

  it('kırsalda (yerleşimden uzak) tali yol patikaya iner; yerleşim yakınında tali kalır', () => {
    const loop = road(1, -250, 0, -200, 70, -150, 0); // iki ucu ana yolda, tümüyle kırsal
    const feeder = road(1, 0, 0, 0, 300);
    const stats = report();
    const out = shapeRoadNetwork([main, loop, feeder], [town(0, 300)], flat, stats);
    expect(stats.demoted).toBe(1);
    expect(totalLength(out, 2)).toBeGreaterThan(100);
    expect(totalLength(out, 1)).toBeGreaterThan(280);
  });

  it('kopuk küme, yakındaki yola A* ile bağlanır; çok uzaktaki yerleşimsiz parça silinir', () => {
    const cluster = road(1, 50, 120, 250, 120); // 120 m yukarıda, yerleşime varıyor
    const stray = road(1, -900, 600, -850, 600);
    const stats = report();
    const out = shapeRoadNetwork([main, cluster, stray], [town(250, 120)], flat, stats);
    expect(stats.linked).toBeGreaterThanOrEqual(1);
    expect(componentCount(out)).toBe(1);
    // Yerleşimsiz uzak parça yok.
    for (const r of out) expect(r.xz[0]).toBeGreaterThan(-800);
  });

  it('yakınında yol olmayan yerleşim en yakın yola bağlanır', () => {
    const stats = report();
    const out = shapeRoadNetwork([main], [town(-300, -150)], flat, stats);
    expect(stats.accessLinks).toBe(1);
    expect(componentCount(out)).toBe(1);
    // Bağlantının bir ucu yerleşim merkezinde.
    const hit = out.some((r) => {
      const n = r.xz.length;
      return (
        Math.hypot(r.xz[0]! + 300, r.xz[1]! + 150) < 2 ||
        Math.hypot(r.xz[n - 2]! + 300, r.xz[n - 1]! + 150) < 2
      );
    });
    expect(hit).toBe(true);
  });

  it('deniz (düşük rakım) geçilmez: bağlantı denizin etrafından dolanır', () => {
    const sea: NetworkTerrain = {
      ...flat,
      elevationAt: (x, z) => (Math.abs(x - 150) < 20 && z > 20 && z < 140 ? 0 : 200),
    };
    const out = shapeRoadNetwork([main, road(1, 50, 120, 250, 120)], [town(250, 120)], sea);
    for (const r of out) {
      for (let i = 0; i + 1 < r.xz.length; i += 2) {
        const x = r.xz[i]!;
        const z = r.xz[i + 1]!;
        if (Math.abs(x - 150) < 15 && z > 25 && z < 135)
          throw new Error(`rota denizde: ${x}, ${z}`);
      }
    }
  });
});
