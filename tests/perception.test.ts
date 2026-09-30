import { describe, expect, it } from 'vitest';
import { CREATURES } from '../src/config';
import {
  angleDiff,
  darknessOf,
  nearestFire,
  perceivePlayer,
  playerWeakness,
  visionRange,
  yawOf,
} from '../src/creatures/perception';
import { SPECIES } from '../src/creatures/species';

const deer = SPECIES.roe_deer;
const wolf = SPECIES.wolf;

describe('yön yardımcıları', () => {
  it('yaw sözleşmesi: 0 = −Z, pozitif sola', () => {
    expect(yawOf(0, -1)).toBeCloseTo(0);
    expect(yawOf(-1, 0)).toBeCloseTo(Math.PI / 2);
    expect(yawOf(1, 0)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(yawOf(0, 1))).toBeCloseTo(Math.PI);
  });

  it('angleDiff en kısa yolu verir', () => {
    expect(angleDiff(0, 0.5)).toBeCloseTo(0.5);
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleDiff(-3, 3)).toBeCloseTo(6 - 2 * Math.PI);
  });
});

describe('karanlık ve görüş', () => {
  it('gün: 0, gece: 1, alacakaranlık arası yumuşak', () => {
    expect(darknessOf(40)).toBe(0);
    expect(darknessOf(-30)).toBe(1);
    const mid = darknessOf(0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(darknessOf(-2)).toBeGreaterThan(darknessOf(2));
  });

  it('gece görüş mesafesi tür çarpanı kadar kısalır', () => {
    expect(visionRange(deer, 0)).toBe(deer.perception.sightRange);
    expect(visionRange(deer, 1)).toBeCloseTo(
      deer.perception.sightRange * deer.perception.nightSightFactor,
    );
    // Kurt geceye daha iyi uyumlu.
    expect(visionRange(wolf, 1) / wolf.perception.sightRange).toBeGreaterThan(
      visionRange(deer, 1) / deer.perception.sightRange,
    );
  });
});

describe('oyuncu algısı', () => {
  const at = { x: 0, z: 0, yaw: 0 }; // kuzeye (−Z) bakıyor
  const player = (x: number, z: number, activity: 'rest' | 'walk' | 'run' = 'walk') => ({
    x,
    z,
    activity,
  });

  it('önündeki oyuncuyu menzil içinde görür, menzil dışında görmez', () => {
    expect(perceivePlayer(wolf, at, player(0, -100), 0).visible).toBe(true);
    expect(perceivePlayer(wolf, at, player(0, -200), 0).visible).toBe(false);
  });

  it('arkasındaki oyuncuyu görmez ama çok yakındaysa fark eder', () => {
    expect(perceivePlayer(wolf, at, player(0, 50), 0).visible).toBe(false);
    expect(perceivePlayer(wolf, at, player(0, CREATURES.senseRadius - 1), 0).visible).toBe(true);
  });

  it('bakış konisi: kenar değerler', () => {
    const half = (wolf.perception.sightHalfAngleDeg * Math.PI) / 180;
    const inside = perceivePlayer(
      wolf,
      at,
      player(-50 * Math.sin(half - 0.05), -50 * Math.cos(half - 0.05)),
      0,
    );
    const outside = perceivePlayer(
      wolf,
      at,
      player(-50 * Math.sin(half + 0.05), -50 * Math.cos(half + 0.05)),
      0,
    );
    expect(inside.visible).toBe(true);
    expect(outside.visible).toBe(false);
  });

  it('gece görüş azalır', () => {
    const d = deer.perception.sightRange * 0.8;
    expect(perceivePlayer(deer, at, player(0, -d), 0).visible).toBe(true);
    expect(perceivePlayer(deer, at, player(0, -d), 1).visible).toBe(false);
  });

  it('duyma: koşan uzaktan, dinlenen neredeyse hiç duyulmaz', () => {
    const behind = (dist: number, a: 'rest' | 'walk' | 'run') =>
      perceivePlayer(deer, at, player(0, dist, a), 0);
    expect(behind(90, 'run').heard).toBe(true);
    expect(behind(90, 'walk').heard).toBe(false);
    expect(behind(90, 'rest').heard).toBe(false);
    expect(behind(deer.perception.hearRange * CREATURES.noise.rest * 0.9, 'rest').heard).toBe(true);
  });

  it('noticed = görüldü veya duyuldu; zayıflık aktarılır', () => {
    const sense = perceivePlayer(deer, at, { ...player(0, 90, 'run'), weakness: 0.7 }, 0);
    expect(sense.visible).toBe(false);
    expect(sense.heard).toBe(true);
    expect(sense.noticed).toBe(true);
    expect(sense.weakness).toBe(0.7);
    expect(sense.dist).toBeCloseTo(90);
  });
});

describe('ateş algısı', () => {
  it('yarıçap içindeki en yakın ateşi verir', () => {
    const fires = [
      { x: 10, z: 0 },
      { x: 3, z: 4 },
    ];
    const hit = nearestFire(0, 0, fires, 12);
    expect(hit).toMatchObject({ x: 3, z: 4 });
    expect(hit?.dist).toBeCloseTo(5);
  });

  it('dışarıdaysa ya da yarıçap 0 ise null', () => {
    expect(nearestFire(0, 0, [{ x: 30, z: 0 }], 12)).toBeNull();
    expect(nearestFire(0, 0, [{ x: 0, z: 0 }], 0)).toBeNull();
    expect(nearestFire(0, 0, [], 12)).toBeNull();
  });
});

describe('oyuncu zayıflığı', () => {
  it('en düşük gösterge belirler', () => {
    expect(playerWeakness({ health: 100, satiety: 100, hydration: 100 })).toBe(0);
    expect(playerWeakness({ health: 100, satiety: 20, hydration: 90 })).toBeCloseTo(0.8);
    expect(playerWeakness({ health: 0, satiety: 50, hydration: 50 })).toBe(1);
  });
});
