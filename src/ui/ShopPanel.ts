import './ui.css';
import { INPUT } from '../config';
import type { ShopDeps } from '../economy/shop';
import { VENDOR_DEFS, type Vendor } from '../economy/vendors';
import { formatMoney } from '../economy/wallet';
import { ITEMS } from '../items/itemDefs';
import { CATEGORY_ACCENT, itemIcon, uiIcon } from './icons';
import { slotUsageText } from './inventoryView';
import { buyRows, clampBuyCount, sellOffer, type BuyRow } from './shopView';
import { closeButton, el, loadMeter, moneyBadge, slotButton } from './widgets';

export interface ShopPanelCallbacks {
  /** `count` adet al; sonuç metni (başarısızsa açıklama) döner. */
  onBuy(id: BuyRow['id'], count: number): string;
  /** Oyuncu slotundan `count` adet sat; sonuç metni döner. */
  onSell(slot: number, count: number): string;
  /** Panel kapatılmak isteniyor (Kapat, Esc, E, dış alana tıklama). */
  onClose(): void;
}

/**
 * Dükkân paneli (alışveriş; HTML overlay, envanter paneliyle aynı görünüm): solda satıcının sattıkları (adet
 * kutusu, "En çok", "Al"), sağda oyuncunun envanteri — bir yığına tıklayınca satış teklifi ("1 sat", "Hepsini sat").
 * Mantık `economy/shop.ts`'te; bu sınıf yalnızca çizer. Oyun panel açıkken duraklatılır (Game).
 */
