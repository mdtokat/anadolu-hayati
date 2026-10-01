import { beforeAll, describe, expect, it } from 'vitest';
import { CHUNK } from '../src/config';
import { MAX_CREATURES_PER_CELL } from '../src/creatures/species';
import { makeSpawnGrid } from '../src/creatures/spawn';
import type { RegionData } from '../src/data/region';
import {
  CHUNK_KEY_BIAS,
  CREATURE_ID_STRIDE,
  LEGACY,
  PROP_ID_STRIDE,
  absoluteChunkKey,
  absoluteCreatureId,
  absolutePropId,
  decodeAbsoluteChunkKey,
  decodeAbsolutePropId,
  legacyCellKeyToAbsolute,
  legacyChunkKeyToAbsolute,
  legacyPropIdToAbsolute,
} from '../src/world/chunkKeys';
import { chunkKey, chunkRect, makeChunkGrid } from '../src/world/chunks';
import { PROP_INDEX_LIMIT } from '../src/world/propIndex';
import { latticeX, latticeZ } from '../src/world/lattice';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealRegion } from './helpers/realRegion';

/** Faz 6 (v1) şeması: anahtar `cy · cols + cx` (7.5'te koddan kalktı; göç testleri için burada). */
function legacyKey(cols: number, cx: number, cy: number): number {
  return cy * cols + cx;
}

describe('mutlak chunk anahtarı', () => {
  it('gidiş-dönüş: negatif ve büyük koordinatlar dahil', () => {
    for (const [cx, cy] of [
      [0, 0],
      [-5, 0],
      [3, -2],
      [17, 15],
      [-CHUNK_KEY_BIAS, CHUNK_KEY_BIAS - 1],
      [CHUNK_KEY_BIAS - 1, -CHUNK_KEY_BIAS],
    ] as const) {
      expect(decodeAbsoluteChunkKey(absoluteChunkKey(cx, cy))).toEqual({ cx, cy });
    }
  });

  it('geniş bir pencerede tekildir ve işaretsiz 32 bit içindedir', () => {
    const seen = new Set<number>();
    for (let cy = -40; cy <= 60; cy++) {
      for (let cx = -40; cx <= 60; cx++) {
        const key = absoluteChunkKey(cx, cy);
        expect(key).toBeGreaterThanOrEqual(0);
        expect(key).toBeLessThan(2 ** 32);
        seen.add(key);
      }
    }
    expect(seen.size).toBe(101 * 101);
  });

  it('aralık dışı ya da tam sayı olmayan koordinatı reddeder', () => {
    expect(() => absoluteChunkKey(CHUNK_KEY_BIAS, 0)).toThrow(RangeError);
    expect(() => absoluteChunkKey(0, -CHUNK_KEY_BIAS - 1)).toThrow(RangeError);
    expect(() => absoluteChunkKey(1.5, 0)).toThrow(RangeError);
    expect(() => decodeAbsoluteChunkKey(-1)).toThrow(RangeError);
    expect(() => decodeAbsoluteChunkKey(2 ** 32)).toThrow(RangeError);
  });

  it('anahtar ızgara boyutundan bağımsızdır (eski anahtar cols’a bağlıydı)', () => {
    const wide = makeChunkGrid(2228, 1962, 2);
    const narrow = makeChunkGrid(1588, 1176, 2);
    expect(legacyKey(wide.cols, 2, 3)).not.toBe(legacyKey(narrow.cols, 2, 3)); // eski şema: kayar
    expect(chunkKey(2, 3)).toBe(absoluteChunkKey(2, 3)); // yeni şema: sabit
  });
});

describe('nesne ve canlı kimlikleri', () => {
  it('basamaklar mevcut sabitlerle aynıdır', () => {
    expect(PROP_ID_STRIDE).toBe(PROP_INDEX_LIMIT);
    expect(CREATURE_ID_STRIDE).toBe(MAX_CREATURES_PER_CELL);
  });

  it('nesne kimliği gidiş-dönüş yapar ve güvenli tam sayıdır (en uç chunk dahil)', () => {
    for (const [cx, cy, index] of [
      [0, 0, 0],
      [-5, 2, 4095],
      [CHUNK_KEY_BIAS - 1, CHUNK_KEY_BIAS - 1, PROP_ID_STRIDE - 1],
      [-CHUNK_KEY_BIAS, -CHUNK_KEY_BIAS, 0],
    ] as const) {
      const key = absoluteChunkKey(cx, cy);
      const id = absolutePropId(key, index);
      expect(Number.isSafeInteger(id)).toBe(true);
      expect(decodeAbsolutePropId(id)).toEqual({ chunkKey: key, index });
    }
    expect(() => absolutePropId(absoluteChunkKey(0, 0), PROP_ID_STRIDE)).toThrow(RangeError);
    expect(() => absolutePropId(-1, 0)).toThrow(RangeError);
  });

  it('canlı kimliği güvenli tam sayıdır ve doğma hücresi anahtarını taşır', () => {
    const cell = absoluteChunkKey(-3, 7);
    const id = absoluteCreatureId(cell, 255);
    expect(Number.isSafeInteger(id)).toBe(true);
    expect(Math.floor(id / CREATURE_ID_STRIDE)).toBe(cell);
    expect(id % CREATURE_ID_STRIDE).toBe(255);
    expect(() => absoluteCreatureId(cell, CREATURE_ID_STRIDE)).toThrow(RangeError);
  });
});

