import { describe, expect, it, vi } from 'vitest';
import { INPUT } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Input, type InputDocument, type InputTarget } from '../src/core/Input';
import { actionForKey, resolveContextAction } from '../src/core/inputMapping';

/** Faz 11 (11.0) tuş iskelesi: yeni eylemler, sağ tık nişanı ve `R`'nin bağlam önceliği. */
function setup() {
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as Element | null,
  }) as InputDocument & { pointerLockElement: Element | null };
  const target = Object.assign(new EventTarget(), {
    requestPointerLock: vi.fn(),
  }) as InputTarget;
  const events = new EventBus<GameEvents>();
  const input = new Input(target, doc, events, new EventTarget());
  const setLock = (locked: boolean) => {
    doc.pointerLockElement = locked ? (target as unknown as Element) : null;
    doc.dispatchEvent(new Event('pointerlockchange'));
  };
  const mouse = (type: 'mousedown' | 'mouseup', button: number) =>
    doc.dispatchEvent(Object.assign(new Event(type), { button }));
  const key = (type: 'keydown' | 'keyup', code: string) =>
    doc.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
  return { input, events, doc, setLock, mouse, key };
}

describe('Faz 11 tuşları (11.0)', () => {
  it('Q drone görüşü, H drone eve dönüş eylemidir', () => {
    expect(actionForKey('KeyQ')).toBe('droneView');
    expect(actionForKey('KeyH')).toBe('droneHome');
    expect(INPUT.bindings.droneView).toEqual(['KeyQ']);
    expect(INPUT.bindings.droneHome).toEqual(['KeyH']);
  });

  it('R: hayalet açıkken döndürür, değilse doldurur', () => {
    expect(actionForKey('KeyR')).toBe('rotatePlacement');
    expect(resolveContextAction('rotatePlacement', { placing: true })).toBe('rotatePlacement');
    expect(resolveContextAction('rotatePlacement', { placing: false })).toBe('reload');
    expect(resolveContextAction('toggleCamera', { placing: false })).toBe('toggleCamera');
    expect(INPUT.bindings.reload).toEqual(INPUT.bindings.rotatePlacement);
  });

  it('sağ tık yalnızca kilitliyken basılı tutulan nişandır; eylem üretmez', () => {
    const { input, events, setLock, mouse } = setup();
    const actions: string[] = [];
    events.on('input:action', ({ action }) => actions.push(action));
    mouse('mousedown', 2);
    expect(input.aimHeld).toBe(false); // kilit yok
    setLock(true);
    mouse('mousedown', 2);
    expect(input.aimHeld).toBe(true);
    mouse('mouseup', 2);
    expect(input.aimHeld).toBe(false);
    expect(actions).toEqual([]);
  });

  it('kilit kalkınca nişan bırakılır; Shift nefes tutma tuşudur', () => {
    const { input, setLock, mouse, key } = setup();
    setLock(true);
    mouse('mousedown', 2);
    key('keydown', 'ShiftLeft');
    expect(input.steadyHeld).toBe(true);
    setLock(false);
    expect(input.aimHeld).toBe(false);
    expect(input.steadyHeld).toBe(false);
  });
});
