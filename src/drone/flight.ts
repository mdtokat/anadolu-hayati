import { DRONE } from '../config';

/**
 * Drone uçuşu (Faz 11, 11.8; saf mantık): elle uçuş (WASD yatay, Space/Z dikey, Shift hızlı; yön drone kamerasının
 * yaw'ıdır), zemine en çok `minClearance` yaklaşır ve yerden `maxAltitude`'u aşmaz, yapıya çarpınca durur. Menzil
 * oyuncuya yataydır: aşılınca drone kendiliğinden geri döner (`returning`), yeterince yaklaşınca denetim geri gelir.
 * `H` eve dönüş (`homing`): oyuncunun yanına gelip iner ve alınır. Pil bitince ya da vurulup dayanıklılığı bitince düşer
 * (`falling`) ve yere değince `crashed` olur. Rüzgâr yok.
 */

export type DroneMode = 'manual' | 'returning' | 'homing' | 'falling';

export interface DroneState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Bakış/ilerleme yönü (oyuncu sözleşmesi: ileri = (−sin, −cos)). */
  yaw: number;
  /** Pil 0–1. */
  battery: number;
  health: number;
  mode: DroneMode;
  /** Pil uyarısı verildi mi (bir kez)? */
  lowWarned: boolean;
}

export interface DroneInput {
  /** −1 … +1 (geri/ileri) ve −1 … +1 (sol/sağ). */
  forward: number;
  strafe: number;
  up: boolean;
  down: boolean;
  fast: boolean;
}

export interface DroneWorld {
  /** Zemin yüksekliği (oyun m). */
  groundAt(x: number, z: number): number;
  /** (x, y, z) bir yapının içinde mi (yerleşim binası)? */
  solidAt?(x: number, y: number, z: number): boolean;
}

export interface DroneStepOptions {
  /** Oyuncunun konumu (menzilin merkezi, eve dönüş hedefi). */
  home: { x: number; y: number; z: number };
  /** Test modu: pil bitmez. */
  infiniteBattery?: boolean;
}

export type DroneEvent =
  'outOfRange' | 'controlRestored' | 'batteryLow' | 'batteryEmpty' | 'landed' | 'crashed';

export const NO_INPUT: DroneInput = { forward: 0, strafe: 0, up: false, down: false, fast: false };

/** Kalkışta drone: oyuncunun önünde, yerden `launchHeight` yukarıda. */
export function launchDrone(
  player: { x: number; z: number; yaw: number },
  battery: number,
  groundAt: (x: number, z: number) => number,
): DroneState {
  const x = player.x - Math.sin(player.yaw) * DRONE.launchAhead;
  const z = player.z - Math.cos(player.yaw) * DRONE.launchAhead;
  return {
    x,
    y: groundAt(x, z) + DRONE.launchHeight,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: player.yaw,
    battery: Math.min(Math.max(battery, 0), 1),
    health: DRONE.health,
    mode: 'manual',
    lowWarned: battery <= DRONE.lowBattery,
  };
}

/** Oyuncuya yatay uzaklık. */
export function rangeOf(
  state: Pick<DroneState, 'x' | 'z'>,
  home: { x: number; z: number },
): number {
  return Math.hypot(state.x - home.x, state.z - home.z);
}

/** Sinyal karlanması 0 (temiz) – 1 (menzil sınırı): `noiseStart · range`'ten sonra doğrusal artar. */
export function signalNoise(distance: number): number {
  const start = DRONE.range * DRONE.noiseStart;
  return Math.min(Math.max((distance - start) / (DRONE.range - start), 0), 1);
}

/** Dayanıklılığı düşürür; biterse drone düşmeye geçer. Yeni durumu döner. */
export function damageDrone(state: DroneState, amount: number): DroneState {
  if (state.mode === 'falling' || !(amount > 0)) return state;
  const health = Math.max(0, state.health - amount);
  return { ...state, health, mode: health <= 0 ? 'falling' : state.mode };
}

/** Eve dönüşü başlatır (düşerken etkisiz). */
export function sendHome(state: DroneState): DroneState {
  return state.mode === 'falling' ? state : { ...state, mode: 'homing' };
}

function approach(current: number, target: number, maxStep: number): number {
  const d = target - current;
  return Math.abs(d) <= maxStep ? target : current + Math.sign(d) * maxStep;
}

