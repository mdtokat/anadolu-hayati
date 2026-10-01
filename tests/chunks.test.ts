import { describe, expect, it } from 'vitest';
import { CHUNK } from '../src/config';
import {
  chunkIndexAt,
  chunkKey,
  chunkRect,
  chunksWithin,
  distanceToChunk,
  lodForDistance,
  makeChunkGrid,
  sampleX,
  sampleZ,
} from '../src/world/chunks';

/** Gerçek bölge boyutları: 1588×1176 örnek, hücre 2 oyun m. */
const grid = makeChunkGrid(1588, 1176, 2);

describe('makeChunkGrid', () => {
  it("gerçek bölge için 13 × 10 chunk verir (kısmi kenar chunk'ları dahil)", () => {
    expect(grid.cols).toBe(13); // ceil(1587 / 128) = 13
    expect(grid.rows).toBe(10); // ceil(1175 / 128) = 10
    expect(grid.cells).toBe(128);
  });

  it('tam bölünen ızgarada kısmi chunk oluşturmaz', () => {
    const g = makeChunkGrid(257, 129, 2); // 2 × 1 chunk
    expect(g.cols).toBe(2);
    expect(g.rows).toBe(1);
  });
});

describe('örnek ve chunk konumları', () => {
  it('sampleX/sampleZ orijin etrafında simetriktir', () => {
    expect(sampleX(grid, 0)).toBeCloseTo(-sampleX(grid, grid.sampleWidth - 1));
    expect(sampleZ(grid, 0)).toBeCloseTo(-sampleZ(grid, grid.sampleHeight - 1));
    expect(sampleX(grid, 1) - sampleX(grid, 0)).toBeCloseTo(2);
  });

  it("komşu chunk'lar kenarda birleşir (boşluk/örtüşme yok)", () => {
    for (const [cx, cy] of [
      [0, 0],
      [5, 4],
      [11, 8],
    ] as const) {
      expect(chunkRect(grid, cx, cy).maxX).toBeCloseTo(chunkRect(grid, cx + 1, cy).minX);
      expect(chunkRect(grid, cx, cy).maxZ).toBeCloseTo(chunkRect(grid, cx, cy + 1).minZ);
    }
  });

  it('chunkKey her chunk için benzersizdir', () => {
    const keys = new Set<number>();
    for (let cy = 0; cy < grid.rows; cy++)
      for (let cx = 0; cx < grid.cols; cx++) keys.add(chunkKey(cx, cy));
    expect(keys.size).toBe(grid.cols * grid.rows);
  });
});

describe('chunkIndexAt', () => {
  it("konumu içeren chunk'ı verir (her chunk'ın merkezi kendisine düşer)", () => {
    for (let cy = 0; cy < grid.rows; cy++) {
      for (let cx = 0; cx < grid.cols; cx++) {
        const r = chunkRect(grid, cx, cy);
        const idx = chunkIndexAt(grid, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2);
        expect(idx).toEqual({ cx, cy });
      }
    }
  });

  it("kapsam dışını en yakın kenar chunk'ına sıkıştırır", () => {
    expect(chunkIndexAt(grid, -1e6, -1e6)).toEqual({ cx: 0, cy: 0 });
    expect(chunkIndexAt(grid, 1e6, 1e6)).toEqual({ cx: grid.cols - 1, cy: grid.rows - 1 });
  });

  it("orijin (0,0) orta chunk'tadır", () => {
    const idx = chunkIndexAt(grid, 0, 0);
    expect(idx.cx).toBe(Math.floor((grid.sampleWidth - 1) / 2 / grid.cells));
    expect(idx.cy).toBe(Math.floor((grid.sampleHeight - 1) / 2 / grid.cells));
  });
});

describe('distanceToChunk / chunksWithin', () => {
  it('içerdeki nokta için 0, dışarıdakinde kenara olan uzaklık', () => {
    const r = chunkRect(grid, 6, 4);
    expect(distanceToChunk(grid, 6, 4, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2)).toBe(0);
    expect(distanceToChunk(grid, 6, 4, r.maxX + 30, (r.minZ + r.maxZ) / 2)).toBeCloseTo(30);
    // Köşeye çapraz uzaklık
    expect(distanceToChunk(grid, 6, 4, r.maxX + 30, r.maxZ + 40)).toBeCloseTo(50);
  });

  it('chunksWithin: küçük yarıçapta yalnızca yakınlar, çok büyükte hepsi', () => {
    const near = chunksWithin(grid, 0, 0, 10);
    expect(near.length).toBeGreaterThanOrEqual(1);
    expect(near.length).toBeLessThanOrEqual(4); // chunk kesişiminde en çok 4
    expect(chunksWithin(grid, 0, 0, 1e6)).toHaveLength(grid.cols * grid.rows);
  });

  it('viewDistance bölgenin tamamını (köşe hariç) kapsar', () => {
    const count = chunksWithin(grid, 0, 0, CHUNK.viewDistance).length;
    expect(count).toBe(grid.cols * grid.rows);
  });
});

describe('lodForDistance', () => {
  const [d1, d2, d3] = CHUNK.lodDistances;

  it('eşiklere göre LOD seçer', () => {
    expect(lodForDistance(0)).toBe(0);
    expect(lodForDistance(d1 - 1)).toBe(0);
    expect(lodForDistance(d1 + 1)).toBe(1);
    expect(lodForDistance(d2 + 1)).toBe(2);
    expect(lodForDistance(d3 + 1)).toBe(3);
    expect(lodForDistance(1e6)).toBe(3);
  });

  it('histerezis: eşik civarında sürekli değişmez', () => {
    let lod = lodForDistance(d1 - 20); // 0
    const seen = new Set<number>();
    // Eşiğin iki yanında ±5% salınım
    for (let i = 0; i < 40; i++) {
      lod = lodForDistance(d1 * (1 + (i % 2 ? 0.05 : -0.05)), lod);
      seen.add(lod);
    }
    expect(seen.size).toBe(1);
  });

  it('histerezis payı aşılınca yine geçer (kaba ve ince yönde)', () => {
    let lod = 0;
    lod = lodForDistance(d1 * (1 + CHUNK.lodHysteresis) + 1, lod);
    expect(lod).toBe(1);
    lod = lodForDistance(d1 * (1 - CHUNK.lodHysteresis) - 1, lod);
    expect(lod).toBe(0);
  });

  it('çok uzaktan çok yakına inerken birden fazla LOD atlayabilir', () => {
    expect(lodForDistance(0, 3)).toBe(0);
    expect(lodForDistance(1e6, 0)).toBe(3);
  });
});