describe('Faz 6 (v1) kimliklerinin göçü', () => {
  let region: RegionData;
  beforeAll(async () => {
    region = await loadRealRegion();
  }, 60_000);

  it('LEGACY sabitleri gerçek eski ızgarayla uyuşur (13 × 10 chunk ve doğma hücresi)', () => {
    const source = RegionHeightSource.fromRegion(region);
    const chunks = makeChunkGrid(source.width, source.height, source.cell);
    const spawn = makeSpawnGrid(source.bounds);
    expect([chunks.cols, chunks.rows]).toEqual([LEGACY.chunkCols, LEGACY.chunkRows]);
    expect([spawn.cols, spawn.rows]).toEqual([LEGACY.spawnCols, LEGACY.spawnRows]);
    expect(CHUNK.cells * source.cell).toBe(spawn.size); // doğma hücresi ≡ chunk
  });

  it('eski chunk (cx, cy) kafes çapasıyla aynı konumdadır: x/z kenarları kafes formülüyle eşit', () => {
    const source = RegionHeightSource.fromRegion(region);
    const grid = makeChunkGrid(source.width, source.height, source.cell);
    for (let cy = 0; cy < grid.rows; cy++) {
      for (let cx = 0; cx < grid.cols; cx++) {
        const rect = chunkRect(grid, cx, cy);
        expect(rect.minX).toBe(latticeX(cx * CHUNK.cells));
        expect(rect.minZ).toBe(latticeZ(cy * CHUNK.cells));
      }
    }
  });

  it('130 eski chunk anahtarı eksiksiz ve tekil biçimde aynı (cx, cy)’ye taşınır', () => {
    const source = RegionHeightSource.fromRegion(region);
    const grid = makeChunkGrid(source.width, source.height, source.cell);
    const seen = new Set<number>();
    for (let cy = 0; cy < grid.rows; cy++) {
      for (let cx = 0; cx < grid.cols; cx++) {
        const mapped = legacyChunkKeyToAbsolute(legacyKey(grid.cols, cx, cy));
        expect(mapped).toBe(absoluteChunkKey(cx, cy));
        seen.add(mapped as number);
      }
    }
    expect(seen.size).toBe(LEGACY.chunkCols * LEGACY.chunkRows);
  });

  it('eski nesne ve doğma hücresi kimlikleri aynı (chunk, indeks)’e çözülür', () => {
    const source = RegionHeightSource.fromRegion(region);
    const grid = makeChunkGrid(source.width, source.height, source.cell);
    const spawn = makeSpawnGrid(source.bounds);
    const oldProp = legacyKey(grid.cols, 7, 4) * PROP_INDEX_LIMIT + 1234;
    const mapped = legacyPropIdToAbsolute(oldProp) as number;
    const decoded = decodeAbsolutePropId(mapped);
    expect(decodeAbsoluteChunkKey(decoded.chunkKey)).toEqual({ cx: 7, cy: 4 });
    expect(decoded.index).toBe(1234);

    const oldCell = legacyKey(spawn.cols, 12, 9);
    expect(legacyCellKeyToAbsolute(oldCell)).toBe(absoluteChunkKey(12, 9));
    // eski canlı kimliği (`hücre · 256 + sıra`) de aynı hücreyi gösterir
    expect(Math.floor((oldCell * MAX_CREATURES_PER_CELL + 5) / CREATURE_ID_STRIDE)).toBe(oldCell);
  });

  it('eski ızgara dışındaki ya da bozuk değerler null verir (göç bunları atar)', () => {
    const outside = LEGACY.chunkCols * LEGACY.chunkRows;
    expect(legacyChunkKeyToAbsolute(outside)).toBeNull();
    expect(legacyChunkKeyToAbsolute(-1)).toBeNull();
    expect(legacyChunkKeyToAbsolute(1.5)).toBeNull();
    expect(legacyCellKeyToAbsolute(outside)).toBeNull();
    expect(legacyPropIdToAbsolute(outside * PROP_ID_STRIDE)).toBeNull();
    expect(legacyPropIdToAbsolute(-5)).toBeNull();
    expect(legacyPropIdToAbsolute(Number.NaN)).toBeNull();
  });
});
