import { SEARCH } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { Inventory, type ItemStack } from '../items/Inventory';
import { BUILDING_SHAPES, BUILDING_NAMES } from './kinds';
import type { Building } from './layout';
import { rollBuildingLoot } from './loot';
import { buildingLocalToWorld } from './SettlementMap';

/** Aranabilecek yapı ve durumu (HUD ipucu). */
export interface SearchOffer {
  /** `ready`: aranabilir; `searched`: çoktan arandı; `full`: ganimet envantere sığmıyor. */
  status: 'ready' | 'searched' | 'full';
  building: Building;
  seconds: number;
}

/** Bakış/konum: kapıya yakın ve yapıya bakan oyuncu. */
export interface SearchPose {
  x: number;
  y: number;
  z: number;
  /** Bakış yaw'ı (ileri = (−sin yaw, −cos yaw)). */
  yaw: number;
}

/**
 * Oyuncunun arayabileceği yapı: kapı noktasına `SEARCH.reach` yakın, dikey farkı `verticalReach` içinde ve
 * yapıya `viewConeDeg` içinde bakan, en yakın aranabilir yapı. Cami, türbe, mezarlık aranmaz.
 */
export function searchTarget(candidates: readonly Building[], pose: SearchPose): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  const fx = -Math.sin(pose.yaw);
  const fz = -Math.cos(pose.yaw);
  const cone = Math.cos((SEARCH.viewConeDeg * Math.PI) / 180);
  for (const b of candidates) {
    const shape = BUILDING_SHAPES[b.kind];
    if (!shape.searchable) continue;
    const door = buildingLocalToWorld(b, shape.door.x, shape.door.z);
    const d = Math.hypot(door.x - pose.x, door.z - pose.z);
    if (d > SEARCH.reach || Math.abs(pose.y - b.y) > SEARCH.verticalReach) continue;
    // Yapının içine (merkezine) doğru bakmalı.
    const tx = b.x - pose.x;
    const tz = b.z - pose.z;
    const len = Math.hypot(tx, tz) || 1;
    if ((tx * fx + tz * fz) / len < cone) continue;
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** Ganimetin hepsi birlikte sığar mı (envanterin kopyasında denenir)? */
function fitsAll(inventory: Inventory, items: ReadonlyArray<ItemStack>): boolean {
  const trial = Inventory.fromJSON(inventory.toJSON(), {
    slots: inventory.slotCount,
    maxWeightG: inventory.maxWeightG,
  });
  return items.every((s) => trial.add(s.id, s.count) === 0);
}

/**
 * Yapı arama (saf mantık; toplama ile aynı kalıp): kapıda `E` basılı tutulunca `SEARCH.seconds` sonra yapının
 * ganimeti (deterministik) envantere **atomik** eklenir; sığmazsa hiçbir şey eklenmez ve yapı aranmamış kalır.
 * Her yapı bir kez aranır (kayda girer); boş çıkan yapı da aranmış sayılır ("çoktan yağmalanmış").
 */
export class BuildingSearch {
  private readonly searched = new Set<number>();
  private currentId: number | null = null;
  private elapsed = 0;
  private currentOffer: SearchOffer | null = null;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
  ) {}

  get offer(): SearchOffer | null {
    return this.currentOffer;
  }

  get progress(): number {
    return this.currentOffer?.status === 'ready' && this.currentId !== null
      ? Math.min(this.elapsed / SEARCH.seconds, 1)
      : 0;
  }

  isSearched(id: number): boolean {
    return this.searched.has(id);
  }

  /** Kayıt: aranmış yapı kimlikleri (sıralı). */
  toSave(): number[] {
    return [...this.searched].sort((a, b) => a - b);
  }

  loadSave(ids: readonly number[]): void {
    this.searched.clear();
    for (const id of ids) this.searched.add(id);
    this.currentId = null;
    this.elapsed = 0;
    this.currentOffer = null;
  }

  /** Bir sabit adım. `target`: aranabilecek yapı (yoksa null); `held`: `E` basılı mı. */
  update(dt: number, held: boolean, target: Building | null, alive = true): void {
    if (!target || !alive) {
      this.currentOffer = null;
      this.currentId = null;
      this.elapsed = 0;
      return;
    }
    const status: SearchOffer['status'] = this.searched.has(target.id)
      ? 'searched'
      : fitsAll(this.inventory, rollBuildingLoot(target))
        ? 'ready'
        : 'full';
    this.currentOffer = { status, building: target, seconds: SEARCH.seconds };
    if (status !== 'ready' || !held) {
      this.currentId = null;
      this.elapsed = 0;
      return;
    }
    if (this.currentId !== target.id) {
      this.currentId = target.id;
      this.elapsed = 0;
    }
    this.elapsed += dt;
    if (this.elapsed >= SEARCH.seconds) {
      this.complete(target);
      this.currentId = null;
      this.elapsed = 0;
    }
  }

  private complete(b: Building): void {
    const items = rollBuildingLoot(b);
    if (!fitsAll(this.inventory, items)) return;
    for (const s of items) this.inventory.add(s.id, s.count);
    this.searched.add(b.id);
    this.events.emit('building:searched', { id: b.id, kind: b.kind, items });
  }
}

/** Arama ipucu: "E (basılı tut): Evi ara" / "Aranmış: boş" / "Envanter dolu". */
export function searchPrompt(offer: SearchOffer): string {
  const name = BUILDING_NAMES[offer.building.kind];
  if (offer.status === 'searched') return `${name}: arandı, içi boş`;
  if (offer.status === 'full') return 'Envanter dolu: ganimet sığmıyor';
  return `E (basılı tut): ${name} ara`;
}

/** Arama bildirimi: "Bulundu: +2 Bulgur, +1 Bakır Tencere" / "Boş: çoktan yağmalanmış". */
export function searchedToast(
  items: ReadonlyArray<ItemStack>,
  names: (id: ItemStack['id']) => string,
): string {
  if (items.length === 0) return 'Boş çıktı: burası çoktan yağmalanmış';
  return `Bulundu: ${items.map((s) => `+${s.count} ${names(s.id)}`).join(', ')}`;
}
