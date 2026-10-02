import { describe, expect, it } from 'vitest';
import type { RoadData, SettlementData, SettlementsData } from '../src/data/settlements';
import { FootprintRegistry } from '../src/settlements/footprints';
import { connectTownRoads } from '../src/settlements/townNetwork';
import { footprintRadius, settlementCenter } from '../src/settlements/layout';

const flat = {
  heightAt: () => 5,
  elevationAt: () => 200,
  isWater: () => false,
};

const line = (cls: 0 | 1 | 2, ...xz: number[]): RoadData => ({ cls, xz: Float32Array.from(xz) });

/** (0, 0) merkezli, 60 m yarıçaplı bir ilçe: cells = merkez hücre (dc, dr, n). */
function townData(): SettlementsData {
  const s: SettlementData = {
    id: 1,
    name: 'Deneme',
    province: 'Bolu',
    rank: 'ilce',
    style: 'kasaba',
    population: 5000,
    x: 0,
    z: 0,
    mosques: 2,
    buildings: 100,
    cells: Int16Array.from([0, 0, 10, 10, 0, 10, -10, 0, 10]),
  };
  return { version: 1, overtureRelease: 't', settlements: [s], landmarks: [], roads: [] };
}

/** Çizgilerin uçları ve gövdeleri birbirine `tol` içinde değiyorsa aynı bileşendir. */
function connected(lines: readonly RoadData[], tol = 2.6): boolean {
  const pts = lines.map((l) => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i + 3 < l.xz.length; i += 2) {
      const n = Math.max(
        1,
        Math.ceil(Math.hypot(l.xz[i + 2]! - l.xz[i]!, l.xz[i + 3]! - l.xz[i + 1]!)),
      );
      for (let k = 0; k <= n; k++)
        out.push([
          l.xz[i]! + ((l.xz[i + 2]! - l.xz[i]!) * k) / n,
          l.xz[i + 1]! + ((l.xz[i + 3]! - l.xz[i + 1]!) * k) / n,
        ]);
    }
    return out;
  });
  const parent = lines.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let a = 0; a < lines.length; a++) {
    for (let b = a + 1; b < lines.length; b++) {
      if (pts[a]!.some((p) => pts[b]!.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol))) {
        parent[find(a)] = find(b);
      }
    }
  }
  return new Set(lines.map((_, i) => find(i))).size === 1;
}

describe('connectTownRoads', () => {
  const data = townData();
  const id = data.settlements[0]!.id;
  const center = settlementCenter(data.settlements[0]!);
  const rim = footprintRadius(data.settlements[0]!) * 0.85;

  it('kente giren yolun boşta ucu en yakın sokağa kısa bir bağlantıyla bağlanır; kapıya giden sokak kalır', () => {
    const cutEnd = { x: center.x + rim, z: center.z }; // kesilmiş yolun kent kenarındaki ucu
    const roads = [line(1, cutEnd.x + 80, cutEnd.z, cutEnd.x, cutEnd.z)];
    // Sokak: kentin içinde, uçtan 15 m içeride dikey; yanında bir kapı.
    const street = line(1, cutEnd.x - 15, center.z - 40, cutEnd.x - 15, center.z + 40);
    const doors = [{ x: cutEnd.x - 19, z: center.z + 20, settlement: id }];
    const out = connectTownRoads(roads, [street], data, flat, new FootprintRegistry(), doors);
    expect(out.joins.length).toBeGreaterThanOrEqual(1);
    expect(out.joins.every((j) => j.cls === 3)).toBe(true);
    // Bağlantı (parçalarıyla) uçtan başlar ve sokağa varır.
    const ends = out.joins.flatMap((j) => [
      [j.xz[0]!, j.xz[1]!],
      [j.xz[j.xz.length - 2]!, j.xz[j.xz.length - 1]!],
    ]);
    expect(ends.some(([x, z]) => Math.hypot(x! - cutEnd.x, z! - cutEnd.z) < 1.5)).toBe(true);
    expect(ends.some(([x]) => Math.abs(x! - (cutEnd.x - 15)) < 5)).toBe(true);
    expect(out.streets.length).toBeGreaterThan(0);
    expect(out.streets.every((st) => st.cls === 3)).toBe(true);
    expect(connected([...roads, ...out.joins, ...out.streets])).toBe(true);
  });

  it('hiçbir kapıya ve girişe hizmet etmeyen sokak adayı tutulmaz', () => {
    const main = line(0, center.x - 80, center.z + 30, center.x + 80, center.z + 30);
    const lonely = line(1, center.x - 40, center.z - 40, center.x - 40, center.z - 10);
    const out = connectTownRoads([main], [lonely], data, flat, new FootprintRegistry(), []);
    expect(out.streets).toHaveLength(0);
  });

  it('kapıya hizmet eden sokak adası bağlantıyla ağa katılır (kopuk sokak kalmaz)', () => {
    const main = line(0, center.x - 80, center.z + 30, center.x + 80, center.z + 30);
    const island = line(1, center.x, center.z - 5, center.x, center.z - 40);
    const doors = [{ x: center.x + 4, z: center.z - 35, settlement: id }];
    const out = connectTownRoads([main], [island], data, flat, new FootprintRegistry(), doors);
    expect(out.streets.length).toBeGreaterThanOrEqual(2); // ada + bağlantı
    expect(connected([main, ...out.joins, ...out.streets])).toBe(true);
  });

  it('kente iki yandan giren yollar sokaklar üzerinden birbirine bağlanır', () => {
    const east = line(1, center.x + rim + 60, center.z, center.x + rim, center.z);
    const west = line(1, center.x - rim - 60, center.z + 4, center.x - rim, center.z + 4);
    const streets = [
      line(1, center.x - rim + 10, center.z + 2, center.x + rim - 10, center.z + 2),
      line(1, center.x, center.z - 30, center.x, center.z + 30),
    ];
    const out = connectTownRoads([east, west], streets, data, flat, new FootprintRegistry(), []);
    expect(connected([east, west, ...out.joins, ...out.streets])).toBe(true);
  });

  it('çok kapıya giden sokak ana caddedir (geniş)', () => {
    const main = line(0, center.x - 80, center.z + 30, center.x + 80, center.z + 30);
    const street = line(1, center.x, center.z + 30, center.x, center.z - 40);
    const doors = Array.from({ length: 8 }, (_, k) => ({
      x: center.x + 4,
      z: center.z - 35 + k * 2,
      settlement: id,
    }));
    const out = connectTownRoads([main], [street], data, flat, new FootprintRegistry(), doors);
    expect(out.streets.some((st) => (st.width ?? 0) > 5)).toBe(true);
  });
});
