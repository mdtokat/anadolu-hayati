import { describe, expect, it } from 'vitest';
import { FrameBudget } from '../src/core/FrameBudget';

/** Elle ilerletilen saat. */
function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe('FrameBudget', () => {
  it('süre kaldıkça izin verir, bitince vermez; ilk iş her zaman yapılır', () => {
    const c = clock();
    const b = new FrameBudget(c.now);
    b.begin(4);
    expect(b.allows(0)).toBe(true);
    c.advance(3);
    expect(b.allows(1)).toBe(true);
    c.advance(2);
    expect(b.allows(2)).toBe(false);
    expect(b.allows(0)).toBe(true); // kritik ilk iş
    expect(b.allows(0, 0)).toBe(false); // kritik olmayan iş
    expect(b.exhausted).toBe(true);
    expect(b.deferred).toBe(3);
    expect(b.spentMs).toBe(5);
  });

  it('her kare yeniden açılır', () => {
    const c = clock();
    const b = new FrameBudget(c.now);
    b.begin(4);
    c.advance(10);
    expect(b.exhausted).toBe(true);
    b.begin(4);
    expect(b.exhausted).toBe(false);
    expect(b.deferred).toBe(0);
  });

  it('begin çağrılmadan sınırsızdır (testler, senkron hazırlık)', () => {
    const b = new FrameBudget(() => 1e12);
    expect(b.allows(100, 0)).toBe(true);
    expect(b.exhausted).toBe(false);
  });
});
