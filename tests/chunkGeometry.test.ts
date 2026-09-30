import { beforeAll, describe, expect, it } from 'vitest';
import { CHUNK } from '../src/config';
import type { RegionData } from '../src/data/region';
import { buildChunkMesh } from '../src/world/chunkGeometry';
import { makeChunkGrid, sampleX, sampleZ } from '../src/world/chunks';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealRegion } from './helpers/realRegion';

let region: RegionData;
let source: RegionHeightSource;
let grid: ReturnType<typeof makeChunkGrid>;

beforeAll(async () => {
  region = await loadRealRegion();
  source = RegionHeightSource.fromRegion(region);
  grid = makeChunkGrid(source.width, source.height, source.cell);
});

/** Bir sıra chunk yüzey köşesi: (c, r) → [x, y, z] */
function vertex(
  data: ReturnType<typeof buildChunkMesh>,
  c: number,
  r: number,
): [number, number, number] {
  const i = (r * data.verticesPerSide + c) * 3;
  return [
    data.positions[i] as number,
    data.positions[i + 1] as number,
    data.positions[i + 2] as number,
  ];
}

describe('buildChunkMesh: köşe sayıları', () => {
  it('LOD başına köşe sayısı 129, 65, 33, 17', () => {
    const expected = [129, 65, 33, 17];
    expected.forEach((n, lod) => {
      const data = buildChunkMesh(source, grid, 4, 4, lod);
      expect(data.verticesPerSide).toBe(n);
      expect(data.surfaceVertices).toBe(n * n);
      expect(data.positions.length).toBe((n * n + 4 * n) * 3); // + etek köşeleri
      expect(data.normals.length).toBe(data.positions.length);
    });
  });

  it('indeksler geçerli aralıkta ve Uint16 sınırında', () => {
    const data = buildChunkMesh(source, grid, 4, 4, 0);
    expect(data.positions.length / 3).toBeLessThan(65536);
    const max = data.positions.length / 3;
    for (const index of data.indices) expect(index).toBeLessThan(max);
  });

  it('geçersiz LOD hata verir', () => {
    expect(() => buildChunkMesh(source, grid, 0, 0, 9)).toThrow(RangeError);
  });
});

describe('buildChunkMesh: konum ve yükseklikler', () => {
  it('köşeler heightmap örnekleriyle birebir eşleşir (LOD0)', () => {
    const cx = 5;
    const cy = 4;
    const data = buildChunkMesh(source, grid, cx, cy, 0);
    for (const [c, r] of [
      [0, 0],
      [128, 0],
      [0, 128],
      [128, 128],
      [37, 91],
    ] as const) {
      const col = cx * grid.cells + c;
      const row = cy * grid.cells + r;
      const [x, y, z] = vertex(data, c, r);
      expect(x).toBeCloseTo(sampleX(grid, col), 3);
      expect(z).toBeCloseTo(sampleZ(grid, row), 3);
      expect(y).toBeCloseTo(source.sample(col, row), 4);
      // Dünya konumunda bilinear yükseklikle de tutarlı
      expect(y).toBeCloseTo(source.heightAt(x, z), 3);
    }
  });

  it('kaba LOD köşeleri, ince LOD ile aynı dünya noktalarındadır', () => {
    const fine = buildChunkMesh(source, grid, 6, 3, 0);
    const coarse = buildChunkMesh(source, grid, 6, 3, 2); // stride 4
    const stride = CHUNK.lodStrides[2] as number;
    for (const [c, r] of [
      [0, 0],
      [5, 9],
      [32, 32],
    ] as const) {
      const a = vertex(coarse, c, r);
      const b = vertex(fine, c * stride, r * stride);
      expect(a[0]).toBeCloseTo(b[0], 4);
      expect(a[1]).toBeCloseTo(b[1], 4);
      expect(a[2]).toBeCloseTo(b[2], 4);
    }
  });

  it("komşu chunk'lar ortak kenarda aynı köşelere sahiptir (dikiş yok)", () => {
    const left = buildChunkMesh(source, grid, 5, 4, 0);
    const right = buildChunkMesh(source, grid, 6, 4, 0);
    const bottom = buildChunkMesh(source, grid, 5, 5, 0);
    for (let i = 0; i <= 128; i += 16) {
      const l = vertex(left, 128, i);
      const r = vertex(right, 0, i);
      expect(l[0]).toBeCloseTo(r[0], 4);
      expect(l[1]).toBeCloseTo(r[1], 4);
      expect(l[2]).toBeCloseTo(r[2], 4);
      const t = vertex(left, i, 128);
      const b = vertex(bottom, i, 0);
      expect(t[1]).toBeCloseTo(b[1], 4);
      expect(t[2]).toBeCloseTo(b[2], 4);
    }
  });

  it("komşu chunk'ların ortak kenar normalleri aynıdır (ışık kesintisi yok)", () => {
    const left = buildChunkMesh(source, grid, 5, 4, 0);
    const right = buildChunkMesh(source, grid, 6, 4, 0);
    for (let r = 0; r <= 128; r += 8) {
      const li = (r * left.verticesPerSide + 128) * 3;
      const ri = (r * right.verticesPerSide + 0) * 3;
      for (let k = 0; k < 3; k++)
        expect(left.normals[li + k]).toBeCloseTo(right.normals[ri + k] as number, 5);
    }
  });
});

