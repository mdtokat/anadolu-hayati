import type { ItemStack } from './Inventory';
import type { ItemId } from './itemDefs';

/** Üretim istasyonları (Faz 9): tarifin yapılması için yakında bulunması gereken yapı (`STATIONS`). */
export const STATION_KINDS = [
  'workbench',
  // ── Faz 11: B (11.2): demirci ocağı (metal, silah, mühimmat), taş fırın (ekmek), el değirmeni (un), kurutma rafı ──
  'forge',
  'stone_oven',
  'hand_mill',
  'drying_rack',
] as const;
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
  // ── Faz 11: A (11.1 modüler inşa II) ──
  'stairs',
  'entry_step',
  'pillar',
  'railing',
  'half_wall',
  'gable_roof',
  'gable_wall',
  // ── Faz 11: B (11.2/11.3 yapılar, çitler; demircide kömür ve külçe) ──
  'forge',
  'stone_oven',
  'hand_mill',
  'drying_rack',
  'bedroll',
  'solar_panel',
  'wood_fence',
  'stone_fence',
  'fence_gate',
  'charcoal',
  'iron_ingot',
  // ── Faz 11: C (11.4 tarım aletleri ve un; ekmek/közleme pişirme zincirindedir) ──
  'hoe',
  'sickle',
  'flour',
  'corn_flour',
  // ── Faz 11: D (11.5 silahlar, mühimmat, barut) ──
  'club',
  'iron_dagger',
  'pala',
  'slingshot',
  'bow',
  'arrow',
  'shotgun',
  'pistol',
  'rifle',
  'sniper_rifle',
  'shotgun_shell',
  'pistol_ammo',
  'rifle_ammo',
  'gunpowder',
  // ── Faz 11: F (11.8 drone) ──
  'drone',
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
  // ── Faz 11 (11.0 yer tutucu malzemeler; sahibi akış tarifini kesinleştirir) ──
  // A (11.1): modüler inşa II parçaları, tezgâh + taş balta.
  stairs: {
    id: 'stairs',
    name: 'Merdiven',
    inputs: [
      { id: 'log', count: 2 },
      { id: 'stick', count: 4 },
      { id: 'bark', count: 2 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'stairs', count: 1 },
  },
  entry_step: {
    id: 'entry_step',
    name: 'Giriş Basamağı',
    inputs: [
      { id: 'log', count: 1 },
      { id: 'stone', count: 2 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'entry_step', count: 1 },
  },
  pillar: {
    id: 'pillar',
    name: 'Direk',
    inputs: [
      { id: 'log', count: 1 },
      { id: 'bark', count: 1 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'pillar', count: 1 },
  },
  railing: {
    id: 'railing',
    name: 'Korkuluk',
    inputs: [
      { id: 'stick', count: 4 },
      { id: 'bark', count: 1 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'railing', count: 1 },
  },
  half_wall: {
    id: 'half_wall',
    name: 'Yarım Duvar',
    inputs: [
      { id: 'log', count: 1 },
      { id: 'stick', count: 1 },
      { id: 'bark', count: 1 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'half_wall', count: 1 },
  },
  gable_roof: {
    id: 'gable_roof',
    name: 'Beşik Çatı',
    inputs: [
      { id: 'log', count: 2 },
      { id: 'stick', count: 4 },
      { id: 'bark', count: 4 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'gable_roof', count: 1 },
  },
  gable_wall: {
    id: 'gable_wall',
    name: 'Alın Duvarı',
    inputs: [
      { id: 'log', count: 1 },
      { id: 'stick', count: 2 },
      { id: 'bark', count: 1 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'gable_wall', count: 1 },
  },
  // B (11.2/11.3): istasyonlar, döşek, güneş paneli, çitler; demirci ocağında kömür ve demir külçe.
  forge: {
    id: 'forge',
    name: 'Demirci Ocağı',
    inputs: [
      { id: 'stone', count: 8 },
      { id: 'log', count: 2 },
      { id: 'scrap_metal', count: 2 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'forge', count: 1 },
  },
  stone_oven: {
    id: 'stone_oven',
    name: 'Taş Fırın',
    inputs: [
      { id: 'stone', count: 10 },
      { id: 'log', count: 1 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'stone_oven', count: 1 },
  },
  hand_mill: {
    id: 'hand_mill',
    name: 'El Değirmeni',
    inputs: [
      { id: 'stone', count: 6 },
      { id: 'log', count: 1 },
      { id: 'stick', count: 2 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'hand_mill', count: 1 },
  },
  drying_rack: {
    id: 'drying_rack',
    name: 'Kurutma Rafı',
    inputs: [
      { id: 'stick', count: 8 },
      { id: 'bark', count: 2 },
      { id: 'tinder', count: 2 },
    ],
    tool: 'stone_axe',
    output: { id: 'drying_rack', count: 1 },
  },
  bedroll: {
    id: 'bedroll',
    name: 'Döşek',
    inputs: [
      { id: 'hide', count: 2 },
      { id: 'bark', count: 4 },
      { id: 'tinder', count: 4 },
    ],
    station: 'workbench',
    output: { id: 'bedroll', count: 1 },
  },
  solar_panel: {
    id: 'solar_panel',
    name: 'Güneş Paneli',
    inputs: [
      { id: 'electronic_parts', count: 3 },
      { id: 'scrap_metal', count: 2 },
      { id: 'iron_ingot', count: 1 },
    ],
    station: 'workbench',
    output: { id: 'solar_panel', count: 1 },
  },
  wood_fence: {
    id: 'wood_fence',
    name: 'Ahşap Çit',
    inputs: [
      { id: 'stick', count: 4 },
      { id: 'bark', count: 1 },
    ],
    tool: 'stone_axe',
    output: { id: 'wood_fence', count: 1 },
  },
  stone_fence: {
    id: 'stone_fence',
    name: 'Kuru Taş Duvar',
    inputs: [{ id: 'stone', count: 6 }],
    output: { id: 'stone_fence', count: 1 },
  },
  fence_gate: {
    id: 'fence_gate',
    name: 'Çit Kapısı',
    inputs: [
      { id: 'stick', count: 5 },
      { id: 'bark', count: 2 },
      { id: 'tinder', count: 1 },
    ],
    tool: 'stone_axe',
    station: 'workbench',
    output: { id: 'fence_gate', count: 1 },
  },
  charcoal: {
    id: 'charcoal',
    name: 'Odun Kömürü',
    inputs: [{ id: 'log', count: 1 }],
    station: 'forge',
    output: { id: 'charcoal', count: 3 },
  },
  iron_ingot: {
    id: 'iron_ingot',
    name: 'Demir Külçe',
    inputs: [
      { id: 'scrap_metal', count: 2 },
      { id: 'charcoal', count: 1 },
    ],
    station: 'forge',
    output: { id: 'iron_ingot', count: 1 },
  },
  // C (11.4): tarım aletleri ve değirmende un.
  hoe: {
    id: 'hoe',
    name: 'Çapa',
    inputs: [
      { id: 'stick', count: 2 },
      { id: 'stone', count: 2 },
      { id: 'tinder', count: 2 },
    ],
    tool: 'stone_axe',
    output: { id: 'hoe', count: 1 },
  },
  sickle: {
    id: 'sickle',
    name: 'Orak',
    inputs: [
      { id: 'iron_ingot', count: 1 },
      { id: 'stick', count: 1 },
    ],
    station: 'forge',
    output: { id: 'sickle', count: 1 },
  },
  flour: {
    id: 'flour',
    name: 'Un',
    inputs: [{ id: 'wheat', count: 3 }],
    station: 'hand_mill',
    output: { id: 'flour', count: 1 },
  },
  corn_flour: {
    id: 'corn_flour',
    name: 'Mısır Unu',
    inputs: [{ id: 'corn', count: 3 }],
    station: 'hand_mill',
    output: { id: 'corn_flour', count: 1 },
  },
  // D (11.5): yakın silahlar, ilkel ve ateşli menzilli silahlar, mühimmat ve barut.
  club: {
    id: 'club',
    name: 'Sopa',
    inputs: [
      { id: 'log', count: 1 },
      { id: 'tinder', count: 1 },
    ],
    tool: 'stone_axe',
    output: { id: 'club', count: 1 },
  },
  iron_dagger: {
    id: 'iron_dagger',
    name: 'Demir Kama',
    inputs: [
      { id: 'iron_ingot', count: 1 },
      { id: 'stick', count: 1 },
    ],
    station: 'forge',
    output: { id: 'iron_dagger', count: 1 },
  },
  pala: {
    id: 'pala',
    name: 'Pala',
    inputs: [
      { id: 'iron_ingot', count: 2 },
      { id: 'stick', count: 1 },
      { id: 'hide', count: 1 },
    ],
    station: 'forge',
    output: { id: 'pala', count: 1 },
  },
  slingshot: {
    id: 'slingshot',
    name: 'Sapan',
    inputs: [
      { id: 'stick', count: 1 },
      { id: 'hide', count: 1 },
    ],
    output: { id: 'slingshot', count: 1 },
  },
  bow: {
    id: 'bow',
    name: 'Yay',
    inputs: [
      { id: 'stick', count: 3 },
      { id: 'hide', count: 1 },
      { id: 'tinder', count: 2 },
    ],
    station: 'workbench',
    output: { id: 'bow', count: 1 },
  },
  arrow: {
    id: 'arrow',
    name: 'Ok',
    inputs: [
      { id: 'stick', count: 2 },
      { id: 'stone', count: 1 },
      { id: 'tinder', count: 1 },
    ],
    station: 'workbench',
    output: { id: 'arrow', count: 5 },
  },
  shotgun: {
    id: 'shotgun',
    name: 'Av Tüfeği',
    inputs: [
      { id: 'iron_ingot', count: 3 },
      { id: 'scrap_metal', count: 2 },
      { id: 'log', count: 1 },
    ],
    station: 'forge',
    output: { id: 'shotgun', count: 1 },
  },
  pistol: {
    id: 'pistol',
    name: 'Tabanca',
    inputs: [
      { id: 'iron_ingot', count: 2 },
      { id: 'scrap_metal', count: 2 },
    ],
    station: 'forge',
    output: { id: 'pistol', count: 1 },
  },
  rifle: {
    id: 'rifle',
    name: 'Piyade Tüfeği',
    inputs: [
      { id: 'iron_ingot', count: 4 },
      { id: 'scrap_metal', count: 3 },
      { id: 'log', count: 1 },
    ],
    station: 'forge',
    output: { id: 'rifle', count: 1 },
  },
  // Keskin nişancı tüfeği dürbün ister (yalnızca ganimetten). Tarif girdileri yalnızca malzemedir (tarif tablosu
  // kuralı), bu yüzden piyade tüfeği girdi değildir; bunun yerine ondan pahalı metal ister.
  sniper_rifle: {
    id: 'sniper_rifle',
    name: 'Keskin Nişancı Tüfeği',
    inputs: [
      { id: 'iron_ingot', count: 5 },
      { id: 'scrap_metal', count: 4 },
      { id: 'scope', count: 1 },
    ],
    station: 'forge',
    output: { id: 'sniper_rifle', count: 1 },
  },
  shotgun_shell: {
    id: 'shotgun_shell',
    name: 'Saçma Fişeği',
    inputs: [
      { id: 'gunpowder', count: 1 },
      { id: 'scrap_metal', count: 1 },
    ],
    station: 'forge',
    output: { id: 'shotgun_shell', count: 4 },
  },
  pistol_ammo: {
    id: 'pistol_ammo',
    name: 'Tabanca Mermisi',
    inputs: [
      { id: 'gunpowder', count: 1 },
      { id: 'scrap_metal', count: 1 },
    ],
    station: 'forge',
    output: { id: 'pistol_ammo', count: 8 },
  },
  rifle_ammo: {
    id: 'rifle_ammo',
    name: 'Tüfek Mermisi',
    inputs: [
      { id: 'gunpowder', count: 1 },
      { id: 'scrap_metal', count: 1 },
    ],
    station: 'forge',
    output: { id: 'rifle_ammo', count: 5 },
  },
  gunpowder: {
    id: 'gunpowder',
    name: 'Barut',
    inputs: [
      { id: 'charcoal', count: 1 },
      { id: 'sulfur', count: 1 },
    ],
    station: 'forge',
    output: { id: 'gunpowder', count: 2 },
  },
  // F (11.8): drone, tezgâhta.
  drone: {
    id: 'drone',
    name: 'Drone',
    inputs: [
      { id: 'electronic_parts', count: 3 },
      { id: 'battery', count: 1 },
      { id: 'propeller', count: 4 },
      { id: 'scrap_metal', count: 2 },
    ],
    station: 'workbench',
    output: { id: 'drone', count: 1 },
  },
};

export const RECIPE_LIST: ReadonlyArray<Recipe> = RECIPE_IDS.map((id) => RECIPES[id]);
