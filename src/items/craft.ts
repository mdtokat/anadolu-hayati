import { Inventory, type ItemStack } from './Inventory';
import type { Recipe, StationKind } from './recipes';

/** Üretimin yapıldığı yer: yakındaki istasyonlar (Faz 9; `placement/stations.ts` hesaplar). */
export interface CraftContext {
  stations: ReadonlySet<StationKind>;
  /** Test modu: istasyon, alet ve malzeme istenmez, girdi tüketilmez (yalnızca çıktıya yer aranır). */
  free?: boolean;
}

/** İstasyonsuz bağlam (açık arazi): yalnızca elle/aletle yapılan tarifler. */
export const NO_STATIONS: CraftContext = { stations: new Set() };

export type CraftFailure =
  | { ok: false; reason: 'missing_station'; missing: ItemStack[]; station: StationKind }
  | { ok: false; reason: 'missing_tool'; missing: ItemStack[] }
  | { ok: false; reason: 'missing_inputs'; missing: ItemStack[] }
  | { ok: false; reason: 'no_space'; missing: ItemStack[] };

export type CraftStatus = { ok: true } | CraftFailure;

export type CraftResult = { ok: true; output: ItemStack } | CraftFailure;

/**
 * Tarif yapılabilir mi? Sırayla: istasyon, alet, malzeme, çıktıya yer. Başarısızlıkta `missing` arayüzün
 * göstereceği eksikleri verir (istasyon: boş, alet: 1 adet, malzeme: eksik adetler; `no_space`: boş).
 * Envanteri değiştirmez.
 */
export function craftStatus(
  inventory: Inventory,
  recipe: Recipe,
  context: CraftContext = NO_STATIONS,
): CraftStatus {
  if (context.free) return outputFits(inventory, recipe, false) ? { ok: true } : NO_SPACE;
  if (recipe.station && !context.stations.has(recipe.station)) {
    return { ok: false, reason: 'missing_station', missing: [], station: recipe.station };
  }
  if (recipe.tool && !inventory.has(recipe.tool)) {
    return { ok: false, reason: 'missing_tool', missing: [{ id: recipe.tool, count: 1 }] };
  }

  const shortfall = recipe.inputs
    .map(({ id, count }) => ({ id, count: count - inventory.count(id) }))
    .filter((entry) => entry.count > 0);
  if (shortfall.length > 0) return { ok: false, reason: 'missing_inputs', missing: shortfall };

  return outputFits(inventory, recipe, true) ? { ok: true } : NO_SPACE;
}

const NO_SPACE: CraftFailure = { ok: false, reason: 'no_space', missing: [] };

/**
 * Çıktıya yer var mı? Yer denetimi: malzeme çıkınca serbest kalan slot/ağırlık hesaba katılmalı (kopya üzerinde
 * dene); `takesInputs` false (test modu) ise malzeme çıkmaz.
 */
function outputFits(inventory: Inventory, recipe: Recipe, takesInputs: boolean): boolean {
  const trial = inventory.clone();
  if (takesInputs) trial.take(recipe.inputs);
  return trial.add(recipe.output.id, recipe.output.count) === 0;
}

export function canCraft(
  inventory: Inventory,
  recipe: Recipe,
  context: CraftContext = NO_STATIONS,
): boolean {
  return craftStatus(inventory, recipe, context).ok;
}

/**
 * Tarifi uygular: malzemeyi düşer, çıktıyı ekler. Atomiktir: yapılamıyorsa envanter hiç değişmez.
 * Alet ve istasyon tüketilmez. Test modunda (`context.free`) hiçbir şey tüketilmez.
 */
export function craft(
  inventory: Inventory,
  recipe: Recipe,
  context: CraftContext = NO_STATIONS,
): CraftResult {
  const status = craftStatus(inventory, recipe, context);
  if (!status.ok) return status;

  if (!context.free) inventory.take(recipe.inputs);
  inventory.add(recipe.output.id, recipe.output.count);
  return { ok: true, output: { ...recipe.output } };
}
