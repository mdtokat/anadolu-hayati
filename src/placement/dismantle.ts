import { DISMANTLE } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { Inventory, type ItemStack } from '../items/Inventory';
import type { Structure, StructureId, StructureKind, StructureSet } from './structures';

/** Yapı sökülünce geri dönen eşyalar: kamp ateşinden taşlar, diğerlerinden yapının kendisi (yeniden kurulur). */
export function dismantleReturns(kind: StructureKind): ItemStack[] {
  if (kind === 'campfire')
    return DISMANTLE.campfireReturns.map((s) => ({ id: s.id, count: s.count }));
  // Faz 11: tarla çapayla açılır, eşyası yoktur (sökülünce bir şey dönmez; C ayarlar).
  if (kind === 'farm_plot') return [];
  return [{ id: kind, count: 1 }];
}

/** Bakılan yapıyla şu an yapılabilecek sökme (HUD ipucu): `ready`, sandık dolu ya da envanterde yer yok. */
export interface DismantleOffer {
  status: 'ready' | 'not_empty' | 'no_space';
  id: StructureId;
  kind: StructureKind;
  items: ItemStack[];
}

/**
 * Yapı sökme (saf mantık, Faz 9): bakılan yapıya `X` basılı tutulunca süre (`DISMANTLE.seconds`) dolar; bitince
 * yapı kalkar ve eşyaları envantere eklenir. Sandık boş olmalıdır; dönen eşyalar sığmalıdır (atomik: sığmıyorsa
 * hiçbir şey değişmez). Hedef değişir ya da tuş bırakılırsa ilerleme sıfırlanır.
 */
export class Dismantler {
  private currentId: StructureId | null = null;
  private elapsed = 0;
  private currentOffer: DismantleOffer | null = null;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
    private readonly structures: StructureSet,
  ) {}

  get offer(): DismantleOffer | null {
    return this.currentOffer;
  }

  /** Tutma ilerlemesi 0–1. */
  get progress(): number {
    return this.currentOffer?.status === 'ready' && this.currentId !== null
      ? Math.min(this.elapsed / DISMANTLE.seconds, 1)
      : 0;
  }

  /** Bu yapı sökülebilir mi; neden değil? */
  inspect(structure: Readonly<Structure>): DismantleOffer {
    const items = dismantleReturns(structure.kind);
    const storage = this.structures.storageOf(structure.id);
    const base = { id: structure.id, kind: structure.kind, items };
    if (storage && storage.slots.some((stack) => stack !== null)) {
      return { ...base, status: 'not_empty' };
    }
    return { ...base, status: fits(this.inventory, items) ? 'ready' : 'no_space' };
  }

  /** Bir sabit adım. `target`: bakılan yapı (yoksa null); `held`: `X` basılı mı. */
  update(dt: number, held: boolean, target: Readonly<Structure> | null, alive = true): void {
    const offer = alive && target ? this.inspect(target) : null;
    this.currentOffer = offer;
    if (!offer || offer.status !== 'ready' || !held) {
      this.currentId = offer ? offer.id : null;
      this.elapsed = 0;
      return;
    }
    if (offer.id !== this.currentId) {
      this.currentId = offer.id;
      this.elapsed = 0;
    }
    this.elapsed += dt;
    if (this.elapsed >= DISMANTLE.seconds) {
      this.complete(offer);
      this.elapsed = 0;
      this.currentId = null;
      this.currentOffer = null;
    }
  }

  reset(): void {
    this.currentId = null;
    this.elapsed = 0;
    this.currentOffer = null;
  }

  private complete(offer: DismantleOffer): void {
    if (!fits(this.inventory, offer.items)) return;
    if (!this.structures.remove(offer.id)) return;
    for (const stack of offer.items) this.inventory.add(stack.id, stack.count);
    this.events.emit('structure:dismantled', {
      id: offer.id,
      kind: offer.kind,
      items: offer.items,
    });
  }
}

/** Eşyaların hepsi birlikte sığar mı (envanterin kopyasında denenir; asıl envanter değişmez)? */
function fits(inventory: Inventory, items: ReadonlyArray<ItemStack>): boolean {
  const trial = Inventory.fromJSON(inventory.toJSON(), {
    slots: inventory.slotCount,
    maxWeightG: inventory.maxWeightG,
  });
  return items.every((stack) => trial.add(stack.id, stack.count) === 0);
}
