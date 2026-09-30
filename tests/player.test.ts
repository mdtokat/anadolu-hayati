import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER, REGION_PLAYER } from '../src/config';
import type { MoveIntent } from '../src/core/inputMapping';
import { createHeightfieldDesc } from '../src/physics/heightfield';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';
import { Player, type PlayerOptions } from '../src/player/Player';
import { sampleGrid, type GridSpec, type HeightSource } from '../src/world/HeightSource';

const DT = 1 / 60;
const GRID: GridSpec = { size: 200, cellSize: 1 };
const idle: MoveIntent = { forward: 0, strafe: 0, run: false, jump: false };
/** yaw = −90° → ileri = +X (rampanın yükseldiği yön) */
const FACE_EAST = -Math.PI / 2;

const flat: HeightSource = { heightAt: () => 0 };
/** +X yönünde `angleDeg` eğimle yükselen düz yamaç. */
const slope = (angleDeg: number): HeightSource => ({
  heightAt: (x) => Math.tan((angleDeg * Math.PI) / 180) * x,
});

beforeAll(async () => {
  await initPhysics();
});

/** Verilen araziyle dünya + oyuncu kurar; oyuncu (x0, 0) noktasında yüzeyin üstünde doğar. */
function setup(source: HeightSource, x0 = 0, options: PlayerOptions = {}) {
  const physics = new PhysicsWorld();
  physics.addStaticCollider(createHeightfieldDesc(sampleGrid(source, GRID), GRID));
  const player = new Player(physics, { x: x0, y: source.heightAt(x0, 0) + 0.05, z: 0 }, options);
  const run = (seconds: number, intent: MoveIntent, yaw = FACE_EAST) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      player.update(DT, intent, yaw);
      physics.step();
    }
  };
  return { physics, player, run };
}

describe('Player: düz zemin', () => {
  it('zeminde durur, aşağı sızmaz', () => {
    const { physics, player, run } = setup(flat);
    run(5, idle);
    expect(player.position.y).toBeCloseTo(0, 1);
    expect(player.grounded).toBe(true);
    physics.dispose();
  });

  it('yürüme ve koşma hızlarına ulaşır', () => {
    const { physics, player, run } = setup(flat, -50);
    run(2, { ...idle, forward: 1 });
    expect(player.currentVelocity.x).toBeCloseTo(PLAYER.walkSpeed, 1);
    run(2, { ...idle, forward: 1, run: true });
    expect(player.currentVelocity.x).toBeCloseTo(PLAYER.runSpeed, 1);
    physics.dispose();
  });

  it('zıplayınca hedef yüksekliğe çıkar ve geri yere iner', () => {
    const { physics, player, run } = setup(flat);
    run(0.5, idle); // yerleş
    let maxY = 0;
    for (let i = 0; i < 90; i++) {
      player.update(DT, i === 0 ? { ...idle, jump: true } : idle, 0);
      physics.step();
      maxY = Math.max(maxY, player.position.y);
    }
    expect(maxY).toBeGreaterThan(PLAYER.jumpHeight - 0.15);
    expect(maxY).toBeLessThan(PLAYER.jumpHeight + 0.15);
    expect(player.position.y).toBeCloseTo(0, 1);
    expect(player.grounded).toBe(true);
    physics.dispose();
  });

  it('havadan düşerek zemine oturur', () => {
    const physics = new PhysicsWorld();
    physics.addStaticCollider(createHeightfieldDesc(sampleGrid(flat, GRID), GRID));
    const player = new Player(physics, { x: 0, y: 20, z: 0 });
    for (let i = 0; i < 60 * 4; i++) {
      player.update(DT, idle, 0);
      physics.step();
    }
    expect(player.position.y).toBeCloseTo(0, 1);
    expect(player.grounded).toBe(true);
    physics.dispose();
  });

  it('dünyanın altına düşerse doğma noktasına döner', () => {
    const physics = new PhysicsWorld(); // zemin yok
    const player = new Player(physics, { x: 3, y: 1, z: -2 });
    for (let i = 0; i < 60 * 6; i++) {
      player.update(DT, idle, 0);
      physics.step();
    }
    // Tekrar düşüp geri dönmüş olabilir; her durumda serbest düşüş sınırının altında kalmaz.
    expect(player.position.y).toBeGreaterThan(PLAYER.fallRespawnY - 5);
    physics.dispose();
  });
});

