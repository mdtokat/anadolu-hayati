import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Pickup } from '../battleRoyale/loot';
import { commitInstances, markDynamic } from './instancing';

/** En çok çizilen sandık ve çanta sayısı (oyuncuya yakın olanlar). */
const CAPACITY = 64;

/**
 * Battle Royale yerdeki ganimeti (BR.6): ganimet sandıkları (tahta kasa) ve uzakta ölenlerin çantaları (koyu çanta);
 * oyuncuya yakın olanlar iki örnekli mesh'le çizilir (2 draw call). Konum ve dönüş anahtardan sabittir.
 */
export class PickupLayer {
  readonly crates: InstancedMesh;
  readonly bags: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly scale = new Vector3(1, 1, 1);

  constructor(private readonly heightAt: (x: number, z: number) => number) {
    const crateGeometry = new BoxGeometry(0.9, 0.6, 0.6);
    crateGeometry.translate(0, 0.3, 0);
    const bagGeometry = new BoxGeometry(0.5, 0.32, 0.38);
    bagGeometry.translate(0, 0.16, 0);
    this.crates = new InstancedMesh(
      crateGeometry,
      new MeshStandardMaterial({ color: new Color('#9a6a36'), roughness: 0.9 }),
      CAPACITY,
    );
    this.bags = new InstancedMesh(
      bagGeometry,
      new MeshStandardMaterial({ color: new Color('#3e4a3a'), roughness: 0.95 }),
      CAPACITY,
    );
    for (const mesh of [this.crates, this.bags]) {
      mesh.name = 'br-pickups';
      mesh.frustumCulled = false;
      markDynamic(mesh);
      commitInstances(mesh, 0);
    }
  }

  /** Yakındaki ganimetleri çizer (yakından uzağa sıralı liste). */
  sync(pickups: readonly Pickup[]): void {
    let crates = 0;
    let bags = 0;
    for (const p of pickups) {
      const crate = p.kind === 'crate';
      if ((crate ? crates : bags) >= CAPACITY) continue;
      const yaw = (hash(p.key) % 628) / 100;
      this.position.set(p.x, this.heightAt(p.x, p.z), p.z);
      this.rotation.setFromAxisAngle(this.up, yaw);
      this.matrix.compose(this.position, this.rotation, this.scale);
      if (crate) this.crates.setMatrixAt(crates++, this.matrix);
      else this.bags.setMatrixAt(bags++, this.matrix);
    }
    commitInstances(this.crates, crates);
    commitInstances(this.bags, bags);
  }

  dispose(): void {
    for (const mesh of [this.crates, this.bags]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
  }
}

function hash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  return h;
}
