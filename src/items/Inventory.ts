import { INVENTORY } from '../config';
import {
  MAX_BACKPACK_SLOTS,
  NO_BACKPACK,
  backpackBonus,
  isBackpack,
  type BackpackBonus,
} from './backpack';
import { ITEMS, isItemId, type ItemId } from './itemDefs';

export interface ItemStack {
  id: ItemId;
  count: number;
}

/** Kayıt formatı (sürümlü): Faz 6 kayıt sistemine hazırlık. */
export interface InventorySave {
  version: 1;
  slots: Array<ItemStack | null>;
}

export const INVENTORY_SAVE_VERSION = 1;

export interface InventoryOptions {
  /** Çantasız slot sayısı. */
  slots?: number;
  /** Çantasız ağırlık sınırı (gram). */
  maxWeightG?: number;
  /**
   * Sırt çantası taşınabilir mi (oyuncu envanteri; `slots` verilmezse varsayılan evet)? Öyleyse dizi
   * `MAX_BACKPACK_SLOTS` kadar büyük açılır; en büyük çantanın ek slotları dışındakiler kilitlidir (boş kalır).
   */
  backpacks?: boolean;
}

function assertCount(n: number, what: string): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`${what}: adet negatif olmayan tam sayı olmalı (verilen: ${n})`);
  }
}

/**
 * Slot ve ağırlık sınırlı envanter (saf mantık; Three.js ve EventBus'a bağımlı değil).
 * Aynı eşyalar `stackMax`'a kadar mevcut slotlarda birleşir, taşan ilk boş slota açılır;
 * sıra deterministiktir (ilk uygun slot). Olayları (`item:collected` vb.) etkileşim katmanı yayınlar.
 */
export class Inventory {
  /** Dizideki slot sayısı (çantalı envanterde kilitli slotlar dahil); kullanılabilir olanlar `activeSlots`. */
  readonly slotCount: number;
  /** Çantasız slot ve ağırlık sınırı. */
  readonly baseSlots: number;
  readonly baseWeightG: number;
  readonly backpacks: boolean;

  private readonly stacks: Array<ItemStack | null>;
  private weightG = 0;
  private revision = 0;
  private bonusCache: { revision: number; bonus: BackpackBonus } | null = null;

  constructor(options: InventoryOptions = {}) {
    const slots = options.slots ?? INVENTORY.slots;
    const maxWeightG = options.maxWeightG ?? INVENTORY.maxWeightG;
    if (!Number.isInteger(slots) || slots < 1) {
      throw new RangeError(`Envanter slot sayısı pozitif tam sayı olmalı (verilen: ${slots})`);
    }
    if (!Number.isInteger(maxWeightG) || maxWeightG < 0) {
      throw new RangeError(`Envanter ağırlık sınırı tam sayı (g) olmalı (verilen: ${maxWeightG})`);
    }
    // Varsayılan (oyuncu boyutlu) envanter çanta taşır; özel boyutlu envanterler (sandık) taşımaz.
    this.backpacks = options.backpacks ?? options.slots === undefined;
    this.baseSlots = slots;
    this.baseWeightG = maxWeightG;
    this.slotCount = slots + (this.backpacks ? MAX_BACKPACK_SLOTS : 0);
    this.stacks = new Array<ItemStack | null>(this.slotCount).fill(null);
  }

  /** Aynı ayarlarla bağımsız kopya (yer denemeleri için: "sığar mı?"). */
  clone(): Inventory {
    const copy = new Inventory({
      slots: this.baseSlots,
      maxWeightG: this.baseWeightG,
      backpacks: this.backpacks,
    });
    this.stacks.forEach((stack, i) => {
      copy.stacks[i] = stack ? { ...stack } : null;
    });
    copy.weightG = this.weightG;
    return copy;
  }

  /** Taşınan en büyük çantanın etkisi (çanta taşınamıyorsa yok). */
  get backpackBonus(): BackpackBonus {
    if (!this.backpacks) return NO_BACKPACK;
    if (this.bonusCache?.revision !== this.revision) {
      this.bonusCache = { revision: this.revision, bonus: backpackBonus((id) => this.count(id)) };
    }
    return this.bonusCache.bonus;
  }

