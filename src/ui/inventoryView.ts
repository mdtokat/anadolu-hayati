import {
  craft,
  craftStatus,
  NO_STATIONS,
  type CraftContext,
  type CraftFailure,
} from '../items/craft';
import { Inventory, type ItemStack } from '../items/Inventory';
import { ITEMS, type ItemCategory, type ItemId } from '../items/itemDefs';
import { RECIPE_LIST, RECIPES, type Recipe, type RecipeId } from '../items/recipes';
import { FULL_CONTAINER } from '../items/waterContainer';
import { AMMO, COMBAT, RANGED, WATER_CONTAINER } from '../config';

/** Görünüm modeli (saf, testli): DOM katmanı (`InventoryPanel`) yalnızca bunu çizer. */

/** Gram → "4,2 kg" (Türkçe ondalık virgül). */
export function formatWeight(grams: number): string {
  return `${(grams / 1000).toFixed(1).replace('.', ',')} kg`;
}

/** Başlık satırı: "Ağırlık 4,2 / 25,0 kg · Slot 7/20". */
export function capacityText(inventory: Inventory): string {
  const used = inventory.slots.filter((stack) => stack !== null).length;
  return `Ağırlık ${formatWeight(inventory.totalWeightG)} / ${formatWeight(inventory.maxWeightG)} · Slot ${used}/${inventory.activeSlots}`;
}

/** Ağırlık satırı (envanter başlığındaki yük göstergesi): "4,2 / 25,0 kg". */
export function weightText(inventory: Inventory): string {
  return `${formatWeight(inventory.totalWeightG)} / ${formatWeight(inventory.maxWeightG)}`;
}

/** Dolu slot sayısı: "7/20". */
export function slotUsageText(inventory: Inventory): string {
  const used = inventory.slots.filter((stack) => stack !== null).length;
  return `${used}/${inventory.activeSlots}`;
}

/** Eşya kategorisinin görünen adı (seçili eşya kartında). */
export const CATEGORY_LABELS: Readonly<Record<ItemCategory, string>> = {
  material: 'Malzeme',
  food: 'Yiyecek',
  tool: 'Alet ve ekipman',
  placeable: 'Yapı',
};

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
  /** Kategori (boşsa null; slot vurgu rengi ve kart etiketi için). */
  category: ItemCategory | null;
  /** Yığının toplam ağırlığı ("0,4 kg"; boşsa ""). */
  weight: string;
  /** Yiyecek/içecek etkisi ("Tokluk +4, Su +2"; yoksa ""). */
  effect: string;
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
      category: null,
      weight: '',
      effect: '',
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
    category: def.category,
    weight,
    effect,
  };
}

export interface RecipeInputView {
  id: ItemId;
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
  /** Yakında bulunması gereken istasyon (Faz 9); yoksa null. */
  station: { name: string; ok: boolean } | null;
  output: string;
  /** Üretilen eşya (simge için) ve adedi. */
  outputId: ItemId;
  outputCount: number;
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
    case 'missing_station':
      return `${ITEMS[failure.station].name} yanında üretilir`;
    case 'missing_tool':
      return `${list} gerekir`;
    case 'missing_inputs':
      return `Eksik: ${list}`;
    case 'no_space':
      return 'Envanterde yer yok';
  }
}

export function recipeRow(
  inventory: Inventory,
  recipe: Recipe,
  context: CraftContext = NO_STATIONS,
): RecipeRow {
  const status = craftStatus(inventory, recipe, context);
  return {
    id: recipe.id,
    name: recipe.name,
    inputs: recipe.inputs.map(({ id, count }) => {
      const have = inventory.count(id);
      return { id, name: ITEMS[id].name, need: count, have, ok: have >= count };
    }),
    tool: recipe.tool ? { name: ITEMS[recipe.tool].name, ok: inventory.has(recipe.tool) } : null,
    station: recipe.station
      ? { name: ITEMS[recipe.station].name, ok: context.stations.has(recipe.station) }
      : null,
    output: `${ITEMS[recipe.output.id].name}${recipe.output.count > 1 ? ` ×${recipe.output.count}` : ''}`,
    outputId: recipe.output.id,
    outputCount: recipe.output.count,
    craftable: status.ok,
    reason: status.ok ? '' : failureText(status),
  };
}

