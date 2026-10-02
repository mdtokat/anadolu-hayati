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

describe('connectTownRoads', () => {
  const data = townData();
  const center = settlementCenter(data.settlements[0]!);
  const rim = footprintRadius(data.settlements[0]!) * 0.85;

  it('kesilen yol ucu en yakın sokağa kısa bir yolla bağlanır', () => {
    const cutEnd = { x: center.x + rim, z: center.z }; // kesilmiş yolun kent kenarındaki ucu
    const roads = [line(1, cutEnd.x + 80, cutEnd.z, cutEnd.x, cutEnd.z)];
    // Sokak: kentin içinde, uçtan 15 m içeride dikey.
    const street = line(1, cutEnd.x - 15, center.z - 40, cutEnd.x - 15, center.z + 40);
    const out = connectTownRoads(roads, [street], data, flat, new FootprintRegistry());
    expect(out.joins).toHaveLength(1);
    const j = out.joins[0]!.xz;
    expect(Math.hypot(j[0]! - cutEnd.x, j[1]! - cutEnd.z)).toBeLessThan(1.5);
    expect(Math.abs(j[j.length - 2]! - (cutEnd.x - 15))).toBeLessThan(5);
    expect(out.streets).toHaveLength(1);
  });

  it('veri yoluna bağlı olmayan sokak adası bağlantı yoluyla ağa katılır', () => {
    const main = line(0, center.x - 80, center.z + 30, center.x + 80, center.z + 30);
    const island = line(1, center.x, center.z - 5, center.x, center.z - 40);
    const out = connectTownRoads([main], [island], data, flat, new FootprintRegistry());
    expect(out.streets).toHaveLength(2); // ada + bağlantı
    const link = out.streets[1]!.xz;
    const ends = [
      [link[0]!, link[1]!],
      [link[link.length - 2]!, link[link.length - 1]!],
    ];
    // Bağlantının bir ucu adada, diğer ucu anayolda.
    expect(ends.some(([, z]) => Math.abs(z! - (center.z + 30)) < 1.5)).toBe(true);
    expect(ends.some(([x, z]) => Math.hypot(x! - center.x, z! - (center.z - 5)) < 8)).toBe(true);
  });

  it('bağlanamayan sokak adası silinir (erişim yok)', () => {
    const wall = new FootprintRegistry();
    // Adayı her yönden saran, geçilemez büyük bir yapı halkası.
    wall.add(1, { x: center.x, z: center.z - 22, hx: 60, hz: 12, yaw: 0 });
    wall.add(2, { x: center.x, z: center.z - 22 + 40, hx: 60, hz: 3, yaw: 0 });
    const main = line(0, center.x - 80, center.z + 60, center.x + 80, center.z + 60);
    const island = line(1, center.x, center.z - 10, center.x, center.z - 30);
    const out = connectTownRoads([main], [island], data, flat, wall);
    expect(out.streets).toHaveLength(0);
  });

  it('zaten ağa değen sokak olduğu gibi kalır', () => {
    const main = line(0, center.x - 80, center.z, center.x + 80, center.z);
    const street = line(1, center.x, center.z - 30, center.x, center.z + 30); // anayolu keser
    const out = connectTownRoads([main], [street], data, flat, new FootprintRegistry());
    expect(out.streets).toEqual([street]);
    expect(out.joins).toHaveLength(0);
  });
});
