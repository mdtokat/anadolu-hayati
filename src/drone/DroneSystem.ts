import { DRONE } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { HitSource, HitTarget, TargetProvider } from '../combat/targets';
import type { DroneSave } from '../save/saveGame';
import {
  NO_INPUT,
  damageDrone,
  launchDrone,
  rangeOf,
  sendHome,
  signalNoise,
  stepDrone,
  type DroneInput,
  type DroneState,
  type DroneWorld,
} from './flight';
import { pickCandidate, toggleMark, type Mark, type MarkCandidate, type ViewRay } from './marks';

/**
 * Drone (Faz 11, 11.8; saf mantık): tek drone — pil, işaretler, uçuş durumu, drone görüşü ve kamera açıları. Envanter ve
 * yapı kümesiyle ilişki (kalkışta eşyanın düşülmesi, inişte geri alınması, düşünce `drone` yapısı) Game'in işidir; bu
 * sınıf olayları yayınlar (`drone:*`). Hedef sağlayıcısıdır (`drone`): eşkıyalar alçak uçan drone'a ateş eder.
 */
export const DRONE_TARGET_ID = 'drone';

export type LaunchResult = 'ok' | 'flying' | 'no_battery';

export class DroneSystem implements TargetProvider {
  /** Pil 0–1 (uçuşta drone'un pili; değilse envanterdeki/yerdeki drone'un). */
  battery = 1;
  private flight: DroneState | null = null;
  private markList: Mark[] = [];
  private viewOn = false;
  /** Drone kamerasının eğimi (rad) ve görüş açısı (derece). */
  pitch: number = DRONE.pitchDefault;
  fovDeg: number = DRONE.fovDeg;

  constructor(private readonly events: EventBus<GameEvents>) {}

