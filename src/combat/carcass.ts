import { CREATURE_LOOK, INTERACT, LOOT } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { CreatureSystem } from '../creatures/CreatureSystem';
import type { CreatureId, CreatureKind, CreatureView } from '../creatures/kinds';
import type { Inventory, ItemStack } from '../items/Inventory';
import { isButcherable, lootFor } from './loot';
import { aimAt, type MeleeAim, type MeleeHit } from './melee';

/** Leşi kesmek için kullanılabilecek aletler, en hızlısı önce: envanterde varsa süre kısalır (Faz 9: bıçak). */
export const BUTCHER_TOOLS = ['bone_knife', 'stone_axe'] as const;
export type ButcherTool = (typeof BUTCHER_TOOLS)[number];

const BUTCHER_SECONDS: Readonly<Record<ButcherTool, number>> = {
  bone_knife: LOOT.butcherSecondsKnife,
  stone_axe: LOOT.butcherSecondsAxe,
};

/** Bir leşle şu an yapılabilecek eylem (HUD ipucu için). */
export interface ButcherOffer {
  /** `ready`: kesilebilir; `full`: envanterde hiçbir eşyaya yer yok. */
  status: 'ready' | 'full';
  id: CreatureId;
  kind: CreatureKind;
  /** Kesme süresi (sn); aletle kısa. */
  seconds: number;
  /** Kullanılan alet (yoksa ya da tanımsızsa elle). */
  tool?: ButcherTool | null;
  /** Baltayla mı (eski alan; `tool === 'stone_axe'`). */
  withAxe: boolean;
}

/**
 * Bakılan leşi seçer (saf): `INTERACT` menzili/konisi/dikey toleransı, hedef nokta alçak yatan leşin
 * yarı boyu. Yalnızca ölü canlılar; bakışa en yakın olan, eşitlikte yakın olan.
 */
export function pickCarcass(
  candidates: ReadonlyArray<CreatureView>,
  aim: MeleeAim,
): MeleeHit | null {
  const rules = {
    reach: INTERACT.reach,
    coneDeg: INTERACT.viewConeDeg,
    pitchToleranceDeg: INTERACT.viewPitchDeg,
    closeRange: INTERACT.closeRange,
    maxVerticalGap: INTERACT.maxTargetHeight * 2,
  };
  let best: MeleeHit | null = null;
  for (const view of candidates) {
    if (!view.dead) continue;
    const hit = aimAt(view, aim, rules, (view.height * CREATURE_LOOK.deadHeightFactor) / 2);
    if (!hit) continue;
    if (
      best === null ||
      hit.bearingDeg < best.bearingDeg - 1e-9 ||
      (Math.abs(hit.bearingDeg - best.bearingDeg) <= 1e-9 && hit.distance < best.distance)
    ) {
      best = hit;
    }
  }
  return best;
}

/**
 * Leş kesme (saf mantık; `GatherSystem`/`FireTender` ile aynı kalıp): oyuncu bir leşe bakarken `E` basılı
 * tutulunca süre dolar (baltayla kısa); bitince yük envantere eklenir ve yeterli yer yoksa sığanlar alınır,
 * kalanı leşte bırakılır (leş kaybolmaz, yer açılınca kesme sürer). Yük tamamen alınınca leş kaldırılır.
 * Kalan yük yalnızca bu sınıfta durur; `CreatureSystem` bundan habersizdir (sözleşme: A'ya eşya girmez).
 */
