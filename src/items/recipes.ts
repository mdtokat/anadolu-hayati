import type { ItemStack } from './Inventory';
import type { ItemId } from './itemDefs';

/** Üretim istasyonları (Faz 9): tarifin yapılması için yakında bulunması gereken yapı (`STATIONS`). */
export const STATION_KINDS = ['workbench'] as const;
export type StationKind = (typeof STATION_KINDS)[number];

export const RECIPE_IDS = [
  'stone_axe',
  'water_container',
  'campfire',
  'lean_to',
  'stone_spear',
  'hide_vest',
  'workbench',
  'storage_chest',
  'wooden_hut',
  'bone_knife',
  'torch',
  'fur_cloak',
  // Modüler inşa parçaları (tezgâhta üretilir).
  'foundation',
  'wall',
  'doorway',
  'window_wall',
  'door',
  'roof',
] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

export interface Recipe {
  id: RecipeId;
  /** Görünen ad (Türkçe). */
  name: string;
  /** Tüketilen malzemeler (her eşya en çok bir satırda). */
  inputs: ReadonlyArray<ItemStack>;
  /** Üretimde envanterde bulunması gereken ama tüketilmeyen alet. */
  tool?: ItemId;
  /** Üretimde yakında (`STATIONS[station].reach`) bulunması gereken istasyon yapısı. */
  station?: StationKind;
  output: ItemStack;
}

/**
 * Tarif tablosu (veri). Elle toplanabilenler: dal, taş, kav; kütük ve kabuk yalnızca baltayla alınır
 * (plan §2.3), bu yüzden taş balta kütük/kabuk istemez. Miktarlar elle denge ayarına açıktır.
 */
export const RECIPES: Readonly<Record<RecipeId, Recipe>> = {
  stone_axe: {
    id: 'stone_axe',
    name: 'Taş Balta',
    inputs: [
      { id: 'stick', count: 2 },
      { id: 'stone', count: 2 },
      { id: 'tinder', count: 3 },
    ],
    output: { id: 'stone_axe', count: 1 },
  },
  water_container: {
    id: 'water_container',
    name: 'Su Kabı',
    inputs: [
      { id: 'bark', count: 6 },
      { id: 'tinder', count: 1 },
    ],
    output: { id: 'water_container_empty', count: 1 },
  },
  campfire: {
    id: 'campfire',
    name: 'Kamp Ateşi',
    inputs: [
      { id: 'stick', count: 6 },
      { id: 'stone', count: 4 },
      { id: 'tinder', count: 3 },
      { id: 'log', count: 1 },
    ],
    output: { id: 'campfire', count: 1 },
  },
  lean_to: {
    id: 'lean_to',
    name: 'Sundurma',
    inputs: [
      { id: 'log', count: 3 },
      { id: 'stick', count: 8 },
      { id: 'bark', count: 10 },
    ],
    tool: 'stone_axe',
    output: { id: 'lean_to', count: 1 },
  },
  // Faz 5 (5.8): av silahı ve giysi. Deri yalnızca avdan gelir (leş kesme, 5.9).
  stone_spear: {
    id: 'stone_spear',
    name: 'Taş Mızrak',
    inputs: [
      { id: 'stick', count: 2 },
      { id: 'stone', count: 1 },
      { id: 'tinder', count: 3 },
    ],
    output: { id: 'stone_spear', count: 1 },
  },
  hide_vest: {
    id: 'hide_vest',
    name: 'Deri Yelek',
    inputs: [
      { id: 'hide', count: 2 },
      { id: 'tinder', count: 4 },
    ],
    tool: 'stone_axe',
    output: { id: 'hide_vest', count: 1 },
  },
  // Faz 9: inşa. Tezgâh baltayla her yerde yapılır; sandık, kulübe ve pelerin tezgâhın yanında üretilir.
  // Kulübenin malzemesi tek seferde ancak taşınır (5 kütük = 15 kg): sandıkta biriktirip tezgâhın yanında üret.
  workbench: {
    id: 'workbench',
    name: 'Çalışma Tezgâhı',
    inputs: [
      { id: 'log', count: 2 },
      { id: 'stick', count: 4 },
      { id: 'stone', count: 2 },
    ],
    tool: 'stone_axe',
    output: { id: 'workbench', count: 1 },
  },
  storage_chest: {
    id: 'storage_chest',
    name: 'Sandık',
    inputs: [
      { id: 'log', count: 2 },
      { id: 'stick', count: 6 },
      { id: 'bark', count: 4 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'storage_chest', count: 1 },
  },
  wooden_hut: {
    id: 'wooden_hut',
    name: 'Ahşap Kulübe',
    inputs: [
      { id: 'log', count: 5 },
      { id: 'stick', count: 10 },
      { id: 'bark', count: 10 },
      { id: 'stone', count: 4 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'wooden_hut', count: 1 },
  },
  // Faz 9: ekipman.
  bone_knife: {
    id: 'bone_knife',
    name: 'Kemik Bıçak',
    inputs: [
      { id: 'bone', count: 1 },
      { id: 'stone', count: 1 },
      { id: 'tinder', count: 2 },
    ],
    output: { id: 'bone_knife', count: 1 },
  },
  torch: {
    id: 'torch',
    name: 'Meşale',
    inputs: [
      { id: 'stick', count: 1 },
      { id: 'bark', count: 2 },
      { id: 'tinder', count: 2 },
    ],
    output: { id: 'torch', count: 1 },
  },
  fur_cloak: {
    id: 'fur_cloak',
    name: 'Kürk Pelerin',
    inputs: [
      { id: 'hide', count: 3 },
      { id: 'bone', count: 2 },
      { id: 'tinder', count: 4 },
    ],
    station: 'workbench',
    output: { id: 'fur_cloak', count: 1 },
  },
  // Modüler inşa parçaları: her biri ayrı üretilir (tezgâh + taş balta), sahada monte edilir (`placement/pieceRules.ts`).
  foundation: {
    id: 'foundation',
    name: 'Taban',
    inputs: [
      { id: 'log', count: 2 },
      { id: 'stone', count: 2 },
      { id: 'bark', count: 2 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'foundation', count: 1 },
  },
  wall: {
    id: 'wall',
    name: 'Duvar',
    inputs: [
      { id: 'log', count: 1 },
      { id: 'stick', count: 3 },
      { id: 'bark', count: 2 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'wall', count: 1 },
  },
  doorway: {
    id: 'doorway',
    name: 'Kapılı Duvar',
    inputs: [
      { id: 'log', count: 1 },
      { id: 'stick', count: 2 },
      { id: 'bark', count: 2 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'doorway', count: 1 },
  },
  window_wall: {
    id: 'window_wall',
    name: 'Pencereli Duvar',
    inputs: [
      { id: 'log', count: 1 },
      { id: 'stick', count: 3 },
      { id: 'bark', count: 1 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'window_wall', count: 1 },
  },
  door: {
    id: 'door',
    name: 'Kapı',
    inputs: [
      { id: 'stick', count: 4 },
      { id: 'bark', count: 2 },
      { id: 'tinder', count: 2 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'door', count: 1 },
  },
  roof: {
    id: 'roof',
    name: 'Çatı',
    inputs: [
      { id: 'log', count: 1 },
      { id: 'stick', count: 3 },
      { id: 'bark', count: 3 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'roof', count: 1 },
  },
};

export const RECIPE_LIST: ReadonlyArray<Recipe> = RECIPE_IDS.map((id) => RECIPES[id]);
