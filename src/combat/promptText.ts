import { ITEMS } from '../items/itemDefs';
import type { ItemStack } from '../items/Inventory';
import type { CreatureKind } from '../creatures/kinds';
import type { ButcherOffer } from './carcass';
import type { CookOffer } from './cooking';

/** Tür adları (Türkçe). */
export const CREATURE_NAMES: Readonly<Record<CreatureKind, string>> = {
  roe_deer: 'Karaca',
  wild_boar: 'Yaban domuzu',
  wolf: 'Kurt',
  brown_bear: 'Boz ayı',
};

/** Leş kesme ipucu: "E (basılı tut): Karacayı kes" / "Envanter dolu". */
export function butcherPrompt(offer: ButcherOffer): string {
  if (offer.status === 'full') return 'Envanter dolu';
  const tool = offer.tool === 'bone_knife' ? ' (bıçakla)' : offer.withAxe ? ' (baltayla)' : '';
  return `E (basılı tut): ${CREATURE_NAMES[offer.kind]} leşini kes${tool}`;
}

/**
 * Pişirme ipucu. Yakıt atılabilecek durumdaysa (`hasFuel`) öncelik kuralı açıkça söylenir: çiğ et varken
 * `E` eti pişirir, yakıtı etler bitince atar. Pişmiş et sığmıyorsa (`full`) neden söylenir.
 */
export function cookPrompt(hasFuel: boolean, status: CookOffer['status'] = 'ready'): string {
  if (status === 'full') return 'Envanter dolu: pişmiş et sığmıyor';
  return hasFuel
    ? 'E (basılı tut): Eti pişir · et bitince yakıt atılır'
    : 'E (basılı tut): Eti pişir';
}

/** Kesim bildirimi: "Kesildi: +3 Çiğ Et, +1 Deri". */
export function butcheredToast(items: ReadonlyArray<ItemStack>, leftOver: boolean): string {
  const list = items.map((i) => `+${i.count} ${ITEMS[i.id].name}`).join(', ');
  return leftOver ? `${list} · envanter dolu, kalanı leşte` : `Kesildi: ${list}`;
}

/** Pişirme bildirimi. */
export function cookedToast(count: number): string {
  return `Pişti: ${ITEMS.cooked_meat.name}${count > 1 ? ` ×${count}` : ''}`;
}
