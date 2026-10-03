import { describe, expect, it } from 'vitest';
import { SCATTER } from '../src/config';
import { thinningRoll } from '../src/world/PropLayer';

describe('nesne seyreltme zarı (ağaçlar çok sık)', () => {
  it('deterministik, [0, 1) aralığında ve tekdüze', () => {
    let below = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const r = thinningRoll(1234 + (i % 37), i);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      if (r < 0.4) below++;
    }
    expect(below / n).toBeGreaterThan(0.37);
    expect(below / n).toBeLessThan(0.43);
    expect(thinningRoll(5, 9)).toBe(thinningRoll(5, 9));
  });

  it('ağaçlar seyreltilir, toplanabilir bitkiler seyreltilmez', () => {
    expect(SCATTER.thinning.tree_broadleaf).toBeGreaterThan(0);
    expect(SCATTER.thinning.tree_conifer).toBeGreaterThan(0);
    expect(SCATTER.thinning.berry_bush ?? 0).toBe(0);
    expect(SCATTER.thinning.stick ?? 0).toBe(0);
  });
});
