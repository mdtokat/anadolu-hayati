import './ui.css';
import { INPUT } from '../config';
import { canEat, isDrink } from '../items/consume';
import { NO_STATIONS, type CraftContext } from '../items/craft';
import { isHotbarItem, type Hotbar } from '../items/hotbar';
import type { Inventory } from '../items/Inventory';
import { ITEMS, type ItemId } from '../items/itemDefs';
import type { RecipeId } from '../items/recipes';
import { keyLabel } from '../placement/promptText';
import { canDrinkContainer } from '../items/waterContainer';
import type { VitalsState } from '../survival/vitals';
import { CATEGORY_ACCENT, itemIcon, uiIcon, type UiIcon } from './icons';
import {
  CATEGORY_LABELS,
  clampCraftCount,
  filterRecipeRows,
  maxCraftable,
  RECIPE_FILTER_LABELS,
  RECIPE_FILTERS,
  recipeFilterCounts,
  recipeRows,
  slotUsageText,
  slotView,
  type RecipeFilter,
  type RecipeRow,
} from './inventoryView';
import { RECIPES } from '../items/recipes';
import { closeButton, el, loadMeter, moneyBadge, slotButton } from './widgets';

export interface InventoryPanelCallbacks {
  /** Seçili slottaki yiyeceği ye. */
  onEat(slot: number): void;
  /** Tarifi `count` kez art arda üret (yapılamayınca durur). */
  onCraft(recipe: RecipeId, count: number): void;
  /** Seçili slottaki dolu su kabından iç. */
  onDrink(slot: number): void;
  /** Seçili slottan `count` adet at (eşya yok olur; envanteri boşaltmak için). */
  onDrop(slot: number, count: number): void;
  /** Panel kapatılmak isteniyor (Kapat düğmesi, Esc, I/Tab, dış alana tıklama). */
  onClose(): void;
  /** Güncel göstergeler (yemek düğmesinin "tok" denetimi ve üst satır için). */
  getVitals(): Readonly<VitalsState>;
  /** Oyuncunun yanındaki üretim istasyonları (Faz 9; tezgâh tarifleri); verilmezse yok. */
  getStations?(): CraftContext;
  /** Kısayol çubuğu (Faz 9): seçili eşya bir slota bağlanabilir. */
  hotbar?: Hotbar;
  /** `slot`'a `item` bağla (`null`: boşalt). */
  onAssignHotbar?(slot: number, item: ItemId | null): void;
  /** Seçili silahın susturucu durumu (susturucu takılamayan eşyada null). */
  suppressorState?(item: ItemId): SuppressorState | null;
  /** Susturucuyu tak/çıkar. */
  onToggleSuppressor?(item: ItemId): void;
  /** Cüzdandaki para (₺); verilmezse gösterilmez. */
  getMoney?(): number;
}

/** Yeniden çizimde konumu korunan kaydırma bölgeleri. */
const SCROLLERS = ['.inv-recipe-list', '.bag-slots-scroll'] as const;

/** Susturucu düğmesi: takılı, takılabilir (envanterde var) ya da yok. */
export type SuppressorState = 'attached' | 'available' | 'missing';

/**
 * Envanter ve üretim paneli (HTML overlay): slot ızgarası (tıkla-seç, tıkla-taşı), seçili yiyecek için
 * "Ye" ve tarif listesi ("Üret"). Mantık `inventoryView.ts`'te ve `Inventory`/`craft`'ta; bu sınıf yalnızca
 * çizer ve kullanıcı eylemlerini geri çağrılara iletir. Oyun panel açıkken duraklatılır (Game).
 */
