import type { ItemStack } from './Inventory';
import type { ItemId } from './itemDefs';

export const RECIPE_IDS = ['stone_axe', 'water_container', 'campfire', 'lean_to'] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

export interface Recipe {
  id: RecipeId;
  /** Görünen ad (Türkçe). */
  name: string;
  /** Tüketilen malzemeler (her eşya en çok bir satırda). */
  inputs: ReadonlyArray<ItemStack>;
  /** Üretimde envanterde bulunması gereken ama tüketilmeyen alet. */
  tool?: ItemId;
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
};

export const RECIPE_LIST: ReadonlyArray<Recipe> = RECIPE_IDS.map((id) => RECIPES[id]);
