import './ui.css';
import { INPUT } from '../config';
import { canEat } from '../items/consume';
import { NO_STATIONS, type CraftContext } from '../items/craft';
import { isHotbarItem, type Hotbar } from '../items/hotbar';
import type { Inventory } from '../items/Inventory';
import { ITEMS, type ItemId } from '../items/itemDefs';
import type { RecipeId } from '../items/recipes';
import { keyLabel } from '../placement/promptText';
import { canDrinkContainer } from '../items/waterContainer';
import type { VitalsState } from '../survival/vitals';
import { capacityText, recipeRows, slotView, type RecipeRow } from './inventoryView';

export interface InventoryPanelCallbacks {
  /** Seçili slottaki yiyeceği ye. */
  onEat(slot: number): void;
  onCraft(recipe: RecipeId): void;
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
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Envanter ve üretim paneli (HTML overlay): slot ızgarası (tıkla-seç, tıkla-taşı), seçili yiyecek için
 * "Ye" ve tarif listesi ("Üret"). Mantık `inventoryView.ts`'te ve `Inventory`/`craft`'ta; bu sınıf yalnızca
 * çizer ve kullanıcı eylemlerini geri çağrılara iletir. Oyun panel açıkken duraklatılır (Game).
 */
export class InventoryPanel {
  private readonly root = el('div', 'inv-panel');
  private readonly panel = el('div', 'inv-panel-body');
  private selected: number | null = null;
  /** "Hepsini At" ilk tıklandı, onay bekliyor (yanlışlıkla bir yığın kaybolmasın). */
  private confirmDropAll = false;
  private open = false;

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
    header.append(
      el('h2', 'inv-title', 'Envanter ve Üretim'),
      el('div', 'inv-capacity', capacityText(this.inventory)),
      el(
        'div',
        'inv-vitals',
        `Sağlık ${Math.round(vitals.health)} · Tokluk ${Math.round(vitals.satiety)} · Su ${Math.round(vitals.hydration)} · Enerji ${Math.round(vitals.energy)}`,
      ),
    );
    const close = el('button', 'inv-close', 'Kapat (I)');
    close.type = 'button';
    close.addEventListener('click', () => this.callbacks.onClose());
    header.append(close);

    const body = el('div', 'inv-columns');
    body.append(
      this.buildSlots(vitals),
      this.buildRecipes(this.callbacks.getStations?.() ?? NO_STATIONS),
    );
    this.panel.replaceChildren(header, body);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  private buildSlots(vitals: Readonly<VitalsState>): HTMLElement {
    const section = el('section', 'inv-slots-section');
    const grid = el('div', 'inv-slots');
    this.inventory.slots.forEach((stack, index) => {
      const view = slotView(stack);
      const slot = el('button', 'inv-slot');
      slot.type = 'button';
      slot.title = view.title;
      slot.dataset.empty = String(view.empty);
      slot.dataset.selected = String(this.selected === index);
      slot.append(el('span', 'inv-slot-name', view.name), el('span', 'inv-slot-count', view.count));
      const bound = view.id === null ? null : (this.callbacks.hotbar?.slotOf(view.id) ?? null);
      if (bound !== null) {
        slot.append(el('span', 'inv-slot-key', keyLabel(INPUT.bindings.hotbar[bound] ?? '')));
      }
      slot.addEventListener('click', () => this.onSlotClick(index));
      grid.append(slot);
    });
    section.append(grid);

    const actions = el('div', 'inv-actions');
    const stack = this.selected === null ? null : (this.inventory.slots[this.selected] ?? null);
    if (stack === null) {
      actions.append(el('span', 'inv-hint', 'Bir eşyaya tıkla; başka bir slota tıklayarak taşı.'));
    } else {
      const view = slotView(stack);
      const slot = this.selected as number;
      actions.append(el('span', 'inv-selected', view.title));
      if (view.edible) {
        const eat = el('button', 'inv-eat', canEat(vitals, stack.id) ? 'Ye' : 'Tok');
        eat.type = 'button';
        eat.disabled = !canEat(vitals, stack.id);
        eat.addEventListener('click', () => this.callbacks.onEat(slot));
        actions.append(eat);
      }
      if (view.drinkable) {
        const ok = canDrinkContainer(vitals, this.inventory);
        const drink = el('button', 'inv-eat', ok ? 'İç' : 'Susuz değil');
        drink.type = 'button';
        drink.disabled = !ok;
        drink.addEventListener('click', () => this.callbacks.onDrink(slot));
        actions.append(drink);
      }
      const assign = this.buildHotbarAssign(stack.id);
      if (assign) actions.append(assign);
      const drop = el('button', 'inv-drop', 'At');
      drop.type = 'button';
      drop.title = 'Bir adet at (eşya yok olur)';
      drop.addEventListener('click', () => this.callbacks.onDrop(slot, 1));
      actions.append(drop);
      if (stack.count > 1) {
        const all = el(
          'button',
          'inv-drop',
          this.confirmDropAll ? `Onayla: ${stack.count} adet at` : 'Hepsini At',
        );
        all.type = 'button';
        all.addEventListener('click', () => {
          if (!this.confirmDropAll) {
            this.confirmDropAll = true;
            this.refresh();
            return;
          }
          this.confirmDropAll = false;
          this.callbacks.onDrop(slot, stack.count);
        });
        actions.append(all);
      }
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
    row.append(el('span', 'inv-hint', 'Kısayol:'));
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
    const section = el('section', 'inv-recipes');
    section.append(el('h3', 'inv-subtitle', 'Üretim'));
    const near = [...context.stations].map((station) => ITEMS[station].name);
    section.append(
      el(
        'div',
        'inv-stations',
        near.length > 0
          ? `Yakında: ${near.join(', ')}`
          : 'Bazı tarifler Çalışma Tezgâhı yanında üretilir',
      ),
    );
    for (const row of recipeRows(this.inventory, context)) section.append(this.buildRecipe(row));
    return section;
  }

  private buildRecipe(row: RecipeRow): HTMLElement {
    const card = el('div', 'inv-recipe');
    card.dataset.craftable = String(row.craftable);
    const head = el('div', 'inv-recipe-head');
    head.append(el('span', 'inv-recipe-name', row.name));
    const craft = el('button', 'inv-craft', 'Üret');
    craft.type = 'button';
    craft.disabled = !row.craftable;
    craft.addEventListener('click', () => this.callbacks.onCraft(row.id));
    head.append(craft);

    const inputs = el('div', 'inv-recipe-inputs');
    for (const input of row.inputs) {
      const chip = el('span', 'inv-chip', `${input.name} ${input.have}/${input.need}`);
      chip.dataset.ok = String(input.ok);
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
    card.append(head, inputs);
    if (row.reason) card.append(el('div', 'inv-reason', row.reason));
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
