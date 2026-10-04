import { AMMO, SEARCH } from '../config';
import type { ItemStack } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import { createRandom, seedFrom } from '../utils/random';
import { BUILDING_SHAPES, shapeVariant, type BuildingKind, type InteriorContainer } from './kinds';
import { ITEMS } from '../items/itemDefs';

/** Ganimet satırı: `chance` olasılıkla `min`–`max` adet. */
export interface LootEntry {
  item: ItemId;
  chance: number;
  min: number;
  max: number;
}

/** Mühimmat satırı: adet aralığı `AMMO.lootCount`'tan (D, 11.5). */
const ammo = (item: keyof typeof AMMO.lootCount, chance: number): LootEntry => ({
  item,
  chance,
  min: AMMO.lootCount[item][0],
  max: AMMO.lootCount[item][1],
});

const e = (item: ItemId, chance: number, min = 1, max = min): LootEntry => ({
  item,
  chance,
  min,
  max,
});

/**
 * Terk edilmiş yapıların ganimeti (Faz 10; veri, denge elle ayarlanır). Türk kileri: bulgur, tarhana, kuru fasulye,
 * pekmez, leblebi, kuru kayısı, peksimet, Rize çayı; bakır tencere, yün battaniye; serenderde fındık ve kestane;
 * madenlerde madenci lambası. Cami, türbe, mezarlık aranmaz (saygı) ve tabloları yoktur. Faz 11 satırları her
 * tablonun sonuna eklenir (önceki satırların zarları değişmesin: aynı yapı eski eşyalarını vermeye devam eder). Kale
 * aranabilir olmadığından planın kale satırları (pala, dürbün) yoktur.
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
    // ── Faz 11 (11.0; sahibi akış kendi eşyasının oranını ayarlar): köy evi tohumluğu (C), nadir barut ve av tüfeği (D) ──
    e('wheat_seed', 0.2, 3, 8),
    e('corn_seed', 0.15, 3, 8),
    e('potato', 0.2, 2, 5),
    e('gunpowder', 0.05, 1, 2),
    e('shotgun', 0.03),
    ammo('shotgun_shell', 0.08),
    // ── Faz 11: D (11.5): köy evinde sapan, sopa, yay ve ok ──
    e('slingshot', 0.06),
    e('club', 0.05),
    e('bow', 0.02),
    ammo('arrow', 0.04),
    // ── Faz 11 sonrası: sırt çantaları ──
    e('backpack_small', 0.06),
    e('backpack_medium', 0.025),
    // ── Battle Royale ile gelen sağlık eşyaları ve çelik yelek (hayatta kalma modunda nadir) ──
    e('bandage', 0.08, 1, 2),
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
    // ── Faz 11 (11.0): nadir tabanca ve mermi, pala (D) ──
    e('pistol', 0.04),
    ammo('pistol_ammo', 0.08),
    e('pala', 0.08),
    // ── Faz 11: D (11.5): konakta demir kama, av tüfeği fişeği ──
    e('iron_dagger', 0.08),
    ammo('shotgun_shell', 0.06),
    // ── Faz 11 sonrası: sırt çantaları ──
    e('backpack_medium', 0.05),
    e('backpack_large', 0.02),
    // ── Battle Royale ile gelen sağlık eşyaları ve çelik yelek (hayatta kalma modunda nadir) ──
    e('bandage', 0.08, 1, 2),
    e('first_aid_kit', 0.03),
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
    // ── Faz 11 (11.0): hurda, elektronik, pil, pervane (B/F); nadir tabanca ve mermi (D) ──
    e('scrap_metal', 0.3, 1, 3),
    e('electronic_parts', 0.2, 1, 2),
    e('battery', 0.15),
    e('propeller', 0.05),
    e('pistol', 0.03),
    ammo('pistol_ammo', 0.08),
    // ── Faz 11 sonrası: sırt çantaları ──
    e('backpack_small', 0.05),
    e('backpack_medium', 0.04),
    // ── Battle Royale ile gelen sağlık eşyaları ve çelik yelek (hayatta kalma modunda nadir) ──
    e('bandage', 0.1, 1, 2),
    e('first_aid_kit', 0.03),
  ],
  lojman: [
    e('peksimet', 0.4, 1, 3),
    e('black_tea', 0.4, 1, 2),
    e('bulgur', 0.3, 1, 2),
    e('miner_lamp', 0.25),
    e('wool_blanket', 0.2),
    // ── Battle Royale ile gelen sağlık eşyaları ve çelik yelek (hayatta kalma modunda nadir) ──
    e('bandage', 0.12, 1, 3),
    e('first_aid_kit', 0.04),
  ],
  serender: [
    e('hazelnut', 0.8, 5, 15),
    e('chestnut', 0.5, 3, 8),
    e('dry_beans', 0.3, 1, 2),
    // ── Faz 11 (11.0): tohumluk (C) ──
    e('wheat_seed', 0.35, 4, 10),
    e('corn_seed', 0.3, 4, 10),
    e('potato', 0.25, 2, 5),
    // ── Faz 11: D (11.5): serenderde av yayı ve ok ──
    e('bow', 0.04),
    ammo('arrow', 0.08),
  ],
  shop_row: [
    e('leblebi', 0.6, 2, 5),
    e('peksimet', 0.6, 2, 5),
    e('black_tea', 0.6, 2, 4),
    e('pekmez', 0.4, 1, 2),
    e('bulgur', 0.4, 1, 3),
    e('dried_apricot', 0.5, 2, 4),
    // ── Faz 11 (11.0): hurda, elektronik, pil, pervane (B/F) ──
    e('scrap_metal', 0.25, 1, 2),
    e('electronic_parts', 0.3, 1, 3),
    e('battery', 0.25, 1, 2),
    e('propeller', 0.15, 1, 2),
  ],
  kahvehane: [e('black_tea', 0.8, 2, 5), e('copper_pot', 0.4), e('peksimet', 0.3, 1, 2)],
  government: [
    e('peksimet', 0.3, 1, 2),
    e('wool_blanket', 0.3),
    e('black_tea', 0.3),
    // ── Faz 11 (11.0): barut, nadir piyade tüfeği ve mermi, çok nadir dürbün (D) ──
    e('gunpowder', 0.12, 1, 3),
    e('rifle', 0.04),
    ammo('rifle_ammo', 0.1),
    e('scope', 0.02),
    // ── Faz 11: D (11.5): çok nadir keskin nişancı tüfeği, tabanca mermisi ──
    e('sniper_rifle', 0.01),
    ammo('pistol_ammo', 0.06),
    // ── Faz 11 sonrası: susturucu ve büyük çanta ──
    e('suppressor', 0.04),
    e('backpack_large', 0.03),
    // ── Battle Royale ile gelen sağlık eşyaları ve çelik yelek (hayatta kalma modunda nadir) ──
    e('first_aid_kit', 0.06),
    e('steel_vest', 0.015),
  ],
  han: [
    e('wool_blanket', 0.5),
    e('copper_pot', 0.4),
    e('bulgur', 0.4, 1, 3),
    e('dry_beans', 0.3, 1, 2),
  ],
  hamam: [e('copper_pot', 0.4), e('wool_blanket', 0.3)],
  mine_tower: [
    e('miner_lamp', 0.7),
    e('peksimet', 0.3, 1, 2),
    // ── Faz 11 (11.0): hurda ve kükürt (B/D) ──
    e('scrap_metal', 0.5, 1, 4),
    e('sulfur', 0.4, 1, 3),
  ],
  factory: [
    e('miner_lamp', 0.2),
    e('peksimet', 0.2),
    e('wool_blanket', 0.2),
    // ── Faz 11 (11.0): hurda, elektronik, pil, pervane (B/F) ──
    e('scrap_metal', 0.6, 2, 5),
    e('electronic_parts', 0.25, 1, 2),
    e('battery', 0.15),
    e('propeller', 0.15, 1, 2),
    // ── Faz 11: D (11.5): fabrikada demir kama ──
    e('iron_dagger', 0.05),
    // ── Battle Royale ile gelen sağlık eşyaları ve çelik yelek (hayatta kalma modunda nadir) ──
    e('bandage', 0.08, 1, 2),
    e('first_aid_kit', 0.03),
  ],
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

/**
 * Girilebilir yapının `index`. kabının ganimeti (deterministik). Yapının tablosu kap sayısının oranında daha cömert
 * zarlanır (`SEARCH.containerChanceScale`: her kap ayrı aranır) ve çıkan eşyalar kaplara dağıtılır: yiyecekler dolaba,
 * diğerleri sandığa (yapıda o tür kap yoksa öbürüne); aynı türden kaplar arasında sırayla. Kaplar birlikte aransa da ayrı
 * ayrı aransa da aynı eşyaları verir.
 */
