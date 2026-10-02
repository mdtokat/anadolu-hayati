import { describe, expect, it } from 'vitest';
import { ROADS } from '../src/config';
import type { RoadData } from '../src/data/settlements';
import {
  buildRoadNetwork,
  cleanNetwork,
  dropTwins,
  emptyNetworkReport,
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

describe('buildRoadNetwork — omurga', () => {
  const main = road(0, -400, 0, 400, 0);

  it('il/ilçe merkezleri anayolla bağlanır; hiçbir yerleşime gitmeyen yollar çizilmez', () => {
    const stats = emptyNetworkReport();
    const out = buildRoadNetwork(
      [main, road(1, 0, 0, 0, 200), road(2, 100, 0, 100, -250), road(1, -380, 300, -200, 300)],
      [town(-380, 0, 'ilce', 40), town(380, 0, 'ilce', 40)],
      flat,
      stats,
    );
    expect(stats.trunkLinks).toBe(1);
    expect(totalLength(out, 0)).toBeGreaterThan(650);
    // Yerleşime gitmeyen kollar seçilmedi.
    expect(totalLength(out, 1) + totalLength(out, 2)).toBe(0);
    expect(componentCount(out)).toBe(1);
  });

  it('köy ağa en kısa yoldan bağlanır (yol köy merkezine kadar uzanır)', () => {
    const out = buildRoadNetwork(
      [main, road(1, 0, 0, 0, 300), road(1, 200, 0, 200, 290)],
      [town(-380, 0, 'ilce', 40), town(380, 0, 'ilce', 40), town(0, 330)],
      flat,
    );
    // Köye giden kol var, öbür kol (hiçbir yere gitmeyen) yok.
    expect(totalLength(out, 1)).toBeGreaterThan(300);
    expect(totalLength(out, 1)).toBeLessThan(360);
    const reaches = out.some((r) => {
      const n = r.xz.length;
      return (
        Math.hypot(r.xz[n - 2]!, r.xz[n - 1]! - 330) < 3 || Math.hypot(r.xz[0]!, r.xz[1]! - 330) < 3
      );
    });
    expect(reaches).toBe(true);
    expect(componentCount(out)).toBe(1);
  });

  it('çizgede yolu olmayan köy en yakın yola A* ile bağlanır', () => {
    const stats = emptyNetworkReport();
    const out = buildRoadNetwork(
      [main],
      [town(-380, 0, 'ilce', 40), town(380, 0, 'ilce', 40), town(-100, -150)],
      flat,
      stats,
    );
    expect(stats.routedLinks).toBe(1);
    expect(componentCount(out)).toBe(1);
    const hit = out.some((r) => {
      const n = r.xz.length;
      return (
        Math.hypot(r.xz[0]! + 100, r.xz[1]! + 150) < 2 ||
        Math.hypot(r.xz[n - 2]! + 100, r.xz[n - 1]! + 150) < 2
      );
    });
    expect(hit).toBe(true);
  });

  it('kopuk iki parça tek ağ olur (çizgede bağ yoksa A*)', () => {
    const stats = emptyNetworkReport();
    const west = road(0, -400, 0, -50, 0);
    const east = road(0, 50, 0, 400, 0);
    const out = buildRoadNetwork(
      [west, east],
      [town(-380, 0, 'ilce', 40), town(250, 0, 'ilce', 40)],
      flat,
      stats,
    );
    expect(componentCount(out)).toBe(1);
    expect(stats.componentLinks + stats.routedLinks).toBeGreaterThanOrEqual(1);
  });

  it('dik arazide giden köy bağlantısı dağ patikasıdır', () => {
    const steep: NetworkTerrain = { ...flat, heightAt: (_x, z) => (z > 50 ? z * 0.8 : 5) };
    const out = buildRoadNetwork(
      [main, road(1, 0, 0, 0, 300)],
      [town(-380, 0, 'ilce', 40), town(380, 0, 'ilce', 40), town(0, 330)],
      steep,
    );
    expect(totalLength(out, 2)).toBeGreaterThan(200);
    expect(totalLength(out, 1)).toBe(0);
  });

  it('deniz (düşük rakım) geçilmez: bağlantı denizin etrafından dolanır', () => {
    const sea: NetworkTerrain = {
      ...flat,
      elevationAt: (x, z) => (Math.abs(x - 150) < 20 && z > 20 && z < 140 ? 0 : 200),
    };
    const out = buildRoadNetwork(
      [main],
      [town(-380, 0, 'ilce', 40), town(380, 0, 'ilce', 40), town(250, 120)],
      sea,
    );
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

describe('ikiz şerit ve halkalar', () => {
  it('çift şeritli yolun öbür yönü ve kavşak kolu atılır', () => {
    const a = road(0, -300, 0, 300, 0);
    const b = road(0, 300, 4, -300, 4); // 4 m yandaki öbür yön
    const ramp = road(0, -40, 1.5, 40, 6); // kavşak kolu
    const side = road(1, 0, 0, 0, 200); // dik yan yol (ikiz değil)
    const { kept } = dropTwins([a, b, ramp, side]);
    expect(kept.filter((r) => r.cls === 0)).toHaveLength(1);
    expect(kept).toContain(side);
  });

  it('kısa halka (göbek, ayrılıp birleşen çatal) çözülür; ağ bağlı kalır', () => {
    const roads = [
      road(0, -300, 0, -60, 0),
      road(0, -60, 0, 60, 0),
      road(0, 60, 0, 300, 0),
      road(1, -60, 0, -30, 40, 30, 40, 60, 0), // çatal: ana yoldan ayrılıp geri döner
      road(1, -60, 0, -60, -200), // çatalın ucundaki yan yol
    ];
    const stats = emptyNetworkReport();
    const out = cleanNetwork(roads, [], () => false, stats);
    expect(stats.loopsRemoved).toBeGreaterThanOrEqual(1);
    expect(componentCount(out)).toBe(1);
    expect(totalLength(out, 0)).toBeGreaterThan(590);
  });
});
