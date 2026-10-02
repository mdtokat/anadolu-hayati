import { describe, expect, it } from 'vitest';
import { FRESH_WATER, ROADS } from '../src/config';
import type { RoadData } from '../src/data/settlements';
import { separateRoadsFromWater, smoothRoads } from '../src/settlements/roadRouting';
import { FreshWaterIndex } from '../src/world/waterIndex';

/** Düz bir nehir (z = 0 boyunca) dizini. */
function riverAlongX(): FreshWaterIndex {
  return new FreshWaterIndex({
    lines: [{ kind: 'river', intermittent: false, xz: Float64Array.of(-200, 0, 200, 0) }],
    polygons: [],
    points: [],
  });
}

function minDistanceToRiver(road: RoadData, from: number, to: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < road.xz.length; i += 2) {
    const x = road.xz[i]!;
    if (x < from || x > to) continue;
    best = Math.min(best, Math.abs(road.xz[i + 1]!));
  }
  return best;
}

describe('smoothRoads', () => {
  it('kafes basamaklarını (merdiven kırığı) düzleştirir, uçları korur', () => {
    const stairs: number[] = [];
    for (let i = 0; i <= 20; i++) stairs.push(i * 2, (i % 2) * 2);
    const [road] = smoothRoads([{ cls: 1, xz: Float32Array.from(stairs) }]);
    expect(road!.xz[0]).toBe(0);
    expect(road!.xz[road!.xz.length - 2]).toBe(40);
    // Ara noktalar düz çizgiye yakın: ±2 m'lik basamak yerine ≤ 1,1 m sapma.
    for (let i = 2; i + 3 < road!.xz.length; i += 2) {
      expect(Math.abs(road!.xz[i + 1]! - 1)).toBeLessThan(1.1);
    }
    expect(road!.xz.length / 2).toBeLessThan(stairs.length / 2);
  });

  it('gerçek virajı korur (sapma toleranstan büyük)', () => {
    const [road] = smoothRoads([{ cls: 0, xz: Float32Array.of(0, 0, 20, 0, 20, 20) }]);
    let maxZ = 0;
    for (let i = 1; i < road!.xz.length; i += 2) maxZ = Math.max(maxZ, road!.xz[i]!);
    expect(maxZ).toBe(20);
  });
});

describe('separateRoadsFromWater', () => {
  const water = riverAlongX();
  const nearest = (x: number, z: number, r: number) => water.nearest(x, z, r);

  it('nehre paralel yol, kenarlar arası `waterGap` kalacak kadar itilir', () => {
    const road: RoadData = { cls: 0, xz: Float32Array.of(-150, 1, 150, 1) };
    const [out] = separateRoadsFromWater([road], nearest);
    const need = ROADS.width[0] / 2 + ROADS.waterGap + FRESH_WATER.lineWidth.river / 2;
    // Uçlar sabit; ortası (uçlardan uzakta) suyun dışına çıkmış olmalı.
    expect(minDistanceToRiver(out!, -100, 100)).toBeGreaterThan(need - 0.15);
    expect(out!.xz[0]).toBe(-150);
    expect(out!.xz[1]).toBe(1);
    // İtilen yol aynı yanda kalır (kıvrılıp suyun öte yanına geçmez).
    for (let i = 1; i < out!.xz.length; i += 2) expect(out!.xz[i]!).toBeGreaterThan(0);
  });

  it('nehri dik kesen yol (köprü) itilmez', () => {
    const road: RoadData = { cls: 1, xz: Float32Array.of(10, -60, 10, 60) };
    const [out] = separateRoadsFromWater([road], nearest);
    for (let i = 0; i < out!.xz.length; i += 2) expect(out!.xz[i]).toBeCloseTo(10, 5);
  });

  it('sudan uzak yol olduğu gibi kalır (aynı nesne)', () => {
    const road: RoadData = { cls: 2, xz: Float32Array.of(-50, 40, 50, 40) };
    const [out] = separateRoadsFromWater([road], nearest);
    expect(out).toBe(road);
  });
});
