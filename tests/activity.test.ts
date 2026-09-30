import { describe, expect, it } from 'vitest';
import type { MoveIntent } from '../src/core/inputMapping';
import { activityFromIntent, gateIntent, isMoving } from '../src/survival/activity';

const intent = (patch: Partial<MoveIntent> = {}): MoveIntent => ({
  forward: 0,
  strafe: 0,
  run: false,
  jump: false,
  ...patch,
});

describe('isMoving', () => {
  it('hareket tuşu yoksa false, ileri/geri/yan ise true', () => {
    expect(isMoving(intent())).toBe(false);
    expect(isMoving(intent({ forward: 1 }))).toBe(true);
    expect(isMoving(intent({ forward: -1 }))).toBe(true);
    expect(isMoving(intent({ strafe: 1 }))).toBe(true);
  });

  it('yalnızca Shift ya da Space hareket sayılmaz', () => {
    expect(isMoving(intent({ run: true, jump: true }))).toBe(false);
  });
});

describe('gateIntent', () => {
  it('koşabilirken niyeti aynen döndürür', () => {
    const i = intent({ forward: 1, run: true, jump: true });
    expect(gateIntent(i, true)).toBe(i);
  });

  it('bitkinken koşma ve zıplamayı kapatır, yürümeyi korur; girdiyi değiştirmez', () => {
    const i = intent({ forward: 1, strafe: -1, run: true, jump: true });
    const gated = gateIntent(i, false);
    expect(gated).toEqual({ forward: 1, strafe: -1, run: false, jump: false });
    expect(i.run).toBe(true);
    expect(i.jump).toBe(true);
  });
});

describe('activityFromIntent', () => {
  it('durağan → rest (Shift basılı olsa da)', () => {
    expect(activityFromIntent(intent())).toBe('rest');
    expect(activityFromIntent(intent({ run: true }))).toBe('rest');
  });

  it('hareket → walk, hareket + Shift → run', () => {
    expect(activityFromIntent(intent({ forward: 1 }))).toBe('walk');
    expect(activityFromIntent(intent({ forward: 1, run: true }))).toBe('run');
  });

  it('bitkin oyuncu koşamaz: kısıtlanmış niyet walk verir', () => {
    expect(activityFromIntent(gateIntent(intent({ forward: 1, run: true }), false))).toBe('walk');
  });
});
