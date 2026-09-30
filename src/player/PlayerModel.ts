import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { PLAYER, PLAYER_MODEL } from '../config';
import type { Vec3 } from './movement';

/** Üçüncü şahıs görünümünde çizilen basit oyuncu modeli (kapsül + yön göstergesi). */
export class PlayerModel {
  readonly object = new Group();

  private readonly body: Mesh<CapsuleGeometry, MeshStandardMaterial>;
  private readonly nose: Mesh<BoxGeometry, MeshStandardMaterial>;

  constructor() {
    this.body = new Mesh(
      new CapsuleGeometry(PLAYER.radius, PLAYER.height - 2 * PLAYER.radius, 6, 12),
      new MeshStandardMaterial({ color: PLAYER_MODEL.bodyColor }),
    );
    this.body.position.y = PLAYER.height / 2;

    // Burun −Z'ye (yaw = 0'da ileri) bakar.
    this.nose = new Mesh(
      new BoxGeometry(0.16, 0.16, 0.3),
      new MeshStandardMaterial({ color: PLAYER_MODEL.noseColor }),
    );
    this.nose.position.set(0, PLAYER.eyeHeight, -PLAYER.radius);

    this.object.add(this.body, this.nose);
    this.object.visible = false;
  }

  /** Yalnızca üçüncü şahısta görünür. */
  setVisible(visible: boolean): void {
    this.object.visible = visible;
  }

  update(feet: Vec3, yaw: number): void {
    this.object.position.set(feet.x, feet.y, feet.z);
    this.object.rotation.y = yaw;
  }

  dispose(): void {
    for (const mesh of [this.body, this.nose]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.object.clear();
  }
}
