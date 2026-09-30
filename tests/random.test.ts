import { describe, expect, it } from 'vitest';
import { createRandom, seedFrom } from '../src/utils/random';

describe('createRandom', () => {
  it('aynı seed aynı diziyi üretir', () => {
    const a = createRandom(1234);
    const b = createRandom(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('farklı seed farklı dizi üretir', () => {
    expect(createRandom(1).next()).not.toBe(createRandom(2).next());
  });

  it('next() [0, 1) aralığında kalır', () => {
    const r = createRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range() ve int() sınırlara uyar', () => {
    const r = createRandom(99);
    for (let i = 0; i < 1000; i++) {
      const f = r.range(-5, 5);
      expect(f).toBeGreaterThanOrEqual(-5);
      expect(f).toBeLessThan(5);
      const n = r.int(1, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });
});

describe('seedFrom', () => {
  it('aynı girdiler aynı tohumu verir; sonuç 32-bit işaretsiz tamsayıdır', () => {
    expect(seedFrom(1, 2, 3)).toBe(seedFrom(1, 2, 3));
    const v = seedFrom(-5, 70000, 3);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(2 ** 32);
  });

  it('sıra ve girdi sayısı sonucu değiştirir', () => {
    expect(seedFrom(1, 2)).not.toBe(seedFrom(2, 1));
    expect(seedFrom(1)).not.toBe(seedFrom(1, 0));
    expect(seedFrom(0)).not.toBe(seedFrom());
  });

  it('bitişik girdiler çakışmaz (komşu chunk tohumları)', () => {
    const seen = new Set<number>();
    for (let cx = 0; cx < 40; cx++) for (let cy = 0; cy < 40; cy++) seen.add(seedFrom(7, cx, cy));
    expect(seen.size).toBe(1600);
  });

  it('bitişik tohumlardan üretilen diziler ilişkisiz görünür (ortalama ≈ 0,5)', () => {
    let sum = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) sum += createRandom(seedFrom(42, i)).next();
    expect(sum / n).toBeGreaterThan(0.45);
    expect(sum / n).toBeLessThan(0.55);
  });
});
