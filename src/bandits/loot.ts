import type { ItemStack } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import type { LootEntry } from '../settlements/loot';
import { createRandom, seedFrom } from '../utils/random';
import type { BanditWeapon } from './kinds';

/**
 * Eşkıya ganimeti (Faz 11, 11.6; veri + saf zar, denge elle ayarlanır): ölü eşkıyanın üstü ve kamp sandığı. Aynı
 * eşkıya/kamp ve dönem her zaman aynı ganimeti verir (deterministik). Silahlar hem üretilir hem buradan çıkar.
 */

const e = (item: ItemId, chance: number, min = 1, max = min): LootEntry => ({
  item,
  chance,
  min,
  max,
});

/** Silahın mühimmatı (ateşli silahlar). */
const AMMO_OF: Partial<Record<BanditWeapon, ItemId>> = {
  pistol: 'pistol_ammo',
  shotgun: 'shotgun_shell',
  rifle: 'rifle_ammo',
  sniper_rifle: 'rifle_ammo',
  revolver: 'pistol_ammo',
  smg: 'pistol_ammo',
  assault_rifle: 'rifle_ammo',
};

/** Eşkıyanın üstünden çıkabilecekler (silahı ve mühimmatı ayrıca). */
export const BANDIT_POCKET: readonly LootEntry[] = [
  e('peksimet', 0.4, 1, 2),
  e('cooked_meat', 0.25, 1, 2),
  e('pekmez', 0.15),
  e('black_tea', 0.2, 1, 2),
  e('scrap_metal', 0.2, 1, 2),
  e('gunpowder', 0.12, 1, 2),
  e('torch', 0.1),
];

/** Kamp sandığı. */
export const CAMP_CHEST: readonly LootEntry[] = [
  e('peksimet', 0.8, 2, 5),
  e('bulgur', 0.5, 1, 3),
  e('pekmez', 0.5, 1, 2),
  e('dried_apricot', 0.4, 2, 4),
  e('cooked_meat', 0.4, 1, 3),
  e('hide', 0.4, 1, 3),
  e('copper_pot', 0.2),
  e('wool_blanket', 0.3),
  e('scrap_metal', 0.5, 1, 4),
  e('gunpowder', 0.35, 1, 3),
  e('sulfur', 0.2, 1, 2),
  e('pistol_ammo', 0.35, 4, 12),
  e('shotgun_shell', 0.35, 2, 8),
  e('rifle_ammo', 0.3, 3, 8),
  e('pistol', 0.15),
  e('shotgun', 0.1),
  e('rifle', 0.07),
  e('pala', 0.15),
  e('scope', 0.08),
  // Faz 11 sonrası: eşkıya zulasında susturucu ve sırt çantası.
  e('suppressor', 0.12),
  e('backpack_medium', 0.1),
  // Dürbünler (büyüdükçe nadir), yeni silahlar ve harita (sonuna: eski zarlar kaymaz).
  e('scope_2x', 0.14),
  e('scope_8x', 0.03),
  e('scope_16x', 0.01),
  e('revolver', 0.08),
  e('smg', 0.05),
  e('assault_rifle', 0.035),
  e('crossbow', 0.05),
  e('yatagan', 0.08),
  e('war_axe', 0.06),
  e('gurz', 0.05),
  e('map', 0.12),
];

/** Silahın üstten çıkma olasılığı (kalanında kırık/kaybolmuş sayılır). */
const WEAPON_DROP_CHANCE = 0.75;

function roll(table: readonly LootEntry[], seed: number): ItemStack[] {
  const random = createRandom(seed);
  const out: ItemStack[] = [];
  for (const row of table) {
    const r = random.next();
    const count = random.int(row.min, row.max);
    if (r < row.chance) out.push({ id: row.item, count });
  }
  return out;
}

/** Ölü eşkıyanın üstü: silahı (çoğunlukla), ateşli silahsa mühimmatı ve cep eşyaları. */
export function rollBanditLoot(banditId: number, weapon: BanditWeapon, seed: number): ItemStack[] {
  const random = createRandom(seedFrom(seed, banditId, 7));
  const out: ItemStack[] = [];
  if (random.next() < WEAPON_DROP_CHANCE) out.push({ id: weapon, count: 1 });
  const ammo = AMMO_OF[weapon];
  if (ammo) out.push({ id: ammo, count: random.int(2, 8) });
  out.push(...roll(BANDIT_POCKET, seedFrom(seed, banditId, 8)));
  return out;
}

/** Kamp sandığının içeriği (`epoch`: kamp yeniden dolunca artar, yeni içerik). */
export function rollCampChest(campId: number, epoch: number, seed: number): ItemStack[] {
  return roll(CAMP_CHEST, seedFrom(seed, campId, epoch, 9));
}
