import { describe, expect, it, vi } from 'vitest';
import { GameLoop } from '../src/core/GameLoop';

const STEP = 1 / 60;

function makeLoop(maxFrameTime = 0.25) {
  const update = vi.fn();
  const render = vi.fn();
  const loop = new GameLoop({ update, render }, STEP, maxFrameTime);
  return { loop, update, render };
}

describe('GameLoop', () => {
  it('bir adımdan kısa süre mantığı çalıştırmaz ama render eder', () => {
    const { loop, update, render } = makeLoop();
    expect(loop.advance(STEP / 2)).toBe(0);
    expect(update).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]?.[0]).toBeCloseTo(0.5);
  });

  it('geçen süreye göre sabit sayıda adım çalıştırır', () => {
    const { loop, update } = makeLoop();
    expect(loop.advance(STEP * 3)).toBe(3);
    expect(update).toHaveBeenCalledTimes(3);
    for (const call of update.mock.calls) expect(call[0]).toBe(STEP);
  });

  it('artan süreyi biriktirir (aralıklı kareler toplamda doğru adım verir)', () => {
    const { loop, update } = makeLoop();
    for (let i = 0; i < 6; i++) loop.advance(STEP / 2);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it('uzun kareyi maxFrameTime ile sınırlar (ölüm sarmalı önlemi)', () => {
    const { loop } = makeLoop(0.1);
    // 0.1 s / (1/60) = 6 adım
    expect(loop.advance(30)).toBe(6);
  });

  it('negatif süreyi yok sayar', () => {
    const { loop, update } = makeLoop();
    expect(loop.advance(-1)).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('alpha her zaman [0, 1) aralığındadır', () => {
    const { loop, render } = makeLoop();
    for (let i = 0; i < 200; i++) loop.advance(0.0137);
    for (const call of render.mock.calls) {
      const alpha = call[0] as number;
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });
});