describe('buildChunkMesh: normaller ve sarım', () => {
  it('normaller birim uzunlukta ve yukarı bakar', () => {
    const data = buildChunkMesh(source, grid, 3, 5, 1);
    for (let i = 0; i < data.surfaceVertices; i++) {
      const nx = data.normals[i * 3] as number;
      const ny = data.normals[i * 3 + 1] as number;
      const nz = data.normals[i * 3 + 2] as number;
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      expect(ny).toBeGreaterThan(0);
    }
  });

  it("yüzey üçgenlerinin hepsi +Y'ye bakar (saat yönünün tersi sarım)", () => {
    const data = buildChunkMesh(source, grid, 7, 4, 0);
    const surfaceIndexCount = (data.verticesPerSide - 1) ** 2 * 6;
    for (let t = 0; t < surfaceIndexCount; t += 3) {
      const [a, b, c] = [data.indices[t], data.indices[t + 1], data.indices[t + 2]].map(
        (v) => (v as number) * 3,
      );
      const p = data.positions;
      const ux = (p[b as number] as number) - (p[a as number] as number);
      const uy = (p[(b as number) + 1] as number) - (p[(a as number) + 1] as number);
      const uz = (p[(b as number) + 2] as number) - (p[(a as number) + 2] as number);
      const vx = (p[c as number] as number) - (p[a as number] as number);
      const vy = (p[(c as number) + 1] as number) - (p[(a as number) + 1] as number);
      const vz = (p[(c as number) + 2] as number) - (p[(a as number) + 2] as number);
      const ny = uz * vx - ux * vz; // (u × v).y
      expect(ny).toBeGreaterThan(0);
      void uy;
      void vy;
    }
  });

  it("gerçek dağlık chunk'ta normaller düz zemin dışına çıkar (eğim yakalanır)", () => {
    // Karabük dağlarına yakın bir chunk: en az bir köşede belirgin eğim
    const data = buildChunkMesh(source, grid, 9, 6, 0);
    let minNy = 1;
    for (let i = 0; i < data.surfaceVertices; i++)
      minNy = Math.min(minNy, data.normals[i * 3 + 1] as number);
    expect(minNy).toBeLessThan(0.9);
  });
});

describe('buildChunkMesh: etekler', () => {
  it('etek köşeleri kenar köşelerinin tam altında, LOD derinliği kadar aşağıdadır', () => {
    for (const lod of [0, 1, 2, 3]) {
      const data = buildChunkMesh(source, grid, 4, 4, lod);
      const n = data.verticesPerSide;
      const depth = CHUNK.skirtDepth[lod] as number;
      // Kuzey etek: ilk n etek köşesi, kuzey kenar köşelerinin kopyaları
      for (let c = 0; c < n; c += Math.max(1, Math.floor(n / 6))) {
        const top = vertex(data, c, 0);
        const i = (data.surfaceVertices + c) * 3;
        expect(data.positions[i]).toBeCloseTo(top[0], 5);
        expect(data.positions[i + 1]).toBeCloseTo(top[1] - depth, 5);
        expect(data.positions[i + 2]).toBeCloseTo(top[2], 5);
      }
    }
  });
});