export class ShopPanel {
  private readonly root = el('div', 'inv-panel shop-panel');
  private readonly panel = el('div', 'inv-panel-body');
  private vendor: Vendor | null = null;
  private selected: number | null = null;
  private status = '';
  /** Eşya başına girilen alış adedi (yeniden çizimde korunur). */
  private readonly counts = new Map<string, number>();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const closers: readonly string[] = [
      ...INPUT.bindings.toggleInventory,
      ...INPUT.bindings.interact,
      'Escape',
    ];
    if (event.repeat || !closers.includes(event.code)) return;
    // Adet kutusuna yazarken E/I harfleri paneli kapatmasın.
    if (event.target instanceof HTMLInputElement && event.code !== 'Escape') return;
    event.preventDefault();
    this.callbacks.onClose();
  };

  constructor(
    parent: HTMLElement,
    private readonly deps: () => ShopDeps,
    private readonly callbacks: ShopPanelCallbacks,
  ) {
    this.root.hidden = true;
    this.panel.addEventListener('click', (event) => event.stopPropagation());
    this.root.addEventListener('click', () => this.callbacks.onClose());
    this.root.append(this.panel);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.vendor !== null;
  }

  show(vendor: Vendor): void {
    const wasOpen = this.vendor !== null;
    this.vendor = vendor;
    this.selected = null;
    this.status = VENDOR_DEFS[vendor.kind].greeting;
    this.root.hidden = false;
    if (!wasOpen) document.addEventListener('keydown', this.onKeyDown);
    this.refresh();
  }

  hide(): void {
    if (this.vendor === null) return;
    this.vendor = null;
    this.root.hidden = true;
    document.removeEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  refresh(): void {
    const vendor = this.vendor;
    if (!vendor) return;
    const deps = this.deps();
    const def = VENDOR_DEFS[vendor.kind];
    const header = el('div', 'inv-header');
    const titleBox = el('div', 'inv-title-box');
    const title = el('h2', 'inv-title');
    title.append(uiIcon('shop', 'ui-icon inv-title-icon'), el('span', '', vendor.name));
    titleBox.append(title, el('div', 'inv-title-sub', `${def.shop} · ${vendor.town}`));
    header.append(
      titleBox,
      moneyBadge(deps.wallet.money),
      closeButton('Ayrıl', 'E', () => this.callbacks.onClose()),
    );
    const status = el('div', 'shop-status', this.status);
    if (deps.free) status.append(el('span', 'shop-free', ' · Test modu: alışveriş ücretsiz'));

    const body = el('div', 'inv-columns');
    body.append(this.buildStock(deps), this.buildSell(deps));
    const listScroll = this.panel.querySelector('.shop-list')?.scrollTop ?? 0;
    const panelScroll = this.panel.scrollTop;
    this.panel.replaceChildren(header, el('div', 'ui-ornament'), status, body);
    const list = this.panel.querySelector('.shop-list');
    if (list) list.scrollTop = listScroll;
    this.panel.scrollTop = panelScroll;
  }

  private buildStock(deps: ShopDeps): HTMLElement {
    const section = el('section', 'inv-section');
    const head = el('div', 'inv-section-head');
    head.append(el('h3', 'inv-subtitle', 'Satın al'));
    section.append(head);
    const list = el('div', 'shop-list');
    for (const row of buyRows(this.vendor!.kind, deps)) list.append(this.buildRow(row));
    section.append(list);
    return section;
  }

  private buildRow(row: BuyRow): HTMLElement {
    const item = el('div', 'shop-row');
    item.dataset.blocked = String(row.blocked !== null);
    item.style.setProperty('--accent', CATEGORY_ACCENT[ITEMS[row.id].category]);
    const name = el('div', 'shop-row-name');
    name.append(el('span', '', row.name), el('span', 'shop-price', formatMoney(row.price)));
    const count = el('input', 'shop-count');
    count.type = 'number';
    count.min = '1';
    count.max = String(Math.max(1, row.max));
    count.value = String(clampBuyCount(this.counts.get(row.id) ?? 1, row.max));
    count.disabled = row.blocked !== null;
    count.addEventListener('change', () => {
      const value = clampBuyCount(Number(count.value), row.max);
      count.value = String(value);
      this.counts.set(row.id, value);
    });
    const most = el('button', 'shop-most secondary', 'En çok');
    most.type = 'button';
    most.disabled = row.blocked !== null;
    most.addEventListener('click', () => {
      this.counts.set(row.id, Math.max(1, row.max));
      this.refresh();
    });
    const buy = el('button', 'shop-buy', row.blocked ?? 'Al');
    buy.type = 'button';
    buy.disabled = row.blocked !== null;
    buy.addEventListener('click', () => {
      const n = clampBuyCount(Number(count.value), row.max);
      this.status = this.callbacks.onBuy(row.id, n);
      this.counts.set(row.id, 1);
      this.refresh();
    });
    item.append(itemIcon(row.id, 'item-icon shop-row-icon'), name, count, most, buy);
    return item;
  }

  private buildSell(deps: ShopDeps): HTMLElement {
    const inventory = deps.inventory;
    const section = el('section', 'inv-section inv-slots-section');
    const head = el('div', 'inv-section-head');
    head.append(
      el('h3', 'inv-subtitle', 'Sat'),
      el('span', 'inv-section-meta', `${slotUsageText(inventory)} slot`),
    );
    section.append(head, loadMeter(inventory));
    const grid = el('div', 'inv-slots');
    inventory.slots.forEach((stack, index) => {
      if (index >= inventory.activeSlots) return;
      const slot = slotButton(stack);
      slot.disabled = stack === null;
      slot.dataset.selected = String(index === this.selected);
      slot.addEventListener('click', () => {
        this.selected = index;
        this.refresh();
      });
      grid.append(slot);
    });
    section.append(grid);

    const stack = this.selected === null ? null : (inventory.slots[this.selected] ?? null);
    const detail = el('div', 'inv-detail');
    detail.dataset.empty = String(stack === null);
    if (stack === null || this.selected === null) {
      detail.append(el('div', 'inv-hint', 'Satmak için bir eşyaya tıkla.'));
    } else {
      const slot = this.selected;
      const offer = sellOffer(this.vendor!.kind, stack);
      const head2 = el('div', 'inv-detail-head');
      const meta =
        offer.unit === 0
          ? 'Bu satıcı bunu almaz'
          : `Tanesi ${formatMoney(offer.unit)}${offer.specialty ? ' · iyi fiyat (uzmanlık alanı)' : ''}`;
      head2.append(
        itemIcon(stack.id, 'item-icon inv-detail-icon'),
        el('div', 'inv-detail-name', `${stack.count} × ${ITEMS[stack.id].name}`),
        el('div', 'inv-detail-meta', meta),
      );
      const actions = el('div', 'inv-detail-actions');
      const one = el('button', '', `1 sat (+${formatMoney(offer.unit)})`);
      one.type = 'button';
      one.disabled = offer.unit === 0;
      one.addEventListener('click', () => {
        this.status = this.callbacks.onSell(slot, 1);
        this.refresh();
      });
      const all = el('button', 'secondary', `Hepsini sat (+${formatMoney(offer.total)})`);
      all.type = 'button';
      all.disabled = offer.unit === 0 || stack.count < 2;
      all.addEventListener('click', () => {
        this.status = this.callbacks.onSell(slot, stack.count);
        this.refresh();
      });
      actions.append(one, all);
      detail.append(head2, actions);
    }
    section.append(detail);
    return section;
  }
}
