/** Eşya kimlikleri. Liste yalnızca sona eklenir (kayıt dosyaları kimliği yazar). */
export const ITEM_IDS = [
  // malzeme
  'stick',
  'stone',
  'log',
  'bark',
  'tinder',
  // yiyecek
  'hazelnut',
  'chestnut',
  'blackberry',
  'mushroom_edible',
  // aletler (4.5'te üretilir; kimlikler şimdiden tanımlı)
  'stone_axe',
  'water_container_empty',
  'water_container_full',
  // yerleştirilebilir yapılar (4.5'te üretilir, 4.8'de yerleştirilir)
  'campfire',
  'lean_to',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type ItemCategory = 'material' | 'food' | 'tool' | 'placeable';

/** Yenince göstergelere eklenen puanlar (0–100 ölçeğinde). */
export interface EdibleEffect {
  satiety?: number;
  hydration?: number;
  health?: number;
}

export interface ItemDef {
  id: ItemId;
  /** Görünen ad (Türkçe). */
  name: string;
  /** Tek adedin ağırlığı (gram, tam sayı). */
  weightG: number;
  /** Bir slottaki en fazla adet (aletler 1). */
  stackMax: number;
  category: ItemCategory;
  edible?: EdibleEffect;
}

/**
 * Eşya tablosu (veri). Tokluk 30 dk'da boşalır (≈ 3,3 puan/dk): bir avuç fındık dakikalar kazandırır,
 * tek başına doyurmaz. Değerler elle denge ayarına açıktır.
 */
export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  stick: { id: 'stick', name: 'Dal', weightG: 300, stackMax: 20, category: 'material' },
  stone: { id: 'stone', name: 'Taş', weightG: 500, stackMax: 10, category: 'material' },
  log: { id: 'log', name: 'Kütük', weightG: 3000, stackMax: 3, category: 'material' },
  bark: { id: 'bark', name: 'Kabuk', weightG: 100, stackMax: 30, category: 'material' },
  tinder: { id: 'tinder', name: 'Kav', weightG: 30, stackMax: 30, category: 'material' },
  hazelnut: {
    id: 'hazelnut',
    name: 'Fındık',
    weightG: 30,
    stackMax: 30,
    category: 'food',
    edible: { satiety: 4 },
  },
  chestnut: {
    id: 'chestnut',
    name: 'Kestane',
    weightG: 50,
    stackMax: 20,
    category: 'food',
    edible: { satiety: 6 },
  },
  blackberry: {
    id: 'blackberry',
    name: 'Böğürtlen',
    weightG: 20,
    stackMax: 30,
    category: 'food',
    edible: { satiety: 3, hydration: 2 },
  },
  mushroom_edible: {
    id: 'mushroom_edible',
    name: 'Yenebilir Mantar',
    weightG: 50,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 5 },
  },
  stone_axe: { id: 'stone_axe', name: 'Taş Balta', weightG: 1500, stackMax: 1, category: 'tool' },
  water_container_empty: {
    id: 'water_container_empty',
    name: 'Boş Su Kabı',
    weightG: 300,
    stackMax: 1,
    category: 'tool',
  },
  water_container_full: {
    id: 'water_container_full',
    name: 'Dolu Su Kabı',
    weightG: 1300,
    stackMax: 1,
    category: 'tool',
  },
  campfire: {
    id: 'campfire',
    name: 'Kamp Ateşi',
    weightG: 4000,
    stackMax: 1,
    category: 'placeable',
  },
  lean_to: { id: 'lean_to', name: 'Sundurma', weightG: 8000, stackMax: 1, category: 'placeable' },
};

export function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && (ITEM_IDS as readonly string[]).includes(value);
}
