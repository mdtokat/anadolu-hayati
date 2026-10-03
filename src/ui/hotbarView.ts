import { INPUT } from '../config';
import { COOK_RECIPES } from '../combat/cooking';
import { isBackpack } from '../items/backpack';
import { isHoldable, type Hotbar } from '../items/hotbar';
import type { Inventory } from '../items/Inventory';
import { ITEMS, type ItemId } from '../items/itemDefs';
import { keyLabel } from '../placement/promptText';

/** Kısayol çubuğunun bir slotunun görünüm modeli (saf; `Hud` yalnızca bunu çizer). */
export interface HotbarSlotView {
  /** Tuş etiketi ("1"…"8"). */
  key: string;
  /** Bağlı eşya (simge için; boşsa null). */
  id: ItemId | null;
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
        id: null,
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
      id,
      name,
      count: have > 1 ? `×${have}` : '',
      empty: false,
      missing: have === 0,
      selected,
      title: `${key}: ${name}${have === 0 ? ' (envanterde yok)' : ` — ${use}`}`,
    };
  });
}

/**
 * Doğrudan kullanılamayan (`hotbarUse` → `none`) kısayol eşyasına basınca gösterilen açıklama: boş su kabı su
 * kenarında dolar, sırt çantası envanterde durdukça işe yarar, çiğ erzak ateşte (gerekirse tencereyle) pişirilir.
 */
export function unusableHotbarText(id: ItemId): string {
  const name = ITEMS[id].name;
  if (id === 'water_container_empty') return `${name}: tatlı su kenarında E ile doldur`;
  if (isBackpack(id)) return `${name}: sırtında taşınır, envanterde durması yeter`;
  const cook = COOK_RECIPES.find((r) => r.from === id);
  if (cook) {
    const pot = cook.requires ? ` (${ITEMS[cook.requires].name} gerekir)` : '';
    return `${name}: çiğ yenmez, yanan ateşin başında E ile pişir${pot}`;
  }
  if (ITEMS[id].category === 'food') return `${name}: çiğ yenmez`;
  return `${name}: doğrudan kullanılamaz`;
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
