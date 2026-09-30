import { describe, expect, it } from 'vitest';
import { actionForKey, mapKeysToIntent, teleportSlotForKey } from '../src/core/inputMapping';

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
  it('B il sınırı çizgilerini aç/kapa eylemidir', () => {
    expect(actionForKey('KeyB')).toBe('toggleBorders');
  });
  it('I ve Tab envanter panelini, F hızlı yemeği açar', () => {
    expect(actionForKey('KeyI')).toBe('toggleInventory');
    expect(actionForKey('Tab')).toBe('toggleInventory');
    expect(actionForKey('KeyF')).toBe('eat');
  });
  it('C kamp ateşi, G sundurma yerleştirme eylemidir', () => {
    expect(actionForKey('KeyC')).toBe('placeCampfire');
    expect(actionForKey('KeyG')).toBe('placeShelter');
  });
  it('diğer tuşlar için null döner (E etkileşim eylem değil, basılı tutulur)', () => {
    expect(actionForKey('KeyW')).toBeNull();
    expect(actionForKey('KeyE')).toBeNull();
  });
});

describe('teleportSlotForKey', () => {
  it('Digit1..Digit9 → 0..8', () => {
    expect(teleportSlotForKey('Digit1')).toBe(0);
    expect(teleportSlotForKey('Digit5')).toBe(4);
    expect(teleportSlotForKey('Digit9')).toBe(8);
  });
  it('diğer tuşlar için null (Digit0 dahil)', () => {
    expect(teleportSlotForKey('Digit0')).toBeNull();
    expect(teleportSlotForKey('KeyW')).toBeNull();
    expect(teleportSlotForKey('Numpad1')).toBeNull();
  });
});
