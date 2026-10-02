import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  type BufferGeometry,
} from 'three';
import { STRUCTURE_LOOK } from '../config';
import type { Ghost } from '../placement/PlacementController';
import {
  STRUCTURE_KINDS,
  isLit,
  placementKey,
  type StructureId,
  type StructureKind,
  type StructureSet,
} from '../placement/structures';
import {
  buildFlameGeometry,
  buildOpenDoorGeometry,
  buildStructureGeometry,
} from './structureGeometry';

/** Dev göstergesi / test için anlık sayımlar. */
export interface StructureLayerStats {
  structures: number;
  /** Yanan ateş sayısı. */
  lit: number;
  /** Şu an ışık atanmış ateş sayısı (en çok `STRUCTURE_LOOK.fire.lightPool`). */
  lights: number;
}

interface Node {
  /** Yerleşim imzası (`placementKey`): kayıt yüklenince aynı kimlikli başka yapı yeniden kurulur. */
  key: string;
  root: Group;
  /** Yalnızca kamp ateşinde. */
  flame: Mesh | null;
}

const FIRE = STRUCTURE_LOOK.fire;

/**
 * Yerleştirilmiş yapıların (kamp ateşi, sundurma; Faz 9: tezgâh, sandık, kulübe) ve yerleştirme hayaletinin çizimi. Her yapı kendi küçük
 * `Group`'udur (geometri türe göre paylaşılır); yanık ateşte alev görünür ve en yakın `lightPool` ateşe
 * sabit bir `PointLight` havuzundan ışık atanır (ışık sayısı değişmez: shader yeniden derlenmez). Katı yapıların
 * collider'ları ayrıdır (`StructureColliders`). Kaynakları `dispose()` eder.
 */
export class StructureLayer {
  readonly group = new Group();

  private readonly geometries: Record<StructureKind, BufferGeometry>;
  private readonly flameGeometry = buildFlameGeometry();
  /** Açık kapı kanadı (kapalı olan `geometries.door`). */
  private readonly openDoorGeometry = buildOpenDoorGeometry();
  private readonly bodyMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  private readonly flameMaterial = new MeshBasicMaterial({ vertexColors: true });
  private readonly ghostMaterials = {
    valid: new MeshBasicMaterial({
      color: STRUCTURE_LOOK.ghost.validColor,
      transparent: true,
      opacity: STRUCTURE_LOOK.ghost.opacity,
      depthWrite: false,
    }),
    invalid: new MeshBasicMaterial({
      color: STRUCTURE_LOOK.ghost.invalidColor,
      transparent: true,
      opacity: STRUCTURE_LOOK.ghost.opacity,
      depthWrite: false,
    }),
  };
  private readonly nodes = new Map<StructureId, Node>();
  private readonly lights: PointLight[] = [];
  private readonly ghosts = new Map<StructureKind, Mesh>();
  private syncedVersion = -1;
  private litCount = 0;
  private assigned = 0;

  constructor(private readonly structures: StructureSet) {
    this.geometries = Object.fromEntries(
      STRUCTURE_KINDS.map((kind) => [kind, buildStructureGeometry(kind)]),
    ) as Record<StructureKind, BufferGeometry>;
    for (let i = 0; i < FIRE.lightPool; i++) {
      const light = new PointLight(FIRE.lightColor, 0, FIRE.distance, 2);
      this.lights.push(light);
      this.group.add(light);
    }
    for (const kind of STRUCTURE_KINDS) {
      const mesh = new Mesh(this.geometries[kind], this.ghostMaterials.valid);
      mesh.visible = false;
      mesh.renderOrder = 10;
      this.ghosts.set(kind, mesh);
      this.group.add(mesh);
    }
  }

  get stats(): StructureLayerStats {
    return { structures: this.nodes.size, lit: this.litCount, lights: this.assigned };
  }

  /** Her render karesinde: yapı kümesi değiştiyse mesh'leri eşitler; ışıkları en yakın ateşlere dağıtır. */
  update(timeSeconds: number, focusX: number, focusZ: number): void {
    this.sync();
    this.assignLights(timeSeconds, focusX, focusZ);
  }

