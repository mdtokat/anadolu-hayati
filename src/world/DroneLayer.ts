import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { CAMERA, DRONE } from '../config';
import type { DroneState } from '../drone/flight';
import { ROTOR_POSITIONS, buildDroneGeometry, buildRotorGeometry } from './droneGeometry';

/**
 * Uçan drone'un çizimi ve drone kamerası (Faz 11, 11.8). Drone görüşündeyken kamera drone'un altındaki kamera
 * kubbesindedir (gövde gizlenir); yaw drone'un, eğim ve görüş açısı drone sisteminin kamera değerleridir. Yere inmiş
 * drone yapı katmanında (`drone` yapısı) çizilir. Kaynakları `dispose()` eder.
 */
export class DroneLayer {
  readonly group = new Group();
  readonly camera = new PerspectiveCamera(DRONE.fovDeg, 1, CAMERA.near, CAMERA.far);
  private readonly material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0.2,
  });
  private readonly body = buildDroneGeometry();
  private readonly rotorGeometry = buildRotorGeometry();
  private readonly rotors: Mesh[] = [];

  constructor() {
    this.group.name = 'drone';
    this.group.visible = false;
    this.group.add(new Mesh(this.body, this.material));
    for (const [x, y, z] of ROTOR_POSITIONS) {
      const rotor = new Mesh(this.rotorGeometry, this.material);
      rotor.position.set(x, y + 0.01, z);
      this.rotors.push(rotor);
      this.group.add(rotor);
    }
    this.camera.rotation.order = 'YXZ';
  }

  /** Drone'u (uçuyorsa) yerleştirir, pervaneleri döndürür; kamerayı drone'a bağlar. */
  update(
    state: Readonly<DroneState> | null,
    view: { active: boolean; pitch: number; fovDeg: number; aspect: number },
    time: number,
  ): void {
    this.group.visible = state !== null && !view.active;
    if (!state) return;
    // Model ön yüzü yerel −z (kamera kubbesi); oyuncu yaw sözleşmesiyle aynı yön.
    this.group.position.set(state.x, state.y - 0.2, state.z);
    this.group.rotation.set(
      -0.15 * Math.min(Math.hypot(state.vx, state.vz) / DRONE.speed, 1),
      state.yaw,
      0,
      'YXZ',
    );
    const spin = state.mode === 'falling' ? 0 : time * DRONE.rotorSpeed;
    this.rotors.forEach((r, i) => (r.rotation.y = i % 2 === 0 ? spin : -spin));

    this.camera.position.set(state.x, state.y - 0.12, state.z);
    this.camera.rotation.set(view.pitch, state.yaw, 0);
    if (this.camera.fov !== view.fovDeg || this.camera.aspect !== view.aspect) {
      this.camera.fov = view.fovDeg;
      this.camera.aspect = view.aspect;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.body.dispose();
    this.rotorGeometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
