import {
  BoxGeometry,
  Color,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { CREATURE_LOOK, CREATURES } from '../config';
import { CREATURE_KINDS, type CreatureKind, type CreatureView } from '../creatures/kinds';

/** Dev göstergesi / test için anlık sayımlar. */
export interface CreatureLayerStats {
  /** Şu an çizilen canlı sayısı. */
  instances: number;
  /** Tür başına mesh sayısı kadar (= draw call). */
  meshes: number;
}

/** Yer tutucu kutunun gövde uzunluğu / yarıçap oranı. */
const BODY_LENGTH_FACTOR = 1.6;

/**
 * Canlıların çizimi: `CreatureView[]` tüketir, hiçbir simülasyon mantığı içermez. **İskelet (5.0):** tür başına
 * tek `InstancedMesh` ve düz renkli kutu (yer tutucu); 5.10'da Hesap B gerçek parçalı modellerle değiştirir
 * (arayüz aynı kalır). Kaynakları `dispose()` eder.
 */
export class CreatureLayer {
  readonly group = new Group();

  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshStandardMaterial({ roughness: 1 });
  private readonly meshes = new Map<CreatureKind, InstancedMesh>();
  private drawn = 0;

  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly euler = new Euler();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly base = new Color();
  private readonly hit = new Color(CREATURE_LOOK.hitColor);

  constructor() {
    for (const kind of CREATURE_KINDS) {
      const mesh = new InstancedMesh(this.geometry, this.material, CREATURES.maxActive);
      mesh.count = 0;
      mesh.frustumCulled = false; // en çok `maxActive` örnek; sınır küresi hesabına değmez
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
  }

  /** Canlıların konum/yönünü ve vurulma parlamasını yazar. */
  update(views: ReadonlyArray<CreatureView>): void {
    const counts = new Map<CreatureKind, number>();
    let drawn = 0;
    for (const view of views) {
      const mesh = this.meshes.get(view.kind);
      if (!mesh) continue;
      const index = counts.get(view.kind) ?? 0;
      if (index >= CREATURES.maxActive) continue;
      counts.set(view.kind, index + 1);
      drawn += 1;

      const height = view.dead ? view.height * CREATURE_LOOK.deadHeightFactor : view.height;
      this.position.set(view.x, view.y + height / 2, view.z);
      this.euler.set(0, view.yaw, 0);
      this.quaternion.setFromEuler(this.euler);
      this.scale.set(view.radius * 2, height, view.radius * 2 * BODY_LENGTH_FACTOR);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(index, this.matrix);

      this.base.set(CREATURE_LOOK.colors[view.kind]).lerp(this.hit, view.hitFlash);
      mesh.setColorAt(index, this.base);
    }
    for (const kind of CREATURE_KINDS) {
      const mesh = this.meshes.get(kind) as InstancedMesh;
      mesh.count = counts.get(kind) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.drawn = drawn;
  }

  get stats(): CreatureLayerStats {
    return { instances: this.drawn, meshes: this.meshes.size };
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.group.remove(mesh);
      mesh.dispose();
    }
    this.meshes.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