  /** Kullanılabilir slot sayısı (çantasız + çanta). Bunun ötesindeki slotlar kilitlidir (her zaman boş). */
  get activeSlots(): number {
    return this.baseSlots + this.backpackBonus.slots;
  }

  /** Ağırlık sınırı (gram; çantasız + çanta). */
  get maxWeightG(): number {
    return this.baseWeightG + this.backpackBonus.weightG;
  }

  /** Slotların salt okunur görünümü (yığınlar kopyalanmaz; değiştirmeyin). */
  get slots(): ReadonlyArray<ItemStack | null> {
    return this.stacks;
  }

  get totalWeightG(): number {
    return this.weightG;
  }

  /** Her gerçek değişimde artar (arayüzün "kirli" denetimi için). */
  get version(): number {
    return this.revision;
  }

  count(id: ItemId): number {
    let total = 0;
    for (const stack of this.stacks) if (stack?.id === id) total += stack.count;
    return total;
  }

  has(id: ItemId, n = 1): boolean {
    assertCount(n, 'has');
    return this.count(id) >= n;
  }

  /** Bu eşyadan kaç adet daha sığar (slot ve ağırlık sınırlarının küçüğü). */
  capacityFor(id: ItemId): number {
    const def = ITEMS[id];
    let bySlots = 0;
    const active = this.activeSlots;
    for (let i = 0; i < active; i++) {
      const stack = this.stacks[i] ?? null;
      if (stack === null) bySlots += def.stackMax;
      else if (stack.id === id) bySlots += def.stackMax - stack.count;
    }
    const byWeight = Math.floor((this.maxWeightG - this.weightG) / def.weightG);
    return Math.max(0, Math.min(bySlots, byWeight));
  }

  /** Ekler; sığmayan (artan) miktarı döndürür. Kısmi ekleme yapar. */
  add(id: ItemId, n: number): number {
    assertCount(n, 'add');
    const toAdd = Math.min(n, this.capacityFor(id));
    if (toAdd === 0) return n;

    const { stackMax, weightG } = ITEMS[id];
    let left = toAdd;
    const active = this.activeSlots;
    for (let i = 0; i < active; i++) {
      const stack = this.stacks[i] ?? null;
      if (left === 0) break;
      if (stack?.id !== id || stack.count >= stackMax) continue;
      const moved = Math.min(left, stackMax - stack.count);
      stack.count += moved;
      left -= moved;
    }
    for (let i = 0; i < active && left > 0; i++) {
      if (this.stacks[i] !== null) continue;
      const moved = Math.min(left, stackMax);
      this.stacks[i] = { id, count: moved };
      left -= moved;
    }
    this.weightG += toAdd * weightG;
    this.bump();
    return n - toAdd;
  }

  /** Çıkarır; yeterli yoksa hiçbir şey değiştirmez (atomik). Son slotlardan başlar. */
  remove(id: ItemId, n: number): boolean {
    assertCount(n, 'remove');
    if (this.count(id) < n) return false;
    if (n === 0) return true;
    if (!this.backpackRemovable(id, n, null)) return false;

    let left = n;
    for (let i = this.stacks.length - 1; i >= 0 && left > 0; i--) {
      const stack = this.stacks[i];
      if (stack?.id !== id) continue;
      const taken = Math.min(left, stack.count);
      stack.count -= taken;
      left -= taken;
      if (stack.count === 0) this.stacks[i] = null;
    }
    this.weightG -= n * ITEMS[id].weightG;
    this.bump();
    return true;
  }

  /** Bir slottan çıkarır ve çıkarılan yığını döndürür; slot boşsa veya yetmiyorsa `null` (değişiklik yok). */
  removeFromSlot(index: number, n: number): ItemStack | null {
    this.assertSlot(index);
    assertCount(n, 'removeFromSlot');
    const stack = this.stacks[index];
    if (!stack || n === 0 || stack.count < n) return null;
    if (!this.backpackRemovable(stack.id, n, index)) return null;

    stack.count -= n;
    if (stack.count === 0) this.stacks[index] = null;
    this.weightG -= n * ITEMS[stack.id].weightG;
    this.bump();
    return { id: stack.id, count: n };
  }

