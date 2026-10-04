import { MEDICAL } from '../config';
import type { Inventory } from './Inventory';
import type { ItemId } from './itemDefs';

/**
 * Sağlık eşyası kullanımı (saf; Battle Royale ile geldi). Kullanım süreli bir eylemdir: başlar (`start`), her adımda
 * ilerler (`update`), bitince eşyadan bir tane harcanır ve iyileşme miktarı döner (göstergeye Game ekler). Hasar alınca,
 * saldırınca ya da elde başka eşya seçilince yarıda kalır (`cancel`); yarıda kalan kullanım eşya harcamaz.
 */

export type MedicalItem = keyof typeof MEDICAL;

export function isMedical(id: ItemId): id is MedicalItem & ItemId {
  return Object.hasOwn(MEDICAL, id);
}

/** Bu canla kullanılabilir mi? `full`: can eşyanın iyileştirebildiği sınırda ya da üstünde. */
export function medicalStatus(item: MedicalItem, health: number): 'ok' | 'full' {
  return health >= MEDICAL[item].cap - 0.5 ? 'full' : 'ok';
}

/** `health` canda kullanılınca kazanılacak can (sınıra kadar). */
export function medicalHeal(item: MedicalItem, health: number): number {
  const spec = MEDICAL[item];
  return Math.max(0, Math.min(spec.heal, spec.cap - health));
}

export type MedicalStart = 'started' | 'missing' | 'full' | 'busy';

export interface MedicalProgress {
  item: MedicalItem;
  elapsed: number;
  seconds: number;
}

export class MedicalUse {
  private current: MedicalProgress | null = null;

  constructor(private readonly inventory: Pick<Inventory, 'has' | 'remove'>) {}

  /** Süren kullanım (yoksa null). */
  get active(): Readonly<MedicalProgress> | null {
    return this.current;
  }

  /** 0–1 ilerleme (kullanım yoksa 0). */
  get progress(): number {
    return this.current ? Math.min(1, this.current.elapsed / this.current.seconds) : 0;
  }

  start(item: MedicalItem, health: number): MedicalStart {
    if (this.current) return 'busy';
    if (!this.inventory.has(item)) return 'missing';
    if (medicalStatus(item, health) === 'full') return 'full';
    this.current = { item, elapsed: 0, seconds: MEDICAL[item].seconds };
    return 'started';
  }

  /** Yarıda keser (eşya harcanmaz). */
  cancel(): void {
    this.current = null;
  }

  /**
   * İlerletir. Bittiyse eşyadan bir tane harcanır ve `{ item, heal }` döner (`heal`: şimdiki cana göre sınıra kadar);
   * eşya bu arada envanterden çıktıysa kullanım boşa düşer (null). Sürüyorsa null.
   */
  update(dt: number, health: number): { item: MedicalItem; heal: number } | null {
    const c = this.current;
    if (!c) return null;
    c.elapsed += dt;
    if (c.elapsed < c.seconds) return null;
    this.current = null;
    if (!this.inventory.has(c.item)) return null;
    this.inventory.remove(c.item, 1);
    return { item: c.item, heal: medicalHeal(c.item, health) };
  }
}