export class InventoryPanel {
  private readonly root = el('div', 'inv-panel');
  private readonly panel = el('div', 'inv-panel-body inv-bag');
  private selected: number | null = null;
  /** "Hepsini At" ilk tıklandı, onay bekliyor (yanlışlıkla bir yığın kaybolmasın). */
  private confirmDropAll = false;
  private open = false;
  /** Üretim listesi süzgeci (panel kapanıp açılınca korunur). */
  private filter: RecipeFilter = 'all';
  /** Tarif başına girilen üretim adedi (yeniden çizimde korunur). */
  private readonly counts = new Map<RecipeId, number>();
  /** Dar pencerede görünen bölge (geniş pencerede ikisi de yan yana görünür). */
  private view: 'items' | 'craft' = 'items';
  /** Üretim listesinde seçili tarif (ayrıntı çubuğunda gösterilir). */
  private selectedRecipe: RecipeId | null = null;
  /** Üretim arama kutusundaki metin (panel kapanıp açılınca korunur). */
  private search = '';

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const closers: readonly string[] = [...INPUT.bindings.toggleInventory, 'Escape'];
    if (!closers.includes(event.code) || event.repeat) return;
    event.preventDefault(); // Tab odağı kaydırmasın
    this.callbacks.onClose();
  };

  constructor(
    parent: HTMLElement,
    private readonly inventory: Inventory,
    private readonly callbacks: InventoryPanelCallbacks,
  ) {
    this.root.hidden = true;
    // Panele tıklamak kapatmaz; dış alana (arka plan) tıklamak kapatır.
    this.panel.addEventListener('click', (event) => event.stopPropagation());
    this.root.addEventListener('click', () => this.callbacks.onClose());
    this.root.append(this.panel);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.open;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.selected = null;
    this.confirmDropAll = false;
    this.root.hidden = false;
    document.addEventListener('keydown', this.onKeyDown);
    this.refresh();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.selected = null;
    this.root.hidden = true;
    document.removeEventListener('keydown', this.onKeyDown);
  }

  /** İçeriği envanterin ve göstergelerin güncel haliyle yeniden çizer. */
  refresh(): void {
    if (!this.open) return;
    const vitals = this.callbacks.getVitals();
    const header = el('div', 'inv-header');
    const titleBox = el('div', 'inv-title-box');
    titleBox.append(
      el('h2', 'inv-title', 'Envanter'),
      el('div', 'inv-title-sub', 'Eşyalar, kısayollar ve üretim'),
    );
    const close = closeButton('Kapat', 'I', () => this.callbacks.onClose());
    header.append(titleBox, close);

    const stats = el('div', 'inv-stats');
    stats.append(loadMeter(this.inventory), this.buildVitals(vitals));
    const money = this.callbacks.getMoney?.();
    if (money !== undefined) stats.append(moneyBadge(money));

    const body = el('div', 'bag-body');
    body.dataset.view = this.view;
    body.append(
      this.buildSlots(vitals),
      this.buildRecipes(this.callbacks.getStations?.() ?? NO_STATIONS),
    );
    // Yeniden çizim (her üretimden sonra) kaydırma konumlarını başa atmasın: konumları koru.
    const scrolls = SCROLLERS.map((name) => this.panel.querySelector(name)?.scrollTop ?? 0);
    this.panel.replaceChildren(header, stats, this.buildTabs(), body);
    SCROLLERS.forEach((name, i) => {
      const node = this.panel.querySelector(name);
      if (node) node.scrollTop = scrolls[i] ?? 0;
    });
  }

  /** Dar pencerede Eşyalar/Üretim arasında geçiş sekmeleri (geniş pencerede CSS gizler). */
  private buildTabs(): HTMLElement {
    const tabs = el('div', 'bag-tabs');
    tabs.setAttribute('role', 'tablist');
    const items: Array<['items' | 'craft', string]> = [
      ['items', 'Eşyalar'],
      ['craft', 'Üretim'],
    ];
    for (const [key, label] of items) {
      const tab = el('button', 'bag-tab', label);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.dataset.active = String(this.view === key);
      tab.addEventListener('click', () => {
        this.view = key;
        this.refresh();
      });
      tabs.append(tab);
    }
    return tabs;
  }

  /** Üst satırdaki küçük göstergeler (sağlık, tokluk, su, enerji). */
  private buildVitals(vitals: Readonly<VitalsState>): HTMLElement {
    const row = el('div', 'inv-vitals');
    const items: Array<[UiIcon, string, number]> = [
      ['health', 'Sağlık', vitals.health],
      ['satiety', 'Tokluk', vitals.satiety],
      ['hydration', 'Su', vitals.hydration],
      ['energy', 'Enerji', vitals.energy],
    ];
    for (const [key, label, value] of items) {
      const chip = el('span', 'inv-vital');
      chip.dataset.gauge = key;
      chip.title = label;
      chip.append(uiIcon(key), el('span', '', String(Math.round(value))));
      row.append(chip);
    }
    return row;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  private buildSlots(vitals: Readonly<VitalsState>): HTMLElement {
    const section = el('section', 'bag-pane bag-items');
    section.append(sectionTitle('Eşyalar', `${slotUsageText(this.inventory)} slot`));
    const scroller = el('div', 'bag-scroll bag-slots-scroll');
    const grid = el('div', 'inv-slots');
    this.inventory.slots.forEach((stack, index) => {
      // Çantasız kilitli slotlar gösterilmez (sırt çantası ekler).
      if (index >= this.inventory.activeSlots) return;
      const slot = slotButton(stack);
      slot.dataset.selected = String(this.selected === index);
      const id = stack?.id ?? null;
      const bound = id === null ? null : (this.callbacks.hotbar?.slotOf(id) ?? null);
      if (bound !== null) {
        slot.append(el('span', 'inv-slot-key', keyLabel(INPUT.bindings.hotbar[bound] ?? '')));
      }
      slot.addEventListener('click', () => this.onSlotClick(index));
      grid.append(slot);
    });
    scroller.append(grid);
    section.append(scroller);

    const actions = el('div', 'inv-detail');
    const stack = this.selected === null ? null : (this.inventory.slots[this.selected] ?? null);
    if (stack === null) {
      actions.dataset.empty = 'true';
      actions.append(el('span', 'inv-hint', 'Bir eşyaya tıkla; başka bir slota tıklayarak taşı.'));
    } else {
      const view = slotView(stack);
      const slot = this.selected as number;
      if (view.category) actions.style.setProperty('--accent', CATEGORY_ACCENT[view.category]);
      const head = el('div', 'inv-detail-head');
      const text = el('div', 'inv-detail-text');
      text.append(
        el('div', 'inv-detail-name', stack.count > 1 ? `${view.name} ×${stack.count}` : view.name),
        el(
          'div',
          'inv-detail-meta',
          [view.category ? CATEGORY_LABELS[view.category] : '', view.weight, view.effect]
            .filter((part) => part !== '')
            .join(' · '),
        ),
      );
      head.append(itemIcon(stack.id, 'item-icon inv-detail-icon'), text);
      actions.append(head);

      const buttons = el('div', 'inv-detail-actions');
      if (view.edible) {
        const drink = isDrink(stack.id);
        const label = canEat(vitals, stack.id)
          ? drink
            ? 'İç'
            : 'Ye'
          : drink
            ? 'Gerek yok'
            : 'Tok';
        const eat = el('button', 'inv-eat', label);
        eat.type = 'button';
        eat.disabled = !canEat(vitals, stack.id);
        eat.addEventListener('click', () => this.callbacks.onEat(slot));
        buttons.append(eat);
      }
      if (view.drinkable) {
        const ok = canDrinkContainer(vitals, this.inventory);
        const drink = el('button', 'inv-eat', ok ? 'İç' : 'Susuz değil');
        drink.type = 'button';
        drink.disabled = !ok;
        drink.addEventListener('click', () => this.callbacks.onDrink(slot));
        buttons.append(drink);
      }
      const suppressor = this.callbacks.suppressorState?.(stack.id) ?? null;
      if (suppressor !== null) {
        const toggle = el(
          'button',
          'inv-eat',
          suppressor === 'attached' ? 'Susturucuyu çıkar' : 'Susturucu tak',
        );
        toggle.type = 'button';
        toggle.disabled = suppressor === 'missing';
        toggle.title =
          suppressor === 'missing'
            ? 'Envanterde susturucu yok (demirhanede üretilir)'
            : 'Atış sesi ve gürültüsü azalır';
        toggle.addEventListener('click', () => this.callbacks.onToggleSuppressor?.(stack.id));
        buttons.append(toggle);
      }
      const drop = el('button', 'inv-drop', 'At');
      drop.type = 'button';
      drop.title = 'Bir adet at (eşya yok olur)';
      drop.addEventListener('click', () => this.callbacks.onDrop(slot, 1));
      buttons.append(drop);
      if (stack.count > 1) {
        const all = el(
          'button',
          'inv-drop',
          this.confirmDropAll ? `Onayla: ${stack.count} adet at` : 'Hepsini At',
        );
        all.type = 'button';
        if (this.confirmDropAll) all.dataset.confirm = 'true';
        all.addEventListener('click', () => {
          if (!this.confirmDropAll) {
            this.confirmDropAll = true;
            this.refresh();
            return;
          }
          this.confirmDropAll = false;
          this.callbacks.onDrop(slot, stack.count);
        });
        buttons.append(all);
      }
      actions.append(buttons);
      const assign = this.buildHotbarAssign(stack.id);
      if (assign) actions.append(assign);
    }
    section.append(actions);
    return section;
  }

  /** Seçili eşya için "Kısayol: 1 2 … 8" düğmeleri (bağlı slot vurgulu; tekrar tıklamak çözer). */
  private buildHotbarAssign(id: ItemId): HTMLElement | null {
    const hotbar = this.callbacks.hotbar;
    const assign = this.callbacks.onAssignHotbar;
    if (!hotbar || !assign || !isHotbarItem(id)) return null;
    const row = el('div', 'inv-hotbar-assign');
    row.append(el('span', 'inv-hotbar-label', 'Kısayol'));
    const bound = hotbar.slotOf(id);
    hotbar.slots.forEach((current, index) => {
      const label = keyLabel(INPUT.bindings.hotbar[index] ?? '');
      const button = el('button', 'inv-hotbar-key', label);
      button.type = 'button';
      button.dataset.bound = String(bound === index);
      button.title =
        bound === index
          ? `${label}. kısayoldan çıkar`
          : current
            ? `${label}. kısayola bağla (${ITEMS[current].name} yerine)`
            : `${label}. kısayola bağla`;
      button.addEventListener('click', () => {
        assign(index, bound === index ? null : id);
        this.refresh();
      });
      row.append(button);
    });
    return row;
  }

  private buildRecipes(context: CraftContext): HTMLElement {
    const section = el('section', 'bag-pane bag-craft');
    const all = recipeRows(this.inventory, context);
    const byFilter = filterRecipeRows(all, this.filter);
    const query = this.search.trim().toLocaleLowerCase('tr');
    const rows =
      query === ''
        ? byFilter
        : byFilter.filter((row) => row.name.toLocaleLowerCase('tr').includes(query));
    const ready = rows.filter((row) => row.craftable).length;
    section.append(sectionTitle('Üretim', `${ready}/${rows.length} hazır`));

    const tools = el('div', 'craft-tools');
    tools.append(this.buildSearch(), this.buildFilterTabs(all));
    section.append(tools);

    const near = [...context.stations].map((station) => ITEMS[station].name);
    const stations = el('div', 'inv-stations');
    stations.dataset.near = String(near.length > 0);
    stations.append(
      uiIcon('hammer'),
      el(
        'span',
        '',
        near.length > 0
          ? `Yakında: ${near.join(', ')}`
          : 'Bazı tarifler Çalışma Tezgâhı yanında üretilir',
      ),
    );
    section.append(stations);

    // Seçili tarif listede yoksa (süzgeç/arama değişti) ilk satıra düşer.
    if (!rows.some((row) => row.id === this.selectedRecipe)) {
      this.selectedRecipe = rows[0]?.id ?? null;
    }
    const list = el('div', 'bag-scroll inv-recipe-list');
    for (const row of rows) list.append(this.buildRecipeRow(row));
    if (rows.length === 0) list.append(el('div', 'inv-hint', 'Bu grupta tarif yok.'));
    section.append(list);

    const chosen = rows.find((row) => row.id === this.selectedRecipe) ?? null;
    section.append(chosen ? this.buildRecipeDetail(chosen, context) : el('div', 'craft-detail'));
    return section;
  }

  /** Tarif arama kutusu (yazarken liste süzülür; klavye olayları oyuna gitmez). */
  private buildSearch(): HTMLElement {
    const box = el('label', 'craft-search');
    box.append(uiIcon('hammer'));
    const input = el('input', 'craft-search-input');
    input.type = 'search';
    input.placeholder = 'Tarif ara…';
    input.value = this.search;
    input.setAttribute('aria-label', 'Tarif ara');
    input.addEventListener('keydown', (event) => event.stopPropagation());
    input.addEventListener('input', () => {
      this.search = input.value;
      const caret = input.selectionStart ?? input.value.length;
      this.refresh();
      const next = this.panel.querySelector<HTMLInputElement>('.craft-search-input');
      next?.focus();
      next?.setSelectionRange(caret, caret);
    });
    box.append(input);
    return box;
  }

  /** Süzgeç sekmeleri (Tümü, Silah, Alet, Yapı, Gıda, Malzeme; yanında tarif sayısı); tek satırda kayar. */
  private buildFilterTabs(rows: readonly RecipeRow[]): HTMLElement {
    const counts = recipeFilterCounts(rows);
    const ready = recipeFilterCounts(rows.filter((row) => row.craftable));
    const tabs = el('div', 'inv-filter-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const filter of RECIPE_FILTERS) {
      if (filter !== 'all' && counts[filter] === 0) continue;
      const tab = el('button', 'inv-filter-tab');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.dataset.active = String(this.filter === filter);
      tab.setAttribute('aria-selected', String(this.filter === filter));
      tab.title = `${RECIPE_FILTER_LABELS[filter]}: ${ready[filter]}/${counts[filter]} hazır`;
      tab.append(
        el('span', '', RECIPE_FILTER_LABELS[filter]),
        el('span', 'inv-filter-count', String(counts[filter])),
      );
      tab.addEventListener('click', () => {
        if (this.filter === filter) return;
        this.filter = filter;
        this.refresh();
        const list = this.panel.querySelector('.inv-recipe-list');
        if (list) list.scrollTop = 0; // yeni grup baştan görünür
      });
      tabs.append(tab);
    }
    return tabs;
  }

  /** Listedeki kompakt tarif satırı: simge, ad, eksik malzeme özeti ve hazır rozeti. */
  private buildRecipeRow(row: RecipeRow): HTMLElement {
    const item = el('button', 'craft-row');
    item.type = 'button';
    item.dataset.craftable = String(row.craftable);
    item.dataset.selected = String(row.id === this.selectedRecipe);
    item.style.setProperty('--accent', CATEGORY_ACCENT[ITEMS[row.outputId].category]);
    const icon = el('span', 'craft-row-icon');
    icon.append(itemIcon(row.outputId));
    const text = el('span', 'craft-row-text');
    const missing = row.inputs.filter((input) => !input.ok).map((input) => input.name);
    const note = row.craftable
      ? row.output
      : row.reason !== '' && missing.length === 0
        ? row.reason
        : missing.length > 0
          ? `Eksik: ${missing.join(', ')}`
          : row.output;
    text.append(el('span', 'craft-row-name', row.name), el('span', 'craft-row-note', note));
    const badge = el('span', 'craft-row-badge', row.craftable ? 'Hazır' : 'Eksik');
    item.append(icon, text, badge);
    item.addEventListener('click', () => {
      if (this.selectedRecipe === row.id) return;
      this.selectedRecipe = row.id;
      this.refresh();
    });
    return item;
  }

  /** Listenin altındaki sabit ayrıntı çubuğu: malzemeler, neden, adet seçici ve Üret düğmesi. */
  private buildRecipeDetail(row: RecipeRow, context: CraftContext): HTMLElement {
    const card = el('div', 'craft-detail');
    card.dataset.craftable = String(row.craftable);
    card.style.setProperty('--accent', CATEGORY_ACCENT[ITEMS[row.outputId].category]);

    const head = el('div', 'craft-detail-head');
    const output = el('div', 'inv-recipe-output');
    output.append(itemIcon(row.outputId));
    if (row.outputCount > 1) output.append(el('span', 'inv-slot-count', `×${row.outputCount}`));
    const title = el('div', 'craft-detail-title');
    title.append(el('div', 'inv-recipe-name', row.name), el('div', 'craft-detail-sub', row.output));
    head.append(output, title);

    const inputs = el('div', 'inv-recipe-inputs');
    for (const input of row.inputs) {
      const chip = el('span', 'inv-chip');
      chip.dataset.ok = String(input.ok);
      chip.title = input.name;
      chip.append(
        itemIcon(input.id, 'item-icon inv-chip-icon'),
        el('span', '', `${input.name} ${input.have}/${input.need}`),
      );
      inputs.append(chip);
    }
    if (row.tool) {
      const tool = el('span', 'inv-chip', `Alet: ${row.tool.name}`);
      tool.dataset.ok = String(row.tool.ok);
      inputs.append(tool);
    }
    if (row.station) {
      const station = el('span', 'inv-chip', `Yanında: ${row.station.name}`);
      station.dataset.ok = String(row.station.ok);
      inputs.append(station);
    }

    const max = row.craftable ? maxCraftable(this.inventory, RECIPES[row.id], context) : 0;
    const controls = el('div', 'craft-controls');
    const amount = el('input', 'inv-craft-count');
    amount.type = 'number';
    amount.min = '1';
    amount.max = String(Math.max(max, 1));
    amount.step = '1';
    amount.inputMode = 'numeric';
    amount.title = max > 0 ? `Üretim adedi (en çok ${max})` : 'Üretim adedi';
    amount.setAttribute('aria-label', `${row.name} üretim adedi`);
    amount.value = String(clampCraftCount(this.counts.get(row.id) ?? 1, max));
    amount.disabled = !row.craftable;
    const setAmount = (value: number): void => {
      const next = clampCraftCount(value, max);
      amount.value = String(next);
      this.counts.set(row.id, next);
    };
    // Klavye olayları oyuna (kısayol rakamları, I/Tab kapatma) gitmesin; Enter üretir.
    amount.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') craft.click();
    });
    amount.addEventListener('change', () => setAmount(Number(amount.value)));
    const stepper = el('div', 'craft-stepper');
    const minus = el('button', 'craft-step', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Azalt');
    minus.disabled = !row.craftable;
    minus.addEventListener('click', () => setAmount(Number(amount.value) - 1));
    const plus = el('button', 'craft-step', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Artır');
    plus.disabled = !row.craftable;
    plus.addEventListener('click', () => setAmount(Number(amount.value) + 1));
    stepper.append(minus, amount, plus);
    const maxButton = el('button', 'inv-craft-max', 'En çok');
    maxButton.type = 'button';
    maxButton.title = max > 0 ? `${max} adet` : 'Üretilemez';
    maxButton.disabled = max <= 1;
    maxButton.addEventListener('click', () => setAmount(max));

    const craft = el('button', 'inv-craft', 'Üret');
    craft.type = 'button';
    craft.disabled = !row.craftable;
    craft.addEventListener('click', () => {
      const count = clampCraftCount(Number(amount.value), max);
      this.callbacks.onCraft(row.id, count);
    });
    controls.append(stepper, maxButton, craft);

    card.append(head, inputs);
    if (row.reason) card.append(el('div', 'inv-reason', row.reason));
    card.append(controls);
    return card;
  }

  private onSlotClick(index: number): void {
    this.confirmDropAll = false;
    if (this.selected === null) {
      if (this.inventory.slots[index] !== null) this.selected = index;
    } else if (this.selected === index) {
      this.selected = null;
    } else {
      this.inventory.moveSlot(this.selected, index);
      this.selected = null;
    }
    this.refresh();
  }
}

/** Bölüm başlığı: ad ve sağda küçük açıklama ("7/20 slot"). */
function sectionTitle(title: string, meta: string): HTMLElement {
  const head = el('div', 'inv-section-head');
  head.append(el('h3', 'inv-subtitle', title), el('span', 'inv-section-meta', meta));
  return head;
}
