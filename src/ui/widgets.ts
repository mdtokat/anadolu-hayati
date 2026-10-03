import { formatMoney } from '../economy/wallet';
import type { Inventory, ItemStack } from '../items/Inventory';
import { loadLevel } from './hudView';
import { CATEGORY_ACCENT, itemIcon, uiIcon } from './icons';
import { slotView, weightText } from './inventoryView';

/** Panellerin ortak küçük DOM parçaları (envanter, sandık). Görünüm modeli `inventoryView.ts`'tedir. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Yük göstergesi: ağırlık çubuğu ve "4,2 / 25,0 kg". */
export function loadMeter(inventory: Inventory): HTMLElement {
  const { fraction, level } = loadLevel(inventory.totalWeightG, inventory.maxWeightG);
  const meter = el('div', 'inv-load');
  meter.dataset.level = level;
  const track = el('div', 'inv-load-track');
  const fill = el('div', 'inv-load-fill');
  fill.style.width = `${(fraction * 100).toFixed(1)}%`;
  track.append(fill);
  meter.append(uiIcon('weight'), track, el('span', 'inv-load-text', weightText(inventory)));
  return meter;
}

/** Envanter/sandık slotu: simge, adet rozeti; boşsa sönük. */
export function slotButton(stack: Readonly<ItemStack> | null): HTMLButtonElement {
  const view = slotView(stack);
  const slot = el('button', 'inv-slot');
  slot.type = 'button';
  slot.title = view.title;
  slot.dataset.empty = String(view.empty);
  if (view.id !== null && view.category !== null) {
    slot.style.setProperty('--accent', CATEGORY_ACCENT[view.category]);
    slot.append(
      itemIcon(view.id, 'item-icon inv-slot-icon'),
      el('span', 'inv-slot-name', view.name),
    );
  }
  if (view.count) slot.append(el('span', 'inv-slot-count', view.count));
  return slot;
}

/** Başlıktaki kapat düğmesi: metin ve tuş simgesi. */
export function closeButton(label: string, key: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'inv-close secondary');
  button.type = 'button';
  button.append(el('span', '', label), el('kbd', 'ui-key', key));
  button.addEventListener('click', onClick);
  return button;
}

/** Cüzdan rozeti: sikke simgesi ve "1.250 ₺". */
export function moneyBadge(money: number): HTMLElement {
  const badge = el('div', 'inv-money');
  badge.title = 'Cüzdan';
  badge.append(uiIcon('coin'), el('span', 'inv-money-text', formatMoney(money)));
  return badge;
}
