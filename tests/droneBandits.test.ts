import { describe, expect, it } from 'vitest';
import { DRONE } from '../src/config';
import { BanditSystem } from '../src/bandits/BanditSystem';
import { TargetRegistry } from '../src/combat/targets';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { DroneSystem } from '../src/drone/DroneSystem';
import { viewCenters } from '../src/world/viewFocus';

const DT = 1 / 60;
const flat = { heightAt: () => 0, slopeDegAt: () => 0, isSea: () => false };

function setup() {
  const events = new EventBus<GameEvents>();
  const damaged: number[] = [];
  events.on('drone:damaged', ({ amount }) => damaged.push(amount));
  const drone = new DroneSystem(events);
  const bandits = new BanditSystem(events, [], flat);
  const registry = new TargetRegistry();
  registry.register(drone);
  // Oyuncu uzakta (görüş dışı), drone eşkıyanın önünde.
  drone.launch({ x: 0, z: -15, yaw: 0 }, () => 0);
  drone.setView(false);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      const s = drone.state;
      bandits.update(DT, {
        player: { x: 0, y: 0, z: 200, activity: 'rest', alive: true, sanctuary: false },
        hour: 12,
        darkness: 0,
        now: 0,
        targets: registry,
        prey: () => [],
        drone: s ? { x: s.x, y: s.y, z: s.z } : null,
      });
    }
  };
  return { drone, bandits, run, damaged };
}

describe('eşkıyalar ve drone (Faz 11, F)', () => {
  it("alçak uçan drone'u gören tüfekli eşkıya ateş eder ve isabet ettirir", () => {
    const { bandits, run, damaged } = setup();
    bandits.spawnAt(0, 0, 'rifle', 'patrol');
    run(DRONE.banditShotInterval * 4);
    expect(damaged.length).toBeGreaterThan(0);
  });

  it("yüksekteki drone'a ve kılıçlı eşkıya ateş etmez", () => {
    const high = setup();
    high.bandits.spawnAt(0, 0, 'rifle', 'patrol');
    // Drone'u tavana çıkar.
    for (let i = 0; i < 60 * 30; i++) {
      high.drone.setView(true);
      high.drone.update(
        DT,
        { forward: 0, strafe: 0, up: true, down: false, fast: false },
        { groundAt: () => 0 },
        { x: 0, y: 0, z: 0 },
        true,
      );
    }
    high.drone.setView(false);
    expect(high.drone.state!.y).toBeGreaterThan(DRONE.shootableAltitude);
    high.run(DRONE.banditShotInterval * 3);
    expect(high.damaged).toEqual([]);
    const melee = setup();
    melee.bandits.spawnAt(0, 0, 'pala', 'patrol');
    melee.run(DRONE.banditShotInterval * 3);
    expect(melee.damaged).toEqual([]);
  });

  it('görüş odağı: collider merkezi oyuncuda, çizim merkezi odakta', () => {
    expect(viewCenters({ x: 1, z: 2 }, null)).toEqual({
      physics: { x: 1, z: 2 },
      visual: { x: 1, z: 2 },
    });
    expect(viewCenters({ x: 1, z: 2 }, { x: 200, z: -50 })).toEqual({
      physics: { x: 1, z: 2 },
      visual: { x: 200, z: -50 },
    });
  });
});