/** Bir sabit adım (dt sn). */
export function stepDrone(
  prev: Readonly<DroneState>,
  input: DroneInput,
  dt: number,
  world: DroneWorld,
  options: DroneStepOptions,
): { state: DroneState; events: DroneEvent[] } {
  const s: DroneState = { ...prev };
  const events: DroneEvent[] = [];
  const home = options.home;
  const ground = world.groundAt(s.x, s.z);

  // Pil.
  if (!options.infiniteBattery && s.mode !== 'falling') {
    s.battery = Math.max(0, s.battery - dt / DRONE.batterySeconds);
    if (!s.lowWarned && s.battery <= DRONE.lowBattery) {
      s.lowWarned = true;
      events.push('batteryLow');
    }
    if (s.battery <= 0) {
      s.mode = 'falling';
      events.push('batteryEmpty');
    }
  }

  // İstenen hız.
  let tvx = 0;
  let tvz = 0;
  let tvy = 0;
  const toHome = { x: home.x - s.x, z: home.z - s.z };
  const homeDist = Math.hypot(toHome.x, toHome.z);
  if (s.mode === 'manual') {
    const speed = DRONE.speed * (input.fast ? DRONE.fastFactor : 1);
    const fx = -Math.sin(s.yaw);
    const fz = -Math.cos(s.yaw);
    const rx = Math.cos(s.yaw);
    const rz = -Math.sin(s.yaw);
    let mx = fx * input.forward + rx * input.strafe;
    let mz = fz * input.forward + rz * input.strafe;
    const m = Math.hypot(mx, mz);
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    tvx = mx * speed;
    tvz = mz * speed;
    tvy = (input.up ? 1 : 0) * DRONE.climbSpeed - (input.down ? 1 : 0) * DRONE.climbSpeed;
  } else if (s.mode === 'returning' || s.mode === 'homing') {
    const speed = DRONE.speed * DRONE.fastFactor;
    if (homeDist > (s.mode === 'homing' ? DRONE.landDistance * 0.5 : 0)) {
      tvx = (toHome.x / Math.max(homeDist, 1e-6)) * Math.min(speed, homeDist * 2);
      tvz = (toHome.z / Math.max(homeDist, 1e-6)) * Math.min(speed, homeDist * 2);
    }
    if (s.mode === 'homing' && homeDist <= DRONE.landDistance) tvy = -DRONE.climbSpeed;
    if (s.mode === 'homing' && homeDist > DRONE.landDistance) {
      // Yolda yüksekliğini koru ama oyuncunun başının üstüne inmeden önce yere çok yakınsa yüksel.
      tvy = s.y - ground < DRONE.launchHeight ? DRONE.climbSpeed : 0;
    }
  }

  if (s.mode === 'falling') {
    s.vx *= Math.max(0, 1 - 2 * dt);
    s.vz *= Math.max(0, 1 - 2 * dt);
    s.vy = -DRONE.fallSpeed;
  } else {
    const a = DRONE.acceleration * dt;
    s.vx = approach(s.vx, tvx, a);
    s.vz = approach(s.vz, tvz, a);
    s.vy = approach(s.vy, tvy, a);
  }

  // Yatay hareket: yapıya çarparsa durur.
  const nx = s.x + s.vx * dt;
  const nz = s.z + s.vz * dt;
  if (world.solidAt?.(nx, s.y, nz)) {
    s.vx = 0;
    s.vz = 0;
  } else {
    s.x = nx;
    s.z = nz;
  }
  const g = world.groundAt(s.x, s.z);
  s.y += s.vy * dt;

  if (s.mode === 'falling') {
    if (s.y <= g + 0.15) {
      s.y = g + 0.15;
      s.vx = 0;
      s.vy = 0;
      s.vz = 0;
      events.push('crashed');
    }
    return { state: s, events };
  }

  // Yükseklik sınırları (iniş sırasında zemine kadar).
  const landing = s.mode === 'homing' && homeDist <= DRONE.landDistance;
  const floor = g + (landing ? 0.2 : DRONE.minClearance);
  if (s.y < floor) {
    s.y = floor;
    if (s.vy < 0) s.vy = 0;
  }
  const ceiling = g + DRONE.maxAltitude;
  if (s.y > ceiling) {
    s.y = ceiling;
    if (s.vy > 0) s.vy = 0;
  }
  if (landing && s.y - g <= 0.25) {
    events.push('landed');
    return { state: s, events };
  }

  // Menzil.
  const dist = rangeOf(s, home);
  if (s.mode === 'manual' && dist > DRONE.range) {
    s.mode = 'returning';
    events.push('outOfRange');
  } else if (s.mode === 'returning' && dist <= DRONE.range * DRONE.returnUntil) {
    s.mode = 'manual';
    events.push('controlRestored');
  }
  return { state: s, events };
}
