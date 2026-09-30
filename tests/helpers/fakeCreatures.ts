import type { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/events';
import type { CreatureId, CreatureView } from '../../src/creatures/kinds';

/** Test görünümü: yoksa makul varsayılanlar (wolf, sağlam, yatay koordinat orijinde). */
export function makeView(patch: Partial<CreatureView> = {}): CreatureView {
  return {
    id: 0,
    kind: 'wolf',
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    state: 'idle',
    attackPhase: 0,
    hitFlash: 0,
    health: 70,
    maxHealth: 70,
    radius: 0.4,
    height: 0.8,
    dead: false,
    deadSeconds: 0,
    ...patch,
  };
}

/**
 * `CreatureSystem` arayüzünü (docs/faz-5-paralel-plan.md §3.3) taklit eden test çifti: Hesap A'nın gerçek
 * sistemi gelene kadar `combat/` testleri bununla çalışır. Sözleşmedeki davranışı yapar: `damage` canı düşürür,
 * `creature:damaged`/`creature:died` yayınlar ve öldürünce leş bırakır; `removeCarcass` yalnızca leşi kaldırır.
 */
export class FakeCreatures {
  readonly damageCalls: Array<{ id: CreatureId; amount: number; from: { x: number; z: number } }> =
    [];
  private readonly creatures = new Map<CreatureId, CreatureView>();
  private nextId = 1;

  constructor(private readonly events?: EventBus<GameEvents>) {}

  /** Bir canlı ekler; kimliğini döner (`patch.id` verilmezse otomatik). */
  add(patch: Partial<CreatureView> = {}): CreatureId {
    const id = patch.id && patch.id > 0 ? patch.id : this.nextId++;
    this.creatures.set(id, makeView({ ...patch, id }));
    return id;
  }

  update(): void {}

  views(): ReadonlyArray<CreatureView> {
    return [...this.creatures.values()];
  }

  near(x: number, z: number, radius: number): CreatureView[] {
    return [...this.creatures.values()]
      .map((view) => ({ view, distance: Math.hypot(view.x - x, view.z - z) }))
      .filter((entry) => entry.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .map((entry) => entry.view);
  }

  damage(
    id: CreatureId,
    amount: number,
    from: { x: number; z: number },
  ): { killed: boolean } | null {
    const view = this.creatures.get(id);
    if (!view || view.dead) return null;
    this.damageCalls.push({ id, amount, from });
    view.health = Math.max(view.health - amount, 0);
    view.hitFlash = 1;
    const killed = view.health <= 0;
    this.events?.emit('creature:damaged', { id, kind: view.kind, amount, killed });
    if (killed) {
      view.dead = true;
      view.state = 'dead';
      this.events?.emit('creature:died', {
        id,
        kind: view.kind,
        x: view.x,
        y: view.y,
        z: view.z,
      });
    }
    return { killed };
  }

  removeCarcass(id: CreatureId): boolean {
    const view = this.creatures.get(id);
    if (!view || !view.dead) return false;
    this.creatures.delete(id);
    return true;
  }

  get stats(): { active: number; carcasses: number } {
    const all = [...this.creatures.values()];
    return { active: all.length, carcasses: all.filter((v) => v.dead).length };
  }

  dispose(): void {
    this.creatures.clear();
  }
}
