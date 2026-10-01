import { SCATTER } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Inventory } from '../items/Inventory';
import { ITEMS, type ItemId } from '../items/itemDefs';
import type { WorldSave } from '../save/saveGame';
import { createRandom, seedFrom } from '../utils/random';
import { decodeAbsoluteChunkKey, decodeAbsolutePropId } from '../world/chunkKeys';
import type { PropId, PropRef } from '../world/propKinds';
import { GATHER_RULES, type GatherYield } from './gatherRules';

export type GatherAction = 'hand' | 'axe';

/** Bir nesneyle şu an yapılabilecek eylemin durumu (HUD ipucu için). */
export interface GatherOffer {
  /** `ready`: toplanabilir; `needAxe`: balta gerekir; `full`: envanter sığdırmıyor. */
  status: 'ready' | 'needAxe' | 'full';
  action: GatherAction;
  label: string;
  seconds: number;
}

/**
 * Nesne kimliğinden deterministik verim: aynı nesne + eylem her seferinde aynı miktarı verir. Tohum kimliğin
 * bileşenlerinden `(cx, cy, indeks)` türer: mutlak kimlik 2⁴⁸'e uzanır, `seedFrom` 32 bit'e keser.
 */
export function rollYield(
  propId: PropId,
  action: GatherAction,
  yieldDef: GatherYield,
): Array<{ id: ItemId; count: number }> {
  const { chunkKey, index } = decodeAbsolutePropId(propId);
  const { cx, cy } = decodeAbsoluteChunkKey(chunkKey);
  const random = createRandom(seedFrom(SCATTER.seed, cx, cy, index, action === 'axe' ? 1 : 0));
  return yieldDef.items.map((item) => ({ id: item.id, count: random.int(item.min, item.max) }));
}

const AXE: ItemId = 'stone_axe';
const NEED_AXE_LABEL = 'Kesmek için taş balta gerekir';

/**
 * Toplama etkileşimi (saf mantık, Three.js'siz): bakılan nesneye `E` basılı tutunca süre dolar; bitince
 * verim envantere atomik eklenir (sığmazsa hiçbir şey eklenmez, nesne tükenmez) ve `item:collected`
 * yayınlanır. Her nesne için elle verim bir kez, baltalı verim (varsa) elle verimden sonra bir kez alınır.
 * Dünyadan kalkan nesneleri `isRemoved` bildirir; görseli gizlemek çağıranın (Game) işidir.
 */
