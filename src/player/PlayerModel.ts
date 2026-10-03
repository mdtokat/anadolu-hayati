import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { HELD_ITEM, PLAYER, PLAYER_MODEL } from '../config';
import type { Vec3 } from './movement';

/**
 * Üçüncü şahıs görünümünde çizilen basit oyuncu modeli (kapsül + yön göstergesi + sağ kol). Kol omuzdan sarkar
 * (`arm`: omuz ekseni, X çevresinde öne kalkar); kolun ucundaki `hand` eşyanın tutulduğu yerdir (`HeldItem`).
 */
export class PlayerModel {
  readonly object = new Group();
  /** Omuz ekseni: `rotation.x` kolu öne kaldırır (0 sarkık, π/2 yatay ileri). */
  readonly arm = new Group();
  /** Kolun ucu; `HeldItem` eşyayı buraya bağlar (kol dönüşü ters çevrilerek model eksenlerine hizalanır). */
  readonly hand = new Group();

  private readonly body: Mesh<CapsuleGeometry, MeshStandardMaterial>;
  private readonly nose: Mesh<BoxGeometry, MeshStandardMaterial>;
  private readonly armMesh: Mesh<BoxGeometry, MeshStandardMaterial>;

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

    // Sağ kol: omuzdan aşağı uzanan kutu (kapsülden biraz dışarıda), ucunda el noktası.
    const length = HELD_ITEM.armLength;
    this.armMesh = new Mesh(
      new BoxGeometry(0.11, length, 0.11),
      new MeshStandardMaterial({ color: PLAYER_MODEL.bodyColor }),
    );
    this.armMesh.position.y = -length / 2;
    this.hand.position.y = -length;
    this.arm.position.set(HELD_ITEM.shoulder.x, HELD_ITEM.shoulder.y, 0);
    this.arm.add(this.armMesh, this.hand);

    this.object.add(this.body, this.nose, this.arm);
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
    for (const mesh of [this.body, this.nose, this.armMesh]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.object.clear();
  }
}
