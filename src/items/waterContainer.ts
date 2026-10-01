import { WATER_CONTAINER, SURVIVAL } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { SurvivalSystem } from '../survival/SurvivalSystem';
import type { VitalsState } from '../survival/vitals';
import type { Inventory } from './Inventory';
import type { ItemId } from './itemDefs';

export const EMPTY_CONTAINER: ItemId = 'water_container_empty';
export const FULL_CONTAINER: ItemId = 'water_container_full';

/** Tatlı su kenarında boş kapla yapılabilecek eylem (HUD ipucu için). */
export interface FillOffer {
  /** `ready`: doldurulabilir; `full`: dolu kap envantere sığmıyor (ağırlık). */
  status: 'ready' | 'full';
  seconds: number;
}

export interface FillInput {
  /** `E` basılı ve başka bir eylem almadı mı (`interactChain` → `drinkAllowed`)? */
  held: boolean;
  /** Tatlı su erişimde mi? */
  nearWater: boolean;
  /** Oyuncu şu an kaynaktan içiyor mu? İçerken kap dolmaz (önce susuzluk giderilir). */
  drinking: boolean;
  alive: boolean;
}

/**
 * Su kabını doldurma (saf mantık; `FireTender` ile aynı kalıp): tatlı su erişimdeyken, oyuncu içmiyorken (su
 * göstergesi dolu) `E` basılı tutulunca `WATER_CONTAINER.fillSeconds` sonra bir boş kap dolu kaba döner ve
 * `item:filled` yayınlanır. Tuş basılı kaldıkça sıradaki boş kaba geçer.
 */
export class ContainerFiller {
  private elapsed = 0;
  private currentOffer: FillOffer | null = null;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
  ) {}

  get offer(): FillOffer | null {
    return this.currentOffer;
  }

  /** Dolma ilerlemesi 0–1 (doldurulmuyorsa 0). */
  get progress(): number {
    return this.currentOffer?.status === 'ready'
      ? Math.min(this.elapsed / WATER_CONTAINER.fillSeconds, 1)
      : 0;
  }

  /** İlerlemeyi sıfırlar (kayıt yüklenince). */
  reset(): void {
    this.elapsed = 0;
    this.currentOffer = null;
  }

  update(dt: number, input: FillInput): void {
    this.currentOffer =
      input.alive && input.nearWater && !input.drinking && this.inventory.has(EMPTY_CONTAINER)
        ? {
            status: this.inventory.canExchange(EMPTY_CONTAINER, FULL_CONTAINER) ? 'ready' : 'full',
            seconds: WATER_CONTAINER.fillSeconds,
          }
        : null;
    if (this.currentOffer?.status !== 'ready' || !input.held) {
      this.elapsed = 0;
      return;
    }
    this.elapsed += dt;
    if (this.elapsed >= WATER_CONTAINER.fillSeconds) {
      this.elapsed = 0;
      if (this.inventory.exchange(EMPTY_CONTAINER, FULL_CONTAINER)) {
        this.events.emit('item:filled', { item: FULL_CONTAINER });
      }
    }
  }
}

/** Dolu kaptan içilebilir mi (kap var ve su göstergesinde yeterli eksik)? */
export function canDrinkContainer(vitals: Readonly<VitalsState>, inventory: Inventory): boolean {
  return (
    inventory.has(FULL_CONTAINER) &&
    SURVIVAL.maxValue - vitals.hydration >= WATER_CONTAINER.drinkMinDeficit
  );
}

export type ContainerDrinkResult =
  { ok: true; amount: number } | { ok: false; reason: 'dead' | 'no_water' | 'not_thirsty' };

/**
 * Dolu kaptan içer: kap boşalır (envanterde aynı yerde kalır), su göstergesi `drinkHydration` kadar artar ve
 * `player:drank` yayınlanır. Yapılamıyorsa envanter ve göstergeler değişmez.
 */
export function drinkFromContainer(
  inventory: Inventory,
  survival: SurvivalSystem,
  events?: EventBus<GameEvents>,
): ContainerDrinkResult {
  if (!survival.alive) return { ok: false, reason: 'dead' };
  if (!inventory.has(FULL_CONTAINER)) return { ok: false, reason: 'no_water' };
  if (!canDrinkContainer(survival.state, inventory)) return { ok: false, reason: 'not_thirsty' };
  // Dolu kap boştan ağırdır ve yığını tek adettir: dönüşüm her zaman sığar.
  if (!inventory.exchange(FULL_CONTAINER, EMPTY_CONTAINER))
    return { ok: false, reason: 'no_water' };
  const before = survival.state.hydration;
  survival.consume({ hydration: WATER_CONTAINER.drinkHydration });
  const amount = survival.state.hydration - before;
  events?.emit('player:drank', { amount });
  return { ok: true, amount };
}
