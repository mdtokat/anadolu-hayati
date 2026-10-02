import { describe, expect, it } from 'vitest';
import { DRONE } from '../src/config';
import {
  batteryPercent,
  droneStatus,
  markLine,
  realAltitude,
  realDistance,
} from '../src/ui/droneFormat';

describe('drone HUD metinleri', () => {
  it('gerçek uzaklık ve yükseklik', () => {
    expect(realDistance(10)).toBe('500 m');
    expect(realDistance(84)).toBe('4,2 km');
    expect(realAltitude(8)).toBe('120 m');
    expect(realAltitude(-1)).toBe('0 m');
  });

  it('pil yüzdesi ve durum satırı', () => {
    expect(batteryPercent(0.624)).toBe(62);
    expect(batteryPercent(2)).toBe(100);
    expect(droneStatus('returning', 1, 0)).toMatch(/Menzil dışı/);
    expect(droneStatus('homing', 1, 0)).toBe('Eve dönüyor');
    expect(droneStatus('falling', 1, 0)).toMatch(/düşüyor/);
    expect(droneStatus('manual', DRONE.lowBattery, 0)).toBe('Pil azaldı');
    expect(droneStatus('manual', 1, 0.8)).toBe('Sinyal zayıf');
    expect(droneStatus('manual', 1, 0)).toBe('');
  });

  it('işaret satırı yön içerir', () => {
    expect(markLine('Kurt', 20, 0)).toBe('Kurt · 1 km K');
  });
});
