import { beforeAll, describe, expect, it } from 'vitest';
import type { RegionData, WaterLine, WaterPolygon } from '../src/data/region';
import { buildLakeMeshes, buildRiverRibbons, type MeshData } from '../src/world/waterGeometry';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealRegion } from './helpers/realRegion';

const flat = () => 5;

/** t. indeksten başlayan üçgenin köşe indeksleri. */
function triangle(mesh: MeshData, t: number): [number, number, number] {
  return [mesh.indices[t] as number, mesh.indices[t + 1] as number, mesh.indices[t + 2] as number];
}

const line = (coords: number[], kind: WaterLine['kind'] = 'river'): WaterLine => ({
  kind,
  intermittent: false,
  xz: Float64Array.from(coords),
});

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
    if (uz * vx - ux * vz <= 0) return false;
  }
  return true;
}

/** Aşağı bakan (katlanmış) üçgenlerin oranı. */
function foldedFraction(mesh: MeshData): number {
  const p = mesh.positions;
  let folded = 0;
  const count = mesh.indices.length / 3;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = triangle(mesh, t);
    const ux = (p[b * 3] as number) - (p[a * 3] as number);
    const uz = (p[b * 3 + 2] as number) - (p[a * 3 + 2] as number);
    const vx = (p[c * 3] as number) - (p[a * 3] as number);
    const vz = (p[c * 3 + 2] as number) - (p[a * 3 + 2] as number);
    if (uz * vx - ux * vz <= 0) folded++;
  }
  return count === 0 ? 0 : folded / count;
}

describe('buildRiverRibbons', () => {
  it('düz çizgi: iki köşe/kesit, genişlik kadar ayrık, yüksekliği zemin + lift', () => {
    const mesh = buildRiverRibbons([line([0, 0, 10, 0])], flat, () => 3, 0.12);
    expect(mesh.positions.length / 3).toBe(4);
    expect(mesh.indices.length).toBe(6);
    // sol ve sağ köşe arası 3 m
    const [lx, , lz, rx, , rz] = mesh.positions;
    expect(
      Math.hypot((lx as number) - (rx as number), (lz as number) - (rz as number)),
    ).toBeCloseTo(3, 5);
    for (let i = 0; i < 4; i++) expect(mesh.positions[i * 3 + 1]).toBeCloseTo(5.12, 5);
  });

  it('üçgenler yukarı bakar (her yönde çizgi için)', () => {
    for (const coords of [
      [0, 0, 10, 0],
      [10, 0, 0, 0],
      [0, 0, 0, 10],
      [0, 10, 0, 0],
      [0, 0, 10, 0, 10, 10, 0, 10],
    ]) {
      const mesh = buildRiverRibbons([line(coords)], flat, () => 2, 0);
      expect(mesh.indices.length).toBeGreaterThan(0);
      expect(allFaceUp(mesh)).toBe(true);
    }
  });

  it('yamaç kesitinde şerit gömülmez: sol/sağ köşe en yüksek zemin yüksekliğinde', () => {
    const slope = (_x: number, z: number) => z * 0.5; // güneye doğru yükselir
    const mesh = buildRiverRibbons([line([0, 0, 10, 0])], slope, () => 4, 0);
    // Kesit köşeleri z = ±2 → zemin −1 ve +1; şerit y = 1 (en yüksek)
    for (let i = 0; i < 4; i++) expect(mesh.positions[i * 3 + 1]).toBeCloseTo(1, 5);
  });

  it('tekrar eden noktalar ve tek noktalı çizgiler atlanır', () => {
    const mesh = buildRiverRibbons(
      [line([1, 1, 1, 1]), line([0, 0, 0, 0, 5, 0])],
      flat,
      () => 2,
      0,
    );
    expect(mesh.positions.length / 3).toBe(4);
  });

  it('keskin dönüşte şerit sınırlı genişler (sivrilme yok)', () => {
    // Neredeyse geri dönen çizgi: köşe normalleri çok kısalır
    const mesh = buildRiverRibbons([line([0, 0, 10, 0, 0, 0.2])], flat, () => 2, 0);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(Math.abs(mesh.positions[i] as number)).toBeLessThan(100);
      expect(Math.abs(mesh.positions[i + 2] as number)).toBeLessThan(100);
    }
  });
});

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

  it('tüm nehirler ve göller üçgenlenir; indeksler geçerli, üçgenler yukarı bakar', () => {
    const water = region.features?.water;
    expect(water).toBeTruthy();
    if (!water) return;
    const heightAt = (x: number, z: number) => source.heightAt(x, z);

    const ribbons = buildRiverRibbons(water.lines, heightAt, () => 1.5, 0.12);
    expect(ribbons.indices.length).toBeGreaterThan(1000);
    const vertexCount = ribbons.positions.length / 3;
    for (const index of ribbons.indices) expect(index).toBeLessThan(vertexCount);
    for (const value of ribbons.positions) expect(Number.isFinite(value)).toBe(true);
    // Keskin meandrların iç tarafında birkaç üçgen katlanır (FrontSide ile çizilmez); oran küçük kalmalı.
    expect(foldedFraction(ribbons)).toBeLessThan(0.05);

    const lakes = buildLakeMeshes(water.polygons, heightAt, 0.12);
    expect(lakes.indices.length).toBeGreaterThan(30);
    const lakeVertices = lakes.positions.length / 3;
    for (const index of lakes.indices) expect(index).toBeLessThan(lakeVertices);
    expect(allFaceUp(lakes)).toBe(true);
  });
});
