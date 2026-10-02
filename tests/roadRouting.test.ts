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

describe('smoothRoads — keskin köşe ve dalga', () => {
  /** 4 m aralıklı örneklerde ardışık yön değişimlerinin en büyüğü (derece). */
  function maxTurnDeg(xz: Float32Array): number {
    const pts: number[] = [];
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const ax = xz[i]!;
      const az = xz[i + 1]!;
      const bx = xz[i + 2]!;
      const bz = xz[i + 3]!;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
      for (let k = 0; k < n; k++) pts.push(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
    }
    pts.push(xz[xz.length - 2]!, xz[xz.length - 1]!);
    let worst = 0;
    for (let i = 2; i + 3 < pts.length; i += 2) {
      const a1 = Math.atan2(pts[i + 1]! - pts[i - 1]!, pts[i]! - pts[i - 2]!);
      const a2 = Math.atan2(pts[i + 3]! - pts[i + 1]!, pts[i + 2]! - pts[i]!);
      let d = Math.abs(a2 - a1);
      if (d > Math.PI) d = 2 * Math.PI - d;
      worst = Math.max(worst, (d * 180) / Math.PI);
    }
    return worst;
  }

  it('dik açılı köşe viraja dönüşür (her sınıfta), uçlar sabit', () => {
    for (const cls of [0, 1, 2] as const) {
      const [road] = smoothRoads([{ cls, xz: Float32Array.of(0, 0, 120, 0, 120, 120) }]);
      expect(road!.xz[0]).toBe(0);
      expect(road!.xz[road!.xz.length - 1]).toBe(120);
      // Ham yolda 90° tek adımda döner; yumuşatılmışta 4 m'de en çok 45°.
      expect(maxTurnDeg(road!.xz), `sınıf ${cls}`).toBeLessThan(45);
    }
  });

  it('kafes dalgalanması söner (1,5 m genlikli 10 m dalga)', () => {
    const wave: number[] = [];
    for (let x = 0; x <= 200; x += 2) wave.push(x, 1.5 * Math.sin((x / 10) * Math.PI));
    const [road] = smoothRoads([{ cls: 1, xz: Float32Array.from(wave) }]);
    let amp = 0;
    for (let i = 20; i + 1 < road!.xz.length - 20; i += 2)
      amp = Math.max(amp, Math.abs(road!.xz[i + 1]!));
    expect(amp).toBeLessThan(0.5);
  });

  it('düz yol düz kalır ve nokta sayısı artmaz', () => {
    const [road] = smoothRoads([{ cls: 0, xz: Float32Array.of(0, 0, 300, 0) }]);
    expect(road!.xz.length).toBe(4);
  });
});