export function rollContainerLoot(
  building: { id: number; kind: BuildingKind; ruined: boolean },
  index: number,
  seed: number = SEARCH.seed,
): ItemStack[] {
  const containers = BUILDING_SHAPES[building.kind].containers;
  const table = BUILDING_LOOT[building.kind];
  if (!table || index < 0 || index >= containers.length) return [];
  const random = createRandom(seedFrom(seed ^ SEARCH.containerSeedSalt, building.id));
  const scale =
    (building.ruined ? SEARCH.ruinedChanceScale : 1) *
    Math.min(1 + (containers.length - 1) * SEARCH.containerChanceScale, SEARCH.containerChanceMax);
  return distributeLoot(table, random, scale, containers, index);
}

/**
 * Zarlanan satırları kaplara dağıtır: yiyecekler dolaba, diğerleri sandığa (o tür kap yoksa öbürüne); aynı türden kaplar
 * arasında sırayla. `index`. kabın payı döner.
 */
function distributeLoot(
  table: readonly LootEntry[],
  random: ReturnType<typeof createRandom>,
  scale: number,
  containers: readonly InteriorContainer[],
  index: number,
): ItemStack[] {
  const cupboards: number[] = [];
  const chests: number[] = [];
  containers.forEach((c, i) => (c.kind === 'cupboard' ? cupboards : chests).push(i));
  let food = 0;
  let other = 0;
  const out: ItemStack[] = [];
  for (const row of table) {
    const roll = random.next();
    const count = random.int(row.min, row.max);
    if (roll >= Math.min(row.chance * scale, 0.95)) continue;
    const edible = ITEMS[row.item].category === 'food';
    const pool = edible
      ? cupboards.length > 0
        ? cupboards
        : chests
      : chests.length > 0
        ? chests
        : cupboards;
    const k = edible ? food++ : other++;
    if (pool[k % pool.length] === index) out.push({ id: row.item, count });
  }
  return out;
}

