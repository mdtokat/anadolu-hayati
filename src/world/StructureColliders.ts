import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld';
import { localToWorld, solidBoxes } from '../placement/structureShapes';
import { placementKey, type StructureId, type StructureSet } from '../placement/structures';

interface Entry {
  key: string;
  colliders: RAPIER.Collider[];
}

/**
 * Katı yapıların (sandık, tezgâh, kulübe duvarları; Faz 9) Rapier collider'ları. Yapı kümesi değişince
 * (`StructureSet.version`) eşitlenir: yeni yapıya kutular eklenir, sökülen/yüklemede kalkan yapınınkiler silinir.
 * Yapılar az olduğundan hepsi her zaman kuruludur (chunk'a bağlı değil). Canlılar kinematiktir, etkilenmez.
 */
export class StructureColliders {
  private readonly entries = new Map<StructureId, Entry>();
  private syncedVersion = -1;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly structures: StructureSet,
  ) {}

  /** Kurulu collider sayısı (test/dev). */
  get count(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.colliders.length;
    return total;
  }

  /** Yapı kümesiyle eşitler (değişiklik yoksa hiçbir şey yapmaz). */
  sync(): void {
    if (this.syncedVersion === this.structures.version) return;
    this.syncedVersion = this.structures.version;

    const present = new Set<StructureId>();
    for (const s of this.structures.all()) {
      present.add(s.id);
      const key = placementKey(s);
      const existing = this.entries.get(s.id);
      if (existing?.key === key) continue;
      if (existing) this.removeEntry(s.id, existing);
      const half = s.yaw / 2;
      const rotation = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
      const list = solidBoxes(s.kind).map((b) => {
        const center = localToWorld(s, b.cx, b.cz);
        return this.physics.addStaticCollider(
          RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
            .setTranslation(center.x, s.y + b.cy, center.z)
            .setRotation(rotation),
        );
      });
      this.entries.set(s.id, { key, colliders: list });
    }
    for (const [id, entry] of this.entries) {
      if (!present.has(id)) this.removeEntry(id, entry);
    }
  }

  dispose(): void {
    for (const [id, entry] of this.entries) this.removeEntry(id, entry);
    this.syncedVersion = -1;
  }

  private removeEntry(id: StructureId, entry: Entry): void {
    for (const collider of entry.colliders) this.physics.removeCollider(collider);
    this.entries.delete(id);
  }
}
