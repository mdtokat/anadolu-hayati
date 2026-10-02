import { BUILDING_LOOK } from '../config';
import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld';
import { BUILDING_SHAPES } from '../settlements/kinds';
import type { Building } from '../settlements/layout';
import { buildingLocalToWorld, type SettlementMap, type Stair } from '../settlements/SettlementMap';

/** Yeniden eşitleme için oyuncunun yer değiştirmesi (oyun m). */
const RESYNC_DISTANCE = 8;

/**
 * Yerleşim yapılarının Rapier collider'ları (Faz 10): yalnızca oyuncuya `BUILDING_LOOK.colliderRadius` içindeki
 * yapılar için kurulur (chunk collider'ları gibi akışlı). Yapı başına katı kutular (`BUILDING_SHAPES.solids`;
 * cami/han duvarları kapı boşluklu), taş temel (yamaçtaki set) ve kapı önü merdiveni (eğik rampa). Canlılar
 * kinematiktir, etkilenmez (bilinçli; Faz 9 yapılarıyla aynı).
 */
export class SettlementColliders {
  private readonly entries = new Map<number, RAPIER.Collider[]>();
  private readonly stairs = new Map<number, Stair>();
  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly map: SettlementMap,
  ) {
    for (const s of map.stairs) this.stairs.set(s.building, s);
  }

  get count(): number {
    let n = 0;
    for (const list of this.entries.values()) n += list.length;
    return n;
  }

  /** Oyuncu çevresini eşitler (hareket `RESYNC_DISTANCE`'tan azsa bir şey yapmaz). */
  update(x: number, z: number, force = false): void {
    if (!force && Math.hypot(x - this.lastX, z - this.lastZ) < RESYNC_DISTANCE) return;
    this.lastX = x;
    this.lastZ = z;
    const wanted = new Set<number>();
    for (const b of this.map.buildingsNear(x, z, BUILDING_LOOK.colliderRadius)) {
      wanted.add(b.id);
      if (!this.entries.has(b.id)) this.entries.set(b.id, this.create(b));
    }
    for (const [id, list] of this.entries) {
      if (wanted.has(id)) continue;
      for (const c of list) this.physics.removeCollider(c);
      this.entries.delete(id);
    }
  }

  private create(b: Building): RAPIER.Collider[] {
    const shape = BUILDING_SHAPES[b.kind];
    const half = b.yaw / 2;
    const rotation = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
    const out: RAPIER.Collider[] = [];
    for (const box of shape.solids) {
      const c = buildingLocalToWorld(b, box.cx, box.cz);
      out.push(
        this.physics.addStaticCollider(
          RAPIER.ColliderDesc.cuboid(box.hx, box.hy, box.hz)
            .setTranslation(c.x, b.y + box.cy, c.z)
            .setRotation(rotation),
        ),
      );
    }
    // Taş temel: ayak izi boyunca zeminden kat seviyesine (yamaçta duvar, terasta platform).
    const rise = b.y - b.base;
    if (rise > 0.2) {
      const hy = (rise + BUILDING_LOOK.plinthSink) / 2;
      out.push(
        this.physics.addStaticCollider(
          RAPIER.ColliderDesc.cuboid(shape.width * 0.49, hy, shape.depth * 0.49)
            .setTranslation(b.x, b.y - hy, b.z)
            .setRotation(rotation),
        ),
      );
    }
    const stair = this.stairs.get(b.id);
    if (stair) {
      // Rampa: merdivenin eğik yüzeyi boyunca ince kutu (yerel x ekseni etrafında eğik, yaw ile dönük).
      const length = Math.hypot(stair.rise, stair.run);
      const pitch = Math.atan2(stair.rise, stair.run); // dışarı doğru iner
      const mid = buildingLocalToWorld(
        b,
        BUILDING_SHAPES[b.kind].door.x,
        BUILDING_SHAPES[b.kind].depth / 2 + stair.run / 2,
      );
      const qy = rotation;
      const qx = { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) };
      // q = qy · qx (önce yerel eğim, sonra yaw)
      const q = {
        w: qy.w * qx.w - qy.y * 0,
        x: qy.w * qx.x,
        y: qy.y * qx.w,
        z: -qy.y * qx.x,
      };
      out.push(
        this.physics.addStaticCollider(
          RAPIER.ColliderDesc.cuboid(stair.width / 2, 0.1, length / 2)
            .setTranslation(mid.x, stair.y0 + stair.rise / 2 - 0.1, mid.z)
            .setRotation(q),
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