  /**
   * Bir `from` çıkarılıp yerine bir `to` eklenebilir mi (envanteri değiştirmeden; `exchange` ile aynı sonuç)?
   * Ağırlık farkı ve slot denetlenir: `remove` son slottan başladığı için oradaki yığın tek adetse o slot boşalır.
   */
  canExchange(from: ItemId, to: ItemId): boolean {
    if (!this.has(from)) return false;
    if (!this.backpackRemovable(from, 1, null)) return false;
    const toDef = ITEMS[to];
    if (this.weightG - ITEMS[from].weightG + toDef.weightG > this.maxWeightG) return false;
    let lastFrom = -1;
    for (let i = this.stacks.length - 1; i >= 0 && lastFrom < 0; i--) {
      if (this.stacks[i]?.id === from) lastFrom = i;
    }
    return this.stacks.some(
      (stack, i) =>
        (stack === null && i < this.activeSlots) ||
        (stack !== null && i === lastFrom && stack.count === 1) ||
        (stack !== null && stack.id === to && stack.count < toDef.stackMax),
    );
  }

  /** Bir `from`'u bir `to`'ya dönüştürür (pişirme, su kabı); yapılamıyorsa hiçbir şey değiştirmez (atomik). */
  exchange(from: ItemId, to: ItemId): boolean {
    if (!this.canExchange(from, to)) return false;
    this.remove(from, 1);
    this.add(to, 1);
    return true;
  }

  /** Aynı eşyaysa `to` dolana kadar birleştirir (artan `from`'da kalır), değilse takas eder. */
  moveSlot(from: number, to: number): void {
    this.assertSlot(from);
    this.assertSlot(to);
    const source = this.stacks[from];
    if (from === to || !source) return;
    // Kilitli (çantasız) slotlara eşya konmaz.
    if (from >= this.activeSlots || to >= this.activeSlots) return;

    const target = this.stacks[to] ?? null;
    if (target === null) {
      this.stacks[to] = source;
      this.stacks[from] = null;
    } else if (target.id === source.id) {
      const moved = Math.min(source.count, ITEMS[source.id].stackMax - target.count);
      if (moved === 0) return;
      target.count += moved;
      source.count -= moved;
      if (source.count === 0) this.stacks[from] = null;
    } else {
      this.stacks[to] = source;
      this.stacks[from] = target;
    }
    this.bump();
  }

  /** Maliyetin tamamı karşılanır mı? (Aynı eşya birden çok satırda olabilir.) */
  canAfford(costs: ReadonlyArray<ItemStack>): boolean {
    for (const [id, n] of Inventory.totals(costs)) if (!this.has(id, n)) return false;
    return true;
  }

  /** Maliyetin tamamını çıkarır; karşılanmıyorsa hiçbir şey değiştirmez (atomik). */
  take(costs: ReadonlyArray<ItemStack>): boolean {
    if (!this.canAfford(costs)) return false;
    for (const [id, n] of Inventory.totals(costs)) {
      if (!this.backpackRemovable(id, n, null)) return false;
    }
    for (const [id, n] of Inventory.totals(costs)) this.remove(id, n);
    return true;
  }

  toJSON(): InventorySave {
    return {
      version: INVENTORY_SAVE_VERSION,
      slots: this.stacks.map((stack) => (stack ? { id: stack.id, count: stack.count } : null)),
    };
  }

