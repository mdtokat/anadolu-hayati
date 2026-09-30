import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { CreatureSystem } from '../creatures/CreatureSystem';
import type { Inventory } from '../items/Inventory';

/**
 * Oyuncu tarafı savaş ve av mantığı (saf). **İskelet (5.0):** gövde boştur; 5.6–5.9'da Hesap B doldurur
 * (hasar/savunma, saldırı, leş kesme, pişirme; docs/faz-5-paralel-plan.md §5). Canlılarla yalnızca
 * `CreatureSystem`'in genel arayüzü ve `creature:*` olayları üzerinden konuşur.
 */
export class CombatSystem {
  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
    private readonly creatures: CreatureSystem,
  ) {
    void this.events;
    void this.inventory;
    void this.creatures;
  }

  /** Sabit adım (dt sn). */
  update(dt: number): void {
    void dt;
  }

  dispose(): void {
    // 5.6: olay dinleyicilerini bırak.
  }
}
