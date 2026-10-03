import { ECONOMY } from '../config';
import type { Inventory } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import { buyPrice, isTradable, sellPrice } from './prices';
import { VENDOR_DEFS, type VendorKind } from './vendors';
import type { Wallet } from './wallet';

/**
 * Alışveriş (saf mantık; envanter ve cüzdan dışında yan etki yok). Her işlem atomiktir: para ya da yer yetmezse
 * hiçbir şey değişmez.
 */

/** Alış sonucu: yapıldı / para yetmiyor / sığmıyor / satıcı bunu satmıyor / geçersiz adet. */
export type BuyResult = 'ok' | 'money' | 'full' | 'not_sold' | 'bad_count';
/** Satış sonucu: yapıldı / slot boş ya da yetersiz / değersiz eşya / dolu çanta (önce boşaltılmalı). */
export type SellResult = 'ok' | 'empty' | 'worthless' | 'locked';

export interface ShopDeps {
  inventory: Inventory;
  wallet: Wallet;
  /** Test modu: alış ücretsiz (serbest üretim/inşa gibi). */
  free?: boolean;
}

/** Satıcı bu eşyayı satıyor mu? */
export function sells(vendor: VendorKind, id: ItemId): boolean {
  return VENDOR_DEFS[vendor].stock.includes(id);
}

/** Satıcının bu eşya için ödeyeceği adet fiyatı (₺). */
export function offerFor(vendor: VendorKind, id: ItemId): number {
  return sellPrice(id, VENDOR_DEFS[vendor].specialty(id));
}

/** Alınabilecek en çok adet: para, yer ve `ECONOMY.maxBatch` sınırı. */
export function maxBuyable(vendor: VendorKind, id: ItemId, deps: ShopDeps): number {
  if (!sells(vendor, id)) return 0;
  const price = buyPrice(id);
  const byMoney = deps.free || price === 0 ? Infinity : Math.floor(deps.wallet.money / price);
  return Math.max(0, Math.min(byMoney, deps.inventory.capacityFor(id), ECONOMY.maxBatch));
}

/** `count` adet alır. */
export function buyItem(vendor: VendorKind, id: ItemId, count: number, deps: ShopDeps): BuyResult {
  if (!Number.isInteger(count) || count <= 0) return 'bad_count';
  if (!sells(vendor, id)) return 'not_sold';
  const total = deps.free ? 0 : buyPrice(id) * count;
  if (!deps.wallet.canAfford(total)) return 'money';
  if (deps.inventory.capacityFor(id) < count) return 'full';
  deps.inventory.add(id, count);
  deps.wallet.spend(total);
  return 'ok';
}

/** Envanter slotundan `count` adet satar; kazanılan para `earned`'e yazılır. */
export function sellSlot(
  vendor: VendorKind,
  slot: number,
  count: number,
  deps: ShopDeps,
): { result: SellResult; id: ItemId | null; earned: number } {
  const stack = deps.inventory.slots[slot] ?? null;
  if (!stack || !Number.isInteger(count) || count <= 0 || stack.count < count) {
    return { result: 'empty', id: null, earned: 0 };
  }
  const id = stack.id;
  if (!isTradable(id) || offerFor(vendor, id) === 0) return { result: 'worthless', id, earned: 0 };
  const removed = deps.inventory.removeFromSlot(slot, count);
  if (!removed) return { result: 'locked', id, earned: 0 };
  const earned = offerFor(vendor, id) * count;
  deps.wallet.add(earned);
  return { result: 'ok', id, earned };
}

const BUY_TEXT: Record<Exclude<BuyResult, 'ok'>, string> = {
  money: 'Paran yetmiyor',
  full: 'Envanterde yer yok',
  not_sold: 'Bu satıcıda yok',
  bad_count: 'Geçersiz adet',
};

const SELL_TEXT: Record<Exclude<SellResult, 'ok'>, string> = {
  empty: 'Satılacak eşya yok',
  worthless: 'Bunu kimse almaz',
  locked: 'Dolu çanta satılamaz: önce boşalt',
};

/** Başarısız işlemin Türkçe açıklaması. */
export function shopFailureText(
  result: Exclude<BuyResult, 'ok'> | Exclude<SellResult, 'ok'>,
): string {
  return (
    (BUY_TEXT as Record<string, string>)[result] ??
    (SELL_TEXT as Record<string, string>)[result] ??
    ''
  );
}
