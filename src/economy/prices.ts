import { AMMO, COMBAT, ECONOMY, RANGED } from '../config';
import { ITEMS, type ItemId } from '../items/itemDefs';

/**
 * Eşya değerleri (₺; saf veri): satıcı eşyayı bu fiyattan satar, geri alırken değerin bir kesrini öder
 * (`ECONOMY.sellRatio` / `offSellRatio`). 0: satılamaz ve alınamaz (tarla gibi eşya olmayan yapılar). Tablo
 * `Record<ItemId, …>` olduğundan yeni eşya eklenirse değeri de yazılmalıdır (yoksa derleme kırılır).
 * Değerler kabaca emeği izler: elle toplanan malzeme kuruşluk, demir/barut/elektronik pahalı, ateşli silahlar en
 * pahalı. Silah/metal zinciri satıcılardan bütünüyle alınamaz (hurda ve demir yalnızca aramayla bulunur).
 */
export const ITEM_VALUES: Readonly<Record<ItemId, number>> = {
  stick: 2,
  stone: 2,
  log: 15,
  bark: 1,
  tinder: 1,
  hazelnut: 2,
  chestnut: 3,
  blackberry: 1,
  mushroom_edible: 4,
  stone_axe: 30,
  water_container_empty: 20,
  water_container_full: 22,
  campfire: 60,
  lean_to: 120,
  raw_meat: 12,
  cooked_meat: 20,
  hide: 25,
  bone: 5,
  stone_spear: 30,
  hide_vest: 80,
  workbench: 120,
  storage_chest: 150,
  wooden_hut: 600,
  bone_knife: 20,
  torch: 12,
  fur_cloak: 180,
  bulgur: 15,
  tarhana: 18,
  dry_beans: 15,
  black_tea: 20,
  pekmez: 30,
  leblebi: 12,
  dried_apricot: 15,
  peksimet: 8,
  bulgur_pilaf: 30,
  tarhana_soup: 30,
  bean_stew: 35,
  brewed_tea: 10,
  copper_pot: 150,
  wool_blanket: 140,
  miner_lamp: 220,
  foundation: 70,
  wall: 45,
  doorway: 40,
  window_wall: 45,
  door: 30,
  roof: 50,
  scrap_metal: 15,
  iron_ingot: 45,
  charcoal: 6,
  sulfur: 10,
  gunpowder: 15,
  electronic_parts: 60,
  battery: 80,
  propeller: 25,
  scope: 400,
  stairs: 75,
  entry_step: 30,
  pillar: 25,
  railing: 15,
  half_wall: 25,
  gable_roof: 75,
  gable_wall: 35,
  forge: 400,
  stone_oven: 250,
  hand_mill: 220,
  drying_rack: 60,
  bedroll: 120,
  solar_panel: 700,
  wood_fence: 10,
  stone_fence: 12,
  fence_gate: 30,
  dried_meat: 25,
  hoe: 40,
  sickle: 80,
  wheat_seed: 1,
  corn_seed: 1,
  potato: 4,
  wheat: 3,
  corn: 3,
  flour: 12,
  corn_flour: 12,
  bread: 15,
  corn_bread: 14,
  baked_potato: 8,
  farm_plot: 0,
  club: 15,
  iron_dagger: 90,
  pala: 180,
  slingshot: 30,
  bow: 120,
  arrow: 4,
  shotgun: 1200,
  pistol: 1500,
  rifle: 2600,
  sniper_rifle: 6000,
  shotgun_shell: 8,
  pistol_ammo: 5,
  rifle_ammo: 10,
  drone: 2500,
  suppressor: 900,
  backpack_small: 120,
  backpack_medium: 350,
  backpack_large: 800,
};

/** Silah, mühimmat ve barut (av bayiinin uzmanlığı). */
export const WEAPON_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>([
  ...(Object.keys(COMBAT.weapons).filter((id) => id !== 'fist' && id !== 'stone_axe') as ItemId[]),
  ...(Object.keys(RANGED.weapons) as ItemId[]),
  ...(Object.keys(AMMO.lootCount) as ItemId[]),
  'gunpowder',
  'suppressor',
  'scope',
]);

/** Eşya alınıp satılabilir mi (değeri var mı)? */
export function isTradable(id: ItemId): boolean {
  return ITEM_VALUES[id] > 0;
}

/** Satıcıdan alış fiyatı (adet başına, ₺). */
export function buyPrice(id: ItemId): number {
  return ITEM_VALUES[id];
}

/**
 * Satıcıya satış fiyatı (adet başına, ₺; aşağı yuvarlı, değeri 2 ₺ ve üstü eşyada en az 1): uzmanlık alanındaysa
 * `ECONOMY.sellRatio`, değilse `offSellRatio`. 1 ₺'lik eşyalar (kabuk, kav, tohum) geri alınmaz (0).
 */
export function sellPrice(id: ItemId, specialty: boolean): number {
  const value = ITEM_VALUES[id];
  if (value <= 1) return 0;
  const ratio = specialty ? ECONOMY.sellRatio : ECONOMY.offSellRatio;
  return Math.max(1, Math.floor(value * ratio));
}

/** Eşyanın kategorisi (satıcı uzmanlık denetimi için kısa yol). */
export function categoryOf(id: ItemId): (typeof ITEMS)[ItemId]['category'] {
  return ITEMS[id].category;
}
