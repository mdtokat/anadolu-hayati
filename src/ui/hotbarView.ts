import { INPUT } from '../config';
import { isHoldable, type Hotbar } from '../items/hotbar';
import type { Inventory } from '../items/Inventory';
import { ITEMS } from '../items/itemDefs';
import { keyLabel } from '../placement/promptText';

/** Kısayol çubuğunun bir slotunun görünüm modeli (saf; `Hud` yalnızca bunu çizer). */
export interface HotbarSlotView {
  /** Tuş etiketi ("1"…"8"). */
  key: string;
  /** Eşya adı (boşsa ""). */
  name: string;
  /** Envanterdeki adet etiketi ("×3"; tek adette ya da yoksa ""). */
  count: string;
  empty: boolean;
  /** Bağlı eşya envanterde yok (sönük gösterilir). */
  missing: boolean;
  selected: boolean;
  /** Üzerine gelince / ekran okuyucu. */
  title: string;
}

/** Çubuğun tüm slotları. */
export function hotbarViews(hotbar: Hotbar, inventory: Inventory): HotbarSlotView[] {
  return hotbar.slots.map((id, index) => {
    const key = keyLabel(INPUT.bindings.hotbar[index] ?? '');
    const selected = hotbar.selected === index;
    if (id === null) {
      return {
        key,
        name: '',
        count: '',
        empty: true,
        missing: false,
        selected,
        title: `${key}: boş`,
      };
    }
    const have = inventory.count(id);
    const name = ITEMS[id].name;
    const use = isHoldable(id) ? 'elde tut' : 'kullan';
    return {
      key,
      name,
      count: have > 1 ? `×${have}` : '',
      empty: false,
      missing: have === 0,
      selected,
      title: `${key}: ${name}${have === 0 ? ' (envanterde yok)' : ` — ${use}`}`,
    };
  });
}

/** Çubuğun üstünde gösterilen elde tutulan eşya ("Elde: Taş Mızrak"); el boşsa "". */
export function heldLabel(hotbar: Hotbar, inventory: Inventory): string {
  const id = hotbar.selectedItem;
  if (id === null || !inventory.has(id)) return '';
  return `Elde: ${ITEMS[id].name}`;
}

/** Çubuğun "kirli" imzası: değişmedikçe DOM yeniden çizilmez. */
export function hotbarSignature(hotbar: Hotbar, inventory: Inventory): string {
  return `${hotbar.version}:${inventory.version}`;
}
