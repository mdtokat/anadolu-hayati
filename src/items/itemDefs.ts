/** Eşya kimlikleri. Liste yalnızca sona eklenir (kayıt dosyaları kimliği yazar). */
export const ITEM_IDS = [
  // malzeme
  'stick',
  'stone',
  'log',
  'bark',
  'tinder',
  // yiyecek
  'hazelnut',
  'chestnut',
  'blackberry',
  'mushroom_edible',
  // aletler (4.5'te üretilir; kimlikler şimdiden tanımlı)
  'stone_axe',
  'water_container_empty',
  'water_container_full',
  // yerleştirilebilir yapılar (4.5'te üretilir, 4.8'de yerleştirilir)
  'campfire',
  'lean_to',
  // av ürünleri ve savaş eşyaları (Faz 5; değerleri 5.8'de Hesap B ayarlar)
  'raw_meat',
  'cooked_meat',
  'hide',
  'bone',
  'stone_spear',
  'hide_vest',
  // Faz 9: inşa (yerleştirilebilir) ve ekipman
  'workbench',
  'storage_chest',
  'wooden_hut',
  'bone_knife',
  'torch',
  'fur_cloak',
  // Faz 10: terk edilmiş evlerde bulunan erzak ve eşyalar (Türk mutfağı ve Batı Karadeniz)
  'bulgur',
  'tarhana',
  'dry_beans',
  'black_tea',
  'pekmez',
  'leblebi',
  'dried_apricot',
  'peksimet',
  'bulgur_pilaf',
  'tarhana_soup',
  'bean_stew',
  'brewed_tea',
  'copper_pot',
  'wool_blanket',
  'miner_lamp',
  // Modüler inşa parçaları (kullanıcı talimatı): ayrı üretilir, sahada monte edilir.
  'foundation',
  'wall',
  'doorway',
  'window_wall',
  'door',
  'roof',
  // ── Faz 11 (11.0) ortak malzeme: demirci, silah ve drone zincirleri; dürbün yalnızca ganimetten çıkar ──
  'scrap_metal',
  'iron_ingot',
  'charcoal',
  'sulfur',
  'gunpowder',
  'electronic_parts',
  'battery',
  'propeller',
  'scope',
  // ── Faz 11: A (11.1 modüler inşa II; üst kat tabanı mevcut `foundation`) ──
  'stairs',
  'entry_step',
  'pillar',
  'railing',
  'half_wall',
  'gable_roof',
  'gable_wall',
  // ── Faz 11: B (11.2 tek parça yapılar + 11.3 çit) ──
  'forge',
  'stone_oven',
  'hand_mill',
  'drying_rack',
  'bedroll',
  'solar_panel',
  'wood_fence',
  'stone_fence',
  'fence_gate',
  'dried_meat',
  // ── Faz 11: C (11.4 ekme biçme; fasulye tohumu mevcut `dry_beans`) ──
  'hoe',
  'sickle',
  'wheat_seed',
  'corn_seed',
  'potato',
  'wheat',
  'corn',
  'flour',
  'corn_flour',
  'bread',
  'corn_bread',
  'baked_potato',
  // Tarla (yapı türü): yapı türü = eşya kimliği kuralı için adını taşır; hiçbir yoldan elde edilmez (çapayla açılır).
  'farm_plot',
  // ── Faz 11: D (11.5 silahlar; sapan mermisi mevcut `stone`) ──
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
  // ── Faz 11: F (11.8 drone) ──
  'drone',
  // ── Faz 11 sonrası: susturucu ve sırt çantaları ──
  'suppressor',
  'backpack_small',
  'backpack_medium',
  'backpack_large',
  // ── Battle Royale (kullanıcı talimatı): sağlık eşyaları ve çelik yelek; hayatta kalma modunda da (nadir) bulunur ──
  'bandage',
  'first_aid_kit',
  'steel_vest',
  // ── Dürbünler (kullanıcı talimatı: 2x/4x/8x/16x; mevcut `scope` 4x dürbündür), yeni silahlar ve harita ──
  'scope_2x',
  'scope_8x',
  'scope_16x',
  'revolver',
  'smg',
  'assault_rifle',
  'marksman_rifle',
  'lmg',
  'crossbow',
  'yatagan',
  'war_axe',
  'gurz',
  'map',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type ItemCategory = 'material' | 'food' | 'tool' | 'placeable';

/** Yenince göstergelere eklenen puanlar (0–100 ölçeğinde). */
export interface EdibleEffect {
  satiety?: number;
  hydration?: number;
  /** Negatif olabilir (çiğ et): can düşer ama yemek tek başına öldürmez. */
  health?: number;
  /** Enerji (Faz 10: demli çay). */
  energy?: number;
}

export interface ItemDef {
  id: ItemId;
  /** Görünen ad (Türkçe). */
  name: string;
  /** Tek adedin ağırlığı (gram, tam sayı). */
  weightG: number;
  /** Bir slottaki en fazla adet (aletler 1). */
  stackMax: number;
  category: ItemCategory;
  edible?: EdibleEffect;
}

/**
 * Eşya tablosu (veri). Tokluk 30 dk'da boşalır (≈ 3,3 puan/dk): bir avuç fındık dakikalar kazandırır,
 * tek başına doyurmaz. Değerler elle denge ayarına açıktır.
 */
export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  stick: { id: 'stick', name: 'Dal', weightG: 300, stackMax: 20, category: 'material' },
  stone: { id: 'stone', name: 'Taş', weightG: 500, stackMax: 10, category: 'material' },
  log: { id: 'log', name: 'Kütük', weightG: 3000, stackMax: 3, category: 'material' },
  bark: { id: 'bark', name: 'Kabuk', weightG: 100, stackMax: 30, category: 'material' },
  tinder: { id: 'tinder', name: 'Kav', weightG: 30, stackMax: 30, category: 'material' },
  hazelnut: {
    id: 'hazelnut',
    name: 'Fındık',
    weightG: 30,
    stackMax: 30,
    category: 'food',
    edible: { satiety: 4 },
  },
  chestnut: {
    id: 'chestnut',
    name: 'Kestane',
    weightG: 50,
    stackMax: 20,
    category: 'food',
    edible: { satiety: 6 },
  },
  blackberry: {
    id: 'blackberry',
    name: 'Böğürtlen',
    weightG: 20,
    stackMax: 30,
    category: 'food',
    edible: { satiety: 3, hydration: 2 },
  },
  mushroom_edible: {
    id: 'mushroom_edible',
    name: 'Yenebilir Mantar',
    weightG: 50,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 5 },
  },
  stone_axe: { id: 'stone_axe', name: 'Taş Balta', weightG: 1500, stackMax: 1, category: 'tool' },
  water_container_empty: {
    id: 'water_container_empty',
    name: 'Boş Su Kabı',
    weightG: 300,
    stackMax: 1,
    category: 'tool',
  },
  water_container_full: {
    id: 'water_container_full',
    name: 'Dolu Su Kabı',
    weightG: 1300,
    stackMax: 1,
    category: 'tool',
  },
  campfire: {
    id: 'campfire',
    name: 'Kamp Ateşi',
    weightG: 4000,
    stackMax: 1,
    category: 'placeable',
  },
  lean_to: { id: 'lean_to', name: 'Sundurma', weightG: 8000, stackMax: 1, category: 'placeable' },
  // Faz 5 (5.8): av ürünleri. Çiğ et az doyurur ve can götürür (risk), ateşte pişen et çok doyurur ve iyileştirir.
  // Yemek canı 1'in altına indirmez (`applyEdible`); çiğ et tek başına öldürmez.
  raw_meat: {
    id: 'raw_meat',
    name: 'Çiğ Et',
    weightG: 500,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 8, health: -6 },
  },
  cooked_meat: {
    id: 'cooked_meat',
    name: 'Pişmiş Et',
    weightG: 400,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 30, health: 4 },
  },
  hide: { id: 'hide', name: 'Deri', weightG: 1500, stackMax: 5, category: 'material' },
  bone: { id: 'bone', name: 'Kemik', weightG: 300, stackMax: 10, category: 'material' },
  stone_spear: {
    id: 'stone_spear',
    name: 'Taş Mızrak',
    weightG: 1200,
    stackMax: 1,
    category: 'tool',
  },
  // Giysi: envanterde bulunması savunma verir (`COMBAT.defense`); ayrı ekipman slotu yok (Fikir Havuzu).
  hide_vest: { id: 'hide_vest', name: 'Deri Yelek', weightG: 1800, stackMax: 1, category: 'tool' },
  // Faz 9: inşa. Kulübe ağırdır (taşıması zor): genellikle tezgâhın yanında üretilip hemen kurulur.
  workbench: {
    id: 'workbench',
    name: 'Çalışma Tezgâhı',
    weightG: 9000,
    stackMax: 1,
    category: 'placeable',
  },
  storage_chest: {
    id: 'storage_chest',
    name: 'Sandık',
    weightG: 8000,
    stackMax: 1,
    category: 'placeable',
  },
  wooden_hut: {
    id: 'wooden_hut',
    name: 'Ahşap Kulübe',
    weightG: 14_000,
    stackMax: 1,
    category: 'placeable',
  },
  // Faz 9: ekipman. Bıçak leşi en hızlı keser; meşale elde tutulunca aydınlatır; pelerin ısıtır ve biraz korur.
  bone_knife: {
    id: 'bone_knife',
    name: 'Kemik Bıçak',
    weightG: 400,
    stackMax: 1,
    category: 'tool',
  },
  torch: { id: 'torch', name: 'Meşale', weightG: 500, stackMax: 1, category: 'tool' },
  fur_cloak: {
    id: 'fur_cloak',
    name: 'Kürk Pelerin',
    weightG: 3000,
    stackMax: 1,
    category: 'tool',
  },
  // Faz 10: kiler erzakı. Bulgur, tarhana, kuru fasulye ve kuru çay çiğ yenmez: bakır tencereyle ateşte pişirilir
  // (`COOK_RECIPES`). Pekmez, leblebi, kuru kayısı ve peksimet olduğu gibi yenir (bozulmaz, hafif).
  bulgur: { id: 'bulgur', name: 'Bulgur', weightG: 500, stackMax: 6, category: 'food' },
  tarhana: { id: 'tarhana', name: 'Tarhana', weightG: 300, stackMax: 6, category: 'food' },
  dry_beans: {
    id: 'dry_beans',
    name: 'Kuru Fasulye',
    weightG: 500,
    stackMax: 6,
    category: 'food',
  },
  black_tea: { id: 'black_tea', name: 'Rize Çayı', weightG: 100, stackMax: 10, category: 'food' },
  pekmez: {
    id: 'pekmez',
    name: 'Pekmez',
    weightG: 400,
    stackMax: 5,
    category: 'food',
    edible: { satiety: 12, health: 2 },
  },
  leblebi: {
    id: 'leblebi',
    name: 'Leblebi',
    weightG: 150,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 6 },
  },
  dried_apricot: {
    id: 'dried_apricot',
    name: 'Kuru Kayısı',
    weightG: 150,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 5, hydration: 1 },
  },
  peksimet: {
    id: 'peksimet',
    name: 'Peksimet',
    weightG: 200,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 10 },
  },
  bulgur_pilaf: {
    id: 'bulgur_pilaf',
    name: 'Bulgur Pilavı',
    weightG: 600,
    stackMax: 4,
    category: 'food',
    edible: { satiety: 28, health: 2 },
  },
  tarhana_soup: {
    id: 'tarhana_soup',
    name: 'Tarhana Çorbası',
    weightG: 600,
    stackMax: 4,
    category: 'food',
    edible: { satiety: 18, hydration: 14, health: 3 },
  },
  bean_stew: {
    id: 'bean_stew',
    name: 'Kuru Fasulye Yemeği',
    weightG: 700,
    stackMax: 4,
    category: 'food',
    edible: { satiety: 32, health: 2 },
  },
  brewed_tea: {
    id: 'brewed_tea',
    name: 'Demli Çay',
    weightG: 250,
    stackMax: 6,
    category: 'food',
    edible: { hydration: 10, energy: 12 },
  },
  copper_pot: {
    id: 'copper_pot',
    name: 'Bakır Tencere',
    weightG: 1500,
    stackMax: 1,
    category: 'tool',
  },
  // Giysi gibi envanterde bulunarak ısıtır (`EQUIPMENT.clothingWarmthC`).
  wool_blanket: {
    id: 'wool_blanket',
    name: 'Yün Battaniye',
    weightG: 2000,
    stackMax: 1,
    category: 'tool',
  },
  // Zonguldak madenlerinden: kısayolda seçiliyken meşale gibi aydınlatır.
  miner_lamp: {
    id: 'miner_lamp',
    name: 'Madenci Lambası',
    weightG: 900,
    stackMax: 1,
    category: 'tool',
  },
  // Modüler inşa parçaları: yerleştirilebilir; bir parça bir slotta (yığınlanmaz), ağır olduğundan taşıma sınırı kısıtlar.
  foundation: {
    id: 'foundation',
    name: 'Taban',
    weightG: 6000,
    stackMax: 4,
    category: 'placeable',
  },
  wall: { id: 'wall', name: 'Duvar', weightG: 4000, stackMax: 6, category: 'placeable' },
  doorway: {
    id: 'doorway',
    name: 'Kapılı Duvar',
    weightG: 3500,
    stackMax: 6,
    category: 'placeable',
  },
  window_wall: {
    id: 'window_wall',
    name: 'Pencereli Duvar',
    weightG: 3500,
    stackMax: 6,
    category: 'placeable',
  },
  door: { id: 'door', name: 'Kapı', weightG: 2000, stackMax: 6, category: 'placeable' },
  roof: { id: 'roof', name: 'Çatı', weightG: 5000, stackMax: 4, category: 'placeable' },
  // ── Faz 11 (11.0) ortak malzeme. Değerler başlangıçtır; sahibi akış (B demirci, D silah, F drone) ayarlar. ──
  scrap_metal: {
    id: 'scrap_metal',
    name: 'Hurda Metal',
    weightG: 800,
    stackMax: 10,
    category: 'material',
  },
  iron_ingot: {
    id: 'iron_ingot',
    name: 'Demir Külçe',
    weightG: 1000,
    stackMax: 10,
    category: 'material',
  },
  charcoal: {
    id: 'charcoal',
    name: 'Odun Kömürü',
    weightG: 200,
    stackMax: 20,
    category: 'material',
  },
  sulfur: { id: 'sulfur', name: 'Kükürt', weightG: 200, stackMax: 20, category: 'material' },
  gunpowder: { id: 'gunpowder', name: 'Barut', weightG: 100, stackMax: 20, category: 'material' },
  electronic_parts: {
    id: 'electronic_parts',
    name: 'Elektronik Parça',
    weightG: 150,
    stackMax: 10,
    category: 'material',
  },
  battery: { id: 'battery', name: 'Pil', weightG: 300, stackMax: 5, category: 'material' },
  propeller: { id: 'propeller', name: 'Pervane', weightG: 100, stackMax: 8, category: 'material' },
  // Dürbün yalnızca ganimetten çıkar (tarifi yok); keskin nişancı tüfeğinin malzemesidir.
  scope: { id: 'scope', name: 'Dürbün (4x)', weightG: 600, stackMax: 1, category: 'material' },
  // ── Faz 11: A (11.1) modüler inşa II parçaları: modüler parçalar gibi yığınlanır, eşya sürdükçe art arda kurulur ──
  stairs: { id: 'stairs', name: 'Merdiven', weightG: 7000, stackMax: 2, category: 'placeable' },
  entry_step: {
    id: 'entry_step',
    name: 'Giriş Basamağı',
    weightG: 3000,
    stackMax: 4,
    category: 'placeable',
  },
  pillar: { id: 'pillar', name: 'Direk', weightG: 2500, stackMax: 6, category: 'placeable' },
  railing: { id: 'railing', name: 'Korkuluk', weightG: 1500, stackMax: 8, category: 'placeable' },
  half_wall: {
    id: 'half_wall',
    name: 'Yarım Duvar',
    weightG: 2500,
    stackMax: 6,
    category: 'placeable',
  },
  gable_roof: {
    id: 'gable_roof',
    name: 'Beşik Çatı',
    weightG: 7000,
    stackMax: 4,
    category: 'placeable',
  },
  gable_wall: {
    id: 'gable_wall',
    name: 'Alın Duvarı',
    weightG: 3000,
    stackMax: 4,
    category: 'placeable',
  },
  // ── Faz 11: B (11.2/11.3) tek parça yapılar, çitler ve kurutulmuş et ──
  forge: {
    id: 'forge',
    name: 'Demirci Ocağı',
    weightG: 15_000,
    stackMax: 1,
    category: 'placeable',
  },
  stone_oven: {
    id: 'stone_oven',
    name: 'Taş Fırın',
    weightG: 12_000,
    stackMax: 1,
    category: 'placeable',
  },
  hand_mill: {
    id: 'hand_mill',
    name: 'El Değirmeni',
    weightG: 9000,
    stackMax: 1,
    category: 'placeable',
  },
  drying_rack: {
    id: 'drying_rack',
    name: 'Kurutma Rafı',
    weightG: 4000,
    stackMax: 1,
    category: 'placeable',
  },
  bedroll: { id: 'bedroll', name: 'Döşek', weightG: 3000, stackMax: 1, category: 'placeable' },
  solar_panel: {
    id: 'solar_panel',
    name: 'Güneş Paneli',
    weightG: 5000,
    stackMax: 1,
    category: 'placeable',
  },
  wood_fence: {
    id: 'wood_fence',
    name: 'Ahşap Çit',
    weightG: 1500,
    stackMax: 12,
    category: 'placeable',
  },
  stone_fence: {
    id: 'stone_fence',
    name: 'Kuru Taş Duvar',
    weightG: 3500,
    stackMax: 8,
    category: 'placeable',
  },
  fence_gate: {
    id: 'fence_gate',
    name: 'Çit Kapısı',
    weightG: 2500,
    stackMax: 4,
    category: 'placeable',
  },
  dried_meat: {
    id: 'dried_meat',
    name: 'Kurutulmuş Et',
    weightG: 250,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 20, health: 1 },
  },
  // ── Faz 11: C (11.4) tarım aletleri, tohumlar, ürünler ve yemekleri ──
  hoe: { id: 'hoe', name: 'Çapa', weightG: 1500, stackMax: 1, category: 'tool' },
  sickle: { id: 'sickle', name: 'Orak', weightG: 800, stackMax: 1, category: 'tool' },
  wheat_seed: {
    id: 'wheat_seed',
    name: 'Buğday Tohumu',
    weightG: 20,
    stackMax: 30,
    category: 'material',
  },
  corn_seed: {
    id: 'corn_seed',
    name: 'Mısır Tohumu',
    weightG: 20,
    stackMax: 30,
    category: 'material',
  },
  // Patates hem tohumdur (ekilir) hem ateşte közlenir (C pişirme satırını ekler); çiğ yenmez.
  potato: { id: 'potato', name: 'Patates', weightG: 200, stackMax: 10, category: 'material' },
  wheat: { id: 'wheat', name: 'Buğday', weightG: 300, stackMax: 20, category: 'material' },
  corn: { id: 'corn', name: 'Mısır', weightG: 300, stackMax: 20, category: 'material' },
  flour: { id: 'flour', name: 'Un', weightG: 500, stackMax: 10, category: 'material' },
  corn_flour: {
    id: 'corn_flour',
    name: 'Mısır Unu',
    weightG: 500,
    stackMax: 10,
    category: 'material',
  },
  bread: {
    id: 'bread',
    name: 'Ekmek',
    weightG: 400,
    stackMax: 6,
    category: 'food',
    edible: { satiety: 25, health: 1 },
  },
  corn_bread: {
    id: 'corn_bread',
    name: 'Mısır Ekmeği',
    weightG: 400,
    stackMax: 6,
    category: 'food',
    edible: { satiety: 22, health: 1 },
  },
  baked_potato: {
    id: 'baked_potato',
    name: 'Közlenmiş Patates',
    weightG: 200,
    stackMax: 10,
    category: 'food',
    edible: { satiety: 12 },
  },
  // Elde edilmez (tarif/ganimet yok): tarla yapısının adı ve türü için (sökülünce eşya dönmez).
  farm_plot: { id: 'farm_plot', name: 'Tarla', weightG: 1000, stackMax: 1, category: 'placeable' },
  // ── Faz 11: D (11.5) silahlar ve mühimmat (sayılar `COMBAT.weapons`/`RANGED`/`AMMO`'da; D kesinleştirir) ──
  club: { id: 'club', name: 'Sopa', weightG: 1200, stackMax: 1, category: 'tool' },
  iron_dagger: {
    id: 'iron_dagger',
    name: 'Demir Kama',
    weightG: 500,
    stackMax: 1,
    category: 'tool',
  },
  pala: { id: 'pala', name: 'Pala', weightG: 1500, stackMax: 1, category: 'tool' },
  slingshot: { id: 'slingshot', name: 'Sapan', weightG: 300, stackMax: 1, category: 'tool' },
  bow: { id: 'bow', name: 'Yay', weightG: 900, stackMax: 1, category: 'tool' },
  arrow: { id: 'arrow', name: 'Ok', weightG: 50, stackMax: 30, category: 'material' },
  shotgun: { id: 'shotgun', name: 'Av Tüfeği', weightG: 3200, stackMax: 1, category: 'tool' },
  pistol: { id: 'pistol', name: 'Tabanca', weightG: 1000, stackMax: 1, category: 'tool' },
  rifle: { id: 'rifle', name: 'Piyade Tüfeği', weightG: 4000, stackMax: 1, category: 'tool' },
  sniper_rifle: {
    id: 'sniper_rifle',
    name: 'Keskin Nişancı Tüfeği',
    weightG: 6000,
    stackMax: 1,
    category: 'tool',
  },
  shotgun_shell: {
    id: 'shotgun_shell',
    name: 'Saçma Fişeği',
    weightG: 40,
    stackMax: 25,
    category: 'material',
  },
  pistol_ammo: {
    id: 'pistol_ammo',
    name: 'Tabanca Mermisi',
    weightG: 12,
    stackMax: 50,
    category: 'material',
  },
  rifle_ammo: {
    id: 'rifle_ammo',
    name: 'Tüfek Mermisi',
    weightG: 25,
    stackMax: 40,
    category: 'material',
  },
  // ── Faz 11: F (11.8) drone: kısayolda seçilip uçurulur; yere inmiş hâli `drone` yapısıdır ──
  drone: { id: 'drone', name: 'Drone', weightG: 1800, stackMax: 1, category: 'tool' },
  // Susturucu: tabancaya ve tüfeklere takılır (envanter → silah seçili → "Susturucu tak"; `items/weaponState.ts`).
  suppressor: {
    id: 'suppressor',
    name: 'Susturucu',
    weightG: 450,
    stackMax: 3,
    category: 'material',
  },
  // Sırt çantaları: envanterdeki en büyük çanta slot ve ağırlık sınırını artırır (`BACKPACKS`, `Inventory`).
  backpack_small: {
    id: 'backpack_small',
    name: 'Küçük Sırt Çantası',
    weightG: 500,
    stackMax: 1,
    category: 'tool',
  },
  backpack_medium: {
    id: 'backpack_medium',
    name: 'Orta Sırt Çantası',
    weightG: 1000,
    stackMax: 1,
    category: 'tool',
  },
  backpack_large: {
    id: 'backpack_large',
    name: 'Büyük Sırt Çantası',
    weightG: 1800,
    stackMax: 1,
    category: 'tool',
  },
  // Battle Royale: sağlık eşyaları süreli kullanılır (`items/medical.ts`, `MEDICAL`); çelik yelek deri yelekle
  // toplanmaz, ikisinden iyisi geçerlidir (`combat/damage.ts`).
  bandage: { id: 'bandage', name: 'Sargı Bezi', weightG: 100, stackMax: 10, category: 'tool' },
  first_aid_kit: {
    id: 'first_aid_kit',
    name: 'İlk Yardım Çantası',
    weightG: 600,
    stackMax: 3,
    category: 'tool',
  },
  steel_vest: {
    id: 'steel_vest',
    name: 'Çelik Yelek',
    weightG: 5000,
    stackMax: 1,
    category: 'tool',
  },
  // Dürbünler: envanterde silah seçiliyken "Dürbün tak" ile takılır (`items/weaponState.ts`, `RANGED.scopes`). Büyütme
  // arttıkça nadirleşir (ganimet tabloları); yalnızca ganimetten çıkar.
  scope_2x: {
    id: 'scope_2x',
    name: 'Dürbün (2x)',
    weightG: 350,
    stackMax: 1,
    category: 'material',
  },
  scope_8x: {
    id: 'scope_8x',
    name: 'Dürbün (8x)',
    weightG: 800,
    stackMax: 1,
    category: 'material',
  },
  scope_16x: {
    id: 'scope_16x',
    name: 'Dürbün (16x)',
    weightG: 1100,
    stackMax: 1,
    category: 'material',
  },
  // Yeni silahlar (sayılar `RANGED.weapons` / `COMBAT.weapons`).
  revolver: { id: 'revolver', name: 'Altıpatlar', weightG: 1200, stackMax: 1, category: 'tool' },
  smg: { id: 'smg', name: 'Hafif Makineli Tüfek', weightG: 3000, stackMax: 1, category: 'tool' },
  assault_rifle: {
    id: 'assault_rifle',
    name: 'Taarruz Tüfeği',
    weightG: 4100,
    stackMax: 1,
    category: 'tool',
  },
  marksman_rifle: {
    id: 'marksman_rifle',
    name: 'Yarı Otomatik Tüfek',
    weightG: 4800,
    stackMax: 1,
    category: 'tool',
  },
  lmg: { id: 'lmg', name: 'Makineli Tüfek', weightG: 9000, stackMax: 1, category: 'tool' },
  crossbow: { id: 'crossbow', name: 'Arbalet', weightG: 3200, stackMax: 1, category: 'tool' },
  yatagan: { id: 'yatagan', name: 'Yatağan', weightG: 1100, stackMax: 1, category: 'tool' },
  war_axe: { id: 'war_axe', name: 'Savaş Baltası', weightG: 2200, stackMax: 1, category: 'tool' },
  gurz: { id: 'gurz', name: 'Gürz', weightG: 2600, stackMax: 1, category: 'tool' },
  // Harita: envanterdeyken mini harita görünür (hayatta kalma; Son Kalan'da harita her zaman verilir).
  map: { id: 'map', name: 'Harita', weightG: 150, stackMax: 1, category: 'tool' },
};

export function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && (ITEM_IDS as readonly string[]).includes(value);
}
