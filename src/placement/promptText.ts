import { CLOCK, INPUT } from '../config';
import type { ItemStack } from '../items/Inventory';
import { ITEMS } from '../items/itemDefs';
import type { DismantleOffer } from './dismantle';
import type { ConfirmFailure, Ghost, ToggleResult } from './PlacementController';
import { isPieceKind, pieceRotation, type PieceRotation } from './pieces';
import type { StructureKind } from './structures';
import type { TendOffer } from './tend';

const FAILURE_TEXT: Record<ConfirmFailure, string> = {
  too_far: 'Çok uzak',
  in_sea: 'Suya ve kıyıya kurulamaz',
  too_steep: 'Zemin çok dik',
  near_water: 'Su kenarına kurulamaz',
  too_close: 'Başka bir yapıya çok yakın',
  no_support: 'Destek yok: taban → duvar → çatı sırasıyla, bitişik kur',
  occupied: 'Burası dolu',
  on_roof: 'Çatının üstüne bir şey kurulamaz',
  stairwell: 'Merdivenin önü ve üstü açık kalmalı',
  not_aiming: '',
  no_target: 'Hedef yok',
  no_item: 'Eşya kalmadı',
  dead: '',
};

/** Yerleştirme engelinin Türkçe açıklaması (boşsa gösterilecek bir şey yok). */
export function placeFailureText(reason: ConfirmFailure): string {
  return FAILURE_TEXT[reason];
}

/** Doğrudan yerleştirme tuşu olan yapılar (diğerleri kısayol çubuğundan seçilir). */
const KEY_FOR_KIND: Partial<Record<StructureKind, string>> = {
  campfire: keyLabel(INPUT.bindings.placeCampfire[0]),
  lean_to: keyLabel(INPUT.bindings.placeShelter[0]),
};

/** `KeyC` → "C", `Digit3` → "3". */
export function keyLabel(code: string): string {
  return code.replace(/^(Key|Digit)/, '');
}

const ROTATE_KEY = keyLabel(INPUT.bindings.rotatePlacement[0]);

/** Modüler parçada `R`'nin yaptığı (ipucu metni; yoksa gösterilmez). */
const ROTATE_TEXT: Record<PieceRotation, string | null> = {
  none: null,
  face: 'yüzü çevir',
  direction: 'yönü çevir',
  ridge: 'mahyayı çevir',
};

/**
 * Hayalet ipucu: geçerliyse "Sol tık: … kur · R: döndür · C: iptal", değilse engel nedeni. `cancelKey`: hayaleti
 * kapatan tuş (kısayoldan açıldıysa o slotun tuşu); verilmezse türün doğrudan tuşu.
 */
export function aimPrompt(ghost: Readonly<Ghost>, cancelKey?: string): string {
  if (!ghost.valid && ghost.reason) return placeFailureText(ghost.reason);
  const cancel = cancelKey ?? KEY_FOR_KIND[ghost.kind];
  // Modüler parçalar ızgaraya kilitlidir: taban/çatı döndürülmez, duvar/kapı iç-dış yüzü, merdiven yönü, beşik çatı
  // mahyası çevrilir.
  const rotateText = isPieceKind(ghost.kind) ? ROTATE_TEXT[pieceRotation(ghost.kind)] : 'döndür';
  const rotate = rotateText ? `${ROTATE_KEY}: ${rotateText}` : null;
  return [`Sol tık: ${ITEMS[ghost.kind].name} kur`, rotate, cancel ? `${cancel}: iptal` : null]
    .filter((part) => part !== null)
    .join(' · ');
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

const INTERACT_KEY = keyLabel(INPUT.bindings.interact[0]);
const DISMANTLE_KEY = keyLabel(INPUT.bindings.dismantle[0]);
const INVENTORY_KEY = keyLabel(INPUT.bindings.toggleInventory[0]);

/** Saklama yapısını açma eylemi (Türkçe belirtme hâliyle). */
const OPEN_TEXT: Partial<Record<StructureKind, string>> = { storage_chest: 'Sandığı aç' };

/** Sandığa bakarken: "E: Sandığı aç · X (basılı tut): sök". */
export function storagePrompt(kind: StructureKind): string {
  const open = OPEN_TEXT[kind] ?? `${ITEMS[kind].name}: aç`;
  return `${INTERACT_KEY}: ${open} · ${DISMANTLE_KEY} (basılı tut): sök`;
}

/** Kapıya bakarken: "E: Kapıyı aç · X (basılı tut): sök". */
export function doorPrompt(open: boolean): string {
  return `${INTERACT_KEY}: Kapıyı ${open ? 'kapat' : 'aç'} · ${DISMANTLE_KEY} (basılı tut): sök`;
}

/** Bakılan yapı (başka ipucu yokken): adı, tezgâhta üretim hatırlatması ve sökme tuşu. */
export function structureHint(kind: StructureKind): string {
  const name = ITEMS[kind].name;
  const craft = kind === 'workbench' ? ` · ${INVENTORY_KEY}: tezgâhta üret` : '';
  return `${name}${craft} · ${DISMANTLE_KEY} (basılı tut): sök`;
}

/** `X` basılıyken: sökülüyor ya da neden sökülemiyor. */
export function dismantlePrompt(offer: DismantleOffer): string {
  if (offer.status === 'not_empty')
    return `Önce ${ITEMS[offer.kind].name.toLowerCase()} boşaltılmalı`;
  if (offer.status === 'no_space') return 'Envanterde yer yok: sökülen eşya sığmıyor';
  return `Sökülüyor: ${ITEMS[offer.kind].name}`;
}

/** Sökme bildirimi: "Söküldü: +1 Sandık". */
export function dismantledToast(items: ReadonlyArray<ItemStack>): string {
  return `Söküldü: ${items.map((i) => `+${i.count} ${ITEMS[i.id].name}`).join(', ')}`;
}
