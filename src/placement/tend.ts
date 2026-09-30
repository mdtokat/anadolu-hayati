import { FIRE } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Inventory } from '../items/Inventory';
import { ITEMS, type ItemId } from '../items/itemDefs';
import type { StructureId, StructureSet } from './structures';

/** Yakıt olarak atılabilen eşyalar, tercih sırasıyla (ucuz olan önce). */
export const FUEL_ITEMS = ['stick', 'log'] as const satisfies ReadonlyArray<keyof typeof FIRE.fuel>;
export type FuelItem = (typeof FUEL_ITEMS)[number];

/** Yakındaki ateşle şu an yapılabilecek eylem (HUD ipucu için). */
export interface TendOffer {
  /** `ready`: yakıt atılabilir; `noFuel`: dal/kütük yok; `full`: depo dolu. */
  status: 'ready' | 'noFuel' | 'full';
  fireId: StructureId;
  /** Atılacak eşya (`ready` iken). */
  item: FuelItem | null;
  seconds: number;
}

/**
 * Ateşe yakıt atma (saf mantık): ateşin `FIRE.refuelReach` yakınındayken `E` basılı tutulunca süre dolar;
 * bitince bir dal (tercihen) ya da kütük envanterden düşer ve yanma süresi uzar. Tuş basılı kaldıkça
 * depo dolana ya da yakıt bitene kadar sürer. Sönük ateş yeniden tutuşur.
 */
export class FireTender {
  private currentId: StructureId | null = null;
  private elapsed = 0;
  private currentOffer: TendOffer | null = null;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
    private readonly structures: StructureSet,
  ) {}

  get offer(): TendOffer | null {
    return this.currentOffer;
  }

  /** Tutma ilerlemesi 0–1 (yakıt atılmıyorsa 0). */
  get progress(): number {
    return this.currentOffer?.status === 'ready' && this.currentId !== null
      ? Math.min(this.elapsed / FIRE.refuelSeconds, 1)
      : 0;
  }

  /** Bir sabit adım. `held`: `E` basılı mı; `alive`: ölüyse hiçbir şey yapılmaz. */
  update(dt: number, held: boolean, pos: { x: number; z: number }, alive = true): void {
    const fire = alive ? this.structures.nearestCampfire(pos.x, pos.z, FIRE.refuelReach) : null;
    this.currentOffer = fire ? this.offerFor(fire.id, fire.fuelSeconds ?? 0) : null;
    const offer = this.currentOffer;

    if (!offer || offer.status !== 'ready' || !held) {
      this.currentId = offer ? offer.fireId : null;
      this.elapsed = 0;
      return;
    }
    if (offer.fireId !== this.currentId) {
      this.currentId = offer.fireId;
      this.elapsed = 0;
    }
    this.elapsed += dt;
    if (this.elapsed >= FIRE.refuelSeconds) {
      this.complete(offer);
      this.elapsed = 0;
    }
  }

  private offerFor(fireId: StructureId, fuelSeconds: number): TendOffer {
    if (fuelSeconds >= FIRE.maxFuelSeconds) {
      return { status: 'full', fireId, item: null, seconds: 0 };
    }
    const item = FUEL_ITEMS.find((id) => this.inventory.has(id)) ?? null;
    if (item === null) return { status: 'noFuel', fireId, item: null, seconds: 0 };
    return { status: 'ready', fireId, item, seconds: FIRE.fuel[item] };
  }

  private complete(offer: TendOffer): void {
    const item = offer.item;
    if (item === null || !this.inventory.remove(item, 1)) return;
    const added = this.structures.refuel(offer.fireId, FIRE.fuel[item]);
    if (added === 0) {
      this.inventory.add(item, 1); // depo dolmuş: eşya harcanmaz
      return;
    }
    this.events.emit('structure:refueled', { id: offer.fireId, item, seconds: added });
  }
}

/** Yakıt eşyasının görünen adı (ipucu için). */
export function fuelName(item: ItemId): string {
  return ITEMS[item].name;
}