  get state(): Readonly<DroneState> | null {
    return this.flight;
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  get marks(): readonly Mark[] {
    return this.markList;
  }

  /** Drone görüşü açık mı (uçmuyorsa her zaman kapalı)? */
  get viewActive(): boolean {
    return this.viewOn && this.flight !== null;
  }

  setView(on: boolean): void {
    this.viewOn = on && this.flight !== null;
  }

  /** Kalkış (oyuncunun önünden). Pil azsa `no_battery`. */
  launch(
    player: { x: number; z: number; yaw: number },
    groundAt: (x: number, z: number) => number,
  ): LaunchResult {
    if (this.flight) return 'flying';
    if (this.battery < DRONE.minLaunchBattery) return 'no_battery';
    this.flight = launchDrone(player, this.battery, groundAt);
    this.pitch = DRONE.pitchDefault;
    this.fovDeg = DRONE.fovDeg;
    this.viewOn = true;
    const f = this.flight;
    this.events.emit('drone:launched', { x: f.x, y: f.y, z: f.z });
    return 'ok';
  }

  /** Yeni pil takar (pil eşyası tüketildikten sonra çağrılır). */
  insertBattery(): void {
    this.battery = 1;
    if (this.flight) this.flight = { ...this.flight, battery: 1, lowWarned: false };
  }

  /** Güneş paneli şarjı (uçmuyorken): `rate` pil oranı/sn. */
  charge(dt: number, rate: number): void {
    if (this.flight || !(rate > 0)) return;
    this.battery = Math.min(1, this.battery + rate * dt);
  }

  /** `H`: eve dön ve in. */
  recall(): void {
    if (this.flight) this.flight = sendHome(this.flight);
  }

  /** Görüşte fare: drone yaw'ı ve kamera eğimi. */
  look(dYaw: number, dPitch: number): void {
    if (!this.flight) return;
    this.flight = { ...this.flight, yaw: this.flight.yaw - dYaw };
    this.pitch = Math.min(Math.max(this.pitch - dPitch, DRONE.pitchMin), DRONE.pitchMax);
  }

  /** Tekerlek: yakınlaştır (+1) / uzaklaştır (−1). */
  zoom(step: 1 | -1): void {
    this.fovDeg = Math.min(
      Math.max(this.fovDeg - step * DRONE.fovStepDeg, DRONE.fovMinDeg),
      DRONE.fovDeg,
    );
  }

  /** Görüş karlanması 0–1 (uçmuyorsa 0). */
  noise(home: { x: number; z: number }): number {
    return this.flight ? signalNoise(rangeOf(this.flight, home)) : 0;
  }

  /** Bir sabit adım. `input` yalnızca drone görüşündeyken uygulanır. */
  update(
    dt: number,
    input: DroneInput,
    world: DroneWorld,
    home: { x: number; y: number; z: number },
    infiniteBattery = false,
  ): void {
    const flight = this.flight;
    if (!flight) return;
    const { state, events } = stepDrone(flight, this.viewActive ? input : NO_INPUT, dt, world, {
      home,
      infiniteBattery,
    });
    this.flight = state;
    this.battery = state.battery;
    for (const event of events) {
      switch (event) {
        case 'outOfRange':
          this.events.emit('drone:outOfRange', undefined);
          break;
        case 'controlRestored':
          this.events.emit('drone:controlRestored', undefined);
          break;
        case 'batteryLow':
          this.events.emit('drone:batteryLow', { battery: state.battery });
          break;
        case 'landed':
          this.flight = null;
          this.viewOn = false;
          this.events.emit('drone:landed', undefined);
          break;
        case 'crashed':
          this.flight = null;
          this.viewOn = false;
          this.events.emit('drone:crashed', {
            x: state.x,
            y: state.y - 0.15,
            z: state.z,
            shot: state.health <= 0,
          });
          break;
        case 'batteryEmpty':
          break;
      }
    }
  }

  /** Drone görüşünde tıklama: bakılan adayı (yoksa zemin noktasını) işaretler ya da var olan işareti kaldırır. */
  mark(
    candidates: readonly MarkCandidate[],
    ray: ViewRay,
    ground: { x: number; z: number } | null,
  ): boolean {
    const picked = pickCandidate(candidates, ray);
    const target = picked
      ? { x: picked.x, z: picked.z, label: picked.label }
      : ground
        ? { ...ground, label: 'İşaret' }
        : null;
    if (!target) return false;
    const result = toggleMark(this.markList, target);
    this.markList = result.marks;
    this.events.emit('drone:marked', { label: target.label, action: result.action });
    return true;
  }

  // ── Hedef sağlayıcısı ──

  targetsNear(x: number, z: number, r: number): HitTarget[] {
    const f = this.flight;
    if (!f || f.mode === 'falling' || Math.hypot(f.x - x, f.z - z) > r + DRONE.radius) return [];
    return [
      {
        id: DRONE_TARGET_ID,
        kind: 'drone',
        x: f.x,
        y: f.y - DRONE.height / 2,
        z: f.z,
        radius: DRONE.radius,
        height: DRONE.height,
      },
    ];
  }

  applyHit(id: string, damage: number, _from: HitSource): void {
    if (id !== DRONE_TARGET_ID || !this.flight) return;
    this.flight = damageDrone(this.flight, damage);
    this.events.emit('drone:damaged', { amount: damage, health: this.flight.health });
  }

  // ── Kayıt ──

  /**
   * Kayıt: uçuştaysa `landed` (drone zemindeki noktasına konur; yükleyen `drone` yapısını kurar), değilse `stowed`
   * (envanterdeki ya da zaten yapı olarak yerdeki drone kendi kaydıyla gelir).
   */
  toSave(groundAt: (x: number, z: number) => number): DroneSave {
    const f = this.flight;
    return {
      state: f ? 'landed' : 'stowed',
      x: f?.x ?? 0,
      y: f ? groundAt(f.x, f.z) : 0,
      z: f?.z ?? 0,
      battery: Math.min(Math.max(this.battery, 0), 1),
      marks: this.markList.map((m) => ({ ...m })),
    };
  }

  /** Kayıttan yükler (uçuş biter, görüş kapanır). Uçuşta kaydedilen drone'un yere konması Game'in işidir. */
  loadSave(save: DroneSave): void {
    this.flight = null;
    this.viewOn = false;
    this.battery = save.battery;
    this.markList = save.marks.slice(0, DRONE.maxMarks).map((m) => ({ ...m }));
  }
}
