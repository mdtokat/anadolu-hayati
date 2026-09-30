import { describe, expect, it } from 'vitest';
import { createRandom } from '../src/utils/random';

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
