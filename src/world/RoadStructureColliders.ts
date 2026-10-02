import { ROAD_STRUCTURES } from '../config';
import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld';
import { StructureIndex, boxBasis } from './roadStructureGeometry';

/** Yeniden eşitleme için oyuncunun yer değiştirmesi (oyun m). */
const RESYNC_DISTANCE = 8;

/** Sağ-el baz (x = yan, y = yukarı, z = ileri) → birim kuaterniyon. */
function quaternionOf(
  r: readonly [number, number, number],
  u: readonly [number, number, number],
  f: readonly [number, number, number],
): { x: number; y: number; z: number; w: number } {
  // Dönüşüm matrisinin sütunları r, u, f.
  const m00 = r[0],
    m01 = u[0],
    m02 = f[0];
  const m10 = r[1],
    m11 = u[1],
    m12 = f[1];
  const m20 = r[2],
    m21 = u[2],
    m22 = f[2];
  const trace = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  return { x, y, z, w };
}

/**
 * Köprü collider'ları: yalnızca oyuncuya `ROAD_STRUCTURES.colliderRadius` içindeki yapılar için kurulur
 * (chunk collider'ları gibi akışlı). Çizilen kutuların `solid` olanları aynen çarpışır.
 */
export class RoadStructureColliders {
  private readonly entries = new Map<number, RAPIER.Collider[]>();
  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly index: StructureIndex,
  ) {}

  get count(): number {
    let n = 0;
    for (const list of this.entries.values()) n += list.length;
    return n;
  }

  update(x: number, z: number, force = false): void {
    if (!force && Math.hypot(x - this.lastX, z - this.lastZ) < RESYNC_DISTANCE) return;
    this.lastX = x;
    this.lastZ = z;
    const wanted = new Set<number>(this.index.near(x, z, ROAD_STRUCTURES.colliderRadius));
    for (const id of wanted) {
      if (!this.entries.has(id)) this.entries.set(id, this.create(id));
    }
    for (const [id, list] of this.entries) {
      if (wanted.has(id)) continue;
      for (const c of list) this.physics.removeCollider(c);
      this.entries.delete(id);
    }
  }

  private create(id: number): RAPIER.Collider[] {
    const out: RAPIER.Collider[] = [];
    for (const box of this.index.shape(id).boxes) {
      if (!box.solid) continue;
      const { r, u, f } = boxBasis(box);
      out.push(
        this.physics.addStaticCollider(
          RAPIER.ColliderDesc.cuboid(box.hw, box.hh, box.hl)
            .setTranslation(box.x, box.y, box.z)
            .setRotation(quaternionOf(r, u, f)),
        ),
      );
    }
    return out;
  }

  dispose(): void {
    for (const list of this.entries.values()) for (const c of list) this.physics.removeCollider(c);
    this.entries.clear();
  }
}
