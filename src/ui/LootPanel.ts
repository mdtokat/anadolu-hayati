import './ui.css';
import { INPUT } from '../config';
import type { Inventory, ItemStack } from '../items/Inventory';
import { uiIcon } from './icons';
import { slotUsageText } from './inventoryView';
import { closeButton, el, loadMeter, slotButton } from './widgets';

export interface LootPanelCallbacks {
  /** `index`'teki yığına çift tıklandı: sığdığı kadarı envantere alınır. */
  onTake(index: number): void;
  /** "Hepsini al": sığan her şey alınır. */
  onTakeAll(): void;
  /** Panel kapatılmak isteniyor (Kapat, Esc, E, I/Tab, dış alana tıklama). */
  onClose(): void;
}

/**
 * Ganimet paneli (Faz 11 sonrası; HTML overlay): bir aramadan (ölü eşkıya, kamp sandığı, bina kabı) çıkan eşyalar
 * otomatik alınmaz, burada listelenir. Eşyaya **çift tıklamak** onu envantere alır, "Hepsini al" sığan her şeyi alır;
 * sığmayanlar kaynakta kalır. Solda oyuncunun envanterinin özeti (yer ve yük) görünür. Liste kaynağın tuttuğu
 * değiştirilebilir diziye bakar (`items`); her eylemden sonra Game `refresh()` çağırır. Oyun panel açıkken donar.
 */
export class LootPanel {
  private readonly root = el('div', 'inv-panel');
  private readonly panel = el('div', 'inv-panel-body');
  private list: readonly ItemStack[] | null = null;
  private title = '';
  private selected: number | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const closers: readonly string[] = [
      ...INPUT.bindings.toggleInventory,
      ...INPUT.bindings.interact,
      'Escape',
    ];
    if (!closers.includes(event.code) || event.repeat) return;
    event.preventDefault();
    this.callbacks.onClose();
  };

  constructor(
    parent: HTMLElement,
    private readonly inventory: Inventory,
    private readonly callbacks: LootPanelCallbacks,
  ) {
    this.root.hidden = true;
    this.panel.addEventListener('click', (event) => event.stopPropagation());
    this.root.addEventListener('click', () => this.callbacks.onClose());
    this.root.append(this.panel);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.list !== null;
  }

  show(items: readonly ItemStack[], title: string): void {
    const wasOpen = this.list !== null;
    this.list = items;
    this.title = title;
    this.selected = null;
    this.root.hidden = false;
    if (!wasOpen) document.addEventListener('keydown', this.onKeyDown);
    this.refresh();
  }

  hide(): void {
    if (this.list === null) return;
    this.list = null;
    this.root.hidden = true;
    document.removeEventListener('keydown', this.onKeyDown);
  }

  refresh(): void {
    const list = this.list;
    if (list === null) return;
    if (this.selected !== null && this.selected >= list.length) this.selected = null;
    const header = el('div', 'inv-header');
    const titleBox = el('div', 'inv-title-box');
    const title = el('h2', 'inv-title');
    title.append(uiIcon('chest', 'ui-icon inv-title-icon'), el('span', '', this.title));
    titleBox.append(
      title,
      el('div', 'inv-title-sub', 'Almak istediğin eşyaya çift tıkla ya da “Hepsini al”.'),
    );
    header.append(
      titleBox,
      closeButton('Kapat', 'E', () => this.callbacks.onClose()),
    );

    const body = el('div', 'inv-columns');
    body.append(this.buildInventory(), this.buildLoot(list));
    this.panel.replaceChildren(header, body);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  /** Oyuncunun envanteri: yalnızca özet (yer ve yük), eşyalar değil. */
  private buildInventory(): HTMLElement {
    const section = el('section', 'inv-section');
    const head = el('div', 'inv-section-head');
    head.append(
      el('h3', 'inv-subtitle', 'Envanterin'),
      el('span', 'inv-section-meta', `${slotUsageText(this.inventory)} slot`),
    );
    section.append(head, loadMeter(this.inventory));
    return section;
  }

  private buildLoot(list: readonly ItemStack[]): HTMLElement {
    const section = el('section', 'inv-section inv-slots-section');
    const head = el('div', 'inv-section-head');
    head.append(
      el('h3', 'inv-subtitle', 'Bulunanlar'),
      el('span', 'inv-section-meta', `${list.length} çeşit`),
    );
    const all = el('button', 'inv-transfer-all', 'Hepsini al');
    all.type = 'button';
    all.disabled = list.length === 0;
    all.addEventListener('click', () => this.callbacks.onTakeAll());
    head.append(all);
    section.append(head);

    const grid = el('div', 'inv-slots');
    list.forEach((stack, index) => {
      const slot = slotButton(stack);
      slot.dataset.selected = String(this.selected === index);
      // Tek tık yalnızca vurgular (DOM'u yeniden kurmaz: çift tıklama aynı düğmeye ulaşmalı).
      slot.addEventListener('click', () => {
        this.selected = index;
        grid.querySelectorAll<HTMLElement>('.inv-slot').forEach((node, i) => {
          node.dataset.selected = String(i === index);
        });
      });
      slot.addEventListener('dblclick', () => this.callbacks.onTake(index));
      grid.append(slot);
    });
    if (list.length === 0)
      section.append(el('div', 'inv-hint', 'Burada alınacak bir şey kalmadı.'));
    section.append(grid);
    return section;
  }
}