export class CarcassButcher {
  private currentId: CreatureId | null = null;
  private elapsed = 0;
  private currentOffer: ButcherOffer | null = null;
  /** Kısmen kesilmiş leşlerin alınmamış yükü. */
  private readonly remaining = new Map<CreatureId, ItemStack[]>();

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
    private readonly creatures: Pick<CreatureSystem, 'removeCarcass' | 'views'>,
  ) {}

  get offer(): ButcherOffer | null {
    return this.currentOffer;
  }

  /**
   * Tüm durumu sıfırlar (kayıt yüklenince): canlı kimlikleri oturumlar arası sabit olduğundan, eski
   * kısmi kesim kayıtları yeni doğan bir canlıyla karışabilirdi.
   */
  reset(): void {
    this.currentId = null;
    this.elapsed = 0;
    this.currentOffer = null;
    this.remaining.clear();
  }

  /** Tutma ilerlemesi 0–1 (kesilmiyorsa 0). */
  get progress(): number {
    const offer = this.currentOffer;
    if (!offer || offer.status !== 'ready' || this.currentId === null) return 0;
    return Math.min(this.elapsed / offer.seconds, 1);
  }

  /** Leşte alınmamış eşya kaldı mı (kısmi kesim)? */
  hasRemaining(id: CreatureId): boolean {
    return this.remaining.has(id);
  }

  /** Leşten hâlâ alınmamış eşyalar (kısmi kesimden kalan); yoksa tam yük. */
  pending(view: Pick<CreatureView, 'id' | 'kind'>): ItemStack[] {
    return this.remaining.get(view.id) ?? lootFor(view.kind);
  }

  /** Bir leşle yapılabilecek eylem (HUD ipucu); hiçbir eşyaya yer yoksa `full`. */
  inspect(view: Pick<CreatureView, 'id' | 'kind' | 'dead'>): ButcherOffer | null {
    if (!view.dead || !isButcherable(view.kind)) return null;
    const tool = BUTCHER_TOOLS.find((id) => this.inventory.has(id)) ?? null;
    const fits = this.pending(view).some((stack) => this.inventory.capacityFor(stack.id) >= 1);
    return {
      status: fits ? 'ready' : 'full',
      id: view.id,
      kind: view.kind,
      seconds: tool ? BUTCHER_SECONDS[tool] : LOOT.butcherSeconds,
      tool,
      withAxe: tool === 'stone_axe',
    };
  }

  /**
   * Bir sabit adım. `target`: bakılan leş (yoksa null); `held`: `E` basılı mı; `alive`: ölüyse hiçbir şey
   * yapılmaz. Hedef değişirse, tuş bırakılırsa ya da leş kaybolursa ilerleme sıfırlanır.
   */
  update(dt: number, held: boolean, target: CreatureView | null, alive = true): void {
    this.pruneRemaining();
    const offer = alive && target ? this.inspect(target) : null;
    this.currentOffer = offer;

    if (!target || !offer || offer.status !== 'ready' || !held) {
      this.currentId = offer ? offer.id : null;
      this.elapsed = 0;
      return;
    }
    if (offer.id !== this.currentId) {
      this.currentId = offer.id;
      this.elapsed = 0;
    }
    this.elapsed += dt;
    if (this.elapsed >= offer.seconds) {
      this.complete(target);
      this.currentId = null;
      this.elapsed = 0;
    }
  }

  private complete(view: CreatureView): void {
    const taken: ItemStack[] = [];
    const left: ItemStack[] = [];
    for (const stack of this.pending(view)) {
      // Sığan kadarını al (eşya eklenemeyen kısım leşte kalır).
      const notAdded = this.inventory.add(stack.id, stack.count);
      const added = stack.count - notAdded;
      if (added > 0) taken.push({ id: stack.id, count: added });
      if (notAdded > 0) left.push({ id: stack.id, count: notAdded });
    }
    if (taken.length === 0) return;

    if (left.length === 0) {
      this.remaining.delete(view.id);
      this.creatures.removeCarcass(view.id);
    } else {
      this.remaining.set(view.id, left);
    }
    this.events.emit('carcass:butchered', { id: view.id, kind: view.kind, items: taken });
  }

  /** Dünyadan kalkan (süresi dolan) leşlerin kalan yükünü unutur. */
  private pruneRemaining(): void {
    if (this.remaining.size === 0) return;
    const alive = new Set(this.creatures.views().map((view) => view.id));
    for (const id of this.remaining.keys()) if (!alive.has(id)) this.remaining.delete(id);
  }
}
