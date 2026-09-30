import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { CreatureSystem } from '../creatures/CreatureSystem';
import type { CreatureKind } from '../creatures/kinds';
import type { Inventory } from '../items/Inventory';
import type { SurvivalSystem } from '../survival/SurvivalSystem';
import { defenseFor, InvulnerabilityTimer, mitigate } from './damage';

/**
 * Oyuncu tarafı savaş ve av mantığı (saf). Canlılarla yalnızca `CreatureSystem`'in genel arayüzü ve
 * `creature:*` olayları üzerinden konuşur (docs/faz-5-paralel-plan.md §3). 5.6: hasar alma (savunma,
 * dokunulmazlık); 5.7–5.9'da saldırı, leş kesme ve pişirme eklenir.
 */
export class CombatSystem {
  private readonly invulnerability = new InvulnerabilityTimer();
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
    private readonly creatures: CreatureSystem,
    private readonly survival: SurvivalSystem,
  ) {
    void this.creatures;
    this.offs.push(
      this.events.on('creature:attacked', ({ kind, damage }) => this.receiveHit(damage, kind)),
      this.events.on('player:respawned', () => this.invulnerability.reset()),
    );
  }

  /** Sabit adım (dt sn). */
  update(dt: number): void {
    this.invulnerability.update(dt);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  /** Bir canlının isabetini savunma ve dokunulmazlıkla işler; hasar gerçekten düştüyse dokunulmazlık başlar. */
  private receiveHit(rawDamage: number, kind: CreatureKind): void {
    if (!this.survival.alive || this.invulnerability.active) return;
    const dealt = this.survival.applyDamage(
      mitigate(rawDamage, defenseFor(this.inventory)),
      'creature',
      kind,
    );
    if (dealt > 0) this.invulnerability.start();
  }
}
