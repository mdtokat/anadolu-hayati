import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld';
import type { CampLayout } from '../bandits/camps';
import { campSolidBoxes } from './campGeometry';

/**
 * Eşkıya kamplarının Rapier collider'ları (Faz 11, 11.6): oyuncuya `radius` içindeki kampların çadırları ve sandığı
 * katıdır (ateş, oturak ve siper geçilir). Eşkıyalar kinematiktir, etkilenmez.
 */
export class CampColliders {
  private readonly entries = new Map<number, RAPIER.Collider[]>();

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly heightAt: (x: number, z: number) => number,
  ) {}

  get count(): number {
    let n = 0;
    for (const list of this.entries.values()) n += list.length;
    return n;
  }

  /** Verilen kampların collider'larını kurar, listede olmayanlarınkini kaldırır. */
  sync(camps: ReadonlyArray<{ id: number; layout: CampLayout }>): void {
    const present = new Set<number>();
    for (const { id, layout } of camps) {
      present.add(id);
      if (this.entries.has(id)) continue;
      const list = campSolidBoxes(layout, this.heightAt).map((b) => {
        const half = b.yaw / 2;
        return this.physics.addStaticCollider(
          RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
            .setTranslation(b.x, b.y, b.z)
            .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
        );
      });
      this.entries.set(id, list);
    }
    for (const [id, list] of this.entries) {
      if (present.has(id)) continue;
      for (const c of list) this.physics.removeCollider(c);
      this.entries.delete(id);
    }
  }

  dispose(): void {
    this.sync([]);
  }
}
