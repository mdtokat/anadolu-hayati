import { describe, expect, it } from 'vitest';
import { DRONE, SOLAR } from '../src/config';
import { nearPanel, solarRate } from '../src/drone/charge';
import {
  NO_INPUT,
  damageDrone,
  launchDrone,
  rangeOf,
  sendHome,
  signalNoise,
  stepDrone,
  type DroneEvent,
  type DroneInput,
  type DroneState,
  type DroneWorld,
} from '../src/drone/flight';
import { bearingTo, pickCandidate, toggleMark, type Mark } from '../src/drone/marks';

const DT = 1 / 60;
const flat: DroneWorld = { groundAt: () => 0 };
const home = { x: 0, y: 0, z: 0 };

function fly(
  s: DroneState,
  seconds: number,
  input: DroneInput = NO_INPUT,
  world: DroneWorld = flat,
  infinite = false,
): { s: DroneState; events: DroneEvent[] } {
  const events: DroneEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = stepDrone(s, input, DT, world, { home, infiniteBattery: infinite });
    s = r.state;
    events.push(...r.events);
    if (r.events.includes('crashed') || r.events.includes('landed')) break; // DroneSystem uçuşu bitirir
  }
  return { s, events };
}

const forward: DroneInput = { forward: 1, strafe: 0, up: false, down: false, fast: false };

describe('drone uçuşu', () => {
  it('kalkış oyuncunun önünde ve yerden yukarıda; ileri tuşu bakış yönünde hızlanır', () => {
    const s0 = launchDrone({ x: 0, z: 0, yaw: 0 }, 1, () => 5);
    expect(s0.z).toBeCloseTo(-DRONE.launchAhead);
    expect(s0.y).toBeCloseTo(5 + DRONE.launchHeight);
    const { s } = fly({ ...s0, y: DRONE.launchHeight }, 2, forward);
    expect(s.z).toBeLessThan(-15); // −z = ileri (yaw 0)
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(DRONE.speed, 0);
  });

  it('yükseklik: zemine en çok minClearance yaklaşır, maxAltitude üstüne çıkmaz', () => {
    const s0 = launchDrone({ x: 0, z: 0, yaw: 0 }, 1, () => 0);
    const down = fly(s0, 3, { ...NO_INPUT, down: true }).s;
    expect(down.y).toBeCloseTo(DRONE.minClearance, 3);
    const up = fly(
      s0,
      DRONE.maxAltitude / DRONE.climbSpeed + 5,
      { ...NO_INPUT, up: true },
      flat,
      true,
    ).s;
    expect(up.y).toBeCloseTo(DRONE.maxAltitude, 3);
  });

  it('yapıya çarpınca durur', () => {
    const wall: DroneWorld = { groundAt: () => 0, solidAt: (_x, _y, z) => z < -10 };
    const { s } = fly(
      launchDrone({ x: 0, z: 0, yaw: 0 }, 1, () => 0),
      4,
      forward,
      wall,
    );
    expect(s.z).toBeGreaterThanOrEqual(-10);
  });

  it('menzil aşılınca kendiliğinden döner, yaklaşınca denetim geri gelir; karlanma sınırda artar', () => {
    const s0 = launchDrone({ x: 0, z: 0, yaw: 0 }, 1, () => 0);
    const out = fly(s0, (DRONE.range + 20) / DRONE.speed + 3, forward, flat, true);
    expect(out.events).toContain('outOfRange');
    expect(rangeOf(out.s, home)).toBeLessThanOrEqual(DRONE.range + 20);
    const back = fly(out.s, 10, forward, flat, true);
    expect(back.events).toContain('controlRestored');
    expect(back.s.mode).toBe('manual');
    expect(signalNoise(0)).toBe(0);
    expect(signalNoise(DRONE.range)).toBe(1);
    expect(signalNoise(DRONE.range * 0.9)).toBeGreaterThan(0);
  });

  it('pil: süre boyunca azalır, uyarı verir, bitince düşer ve yere çakılır; test modunda bitmez', () => {
    const s0 = { ...launchDrone({ x: 0, z: 0, yaw: 0 }, 0.21, () => 0), y: 30 };
    const r = fly(s0, 0.21 * DRONE.batterySeconds + 10);
    expect(r.events).toEqual(['batteryLow', 'batteryEmpty', 'crashed']);
    expect(r.s.y).toBeCloseTo(0.15);
    const infinite = fly(s0, 0.3 * DRONE.batterySeconds, NO_INPUT, flat, true);
    expect(infinite.s.battery).toBeCloseTo(0.21);
    expect(infinite.events).toEqual([]);
  });

  it('vurulup dayanıklılığı biten drone düşer', () => {
    let s = { ...launchDrone({ x: 0, z: 0, yaw: 0 }, 1, () => 0), y: 10 };
    s = damageDrone(s, DRONE.health / 2);
    expect(s.mode).toBe('manual');
    s = damageDrone(s, DRONE.health);
    expect(s.mode).toBe('falling');
    expect(fly(s, 3).events).toContain('crashed');
  });

  it('eve dönüş: oyuncunun yanına gelip iner', () => {
    let s = { ...launchDrone({ x: 0, z: 0, yaw: 0 }, 1, () => 0), x: 120, z: -60, y: 40 };
    s = sendHome(s);
    const r = fly(s, 60);
    expect(r.events).toContain('landed');
    expect(rangeOf(r.s, home)).toBeLessThanOrEqual(DRONE.landDistance);
  });
});

