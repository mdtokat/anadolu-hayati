import { describe, expect, it } from 'vitest';
import { LANDCOVER_CLASSES, LANDCOVER_VALUE } from '../src/data/landcover';
import {
  buildCoverWeights,
  COVER_CHANNELS_A,
  COVER_CHANNELS_B,
} from '../src/world/landCoverWeights';

describe('buildCoverWeights', () => {
  it('none hiçbir kanalı açmaz', () => {
    const { a, b } = buildCoverWeights(new Uint8Array([LANDCOVER_VALUE.none]));
    expect(Array.from(a)).toEqual([0, 0, 0, 0]);
    expect(Array.from(b)).toEqual([0, 0, 0, 0]);
  });

  it('her sınıf yalnızca kendi kanalını 255 yapar', () => {
    const classes = new Uint8Array(LANDCOVER_CLASSES.map((_, i) => i));
    const { a, b } = buildCoverWeights(classes);
    for (const [value, name] of LANDCOVER_CLASSES.entries()) {
      const ca = COVER_CHANNELS_A.indexOf(name);
      const cb = COVER_CHANNELS_B.indexOf(name);
      const rowA = Array.from(a.slice(value * 4, value * 4 + 4));
      const rowB = Array.from(b.slice(value * 4, value * 4 + 4));
      expect(rowA).toEqual([0, 1, 2, 3].map((c) => (c === ca ? 255 : 0)));
      expect(rowB).toEqual([0, 1, 2, 3].map((c) => (c === cb ? 255 : 0)));
    }
  });

  it('sınıf tablosundaki her none-dışı sınıfın bir kanalı vardır (hiçbiri dışarıda kalmaz)', () => {
    const covered = new Set([...COVER_CHANNELS_A, ...COVER_CHANNELS_B]);
    for (const name of LANDCOVER_CLASSES) {
      if (name !== 'none') expect(covered.has(name)).toBe(true);
    }
    expect(covered.size).toBe(LANDCOVER_CLASSES.length - 1);
  });

  it('çıktı boyutu hücre × 4 ve sıra girdiyle aynı', () => {
    const { a } = buildCoverWeights(
      new Uint8Array([LANDCOVER_VALUE.grass, LANDCOVER_VALUE.forest]),
    );
    expect(a.length).toBe(8);
    expect(a[2]).toBe(255); // ilk hücre: grass → kanal 2
    expect(a[4]).toBe(255); // ikinci hücre: forest → kanal 0
  });
});
