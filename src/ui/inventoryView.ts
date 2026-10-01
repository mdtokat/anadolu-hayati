import { craftStatus, type CraftFailure } from '../items/craft';
import type { Inventory, ItemStack } from '../items/Inventory';
import { ITEMS, type ItemId } from '../items/itemDefs';
import { RECIPE_LIST, type Recipe, type RecipeId } from '../items/recipes';
import { FULL_CONTAINER } from '../items/waterContainer';
import { WATER_CONTAINER } from '../config';

/** Görünüm modeli (saf, testli): DOM katmanı (`InventoryPanel`) yalnızca bunu çizer. */

/** Gram → "4,2 kg" (Türkçe ondalık virgül). */
export function formatWeight(grams: number): string {
  return `${(grams / 1000).toFixed(1).replace('.', ',')} kg`;
}

/** Başlık satırı: "Ağırlık 4,2 / 25,0 kg · Slot 7/20". */
export function capacityText(inventory: Inventory): string {
  const used = inventory.slots.filter((stack) => stack !== null).length;
  return `Ağırlık ${formatWeight(inventory.totalWeightG)} / ${formatWeight(inventory.maxWeightG)} · Slot ${used}/${inventory.slotCount}`;
}

export interface SlotView {
  empty: boolean;
  /** Slotta görünen ad (boşsa ""). */
  name: string;
  /** Adet etiketi ("×12"; tek adetliklerde ""). */
  count: string;
  /** Üzerine gelince: ad, adet, ağırlık, yiyecekse etkisi. */
  title: string;
  id: ItemId | null;
  /** Seçiliyken "Ye" düğmesi için: yiyecek mi? */
  edible: boolean;
  /** Seçiliyken "İç" düğmesi için: içilebilir mi (dolu su kabı)? */
  drinkable: boolean;
}

function effectText(id: ItemId): string {
  if (id === FULL_CONTAINER) return `Su +${WATER_CONTAINER.drinkHydration}`;
  const edible = ITEMS[id].edible;
  if (!edible) return '';
  const parts: string[] = [];
  if (edible.satiety) parts.push(`Tokluk +${edible.satiety}`);
  if (edible.hydration) parts.push(`Su +${edible.hydration}`);
  if (edible.health) parts.push(`Sağlık +${edible.health}`);
  return parts.join(', ');
}

export function slotView(stack: Readonly<ItemStack> | null): SlotView {
  if (stack === null) {
    return {
      empty: true,
      name: '',
      count: '',
      title: 'Boş',
      id: null,
      edible: false,
      drinkable: false,
    };
  }
  const def = ITEMS[stack.id];
  const weight = formatWeight(def.weightG * stack.count);
  const effect = effectText(stack.id);
  return {
    empty: false,
    name: def.name,
    count: stack.count > 1 ? `×${stack.count}` : '',
    title: `${def.name} ×${stack.count} · ${weight}${effect ? ` · ${effect}` : ''}`,
    id: stack.id,
    edible: def.edible !== undefined,
    drinkable: stack.id === FULL_CONTAINER,
  };
}

export interface RecipeInputView {
  name: string;
  need: number;
  have: number;
  ok: boolean;
}

export interface RecipeRow {
  id: RecipeId;
  name: string;
  inputs: RecipeInputView[];
  /** Gerekli alet (tüketilmez); yoksa null. */
  tool: { name: string; ok: boolean } | null;
  output: string;
  craftable: boolean;
  /** Yapılamıyorsa nedeni; yapılabiliyorsa "". */
  reason: string;
}

/** Üretim hatası → Türkçe açıklama (eksikler adlarıyla). */
export function failureText(failure: CraftFailure): string {
  const list = failure.missing
    .map((m) => (m.count > 1 ? `${m.count} ${ITEMS[m.id].name}` : ITEMS[m.id].name))
    .join(', ');
  switch (failure.reason) {
    case 'missing_tool':
      return `${list} gerekir`;
    case 'missing_inputs':
      return `Eksik: ${list}`;
    case 'no_space':
      return 'Envanterde yer yok';
  }
}

export function recipeRow(inventory: Inventory, recipe: Recipe): RecipeRow {
  const status = craftStatus(inventory, recipe);
  return {
    id: recipe.id,
    name: recipe.name,
    inputs: recipe.inputs.map(({ id, count }) => {
      const have = inventory.count(id);
      return { name: ITEMS[id].name, need: count, have, ok: have >= count };
    }),
    tool: recipe.tool ? { name: ITEMS[recipe.tool].name, ok: inventory.has(recipe.tool) } : null,
    output: `${ITEMS[recipe.output.id].name}${recipe.output.count > 1 ? ` ×${recipe.output.count}` : ''}`,
    craftable: status.ok,
    reason: status.ok ? '' : failureText(status),
  };
}

export function recipeRows(inventory: Inventory): RecipeRow[] {
  return RECIPE_LIST.map((recipe) => recipeRow(inventory, recipe));
}
