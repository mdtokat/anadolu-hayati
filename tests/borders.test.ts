import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BORDERS, WATER } from '../src/config';
import { parseProvinces, type RegionData } from '../src/data/region';
import { buildBorderSegments } from '../src/world/borders';
import { ProvinceBorders } from '../src/world/ProvinceBorders';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealRegion } from './helpers/realRegion';

const square = [
  [0, 0],
  [100, 0],
  [100, 50],
  [0, 50],
  [0, 0],
];
const shape = (inRegion: boolean) =>
  parseProvinces({
    features: [
      { properties: { name: 'A', inRegion }, geometry: { type: 'Polygon', coordinates: [square] } },
    ],
  });

describe('buildBorderSegments (sentetik)', () => {
  it('halkayı `spacing` aralığında sıklaştırır: parça uzunluğu ≤ spacing', () => {
    const { positions, segments } = buildBorderSegments(shape(true), () => 0, undefined, 20);
    // Çevre 300 m / 20 m = 15 parça (kenarlar 100, 50, 100, 50 → 5 + 3 + 5 + 3 = 16 parça)
    expect(segments).toBe(16);
    for (let s = 0; s < segments; s++) {
      const i = s * 6;
      const len = Math.hypot(
        (positions[i + 3] as number) - (positions[i] as number),
        (positions[i + 5] as number) - (positions[i + 2] as number),
      );
      expect(len).toBeLessThanOrEqual(20 + 1e-4);
    }
  });

  it('köşeler araziye + lift ile oturur ve su seviyesinin altına inmez', () => {
    const { positions } = buildBorderSegments(
      shape(true),
      (x) => (x < 50 ? 10 : -5),
      undefined,
      50,
      0.6,
    );
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] as number;
      const y = positions[i + 1] as number;
      if (x < 50) expect(y).toBeCloseTo(10.6, 4);
      else expect(y).toBeCloseTo(WATER.level + 0.6, 4); // deniz altındaki arazi: su seviyesine sıkışır
    }
  });

  it('hedef il ve komşu il farklı renkte çizilir', () => {
    const region = buildBorderSegments(shape(true), () => 0);
    const neighbor = buildBorderSegments(shape(false), () => 0);
    expect(Array.from(region.colors.slice(0, 3))).not.toEqual(
      Array.from(neighbor.colors.slice(0, 3)),
    );
    expect(region.colors[0]).toBeCloseTo(((BORDERS.regionColor >> 16) & 0xff) / 255, 5);
  });

  it('konum ve renk dizileri aynı köşe sayısında', () => {
    const { positions, colors } = buildBorderSegments(shape(true), () => 0);
    expect(colors.length).toBe(positions.length);
  });
});

describe('ProvinceBorders (gerçek bölge)', () => {
  let region: RegionData;
  let source: RegionHeightSource;
  beforeAll(async () => {
    region = await loadRealRegion();
    source = RegionHeightSource.fromRegion(region);
  });

  it('7 ilin sınırını çizer; toplam parça sayısı makul', () => {
    const data = buildBorderSegments(region.provinces, (x, z) => source.heightAt(x, z));
    expect(data.segments).toBeGreaterThan(500);
    expect(data.segments).toBeLessThan(20000);
  });

  it('açılıp kapanır; kaynaklar dispose edilir', () => {
    const borders = new ProvinceBorders(region.provinces, (x, z) => source.heightAt(x, z));
    expect(borders.visible).toBe(BORDERS.visibleByDefault);
    borders.toggle();
    expect(borders.visible).toBe(!BORDERS.visibleByDefault);
    borders.toggle();
    expect(borders.visible).toBe(BORDERS.visibleByDefault);

    let disposed = 0;
    borders.object.geometry.addEventListener('dispose', () => disposed++);
    borders.dispose();
    expect(disposed).toBe(1);
    expect(borders.object).toBeInstanceOf(THREE.LineSegments);
  });

  it('çizgi köşeleri gerçek arazinin üstündedir (zemin + lift)', () => {
    const data = buildBorderSegments(region.provinces, (x, z) => source.heightAt(x, z));
    for (let i = 0; i < data.positions.length; i += 3 * 41) {
      const x = data.positions[i] as number;
      const y = data.positions[i + 1] as number;
      const z = data.positions[i + 2] as number;
      expect(y).toBeGreaterThanOrEqual(source.heightAt(x, z) + BORDERS.lift - 1e-3);
    }
  });
});