export class GatherSystem {
  private readonly handDone = new Set<PropId>();
  private readonly axeDone = new Set<PropId>();
  private readonly removed = new Set<PropId>();
  private currentId: PropId | null = null;
  private currentAction: GatherAction | null = null;
  private elapsed = 0;
  private currentOffer: GatherOffer | null = null;
  /** Son tamamlama denemesi sığmadı: envanter değişene kadar bu nesne `full` görünür. */
  private failed: { id: PropId; version: number } | null = null;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
  ) {}

  /** Şu an hedeflenen nesne için sunulan eylem (HUD ipucu); hedef yoksa null. */
  get offer(): GatherOffer | null {
    return this.currentOffer;
  }

  /** Tutma ilerlemesi 0–1 (toplanmıyorsa 0). */
  get progress(): number {
    const offer = this.currentOffer;
    if (!offer || this.currentId === null || offer.status !== 'ready') return 0;
    return Math.min(this.elapsed / offer.seconds, 1);
  }

  /** Kayıt görüntüsü: tükenen ve dünyadan kalkan nesneler (sıralı, oturumlar arası sabit kimlikler). */
  toSave(): WorldSave {
    const sorted = (ids: ReadonlySet<PropId>): number[] => [...ids].sort((a, b) => a - b);
    return {
      handDone: sorted(this.handDone),
      axeDone: sorted(this.axeDone),
      removed: sorted(this.removed),
    };
  }

  /** Kaydı yükler; sürmekte olan toplama ilerlemesi sıfırlanır. Görsel katmanı çağıran günceller. */
  loadSave(save: WorldSave): void {
    this.handDone.clear();
    this.axeDone.clear();
    this.removed.clear();
    for (const id of save.handDone) this.handDone.add(id);
    for (const id of save.axeDone) this.axeDone.add(id);
    for (const id of save.removed) this.removed.add(id);
    this.failed = null;
    this.reset(null);
    this.currentOffer = null;
  }

  isRemoved(id: PropId): boolean {
    return this.removed.has(id);
  }

  /** Nesneyle yapılabilecek eylem; yapılacak bir şey kalmadıysa (tükendi) null. */
  inspect(prop: PropRef): GatherOffer | null {
    const rule = GATHER_RULES[prop.kind];
    let action: GatherAction;
    let yieldDef: GatherYield;
    if (!this.handDone.has(prop.id)) {
      action = 'hand';
      yieldDef = rule.hand;
    } else if (rule.axe && !this.axeDone.has(prop.id)) {
      if (!this.inventory.has(AXE)) {
        return {
          status: 'needAxe',
          action: 'axe',
          label: NEED_AXE_LABEL,
          seconds: rule.axe.seconds,
        };
      }
      action = 'axe';
      yieldDef = rule.axe;
    } else {
      return null;
    }

    const blocked =
      (this.failed?.id === prop.id && this.failed.version === this.inventory.version) ||
      !rollYield(prop.id, action, yieldDef).every(
        (item) => this.inventory.capacityFor(item.id) >= item.count,
      );
    return {
      status: blocked ? 'full' : 'ready',
      action,
      label: yieldDef.label,
      seconds: yieldDef.seconds,
    };
  }

  /**
   * Bir sabit adım. `target`: bakılan nesne (yoksa null); `held`: `E` basılı mı. Hedef değişirse, tuş
   * bırakılırsa ya da eylem yapılamazsa ilerleme sıfırlanır.
   */
  update(dt: number, held: boolean, target: PropRef | null): void {
    const offer = target ? this.inspect(target) : null;
    this.currentOffer = offer;

    if (!target || !offer || offer.status !== 'ready' || !held) {
      this.reset(target && offer ? target.id : null);
      return;
    }
    if (target.id !== this.currentId || offer.action !== this.currentAction) {
      this.currentId = target.id;
      this.currentAction = offer.action;
      this.elapsed = 0;
    }
    this.elapsed += dt;
    if (this.elapsed >= offer.seconds) {
      this.complete(target, offer.action);
      this.reset(null);
    }
  }

  private reset(id: PropId | null): void {
    this.currentId = id;
    this.currentAction = null;
    this.elapsed = 0;
  }

  private complete(prop: PropRef, action: GatherAction): void {
    const rule = GATHER_RULES[prop.kind];
    const yieldDef = action === 'axe' ? rule.axe : rule.hand;
    if (!yieldDef) return;

    const amounts = rollYield(prop.id, action, yieldDef);
    const before = amounts.map((item) => this.inventory.count(item.id));
    const fits = amounts.every((item) => this.inventory.add(item.id, item.count) === 0);
    if (!fits) {
      // Atomik: kısmen eklenenleri geri al, nesne tükenmesin.
      amounts.forEach((item, i) => {
        const extra = this.inventory.count(item.id) - (before[i] as number);
        if (extra > 0) this.inventory.remove(item.id, extra);
      });
      this.failed = { id: prop.id, version: this.inventory.version };
      return;
    }

    (action === 'axe' ? this.axeDone : this.handDone).add(prop.id);
    if (yieldDef.removes) this.removed.add(prop.id);
    for (const item of amounts) {
      this.events.emit('item:collected', {
        item: item.id,
        count: item.count,
        source: prop.kind,
        propId: prop.id,
        removed: yieldDef.removes,
      });
    }
  }
}

/** Eşyanın görünen adı (bildirim/ipucu için). */
export function itemName(id: ItemId): string {
  return ITEMS[id].name;
}
