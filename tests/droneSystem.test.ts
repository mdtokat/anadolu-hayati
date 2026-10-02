import { describe, expect, it } from 'vitest';
import { DRONE } from '../src/config';
import { DroneSystem, DRONE_TARGET_ID } from '../src/drone/DroneSystem';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { fireShot } from '../src/combat/ranged';
import { parseSave } from '../src/save/saveGame';
import { sampleSave } from './helpers/sampleSave';

const DT = 1 / 60;
const ground = () => 0;
const world = { groundAt: ground };
const home = { x: 0, y: 0, z: 0 };

function setup() {
  const events = new EventBus<GameEvents>();
  const log: string[] = [];
  for (const name of [
    'drone:launched',
    'drone:landed',
    'drone:crashed',
    'drone:marked',
    'drone:damaged',
    'drone:outOfRange',
  ] as const) {
    events.on(name, () => log.push(name));
  }
  return { drone: new DroneSystem(events), log };
}

describe('DroneSystem', () => {
  it('kalkış görüşü açar; pil azsa kalkmaz; uçarken ikinci kalkış yok', () => {
    const { drone, log } = setup();
    drone.battery = DRONE.minLaunchBattery / 2;
    expect(drone.launch({ x: 0, z: 0, yaw: 0 }, ground)).toBe('no_battery');
    drone.insertBattery();
    expect(drone.launch({ x: 0, z: 0, yaw: 0 }, ground)).toBe('ok');
    expect(drone.viewActive).toBe(true);
    expect(drone.launch({ x: 0, z: 0, yaw: 0 }, ground)).toBe('flying');
    expect(log).toEqual(['drone:launched']);
    drone.setView(false);
    expect(drone.viewActive).toBe(false);
  });

  it('görüş kapalıyken girdi uygulanmaz (drone havada bekler); fare yaw ve eğimi döndürür, tekerlek yakınlaştırır', () => {
    const { drone } = setup();
    drone.launch({ x: 0, z: 0, yaw: 0 }, ground);
    drone.setView(false);
    const start = { ...drone.state! };
    for (let i = 0; i < 60; i++) {
      drone.update(DT, { forward: 1, strafe: 0, up: false, down: false, fast: false }, world, home);
    }
    expect(drone.state!.z).toBeCloseTo(start.z, 3);
    drone.look(0.5, 10);
    expect(drone.state!.yaw).toBeCloseTo(-0.5);
    expect(drone.pitch).toBe(DRONE.pitchMin);
    drone.zoom(1);
    expect(drone.fovDeg).toBe(DRONE.fovDeg - DRONE.fovStepDeg);
    for (let i = 0; i < 30; i++) drone.zoom(1);
    expect(drone.fovDeg).toBe(DRONE.fovMinDeg);
  });

  it('hedef: uçan drone vurulabilir; dayanıklılığı bitince düşer ve yapıya dönüşmek üzere çakılır', () => {
    const { drone, log } = setup();
    drone.launch({ x: 0, z: 0, yaw: 0 }, ground);
    drone.setView(false);
    const s = drone.state!;
    const shot = fireShot({ x: s.x + 20, y: s.y, z: s.z }, { x: -1, y: 0, z: 0 }, 'rifle', {
      heightAt: () => -10,
      targets: drone,
    });
    expect(shot.hit?.id).toBe(DRONE_TARGET_ID);
    drone.applyHit(DRONE_TARGET_ID, DRONE.health, { x: 20, y: 0, z: 0, by: 'bandit' });
    expect(drone.targetsNear(s.x, s.z, 5)).toEqual([]); // düşen drone hedef değil
    for (let i = 0; i < 60 * 3; i++)
      drone.update(DT, { forward: 0, strafe: 0, up: false, down: false, fast: false }, world, home);
    expect(drone.flying).toBe(false);
    expect(log).toContain('drone:crashed');
  });

  it('eve dönüş iner ve alınır', () => {
    const { drone, log } = setup();
    drone.launch({ x: 0, z: 0, yaw: 0 }, ground);
    drone.recall();
    for (let i = 0; i < 60 * 10 && drone.flying; i++) {
      drone.update(DT, { forward: 0, strafe: 0, up: false, down: false, fast: false }, world, home);
    }
    expect(log).toContain('drone:landed');
    expect(drone.flying).toBe(false);
  });

  it('şarj yalnızca uçmuyorken; işaret ekleme', () => {
    const { drone, log } = setup();
    drone.battery = 0.5;
    drone.charge(10, 0.01);
    expect(drone.battery).toBeCloseTo(0.6);
    drone.launch({ x: 0, z: 0, yaw: 0 }, ground);
    drone.charge(10, 0.01);
    expect(drone.battery).toBeCloseTo(0.6);
    const ray = { x: 0, y: 30, z: 0, dx: 0, dy: -1, dz: 0 };
    expect(drone.mark([], ray, { x: 0, z: 0 })).toBe(true);
    expect(drone.marks).toEqual([{ x: 0, z: 0, label: 'İşaret' }]);
    expect(log).toContain('drone:marked');
  });

  it('kayıt: uçuşta alınırsa `landed` (zemin noktası), değilse `stowed`; işaretler ve pil korunur', () => {
    const { drone } = setup();
    drone.battery = 0.7;
    drone.mark([], { x: 0, y: 10, z: 0, dx: 0, dy: -1, dz: 0 }, { x: 5, z: 5 });
    const stowed = drone.toSave(ground);
    expect(stowed).toMatchObject({ state: 'stowed', battery: 0.7 });
    drone.launch({ x: 0, z: 0, yaw: 0 }, () => 3);
    const flying = drone.toSave(() => 3);
    expect(flying.state).toBe('landed');
    expect(flying.y).toBe(3);
    const other = setup().drone;
    other.loadSave(flying);
    expect(other.flying).toBe(false);
    expect(other.marks).toEqual(drone.marks);
    // Kayıt şemasına uyar.
    expect(() => parseSave({ ...sampleSave(), drone: flying })).not.toThrow();
  });
});
