import { CLOCK, INPUT } from '../config';
import { ITEMS } from '../items/itemDefs';
import type { ConfirmFailure, Ghost, ToggleResult } from './PlacementController';
import type { StructureKind } from './structures';
import type { TendOffer } from './tend';

const FAILURE_TEXT: Record<ConfirmFailure, string> = {
  too_far: 'Çok uzak',
  in_sea: 'Suya ve kıyıya kurulamaz',
  too_steep: 'Zemin çok dik',
  near_water: 'Su kenarına kurulamaz',
  too_close: 'Başka bir yapıya çok yakın',
  not_aiming: '',
  no_target: 'Hedef yok',
  no_item: 'Eşya kalmadı',
  dead: '',
};

/** Yerleştirme engelinin Türkçe açıklaması (boşsa gösterilecek bir şey yok). */
export function placeFailureText(reason: ConfirmFailure): string {
  return FAILURE_TEXT[reason];
}

const KEY_FOR_KIND: Record<StructureKind, string> = {
  campfire: INPUT.bindings.placeCampfire[0].replace('Key', ''),
  lean_to: INPUT.bindings.placeShelter[0].replace('Key', ''),
};

/** Hayalet ipucu: geçerliyse "Sol tık: … kur · F: iptal", değilse engel nedeni. */
export function aimPrompt(ghost: Readonly<Ghost>): string {
  if (!ghost.valid && ghost.reason) return placeFailureText(ghost.reason);
  return `Sol tık: ${ITEMS[ghost.kind].name} kur · ${KEY_FOR_KIND[ghost.kind]}: iptal`;
}

/** Hedeflemeyi başlatamama bildirimi; başarıda ya da ölüyken gösterilecek bir şey yok (null). */
export function toggleToast(result: ToggleResult, kind: StructureKind): string | null {
  return result === 'no_item' ? `Envanterinde ${ITEMS[kind].name} yok` : null;
}

export function placedToast(kind: StructureKind): string {
  return `${ITEMS[kind].name} kuruldu`;
}

/** Gerçek saniyeyi oyun saatine çevirir (24 gerçek dk = 24 oyun saati varsayılanında 60 sn = 1 sa). */
export function gameHours(seconds: number): number {
  return seconds / (CLOCK.dayLengthSeconds / 24);
}

/** "+1,5 sa" biçiminde (virgüllü ondalık). */
export function fuelToast(seconds: number): string {
  return `Ateş uzadı: +${gameHours(seconds).toFixed(1).replace('.', ',')} sa`;
}

/** Yakındaki ateşe yakıt ipucu; gösterilecek bir şey yoksa null. */
export function tendPrompt(offer: TendOffer): string | null {
  if (offer.status === 'ready' && offer.item) {
    return `E (basılı tut): Ateşe ${ITEMS[offer.item].name.toLowerCase()} at`;
  }
  if (offer.status === 'noFuel') return 'Ateşe atacak dal veya kütük yok';
  return null;
}