/**
 * Katlı yapının üst kat kabının (`upperContainers` içindeki `index`.) ganimeti (deterministik; kullanıcı talimatı: "üst
 * katlarda da eşyalar olsun"). Her kat ayrı bir daire gibi yapının tablosunu kendi tohumuyla zarlar ve o katın kaplarına
 * dağıtır (zemin kattaki gibi). Yıkık yapının üst katı yoktur.
 */
export function rollUpperContainerLoot(
  building: { id: number; kind: BuildingKind; ruined: boolean; floors?: number },
  index: number,
  seed: number = SEARCH.seed,
): ItemStack[] {
  const all = shapeVariant(building.kind, building.floors, building.ruined).upperContainers;
  const table = BUILDING_LOOT[building.kind];
  const target = all[index];
  if (!table || !target) return [];
  const level = target.level ?? 1;
  const floor = all.filter((c) => (c.level ?? 1) === level);
  const random = createRandom(
    seedFrom(seed ^ SEARCH.containerSeedSalt ^ SEARCH.upperFloorSeedSalt, building.id * 16 + level),
  );
  const scale = Math.min(
    1 + (floor.length - 1) * SEARCH.containerChanceScale,
    SEARCH.containerChanceMax,
  );
  return distributeLoot(table, random, scale, floor, floor.indexOf(target));
}
