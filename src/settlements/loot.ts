import { SEARCH } from '../config';
import type { ItemStack } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import { createRandom, seedFrom } from '../utils/random';
import type { BuildingKind } from './kinds';

/** Ganimet satırı: `chance` olasılıkla `min`–`max` adet. */
export interface LootEntry {
  item: ItemId;
  chance: number;
  min: number;
  max: number;
}

const e = (item: ItemId, chance: number, min = 1, max = min): LootEntry => ({
  item,
  chance,
  min,
  max,
});

/**
 * Terk edilmiş yapıların ganimeti (Faz 10; veri, denge elle ayarlanır). Türk kileri: bulgur, tarhana, kuru fasulye,
 * pekmez, leblebi, kuru kayısı, peksimet, Rize çayı; bakır tencere, yün battaniye; serenderde fındık ve kestane;
 * madenlerde madenci lambası. Cami, türbe, mezarlık aranmaz (saygı) ve tabloları yoktur.
 */
export const BUILDING_LOOT: Partial<Record<BuildingKind, readonly LootEntry[]>> = {
  house: [
    e('bulgur', 0.35, 1, 2),
    e('tarhana', 0.3, 1, 2),
    e('dry_beans', 0.25),
    e('pekmez', 0.25),
    e('leblebi', 0.2, 1, 3),
    e('peksimet', 0.35, 1, 3),
    e('dried_apricot', 0.2, 1, 3),
    e('black_tea', 0.3, 1, 2),
    e('hazelnut', 0.25, 3, 8),
    e('copper_pot', 0.12),
    e('wool_blanket', 0.12),
  ],
  konak: [
    e('bulgur', 0.4, 1, 2),
    e('tarhana', 0.35, 1, 2),
    e('pekmez', 0.4, 1, 2),
    e('dried_apricot', 0.3, 2, 4),
    e('black_tea', 0.35, 1, 2),
    e('peksimet', 0.3, 1, 3),
    e('copper_pot', 0.3),
    e('wool_blanket', 0.3),
  ],
  apartment: [
    e('bulgur', 0.4, 1, 3),
    e('dry_beans', 0.4, 1, 2),
    e('tarhana', 0.3, 1, 2),
    e('black_tea', 0.5, 1, 3),
    e('peksimet', 0.4, 1, 3),
    e('leblebi', 0.3, 1, 3),
    e('copper_pot', 0.15),
    e('wool_blanket', 0.2),
  ],
  lojman: [
    e('peksimet', 0.4, 1, 3),
    e('black_tea', 0.4, 1, 2),
    e('bulgur', 0.3, 1, 2),
    e('miner_lamp', 0.25),
    e('wool_blanket', 0.2),
  ],
  serender: [e('hazelnut', 0.8, 5, 15), e('chestnut', 0.5, 3, 8), e('dry_beans', 0.3, 1, 2)],
  shop_row: [
    e('leblebi', 0.6, 2, 5),
    e('peksimet', 0.6, 2, 5),
    e('black_tea', 0.6, 2, 4),
    e('pekmez', 0.4, 1, 2),
    e('bulgur', 0.4, 1, 3),
    e('dried_apricot', 0.5, 2, 4),
  ],
  kahvehane: [e('black_tea', 0.8, 2, 5), e('copper_pot', 0.4), e('peksimet', 0.3, 1, 2)],
  government: [e('peksimet', 0.3, 1, 2), e('wool_blanket', 0.3), e('black_tea', 0.3)],
  han: [
    e('wool_blanket', 0.5),
    e('copper_pot', 0.4),
    e('bulgur', 0.4, 1, 3),
    e('dry_beans', 0.3, 1, 2),
  ],
  hamam: [e('copper_pot', 0.4), e('wool_blanket', 0.3)],
  mine_tower: [e('miner_lamp', 0.7), e('peksimet', 0.3, 1, 2)],
  factory: [e('miner_lamp', 0.2), e('peksimet', 0.2), e('wool_blanket', 0.2)],
};

/** Yapının ganimeti (deterministik: aynı yapı kimliği aynı ganimeti verir; boş çıkabilir). */
export function rollBuildingLoot(
  building: { id: number; kind: BuildingKind; ruined: boolean },
  seed: number = SEARCH.seed,
): ItemStack[] {
  const table = BUILDING_LOOT[building.kind];
  if (!table) return [];
  const random = createRandom(seedFrom(seed, building.id));
  const scale = building.ruined ? SEARCH.ruinedChanceScale : 1;
  const out: ItemStack[] = [];
  for (const row of table) {
    const roll = random.next();
    const count = random.int(row.min, row.max);
    if (roll < row.chance * scale) out.push({ id: row.item, count });
  }
  return out;
}
