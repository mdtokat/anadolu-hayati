import { describe, expect, it } from 'vitest';
import { smoothLand } from '../src/world/terrainSmoothing';

describe('smoothLand (arazi yumuşatma)', () => {
  it('kısa dalgaları söndürür, deniz hücrelerine dokunmaz', () => {
    const width = 40;
    const height = 20;
    const values = new Float32Array(width * height);
    const land = (i: number) => i % width >= 5;
    for (let i = 0; i < values.length; i++) {
      const c = i % width;
      values[i] = land(i) ? 20 + (c % 2 === 0 ? 3 : -3) : -1;
    }
    smoothLand(values, width, height, land, 1.3);
    for (let r = 2; r < height - 2; r++) {
      for (let c = 10; c < width - 4; c++) {
        expect(Math.abs((values[r * width + c] as number) - 20)).toBeLessThan(0.5);
      }
      for (let c = 0; c < 5; c++) expect(values[r * width + c]).toBe(-1);
    }
  });

  it('kara değeri kara komşularının aralığında kalır (deniz ortalamaya girmez)', () => {
    const width = 10;
    const height = 10;
    const values = new Float32Array(width * height).fill(0.5);
    const land = (i: number) => i % width !== 0;
    for (let r = 0; r < height; r++) values[r * width] = -4;
    smoothLand(values, width, height, land, 2);
    for (let i = 0; i < values.length; i++) {
      if (land(i)) expect(values[i]).toBeCloseTo(0.5, 5);
    }
  });

  it('güç 0 ya da sapma 0 iken değişmez', () => {
    const values = Float32Array.from([1, 5, 1, 5, 1, 5, 1, 5, 1]);
    const copy = values.slice();
    smoothLand(values, 3, 3, () => true, 0);
    smoothLand(values, 3, 3, () => true, 1, 0);
    expect(values).toEqual(copy);
  });
});
