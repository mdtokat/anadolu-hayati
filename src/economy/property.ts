import { PROPERTY } from '../config';
import {
  BUILDING_NAMES,
  BUILDING_SHAPES,
  containerBox,
  type BuildingKind,
} from '../settlements/kinds';
import type { Building } from '../settlements/layout';
import { buildingLocalToWorld, worldToBuildingLocal } from '../settlements/SettlementMap';
import type { Wallet } from './wallet';

/**
 * Tapu (saf mantık): yerleşim yapılarının satın alınması ve sahiplik. Sahip olunan yapıların kimlikleri kayda girer
 * (`economy.owned`). Kurallar: satılık türler `PROPERTY.prices`'tadır (cami, türbe, mezarlık, çeşme, şadırvan, anıt,
 * hükümet konağı satılık değil); fiyat tür × rütbe × (apartmanda kat) × (yıkıksa indirim), `PROPERTY.round`'a yuvarlı.
 */

export type SettlementRank = 'il' | 'ilce' | 'koy';

/** Yapı türü satılık mı? */
export function isForSale(kind: BuildingKind): boolean {
  return kind in PROPERTY.prices;
}

/** Yapının tapu fiyatı (₺); satılık değilse null. */
export function propertyPrice(b: Building, rank: SettlementRank): number | null {
  const base = (PROPERTY.prices as Partial<Record<BuildingKind, number>>)[b.kind];
  if (base === undefined) return null;
  const floors = (PROPERTY.perFloorKinds as readonly string[]).includes(b.kind)
    ? Math.max(1, b.floors)
    : 1;
  const raw = base * floors * PROPERTY.rankScale[rank] * (b.ruined ? PROPERTY.ruinedScale : 1);
  return Math.max(PROPERTY.round, Math.round(raw / PROPERTY.round) * PROPERTY.round);
}

/** Tapuyu geri satınca alınan para (₺). */
export function resalePrice(price: number): number {
  return Math.floor(price * PROPERTY.resaleRatio);
}

export type PropertyBuyResult = 'ok' | 'owned' | 'not_for_sale' | 'money';
export type PropertySellResult = 'ok' | 'not_owned';

/** Sahip olunan yapılar (kayıtlı). */
export class Property {
  private readonly owned = new Set<number>();
  /** Satın alma sırası (en son alınan sonda): evde doğma en son alınan girilebilir yapıyı seçer. */
  private order: number[] = [];
  private revision = 0;

  get version(): number {
    return this.revision;
  }

  isOwned(id: number): boolean {
    return this.owned.has(id);
  }

  /** Sahip olunan yapı kimlikleri (alış sırasıyla). */
  list(): readonly number[] {
    return this.order;
  }

  /** Satın alır: para düşer, yapı sahip olunanlara eklenir (atomik). `free`: test modu. */
  buy(b: Building, rank: SettlementRank, wallet: Wallet, free = false): PropertyBuyResult {
    if (this.owned.has(b.id)) return 'owned';
    const price = propertyPrice(b, rank);
    if (price === null) return 'not_for_sale';
    if (!free && !wallet.spend(price)) return 'money';
    this.owned.add(b.id);
    this.order.push(b.id);
    this.revision += 1;
    return 'ok';
  }

  /** Tapuyu geri satar (`resalePrice`); içindeki oyuncu yapıları yerinde kalır. */
  sell(b: Building, rank: SettlementRank, wallet: Wallet): PropertySellResult {
    if (!this.owned.has(b.id)) return 'not_owned';
    this.owned.delete(b.id);
    this.order = this.order.filter((id) => id !== b.id);
    this.revision += 1;
    wallet.add(resalePrice(propertyPrice(b, rank) ?? 0));
    return 'ok';
  }

  toSave(): number[] {
    return [...this.order];
  }

  loadSave(ids: readonly number[]): void {
    this.owned.clear();
    this.order = [];
    for (const id of ids) {
      if (this.owned.has(id)) continue;
      this.owned.add(id);
      this.order.push(id);
    }
    this.revision += 1;
  }
}

/** Oyuncunun bakışı. */
export interface PropertyPose {
  x: number;
  y: number;
  z: number;
  /** Bakış yaw'ı (ileri = (−sin yaw, −cos yaw)). */
  yaw: number;
}

/**
 * Tapu ipucunun hedefi: kapı noktasına `PROPERTY.reach` yakın, dikey farkı `verticalReach` içinde, yapıya
 * `viewConeDeg` içinde bakılan en yakın satılık (ya da sahip olunan) yapı; yoksa null.
 */
export function propertyTarget(
  candidates: readonly Building[],
  pose: PropertyPose,
  isOwned: (id: number) => boolean = () => false,
): Building | null {
  const fx = -Math.sin(pose.yaw);
  const fz = -Math.cos(pose.yaw);
  const cone = Math.cos((PROPERTY.viewConeDeg * Math.PI) / 180);
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of candidates) {
    if (!isForSale(b.kind) && !isOwned(b.id)) continue;
    const shape = BUILDING_SHAPES[b.kind];
    const door = buildingLocalToWorld(b, shape.door.x, shape.door.z);
    const d = Math.hypot(door.x - pose.x, door.z - pose.z);
    if (d > PROPERTY.reach || Math.abs(pose.y - b.y) > PROPERTY.verticalReach) continue;
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

/**
 * (x, z) yapının iç mekânında, duvarlardan ve bina içi kaplardan (sandık/dolap) `margin` uzakta mı? İç mekânı
 * olmayan yapıda hep false.
 */
export function roomContains(b: Building, x: number, z: number, margin: number): boolean {
  const shape = BUILDING_SHAPES[b.kind];
  const area = shape.interior;
  if (!area) return false;
  const local = worldToBuildingLocal(b, x, z);
  if (Math.abs(local.x) > area.halfWidth - margin) return false;
  if (local.z < area.back + margin || local.z > area.front - margin) return false;
  for (const c of shape.containers) {
    const box = containerBox(c);
    if (
      Math.abs(local.x - box.cx) < box.hx + margin &&
      Math.abs(local.z - box.cz) < box.hz + margin
    ) {
      return false;
    }
  }
  return true;
}

/** Evde doğma noktası: kapının iç tarafı (kaplara değmiyorsa), yoksa oda ortası; iç mekânı yoksa null. */
export function homeSpawnPoint(b: Building): { x: number; y: number; z: number } | null {
  const shape = BUILDING_SHAPES[b.kind];
  const area = shape.interior;
  if (!area) return null;
  const lx = Math.max(-area.halfWidth + 0.6, Math.min(area.halfWidth - 0.6, shape.door.x));
  const tries = [
    buildingLocalToWorld(b, lx, area.front - 1.1),
    buildingLocalToWorld(b, 0, (area.back + area.front) / 2),
  ];
  const p =
    tries.find((t) => roomContains(b, t.x, t.z, 0.4)) ?? (tries[0] as { x: number; z: number });
  return { x: p.x, y: b.y + 0.2, z: p.z };
}

/** "Ev (Safranbolu)" biçiminde ad. */
export function propertyName(b: Building, town: string | null): string {
  const name = b.name ?? BUILDING_NAMES[b.kind];
  return town ? `${name} (${town})` : name;
}