  /** Kayıttan kurar; bozuk veride (sürüm, kimlik, adet, slot sayısı, ağırlık) `Error` fırlatır. */
  static fromJSON(data: unknown, options: InventoryOptions = {}): Inventory {
    if (typeof data !== 'object' || data === null) throw new Error('Envanter kaydı nesne değil');
    const save = data as { version?: unknown; slots?: unknown };
    if (save.version !== INVENTORY_SAVE_VERSION) {
      throw new Error(`Desteklenmeyen envanter kayıt sürümü: ${String(save.version)}`);
    }
    if (!Array.isArray(save.slots)) throw new Error('Envanter kaydında slots dizisi yok');

    const inventory = new Inventory({ ...options, slots: options.slots ?? save.slots.length });
    // Çantalı envanter eski (kısa) kayıtları da okur: eksik slotlar boştur. Çantasız envanter çantalı (uzun) kaydı,
    // fazla slotlar boşsa okur. Bunların dışındaki uzunluk farkı hatadır.
    const shortOk = inventory.backpacks && save.slots.length >= inventory.baseSlots;
    const longOk = save.slots.slice(inventory.slotCount).every((slot: unknown) => slot === null);
    if (
      (save.slots.length > inventory.slotCount && !longOk) ||
      (save.slots.length < inventory.slotCount && !shortOk)
    ) {
      throw new Error(
        `Slot sayısı uyuşmuyor: kayıtta ${save.slots.length}, envanterde ${inventory.slotCount}`,
      );
    }
    save.slots.forEach((raw: unknown, index) => {
      if (raw === null || index >= inventory.slotCount) return;
      const entry = raw as { id?: unknown; count?: unknown } | undefined;
      if (typeof entry !== 'object' || entry === null || !isItemId(entry.id)) {
        throw new Error(`Slot ${index}: bilinmeyen veya eksik eşya kimliği`);
      }
      const { id, count } = entry;
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
        throw new Error(`Slot ${index}: geçersiz adet (${String(count)})`);
      }
      if (count > ITEMS[id].stackMax) {
        throw new Error(
          `Slot ${index}: adet yığın sınırını aşıyor (${count} > ${ITEMS[id].stackMax})`,
        );
      }
      inventory.stacks[index] = { id, count };
      inventory.weightG += count * ITEMS[id].weightG;
    });
    inventory.bonusCache = null;
    if (inventory.weightG > inventory.maxWeightG) {
      throw new Error(
        `Kayıtlı ağırlık sınırı aşıyor (${inventory.weightG} g > ${inventory.maxWeightG} g)`,
      );
    }
    for (let i = inventory.activeSlots; i < inventory.slotCount; i++) {
      if (inventory.stacks[i] !== null) throw new Error(`Slot ${i}: çanta olmadan kullanılamaz`);
    }
    return inventory;
  }

  /**
   * Kayıttan bu örneği yerinde yükler (başka nesneler bu örneğe referans tutar): önce doğrular, sonra
   * yazar; bozuk veride `Error` fırlatır ve envanter değişmez. `version` artar (arayüz yenilenir).
   */
  loadSave(data: unknown): void {
    const loaded = Inventory.fromJSON(data, {
      slots: this.baseSlots,
      maxWeightG: this.baseWeightG,
      backpacks: this.backpacks,
    });
    this.stacks.splice(0, this.stacks.length, ...loaded.stacks);
    this.weightG = loaded.weightG;
    this.revision += 1;
  }

  /**
   * Bir çanta çıkarılabilir mi: çıkınca kalan çantanın sınırları (ağırlık, kilitlenecek slotlar) aşılmamalı. Çanta
   * değilse her zaman true. `slot` verilirse çıkarma o slottandır (yoksa `remove` gibi son slotlardan).
   */
  private backpackRemovable(id: ItemId, n: number, slot: number | null): boolean {
    if (!this.backpacks || !isBackpack(id)) return true;
    const trial = this.clone();
    if (slot !== null) {
      const stack = trial.stacks[slot] as ItemStack;
      stack.count -= n;
      if (stack.count === 0) trial.stacks[slot] = null;
    } else {
      let left = n;
      for (let i = trial.stacks.length - 1; i >= 0 && left > 0; i--) {
        const stack = trial.stacks[i];
        if (stack?.id !== id) continue;
        const taken = Math.min(left, stack.count);
        stack.count -= taken;
        left -= taken;
        if (stack.count === 0) trial.stacks[i] = null;
      }
    }
    trial.weightG -= n * ITEMS[id].weightG;
    trial.revision += 1;
    if (trial.weightG > trial.maxWeightG) return false;
    for (let i = trial.activeSlots; i < trial.slotCount; i++) {
      if (trial.stacks[i] !== null) return false;
    }
    return true;
  }

  private static totals(costs: ReadonlyArray<ItemStack>): Map<ItemId, number> {
    const totals = new Map<ItemId, number>();
    for (const { id, count } of costs) {
      assertCount(count, 'maliyet');
      totals.set(id, (totals.get(id) ?? 0) + count);
    }
    return totals;
  }

  private assertSlot(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.slotCount) {
      throw new RangeError(`Slot indeksi sınır dışı: ${index} (0–${this.slotCount - 1})`);
    }
  }

  private bump(): void {
    this.revision += 1;
  }
}
