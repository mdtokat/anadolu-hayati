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
  // av ürünleri ve savaş eşyaları (Faz 5; değerleri 5.8'de Hesap B ayarlar)
  'raw_meat',
  'cooked_meat',
  'hide',
  'bone',
  'stone_spear',
  'hide_vest',
  // Faz 9: inşa (yerleştirilebilir) ve ekipman
  'workbench',
  'storage_chest',
  'wooden_hut',
  'bone_knife',
  'torch',
  'fur_cloak',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type ItemCategory = 'material' | 'food' | 'tool' | 'placeable';

/** Yenince göstergelere eklenen puanlar (0–100 ölçeğinde). */
export interface EdibleEffect {
  satiety?: number;
  hydration?: number;
  /** Negatif olabilir (çiğ et): can düşer ama yemek tek başına öldürmez. */
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
  // Faz 5 (5.8): av ürünleri. Çiğ et az doyurur ve can götürür (risk), ateşte pişen et çok doyurur ve iyileştirir.
  // Yemek canı 1'in altına indirmez (`applyEdible`); çiğ et tek başına öldürmez.
  raw_meat: {
    id: 'raw_meat',
    name: 'Çiğ Et',
    weightG: 500,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 8, health: -6 },
  },
  cooked_meat: {
    id: 'cooked_meat',
    name: 'Pişmiş Et',
    weightG: 400,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 30, health: 4 },
  },
  hide: { id: 'hide', name: 'Deri', weightG: 1500, stackMax: 5, category: 'material' },
  bone: { id: 'bone', name: 'Kemik', weightG: 300, stackMax: 10, category: 'material' },
  stone_spear: {
    id: 'stone_spear',
    name: 'Taş Mızrak',
    weightG: 1200,
    stackMax: 1,
    category: 'tool',
  },
  // Giysi: envanterde bulunması savunma verir (`COMBAT.defense`); ayrı ekipman slotu yok (Fikir Havuzu).
  hide_vest: { id: 'hide_vest', name: 'Deri Yelek', weightG: 1800, stackMax: 1, category: 'tool' },
  // Faz 9: inşa. Kulübe ağırdır (taşıması zor): genellikle tezgâhın yanında üretilip hemen kurulur.
  workbench: {
    id: 'workbench',
    name: 'Çalışma Tezgâhı',
    weightG: 9000,
    stackMax: 1,
    category: 'placeable',
  },
  storage_chest: {
    id: 'storage_chest',
    name: 'Sandık',
    weightG: 8000,
    stackMax: 1,
    category: 'placeable',
  },
  wooden_hut: {
    id: 'wooden_hut',
    name: 'Ahşap Kulübe',
    weightG: 14_000,
    stackMax: 1,
    category: 'placeable',
  },
  // Faz 9: ekipman. Bıçak leşi en hızlı keser; meşale elde tutulunca aydınlatır; pelerin ısıtır ve biraz korur.
  bone_knife: {
    id: 'bone_knife',
    name: 'Kemik Bıçak',
    weightG: 400,
    stackMax: 1,
    category: 'tool',
  },
  torch: { id: 'torch', name: 'Meşale', weightG: 500, stackMax: 1, category: 'tool' },
  fur_cloak: {
    id: 'fur_cloak',
    name: 'Kürk Pelerin',
    weightG: 3000,
    stackMax: 1,
    category: 'tool',
  },
};

export function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && (ITEM_IDS as readonly string[]).includes(value);
}
