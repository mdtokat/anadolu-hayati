import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { Camp, CampLayout } from '../bandits/camps';
import type { BanditView } from '../bandits/kinds';
import type { Pickpocket } from '../bandits/pickpocket';
import {
  buildBanditGeometry,
  buildPickpocketGeometry,
  type BanditGeometry,
} from './banditGeometry';
import { buildCampGeometry } from './campGeometry';
import { buildFlameGeometry } from './structureGeometry';

interface Node {
  root: Group;
  legs: [Mesh, Mesh];
  arms: [Mesh, Mesh];
}

interface CampNode {
  mesh: Mesh;
  flame: Mesh;
}

/** Adım evresinin yürüme mesafesine oranı (rad / oyun m) ve salınım genliği (rad). */
const STRIDE_RATE = 4.2;
const SWING = 0.6;

/** Kamp ateşinin titremesi (alev ölçeği). */
function flicker(time: number, id: number): number {
  return 0.5 * Math.sin(time * 9 + id) + 0.3 * Math.sin(time * 21 + id * 0.7);
}

/**
 * Eşkıyaların, yankesicilerin ve kampların çizimi (Faz 11, 11.6/11.7). Eşkıya başına küçük bir `Group` (gövde +
 * sallanan bacaklar/kollar; duruş: oturma, yatma, teslim, nişan); aynı anda en çok birkaç kamp canlı olduğundan
 * instancing gerekmez. Kamp başına tek birleşik mesh + alev (yanık kamp). Işık, yapı katmanının ateş ışığı havuzuna
 * katılır (Game). Kaynakları `dispose()` eder.
 */
export class BanditLayer {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  private readonly flameMaterial = new MeshBasicMaterial({ vertexColors: true });
  private readonly flameGeometry = buildFlameGeometry();
  private readonly geometries = new Map<string, BanditGeometry>();
  private readonly nodes = new Map<string, Node>();
  private readonly camps = new Map<number, CampNode>();

  constructor(private readonly heightAt: (x: number, z: number) => number) {
    this.group.name = 'bandits';
  }

  /** Eşkıyaları ve yankesicileri eşitler. */
  syncPeople(bandits: readonly BanditView[], pickpockets: readonly Pickpocket[]): void {
    const present = new Set<string>();
    for (const b of bandits) {
      const key = `b${b.id}`;
      present.add(key);
      const faction = b.faction ?? -1;
      const node = this.node(key, `${b.role}:${b.weapon}:${faction}`, () =>
        buildBanditGeometry(b.role, b.weapon, faction),
      );
      this.pose(node, b.x, b.y, b.z, b.yaw, b.state, b.speed > 0.05, b.stride);
    }
    for (const p of pickpockets) {
      const key = `p${p.id}`;
      present.add(key);
      const node = this.node(key, 'pickpocket', buildPickpocketGeometry);
      this.pose(node, p.x, p.y, p.z, p.yaw, 'walk', p.speed > 0.05, p.stride);
    }
    for (const [key, node] of this.nodes) {
      if (present.has(key)) continue;
      this.group.remove(node.root);
      this.nodes.delete(key);
    }
  }

  /** Çizilecek kampları eşitler (yakındakiler); `lit` kampta ateş yanar. */
  syncCamps(
    camps: ReadonlyArray<{ camp: Camp; layout: CampLayout; lit: boolean }>,
    time: number,
  ): void {
    const present = new Set<number>();
    for (const { camp, layout, lit } of camps) {
      present.add(camp.id);
      let node = this.camps.get(camp.id);
      if (!node) {
        const baseY = this.heightAt(camp.x, camp.z);
        const mesh = new Mesh(buildCampGeometry(camp, layout, this.heightAt, baseY), this.material);
        mesh.position.set(camp.x, baseY, camp.z);
        const flame = new Mesh(this.flameGeometry, this.flameMaterial);
        flame.position.set(
          layout.fire.x,
          this.heightAt(layout.fire.x, layout.fire.z),
          layout.fire.z,
        );
        node = { mesh, flame };
        this.camps.set(camp.id, node);
        this.group.add(mesh, flame);
      }
      node.flame.visible = lit;
      if (lit) node.flame.scale.y = 1 + 0.15 * flicker(time, camp.id);
    }
    for (const [id, node] of this.camps) {
      if (present.has(id)) continue;
      this.group.remove(node.mesh, node.flame);
      node.mesh.geometry.dispose();
      this.camps.delete(id);
    }
  }

  get stats(): { bandits: number; camps: number } {
    return { bandits: this.nodes.size, camps: this.camps.size };
  }

  dispose(): void {
    for (const g of this.geometries.values()) {
      g.body.dispose();
      g.leg.dispose();
      g.arm.dispose();
    }
    for (const node of this.camps.values()) node.mesh.geometry.dispose();
    this.camps.clear();
    this.flameGeometry.dispose();
    this.material.dispose();
    this.flameMaterial.dispose();
    this.group.clear();
    this.nodes.clear();
    this.group.removeFromParent();
  }

  private node(key: string, geometryKey: string, build: () => BanditGeometry): Node {
    let node = this.nodes.get(key);
    if (node) return node;
    let g = this.geometries.get(geometryKey);
    if (!g) {
      g = build();
      this.geometries.set(geometryKey, g);
    }
    const root = new Group();
    root.rotation.order = 'YXZ';
    root.add(new Mesh(g.body, this.material));
    const limb = (geometry: BanditGeometry['leg'], x: number, y: number) => {
      const mesh = new Mesh(geometry, this.material);
      mesh.position.set(x, y, 0);
      root.add(mesh);
      return mesh;
    };
    node = {
      root,
      legs: [limb(g.leg, -g.hipX, g.hipY), limb(g.leg, g.hipX, g.hipY)],
      arms: [limb(g.arm, -g.shoulderX, g.shoulderY), limb(g.arm, g.shoulderX, g.shoulderY)],
    };
    this.nodes.set(key, node);
    this.group.add(root);
    return node;
  }

  /** Duruş: yürüme salınımı, oturma, yatma (uyku/ölüm), teslim (eller yukarıda), nişan/hamle. */
  private pose(
    node: Node,
    x: number,
    y: number,
    z: number,
    yaw: number,
    state: string,
    moving: boolean,
    stride: number,
  ): void {
    // Model ön yüzü yerel +z; yaw'ın ilerisi (−sin, −cos): yarım tur farklı.
    node.root.position.set(x, y, z);
    node.root.rotation.set(0, yaw + Math.PI, 0);
    const swing = moving ? Math.sin(stride * STRIDE_RATE) * SWING : 0;
    let legs = [swing, -swing];
    let arms = [-swing * 0.8, swing * 0.8];
    switch (state) {
      case 'sit':
        node.root.position.y = y - 0.45;
        legs = [-1.4, -1.4];
        arms = [-0.3, -0.3];
        break;
      case 'sleep':
      case 'dead':
        node.root.rotation.x = -Math.PI / 2;
        node.root.position.y = y + 0.15;
        legs = [0, 0];
        arms = [0.1, -0.1];
        break;
      case 'surrender':
        arms = [Math.PI * 0.95, Math.PI * 0.95];
        legs = [0, 0];
        break;
      case 'shoot':
      case 'cover':
      case 'ambush':
        arms = [-1.4, -1.25];
        break;
      case 'attack':
        arms = [-0.3, -2.4];
        break;
    }
    node.legs[0].rotation.x = legs[0]!;
    node.legs[1].rotation.x = legs[1]!;
    node.arms[0].rotation.x = arms[0]!;
    node.arms[1].rotation.x = arms[1]!;
  }
}
