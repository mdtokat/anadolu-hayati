import { PerspectiveCamera } from 'three';
import { CAMERA, INPUT, PLAYER } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { HeightSource } from '../world/HeightSource';
import { applyLook, normalizeLook, thirdPersonOffset, type Look } from './cameraMath';
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
  /** Kullanıcı ayarından gelen hassasiyet çarpanı (`INPUT.mouseSensitivity` ile çarpılır). */
  private sensitivityScale = 1;
  // ── Faz 11.5 (D): nişan ve dürbün ──
  /** Nişan görüş açısı (derece), hassasiyet çarpanı ve nişanda birinci şahsa geçiş. */
  private aimFovDeg: number = CAMERA.fov;
  private aimSensitivity = 1;
  private aimFirstPerson = false;
  /** Bakışa yalnızca görüntüde eklenen kayma (dürbün salınımı; radyan). */
  private viewOffset = { yaw: 0, pitch: 0 };

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

  /** Görüntü birinci şahıstan mı (seçili mod ya da nişan)? */
  get viewFirstPerson(): boolean {
    return this.cameraMode === 'firstPerson' || this.aimFirstPerson;
  }

  /**
   * Faz 11.5: nişan durumu. `fovDeg` görüş açısı (nişanda daralır), `sensitivity` fare hassasiyeti çarpanı,
   * `firstPerson` üçüncü şahısta nişan alınca görüntü göz hizasına geçer (nişangâh bakış çizgisinde kalsın).
   */
  setAim(fovDeg: number, sensitivity: number, firstPerson: boolean): void {
    this.aimFovDeg = Number.isFinite(fovDeg) && fovDeg > 1 ? fovDeg : CAMERA.fov;
    this.aimSensitivity = Number.isFinite(sensitivity) && sensitivity > 0 ? sensitivity : 1;
    this.aimFirstPerson = firstPerson;
  }

  /** Faz 11.5: dürbün salınımı gibi yalnızca görüntüye eklenen bakış kayması (radyan). */
  setViewOffset(yaw: number, pitch: number): void {
    this.viewOffset = { yaw, pitch };
  }

  /** Faz 11.5: silah tepmesi: bakışı `pitch` radyan yukarı iter (sınırlar korunur). */
  kick(pitch: number, yaw = 0): void {
    if (pitch === 0 && yaw === 0) return;
    this.look = normalizeLook({ yaw: this.look.yaw + yaw, pitch: this.look.pitch + pitch });
  }

  /** Fare hassasiyeti çarpanı (1 = varsayılan); geçersiz değerde 1'e döner. */
  setSensitivityScale(scale: number): void {
    this.sensitivityScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  /** Bakışı doğrudan ayarlar (kayıt yükleme); açılar geçerli aralığa getirilir. */
  setLook(yaw: number, pitch: number): void {
    this.look = normalizeLook({ yaw, pitch });
  }

  /** Fare hareketini (piksel) bakışa uygular. */
  applyMouse(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.look = applyLook(
      this.look,
      dx,
      dy,
      INPUT.mouseSensitivity * this.sensitivityScale * this.aimSensitivity,
    );
  }

  toggleMode(): void {
    this.cameraMode = this.cameraMode === 'firstPerson' ? 'thirdPerson' : 'firstPerson';
    this.events.emit('camera:modeChanged', { mode: this.cameraMode });
  }

  /** Kamerayı oyuncunun (ayak tabanı) konumuna göre yerleştirir. */
  update(feet: Vec3): void {
    const { yaw, pitch } = this.look;
    if (this.camera.fov !== this.aimFovDeg) {
      this.camera.fov = this.aimFovDeg;
      this.camera.updateProjectionMatrix();
    }

    if (this.viewFirstPerson) {
      this.camera.position.set(feet.x, feet.y + PLAYER.eyeHeight, feet.z);
      this.camera.rotation.set(pitch + this.viewOffset.pitch, yaw + this.viewOffset.yaw, 0);
      return;
    }

    const pivot = { x: feet.x, y: feet.y + CAMERA.thirdPersonPivotHeight, z: feet.z };
    // Tünelde (ayak arazi yüzeyinin belirgin altında) kamera yakına gelir ve arazi yüzeyine itilmez: dağın üstüne
    // fırlamasın.
    const underground = feet.y < this.terrain.heightAt(feet.x, feet.z) - CAMERA.undergroundDepth;
    const offset = thirdPersonOffset(
      this.look,
      underground ? CAMERA.undergroundDistance : CAMERA.thirdPersonDistance,
    );
    const x = pivot.x + offset.x;
    const z = pivot.z + offset.z;
    // Yukarı bakarken kamera oyuncunun altına iner; yerin içine girmesin.
    const y = underground
      ? Math.max(pivot.y + offset.y, feet.y + 0.4)
      : Math.max(
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
