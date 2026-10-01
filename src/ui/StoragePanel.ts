import './ui.css';
import { INPUT } from '../config';
import type { Inventory } from '../items/Inventory';
import { uiIcon } from './icons';
import { closeButton, el, loadMeter, slotButton } from './widgets';
import { slotUsageText } from './inventoryView';

export interface StoragePanelCallbacks {
  /** Oyuncu slotundaki yığını sandığa koy. */
  onStore(slot: number): void;
  /** Sandık slotundaki yığını oyuncuya al. */
  onTake(slot: number): void;
  onStoreAll(): void;
  onTakeAll(): void;
  /** Panel kapatılmak isteniyor (Kapat, Esc, E, I/Tab, dış alana tıklama). */
  onClose(): void;
}

/**
 * Sandık paneli (Faz 9; HTML overlay, envanter paneliyle aynı görünüm): solda oyuncunun, sağda sandığın slotları.
 * Bir slota tıklamak o yığını karşı tarafa taşır (sığdığı kadar). Taşıma mantığı `placement/storage.ts`'te; bu
 * sınıf yalnızca çizer ve tıklamaları geri çağrılara iletir. Oyun panel açıkken duraklatılır (Game).
 */
export class StoragePanel {
  private readonly root = el('div', 'inv-panel');
  private readonly panel = el('div', 'inv-panel-body');
  private chest: Inventory | null = null;
  private title = '';

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
    private readonly callbacks: StoragePanelCallbacks,
  ) {
    this.root.hidden = true;
    this.panel.addEventListener('click', (event) => event.stopPropagation());
    this.root.addEventListener('click', () => this.callbacks.onClose());
    this.root.append(this.panel);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.chest !== null;
  }

  show(chest: Inventory, title: string): void {
    const wasOpen = this.chest !== null;
    this.chest = chest;
    this.title = title;
    this.root.hidden = false;
    if (!wasOpen) document.addEventListener('keydown', this.onKeyDown);
    this.refresh();
  }

  hide(): void {
    if (this.chest === null) return;
    this.chest = null;
    this.root.hidden = true;
    document.removeEventListener('keydown', this.onKeyDown);
  }

  refresh(): void {
    const chest = this.chest;
    if (chest === null) return;
    const header = el('div', 'inv-header');
    const titleBox = el('div', 'inv-title-box');
    const title = el('h2', 'inv-title');
    title.append(uiIcon('chest', 'ui-icon inv-title-icon'), el('span', '', this.title));
    titleBox.append(
      title,
      el('div', 'inv-title-sub', 'Bir eşyaya tıkla: yığın karşı tarafa geçer (sığdığı kadar).'),
    );
    header.append(
      titleBox,
      closeButton('Kapat', 'E', () => this.callbacks.onClose()),
    );

    const body = el('div', 'inv-columns');
    body.append(
      this.buildSide('Envanterin', this.inventory, 'Hepsini koy', this.callbacks.onStoreAll, (i) =>
        this.callbacks.onStore(i),
      ),
      this.buildSide(this.title, chest, 'Hepsini al', this.callbacks.onTakeAll, (i) =>
        this.callbacks.onTake(i),
      ),
    );
    this.panel.replaceChildren(header, body);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  private buildSide(
    title: string,
    inventory: Inventory,
    allLabel: string,
    onAll: () => void,
    onSlot: (slot: number) => void,
  ): HTMLElement {
    const section = el('section', 'inv-section inv-slots-section');
    const head = el('div', 'inv-section-head');
    head.append(
      el('h3', 'inv-subtitle', title),
      el('span', 'inv-section-meta', `${slotUsageText(inventory)} slot`),
    );
    const all = el('button', 'inv-transfer-all', allLabel);
    all.type = 'button';
    all.disabled = inventory.slots.every((stack) => stack === null);
    all.addEventListener('click', () => onAll());
    head.append(all);
    section.append(head, loadMeter(inventory));

    const grid = el('div', 'inv-slots');
    inventory.slots.forEach((stack, index) => {
      const slot = slotButton(stack);
      slot.disabled = stack === null;
      slot.addEventListener('click', () => onSlot(index));
      grid.append(slot);
    });
    section.append(grid);
    return section;
  }
}