export function recipeRows(inventory: Inventory, context: CraftContext = NO_STATIONS): RecipeRow[] {
  return RECIPE_LIST.map((recipe) => recipeRow(inventory, recipe, context));
}

/** Üretim listesi süzgeci (envanter paneli): tarifler çıktılarına göre gruplanır. */
export const RECIPE_FILTERS = ['all', 'weapon', 'tool', 'structure', 'food', 'material'] as const;
export type RecipeFilter = (typeof RECIPE_FILTERS)[number];

export const RECIPE_FILTER_LABELS: Readonly<Record<RecipeFilter, string>> = {
  all: 'Tümü',
  weapon: 'Silah',
  tool: 'Alet',
  structure: 'Yapı',
  food: 'Gıda',
  material: 'Malzeme',
};

/** Silah ve mühimmat sayılan eşyalar (yakın/menzilli silahlar, mermiler, barut; taş balta alettir). */
const WEAPON_OUTPUTS: ReadonlySet<ItemId> = new Set<ItemId>([
  ...(Object.keys(COMBAT.weapons).filter((id) => id !== 'fist' && id !== 'stone_axe') as ItemId[]),
  ...(Object.keys(RANGED.weapons) as ItemId[]),
  ...(Object.keys(AMMO.lootCount) as ItemId[]),
  'gunpowder',
  'suppressor',
]);

/** Gıda zincirinin ara ürünleri (malzeme kategorisinde ama yalnızca yemek yapımına gider). */
const FOOD_OUTPUTS: ReadonlySet<ItemId> = new Set<ItemId>(['flour', 'corn_flour']);

/** Tarifin süzgeç grubu (çıktı eşyasına göre; "Tümü" dışındaki tek grup). */
export function recipeFilterOf(recipe: Recipe): Exclude<RecipeFilter, 'all'> {
  const id = recipe.output.id;
  if (WEAPON_OUTPUTS.has(id)) return 'weapon';
  if (FOOD_OUTPUTS.has(id)) return 'food';
  switch (ITEMS[id].category) {
    case 'placeable':
      return 'structure';
    case 'food':
      return 'food';
    case 'tool':
      return 'tool';
    case 'material':
      return 'material';
  }
}

/** Süzgeçten geçen satırlar (`all` hepsini verir; sıra korunur). */
export function filterRecipeRows(rows: readonly RecipeRow[], filter: RecipeFilter): RecipeRow[] {
  if (filter === 'all') return [...rows];
  return rows.filter((row) => recipeFilterOf(RECIPES[row.id]) === filter);
}

/** Süzgeç başına tarif sayısı (sekme rozetleri: "Silah 12"). */
export function recipeFilterCounts(rows: readonly RecipeRow[]): Record<RecipeFilter, number> {
  const counts = Object.fromEntries(RECIPE_FILTERS.map((f) => [f, 0])) as Record<
    RecipeFilter,
    number
  >;
  for (const row of rows) {
    counts.all += 1;
    counts[recipeFilterOf(RECIPES[row.id])] += 1;
  }
  return counts;
}

/** Tek seferde istenebilecek en çok üretim adedi (adet girişinin üst sınırı). */
export const CRAFT_BATCH_MAX = 50;

/**
 * Tarif art arda kaç kez üretilebilir (0–`CRAFT_BATCH_MAX`)? Malzeme sınırı önce hesaplanır, sonra envanterin
 * kopyasında tek tek üretilerek yer (slot/ağırlık) denetlenir; gerçek envanter değişmez.
 */
export function maxCraftable(
  inventory: Inventory,
  recipe: Recipe,
  context: CraftContext = NO_STATIONS,
  limit = CRAFT_BATCH_MAX,
): number {
  if (!craftStatus(inventory, recipe, context).ok) return 0;
  let bound = limit;
  if (!context.free) {
    for (const { id, count } of recipe.inputs) {
      bound = Math.min(bound, Math.floor(inventory.count(id) / count));
    }
  }
  const trial = inventory.clone();
  let made = 0;
  while (made < bound && craft(trial, recipe, context).ok) made += 1;
  return made;
}

/** Adet girişini geçerli aralığa çeker (boş/bozuk → 1; 1…`max`, `max` 0 ise 1). */
export function clampCraftCount(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.floor(value), 1), Math.max(max, 1));
}