  /** Hayaleti gösterir (geçerli: yeşil, geçersiz: kırmızı) ya da gizler. */
  setGhost(ghost: Readonly<Ghost> | null): void {
    for (const [kind, mesh] of this.ghosts) {
      const active = ghost !== null && ghost.kind === kind;
      mesh.visible = active;
      if (active) {
        mesh.position.set(ghost.x, ghost.y, ghost.z);
        mesh.rotation.y = ghost.yaw;
        mesh.material = ghost.valid ? this.ghostMaterials.valid : this.ghostMaterials.invalid;
      }
    }
  }

  dispose(): void {
    for (const node of this.nodes.values()) node.root.removeFromParent();
    this.nodes.clear();
    for (const light of this.lights) light.dispose();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.flameGeometry.dispose();
    this.openDoorGeometry.dispose();
    this.bodyMaterial.dispose();
    this.flameMaterial.dispose();
    this.ghostMaterials.valid.dispose();
    this.ghostMaterials.invalid.dispose();
    this.group.removeFromParent();
  }

  private sync(): void {
    if (this.syncedVersion === this.structures.version) return;
    this.syncedVersion = this.structures.version;

    const present = new Set<StructureId>();
    this.litCount = 0;
    for (const s of this.structures.all()) {
      present.add(s.id);
      const key = placementKey(s);
      let node = this.nodes.get(s.id);
      if (node && node.key !== key) {
        node.root.removeFromParent();
        node = undefined;
      }
      if (!node) {
        node = this.createNode(key, s.kind, s.x, s.y, s.z, s.yaw, s.open === true);
        this.nodes.set(s.id, node);
      }
      const lit = isLit(s);
      if (node.flame) node.flame.visible = lit;
      if (lit) this.litCount += 1;
    }
    for (const [id, node] of this.nodes) {
      if (present.has(id)) continue;
      node.root.removeFromParent();
      this.nodes.delete(id);
    }
  }

  private createNode(
    key: string,
    kind: StructureKind,
    x: number,
    y: number,
    z: number,
    yaw: number,
    open: boolean,
  ): Node {
    const root = new Group();
    root.position.set(x, y, z);
    root.rotation.y = yaw;
    const geometry = kind === 'door' && open ? this.openDoorGeometry : this.geometries[kind];
    root.add(new Mesh(geometry, this.bodyMaterial));
    let flame: Mesh | null = null;
    if (kind === 'campfire') {
      flame = new Mesh(this.flameGeometry, this.flameMaterial);
      root.add(flame);
    }
    this.group.add(root);
    return { key, root, flame };
  }

  /** Yanık ateşleri odağa yakınlığa göre sıralar; en yakın `lightPool` tanesine ışık verir, kalanları söndürür. */
  private assignLights(time: number, focusX: number, focusZ: number): void {
    const range = FIRE.lightRange ** 2;
    const lit = this.structures
      .all()
      .filter(isLit)
      .map((s) => ({ s, d: (s.x - focusX) ** 2 + (s.z - focusZ) ** 2 }))
      .filter((e) => e.d <= range)
      .sort((a, b) => a.d - b.d || a.s.id - b.s.id)
      .slice(0, this.lights.length);

    this.assigned = lit.length;
    this.lights.forEach((light, i) => {
      const entry = lit[i];
      if (!entry) {
        light.intensity = 0;
        return;
      }
      const { s } = entry;
      const flicker = flickerAt(time, s.id);
      light.position.set(s.x, s.y + FIRE.height, s.z);
      light.intensity = FIRE.intensity * (1 + FIRE.flicker * flicker);
      const node = this.nodes.get(s.id);
      if (node?.flame) node.flame.scale.y = 1 + 0.12 * flicker;
    });
  }
}

/** −1…1 arası titreme (kimliğe bağlı evreli, birkaç sinüsün toplamı). */
export function flickerAt(timeSeconds: number, id: number): number {
  const t = timeSeconds * FIRE.flickerSpeed;
  return (
    0.5 * Math.sin(t + id * 1.7) + 0.3 * Math.sin(t * 2.3 + id * 0.6) + 0.2 * Math.sin(t * 3.7 + id)
  );
}
