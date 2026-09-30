import { PerspectiveCamera } from 'three';
import { CAMERA, INPUT, PLAYER } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { HeightSource } from '../world/HeightSource';
import { applyLook, thirdPersonOffset, type Look } from './cameraMath';
import type { Vec3 } from './movement';

export type CameraMode = 'firstPerson' | 'thirdPerson';

/**
 * Oyuncu kamerası: birinci şahıs (göz hizası) ve `V` ile üçüncü şahıs (omuz hizasındaki
 * odak noktasının arkasında). Bakış açıları (yaw/pitch) burada tutulur; oyuncu hareketi
 * `yaw`'ı okur.
 */
export class PlayerCamera {
  readonly camera: PerspectiveCamera;
  private look: Look = { yaw: 0, pitch: 0 };
  private cameraMode: CameraMode = 'firstPerson';

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly terrain: HeightSource,
  ) {
    this.camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.camera.rotation.order = 'YXZ'; // önce yaw, sonra pitch: roll oluşmaz
  }

  get mode(): CameraMode {
    return this.cameraMode;
  }

  get yaw(): number {
    return this.look.yaw;
  }

  get pitch(): number {
    return this.look.pitch;
  }

  /** Fare hareketini (piksel) bakışa uygular. */
  applyMouse(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.look = applyLook(this.look, dx, dy, INPUT.mouseSensitivity);
  }

  toggleMode(): void {
    this.cameraMode = this.cameraMode === 'firstPerson' ? 'thirdPerson' : 'firstPerson';
    this.events.emit('camera:modeChanged', { mode: this.cameraMode });
  }

  /** Kamerayı oyuncunun (ayak tabanı) konumuna göre yerleştirir. */
  update(feet: Vec3): void {
    const { yaw, pitch } = this.look;

    if (this.cameraMode === 'firstPerson') {
      this.camera.position.set(feet.x, feet.y + PLAYER.eyeHeight, feet.z);
      this.camera.rotation.set(pitch, yaw, 0);
      return;
    }

    const pivot = { x: feet.x, y: feet.y + CAMERA.thirdPersonPivotHeight, z: feet.z };
    const offset = thirdPersonOffset(this.look, CAMERA.thirdPersonDistance);
    const x = pivot.x + offset.x;
    const z = pivot.z + offset.z;
    // Yukarı bakarken kamera oyuncunun altına iner; yerin içine girmesin.
    const y = Math.max(
      pivot.y + offset.y,
      this.terrain.heightAt(x, z) + CAMERA.thirdPersonGroundClearance,
    );
    this.camera.position.set(x, y, z);
    this.camera.lookAt(pivot.x, pivot.y, pivot.z);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }
}
