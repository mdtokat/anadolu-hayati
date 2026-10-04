import { ROAD_SIGNS } from '../config';
import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld';
import type { RoadSign } from '../settlements/roadSigns';
import { signPostBoxes } from './roadSignGeometry';

/** Yeniden eşitleme için oyuncunun yer değiştirmesi (oyun m). */
const RESYNC_DISTANCE = 8;

/** Levha direklerinin collider'ları: yalnızca oyuncuya `ROAD_SIGNS.colliderRadius` içindeki levhalar için. */
export class RoadSignColliders {
  private readonly entries = new Map<number, RAPIER.Collider[]>();
  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly signs: readonly RoadSign[],
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
    const r2 = ROAD_SIGNS.colliderRadius ** 2;
    const wanted = new Set<number>();
    this.signs.forEach((s, i) => {
      if ((s.x - x) ** 2 + (s.z - z) ** 2 <= r2) wanted.add(i);
    });
    for (const id of wanted) {
      if (!this.entries.has(id)) this.entries.set(id, this.create(this.signs[id] as RoadSign));
    }
    for (const [id, list] of this.entries) {
      if (wanted.has(id)) continue;
      for (const c of list) this.physics.removeCollider(c);
      this.entries.delete(id);
    }
  }

  private create(sign: RoadSign): RAPIER.Collider[] {
    return signPostBoxes(sign).map((b) =>
      this.physics.addStaticCollider(
        RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.x, b.y, b.z),
      ),
    );
  }

  dispose(): void {
    for (const list of this.entries.values()) for (const c of list) this.physics.removeCollider(c);
    this.entries.clear();
  }
}
