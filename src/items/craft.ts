import { Inventory, type ItemStack } from './Inventory';
import type { Recipe } from './recipes';

export type CraftFailure =
  | { ok: false; reason: 'missing_tool'; missing: ItemStack[] }
  | { ok: false; reason: 'missing_inputs'; missing: ItemStack[] }
  | { ok: false; reason: 'no_space'; missing: ItemStack[] };

export type CraftStatus = { ok: true } | CraftFailure;

export type CraftResult = { ok: true; output: ItemStack } | CraftFailure;

/**
 * Tarif yapılabilir mi? Sırayla: alet, malzeme, çıktıya yer. Başarısızlıkta `missing` arayüzün
 * göstereceği eksikleri verir (alet: 1 adet, malzeme: eksik adetler; `no_space`: boş).
 * Envanteri değiştirmez.
 */
export function craftStatus(inventory: Inventory, recipe: Recipe): CraftStatus {
  if (recipe.tool && !inventory.has(recipe.tool)) {
    return { ok: false, reason: 'missing_tool', missing: [{ id: recipe.tool, count: 1 }] };
  }

  const shortfall = recipe.inputs
    .map(({ id, count }) => ({ id, count: count - inventory.count(id) }))
    .filter((entry) => entry.count > 0);
  if (shortfall.length > 0) return { ok: false, reason: 'missing_inputs', missing: shortfall };

  // Yer denetimi: malzeme çıkınca serbest kalan slot/ağırlık hesaba katılmalı (kopya üzerinde dene).
  const trial = Inventory.fromJSON(inventory.toJSON(), {
    slots: inventory.slotCount,
    maxWeightG: inventory.maxWeightG,
  });
  trial.take(recipe.inputs);
  if (trial.add(recipe.output.id, recipe.output.count) > 0) {
    return { ok: false, reason: 'no_space', missing: [] };
  }
  return { ok: true };
}

export function canCraft(inventory: Inventory, recipe: Recipe): boolean {
  return craftStatus(inventory, recipe).ok;
}

/**
 * Tarifi uygular: malzemeyi düşer, çıktıyı ekler. Atomiktir: yapılamıyorsa envanter hiç değişmez.
 * Alet tüketilmez.
 */
export function craft(inventory: Inventory, recipe: Recipe): CraftResult {
  const status = craftStatus(inventory, recipe);
  if (!status.ok) return status;

  inventory.take(recipe.inputs);
  inventory.add(recipe.output.id, recipe.output.count);
  return { ok: true, output: { ...recipe.output } };
}