describe('Player: eğimler', () => {
  it('hafif yamaçta (25°) yukarı yürüyebilir', () => {
    const { physics, player, run } = setup(slope(25), -20);
    const startX = player.position.x;
    run(3, { ...idle, forward: 1 });
    expect(player.position.x - startX).toBeGreaterThan(6);
    expect(player.position.y).toBeGreaterThan(slope(25).heightAt(startX, 0) + 2);
    physics.dispose();
  });

  it('dik yamaça (60°) tırmanamaz', () => {
    const { physics, player, run } = setup(slope(60), -5);
    const startX = player.position.x;
    run(4, { ...idle, forward: 1, run: true });
    // Koşarak 4 sn'de düz zeminde ~25 m giderdi; dik yamaçta neredeyse ilerleyemez.
    expect(player.position.x - startX).toBeLessThan(2);
    physics.dispose();
  });

  it('dik yamaçta durursa aşağı kayar', () => {
    const { physics, player, run } = setup(slope(60), 30);
    const startY = player.position.y;
    run(1, idle);
    run(2, idle);
    expect(player.position.y).toBeLessThan(startY - 1);
    physics.dispose();
  });

  it('tırmanılabilir yamaçta hız çökmez (40° yamaçta koşarken en az 3 m/s yatay ilerler)', () => {
    const { physics, player, run } = setup(slope(40), -5);
    const startX = player.position.x;
    run(3, { ...idle, forward: 1, run: true });
    expect((player.position.x - startX) / 3).toBeGreaterThan(3);
    physics.dispose();
  });

  it('eğim sınırının biraz altında (40°) tırmanabilir, biraz üstünde (50°) tırmanamaz', () => {
    const climb = (deg: number) => {
      const { physics, player, run } = setup(slope(deg), -5);
      const startX = player.position.x;
      run(3, { ...idle, forward: 1, run: true });
      const dx = player.position.x - startX;
      physics.dispose();
      return dx;
    };
    expect(climb(40)).toBeGreaterThan(5);
    expect(climb(50)).toBeLessThan(3);
  });
});

describe('Player: engeller', () => {
  /** Oyuncunun yolunda x = 0'dan başlayan, üst yüzü `height` olan geniş platform/duvar. */
  function withPlatform(height: number) {
    const ctx = setup(flat, -10);
    ctx.physics.addStaticCollider(
      RAPIER.ColliderDesc.cuboid(30, height / 2, 5).setTranslation(30, height / 2, 0),
    );
    return ctx;
  }

  it('alçak basamağa (0.3 m) adım atıp üstüne çıkar', () => {
    const { physics, player, run } = withPlatform(0.3);
    run(4, { ...idle, forward: 1 });
    expect(player.position.x).toBeGreaterThan(2);
    expect(player.position.y).toBeCloseTo(0.3, 1);
    expect(player.grounded).toBe(true);
    physics.dispose();
  });

  it('yüksek duvarın (2 m) içinden geçemez', () => {
    const { physics, player, run } = withPlatform(2);
    run(5, { ...idle, forward: 1 });
    // Duvarın batı yüzü x = 0; kapsül yarıçapı 0.35
    expect(player.position.x).toBeLessThan(0);
    expect(player.position.y).toBeLessThan(0.5);
    physics.dispose();
  });

  it('duvara çarpınca hızı sönümlenir (duvarın dibinde hızlanmış kalmaz)', () => {
    const { physics, player, run } = withPlatform(2);
    run(5, { ...idle, forward: 1, run: true });
    expect(player.currentVelocity.x).toBeLessThan(1);
    physics.dispose();
  });
});

describe('Player: maxSlopeDeg seçeneği (gerçek bölgede 60°)', () => {
  const REGION_OPTIONS = { maxSlopeDeg: REGION_PLAYER.maxSlopeDeg };

  /** Koşarak `seconds` sn yamaca yürür; ortalama yatay ilerleme hızını (m/s) döndürür. */
  function climbSpeed(deg: number, options: PlayerOptions, seconds = 3): number {
    const { physics, player, run } = setup(slope(deg), -5, options);
    const startX = player.position.x;
    run(seconds, { ...idle, forward: 1, run: true });
    const speed = (player.position.x - startX) / seconds;
    physics.dispose();
    return speed;
  }

  it('varsayılan (45°) 55° yamaca tırmanamaz; 60° seçeneğiyle tırmanır', () => {
    expect(climbSpeed(55, {})).toBeLessThan(0.5);
    expect(climbSpeed(55, REGION_OPTIONS)).toBeGreaterThan(1.5);
  });

  it('60° seçeneği 65° yamaçta yine engeldir', () => {
    expect(climbSpeed(65, REGION_OPTIONS)).toBeLessThan(0.5);
  });

  it('dik ama tırmanılabilir yamaçta hız kabul edilebilir kalır (yatay ≥ 1,5 m/s @ 55°)', () => {
    // Rapier yamaçta yatay mesafeyi cos²θ kısaltır: 7 m/s koşuda 55°'de ≈ 2,3 m/s beklenir.
    const v55 = climbSpeed(55, REGION_OPTIONS);
    expect(v55).toBeGreaterThan(1.5);
    expect(v55).toBeLessThan(4);
  });

  it('hız eğimle tekdüze azalır (30° > 45° > 55°)', () => {
    const v30 = climbSpeed(30, REGION_OPTIONS);
    const v45 = climbSpeed(45, REGION_OPTIONS);
    const v55 = climbSpeed(55, REGION_OPTIONS);
    expect(v30).toBeGreaterThan(v45);
    expect(v45).toBeGreaterThan(v55);
  });

  it('60° seçeneğiyle, limitin üstündeki yamaçta durunca kayar (tırmanılamaz yüzeyde güvenli değil)', () => {
    const { physics, player, run } = setup(slope(68), 30, REGION_OPTIONS);
    const startY = player.position.y;
    run(3, idle);
    expect(player.position.y).toBeLessThan(startY - 1);
    physics.dispose();
  });
});
