import { describe, expect, it } from 'vitest';
import { actionForKey, mapKeysToIntent } from '../src/core/inputMapping';

const keys = (...codes: string[]) => new Set(codes);

describe('mapKeysToIntent', () => {
  it('tuş yokken sıfır niyet verir', () => {
    expect(mapKeysToIntent(keys())).toEqual({ forward: 0, strafe: 0, run: false, jump: false });
  });

  it('WASD yönlerini eşler', () => {
    expect(mapKeysToIntent(keys('KeyW')).forward).toBe(1);
    expect(mapKeysToIntent(keys('KeyS')).forward).toBe(-1);
    expect(mapKeysToIntent(keys('KeyD')).strafe).toBe(1);
    expect(mapKeysToIntent(keys('KeyA')).strafe).toBe(-1);
  });

  it('ok tuşları da çalışır', () => {
    expect(mapKeysToIntent(keys('ArrowUp')).forward).toBe(1);
    expect(mapKeysToIntent(keys('ArrowLeft')).strafe).toBe(-1);
  });

  it('zıt tuşlar birbirini sıfırlar', () => {
    const intent = mapKeysToIntent(keys('KeyW', 'KeyS', 'KeyA', 'KeyD'));
    expect(intent.forward).toBe(0);
    expect(intent.strafe).toBe(0);
  });

  it('çapraz hareket iki ekseni birden verir', () => {
    const intent = mapKeysToIntent(keys('KeyW', 'KeyD'));
    expect(intent.forward).toBe(1);
    expect(intent.strafe).toBe(1);
  });

  it('Shift koşma, Space zıplama niyetidir', () => {
    expect(mapKeysToIntent(keys('ShiftLeft')).run).toBe(true);
    expect(mapKeysToIntent(keys('ShiftRight')).run).toBe(true);
    expect(mapKeysToIntent(keys('Space')).jump).toBe(true);
  });

  it('tanımsız tuşları yok sayar', () => {
    expect(mapKeysToIntent(keys('KeyQ', 'KeyZ'))).toEqual({
      forward: 0,
      strafe: 0,
      run: false,
      jump: false,
    });
  });
});

describe('actionForKey', () => {
  it('V kamera geçişi eylemidir', () => {
    expect(actionForKey('KeyV')).toBe('toggleCamera');
  });
  it('diğer tuşlar için null döner', () => {
    expect(actionForKey('KeyW')).toBeNull();
  });
});