describe('işaretler', () => {
  const ray = { x: 0, y: 30, z: 0, dx: 0, dy: -Math.SQRT1_2, dz: -Math.SQRT1_2 };

  it('bakış ışınına en yakın aday seçilir; açı dışındaki ya da çok uzaktaki seçilmez', () => {
    const deer = { x: 0, y: 0.6, z: -29.4, radius: 0.5, label: 'Karaca' };
    const off = { x: 20, y: 0, z: -30, radius: 0.5, label: 'Kurt' };
    expect(pickCandidate([off, deer], ray)?.label).toBe('Karaca');
    expect(pickCandidate([off], ray)).toBeNull();
    const far = { x: 0, y: -400, z: -400, radius: 1, label: 'Uzak' };
    expect(pickCandidate([far], ray)).toBeNull();
  });

  it('aç/kapa ve en çok işaret sayısı (en eskisi düşer)', () => {
    let marks: Mark[] = [];
    for (let i = 0; i < DRONE.maxMarks + 2; i++) {
      marks = toggleMark(marks, { x: i * 50, z: 0, label: `m${i}` }).marks;
    }
    expect(marks).toHaveLength(DRONE.maxMarks);
    expect(marks[0]!.label).toBe('m2');
    const removed = toggleMark(marks, { x: 101, z: 2, label: 'x' });
    expect(removed.action).toBe('removed');
    expect(removed.marks.some((m) => m.label === 'm2')).toBe(false);
  });

  it('pusula yönü: kuzey 0, doğu 90', () => {
    expect(bearingTo({ x: 0, z: 0 }, { x: 0, z: -10 }).bearing).toBeCloseTo(0);
    expect(bearingTo({ x: 0, z: 0 }, { x: 10, z: 0 }).bearing).toBeCloseTo(90);
    expect(bearingTo({ x: 0, z: 0 }, { x: -10, z: 0 }).bearing).toBeCloseTo(270);
  });
});

describe('güneş şarjı', () => {
  it('güneş alçakken yok, tepedeyken tam; panel erişimi', () => {
    expect(solarRate(SOLAR.minSunAltitudeDeg - 1)).toBe(0);
    expect(solarRate(SOLAR.fullSunAltitudeDeg + 10)).toBe(SOLAR.chargePerSecond);
    expect(solarRate((SOLAR.minSunAltitudeDeg + SOLAR.fullSunAltitudeDeg) / 2)).toBeCloseTo(
      SOLAR.chargePerSecond / 2,
    );
    const panels = [{ kind: 'solar_panel', x: 10, z: 0 }];
    expect(nearPanel(panels, 10 + SOLAR.reach - 0.1, 0)).toBe(true);
    expect(nearPanel(panels, 10 + SOLAR.reach + 1, 0)).toBe(false);
    expect(nearPanel([{ kind: 'forge', x: 10, z: 0 }], 10, 0)).toBe(false);
  });
});
