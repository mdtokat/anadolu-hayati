import { HORIZONTAL_SCALE } from '../config';
import { Inventory, type ItemStack } from '../items/Inventory';
import { ITEMS } from '../items/itemDefs';
import { ROLES, directionName, distanceWords, type PersonRole, type TradeOffer } from './roles';

/** Takas sonucu: yapıldı / oyuncunun vereceği yok / alacağı sığmıyor / hediye zaten verildi. */
export type TradeResult = 'ok' | 'missing' | 'full' | 'used';

/**
 * Takası atomik uygular (saf; envanter dışında yan etki yok): oyuncu `give`'i verir, `get`'i alır. Hepsi
 * birlikte olmazsa hiçbir şey değişmez. Hediye (boş `give`) kişi başına bir kez (`gifted`).
 */
export function executeTrade(inventory: Inventory, offer: TradeOffer, gifted = false): TradeResult {
  if (offer.give.length === 0 && gifted) return 'used';
  if (!inventory.canAfford(offer.give)) return 'missing';
  const trial = Inventory.fromJSON(inventory.toJSON(), {
    slots: inventory.slotCount,
    maxWeightG: inventory.maxWeightG,
  });
  trial.take(offer.give);
  if (!offer.get.every((s) => trial.add(s.id, s.count) === 0)) return 'full';
  inventory.take(offer.give);
  for (const s of offer.get) inventory.add(s.id, s.count);
  return 'ok';
}

/** "2 Deri" biçiminde liste. */
export function stacksText(stacks: readonly ItemStack[]): string {
  return stacks.map((s) => `${s.count} ${ITEMS[s.id].name}`).join(', ');
}

/** Takas teklifinin metni: "2 Deri → 1 Yün Battaniye" ya da "Hediye: 3 Kuru Kayısı". */
export function tradeText(offer: TradeOffer): string {
  return offer.give.length === 0
    ? `Hediye: ${stacksText(offer.get)}`
    : `${stacksText(offer.give)} → ${stacksText(offer.get)}`;
}

/** Bir yer tarifi: "Kuzeydoğuda, 1,2 kilometre kadar ötede bir çeşme var." */
export function directionsAnswer(
  role: PersonRole,
  from: { x: number; z: number },
  target: { x: number; z: number; what: string } | null,
): string {
  const address = ROLES[role].address;
  if (!target) return `Bilmiyorum ${address}, bu taraflarda göremedim.`;
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const dir = directionName(dx, dz);
  const dist = distanceWords(Math.hypot(dx, dz), HORIZONTAL_SCALE);
  const where = `${dir.charAt(0).toLocaleUpperCase('tr')}${dir.slice(1)}`;
  return `${where} tarafında, ${dist} ötede ${target.what} var ${address}.`;
}
