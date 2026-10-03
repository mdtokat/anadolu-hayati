import { SEARCH } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { Inventory, type ItemStack } from '../items/Inventory';
import {
  BUILDING_NAMES,
  BUILDING_SHAPES,
  CONTAINER_DIMS,
  CONTAINER_NAMES,
  containerFront,
  type InteriorContainer,
} from './kinds';
import type { Building } from './layout';
import { rollBuildingLoot, rollContainerLoot } from './loot';
import { buildingLocalToWorld } from './SettlementMap';

/**
 * Aranacak hedef: kapıdan aranan yapı (serender, maden, fabrika) ya da girilebilir yapının içindeki bir kap (sandık,
 * dolap). `id` kayıt kimliğidir: kapı için yapı kimliği, kap için `containerId(yapı, sıra)`.
 */
export type SearchTarget =
  | { type: 'door'; id: number; building: Building }
  | {
      type: 'container';
      id: number;
      building: Building;
      index: number;
      container: InteriorContainer;
    };

/** Aranabilecek hedef ve durumu (HUD ipucu). */
export interface SearchOffer {
  /** `ready`: aranabilir; `searched`: çoktan arandı; `full`: ganimet envantere sığmıyor. */
  status: 'ready' | 'searched' | 'full';
  target: SearchTarget;
  building: Building;
  seconds: number;
}

/** Bir yapıdaki en çok kap sayısı (kap kimliği: `yapı · CONTAINER_SLOTS + sıra`). */
export const CONTAINER_SLOTS = 8;

/** Kabın kalıcı kimliği (kayıtta `settlements.containers`). */
export function containerId(building: { id: number }, index: number): number {
  return building.id * CONTAINER_SLOTS + index;
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
 * Oyuncunun arayabileceği hedef. Önce içeride: kabın önüne `SEARCH.containerReach` yakın, aynı katta ve kaba
 * `containerConeDeg` içinde bakan en yakın kap. Yoksa kapıdan aranan yapı: kapı noktasına `SEARCH.reach` yakın,
 * dikey farkı `verticalReach` içinde ve yapıya `viewConeDeg` içinde bakan, en yakın aranabilir yapı. Cami, türbe,
 * mezarlık aranmaz.
 */
export function searchTarget(
  candidates: readonly Building[],
  pose: SearchPose,
): SearchTarget | null {
  const fx = -Math.sin(pose.yaw);
  const fz = -Math.cos(pose.yaw);
  let best: SearchTarget | null = null;
  let bestD = Infinity;
  const containerCone = Math.cos((SEARCH.containerConeDeg * Math.PI) / 180);
  for (const b of candidates) {
    const shape = BUILDING_SHAPES[b.kind];
    if (shape.containers.length === 0) continue;
    if (Math.abs(pose.y - b.y) > SEARCH.containerVerticalReach) continue;
    shape.containers.forEach((c, index) => {
      const front = containerFront(c);
      const reachDepth = CONTAINER_DIMS[c.kind].d / 2;
      // Kabın ön yüzünün ortası (dünya).
      const face = buildingLocalToWorld(b, c.x + front.x * reachDepth, c.z + front.z * reachDepth);
      const center = buildingLocalToWorld(b, c.x, c.z);
      const d = Math.hypot(face.x - pose.x, face.z - pose.z);
      if (d > SEARCH.containerReach) return;
      const tx = center.x - pose.x;
      const tz = center.z - pose.z;
      const len = Math.hypot(tx, tz) || 1;
      if ((tx * fx + tz * fz) / len < containerCone) return;
      if (d < bestD) {
        bestD = d;
        best = { type: 'container', id: containerId(b, index), building: b, index, container: c };
      }
    });
  }
  if (best) return best;
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
      best = { type: 'door', id: b.id, building: b };
      bestD = d;
    }
  }
  return best;
}

/** Hedefin ganimeti (deterministik). */
export function lootOf(target: SearchTarget): ItemStack[] {
  return target.type === 'door'
    ? rollBuildingLoot(target.building)
    : rollContainerLoot(target.building, target.index);
}

