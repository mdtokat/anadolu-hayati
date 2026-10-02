import { describe, expect, it } from 'vitest';
import { ROADS, ROAD_STRUCTURES, VERTICAL_SCALE } from '../src/config';
import type { RoadData } from '../src/data/settlements';
import {
  SPAN_KIND,
  groundRuns,
  planRoadProfiles,
  type ProfileTerrain,
} from '../src/settlements/roadProfile';

const road = (cls: 0 | 1 | 2, ...xz: number[]): RoadData => ({ cls, xz: Float32Array.from(xz) });

/** Düz yükseklik `h(x, z)` + isteğe bağlı dere çizgisi (z = zStream, yatay). */
function terrain(
  h: (x: number, z: number) => number,
  stream?: { z: number; kind?: string; half?: number },
): ProfileTerrain {
  return {
    heightAt: h,
    elevationAt: (x, z) => h(x, z) * VERTICAL_SCALE,
    nearestWater: stream
      ? (x, z, r) => {
          const d = Math.abs(z - stream.z);
          return d <= r ? { kind: stream.kind ?? 'stream', distance: d, x, z: stream.z } : null;
        }
      : undefined,
  };
}

function maxGrade(bed: Float32Array, step: number): number {
  let g = 0;
  for (let i = 0; i + 1 < bed.length; i++) g = Math.max(g, Math.abs(bed[i + 1]! - bed[i]!) / step);
  return g;
}

describe('planRoadProfiles', () => {
  it('tümseği yumuşatır: yatak eğimi sınırı aşmaz, uçlar doğal yükseklikte', () => {
    // 300 m yol, ortada 8 m'lik dar tümsek (kazılır): doğal eğim 0,4+.
    const bump = (x: number) => 20 + 8 * Math.exp(-(((x - 150) / 12) ** 2));
    const plan = planRoadProfiles(
      [road(1, 0, 0, 300, 0)],
      terrain((x) => bump(x)),
    );
    const r = plan.roads[0]!;
    expect(r.bed[0]).toBeCloseTo(bump(0), 3);
    expect(r.bed[r.bed.length - 1]).toBeCloseTo(bump(300), 3);
    expect(maxGrade(r.bed, r.step)).toBeLessThanOrEqual((ROADS.gradeMax[1] as number) * 1.05);
    const mid = r.bed[Math.floor(r.bed.length / 2)]!;
    expect(mid).toBeLessThan(bump(150) - 3); // tepe kazıldı
    expect(plan.spans).toHaveLength(0);
  });

  it('dereyi geçen kesim köprü olur: iki yanı zemin, aradaki güverte zeminin üstünde', () => {
    const valley = (_x: number, z: number) => 10 + 0.0 * z;
    const plan = planRoadProfiles(
      [road(0, 0, -100, 0, 100)],
      terrain((x, z) => valley(x, z), { z: 0 }),
    );
    expect(plan.spans).toHaveLength(1);
    const span = plan.spans[0]!;
    expect(span.kind).toBe(SPAN_KIND.bridge);
    const r = plan.roads[span.road]!;
    expect(r.kind[span.i0]).toBe(SPAN_KIND.ground);
    expect(r.kind[span.i1]).toBe(SPAN_KIND.ground);
    for (let i = span.i0 + 1; i < span.i1; i++) {
      expect(r.kind[i]).toBe(SPAN_KIND.bridge);
      expect(r.bed[i]!).toBeGreaterThanOrEqual(10 + ROAD_STRUCTURES.clearance - 0.01);
    }
    // Köprü kesimi boyanmaz: zemin kesimleri iki parçadır ve dere ekseninden uzakta biter.
    const runs = groundRuns(plan);
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      for (let i = 1; i < run.xz.length; i += 2) expect(Math.abs(run.xz[i]!)).toBeGreaterThan(2);
    }
  });

  it('dik vadi (derin dolgu) viyadük olur', () => {
    // 60 m genişliğinde 14 m derin vadi: düz bir yatak vadinin üstünden geçer.
    const gorge = (_x: number, z: number) => 20 - 14 * Math.exp(-((z / 14) ** 2));
    const plan = planRoadProfiles(
      [road(0, 0, -150, 0, 150)],
      terrain((x, z) => gorge(x, z)),
    );
    expect(plan.spans.some((s) => s.viaduct)).toBe(true);
    const span = plan.spans.find((s) => s.viaduct)!;
    const r = plan.roads[span.road]!;
    // Güverte vadi tabanından çok yukarıda; kıyılar araziye oturuyor.
    const mid = Math.floor((span.i0 + span.i1) / 2);
    expect(r.bed[mid]! - r.natural[mid]!).toBeGreaterThan(5);
    expect(Math.abs(r.bed[span.i0]! - r.natural[span.i0]!)).toBeLessThan(
      (ROADS.maxFill[0] as number) + ROAD_STRUCTURES.fillSlack + 1,
    );
  });

  it('dağ patikası (sınıf 2) dik yamaçta doğal zeminde kalır; düz arazide düzeltilir', () => {
    const steep = (x: number) => x * 1.9; // ≈ 62°
    const mountain = planRoadProfiles(
      [road(2, 0, 0, 120, 0)],
      terrain((x) => steep(x)),
    );
    const rm = mountain.roads[0]!;
    for (let i = 3; i < rm.bed.length - 3; i++) {
      expect(Math.abs(rm.bed[i]! - rm.natural[i]!)).toBeLessThan(0.05);
    }
    // Düz arazide aynı patika düzeltilir: dalgalı zemin (±1 m, 30 m dalga) yatakta yumuşar.
    const rolling = (x: number) => 10 + Math.sin((x / 30) * Math.PI * 2);
    const flatTrail = planRoadProfiles(
      [road(2, 0, 0, 240, 0)],
      terrain((x) => rolling(x)),
    );
    const rf = flatTrail.roads[0]!;
    let natural = 0;
    let bed = 0;
    for (let i = 8; i < rf.bed.length - 8; i++) {
      natural = Math.max(natural, Math.abs(rf.natural[i]! - 10));
      bed = Math.max(bed, Math.abs(rf.bed[i]! - 10));
    }
    expect(bed).toBeLessThan(natural * 0.6);
  });

  it('aynı kavşakta buluşan yolların uçları aynı yüksekliğe sabitlenir', () => {
    const slope = (x: number, z: number) => 0.05 * x + 0.02 * z + 10;
    const plan = planRoadProfiles(
      [road(1, -100, 0, 0, 0), road(1, 0, 0, 100, 0), road(2, 0, 0, 0, 90)],
      terrain((x, z) => slope(x, z)),
    );
    const heights = [plan.roads[0]!.bed.at(-1), plan.roads[1]!.bed[0], plan.roads[2]!.bed[0]];
    expect(heights[0]).toBeCloseTo(heights[1]!, 4);
    expect(heights[1]).toBeCloseTo(heights[2]!, 4);
  });

  it('çok kısa yol doğal zeminde kalır, hata vermez', () => {
    const plan = planRoadProfiles(
      [road(2, 0, 0, 5, 0)],
      terrain(() => 3),
    );
    expect(plan.roads[0]!.bed[0]).toBe(3);
    expect(plan.spans).toHaveLength(0);
  });
});
