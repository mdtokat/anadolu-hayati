import { isBackpack } from './backpack';
import { HOTBAR } from '../config';
import { ITEMS, isItemId, type ItemId } from './itemDefs';

/** Kayıt biçimi: slotlara bağlı eşya kimlikleri ve seçili slot (yoksa null). */
export interface HotbarSave {
  slots: Array<ItemId | null>;
  selected: number | null;
}

/** Kısayola bağlanabilen eşya: alet/silah/giysi, yerleştirilebilir yapı ya da yiyecek. Malzeme bağlanamaz. */
export function isHotbarItem(id: ItemId): boolean {
  return ITEMS[id].category !== 'material';
}

/**
 * Kısayol tuşuna basınca ne olur: `hold` elde tutulur (silah, alet, meşale, giysi), `place` elde tutulur ve
 * yerleştirme hayaleti açılır (yapı), `consume` tüketilir ve seçim değişmez (yiyecek, dolu su kabı), `none`
 * doğrudan kullanılamaz (boş su kabı: su kenarında `E` ile dolar).
 */
export type HotbarUse = 'hold' | 'place' | 'consume' | 'none';

export function hotbarUse(id: ItemId): HotbarUse {
  const { category } = ITEMS[id];
  if (category === 'placeable') return 'place';
  if ((category === 'food' && ITEMS[id].edible) || id === 'water_container_full') return 'consume';
  if (category === 'food') return 'none'; // çiğ erzak (bulgur, tarhana…): pişirilir
  if (id === 'water_container_empty') return 'none';
  if (isBackpack(id)) return 'none'; // sırtta taşınır, ele alınmaz
  return category === 'tool' ? 'hold' : 'none';
}

/** Kısayolda "elde tutulan" eşya mı (seçilince elde kalır: alet/silah ya da yerleştirilecek yapı)? */
export function isHoldable(id: ItemId): boolean {
  const use = hotbarUse(id);
  return use === 'hold' || use === 'place';
}

/**
 * Hızlı erişim (kısayol) çubuğu (saf mantık, Faz 9). Slotlar envanterdeki eşyalara **bağlantıdır** (eşyayı ayrıca
 * saklamaz): adet envanterden okunur, eşya bitince bağlantı kalır ve slot sönük görünür. Bir eşya en çok bir
 * slota bağlıdır. Seçili slot elde tutulan eşyadır (silah, meşale, yerleştirilecek yapı).
 */
export class Hotbar {
  readonly slotCount: number;
  private readonly bindings: Array<ItemId | null>;
  private selectedSlot: number | null = null;
  private revision = 0;

  constructor(slots: number = HOTBAR.slots) {
    if (!Number.isInteger(slots) || slots < 1) {
      throw new RangeError(`Kısayol slot sayısı pozitif tam sayı olmalı (verilen: ${slots})`);
    }
    this.slotCount = slots;
    this.bindings = new Array<ItemId | null>(slots).fill(null);
  }

  get slots(): ReadonlyArray<ItemId | null> {
    return this.bindings;
  }

  /** Seçili slot (0'dan; yoksa null). */
  get selected(): number | null {
    return this.selectedSlot;
  }

  /** Seçili slota bağlı eşya (elde tutulan); seçim yoksa ya da slot boşsa null. */
  get selectedItem(): ItemId | null {
    return this.selectedSlot === null ? null : (this.bindings[this.selectedSlot] ?? null);
  }

  /** Her değişimde artar (arayüzün "kirli" denetimi için). */
  get version(): number {
    return this.revision;
  }

  /** Eşyanın bağlı olduğu slot; yoksa null. */
  slotOf(id: ItemId): number | null {
    const index = this.bindings.indexOf(id);
    return index < 0 ? null : index;
  }

  /**
   * `slot`'a eşya bağlar (`null` boşaltır). Eşya başka slottaysa oradan kalkar (iki slot takas edilmez: eski
   * slot boşalır). Kısayola konamayan eşyada (malzeme) false.
   */
  assign(slot: number, id: ItemId | null): boolean {
    this.assertSlot(slot);
    if (id !== null && !isHotbarItem(id)) return false;
    if (this.bindings[slot] === id) return true;
    if (id !== null) {
      const previous = this.slotOf(id);
      if (previous !== null) this.bindings[previous] = null;
    }
    this.bindings[slot] = id;
    this.bump();
    return true;
  }

  /**
   * Yeni edinilen eşyayı (üretim) bağlı değilse ilk boş slota bağlar; bağladığı slotu döndürür (bağlamadıysa
   * null). Yalnızca elde tutulan eşyalar (alet, yapı) kendiliğinden bağlanır; yiyecek elle bağlanır.
   */
  autoAssign(id: ItemId): number | null {
    if (!isHoldable(id) || this.slotOf(id) !== null) return null;
    const empty = this.bindings.indexOf(null);
    if (empty < 0) return null;
    this.bindings[empty] = id;
    this.bump();
    return empty;
  }

  /** Seçimi ayarlar (`null`: el boş). */
  select(slot: number | null): void {
    if (slot !== null) this.assertSlot(slot);
    if (this.selectedSlot === slot) return;
    this.selectedSlot = slot;
    this.bump();
  }

  /**
   * Fare tekerleği: seçimi `step` kadar kaydırır (başa/sona sarar). Seçim yoksa ileri 1. slottan, geri son
   * slottan başlar. Yeni seçimi döndürür.
   */
  cycle(step: 1 | -1): number {
    const from = this.selectedSlot ?? (step > 0 ? -1 : this.slotCount);
    const next = (((from + step) % this.slotCount) + this.slotCount) % this.slotCount;
    this.select(next);
    return next;
  }

  toSave(): HotbarSave {
    return { slots: [...this.bindings], selected: this.selectedSlot };
  }

  /** Kayıttan yerinde yükler: önce doğrular (bozuksa `Error`, değişiklik yok), sonra yazar. */
  loadSave(data: unknown): void {
    const save = Hotbar.parse(data, this.slotCount);
    this.bindings.splice(0, this.bindings.length, ...save.slots);
    this.selectedSlot = save.selected;
    this.bump();
  }

  /** Kayıt doğrulayıcı (slot sayısı, kimlikler, yinelenme, seçim). */
  static parse(data: unknown, slotCount: number = HOTBAR.slots): HotbarSave {
    if (typeof data !== 'object' || data === null) throw new Error('Kısayol kaydı nesne değil');
    const raw = data as { slots?: unknown; selected?: unknown };
    if (!Array.isArray(raw.slots) || raw.slots.length !== slotCount) {
      throw new Error(`Kısayol kaydında ${slotCount} slot olmalı`);
    }
    const slots = raw.slots.map((value: unknown, index): ItemId | null => {
      if (value === null) return null;
      if (!isItemId(value) || !isHotbarItem(value)) {
        throw new Error(`Kısayol ${index}: geçersiz eşya (${String(value)})`);
      }
      return value;
    });
    const bound = slots.filter((id) => id !== null);
    if (new Set(bound).size !== bound.length) throw new Error('Kısayolda yinelenen eşya');
    const selected = raw.selected;
    if (
      selected !== null &&
      (typeof selected !== 'number' ||
        !Number.isInteger(selected) ||
        selected < 0 ||
        selected >= slotCount)
    ) {
      throw new Error(`Kısayol seçimi geçersiz: ${String(selected)}`);
    }
    return { slots, selected: selected as number | null };
  }

  private assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.slotCount) {
      throw new RangeError(`Kısayol slotu sınır dışı: ${slot} (0–${this.slotCount - 1})`);
    }
  }

  private bump(): void {
    this.revision += 1;
  }
}
