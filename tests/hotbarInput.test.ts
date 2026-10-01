import { describe, expect, it, vi } from 'vitest';
import { INPUT } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Input, type InputDocument, type InputTarget } from '../src/core/Input';
import { DEV_TELEPORT_KEY, actionForKey, hotbarSlotForKey } from '../src/core/inputMapping';

function setup(devTeleportKeys = false) {
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as Element | null,
  }) as InputDocument & { pointerLockElement: Element | null };
  const target = Object.assign(new EventTarget(), {
    requestPointerLock: vi.fn(),
  }) as InputTarget;
  const events = new EventBus<GameEvents>();
  const input = new Input(target, doc, events, new EventTarget(), { devTeleportKeys });
  const key = (type: 'keydown' | 'keyup', code: string, shiftKey = false) =>
    doc.dispatchEvent(Object.assign(new Event(type), { code, repeat: false, shiftKey }));
  const wheel = (deltaY: number, timeStamp: number) => {
    const event = Object.assign(new Event('wheel'), { deltaY });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp }); // salt okunur alan
    doc.dispatchEvent(event);
  };
  const lock = (locked: boolean) => {
    doc.pointerLockElement = locked ? (target as unknown as Element) : null;
    doc.dispatchEvent(new Event('pointerlockchange'));
  };
  const select = vi.fn();
  const cycle = vi.fn();
  events.on('input:hotbarSelect', select);
  events.on('input:hotbarCycle', cycle);
  return { input, key, wheel, lock, select, cycle };
}

describe('kısayol tuşları', () => {
  it('Digit1…Digit8 → 0…7; R döndürme eylemi', () => {
    expect(hotbarSlotForKey('Digit1')).toBe(0);
    expect(hotbarSlotForKey(INPUT.bindings.hotbar.at(-1) ?? '')).toBe(
      INPUT.bindings.hotbar.length - 1,
    );
    expect(hotbarSlotForKey('Digit9')).toBeNull();
    expect(hotbarSlotForKey('KeyE')).toBeNull();
    expect(actionForKey('KeyR')).toBe('rotatePlacement');
  });

  it('yalnızca oyun kontrolündeyken seçim olayı yayınlanır', () => {
    const { key, lock, select } = setup();
    key('keydown', 'Digit3');
    expect(select).not.toHaveBeenCalled();
    lock(true);
    key('keydown', 'Digit3');
    expect(select).toHaveBeenCalledWith({ slot: 2 });
  });

  it('üretimde Shift (koşu) basılıyken de seçer; dev modunda Shift ve T ışınlanmaya ayrılır', () => {
    const prod = setup(false);
    prod.lock(true);
    prod.key('keydown', 'Digit2', true);
    expect(prod.select).toHaveBeenCalledWith({ slot: 1 });

    const dev = setup(true);
    dev.lock(true);
    dev.key('keydown', 'Digit2', true);
    dev.key('keydown', DEV_TELEPORT_KEY);
    dev.key('keydown', 'Digit4');
    expect(dev.select).not.toHaveBeenCalled();
    expect(dev.input.isHeld(DEV_TELEPORT_KEY)).toBe(true);
    dev.key('keyup', DEV_TELEPORT_KEY);
    dev.key('keydown', 'Digit4');
    expect(dev.select).toHaveBeenCalledWith({ slot: 3 });
  });

  it('tekerlek: aşağı sonraki, yukarı önceki; çok sık olaylar elenir', () => {
    const { wheel, lock, cycle } = setup();
    wheel(100, 0);
    expect(cycle).not.toHaveBeenCalled();
    lock(true);
    wheel(100, 1000);
    wheel(100, 1000 + INPUT.hotbarWheelCooldownMs / 2); // elenir
    wheel(-100, 1000 + INPUT.hotbarWheelCooldownMs + 1);
    expect(cycle.mock.calls).toEqual([[{ step: 1 }], [{ step: -1 }]]);
  });

  it('E basışı bir kez okunur; X basılı tutma izlenir; kilit kalkınca sıfırlanır', () => {
    const { input, key, lock } = setup();
    lock(true);
    key('keydown', 'KeyE');
    expect(input.consumeInteractPress()).toBe(true);
    expect(input.consumeInteractPress()).toBe(false);
    key('keydown', 'KeyX');
    expect(input.dismantleHeld).toBe(true);
    key('keydown', 'KeyE');
    lock(false);
    expect(input.consumeInteractPress()).toBe(false);
    expect(input.dismantleHeld).toBe(false);
  });
});
