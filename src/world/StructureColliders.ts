import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld';
import { isPieceKind, pieceVariantKey } from '../placement/pieces';
import {
  localToWorld,
  pieceColliderBoxes,
  solidBoxes,
  type LocalBox,
} from '../placement/structureShapes';
import {
  placementKey,
  type Structure,
  type StructureId,
  type StructureSet,
} from '../placement/structures';

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
      // ── 11.1 (A) ── modüler parçalar komşularına göre şekil alır (varyant imzaya eklenir; değişince yenilenir).
      const variant = isPieceKind(s.kind) ? pieceVariantKey(this.structures, s) : '';
      const key = variant ? `${placementKey(s)}|${variant}` : placementKey(s);
      const existing = this.entries.get(s.id);
      if (existing?.key === key) continue;
      if (existing) this.removeEntry(s.id, existing);
      const list = this.boxesOf(s, variant).map((b) => {
        const center = localToWorld(s, b.cx, b.cz);
        return this.physics.addStaticCollider(
          RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
            .setTranslation(center.x, s.y + b.cy, center.z)
            .setRotation(boxRotation(s.yaw, b.pitch ?? 0)),
        );
      });
      this.entries.set(s.id, { key, colliders: list });
    }
    for (const [id, entry] of this.entries) {
      if (!present.has(id)) this.removeEntry(id, entry);
    }
  }

  /** Yapının collider kutuları: modüler parçalarda eğik yüzeyli ve varyantlı (11.1), diğerlerinde `solidBoxes`. */
  private boxesOf(s: Readonly<Structure>, variant: string): LocalBox[] {
    return isPieceKind(s.kind)
      ? pieceColliderBoxes(s.kind, variant, s.open === true)
      : solidBoxes(s.kind, s.open === true);
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

/** Önce yerel X etrafında eğim (`pitch`), sonra yaw: q = q_yaw · q_pitch (Three.js `rotation.y` ile aynı sözleşme). */
function boxRotation(yaw: number, pitch: number): { x: number; y: number; z: number; w: number } {
  const sy = Math.sin(yaw / 2);
  const cy = Math.cos(yaw / 2);
  const sx = Math.sin(pitch / 2);
  const cx = Math.cos(pitch / 2);
  return { x: cy * sx, y: cx * sy, z: -sy * sx, w: cy * cx };
}
