import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus';

interface TestEvents {
  'player:ate': { food: string };
  'time:nightStarted': undefined;
}

describe('EventBus', () => {
  it('olayı dinleyicilere yükle iletir', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('player:ate', handler);
    bus.emit('player:ate', { food: 'elma' });
    expect(handler).toHaveBeenCalledWith({ food: 'elma' });
  });

  it('on() dönüş değeri dinlemeyi bırakır', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.on('time:nightStarted', handler);
    off();
    bus.emit('time:nightStarted', undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it('once() yalnızca bir kez tetiklenir', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.once('time:nightStarted', handler);
    bus.emit('time:nightStarted', undefined);
    bus.emit('time:nightStarted', undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emit sırasında dinlemeyi bırakan dinleyici diğerlerini bozmaz', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    const off = bus.on('time:nightStarted', () => off());
    bus.on('time:nightStarted', second);
    bus.emit('time:nightStarted', undefined);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('clear() tüm dinleyicileri kaldırır', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('player:ate', handler);
    bus.clear();
    bus.emit('player:ate', { food: 'ekmek' });
    expect(handler).not.toHaveBeenCalled();
  });
});
