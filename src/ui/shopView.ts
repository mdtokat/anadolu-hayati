import { ECONOMY } from '../config';
import { buyPrice } from '../economy/prices';
import { maxBuyable, offerFor, type ShopDeps } from '../economy/shop';
import { VENDOR_DEFS, type VendorKind } from '../economy/vendors';
import type { ItemStack } from '../items/Inventory';
import { ITEMS, type ItemId } from '../items/itemDefs';

/** Dükkân panelinin görünüm modeli (saf; DOM'suz). */

/** Satıcının sattığı bir eşyanın satırı. */
export interface BuyRow {
  id: ItemId;
  name: string;
  /** Adet fiyatı (₺; test modunda da gerçek fiyat gösterilir). */
  price: number;
  /** Şu an alınabilecek en çok adet. */
  max: number;
  /** Alınamıyorsa nedeni ("Para yetmiyor", "Yer yok"); alınabiliyorsa null. */
  blocked: string | null;
}

export function buyRows(vendor: VendorKind, deps: ShopDeps): BuyRow[] {
  return VENDOR_DEFS[vendor].stock.map((id) => {
    const max = maxBuyable(vendor, id, deps);
    const price = buyPrice(id);
    let blocked: string | null = null;
    if (max === 0) {
      blocked = deps.inventory.capacityFor(id) === 0 ? 'Yer yok' : 'Para yetmiyor';
    }
    return { id, name: ITEMS[id].name, price, max, blocked };
  });
}

/** Satılacak yığının teklifi. */
export interface SellOffer {
  /** Adet fiyatı (₺; 0: satıcı almaz). */
  unit: number;
  /** Satıcının uzmanlık alanında mı (daha iyi fiyat)? */
  specialty: boolean;
  /** Tüm yığının tutarı. */
  total: number;
}

export function sellOffer(vendor: VendorKind, stack: Readonly<ItemStack>): SellOffer {
  const unit = offerFor(vendor, stack.id);
  return {
    unit,
    specialty: VENDOR_DEFS[vendor].specialty(stack.id),
    total: unit * stack.count,
  };
}

/** Girilen adedi 1…en çok aralığına sıkıştırır (en çok 0 ise 1; düğme zaten sönük). */
export function clampBuyCount(value: number, max: number): number {
  const top = Math.max(1, Math.min(max, ECONOMY.maxBatch));
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(top, Math.floor(value)));
}
