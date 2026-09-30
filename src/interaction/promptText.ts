import { ITEMS, type ItemId } from '../items/itemDefs';
import type { GatherOffer } from './gather';

/** Toplama ipucu: "E (basılı tut): Dal topla" / "Kesmek için taş balta gerekir" / "Envanter dolu". */
export function gatherPrompt(offer: GatherOffer): string {
  if (offer.status === 'full') return 'Envanter dolu';
  if (offer.status === 'needAxe') return offer.label;
  return `E (basılı tut): ${offer.label}`;
}

/** Toplama bildirimi: "+3 Fındık". */
export function collectedToast(item: ItemId, count: number): string {
  return `+${count} ${ITEMS[item].name}`;
}
