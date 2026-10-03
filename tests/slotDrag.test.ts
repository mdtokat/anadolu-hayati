import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, dragOutcome, dragStarted } from '../src/ui/slotDrag';

describe('envanter sürükle-bırak', () => {
  it('başka slota bırakmak taşır', () => {
    expect(dragOutcome(2, { kind: 'slot', index: 5 })).toEqual({ action: 'move', from: 2, to: 5 });
  });

  it('aynı slota bırakmak hiçbir şey yapmaz', () => {
    expect(dragOutcome(2, { kind: 'slot', index: 2 })).toEqual({ action: 'none' });
  });

  it('panel içi boşluğa bırakmak hiçbir şey yapmaz', () => {
    expect(dragOutcome(2, { kind: 'panel' })).toEqual({ action: 'none' });
  });

  it('panel dışına bırakmak yığını atar', () => {
    expect(dragOutcome(7, { kind: 'outside' })).toEqual({ action: 'drop', from: 7 });
  });

  it('küçük kıpırdama sürükleme sayılmaz (tıklama korunur)', () => {
    expect(dragStarted(2, 2)).toBe(false);
    expect(dragStarted(DRAG_THRESHOLD, 0)).toBe(false);
    expect(dragStarted(DRAG_THRESHOLD + 1, 0)).toBe(true);
  });
});
