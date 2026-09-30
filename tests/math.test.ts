import { describe, expect, it } from 'vitest';
import { clamp, lerp } from '../src/utils/math';

describe('clamp', () => {
  it('aralık içindeki değeri değiştirmez', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('alt ve üst sınıra sıkıştırır', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('uç noktaları verir', () => {
    expect(lerp(2, 8, 0)).toBe(2);
    expect(lerp(2, 8, 1)).toBe(8);
  });
  it('ara değeri hesaplar', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });
});
