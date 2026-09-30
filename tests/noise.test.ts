import { describe, expect, it } from 'vitest';
import { fbm2D, valueNoise2D } from '../src/utils/noise';

describe('valueNoise2D', () => {
  it('aynı girdi aynı değeri verir', () => {
    expect(valueNoise2D(3.7, -8.2, 5)).toBe(valueNoise2D(3.7, -8.2, 5));
  });

  it('farklı seed farklı değer verir', () => {
    expect(valueNoise2D(3.7, -8.2, 5)).not.toBe(valueNoise2D(3.7, -8.2, 6));
  });

  it('[-1, 1] aralığında kalır', () => {
    for (let i = 0; i < 2000; i++) {
      const v = valueNoise2D(i * 0.37 - 300, i * 0.91 + 12, 42);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('süreklidir: çok yakın noktalar çok yakın değer verir', () => {
    for (let i = 0; i < 500; i++) {
      const x = i * 0.173;
      const y = i * 0.311;
      expect(Math.abs(valueNoise2D(x, y, 9) - valueNoise2D(x + 1e-4, y, 9))).toBeLessThan(1e-2);
    }
  });
});

describe('fbm2D', () => {
  it('[-1, 1] aralığında ve deterministiktir', () => {
    for (let i = 0; i < 1000; i++) {
      const v = fbm2D(i * 0.13, i * 0.29, 7, 4);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      expect(fbm2D(i * 0.13, i * 0.29, 7, 4)).toBe(v);
    }
  });
});
