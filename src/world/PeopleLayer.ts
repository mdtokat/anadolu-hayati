import { Group, Mesh, MeshStandardMaterial } from 'three';
import type { Person } from '../people/PeopleSystem';
import { PERSON_ROLES, type PersonRole } from '../people/roles';
import { buildPersonGeometry, type PersonGeometry } from './personGeometry';

interface Node {
  root: Group;
  legs: [Mesh, Mesh];
  arms: [Mesh, Mesh];
}

/** Adım evresinin yürüme mesafesine oranı (rad / oyun m) ve salınım genliği (rad). */
const STRIDE_RATE = 4.2;
const SWING = 0.55;

/**
 * Diğer insanların çizimi (Faz 10): kişi başına küçük bir `Group` (gövde + sallanan bacaklar ve kollar).
 * Aynı anda en çok birkaç kişi olduğundan instancing gerekmez. Geometriler rol başına paylaşılır.
 */
export class PeopleLayer {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  private readonly geometries = new Map<PersonRole, PersonGeometry>();
  private readonly nodes = new Map<number, Node>();

  constructor() {
    this.group.name = 'people';
    for (const role of PERSON_ROLES) this.geometries.set(role, buildPersonGeometry(role));
  }

  sync(people: readonly Person[]): void {
    const present = new Set<number>();
    for (const p of people) {
      present.add(p.id);
      let node = this.nodes.get(p.id);
      if (!node) {
        node = this.create(p.role);
        this.nodes.set(p.id, node);
        this.group.add(node.root);
      }
      node.root.position.set(p.x, p.y, p.z);
      // Model ön yüzü yerel +z; kişinin yaw'ı (ileri = (−sin, −cos)) ile yarım tur farklı.
      node.root.rotation.y = p.yaw + Math.PI;
      const swing = p.moving ? Math.sin(p.stride * STRIDE_RATE) * SWING : 0;
      node.legs[0].rotation.x = swing;
      node.legs[1].rotation.x = -swing;
      node.arms[0].rotation.x = -swing * 0.8;
      node.arms[1].rotation.x = swing * 0.8;
    }
    for (const [id, node] of this.nodes) {
      if (present.has(id)) continue;
      this.group.remove(node.root);
      this.nodes.delete(id);
    }
  }

  private create(role: PersonRole): Node {
    const g = this.geometries.get(role) as PersonGeometry;
    const root = new Group();
    root.add(new Mesh(g.body, this.material));
    const limb = (geometry: PersonGeometry['leg'], x: number, y: number) => {
      const mesh = new Mesh(geometry, this.material);
      mesh.position.set(x, y, 0);
      root.add(mesh);
      return mesh;
    };
    return {
      root,
      legs: [limb(g.leg, -g.hipX, g.hipY), limb(g.leg, g.hipX, g.hipY)],
      arms: [limb(g.arm, -g.shoulderX, g.shoulderY), limb(g.arm, g.shoulderX, g.shoulderY)],
    };
  }

  dispose(): void {
    for (const g of this.geometries.values()) {
      g.body.dispose();
      g.leg.dispose();
      g.arm.dispose();
    }
    this.material.dispose();
    this.group.clear();
    this.nodes.clear();
  }
}
