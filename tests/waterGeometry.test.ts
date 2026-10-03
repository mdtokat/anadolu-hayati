import { beforeAll, describe, expect, it } from 'vitest';
import type { RegionData, WaterPolygon } from '../src/data/region';
import { buildLakeMeshes, type MeshData } from '../src/world/waterGeometry';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealRegion } from './helpers/realRegion';

const flat = () => 5;

/** t. indeksten başlayan üçgenin köşe indeksleri. */
function triangle(mesh: MeshData, t: number): [number, number, number] {
  return [mesh.indices[t] as number, mesh.indices[t + 1] as number, mesh.indices[t + 2] as number];
}

const polygon = (...rings: number[][]): WaterPolygon => {
  const arrays = rings.map((r) => Float64Array.from(r));
  const outer = arrays[0] as Float64Array;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < outer.length; i += 2) {
    minX = Math.min(minX, outer[i] as number);
    maxX = Math.max(maxX, outer[i] as number);
    minZ = Math.min(minZ, outer[i + 1] as number);
    maxZ = Math.max(maxZ, outer[i + 1] as number);
  }
  return { kind: 'lake', rings: arrays, bounds: { minX, minZ, maxX, maxZ } };
};

/** Üçgenlerin yukarı (+Y) baktığını denetler: (b−a)×(c−a) için y bileşeni > 0. */
function allFaceUp(mesh: MeshData): boolean {
  const p = mesh.positions;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = triangle(mesh, t);
    const ux = (p[b * 3] as number) - (p[a * 3] as number);
    const uz = (p[b * 3 + 2] as number) - (p[a * 3 + 2] as number);
    const vx = (p[c * 3] as number) - (p[a * 3] as number);
    const vz = (p[c * 3 + 2] as number) - (p[a * 3 + 2] as number);
    // Veri hattının ürettiği çok ince üçgenler (alan ≈ 0) yok sayılır: Faz 12 dünyasında 69 377 üçgenden 2'si −0,005 m².
    if (uz * vx - ux * vz < -0.05) return false;
  }
  return true;
}

describe('buildLakeMeshes', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10, 0, 0];

  it('kare göl: 4 köşe, 2 üçgen, düz seviye, yukarı bakar', () => {
    const mesh = buildLakeMeshes([polygon(square)], flat, 0.1);
    expect(mesh.positions.length / 3).toBe(4);
    expect(mesh.indices.length).toBe(6);
    for (let i = 0; i < 4; i++) expect(mesh.positions[i * 3 + 1]).toBeCloseTo(5.1, 5);
    expect(allFaceUp(mesh)).toBe(true);
  });

  it('ters sarımlı halka da yukarı bakan üçgenler verir', () => {
    const reversed = [0, 0, 0, 10, 10, 10, 10, 0, 0, 0];
    const mesh = buildLakeMeshes([polygon(reversed)], flat, 0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(allFaceUp(mesh)).toBe(true);
  });

  it('delikli çokgen: delik alanı üçgenlenmez', () => {
    const hole = [4, 4, 6, 4, 6, 6, 4, 6, 4, 4];
    const mesh = buildLakeMeshes([polygon(square, hole)], flat, 0);
    // Toplam üçgen alanı = 100 − 4
    let area = 0;
    const p = mesh.positions;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = triangle(mesh, t);
      area +=
        Math.abs(
          ((p[b * 3] as number) - (p[a * 3] as number)) *
            ((p[c * 3 + 2] as number) - (p[a * 3 + 2] as number)) -
            ((p[b * 3 + 2] as number) - (p[a * 3 + 2] as number)) *
              ((p[c * 3] as number) - (p[a * 3] as number)),
        ) / 2;
    }
    expect(area).toBeCloseTo(96, 4);
  });

  it('seviye kıyı yüksekliklerinin ortancasıdır (tek tepe değeri aykırı ise etkilemez)', () => {
    const heights = (x: number, z: number) => (x === 10 && z === 10 ? 500 : 2);
    const mesh = buildLakeMeshes([polygon(square)], heights, 0);
    expect(mesh.positions[1]).toBeCloseTo(2, 5);
  });

  it('dejenere çokgen (3 noktadan az / sıfır alan) atlanır', () => {
    const mesh = buildLakeMeshes(
      [polygon([0, 0, 1, 1, 0, 0]), polygon([0, 0, 5, 0, 10, 0, 0, 0])],
      flat,
      0,
    );
    expect(mesh.indices.length).toBe(0);
  });
});

describe('gerçek bölge verisi', () => {
  let region: RegionData;
  let source: RegionHeightSource;

  beforeAll(async () => {
    region = await loadRealRegion();
    source = RegionHeightSource.fromRegion(region);
  });

  it('tüm göller üçgenlenir; indeksler geçerli, üçgenler yukarı bakar', () => {
    const water = region.features?.water;
    expect(water).toBeTruthy();
    if (!water) return;
    const heightAt = (x: number, z: number) => source.heightAt(x, z);

    const lakes = buildLakeMeshes(water.polygons, heightAt, 0.12);
    expect(lakes.indices.length).toBeGreaterThan(30);
    const lakeVertices = lakes.positions.length / 3;
    expect(lakes.indices.filter((index) => index >= lakeVertices).length).toBe(0);
    expect(allFaceUp(lakes)).toBe(true);
  });
});
