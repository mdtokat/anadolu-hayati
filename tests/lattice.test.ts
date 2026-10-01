import { beforeAll, describe, expect, it } from 'vitest';
import { CHUNK, HORIZONTAL_SCALE, WORLD } from '../src/config';
import type { RegionData } from '../src/data/region';
import {
  CHUNK_CELLS,
  LATTICE_CELL,
  chunkOf,
  gridOriginOf,
  latticeCol,
  latticeRow,
  latticeX,
  latticeZ,
  tileOf,
  tileRangeOf,
} from '../src/world/lattice';
import { loadRealRegion } from './helpers/realRegion';

/** Faz 7 planında (§1.4) hesaplanan yeni dünya kapsamı. */
const NEW_EXTENT = { col0: -640, row0: 0, cols: 2228, rows: 1962 } as const;
const OLD_EXTENT = { col0: 0, row0: 0, cols: 1588, rows: 1176 } as const;

describe('WORLD sözleşmesi', () => {
  it('kafes sabitleri eski bölgenin kuzeybatı örneği ve oyun ölçeğiyle tutarlıdır', () => {
    expect(LATTICE_CELL).toBe(2);
    expect(100 / HORIZONTAL_SCALE).toBe(LATTICE_CELL);
    expect(WORLD.lattice).toEqual({ anchorX: -1587, anchorZ: -1175 });
    expect(WORLD.id).toBe('bati-karadeniz');
    expect(WORLD.legacyRegionId).toBe('zonguldak-bartin-karabuk');
  });

  it('karo = 4 chunk; chunk sabiti CHUNK.cells ile aynı', () => {
    expect(CHUNK_CELLS).toBe(CHUNK.cells);
    expect(WORLD.tileSize % CHUNK_CELLS).toBe(0);
    expect(WORLD.tileSize / CHUNK_CELLS).toBe(4);
  });
});

describe('kafes matematiği', () => {
  it('eski merkezli formülün özel hâlidir: x = (c − (W−1)/2)·hücre', () => {
    for (const col of [0, 1, 793, 794, 1587]) {
      expect(latticeX(col)).toBe((col - (1588 - 1) / 2) * LATTICE_CELL);
    }
    for (const row of [0, 5, 587, 588, 1175]) {
      expect(latticeZ(row)).toBe((row - (1176 - 1) / 2) * LATTICE_CELL);
    }
  });

  it('dünya orijini (x = 0, z = 0) eski ızgaranın merkezidir; ters dönüşüm tutarlı', () => {
    expect(latticeCol(0)).toBe(793.5);
    expect(latticeRow(0)).toBe(587.5);
    for (const col of [-640, -1, 0, 12, 1587]) expect(latticeCol(latticeX(col))).toBe(col);
    for (const row of [-3, 0, 1961]) expect(latticeRow(latticeZ(row))).toBe(row);
  });

  it('gridOrigin: eski kapsam −1587/−1175, yeni kapsam (batıya 640 örnek) −2867/−1175', () => {
    expect(gridOriginOf(OLD_EXTENT)).toEqual({ x: -1587, z: -1175 });
    expect(gridOriginOf(NEW_EXTENT)).toEqual({ x: -2867, z: -1175 });
  });

  it('karo ve chunk: negatif indeks sıfıra değil aşağı yuvarlanır', () => {
    expect(tileOf(0, 0)).toEqual({ tx: 0, ty: 0 });
    expect(tileOf(511, 511)).toEqual({ tx: 0, ty: 0 });
    expect(tileOf(512, 1024)).toEqual({ tx: 1, ty: 2 });
    expect(tileOf(-1, -1)).toEqual({ tx: -1, ty: -1 });
    expect(tileOf(-640, 0)).toEqual({ tx: -2, ty: 0 });
    expect(chunkOf(-1, 0)).toEqual({ cx: -1, cy: 0 });
    expect(chunkOf(-640, 1961)).toEqual({ cx: -5, cy: 15 });
    expect(chunkOf(1587, 1175)).toEqual({ cx: 12, cy: 9 });
  });

  it('karo aralığı: eski bölge 4 × 3 = 12, yeni dünya 6 × 4 = 24 karo', () => {
    expect(tileRangeOf(OLD_EXTENT)).toEqual({ tx0: 0, tx1: 3, ty0: 0, ty1: 2 });
    const r = tileRangeOf(NEW_EXTENT);
    expect(r).toEqual({ tx0: -2, tx1: 3, ty0: 0, ty1: 3 });
    expect((r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1)).toBe(24);
  });

  it('yeni dünya sayıları plandaki hesapla uyuşur (4,37 M örnek, 18 × 16 chunk)', () => {
    expect(NEW_EXTENT.cols * NEW_EXTENT.rows).toBeCloseTo(4.37e6, -4);
    expect(Math.abs(NEW_EXTENT.col0 % CHUNK_CELLS)).toBe(0); // batı kenar chunk'a hizalı
    expect(Math.ceil(NEW_EXTENT.cols / CHUNK_CELLS)).toBe(18);
    expect(Math.ceil(NEW_EXTENT.rows / CHUNK_CELLS)).toBe(16);
  });
});

describe('gerçek eski bölge', () => {
  let region: RegionData;
  beforeAll(async () => {
    region = await loadRealRegion();
  }, 60_000);

  it('parseMeta eski (merkezli) veride gridOrigin’i kafes çapasına eşit türetir', () => {
    expect(region.meta.gridWidth).toBe(OLD_EXTENT.cols);
    expect(region.meta.gridHeight).toBe(OLD_EXTENT.rows);
    expect(region.meta.gridOrigin).toEqual(gridOriginOf(OLD_EXTENT));
    expect(region.meta.gridOrigin).toEqual({ x: WORLD.lattice.anchorX, z: WORLD.lattice.anchorZ });
  });
});
