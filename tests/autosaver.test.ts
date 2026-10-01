import { describe, expect, it } from 'vitest';
import { Autosaver } from '../src/save/Autosaver';

describe('Autosaver', () => {
  it('aralık dolunca tetikler, sonra sayaç sıfırlanır', () => {
    let calls = 0;
    const a = new Autosaver(10, () => calls++);
    for (let i = 0; i < 9; i++) a.update(1);
    expect(calls).toBe(0);
    a.update(1);
    expect(calls).toBe(1);
    for (let i = 0; i < 20; i++) a.update(1);
    expect(calls).toBe(3);
  });

  it('büyük bir adım tek tetik üretir (birikmiş çoklu kayıt yok)', () => {
    let calls = 0;
    new Autosaver(10, () => calls++).update(35);
    expect(calls).toBe(1);
  });

  it('reset sayacı sıfırlar', () => {
    let calls = 0;
    const a = new Autosaver(10, () => calls++);
    a.update(9);
    a.reset();
    a.update(9);
    expect(calls).toBe(0);
    a.update(1);
    expect(calls).toBe(1);
  });
});
