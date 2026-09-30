import { COMBAT } from '../config';
import type { Inventory } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';

/** Savunma sağlayan giysiler (`COMBAT.defense` anahtarları). */
const DEFENSE_ITEMS = Object.keys(COMBAT.defense) as Array<keyof typeof COMBAT.defense>;

/**
 * Envanterdeki giysilerin toplam savunması (0–`COMBAT.maxDefense`). Bu fazda giysi envanterde bulunması
 * yeterlidir (ayrı ekipman slotu yok); aynı giysiden birden çok olsa da bir kez sayılır.
 */
export function defenseFor(inventory: Pick<Inventory, 'has'>): number {
  let total = 0;
  for (const id of DEFENSE_ITEMS) {
    if (inventory.has(id as ItemId)) total += COMBAT.defense[id];
  }
  return Math.min(Math.max(total, 0), COMBAT.maxDefense);
}

/** Ham hasardan savunma düşülmüş hasar. */
export function mitigate(rawDamage: number, defense: number): number {
  return Math.max(rawDamage, 0) * (1 - Math.min(Math.max(defense, 0), 1));
}

/**
 * Hasar sonrası kısa dokunulmazlık (saf): `iframeSeconds` boyunca yeni hasar kabul edilmez. Hızlı art arda
 * vuran bir saldırgan (ayı) iki kare üst üste vuramasın diye.
 */
export class InvulnerabilityTimer {
  private remaining = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  /** Dokunulmazlığı başlatır. */
  start(seconds: number = COMBAT.iframeSeconds): void {
    this.remaining = Math.max(seconds, 0);
  }

  reset(): void {
    this.remaining = 0;
  }

  update(dt: number): void {
    this.remaining = Math.max(this.remaining - dt, 0);
  }
}
