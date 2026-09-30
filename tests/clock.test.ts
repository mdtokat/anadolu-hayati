import { describe, expect, it, vi } from 'vitest';
import { CLOCK } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { formatClock, GameClock, normalizeHour } from '../src/survival/clock';

const DAY = 24 * 60; // varsayılan gün uzunluğu (sn)

describe('normalizeHour / formatClock', () => {
  it('saati [0, 24) aralığına sarar', () => {
    expect(normalizeHour(25.5)).toBeCloseTo(1.5);
    expect(normalizeHour(-1)).toBeCloseTo(23);
    expect(normalizeHour(24)).toBe(0);
  });

  it('HH:MM biçimler', () => {
    expect(formatClock(9)).toBe('09:00');
    expect(formatClock(13.5)).toBe('13:30');
    expect(formatClock(23.999)).toBe('23:59');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(24.25)).toBe('00:15');
  });
});

describe('GameClock', () => {
  it('config başlangıç saatinde başlar, gündüzdür', () => {
    const clock = new GameClock();
    expect(clock.hour).toBe(CLOCK.startHour);
    expect(clock.isNight).toBe(false);
    expect(clock.day).toBe(0);
  });

  it('gün uzunluğuna orantılı ilerler: 1 oyun saati = dayLength/24 sn', () => {
    const clock = new GameClock({ dayLengthSeconds: DAY, startHour: 9 });
    expect(clock.secondsPerHour).toBeCloseTo(60);
    clock.advance(60);
    expect(clock.hour).toBeCloseTo(10, 9);
    clock.advance(30);
    expect(clock.hour).toBeCloseTo(10.5, 9);
  });

  it('ayarlanabilir gün uzunluğu (10 dk gün)', () => {
    const clock = new GameClock({ dayLengthSeconds: 600, startHour: 0 });
    clock.advance(25); // 600 sn / 24 = 25 sn/saat
    expect(clock.hour).toBeCloseTo(1, 9);
  });

  it('24 saat sonra aynı saate döner ve gün sayısı artar', () => {
    const clock = new GameClock({ dayLengthSeconds: DAY, startHour: 9 });
    clock.advance(DAY);
    expect(clock.hour).toBeCloseTo(9, 9);
    expect(clock.day).toBe(1);
    clock.advance(DAY * 2);
    expect(clock.day).toBe(3);
  });

  it('sıfır/negatif süre hiçbir şeyi değiştirmez', () => {
    const clock = new GameClock({ startHour: 9 });
    clock.advance(0);
    clock.advance(-10);
    expect(clock.hour).toBe(9);
  });

  it('gece akşam alacakaranlığında başlar, sabahın erken saatinde biter (ekinoks)', () => {
    const at = (hour: number) => new GameClock({ startHour: hour }).isNight;
    expect(at(12)).toBe(false);
    expect(at(17.5)).toBe(false);
    expect(at(19.5)).toBe(true);
    expect(at(0)).toBe(true);
    expect(at(4)).toBe(true);
    expect(at(7)).toBe(false);
  });

  it('gece/gündüz geçişinde olayları tam birer kez yayınlar', () => {
    const bus = new EventBus<GameEvents>();
    const night = vi.fn();
    const dayStart = vi.fn();
    bus.on('time:nightStarted', night);
    bus.on('time:dayStarted', dayStart);

    const clock = new GameClock({ dayLengthSeconds: DAY, startHour: 12 }, bus);
    // 12:00 → ertesi gün 12:00 (24 oyun saati) küçük adımlarla
    for (let i = 0; i < DAY; i++) clock.advance(1);
    expect(night).toHaveBeenCalledTimes(1);
    expect(dayStart).toHaveBeenCalledTimes(1);
    expect(night).toHaveBeenCalledWith({ day: 0 });
    expect(dayStart).toHaveBeenCalledWith({ day: 1 }); // sabah ertesi gündür
  });

  it('gece başlangıcı, güneş −6° eşiğini geçtiğinde (≈ 18:24) olur', () => {
    const bus = new EventBus<GameEvents>();
    let nightHour = -1;
    const clock = new GameClock({ dayLengthSeconds: DAY, startHour: 17 }, bus);
    bus.on('time:nightStarted', () => (nightHour = clock.hour));
    for (let i = 0; i < 180 && nightHour < 0; i++) clock.advance(1); // saniye adımı = 1/60 saat
    expect(nightHour).toBeGreaterThan(18);
    expect(nightHour).toBeLessThan(19);
  });

  it('setHour saati ayarlar, gün sayısını değiştirmez, geçiş olayı yayınlar', () => {
    const bus = new EventBus<GameEvents>();
    const night = vi.fn();
    bus.on('time:nightStarted', night);
    const clock = new GameClock({ startHour: 12 }, bus);
    clock.setHour(23);
    expect(clock.hour).toBe(23);
    expect(clock.isNight).toBe(true);
    expect(clock.day).toBe(0);
    expect(night).toHaveBeenCalledTimes(1);
    clock.setHour(23.5); // hâlâ gece: yeniden yayınlanmaz
    expect(night).toHaveBeenCalledTimes(1);
  });

  it('skipHours gün sınırını aşınca gün sayısı artar; geriye sarma günü azaltmaz', () => {
    const clock = new GameClock({ startHour: 22 });
    clock.skipHours(5);
    expect(clock.hour).toBeCloseTo(3, 9);
    expect(clock.day).toBe(1);
    clock.skipHours(-10);
    expect(clock.hour).toBeCloseTo(17, 9);
    expect(clock.day).toBe(0);
    clock.skipHours(-30);
    expect(clock.day).toBe(0); // 0'ın altına inmez
  });

  it('güneş konumu saatle uyumlu: öğlen yüksek, gece ufkun altında', () => {
    expect(new GameClock({ startHour: 12 }).sun.altitudeDeg).toBeGreaterThan(45);
    expect(new GameClock({ startHour: 0 }).sun.altitudeDeg).toBeLessThan(-30);
  });
});
