import { COOKING, FIRE } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Inventory } from '../items/Inventory';
import { isLit, type StructureId, type StructureSet } from '../placement/structures';

/** Pişirilebilen eşya ve sonucu. */
const RAW = 'raw_meat';
const COOKED = 'cooked_meat';

/** Yanık ateşin yanında şu an yapılabilecek pişirme (HUD ipucu için). */
export interface CookOffer {
  /** `ready`: pişirilebilir; `full`: pişmiş et envantere sığmıyor (slot yok). */
  status: 'ready' | 'full';
  fireId: StructureId;
  /** Bir adet etin pişme süresi (sn). */
  seconds: number;
}

/**
 * Et pişirme (saf mantık; `FireTender` ile aynı kalıp): yanık bir ateşin `FIRE.refuelReach` yakınında,
 * envanterde çiğ et varken `E` basılı tutulunca `COOKING.seconds` sonra bir çiğ et pişmiş ete döner
 * (`item:cooked`). Tuş basılı kaldıkça sıradaki ete geçer. Ateş sönerse ya da et biterse ilerleme sıfırlanır.
 * Pişmiş et sığmıyorsa teklif `full` olur ve `E` sıradaki eyleme (yakıt) geçer.
 */
export class CookingSystem {
  private currentId: StructureId | null = null;
  private elapsed = 0;
  private currentOffer: CookOffer | null = null;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
    private readonly structures: StructureSet,
  ) {}

  get offer(): CookOffer | null {
    return this.currentOffer;
  }

  /** Pişme ilerlemesi 0–1 (pişirilmiyorsa 0). */
  get progress(): number {
    return this.currentOffer?.status === 'ready' && this.currentId !== null
      ? Math.min(this.elapsed / COOKING.seconds, 1)
      : 0;
  }

  /** Bir sabit adım. `held`: `E` basılı mı; `alive`: ölüyse hiçbir şey yapılmaz. */
  update(dt: number, held: boolean, pos: { x: number; z: number }, alive = true): void {
    const fire = alive ? this.structures.nearestCampfire(pos.x, pos.z, FIRE.refuelReach) : null;
    const lit = fire !== null && isLit(fire);
    this.currentOffer =
      fire && lit && this.inventory.has(RAW)
        ? {
            status: this.inventory.canExchange(RAW, COOKED) ? 'ready' : 'full',
            fireId: fire.id,
            seconds: COOKING.seconds,
          }
        : null;
    const offer = this.currentOffer;

    if (!offer || offer.status !== 'ready' || !held) {
      this.currentId = null;
      this.elapsed = 0;
      return;
    }
    if (offer.fireId !== this.currentId) {
      this.currentId = offer.fireId;
      this.elapsed = 0;
    }
    this.elapsed += dt;
    if (this.elapsed >= COOKING.seconds) {
      this.complete();
      this.elapsed = 0;
    }
  }

  private complete(): void {
    if (!this.inventory.exchange(RAW, COOKED)) return;
    this.events.emit('item:cooked', { from: RAW, item: COOKED, count: 1 });
  }
}
