import { COOKING, FIRE } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Inventory } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import { isLit, type StructureId, type StructureSet } from '../placement/structures';

/** Ateşte pişirilen eşya → sonuç; `requires`: envanterde bulunması gereken kap (tüketilmez). */
export interface CookRecipe {
  from: ItemId;
  to: ItemId;
  requires?: ItemId;
  /** İpucu fiili: "Eti pişir", "Tarhana çorbası pişir"… */
  verb: string;
}

/**
 * Pişirme tarifleri (öncelik sırasıyla). Et doğrudan ateşte pişer; kiler erzakı (Faz 10) bakır tencere ister:
 * bulgur pilavı, tarhana çorbası, kuru fasulye ve demli Rize çayı.
 */
export const COOK_RECIPES: readonly CookRecipe[] = [
  { from: 'raw_meat', to: 'cooked_meat', verb: 'Eti pişir' },
  { from: 'tarhana', to: 'tarhana_soup', requires: 'copper_pot', verb: 'Tarhana çorbası pişir' },
  { from: 'bulgur', to: 'bulgur_pilaf', requires: 'copper_pot', verb: 'Bulgur pilavı pişir' },
  { from: 'dry_beans', to: 'bean_stew', requires: 'copper_pot', verb: 'Kuru fasulye pişir' },
  { from: 'black_tea', to: 'brewed_tea', requires: 'copper_pot', verb: 'Çay demle' },
];

/** Envanterde malzemesi (ve kabı) olan ilk tarif; yoksa null. */
export function cookRecipeFor(inventory: Pick<Inventory, 'has'>): CookRecipe | null {
  for (const r of COOK_RECIPES) {
    if (inventory.has(r.from) && (!r.requires || inventory.has(r.requires))) return r;
  }
  return null;
}

/** Yanık ateşin yanında şu an yapılabilecek pişirme (HUD ipucu için). */
export interface CookOffer {
  /** `ready`: pişirilebilir; `full`: pişmiş et envantere sığmıyor (slot yok). */
  status: 'ready' | 'full';
  fireId: StructureId;
  /** Bir adetin pişme süresi (sn). */
  seconds: number;
  /** Pişirilen tarif. */
  recipe: CookRecipe;
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
    const recipe = fire && lit ? cookRecipeFor(this.inventory) : null;
    this.currentOffer =
      fire && recipe
        ? {
            status: this.inventory.canExchange(recipe.from, recipe.to) ? 'ready' : 'full',
            fireId: fire.id,
            seconds: COOKING.seconds,
            recipe,
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
    const recipe = this.currentOffer?.recipe;
    if (!recipe || !this.inventory.exchange(recipe.from, recipe.to)) return;
    this.events.emit('item:cooked', { from: recipe.from, item: recipe.to, count: 1 });
  }
}
