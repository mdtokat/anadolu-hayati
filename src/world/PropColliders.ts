import { PROP_SOLIDS } from '../config';
import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld';
import type { PropLayer } from './PropLayer';
import type { PropId } from './propKinds';

/**
 * Ağaç, kaya ve çalıların Rapier collider'ları (kullanıcı talimatı: hiçbir nesnenin içinden geçilmez). Yalnızca
 * oyuncuya `PROP_SOLIDS.colliderRadius` içindeki, görünür (seyreltilmemiş, kesilmemiş, yapı/yol altında kalmamış)
 * nesneler için kurulur ve oyuncu `resyncDistance` yer değiştirince ya da nesne listesi değişince (ağaç kesildi, chunk
 * yüklendi) eşitlenir; yerdeki dal/taş/mantar geçilir. Canlılar kinematiktir: onlar için aynı gövdeler engel sorgusundadır
 * (`PropLayer.solidBlocks`).
 */
/** Zorla eşitlemede oyuncunun gövdesi için nesne yarıçapına eklenen pay (oyun m). */
const PLAYER_CLEARANCE = 0.7;

export class PropColliders {
  private readonly entries = new Map<PropId, RAPIER.Collider>();
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private lastVersion = -1;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly props: PropLayer,
  ) {}

  get count(): number {
    return this.entries.size;
  }

  update(x: number, z: number, force = false): void {
    // Oyuncunun çevresi yüklü değilse (drone görüşü uzaktayken önbellek devrilmiş olabilir) eldekini koru.
    if (!this.props.isLoadedAt(x, z)) return;
    const moved = Math.hypot(x - this.lastX, z - this.lastZ) >= PROP_SOLIDS.resyncDistance;
    if (!force && !moved && this.lastVersion === this.props.solidVersion) return;
    this.lastX = x;
    this.lastZ = z;
    this.lastVersion = this.props.solidVersion;

    const wanted = new Map<PropId, ReturnType<PropLayer['solidsNear']>[number]>();
    for (const ref of this.props.solidsNear(x, z, PROP_SOLIDS.colliderRadius)) {
      // Işınlanma/doğma/yükleme (`force`): oyuncunun gövdesine denk gelen nesne atlanır (sıkışma olmasın);
      // sonraki eşitlemede, oyuncu uzaklaşınca kurulur.
      if (force && Math.hypot(ref.x - x, ref.z - z) < ref.solid.radius + PLAYER_CLEARANCE) continue;
      wanted.set(ref.id, ref);
    }
    for (const [id, collider] of this.entries) {
      if (wanted.has(id)) continue;
      this.physics.removeCollider(collider);
      this.entries.delete(id);
    }
    for (const [id, ref] of wanted) {
      if (this.entries.has(id)) continue;
      const half = ref.solid.height / 2;
      this.entries.set(
        id,
        this.physics.addStaticCollider(
          RAPIER.ColliderDesc.cylinder(half, ref.solid.radius).setTranslation(
            ref.x,
            ref.y + half,
            ref.z,
          ),
        ),
      );
    }
  }

  dispose(): void {
    for (const collider of this.entries.values()) this.physics.removeCollider(collider);
    this.entries.clear();
  }
}