/** Hedefin arama süresi (sn): kaplar kapıdan aramaktan kısadır. */
export function searchSeconds(target: SearchTarget): number {
  return target.type === 'door' ? SEARCH.seconds : SEARCH.containerSeconds;
}

/** Ganimetin hepsi birlikte sığar mı (envanterin kopyasında denenir)? */
function fitsAll(inventory: Inventory, items: ReadonlyArray<ItemStack>): boolean {
  const trial = inventory.clone();
  return items.every((s) => trial.add(s.id, s.count) === 0);
}

/**
 * Yapı arama (saf mantık; toplama ile aynı kalıp): hedefte `E` basılı tutulunca süre dolunca ganimet
 * (deterministik) envantere **atomik** eklenir; sığmazsa hiçbir şey eklenmez ve hedef aranmamış kalır. Her hedef bir
 * kez aranır (kayda girer); boş çıkan hedef de aranmış sayılır ("çoktan yağmalanmış"). Eski kayıtlarda kapıdan
 * aranmış yapının kapları da aranmış sayılır.
 */
export class BuildingSearch {
  private readonly searched = new Set<number>();
  private readonly containers = new Set<number>();
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
    const offer = this.currentOffer;
    return offer?.status === 'ready' && this.currentId !== null
      ? Math.min(this.elapsed / offer.seconds, 1)
      : 0;
  }

  /** Yapı (kapıdan) aranmış mı? */
  isSearched(id: number): boolean {
    return this.searched.has(id);
  }

  /** Hedef aranmış mı? */
  isTargetSearched(target: SearchTarget): boolean {
    if (this.searched.has(target.building.id)) return true;
    return target.type === 'container' && this.containers.has(target.id);
  }

  /** Kayıt: aranmış yapı kimlikleri (sıralı). */
  toSave(): number[] {
    return [...this.searched].sort((a, b) => a - b);
  }

  /** Kayıt: aranmış kap kimlikleri (sıralı). */
  containersToSave(): number[] {
    return [...this.containers].sort((a, b) => a - b);
  }

  loadSave(ids: readonly number[], containers: readonly number[] = []): void {
    this.searched.clear();
    this.containers.clear();
    for (const id of ids) this.searched.add(id);
    for (const id of containers) this.containers.add(id);
    this.currentId = null;
    this.elapsed = 0;
    this.currentOffer = null;
  }

  /** Bir sabit adım. `target`: aranabilecek hedef (yoksa null); `held`: `E` basılı mı. */
  update(dt: number, held: boolean, target: SearchTarget | null, alive = true): void {
    if (!target || !alive) {
      this.currentOffer = null;
      this.currentId = null;
      this.elapsed = 0;
      return;
    }
    const status: SearchOffer['status'] = this.isTargetSearched(target)
      ? 'searched'
      : fitsAll(this.inventory, lootOf(target))
        ? 'ready'
        : 'full';
    const seconds = searchSeconds(target);
    this.currentOffer = { status, target, building: target.building, seconds };
    if (status !== 'ready' || !held) {
      this.currentId = null;
      this.elapsed = 0;
      return;
    }
    const key = target.type === 'door' ? -1 - target.id : target.id;
    if (this.currentId !== key) {
      this.currentId = key;
      this.elapsed = 0;
    }
    this.elapsed += dt;
    if (this.elapsed >= seconds) {
      this.complete(target);
      this.currentId = null;
      this.elapsed = 0;
    }
  }

  private complete(target: SearchTarget): void {
    const items = lootOf(target);
    if (!fitsAll(this.inventory, items)) return;
    for (const s of items) this.inventory.add(s.id, s.count);
    if (target.type === 'door') this.searched.add(target.id);
    else this.containers.add(target.id);
    const b = target.building;
    this.events.emit('building:searched', {
      id: b.id,
      kind: b.kind,
      items,
      container: target.type === 'container' ? target.container.kind : null,
    });
  }
}

/** Arama ipucu: "E (basılı tut): Evi ara" / "Sandık: arandı, boş" / "Envanter dolu". */
export function searchPrompt(offer: SearchOffer): string {
  const target = offer.target;
  const name =
    target.type === 'container'
      ? CONTAINER_NAMES[target.container.kind]
      : BUILDING_NAMES[offer.building.kind];
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
