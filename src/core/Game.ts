import {
  WEATHER_LABELS,
  weatherAt,
  weatherCoolingC,
  weatherHours,
  type WeatherKind,
  type WeatherState,
} from '../survival/weather';
import { isBackpack } from '../items/backpack';
import { PerspectiveCamera, PointLight, Vector2, WebGLRenderer, type Camera } from 'three';
import {
  BANDITS,
  BATTLE_ROYALE,
  REGION_PLAYER,
  SPAWN_SEARCH,
  GANGS,
  COMBAT,
  DRONE,
  COMBAT_HUD,
  PEOPLE,
  AMBIENT,
  CLOCK,
  COMBAT_FX,
  DISMANTLE,
  DRYING,
  ECONOMY,
  EQUIPMENT,
  HINTS,
  INPUT,
  INTERACT,
  PROVINCE_NOTICE,
  PILOT,
  PROVINCE_PLACES,
  PLACE_NOTICE,
  QUALITY_PRESETS,
  RENDER,
  SAVE,
  SEARCH,
  STORAGE,
  PLAYER,
  SURVIVAL,
  SURVIVAL_HUD,
  TELEPORTS,
  VENDORS,
  VERTICAL_SCALE,
  WORLD,
} from '../config';
import { CarcassButcher, pickCarcass } from '../combat/carcass';
import { defenseFor } from '../combat/damage';
import { CombatSystem } from '../combat/CombatSystem';
import { CookingSystem } from '../combat/cooking';
import { BuildingSearch, searchPrompt, searchTarget, searchedToast } from '../settlements/search';
import { Wallet, formatMoney } from '../economy/wallet';
import {
  Property,
  homeSpawnPoint,
  propertyName,
  propertyPrice,
  propertyTarget,
  resalePrice,
  roomContains,
  type SettlementRank,
} from '../economy/property';
import { buyItem, sellSlot, shopFailureText, type ShopDeps } from '../economy/shop';
import { placeVendors, vendorFacing, type Vendor } from '../economy/vendors';
import { buyPrice } from '../economy/prices';
import { ShopPanel } from '../ui/ShopPanel';
import type { PlaceBuilding } from '../placement/placeRules';
import type { Building } from '../settlements/layout';
import { worldToBuildingLocal } from '../settlements/SettlementMap';
import { PrayerTracker, prayerPrompt, prayerWindow } from '../survival/prayer';
import { PeopleSystem, personInView, type Person, type PeopleWorld } from '../people/PeopleSystem';
import { GREETINGS, ROLES } from '../people/roles';
import { directionsAnswer, executeTrade, tradeText } from '../people/dialog';
import { PeopleLayer } from '../world/PeopleLayer';
import { DialogPanel, type DialogOption } from '../ui/DialogPanel';
import type { MeleeAim } from '../combat/melee';
import { updateInteractions } from '../combat/interactChain';
import {
  butcherPrompt,
  butcheredToast,
  cookedToast,
  cookPrompt,
  unbutcherablePrompt,
} from '../combat/promptText';
import { isButcherable } from '../combat/loot';
import { CreatureSystem } from '../creatures/CreatureSystem';
import type {
  CreatureContext,
  CreatureKind,
  CreatureState,
  CreatureView,
} from '../creatures/kinds';
import { playerWeakness } from '../creatures/perception';
import { loadWorld } from '../data/world';
import { loadWorldStream } from '../data/worldStreamLoader';
import { pickFocus, lookDirection } from '../interaction/focus';
import { GatherSystem } from '../interaction/gather';
import { collectedToast, gatherPrompt } from '../interaction/promptText';
import { craft } from '../items/craft';
import { isDrink } from '../items/consume';
import { eatItem, quickEat } from '../items/eatItem';
import { clothingWarmth, torchLit } from '../items/equipment';
import { Hotbar, hotbarUse } from '../items/hotbar';
import { Inventory } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import { ContainerFiller, drinkFromContainer } from '../items/waterContainer';
import {
  STORAGE_KINDS,
  isLit,
  isStructureKind,
  type Structure,
  type StructureId,
  type StructureKind,
} from '../placement/structures';
import { Dismantler } from '../placement/dismantle';
import { StructureObstacles } from '../placement/obstacles';
import { rackOffer, useRack } from '../placement/rack';
import { bedAt } from '../placement/beds';
import { stationsNear } from '../placement/stations';
import { isPieceKind, isPlateKind } from '../placement/pieces';
import { transferAll, transferSlot } from '../placement/storage';
import { structureInView, type FocusPose } from '../placement/structureFocus';
import { PlacementController } from '../placement/PlacementController';
import {
  aimPrompt,
  dismantlePrompt,
  dismantledToast,
  fuelToast,
  keyLabel,
  placeFailureText,
  placedToast,
  doorPrompt,
  rackPrompt,
  storagePrompt,
  structureHint,
  tendPrompt,
  toggleToast,
} from '../placement/promptText';
import { exposureAt, NO_EXPOSURE, type Exposure } from '../placement/exposure';
import { StructureSystem } from '../placement/StructureSystem';
import { FireTender } from '../placement/tend';
import { ITEMS } from '../items/itemDefs';
import { RECIPES, type RecipeId } from '../items/recipes';
import { initPhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { Player } from '../player/Player';
import { PlayerCamera } from '../player/PlayerCamera';
import { PlayerModel } from '../player/PlayerModel';
import { activityFromIntent, gateIntent } from '../survival/activity';
import { formatClock } from '../survival/clock';
import {
  PRAYER_NAMES,
  formatGameDate,
  nextPrayer,
  prayerTimes,
  prayersBetween,
} from '../survival/islamicTime';
import { SurvivalSystem } from '../survival/SurvivalSystem';
import { canSprint, type Activity } from '../survival/vitals';
import { DeathScreen } from '../ui/DeathScreen';
import { FpsCounter } from '../ui/FpsCounter';
import { attackPrompt, hitMarkerKind, noticedToast, vignetteStrength } from '../ui/combatFormat';
import { Hud } from '../ui/Hud';
import { InventoryPanel } from '../ui/InventoryPanel';
import { StoragePanel } from '../ui/StoragePanel';
import { HeldItem } from '../player/HeldItem';
import { isFirearm, swingStyle } from '../player/heldKinds';
import { CombatEffects } from '../world/CombatEffects';
import { LootPanel } from '../ui/LootPanel';
import { takeAllStacks, takeStack } from '../items/lootTransfer';
import { heldLabel, hotbarSignature, hotbarViews, unusableHotbarText } from '../ui/hotbarView';
import { formatDebugInfo, formatLocation } from '../ui/hudFormat';
import { formatDay } from '../ui/survivalFormat';
import { GameMenu } from '../ui/GameMenu';
import { ControlsPanel } from '../ui/ControlsPanel';
import type { SuppressorState } from '../ui/InventoryPanel';
import { CreditsPanel } from '../ui/CreditsPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { createSettingsStore, type SettingsStore } from '../settings/SettingsStore';
import type { Settings } from '../settings/settings';
import { AmbientAudio } from '../audio/AmbientAudio';
import { ambientMix } from '../audio/ambientMix';
import { Autosaver } from '../save/Autosaver';
import { createNewGameSave } from '../save/newGame';
import { pixelRatioFor, ResolutionGovernor } from './resolution';
import { PerfStats } from './perfStats';
import { PerfOverlay } from '../ui/PerfOverlay';
import type { PerfViewInput } from '../ui/perfView';
import { createBackend } from '../save/backends';
import { applySave, captureSave, type SaveTargets } from '../save/gameState';
import { SaveError, type SaveGame, type SaveSummary } from '../save/saveGame';
import { AUTO_SLOT, SaveStore, type SlotId } from '../save/SaveStore';
import {
  HINT_TEXT,
  HintTracker,
  browserHintStorage,
  readSeenHints,
  writeSeenHints,
  type HintContext,
} from '../hints/hints';
import { PlaceTracker } from '../world/placeNotice';
import { ProvinceTracker, provinceNoticeText } from '../world/provinceNotice';
import { CreatureLayer } from '../world/CreatureLayer';
import { demoViews } from '../world/creatureDemo';
import type { GameWorld } from '../world/GameWorld';
import { ProceduralHeightSource } from '../world/ProceduralHeightSource';
import { RegionWorld } from '../world/RegionWorld';
import { StructureColliders } from '../world/StructureColliders';
import { StructureLayer } from '../world/StructureLayer';
import { TestScene } from '../world/TestScene';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { GameLoop } from './GameLoop';
import { Input } from './Input';
import { DEV_TELEPORT_KEY, teleportSlotForKey } from './inputMapping';
import { createRandom, seedFrom } from '../utils/random';
import {
  CREATURE_TARGET_PREFIX,
  TargetRegistry,
  creatureTargetProvider,
  playerTargetProvider,
} from '../combat/targets';
import { BanditSystem } from '../bandits/BanditSystem';
import { BrSession } from '../battleRoyale/BrSession';
import { lootSpotsOf } from '../battleRoyale/farSim';
import type { BrSetup } from '../battleRoyale/kinds';
import { rollBuildingBrLoot } from '../battleRoyale/loot';
import { MedicalUse, isMedical } from '../items/medical';
import { campSiteQuery, placeCamps } from '../bandits/camps';
import { placeGangSites } from '../bandits/gangs';
import { SURRENDER_TEXT, WARNING_QUESTION, banditWarning, campAnswer } from '../bandits/dialog';
import { banditInView, inView } from '../bandits/interact';
import { PickpocketSystem, type PickpocketWorld } from '../bandits/pickpocket';
import { BanditLayer } from '../world/BanditLayer';
import { DroneSystem } from '../drone/DroneSystem';
import { NO_INPUT, rangeOf, type DroneInput } from '../drone/flight';
import { bearingTo, type MarkCandidate } from '../drone/marks';
import { nearPanel, solarRate } from '../drone/charge';
import { DroneLayer } from '../world/DroneLayer';
import { DroneHud } from '../ui/DroneHud';
import { batteryPercent } from '../ui/droneFormat';
import { rayTerrain } from '../combat/ranged';
import {
  BUILDING_NAMES,
  BUILDING_SHAPES,
  indoorCeiling,
  isMosque,
  shapeVariant,
} from '../settlements/kinds';
import type { BuildingInterior } from '../settlements/SettlementMap';
import { CREATURE_NAMES } from '../combat/promptText';
import { CampColliders } from '../world/CampColliders';
import { campSolidBoxes } from '../world/campGeometry';
import { walkBoxBlocks, yawBox, type WalkBox } from '../world/walkSolids';
import { darknessOf } from '../creatures/perception';
import type { ItemStack } from '../items/Inventory';
import type { PersonRole } from '../people/roles';
import {
  WEAPON_IDS,
  WeaponState,
  canSuppress,
  isWeaponId,
  type WeaponId,
} from '../items/weaponState';
import { resolveContextAction } from './inputMapping';
// ── Faz 11: D (11.5 silahlar) ──
import { CAMERA, STREAMING } from '../config';
import { RangedSystem, aimCamera, type FireResult } from '../combat/RangedSystem';
import { ammoOf } from '../combat/ammo';
import type { PaneQuery, SolidQuery } from '../combat/ballistics';
import { shotPanes, shotSolids } from '../combat/shotSolids';
import type { MoveIntent } from './inputMapping';
import { GunshotAudio } from '../audio/gunshot';
import { RangedHud } from '../ui/RangedHud';
import { TracerLayer } from '../world/TracerLayer';

/** Hangi dünyanın oynanacağı: gerçek bölge ya da Faz 1 test arenası (`?world=test`). */
export type WorldKind = 'region' | 'test';

export interface GameOptions {
  world?: WorldKind;
  /** Yalnızca dev: canlı simülasyonu yerine sahte canlı demosu çizilir (`?creatures=demo`; görsel doğrulama). */
  creatureDemo?: boolean;
  /** Kullanıcı ayarları deposu; verilmezse tarayıcının `localStorage`'ı kullanılır (testte sahte verilir). */
  settings?: SettingsStore;
}

/** Konum HUD'unun güncelleme aralığı (ms). */
const LOCATION_HUD_INTERVAL_MS = 250;
/** Pilot ilin başlangıç bakış yönü (radyan): yeni oyunda ve açılış menüsü arka planında. */
/** Tarayıcı rastgeleliğinden 31 bitlik tam sayı (yeni oyun tohumu için; deterministik olmamalı). */
const randomSeedInt = (): number => Math.floor(Math.random() * 2 ** 31);

/** Kapıya `E` ile açılıp kapanma menzili: kapı yarıçapının kenarına en çok bu kadar (oyun m). */
const DOOR_REACH = 2.5;

const PILOT_START_YAW = (PILOT.start.yawDeg * Math.PI) / 180;

/** Faz 11 dev tuşu eşyaları (yalnızca dev modu; ağırlık sınırı kadar verilir). */
const FAZ11_DEV_STRUCTURES: readonly ItemId[] = [
  'stairs',
  'entry_step',
  'pillar',
  'railing',
  'half_wall',
  'gable_roof',
  'gable_wall',
  'forge',
  'stone_oven',
  'hand_mill',
  'drying_rack',
  'bedroll',
  'solar_panel',
  'wood_fence',
  'stone_fence',
  'fence_gate',
];
const FAZ11_DEV_WEAPONS: ReadonlyArray<readonly [ItemId, number]> = [
  ['pistol', 1],
  ['pistol_ammo', 24],
  ['rifle', 1],
  ['rifle_ammo', 20],
  ['shotgun_shell', 10],
  ['bow', 1],
  ['arrow', 15],
  ['pala', 1],
  // D (11.5): av tüfeği, keskin nişancı, sapan (taşla).
  ['shotgun', 1],
  ['sniper_rifle', 1],
  ['slingshot', 1],
  // Faz 11 sonrası: susturucu ve büyük sırt çantası (önce çanta: diğerleri sığsın).
  ['suppressor', 2],
];
const FAZ11_DEV_FARMING: ReadonlyArray<readonly [ItemId, number]> = [
  ['hoe', 1],
  ['sickle', 1],
  ['wheat_seed', 10],
  ['corn_seed', 10],
  ['potato', 5],
  ['dry_beans', 4],
];
const FAZ11_DEV_DRONE: ReadonlyArray<readonly [ItemId, number]> = [
  ['drone', 1],
  ['battery', 2],
];

/** Faz 11 (D): boş tetik bildirimi, silah başına ("Mühimmat yok: Tüfek Mermisi"). */
const RANGED_AMMO_NAMES: Partial<Record<string, string>> = Object.fromEntries(
  WEAPON_IDS.map((w) => [w, `Mühimmat yok: ${ITEMS[ammoOf(w)].name}`]),
);

/** Söner bir ateş oyuncuya bu uzaklıkta (oyun m) ya da daha yakındaysa bildirilir. */
const EXTINGUISH_NOTICE_RADIUS = 40;

/** Dolu çanta çıkarılamaz: içindekiler çantasız sınıra sığmalı. */
const BACKPACK_FULL_TOAST = 'Çanta dolu: önce içindeki eşyaları boşalt';

/** Av ipucunu tetikleyen türler (eti yenen ya da yaygın av). */
const PREY_KINDS: ReadonlySet<CreatureKind> = new Set([
  'roe_deer',
  'wild_boar',
  'red_deer',
  'hare',
  'pheasant',
]);

/** Dünya verisi: akışlı (bake edilmiş) dünya varsa o, yoksa ya da bozuksa tüm dünyayı belleğe alan eski yol. */
async function loadRegionData() {
  try {
    const streamed = await loadWorldStream(WORLD.id);
    if (streamed) return streamed;
  } catch (error) {
    console.warn('Akışlı dünya yüklenemedi; tam bellek yoluna dönülüyor.', error);
  }
  return loadWorld(WORLD.id);
}

/** Oyunun kök nesnesi: renderer, fizik, dünya, oyuncu ve sabit adımlı döngüyü bir araya getirir. */
/** Battle Royale başlangıç/sandık/bölge merkezi için en dik eğim (oyun derecesi). */
const BATTLE_ROYALE_OPEN_SLOPE = 40;
/** Son bölge dairelerinin merkezi camiden bu kadar (oyun m) uzak olmalı. */
const BATTLE_ROYALE_MOSQUE_CLEARANCE = 15;

export class Game {
  readonly events = new EventBus<GameEvents>();
  /** Hayatta kalma durumu: saat, iklim, göstergeler (saf mantık; dev araçları da okur). */
  readonly survival = new SurvivalSystem(this.events);
  /** Oyuncunun envanteri (arayüzü 4.7'de; şimdilik toplama bildirimleri ve dev erişimi). */
  readonly inventory = new Inventory({ backpacks: true });
  /** Bakılan nesneye `E` ile toplama (saf mantık). */
  readonly gather = new GatherSystem(this.events, this.inventory);
  /** Yerleştirilmiş yapılar (kamp ateşi, sundurma) ve ateş yakıtı (saf mantık). */
  readonly structureSystem = new StructureSystem(this.events);
  /** Yakındaki ateşe `E` ile yakıt atma (saf mantık). */
  readonly fireTender = new FireTender(
    this.events,
    this.inventory,
    this.structureSystem.structures,
  );
  /** Tatlı su kenarında `E` ile boş su kabını doldurma (saf mantık). */
  readonly filler = new ContainerFiller(this.events, this.inventory);
  /** Yapı yerleştirme: hayalet ve onay (saf mantık). */
  readonly placement: PlacementController;
  /** Canlıların simülasyonu (saf mantık; Faz 5, Hesap A). */
  readonly creatures = new CreatureSystem(this.events);
  /** Hızlı erişim (kısayol) çubuğu: seçili slot elde tutulan eşyadır (saf mantık; Faz 9). */
  readonly hotbar = new Hotbar();
  /** Oyuncu tarafı savaş ve av mantığı (saf mantık; Faz 5, Hesap B). Eldeki silah kısayoldan okunur (Faz 9). */
  readonly combat = new CombatSystem(
    this.events,
    this.inventory,
    this.creatures,
    this.survival,
    () => this.hotbar.selectedItem,
  );
  /** Bakılan yapıya `X` ile sökme (saf mantık; Faz 9). */
  readonly dismantler = new Dismantler(
    this.events,
    this.inventory,
    this.structureSystem.structures,
  );

  /** Bakılan leşe `E` ile kesme (saf mantık; Faz 5, Hesap B). */
  readonly butcher = new CarcassButcher(this.events, this.inventory, this.creatures);
  /** Yanık ateşin yanında `E` ile et pişirme (saf mantık; Faz 5, Hesap B). */
  readonly cooking = new CookingSystem(
    this.events,
    this.inventory,
    this.structureSystem.structures,
  );
  /** Cüzdan (alışveriş; kayıtta `economy.money`). */
  readonly wallet = new Wallet(ECONOMY.startMoney);
  /** Tapusu alınan yerleşim yapıları (kayıtta `economy.owned`). */
  readonly property = new Property();
  /** Terk edilmiş yapıları arama (Faz 10); bulunan para cüzdana eklenir. */
  readonly search = new BuildingSearch(this.events, this.inventory, this.wallet);
  /** Camide vakit namazı: sağlık kazancı, vakit başına bir kez (kayıtta `settlements.lastPrayer`). */
  readonly prayer = new PrayerTracker(
    (amount) => this.survival.consume({ health: amount }),
    (window, health) => this.events.emit('player:prayed', { prayer: window.name, health }),
  );
  // ── Faz 11 ortak (11.0) ──
  /** Menzilli atışın vurabileceği hedefler: canlılar ve oyuncu (11.0); eşkıyalar (E) ve drone (F) eklenir. */
  readonly targets = new TargetRegistry();
  /** Şarjörlü silahların durumu (D doldurur/boşaltır; kayıtta `weapons`). */
  readonly weapons = new WeaponState();
  /** Eşkıyalar ve yankesiciler açık mı (Ayarlar, `Settings.bandits`; E okur)? */
  private banditsEnabled = true;
  // ── Faz 11: D (11.5 silahlar) ──
  /** Menzilli silahlar: nişan, atış, doldurma (saf mantık). */
  readonly ranged = new RangedSystem(this.events, this.inventory, this.weapons, this.survival);
  private rangedHud: RangedHud | null = null;
  private gunAudio: GunshotAudio | null = null;
  private tracers: TracerLayer | null = null;
  private shotSolidQuery: SolidQuery | null = null;
  /** Kırılabilir pencere camları (yerleşim binaları). */
  private shotPaneQuery: PaneQuery | null = null;
  /** Oyuncu bir caminin içinde mi (kutsal, güvenli alan; Faz 10)? */
  private inSanctuary = false;
  /** Oyuncunun içinde bulunduğu girilebilir yapı (yoksa null; her adım güncellenir). */
  private interior: BuildingInterior | null = null;
  /** Namaz vakitleri (bölgenin enlemi ve yılın günü sabit) ve son bildirilen saat. */
  private readonly prayerTimes = prayerTimes(CLOCK.latitudeDeg, CLOCK.dayOfYear);
  private lastPrayerHour: number | null = null;
  /** Bu adımda bakılan leş (ipucu için). */
  private carcassTarget: CreatureView | null = null;
  /** Diğer insanlar (Faz 10): çok nadir, barışçıl. */
  readonly people = new PeopleSystem(this.events);
  private readonly peopleLayer = new PeopleLayer();
  private readonly dialogPanel: DialogPanel;
  /** Konuşulan kişi (panel açıkken). */
  private talkingTo: Person | null = null;
  /** Bu adımda bakılan, konuşulabilecek kişi. */
  private personTarget: Person | null = null;
  /** Satıcılar (il/ilçe dükkânları; ilk sorguda yerleşim düzeninden türetilir, kayda girmez). */
  private vendors: Vendor[] | null = null;
  /** Satıcıların kişi görüntüleri (çizim ve `E` hedefi; kimlik → kişi). */
  private readonly vendorPeople = new Map<number, Person>();
  /** Oyuncuya yakın satıcılar (her adım güncellenir). */
  private nearbyVendors: Person[] = [];
  /** Dükkân paneli ve açık dükkânın satıcısı. */
  private readonly shopPanel: ShopPanel;
  private shopVendor: Vendor | null = null;
  /** Bakılan, tapusu alınabilecek (ya da sahip olunan) yapı ve fiyat önbelleği. */
  private propertyFocus: Building | null = null;
  private propertyInfo: {
    id: number;
    price: number | null;
    town: string | null;
    rank: SettlementRank;
  } | null = null;
  /** Açık tapu konuşmasının yapısı (konuşma paneli). */
  private propertyDialogId: number | null = null;

  private readonly renderer: WebGLRenderer;
  private readonly world: GameWorld;
  private readonly player: Player;
  private readonly playerCamera: PlayerCamera;
  private readonly playerModel = new PlayerModel();
  /** Eldeki eşyanın görünümü (birinci şahıs viewmodel + üçüncü şahıs eli) ve savaş efektleri (ağız alevi, savurma izi). */
  private readonly heldItem = new HeldItem(this.playerModel);
  private readonly effects = new CombatEffects();
  private lastHeldNow = 0;
  /** Performans ölçümü (kare süreleri, bölümler, takılma dökümü) ve göstergesi (`F3`). */
  private readonly perf = new PerfStats();
  private readonly perfOverlay: PerfOverlay;
  /** Uyarlanır çözünürlük (Ayarlar → "Otomatik çözünürlük"): kare süresine göre piksel oranı ölçeği. */
  private readonly resolution = new ResolutionGovernor();
  private adaptiveResolution = true;
  /** Kalite ön ayarının piksel oranı üst sınırı. */
  private presetMaxPixelRatio: number = RENDER.maxPixelRatio;
  /** Son çizim karesinin zamanı (ms; kare süresi ölçümü). */
  private lastFrameAt: number | null = null;
  private readonly structureLayer: StructureLayer;
  /** Katı yapıların (sandık, tezgâh, kulübe duvarları) fizik collider'ları (Faz 9). */
  private readonly structureColliders: StructureColliders;
  /** Elde meşale ışığı (Faz 9): sahnede hep vardır (ışık sayısı sabit; shader yeniden derlenmez), sönükken 0. */
  private readonly torchLight = new PointLight(
    EQUIPMENT.torch.lightColor,
    0,
    EQUIPMENT.torch.distance,
    2,
  );
  private readonly creatureLayer: CreatureLayer;
  private readonly input: Input;
  private readonly loop: GameLoop;
  private readonly fps: FpsCounter | null;
  private readonly hud: Hud;
  private readonly pauseMenu: GameMenu;
  private readonly settingsPanel: SettingsPanel;
  private readonly creditsPanel: CreditsPanel;
  private readonly controlsPanel: ControlsPanel;
  private readonly deathScreen: DeathScreen;
  private readonly inventoryPanel: InventoryPanel;
  private readonly storagePanel: StoragePanel;
  private readonly lootPanel: LootPanel;
  /** Ganimet paneli açıkken kaynağı: değiştirilebilir liste ve alınanlar bildirilince çağrılan geri çağrı. */
  private lootSession: {
    items: ItemStack[];
    taken(taken: readonly ItemStack[]): void;
  } | null = null;
  /** Envanter paneli açık: oyun duraklı (fare serbest) ama duraklatma menüsü çıkmaz. */
  private inventoryOpen = false;
  /** Açık sandığın kimliği (Faz 9; sandık paneli açıkken oyun envanterdeki gibi duraklıdır). */
  private storageOpenId: StructureId | null = null;
  /** Bu adımda `E` ile açılabilecek sandık (ipucu ve su içme engeli için). */
  private storageTarget: Readonly<Structure> | null = null;
  /** Bu adımda bakılan (sökülebilecek) yapı. */
  private dismantleTarget: Readonly<Structure> | null = null;
  /** Bakılan kapı (modüler parça) ya da çit kapısı: `E` basışında açılır/kapanır. */
  private doorTarget: Readonly<Structure> | null = null;
  /** Bakılan kurutma rafı (Faz 11, 11.2): `E` basışında çiğ et asılır / kurutulmuş et alınır. */
  private rackTarget: Readonly<Structure> | null = null;
  /** Oyuncu yapılarının engel dizini (Faz 11, 11.3): canlılar, insanlar ve eşkıyalar çitlerden/duvarlardan geçmez. */
  private obstacles: StructureObstacles | null = null;
  /** `peopleWorld` + engel dizini (yapı kümesi/dünya değişmedikçe aynı nesne). */
  private peopleWorldGuarded: { base: PeopleWorld; guarded: PeopleWorld } | null = null;
  /** Kısayoldan açılan yerleştirme: yapı türü ve slotu (hayalet kapanınca seçim de kalkar). */
  private heldPlacement: { kind: StructureKind; slot: number } | null = null;
  /** Test modu (Ayarlar): uçma, sınırsız malzeme (`TEST_MODE`). */
  private testMode = false;
  /** Battle Royale maçı (yoksa hayatta kalma modu). */
  private br: BrSession | null = null;
  /** Maçtan önceki hayatta kalma durumu (maçtan çıkınca geri yüklenir; kayda girmez). */
  private brSnapshot: SaveGame | null = null;
  /** Süren sağlık eşyası kullanımı (sargı bezi, ilk yardım çantası). */
  private readonly medical = new MedicalUse(this.inventory);
  private lastHotbarSignature = '';
  private lockFallback: ReturnType<typeof setTimeout> | null = null;
  private readonly offs: Array<() => void> = [];
  private readonly onResize = (): void => this.resize();
  /** Yuvalı kayıt deposu (IndexedDB; yoksa bellek). Menüler yuva listesini buradan okur. */
  readonly saves: SaveStore;
  private readonly autosaver = new Autosaver(SAVE.autosaveIntervalSeconds, () => {
    void this.autosave();
  });
  /** Oyuna girildi mi (fare kilidi en az bir kez alındı)? Girilmeden otomatik kayıt yazılmaz: ana menüdeki taze durum mevcut kaydın üstüne yazılmasın. */
  private sessionActive = false;
  private autosaving = false;
  private autosaveFailed = false;
  /** Sekme gizlenirken (kapanış, sekme değişimi) otomatik kayıt: kapanışta kaybolan ilerleme olmasın. */
  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') void this.autosave();
  };
  private demoAnchor: { x: number; z: number } | null = null;
  private lastDangerToast = -Infinity;
  private lastLocationUpdate = -Infinity;
  /** İl sınırı geçişi bildirimi (yükleme/yeni oyunda sıfırlanır: ilk il sessizce kabul edilir). */
  /** İlk dakikalar için ipuçları (8.5): görülenler `localStorage`'da kalıcıdır, Yeni Oyun sıfırlar. */
  private readonly hintStorage = browserHintStorage();
  private readonly hintTracker = new HintTracker({ seen: readSeenHints(this.hintStorage) });
  private readonly provinceTracker = new ProvinceTracker();
  /** Oyuncunun son bilinen ili (kıyı şeridinde null dönen konumlarda korunur); Shift ışınlanması bunu kullanır. */
  private lastProvince: string | null = null;
  /** Pilot il yer adı bildirimi (8.3); yer merkezi olmayan dünyalarda (test arenası) boştur. */
  private readonly placeTracker: PlaceTracker;
  /** Son bildirim bannerının gösterildiği an (ms): yer adı, il bildiriminin üstüne binmesin. */
  private lastBannerAt = Number.NEGATIVE_INFINITY;
  /** Ortam sesleri (rüzgâr, deniz, orman, gece); oyuna girilince başlar, duraklatınca durur. */
  private readonly ambient: AmbientAudio;
  private lastAmbientUpdate = -Infinity;
  private lastSurvivalHudUpdate = -Infinity;
  /** Ayak konumundaki ateş ısısı ve barınak etkisi (her sabit adımda yenilenir). */
  private exposure: Readonly<Exposure> = NO_EXPOSURE;
  /** Fizik adımında hesaplanan: E basılı ve tatlı su erişimde mi (HUD ipucu için). */
  private waterInReach = false;

  private constructor(
    private readonly container: HTMLElement,
    private readonly physics: PhysicsWorld,
    world: GameWorld,
    private readonly creatureDemo = false,
    readonly settings: SettingsStore = createSettingsStore(),
  ) {
    this.world = world;
    this.placeTracker = new PlaceTracker(world.placeCenters?.() ?? []);
    const { backend, persistent } = createBackend();
    this.saves = new SaveStore(backend, persistent);
    this.renderer = new WebGLRenderer({ antialias: true });
    // Piksel oranı ve diğer kalite/hassasiyet ayarları aşağıda `applySettings` ile uygulanır.
    container.appendChild(this.renderer.domElement);

    this.player = new Player(this.physics, world.spawn, { maxSlopeDeg: world.maxSlopeDeg });
    this.playerCamera = new PlayerCamera(this.events, world.terrain);
    if (world instanceof RegionWorld) this.playerCamera.setLook(PILOT_START_YAW, 0);
    this.world.scene.add(this.playerModel.object);
    this.world.scene.add(this.heldItem.viewRoot);
    this.world.scene.add(this.effects.group);
    this.structureLayer = new StructureLayer(this.structureSystem.structures);
    this.world.scene.add(this.structureLayer.group);
    this.structureColliders = new StructureColliders(this.physics, this.structureSystem.structures);
    this.world.scene.add(this.torchLight);
    this.creatureLayer = new CreatureLayer();
    this.world.scene.add(this.creatureLayer.group);
    this.world.scene.add(this.peopleLayer.group);
    this.placement = new PlacementController({
      events: this.events,
      inventory: this.inventory,
      structures: this.structureSystem.structures,
      world: {
        heightAt: (x, z) => world.terrain.heightAt(x, z),
        nearFreshWater: world.freshWaterNear
          ? (x, z) => world.freshWaterNear?.(x, z) != null
          : undefined,
        // Tapu: başkasının yapısına kurulmaz; sahip olunanın odasına ve yanına (ek) kurulur.
        buildingAt: (x, z, margin) => this.placeBuildingAt(x, z, margin),
        ownedFloorNear: (x, z, reach) => this.ownedFloorNear(x, z, reach),
      },
      isAlive: () => this.survival.alive,
      freeBuild: () => this.testMode,
    });

    this.input = new Input(this.renderer.domElement, document, this.events, window, {
      devTeleportKeys: import.meta.env.DEV,
    });
    this.fps = import.meta.env.DEV ? new FpsCounter(container) : null;
    this.perfOverlay = new PerfOverlay(container);
    this.hud = new Hud(container, import.meta.env.DEV);
    this.settingsPanel = new SettingsPanel(container, this.settings);
    this.ambient = new AmbientAudio(this.settings);
    this.creditsPanel = new CreditsPanel(container);
    this.controlsPanel = new ControlsPanel(container);
    this.pauseMenu = new GameMenu(container, this.events, {
      store: this.saves,
      openSettings: () => this.settingsPanel.show(),
      openCredits: () => this.creditsPanel.show(),
      openControls: () => this.controlsPanel.show(),
      // Ölüm ekranı açıkken menü açılmaz: altında görünmez kalıp odağı "Yeniden Doğ"dan çalıyordu (Enter ölüyken
      // oyunu sürdürüyordu).
      isSuppressed: () => this.overlayOpen || this.deathScreen.visible,
      host: {
        resume: () => this.input.requestLock(),
        newGame: () => this.newGame(),
        continueLatest: () => this.continueLatest(),
        saveToSlot: async (slot) => {
          if ((await this.saveToSlot(slot)) === null) {
            throw new SaveError('invalid', 'Şu an kaydedilemez (ölüyken kayıt alınmaz).');
          }
        },
        loadFromSlot: async (slot) => {
          if (!(await this.loadFromSlot(slot))) throw new SaveError('invalid', 'Bu yuva boş.');
          this.input.requestLock();
        },
        canSave: () => this.survival.alive && this.world instanceof RegionWorld,
        autosaveNow: () => this.autosave(),
      },
    });
    this.inventoryPanel = new InventoryPanel(container, this.inventory, {
      onEat: (slot) => this.eatFromSlot(slot),
      onCraft: (recipe, count) => this.craftRecipe(recipe, count),
      onDrink: () => this.drinkContainer(),
      onDrop: (slot, count) => this.dropFromSlot(slot, count),
      onClose: () => this.closeInventory(),
      getVitals: () => this.survival.state,
      getStations: () => this.stationsHere(),
      hotbar: this.hotbar,
      onAssignHotbar: (slot, item) => this.assignHotbar(slot, item),
      suppressorState: (item) => this.suppressorState(item),
      onToggleSuppressor: (item) => this.toggleSuppressor(item),
      getMoney: () => this.wallet.money,
    });
    this.dialogPanel = new DialogPanel(container, () => this.closeDialog());
    this.storagePanel = new StoragePanel(container, this.inventory, {
      onStore: (slot) => this.moveToStorage(slot),
      onTake: (slot) => this.takeFromStorage(slot),
      onStoreAll: () => this.moveAllStorage('store'),
      onTakeAll: () => this.moveAllStorage('take'),
      onClose: () => this.closeStorage(),
    });
    this.lootPanel = new LootPanel(container, this.inventory, {
      onTake: (index) => this.takeLoot(index),
      onTakeAll: () => this.takeAllLoot(),
      onClose: () => this.closeLoot(),
    });
    this.search.onLoot = (loot) => this.openLoot(loot.items, loot.title, () => loot.settle());
    this.shopPanel = new ShopPanel(container, () => this.shopDeps(), {
      onBuy: (id, count) => this.buyFromVendor(id, count),
      onSell: (slot, count) => this.sellToVendor(slot, count),
      onClose: () => this.closeShop(),
    });
    this.deathScreen = new DeathScreen(container, () => this.respawnPlayer());

    // Başlangıçta duraklatılmış: ilk tıklamayla pointer lock alınınca oyun başlar.
    this.loop = new GameLoop({
      update: (step) => {
        this.perf.section('simülasyon');
        this.update(step);
        this.perf.section(null);
      },
      render: (alpha) => this.render(alpha),
      // Kare başı: biten karenin süresi performans ölçümüne (takılma dökümü).
      frame: (frameTime) => this.perf.endFrame(frameTime * 1000),
    });
    this.world.setPerfProbe?.(this.perf);
    this.loop.setPaused(true);

    this.offs.push(
      this.events.on('input:pointerLockChanged', ({ locked }) => this.setPaused(!locked)),
      // Envanter açıkken göstergeler görünür kalır (yemek yerken izlenir).
      this.events.on('game:paused', () => {
        this.ambient.stop();
        this.hud.setVisible(this.overlayOpen);
        this.placement.cancel();
      }),
      this.events.on('game:resumed', () => {
        this.sessionActive = true;
        this.hud.setVisible(true);
        this.ambient.start();
      }),
      this.events.on('input:action', ({ action: raw }) => {
        // Faz 11: `R` hayalet açıkken döndürür, değilse doldurur (bağlam önceliği `resolveContextAction`).
        const action = resolveContextAction(raw, { placing: this.placement.aiming !== null });
        if (action === 'toggleCamera') this.playerCamera.toggleMode();
        if (action === 'togglePerformance') {
          this.settings.update({ perfOverlay: !this.settings.current.perfOverlay });
        }
        if (action === 'toggleBorders') this.world.toggleBorders?.();
        if (action === 'placeCampfire') this.togglePlacement('campfire');
        if (action === 'placeShelter') this.togglePlacement('lean_to');
        if (action === 'rotatePlacement') this.placement.rotate();
        if (action === 'reload') this.reloadWeapon();
        if (action === 'droneView') this.toggleDroneView();
        if (action === 'droneHome') this.droneHome();
        if (action === 'primaryAction') this.primaryAction();
        if (action === 'toggleInventory') this.openInventory();
        if (action === 'eat') this.quickEatFood();
        if (action === 'toggleFlight') this.toggleFlight();
      }),
      this.events.on('input:hotbarSelect', ({ slot }) => this.activateHotbar(slot)),
      // Faz 11 (F): drone görüşünde tekerlek yakınlaştırır.
      this.events.on('input:hotbarCycle', ({ step }) => {
        if (!this.droneWheel(step)) this.cycleHotbar(step);
      }),
      this.events.on('player:died', (death) => {
        this.placement.cancel();
        this.medical.cancel();
        this.hud.setPrompt(null);
        if (this.br) {
          // Battle Royale: yeniden doğma yok; maç hızla sonuçlanır, sonuç `br:ended` ile gösterilir.
          this.br.onPlayerDied(death.cause);
          this.input.exitLock();
          return;
        }
        this.deathScreen.show(death);
        this.input.exitLock(); // fareyle "Yeniden Doğ"a tıklanabilsin
      }),
      this.events.on('player:damaged', ({ cause }) => {
        // Hasar alan sağlık eşyası kullanımı yarıda kalır (bölge hasarı kesmez: dışarıda sargı sarılabilsin).
        if (cause !== 'zone' && this.medical.active) {
          this.medical.cancel();
          this.hud.notify('İyileşme yarıda kaldı', INTERACT.toastMs);
        }
      }),
      this.events.on('bandit:damaged', (e) => this.br?.onBanditDamaged(e)),
      this.events.on('item:collected', ({ item, count, propId, removed }) => {
        if (removed) this.world.setPropDepleted?.(propId, true);
        this.hud.notify(collectedToast(item, count), INTERACT.toastMs);
      }),
      this.events.on('structure:placed', ({ kind }) =>
        this.hud.notify(placedToast(kind), INTERACT.toastMs),
      ),
      this.events.on('structure:dismantled', ({ items }) =>
        this.hud.notify(dismantledToast(items), INTERACT.toastMs),
      ),
      this.events.on('structure:refueled', ({ seconds }) =>
        this.hud.notify(fuelToast(seconds), INTERACT.toastMs),
      ),
      this.events.on('structure:extinguished', ({ id }) => this.notifyExtinguished(id)),
      this.events.on('item:crafted', ({ item, count }) => {
        const slot = this.hotbar.autoAssign(item);
        const key =
          slot === null ? '' : ` · kısayol ${keyLabel(INPUT.bindings.hotbar[slot] ?? '')}`;
        this.hud.notify(
          `Üretildi: ${ITEMS[item].name}${count > 1 ? ` ×${count}` : ''}${key}`,
          INTERACT.toastMs,
        );
        this.inventoryPanel.refresh();
      }),
      this.events.on('player:damaged', ({ amount }) =>
        this.hud.flashDamage(vignetteStrength(amount)),
      ),
      this.events.on('creature:damaged', ({ killed }) =>
        this.hud.showHitMarker(hitMarkerKind(killed)),
      ),
      this.events.on('creature:noticed', ({ kind, state }) => this.warnDanger(kind, state)),
      this.events.on('carcass:butchered', ({ id, items }) =>
        this.hud.notify(butcheredToast(items, this.butcher.hasRemaining(id)), INTERACT.toastMs),
      ),
      this.events.on('item:cooked', ({ count, item }) =>
        this.hud.notify(cookedToast(count, item), INTERACT.toastMs),
      ),
      this.events.on('item:filled', () => this.hud.notify('Su kabı doldu', INTERACT.toastMs)),
      this.events.on('person:greeted', ({ name, text }) =>
        this.hud.notify(`${name}: “${text}”`, INTERACT.toastMs),
      ),
      this.events.on('player:prayed', ({ prayer, health }) =>
        this.hud.notify(`${prayer} namazı kılındı · Sağlık +${health}`, INTERACT.toastMs),
      ),
      this.events.on('building:searched', ({ items, money }) => {
        // Bulunan eşyalar ganimet panelinde listelenir (otomatik alınmaz): yalnızca boş çıkma ve para bildirilir.
        if (items.length > 0 && !(money && money > 0)) return;
        this.hud.notify(
          searchedToast([], (id) => ITEMS[id].name, money ?? 0),
          INTERACT.toastMs,
        );
      }),
      this.events.on('property:bought', ({ building }) => {
        const b = this.world.settlementMap?.building(building) ?? null;
        if (b) this.hud.notify(`Tapu senin: ${propertyName(b, this.townOf(b))}`, INTERACT.toastMs);
      }),
      this.events.on('time:nightStarted', () =>
        this.hud.notify('Gece bastı: hava soğuyor, yırtıcılar avda', INTERACT.dayNightToastMs),
      ),
      this.events.on('time:dayStarted', () =>
        this.hud.notify('Gün ağarıyor', INTERACT.dayNightToastMs),
      ),
      this.events.on('camera:modeChanged', ({ mode }) =>
        this.playerModel.setVisible(mode === 'thirdPerson'),
      ),
    );
    // Faz 11 ortak (11.0): hedefler (canlılar, oyuncu) ve gürültü → canlı kaçışı; akış kancaları.
    this.offs.push(
      this.targets.register(creatureTargetProvider(this.creatures)),
      this.targets.register(
        playerTargetProvider({
          position: () => (this.survival.alive ? this.player.position : null),
          radius: PLAYER.radius,
          height: PLAYER.height,
          damage: (amount, from) => {
            this.br?.notePlayerHit(from);
            this.combat.receiveShot(amount);
          },
        }),
      ),
      this.events.on('noise:made', ({ x, z, radius }) => this.creatures.hearNoise(x, z, radius)),
    );
    this.setupBuilding2();
    this.setupStations();
    this.setupFarming();
    this.setupRanged();
    this.setupBandits();
    this.setupDrone();
    this.offs.push(this.settings.subscribe((settings) => this.applySettings(settings)));
    this.applySettings(this.settings.current);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onVisibility);
    if (import.meta.env.DEV) document.addEventListener('keydown', this.onDevKey);
    this.resize();
  }

  /** WASM fizik motorunu ve (gerçek bölgede) bölge verisini yükleyip oyunu kurar. */
  static async create(container: HTMLElement, options: GameOptions = {}): Promise<Game> {
    const kind = options.world ?? 'region';
    const [region] = await Promise.all([
      kind === 'region' ? loadRegionData() : null,
      initPhysics(),
    ]);

    const physics = new PhysicsWorld();
    const world: GameWorld =
      region !== null
        ? new RegionWorld(region, physics)
        : new TestScene(physics, new ProceduralHeightSource());
    // Karo akışı (Faz 12): başlangıç çevresinin karoları inip etkinleşmeden oyun kurulmaz.
    if (world instanceof RegionWorld) {
      await world.preload(world.spawn.x, world.spawn.z);
      world.spawn = world.settlePoint(world.spawn);
    }
    return new Game(container, physics, world, options.creatureDemo === true, options.settings);
  }

  /**
   * Geliştirici kısayolu: `T` + 1–9, 0 TELEPORTS listesindeki noktalara, Shift + 1–9, 0 oyuncunun bulunduğu ilin
   * yerlerine (`PROVINCE_PLACES`; ili bilinmiyorsa pilot il) ışınlar (yalnızca dev modunda bağlanır). Değiştiricisiz
   * rakamlar kısayol çubuğunundur (Faz 9).
   */
  private readonly onDevKey = (event: KeyboardEvent): void => {
    // [ / ]: saati bir saat geri/ileri sar; K: canı ve suyu sıfırla (ölüm ekranını dene).
    if (event.code === 'BracketLeft') this.survival.clock.skipHours(-1);
    if (event.code === 'BracketRight') this.survival.clock.skipHours(1);
    if (event.code === 'KeyK') this.survival.setVitals({ health: 0, hydration: 0 });
    // P: yerleştirme/yakıt denemek için malzeme ver (ateş, sundurma, dal, kütük).
    if (event.code === 'KeyP') {
      this.inventory.add('campfire', 1);
      this.inventory.add('lean_to', 1);
      this.inventory.add('stick', 10);
      this.inventory.add('log', 2);
    }
    // O: inşa denemek için tezgâh, sandık ve kulübe ver (Faz 9; ağırlık sınırı kadar). Faz 11: Shift+O yeni
    // yapı eşyalarını (A ve B: merdiven, ocak, fırın, çit…) verir (ağırlık sınırı kadar).
    if (event.code === 'KeyO' && !event.shiftKey) {
      for (const id of ['workbench', 'storage_chest', 'wooden_hut'] as const) {
        if (this.inventory.add(id, 1) === 0) this.hotbar.autoAssign(id);
      }
    }
    if (event.code === 'KeyO' && event.shiftKey) {
      for (const id of FAZ11_DEV_STRUCTURES) this.inventory.add(id, 1);
    }
    // Faz 11 dev tuşları (11.0 verir; sahibi akış kendi davranışını ekler): J silah + mühimmat (D), Y tohum + çapa +
    // orak (C), M drone + pil (F). U (E): önüne eşkıya / yakın kampa ışınla — E yazar.
    if (event.code === 'KeyJ') {
      this.giveDev([['backpack_large', 1]]);
      this.giveDev(FAZ11_DEV_WEAPONS);
    }
    if (event.code === 'KeyY') this.giveDev(FAZ11_DEV_FARMING);
    if (event.code === 'KeyM' && !event.shiftKey) this.giveDev(FAZ11_DEV_DRONE);
    // Shift+M: cüzdana 1000 ₺ (alışveriş/tapu denemesi).
    if (event.code === 'KeyM' && event.shiftKey) this.wallet.add(1000);
    // L: Faz 10 eşyaları (kiler erzakı, bakır tencere); N: önüne bir yolcu çıkar (konuşma/takas denemesi).
    if (event.code === 'KeyL') {
      for (const id of ['bulgur', 'tarhana', 'black_tea', 'copper_pot', 'pekmez'] as const) {
        this.inventory.add(id, id === 'copper_pot' ? 1 : 2);
      }
    }
    // U (Faz 11, E): önüne bir eşkıya çıkar; Shift+U en yakın kampın yanına ışınla.
    if (event.code === 'KeyU') this.devBandit(event.shiftKey);
    if (event.code === 'KeyN' && this.world instanceof RegionWorld && this.world.peopleWorld) {
      const p = this.player.position;
      const yaw = this.playerCamera.yaw;
      const roles = ['yolcu', 'coban', 'oduncu', 'yasli', 'dervis'] as const;
      const role = roles[Math.floor(Math.random() * roles.length)] ?? 'yolcu';
      this.people.spawnAt(
        role,
        p.x - Math.sin(yaw) * 8,
        p.z - Math.cos(yaw) * 8,
        this.world.peopleWorld,
      );
    }
    // Rakamlar kısayol çubuğunundur: ışınlanma yalnızca `T` ya da Shift basılıyken (Faz 9).
    if (!event.shiftKey && !this.input.isHeld(DEV_TELEPORT_KEY)) return;
    const slot = teleportSlotForKey(event.code);
    const list: ReadonlyArray<{ name: string; lat: number; lon: number }> = event.shiftKey
      ? (PROVINCE_PLACES[this.lastProvince ?? PILOT.province] ?? PILOT.places)
      : TELEPORTS;
    const target = slot === null ? undefined : list[slot];
    if (!target) return;
    const ok = this.teleportToLatLon(target.lat, target.lon);
    console.info(
      `Işınlanma: ${target.name}${ok ? '' : ' (yürünebilir nokta bulunamadı ya da bu dünyada desteklenmiyor)'}`,
    );
  };

  /** Dev: eşyaları envantere koyar (sığmayanlar atılır), aletleri kısayola bağlar. */
  private giveDev(items: ReadonlyArray<readonly [ItemId, number]>): void {
    for (const [id, count] of items) {
      if (this.inventory.add(id, count) < count && ITEMS[id].category === 'tool') {
        this.hotbar.autoAssign(id);
      }
    }
    this.inventoryPanel.refresh();
  }

  /**
   * Oyuncuyu enlem/boylama ışınlar (en yakın yürünebilir noktaya). Yalnızca gerçek bölgede çalışır;
   * bulunamazsa false. Işınlanmadan önce çevredeki collider'lar senkron kurulur.
   */
  teleportToLatLon(lat: number, lon: number): boolean {
    if (!(this.world instanceof RegionWorld)) return false;
    const target = this.world.safePointFor(lat, lon);
    if (!target) return false;
    this.world.prepare(target.x, target.z);
    this.player.teleport(target);
    this.settlePending = true;
    return true;
  }

  get paused(): boolean {
    return this.loop.paused;
  }

  /**
   * Oyunun kayıt görüntüsü. Ölüyken (ölüm durumu kayda girmez) ve gerçek bölge dışındaki dünyalarda
   * (`?world=test`) kayıt alınamaz: null.
   */
  createSave(): SaveGame | null {
    // Battle Royale maçı kayda girmez (hayatta kalma kaydının üstüne yazılmasın).
    if (!(this.world instanceof RegionWorld) || !this.survival.alive || this.br) return null;
    return captureSave(this.saveTargets());
  }

  /**
   * Ham kaydı (IndexedDB'den okunan) doğrulayıp oyuna yükler. Bozuk, yeni sürümlü ya da başka bölgeye ait
   * kayıtta `SaveError` fırlatır ve oyun durumu değişmez. Canlılar ve leşler kayda girmez: yükleme onları
   * temizler, akış çevreye göre yeniden doğurur.
   */
  loadSave(raw: unknown): void {
    if (!(this.world instanceof RegionWorld)) {
      throw new SaveError('invalid', 'Bu dünyada kayıt yüklenemez (yalnızca gerçek bölge).');
    }
    const before = this.gather.toSave().removed;
    applySave(raw, this.saveTargets());

    // Dünyadan kalkan nesneler kayda göre yeniden işaretlenir (önceki oturumunkiler geri gelir).
    const removed = new Set(this.gather.toSave().removed);
    for (const id of before) if (!removed.has(id)) this.world.setPropDepleted(id, false);
    for (const id of removed) this.world.setPropDepleted(id, true);

    this.placement.cancel();
    this.heldPlacement = null;
    this.medical.cancel();
    this.butcher.reset();
    this.filler.reset();
    this.dismantler.reset();
    this.closeStorage(false);
    this.closeLoot(false);
    this.closeDialog(false);
    this.closeShop(false);
    this.people.clear();
    this.deathScreen.hide();
    this.hud.setPrompt(null);
    this.inventoryPanel.refresh();
    this.lastSurvivalHudUpdate = -Infinity;
    this.lastLocationUpdate = -Infinity;
    this.provinceTracker.reset();
    this.lastPrayerHour = null; // yükleme saati atlatır: arada kalan vakitler bildirilmesin
    this.placeTracker.reset();
    // Yükleme/yeni oyun: hava bildirimi yeni saatle sessizce başlar.
    this.lastWeatherKind = null;
    this.hintTracker.restart();
  }

  /**
   * Oyunu `slot` yuvasına kaydeder ve özetini döner. Kayıt alınamıyorsa (ölü ya da test dünyası) `null`;
   * depolama hatasında `SaveError('storage')` fırlatır.
   */
  async saveToSlot(slot: SlotId): Promise<SaveSummary | null> {
    const save = this.createSave();
    if (!save) return null;
    const summary = await this.saves.save(slot, save);
    this.autosaver.reset();
    return summary;
  }

  /** Yeni oyun: durumu başlangıca döndürür (kayıtlara dokunmaz) ve fare kilidi ister. */
  newGame(): void {
    this.exitBattleRoyale(false);
    if (this.world instanceof RegionWorld) {
      // Rastgele il/ilçe merkezi başlangıcı; yerleşim verisi yoksa pilot il başlangıcı.
      const city = this.world.cityStart?.(createRandom(seedFrom(Date.now(), randomSeedInt())));
      this.loadSave(
        createNewGameSave(
          WORLD.id,
          city?.point ?? this.world.spawn,
          new Date(),
          city?.yaw ?? PILOT_START_YAW,
        ),
      );
      this.settlePending = true;
      if (city) console.info(`Başlangıç: ${city.name}`);
      this.autosaver.reset();
      this.hintTracker.reset();
      writeSeenHints(this.hintStorage, []);
    }
    this.input.requestLock();
  }

  /** En son kayıttan devam eder ve fare kilidi ister; okunabilir kayıt yoksa `false`. */
  async continueLatest(): Promise<boolean> {
    const slot = await this.saves.latestSlot();
    if (slot === null || !(await this.loadFromSlot(slot))) return false;
    this.input.requestLock();
    return true;
  }

  /** `slot` yuvasındaki kaydı yükler; yuva boşsa `false`. Bozuk kayıtta `SaveError` fırlatır (oyun değişmez). */
  async loadFromSlot(slot: SlotId): Promise<boolean> {
    const save = await this.saves.load(slot);
    if (!save) return false;
    this.exitBattleRoyale(false);
    this.loadSave(save);
    this.autosaver.reset();
    return true;
  }

  /** Otomatik kayıt: örtüşmez, hata oyunu durdurmaz; başarısızlık dizisinde yalnızca bir kez bildirilir. */
  private async autosave(): Promise<void> {
    if (this.autosaving || !this.sessionActive) return;
    const save = this.createSave();
    if (!save) return;
    this.autosaving = true;
    try {
      await this.saves.save(AUTO_SLOT, save);
      this.autosaveFailed = false;
    } catch (error) {
      console.warn('Otomatik kayıt başarısız', error);
      if (!this.autosaveFailed) this.hud.notify('Otomatik kayıt başarısız', INTERACT.toastMs);
      this.autosaveFailed = true;
    } finally {
      this.autosaving = false;
    }
  }

  private saveTargets(): SaveTargets {
    return {
      regionId: WORLD.id,
      player: {
        read: () => ({
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z,
          yaw: this.playerCamera.yaw,
          pitch: this.playerCamera.pitch,
        }),
        apply: ({ x, y, z, yaw, pitch }) => {
          this.world.prepare(x, z); // çevredeki collider'lar hazır olmadan oyuncu düşerdi
          this.player.teleport({ x, y, z });
          this.playerCamera.setLook(yaw, pitch);
        },
      },
      survival: this.survival,
      inventory: this.inventory,
      structures: this.structureSystem.structures,
      gather: this.gather,
      creatures: this.creatures,
      hotbar: this.hotbar,
      search: this.search,
      prayer: this.prayer,
      // Faz 11 (v5): C `farm`, E `bandits`, F `drone` bölümlerini kendi setup'larında bağlar (`saveSections`).
      weapons: this.weapons,
      economy: {
        toSave: () => ({ money: this.wallet.money, owned: this.property.toSave() }),
        loadSave: ({ money, owned }) => {
          this.wallet.loadSave(money);
          this.property.loadSave(owned);
        },
      },
      ...this.saveSections,
    };
  }

  /** Faz 11 akışlarının kendi `setupX()`'lerinde doldurduğu kayıt bölümleri (C `farm`, E `bandits`, F `drone`). */
  private readonly saveSections: Pick<SaveTargets, 'farm' | 'bandits' | 'drone'> = {};

  /**
   * Sahnedeki tüm malzemelerin gölgelendiricilerini önceden derler (yükleme ekranındayken): bir nesne türü ilk kez
   * göründüğünde (eşkıya, cam kırığı, mermi izi, yağmur…) derleme yüzünden oyun donmasın. `KHR_parallel_shader_compile`
   * varsa derleme sürücüde paralel yürür. `RENDER.precompileTimeoutMs`'ten uzun sürerse beklemeden devam edilir.
   */
  async precompile(): Promise<void> {
    const t0 = performance.now();
    try {
      await Promise.race([
        this.renderer.compileAsync(this.world.scene, this.activeCamera()),
        new Promise((resolve) => setTimeout(resolve, RENDER.precompileTimeoutMs)),
      ]);
      console.info(
        `Gölgelendiriciler hazır: ${this.renderer.info.programs?.length ?? 0} program, ` +
          `${(performance.now() - t0).toFixed(0)} ms`,
      );
    } catch (error) {
      console.warn('Gölgelendirici ön derlemesi başarısız; ilk kullanımda derlenecek.', error);
    }
  }

  start(): void {
    this.loop.start();
    this.events.emit('game:started', undefined);
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onVisibility);
    document.removeEventListener('keydown', this.onDevKey);
    for (const off of this.offs) off();
    this.input.dispose();
    this.heldItem.dispose();
    this.effects.dispose();
    this.playerModel.dispose();
    this.player.dispose();
    this.structureLayer.dispose();
    this.structureColliders.dispose();
    this.torchLight.removeFromParent();
    this.torchLight.dispose();
    this.creatureLayer.dispose();
    this.peopleLayer.dispose();
    this.dialogPanel.dispose();
    this.shopPanel.dispose();
    this.combat.dispose();
    this.creatures.dispose();
    this.world.dispose();
    this.physics.dispose();
    if (this.lockFallback !== null) clearTimeout(this.lockFallback);
    this.pauseMenu.dispose();
    this.settingsPanel.dispose();
    this.ambient.dispose();
    this.creditsPanel.dispose();
    this.controlsPanel.dispose();
    this.inventoryPanel.dispose();
    this.storagePanel.dispose();
    this.lootPanel.dispose();
    this.deathScreen.dispose();
    this.hud.dispose();
    this.fps?.dispose();
    this.perfOverlay.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.events.emit('game:disposed', undefined);
    this.events.clear();
  }

  /** Duraklatır/sürdürür (pointer lock kaybı = duraklat). */
  private setPaused(paused: boolean): void {
    if (this.loop.paused === paused) return;
    this.loop.setPaused(paused);
    this.events.emit(paused ? 'game:paused' : 'game:resumed', undefined);
  }

  /** Karo akışı: oyuncunun altındaki zemin yüklenene kadar oyun ilerlemez (yükleme hızlanır, ipucu gösterilir). */
  private worldWaiting = false;
  /** Işınlanma/doğma yaklaşık (genel bakıştan bulunmuş) bir noktaya yapıldı: karolar gelince gerçek zemine oturt. */
  private settlePending = false;

  private worldReady(): boolean {
    const world = this.world;
    if (!world.isReadyAt) return true;
    const feet = this.player.position;
    if (!world.isReadyAt(feet.x, feet.z)) {
      if (!this.worldWaiting) {
        this.worldWaiting = true;
        this.hud.setPrompt('Harita yükleniyor…');
      }
      if (world instanceof RegionWorld) world.frameBudgetMs = STREAMING.tiles.loadingBudgetMs;
      return false;
    }
    if (this.worldWaiting || this.settlePending) {
      if (world instanceof RegionWorld) world.frameBudgetMs = STREAMING.frameBudgetMs;
      if (this.worldWaiting) this.hud.setPrompt(null);
      this.worldWaiting = false;
      if (this.settlePending && world.settlePoint) {
        this.player.teleport(world.settlePoint({ x: feet.x, y: feet.y, z: feet.z }));
      }
      this.settlePending = false;
      world.prepare(this.player.position.x, this.player.position.z); // yeni zeminde collider'lar hazır olsun
    }
    return true;
  }

  private update(step: number): void {
    if (!this.survival.alive) {
      this.br?.finishStep(); // Battle Royale: oyuncu öldü, maç hızla sonuçlanır
      return; // ölü: oyun donar, ölüm ekranı gösterilir
    }
    if (!this.worldReady()) return; // karo akışı: oyuncunun altındaki zemin henüz yüklenmedi
    this.autosaver.update(step);
    this.structureColliders.sync(); // yeni/sökülen katı yapılar oyuncu hareketinden önce

    // Sabit adım: önce oyuncu hareketi (kinematik hedef), sonra fizik adımı.
    // Faz 11 (F): drone görüşünde WASD/Space/Z drone'u sürer, oyuncu yerinde durur.
    const polled = this.droneIntercept(this.input.pollIntent());
    // Test modunda bitkinlik koşuyu/uçuşu kısıtlamaz.
    // Faz 11 (D): nişan alırken Shift nefes tutmadır, koşu değil (`rangedIntent`).
    const intent = this.rangedIntent(
      this.testMode ? polled : gateIntent(polled, canSprint(this.survival.state)),
    );
    this.player.update(step, intent, this.playerCamera.yaw);
    this.physics.step();

    const feet = this.player.position;
    const pose: FocusPose = { x: feet.x, z: feet.z, yaw: this.playerCamera.yaw };
    this.syncHeldPlacement();
    this.placement.update({ ...pose, y: feet.y, pitch: this.playerCamera.pitch });
    this.structureSystem.update(step);
    if (!this.br || this.br.setup.animals) {
      this.creatures.update(step, this.creatureContext(activityFromIntent(intent)));
    }
    this.combat.update(step);
    // Faz 11 akışları (her akış yalnızca kendi yönteminin gövdesini yazar).
    this.updateBuilding2(step);
    this.updateStations(step);
    this.updateFarming(step);
    this.updateRanged(step);
    this.updateBandits(step);
    this.updateDrone(step);
    this.updateBattleRoyale(step);
    this.updateMedical(step);
    // Toplama: bakılan nesneye E basılı tutulur. Nesne toplanabiliyorsa su içmeye göre önceliklidir.
    const held = this.input.interactHeld;
    const nearby = this.world.propsNear?.(feet.x, feet.z, INTERACT.reach) ?? [];
    const focus =
      nearby.length === 0
        ? null
        : pickFocus(
            nearby,
            {
              eye: { x: feet.x, y: feet.y + PLAYER.eyeHeight, z: feet.z },
              forward: lookDirection(this.playerCamera.yaw, this.playerCamera.pitch),
            },
            (prop) => this.gather.inspect(prop) !== null,
          );
    // Faz 10: kapısında durulan aranabilir yapı.
    const settlements = this.world.settlementMap ?? null;
    const building = settlements
      ? searchTarget(settlements.buildingsNear(feet.x, feet.z, SEARCH.queryRadius), {
          x: feet.x,
          y: feet.y,
          z: feet.z,
          yaw: this.playerCamera.yaw,
        })
      : null;
    // E öncelik sırası: toplama > leş kesme > pişirme > ateşe yakıt > yapı arama > su içme (combat/interactChain.ts).
    const interaction = updateInteractions(
      step,
      {
        gather: this.gather,
        butcher: this.butcher,
        cooking: this.cooking,
        fireTender: this.fireTender,
        ...(settlements ? { search: this.search, prayer: this.prayer } : {}),
      },
      {
        held,
        feet,
        prop: focus?.prop ?? null,
        carcass: (this.carcassTarget = this.carcassInReach(feet)),
        building,
        alive: this.survival.alive,
        // Cami: önceki adımda hesaplanan iç mekân (harim) ve oyun saatinin vakti.
        prayer: {
          inMosque: this.interior?.sacred ?? false,
          alive: this.survival.alive,
          window: prayerWindow(this.prayerTimes, this.survival.clock.hour, this.survival.clock.day),
        },
      },
    );

    // Diğer insanlar (Faz 10): kinematik yürüyüş; bakılan kişiyle `E` ile konuşulur (basış anında).
    const peopleWorld = this.br ? null : this.guardedPeopleWorld();
    if (peopleWorld) {
      this.people.update(step, { x: feet.x, z: feet.z, alive: this.survival.alive }, peopleWorld);
    }
    // Satıcılar (dükkân önündeki esnaf): yakındakiler oyuncuya döner; `E` ile dükkân paneli açılır.
    this.nearbyVendors = this.br ? [] : this.updateVendors(feet);
    this.personTarget =
      interaction.taker === null && this.survival.alive
        ? personInView([...this.people.list(), ...this.nearbyVendors], pose)
        : null;

    // Sandık (Faz 9): `E`'yi başka eylem almadıysa bakılan sandık açılır (basış anında; basılı tutma değil).
    const structures = this.structureSystem.structures;
    const interactPressed = this.input.consumeInteractPress();
    if (this.personTarget && interactPressed) {
      const vendor = this.vendorOf(this.personTarget);
      if (vendor) this.openShop(vendor);
      else this.openDialog(this.personTarget);
      return;
    }
    this.storageTarget =
      interaction.taker === null && this.personTarget === null
        ? structureInView(structures, pose, {
            reach: STORAGE.reach,
            viewConeDeg: STORAGE.viewConeDeg,
            kinds: STORAGE_KINDS,
          })
        : null;
    if (this.storageTarget && interactPressed) this.openStorage(this.storageTarget.id);
    // Faz 11 (11.2): kurutma rafı — `E` basışında çiğ et asılır / kurutulmuş et alınır.
    this.rackTarget =
      interaction.taker === null && this.personTarget === null && this.storageTarget === null
        ? structureInView(structures, pose, {
            reach: DRYING.reach,
            viewConeDeg: STORAGE.viewConeDeg,
            kinds: ['drying_rack'],
          })
        : null;
    if (this.rackTarget && interactPressed) this.useRackTarget(this.rackTarget.id);
    // Kapı (modüler parça) ve çit kapısı: `E`'yi başka eylem almadıysa bakılan kapı açılır/kapanır (basış anında).
    this.doorTarget =
      interaction.taker === null &&
      this.personTarget === null &&
      this.storageTarget === null &&
      this.rackTarget === null
        ? structureInView(structures, pose, {
            reach: DOOR_REACH,
            viewConeDeg: STORAGE.viewConeDeg,
            kinds: ['door', 'fence_gate'],
          })
        : null;
    if (this.doorTarget && interactPressed) this.toggleDoor(this.doorTarget.id);
    // Tapu: kapısına bakılan satılık (ya da sahip olunan) yerleşim yapısı; `E` basışında tapu konuşması açılır.
    this.propertyFocus =
      settlements &&
      !this.br &&
      interaction.taker === null &&
      this.personTarget === null &&
      this.storageTarget === null &&
      this.rackTarget === null &&
      this.doorTarget === null &&
      this.survival.alive
        ? propertyTarget(
            settlements.buildingsNear(feet.x, feet.z, SEARCH.queryRadius),
            { x: feet.x, y: feet.y, z: feet.z, yaw: this.playerCamera.yaw },
            (id) => this.property.isOwned(id),
          )
        : null;
    if (this.propertyFocus && interactPressed) {
      this.openPropertyDialog(this.propertyFocus);
      return;
    }
    // Faz 11: `E` sırasının sonu (kapıdan sonra, sudan önce): E teslim olan eşkıya, üst arama, kamp sandığı.
    const banditTook = this.interactBandits(
      interaction.taker === null &&
        this.personTarget === null &&
        this.storageTarget === null &&
        this.rackTarget === null &&
        this.doorTarget === null &&
        this.propertyFocus === null,
      interactPressed,
      held,
      step,
    );
    const drinkAllowed =
      interaction.drinkAllowed &&
      this.storageTarget === null &&
      this.rackTarget === null &&
      this.doorTarget === null &&
      this.propertyFocus === null &&
      !banditTook;
    // Sökme (Faz 9): bakılan yapıya `X` basılı (yerleştirme hayaleti açıkken yok).
    this.dismantleTarget = this.placement.aiming
      ? null
      : structureInView(structures, pose, {
          reach: DISMANTLE.reach,
          viewConeDeg: DISMANTLE.viewConeDeg,
        });
    this.dismantler.update(
      step,
      this.input.dismantleHeld,
      this.dismantleTarget,
      this.survival.alive,
    );

    const water = this.world.freshWaterNear?.(feet.x, feet.z) ?? null;
    this.waterInReach = water !== null;
    this.exposure = exposureAt(structures, feet.x, feet.y, feet.z);
    // Faz 10: caminin/hanın içi kapalı barınaktır; cami ayrıca kutsal ve güvenlidir (canlılar algılamaz).
    const interior = settlements?.interiorAt(feet.x, feet.y, feet.z) ?? null;
    this.inSanctuary = interior?.sacred ?? false;
    this.interior = interior;
    this.playerCamera.setIndoor(
      interior
        ? indoorCeiling(
            interior.building.kind,
            interior.building.floors,
            interior.building.ruined,
            feet.y - interior.building.y,
          )
        : null,
    );
    if (interior && this.exposure.shelter !== 'hut') {
      this.exposure = {
        ...this.exposure,
        sheltered: true,
        shelter: interior.sacred ? 'mosque' : 'building',
      };
    }
    this.survival.update(step, {
      activity: activityFromIntent(intent),
      elevationM: Math.max(0, feet.y * VERTICAL_SCALE),
      drinking: water !== null && drinkAllowed,
      // Giysi ısısı (kürk pelerin) ateşinkiyle aynı kurala uyar: normal ısının üstüne çıkarmaz.
      warmthC: this.exposure.warmthC + clothingWarmth(this.inventory),
      sheltered: this.exposure.sheltered,
      shelter: this.exposure.shelter,
      // Faz 11 (11.2): döşeğin üstünde dinlenirken enerji/can dolumu artar.
      bed: bedAt(structures, feet.x, feet.y, feet.z),
      // Hava durumu: yağmurda ıslanma (barınakta yok), kapalı gökte güneş kesilir.
      weatherCoolingC: weatherCoolingC(
        this.currentWeather(),
        Math.min(Math.max(this.survival.clock.sun.altitudeDeg / 20, 0), 1),
        this.exposure.sheltered,
      ),
    });
    // Su kabı: susuzluk giderildikten sonra (içmiyorken) `E` basılı kalırsa boş kap dolar.
    this.filler.update(step, {
      held: drinkAllowed,
      nearWater: water !== null,
      drinking: this.survival.drinking,
      alive: this.survival.alive,
    });
  }

  /** Bakılan leş (yoksa null): `INTERACT` menzili/konisi içinde, ölü canlılar arasından. */
  private carcassInReach(feet: { x: number; z: number }): CreatureView | null {
    const nearby = this.creatures.near(feet.x, feet.z, INTERACT.reach + COMBAT.aim.searchMargin);
    if (nearby.length === 0) return null;
    return pickCarcass(nearby, this.meleeAim())?.view ?? null;
  }

  /**
   * Canlı simülasyonunun her adımda dünyadan/oyuncudan aldığı bilgi. Hesap A (5.4) `terrain`'i dünyadan bağlar
   * ve gerekirse alan ekler; başka hiçbir şey bu yöntemin dışında `Game`'e dokunmaz.
   */
  private creatureContext(activity: Activity): CreatureContext {
    const feet = this.player.position;
    // Her 60 Hz adımda çağrılır: kamp ateşleri bir kez hesaplanır, kamp yoksa yapı listesi kopyalanmaz.
    const all = this.structureSystem.structures.all();
    const camps = this.campFires();
    const { clock } = this.survival;
    return {
      player: {
        x: feet.x,
        y: feet.y,
        z: feet.z,
        activity,
        alive: this.survival.alive,
        yaw: this.playerCamera.yaw,
        weakness: playerWeakness(this.survival.state),
        sanctuary: this.inSanctuary,
      },
      hour: clock.hour,
      sunAltitudeDeg: clock.sun.altitudeDeg,
      isNight: clock.isNight,
      // Faz 11 (E): yanık eşkıya kampı ateşlerinden de yırtıcılar çekinir; kamp çevresinde canlı doğmaz.
      fires: camps.length === 0 ? all.filter(isLit) : [...all.filter(isLit), ...camps],
      structures: camps.length === 0 ? all : [...all, ...camps],
      terrain: this.world.creatureTerrain ?? null,
      ...(this.obstacles ? { obstacles: this.obstacles } : {}),
    };
  }

  /** Envanter/üretim panelini açar: oyun donar, fare serbest kalır. Yalnızca oyun kontrolündeyken (fare kilitli). */
  private openInventory(): void {
    if (this.overlayOpen || !this.survival.alive || this.loop.paused) return;
    this.inventoryOpen = true; // önce bayrak: kilit bırakılınca duraklatma menüsü çıkmasın
    this.inventoryPanel.show();
    this.input.exitLock();
  }

  /** Paneli kapatır ve fare kilidini ister; kilit verilmezse duraklatma menüsü devreye girer. */
  private closeInventory(): void {
    if (!this.inventoryOpen) return;
    this.inventoryOpen = false;
    this.inventoryPanel.hide();
    this.resumeAfterOverlay();
  }

  /** Envanter ya da sandık paneli açık mı (oyun duraklı ama duraklatma menüsü çıkmaz)? */
  private get overlayOpen(): boolean {
    return (
      this.inventoryOpen ||
      this.storageOpenId !== null ||
      this.lootSession !== null ||
      this.talkingTo !== null ||
      this.banditDialogId !== null ||
      this.propertyDialogId !== null ||
      this.shopVendor !== null
    );
  }

  /** Panel kapanınca fare kilidini ister; kilit verilmezse duraklatma menüsü devreye girer. */
  private resumeAfterOverlay(): void {
    this.input.requestLock();
    if (this.lockFallback !== null) clearTimeout(this.lockFallback);
    this.lockFallback = setTimeout(() => {
      this.lockFallback = null;
      if (this.loop.paused && !this.overlayOpen && !this.pauseMenu.visible) this.pauseMenu.show();
    }, 500);
  }

  /** Sandık panelini açar (Faz 9): oyun donar, fare serbest kalır. Yalnızca oyun kontrolündeyken. */
  /** Kişiyle konuşma panelini açar: oyun donar, kişi durur ve oyuncuya bakar. */
  private openDialog(person: Person): void {
    if (this.overlayOpen || !this.survival.alive || this.loop.paused) return;
    this.talkingTo = person; // önce bayrak: kilit bırakılınca duraklatma menüsü çıkmasın
    person.talking = true;
    this.placement.cancel();
    const role = ROLES[person.role];
    let greeted = false;
    const feet = this.player.position;
    const water = (): string => {
      const world = this.world instanceof RegionWorld ? this.world : null;
      const hit = world?.nearestWater(feet.x, feet.z, 600) ?? null;
      return directionsAnswer(
        person.role,
        feet,
        hit ? { ...hit, what: hit.fountain ? 'bir çeşme' : 'tatlı su' } : null,
      );
    };
    const town = (): string => {
      const s = this.world.settlementMap?.nearestSettlement(
        feet.x,
        feet.z,
        (v) => Math.hypot(v.data.x - feet.x, v.data.z - feet.z) > v.radius,
      );
      if (!s) return directionsAnswer(person.role, feet, null);
      const word = s.data.rank === 'il' ? 'şehri' : s.data.rank === 'ilce' ? 'kasabası' : 'köyü';
      return directionsAnswer(person.role, feet, {
        x: s.data.x,
        z: s.data.z,
        what: `${s.data.name} ${word}`,
      });
    };
    let loreIndex = 0;
    const options = (): DialogOption[] => {
      if (!greeted) {
        return [
          {
            label: GREETINGS.reply,
            select: () => {
              greeted = true;
              return `Hoş geldin ${role.address}. Bu ıssız yerlerde bir insan görmek ne güzel.`;
            },
          },
        ];
      }
      const list: DialogOption[] = [
        { label: 'Buralarda su nerede bulurum?', select: water },
        { label: 'En yakın yerleşim hangi yönde?', select: town },
        {
          label: 'Bu topraklara ne oldu?',
          select: () => role.lore[loreIndex++ % role.lore.length] as string,
        },
        // Faz 11 (E): yolcular eşkıya ve yankesici uyarısı yapar.
        ...this.banditWarningOption(person.role, feet),
      ];
      for (const offer of role.trades) {
        const gift = offer.give.length === 0;
        list.push({
          label: gift ? `${tradeText(offer)} (teşekkür et)` : `Takas: ${tradeText(offer)}`,
          kind: 'trade',
          disabled: gift ? person.gifted : !this.inventory.canAfford(offer.give),
          select: () => {
            const result = executeTrade(this.inventory, offer, person.gifted);
            if (result === 'ok') {
              if (gift) person.gifted = true;
              this.events.emit('person:traded', {
                id: person.id,
                give: offer.give,
                get: offer.get,
              });
              this.inventoryPanel.refresh();
              return gift ? GREETINGS.giftDone : GREETINGS.tradeDone;
            }
            if (result === 'full') return 'Yükün ağır, bunu taşıyamazsın gibi.';
            return GREETINGS.tradeFail;
          },
        });
      }
      list.push({
        label: GREETINGS.farewellPlayer,
        kind: 'farewell',
        closes: true,
        select: () => GREETINGS.farewellPerson,
      });
      return list;
    };
    this.dialogPanel.show({
      title: person.name,
      subtitle: 'Barışçıl bir yolcu. Rakam tuşlarıyla da seçebilirsin.',
      opening: person.greeted ? `Yine mi sen ${role.address}? Buyur.` : GREETINGS.salam,
      options,
    });
    person.greeted = true;
    this.input.exitLock();
  }

  /** Konuşma panelini kapatır; `resume` ise fare kilidini ister (yüklemede istemez). */
  private closeDialog(resume = true): void {
    if (this.talkingTo === null && this.banditDialogId === null && this.propertyDialogId === null)
      return;
    if (this.talkingTo) this.talkingTo.talking = false;
    this.talkingTo = null;
    this.banditDialogId = null; // Faz 11 (E): teslim olan eşkıyayla konuşma
    this.propertyDialogId = null; // tapu konuşması
    this.dialogPanel.hide();
    if (resume) this.resumeAfterOverlay();
  }

  private openStorage(id: StructureId): void {
    if (this.overlayOpen || !this.survival.alive || this.loop.paused) return;
    const chest = this.structureSystem.structures.storageOf(id);
    const structure = this.structureSystem.structures.get(id);
    if (!chest || !structure) return;
    this.storageOpenId = id; // önce bayrak: kilit bırakılınca duraklatma menüsü çıkmasın
    this.placement.cancel();
    this.storagePanel.show(chest, ITEMS[structure.kind].name);
    this.input.exitLock();
  }

  // ── Ganimet paneli (eşkıya cesedi, kamp sandığı, bina kapları) ──

  /**
   * Ganimet panelini açar: oyun donar, fare serbest kalır. `items` kaynağın tuttuğu liste (alınanlar düşer, sığmayanlar
   * kalır); `onTaken` her alıştan sonra alınanlarla çağrılır (kaynak boşaldıysa kendini bitirir).
   */
  private openLoot(
    items: ItemStack[],
    title: string,
    onTaken: (taken: readonly ItemStack[]) => void,
  ): void {
    if (this.overlayOpen || !this.survival.alive || this.loop.paused) return;
    this.lootSession = { items, taken: onTaken };
    this.placement.cancel();
    this.lootPanel.show(items, title);
    this.input.exitLock();
  }

  /** Ganimet panelini kapatır; `resume` ise fare kilidini ister (yüklemede istemez). */
  private closeLoot(resume = true): void {
    if (this.lootSession === null) return;
    this.lootSession = null;
    this.lootPanel.hide();
    if (resume) this.resumeAfterOverlay();
  }

  private takeLoot(index: number): void {
    const session = this.lootSession;
    if (!session) return;
    const taken = takeStack(session.items, index, this.inventory);
    if (taken) session.taken([taken]);
    else this.hud.notify('Envanter dolu', INTERACT.toastMs);
    this.afterLootTaken();
  }

  private takeAllLoot(): void {
    const session = this.lootSession;
    if (!session) return;
    const taken = takeAllStacks(session.items, this.inventory);
    if (taken.length > 0) session.taken(taken);
    if (session.items.length > 0) this.hud.notify('Kalanlar envantere sığmadı', INTERACT.toastMs);
    this.afterLootTaken();
  }

  private afterLootTaken(): void {
    this.lootPanel.refresh();
    this.inventoryPanel.refresh();
  }

  // ── Alışveriş ve tapu ──

  /** Satıcıları (bir kez) yerleştirir; oyuncuya `VENDORS.drawRadius` içindekilerin kişi görüntülerini döner. */
  private updateVendors(feet: { x: number; z: number }): Person[] {
    const map = this.world.settlementMap ?? null;
    const terrain = this.world instanceof RegionWorld ? this.world.peopleWorld : null;
    if (!map || !terrain) return [];
    this.vendors ??= placeVendors(map, terrain);
    const out: Person[] = [];
    for (const v of this.vendors) {
      if (Math.hypot(v.x - feet.x, v.z - feet.z) > VENDORS.drawRadius) continue;
      let person = this.vendorPeople.get(v.id);
      if (!person) {
        person = {
          id: v.id,
          role: 'esnaf',
          name: v.name,
          x: v.x,
          y: v.y,
          z: v.z,
          yaw: v.yaw,
          state: 'attend',
          greeted: true,
          talking: false,
          gifted: false,
          stride: 0,
          moving: false,
          age: 0,
          target: null,
        };
        this.vendorPeople.set(v.id, person);
      }
      person.yaw = vendorFacing(v, feet);
      out.push(person);
    }
    return out;
  }

  /** Kişi bir satıcıysa onun kaydı. */
  private vendorOf(person: Person): Vendor | null {
    if (person.id < VENDORS.idBase || !this.vendors) return null;
    return this.vendors[person.id - VENDORS.idBase] ?? null;
  }

  private shopDeps(): ShopDeps {
    return { inventory: this.inventory, wallet: this.wallet, free: this.testMode };
  }

  /** Dükkân panelini açar: oyun donar, fare serbest kalır. */
  private openShop(vendor: Vendor): void {
    if (this.overlayOpen || !this.survival.alive || this.loop.paused) return;
    this.shopVendor = vendor; // önce bayrak: kilit bırakılınca duraklatma menüsü çıkmasın
    this.placement.cancel();
    this.shopPanel.show(vendor);
    this.input.exitLock();
  }

  /** Dükkân panelini kapatır; `resume` ise fare kilidini ister (yüklemede istemez). */
  private closeShop(resume = true): void {
    if (this.shopVendor === null) return;
    this.shopVendor = null;
    this.shopPanel.hide();
    if (resume) this.resumeAfterOverlay();
  }

  private buyFromVendor(id: ItemId, count: number): string {
    const vendor = this.shopVendor;
    if (!vendor) return '';
    const price = this.testMode ? 0 : buyPrice(id) * count;
    const result = buyItem(vendor.kind, id, count, this.shopDeps());
    if (result !== 'ok') return shopFailureText(result);
    // Alet ve yapılar üretimdeki gibi ilk boş kısayola bağlanır.
    this.hotbar.autoAssign(id);
    this.events.emit('shop:bought', { vendor: vendor.id, id, count, price });
    this.inventoryPanel.refresh();
    return `Hayırlı olsun: ${count} × ${ITEMS[id].name} (−${formatMoney(price)})`;
  }

  private sellToVendor(slot: number, count: number): string {
    const vendor = this.shopVendor;
    if (!vendor) return '';
    const sold = sellSlot(vendor.kind, slot, count, this.shopDeps());
    if (sold.result !== 'ok' || sold.id === null) return shopFailureText(sold.result as 'empty');
    this.events.emit('shop:sold', { vendor: vendor.id, id: sold.id, count, price: sold.earned });
    this.inventoryPanel.refresh();
    return `Satıldı: ${count} × ${ITEMS[sold.id].name} (+${formatMoney(sold.earned)})`;
  }

  /** Yapının bulunduğu yerleşimin adı (yoksa null). */
  private townOf(b: Building): string | null {
    return (
      this.world.settlementMap?.settlements.find((s) => s.data.id === b.settlement)?.data.name ??
      null
    );
  }

  /** Bakılan yapının fiyat bilgisi (yapı değişince yeniden hesaplanır). */
  private propertyInfoOf(b: Building): NonNullable<Game['propertyInfo']> {
    if (this.propertyInfo?.id === b.id) return this.propertyInfo;
    const view = this.world.settlementMap?.settlements.find((s) => s.data.id === b.settlement);
    const rank: SettlementRank = view?.data.rank ?? 'koy';
    this.propertyInfo = {
      id: b.id,
      price: propertyPrice(b, rank),
      town: view?.data.name ?? null,
      rank,
    };
    return this.propertyInfo;
  }

  /** "E: Tapu — Ev (Devrek) · 900 ₺" / "E: Tapu — Ev (Devrek) · senin". */
  private propertyPrompt(b: Building): string {
    const info = this.propertyInfoOf(b);
    const name = propertyName(b, info.town);
    if (this.property.isOwned(b.id)) return `E: Tapu — ${name} · senin`;
    return `E: Tapu — ${name} · ${info.price === null ? 'satılık değil' : formatMoney(info.price)}`;
  }

  /** Tapu konuşması: satın al ya da (sahipse) geri sat (iki adımlı onay). */
  private openPropertyDialog(b: Building): void {
    if (this.overlayOpen || !this.survival.alive || this.loop.paused) return;
    const info = this.propertyInfoOf(b);
    const price = info.price;
    if (price === null && !this.property.isOwned(b.id)) return;
    this.propertyDialogId = b.id; // önce bayrak: kilit bırakılınca duraklatma menüsü çıkmasın
    this.placement.cancel();
    const name = propertyName(b, info.town);
    let confirmSell = false;
    const options = (): DialogOption[] => {
      if (!this.property.isOwned(b.id)) {
        const free = this.testMode;
        return [
          {
            label: `Tapuyu al (${free ? 'test modu: ücretsiz' : formatMoney(price ?? 0)})`,
            kind: 'trade',
            disabled: !free && !this.wallet.canAfford(price ?? 0),
            select: () => {
              const result = this.property.buy(b, info.rank, this.wallet, free);
              if (result === 'money')
                return `Paran yetmiyor: cüzdanında ${formatMoney(this.wallet.money)} var.`;
              if (result !== 'ok') return 'Bu yapı satılık değil.';
              this.events.emit('property:bought', {
                building: b.id,
                kind: b.kind,
                price: free ? 0 : (price ?? 0),
              });
              return 'Hayırlı olsun! Tapu artık senin. İçine sandık, tezgâh, döşek koyabilir; yanına ek yapabilirsin.';
            },
          },
          { label: 'Vazgeç', kind: 'farewell', closes: true, select: () => null },
        ];
      }
      const resale = resalePrice(price ?? 0);
      return [
        {
          label: confirmSell
            ? `Evet, tapuyu sat (+${formatMoney(resale)})`
            : `Tapuyu geri sat (+${formatMoney(resale)})`,
          kind: 'trade',
          select: () => {
            if (!confirmSell) {
              confirmSell = true;
              return 'Emin misin? İçine kurduğun yapılar yerinde kalır ama artık oraya bir şey kuramazsın.';
            }
            confirmSell = false;
            if (this.property.sell(b, info.rank, this.wallet) !== 'ok') return null;
            this.events.emit('property:sold', { building: b.id, kind: b.kind, price: resale });
            return `Tapu satıldı: +${formatMoney(resale)}.`;
          },
        },
        { label: 'Kapat', kind: 'farewell', closes: true, select: () => null },
      ];
    };
    const owned = this.property.isOwned(b.id);
    this.dialogPanel.show({
      title: `Tapu: ${name}`,
      subtitle: owned
        ? 'Bu yapı senin. Rakam tuşlarıyla da seçebilirsin.'
        : 'Satılık. Rakam tuşlarıyla da seçebilirsin.',
      opening: owned
        ? 'Bu yapının tapusu sende. İçine eşya kurabilir, yanına ek yapabilirsin.'
        : `Bu yapı satılık: fiyatı ${formatMoney(price ?? 0)}. Cüzdanında ${formatMoney(this.wallet.money)} var.`,
      options,
    });
    this.input.exitLock();
  }

  /** Yerleştirme kuralı için (x, z)'deki yerleşim yapısı ve sahiplik. */
  private placeBuildingAt(x: number, z: number, margin: number): PlaceBuilding | null {
    const b = this.world.settlementMap?.buildingAt(x, z, margin) ?? null;
    if (!b) return null;
    return {
      owned: this.property.isOwned(b.id),
      floorY: b.y,
      insideRoom: (px, pz, m) => roomContains(b, px, pz, m),
    };
  }

  /** (x, z)'ye `reach` yakın sahip olunan yapının döşeme yüksekliği (ek yapının ilk tabanı için). */
  private ownedFloorNear(x: number, z: number, reach: number): number | null {
    const map = this.world.settlementMap;
    if (!map) return null;
    for (const id of this.property.list()) {
      const b = map.building(id);
      if (!b) continue;
      const shape = BUILDING_SHAPES[b.kind];
      const local = worldToBuildingLocal(b, x, z);
      if (
        Math.abs(local.x) <= shape.width / 2 + reach &&
        Math.abs(local.z) <= shape.depth / 2 + reach
      ) {
        return b.y;
      }
    }
    return null;
  }

  /** Evde doğma noktası: en son tapusu alınan girilebilir yapının içi (yoksa null). */
  private homePoint(): { x: number; y: number; z: number } | null {
    const map = this.world.settlementMap;
    if (!map) return null;
    const owned = this.property.list();
    for (let i = owned.length - 1; i >= 0; i--) {
      const b = map.building(owned[i] as number);
      const point = b ? homeSpawnPoint(b) : null;
      if (point) return point;
    }
    return null;
  }

  /** Sandık panelini kapatır; `resume` ise fare kilidini ister (yüklemede istemez). */
  private closeStorage(resume = true): void {
    if (this.storageOpenId === null) return;
    this.storageOpenId = null;
    this.storagePanel.hide();
    if (resume) this.resumeAfterOverlay();
  }

  private openChest(): Inventory | null {
    return this.storageOpenId === null
      ? null
      : this.structureSystem.structures.storageOf(this.storageOpenId);
  }

  private moveToStorage(slot: number): void {
    const chest = this.openChest();
    if (!chest) return;
    if (transferSlot(this.inventory, slot, chest) === 0) {
      const stack = this.inventory.slots[slot] ?? null;
      const backpack = stack !== null && isBackpack(stack.id) && chest.capacityFor(stack.id) > 0;
      this.hud.notify(backpack ? BACKPACK_FULL_TOAST : 'Sandık dolu', INTERACT.toastMs);
    }
    this.storagePanel.refresh();
  }

  private takeFromStorage(slot: number): void {
    const chest = this.openChest();
    if (!chest) return;
    if (transferSlot(chest, slot, this.inventory) === 0) {
      this.hud.notify('Envanter dolu', INTERACT.toastMs);
    }
    this.storagePanel.refresh();
  }

  private moveAllStorage(direction: 'store' | 'take'): void {
    const chest = this.openChest();
    if (!chest) return;
    if (direction === 'store') transferAll(this.inventory, chest);
    else transferAll(chest, this.inventory);
    this.storagePanel.refresh();
  }

  /** Bakılan kapıyı açar/kapatır. */
  private toggleDoor(id: number): void {
    const structures = this.structureSystem.structures;
    const gate = structures.get(id)?.kind === 'fence_gate';
    const open = structures.toggleDoor(id);
    if (open === null) return;
    const name = gate ? 'Çit kapısı' : 'Kapı';
    this.hud.notify(`${name} ${open ? 'açıldı' : 'kapandı'}`, INTERACT.toastMs);
  }

  /** Bakılan kurutma rafıyla `E`: kurutulmuş et alınır ya da envanterdeki çiğ et asılır (Faz 11, 11.2). */
  private useRackTarget(id: number): void {
    const result = useRack(this.structureSystem.structures, id, this.inventory);
    if (!result.ok) return;
    this.hud.notify(
      result.kind === 'collect'
        ? `+${result.pieces} ${ITEMS.dried_meat.name}`
        : `Rafa ${result.pieces} parça et asıldı`,
      INTERACT.toastMs,
    );
  }

  /** Engel dizinini kurar ve insan dünyasını ona bağlar (engel yoksa insan dünyası olduğu gibi kalır). */
  private guardedPeopleWorld(): PeopleWorld | null {
    const base = this.world instanceof RegionWorld ? this.world.peopleWorld : null;
    const obstacles = this.obstacles;
    if (!base || !obstacles) return base;
    if (this.peopleWorldGuarded?.base !== base) {
      this.peopleWorldGuarded = {
        base,
        guarded: {
          ...base,
          blocked: (x, z) => base.blocked(x, z) || obstacles.contains(x, z, 0.35),
        },
      };
    }
    return this.peopleWorldGuarded.guarded;
  }

  /** Oyuncunun yanındaki üretim istasyonları (tezgâh). */
  private stationsHere() {
    const feet = this.player.position;
    return {
      ...stationsNear(this.structureSystem.structures, feet.x, feet.z),
      free: this.testMode,
    };
  }

  /** Envanter panelinden kısayol bağlama (Faz 9); seçili slottaki eşya değişirse yerleştirme biter. */
  /** Seçili eşya için susturucu düğmesinin durumu (susturucu takılamayan eşyada null). */
  private suppressorState(item: ItemId): SuppressorState | null {
    if (!isWeaponId(item) || !canSuppress(item)) return null;
    if (this.weapons.suppressed(item)) return 'attached';
    return this.inventory.has('suppressor') ? 'available' : 'missing';
  }

  /** Susturucuyu takar (envanterden bir susturucu harcar) ya da çıkarır (envantere geri koyar). */
  private toggleSuppressor(item: ItemId): void {
    if (!isWeaponId(item) || !canSuppress(item)) return;
    const name = ITEMS[item].name;
    if (this.weapons.suppressed(item)) {
      if (this.inventory.add('suppressor', 1) > 0) {
        this.hud.notify('Envanter dolu: susturucu çıkarılamadı', INTERACT.toastMs);
      } else {
        this.weapons.setSuppressed(item, false);
        this.hud.notify(`Susturucu çıkarıldı: ${name}`, INTERACT.toastMs);
      }
    } else if (this.inventory.remove('suppressor', 1)) {
      this.weapons.setSuppressed(item, true);
      this.hud.notify(`Susturucu takıldı: ${name}`, INTERACT.toastMs);
    } else {
      this.hud.notify('Susturucu yok (demirhanede üretilir)', INTERACT.toastMs);
    }
    this.inventoryPanel.refresh();
  }

  private assignHotbar(slot: number, item: ItemId | null): void {
    if (!this.hotbar.assign(slot, item)) return;
    if (this.heldPlacement?.slot === slot && item !== this.heldPlacement.kind) {
      this.placement.cancel();
      this.heldPlacement = null;
    }
  }

  /**
   * Kısayol tuşu (Faz 9): bağlı eşyaya göre — yiyecek/dolu su kabı tüketilir (seçim değişmez); silah/alet elde
   * tutulur; yapı elde tutulur ve yerleştirme hayaleti açılır. Seçili slota yeniden basmak eli boşaltır.
   */
  private activateHotbar(slot: number): void {
    if (!this.survival.alive || slot >= this.hotbar.slotCount) return;
    const id = this.hotbar.slots[slot] ?? null;
    if (id !== null && hotbarUse(id) === 'consume') {
      this.consumeFromHotbar(id);
      return;
    }
    if (id !== null && hotbarUse(id) === 'none') {
      this.hud.notify(unusableHotbarText(id), INTERACT.toastMs);
      return;
    }
    this.cancelMedical();
    this.hotbar.select(this.hotbar.selected === slot ? null : slot);
    this.onHeldChanged();
  }

  /** Fare tekerleği: seçimi kaydırır. */
  private cycleHotbar(step: 1 | -1): void {
    if (!this.survival.alive) return;
    this.cancelMedical();
    this.hotbar.cycle(step);
    this.onHeldChanged(false);
  }

  /**
   * Elde tutulan değişince: yapıysa (ve envanterde varsa) yerleştirme hayaleti açılır, değilse kısayoldan açılmış
   * hayalet kapanır. `notifyMissing`: yapı envanterde yoksa bildir (tekerlekle geçerken sessiz).
   */
  private onHeldChanged(notifyMissing = true): void {
    const slot = this.hotbar.selected;
    const id = this.hotbar.selectedItem;
    // Faz 11 (F): drone hem eşya hem yapı türüdür ama alettir (elde tutulur, kurulmaz): kısayol kuralı belirler.
    if (
      slot !== null &&
      id !== null &&
      isStructureKind(id) &&
      hotbarUse(id) === 'place' &&
      !this.br // Battle Royale maçında inşa yok
    ) {
      if (this.placement.aiming !== id) {
        const result = this.placement.toggle(id);
        const text = toggleToast(result, id);
        if (text && notifyMissing) this.hud.notify(text, INTERACT.toastMs);
      }
      this.heldPlacement = this.placement.aiming === id ? { kind: id, slot } : null;
      return;
    }
    if (this.heldPlacement && this.placement.aiming === this.heldPlacement.kind) {
      this.placement.cancel();
    }
    this.heldPlacement = null;
  }

  /** Kısayoldan açılan hayalet kapandıysa (kuruldu, iptal, C/G ile başka tür) seçili yapı da elden bırakılır. */
  private syncHeldPlacement(): void {
    const held = this.heldPlacement;
    if (held === null || this.placement.aiming === held.kind) return;
    this.heldPlacement = null;
    if (this.hotbar.selected === held.slot) this.hotbar.select(null);
  }

  /** Kısayoldan yiyecek ye ya da dolu su kabından iç. */
  private consumeFromHotbar(id: ItemId): void {
    if (!this.inventory.has(id)) {
      this.hud.notify(`Envanterinde ${ITEMS[id].name} yok`, INTERACT.toastMs);
      return;
    }
    if (isMedical(id)) {
      this.startMedical(id);
      return;
    }
    if (id === 'water_container_full') {
      const result = drinkFromContainer(this.inventory, this.survival, this.events);
      this.hud.notify(
        result.ok ? `Su kabından içtin (+${Math.round(result.amount)} Su)` : 'Susuz değilsin',
        INTERACT.toastMs,
      );
      return;
    }
    const eaten = eatItem(this.inventory, this.survival, id);
    const drink = isDrink(id);
    const done = drink ? 'İçtin' : 'Yedin';
    const refused = drink ? 'Şu an gerek yok' : 'Tokluk dolu';
    this.hud.notify(eaten ? `${done}: ${ITEMS[eaten].name}` : refused, INTERACT.toastMs);
  }

  /** `F`: en çok tokluk veren yiyeceği ye; olmazsa nedenini bildir. */
  private quickEatFood(): void {
    const result = quickEat(this.inventory, this.survival);
    if (result.ok) {
      this.hud.notify(`Yedin: ${ITEMS[result.item].name}`, INTERACT.toastMs);
    } else if (result.reason === 'no_food') {
      this.hud.notify('Yiyeceğin yok', INTERACT.toastMs);
    } else if (result.reason === 'full') {
      this.hud.notify('Tokluk dolu', INTERACT.toastMs);
    }
  }

  private eatFromSlot(slot: number): void {
    const item = eatItem(this.inventory, this.survival, slot);
    if (item !== null) {
      this.hud.notify(
        `${isDrink(item) ? 'İçtin' : 'Yedin'}: ${ITEMS[item].name}`,
        INTERACT.toastMs,
      );
    }
    this.inventoryPanel.refresh();
  }

  /** Envanterdeki dolu su kabından iç (panel "İç" düğmesi). */
  private drinkContainer(): void {
    const result = drinkFromContainer(this.inventory, this.survival, this.events);
    if (result.ok)
      this.hud.notify(`Su kabından içtin (+${Math.round(result.amount)} Su)`, INTERACT.toastMs);
    this.inventoryPanel.refresh();
  }

  /** Seçili slottan eşya at (yok olur; dünyaya bırakılmaz): dolu envanteri boşaltmak için. */
  private dropFromSlot(slot: number, count: number): void {
    const stack = this.inventory.slots[slot] ?? null;
    const dropped = this.inventory.removeFromSlot(slot, count);
    if (dropped) {
      this.hud.notify(
        `Atıldı: ${ITEMS[dropped.id].name}${dropped.count > 1 ? ` ×${dropped.count}` : ''}`,
        INTERACT.toastMs,
      );
    } else if (stack && isBackpack(stack.id)) {
      this.hud.notify(BACKPACK_FULL_TOAST, INTERACT.toastMs);
    }
    this.inventoryPanel.refresh();
  }

  /** Tarifi `count` kez art arda üretir; yapılamayan ilk denemede durur (toplu üretim tek olay yayınlar). */
  private craftRecipe(id: RecipeId, count = 1): void {
    const context = this.stationsHere();
    let made = 0;
    let output: ItemId | null = null;
    for (let i = 0; i < Math.max(1, Math.floor(count)); i++) {
      const result = craft(this.inventory, RECIPES[id], context);
      if (!result.ok) break;
      made += result.output.count;
      output = result.output.id;
    }
    if (output === null) {
      this.inventoryPanel.refresh();
      return;
    }
    this.events.emit('item:crafted', { recipe: id, item: output, count: made });
  }

  /** Ölüm ekranındaki "Yeniden Doğ": göstergeler dolar, oyuncu rastgele güvenli noktaya taşınır. */
  private respawnPlayer(): void {
    if (this.survival.alive) return;
    this.survival.respawn();
    // Tapusu alınmış girilebilir bir yapı varsa (en son alınan) orada uyanılır.
    const home = this.homePoint();
    if (home) this.hud.notify('Evinde uyandın', INTERACT.toastMs);
    const point = home ?? this.world.respawnPoint?.(this.survival.deathCount) ?? null;
    if (point) {
      this.world.prepare(point.x, point.z);
      this.player.teleport(point);
      this.settlePending = true;
    } else {
      this.player.respawn();
    }
    this.deathScreen.hide();
    this.input.requestLock();
  }

  private render(alpha: number): void {
    // Bakış her render karesinde uygulanır: fare hareketi 60 Hz'e kısıtlanmaz.
    const look = this.input.consumeLook();
    // Faz 11 (F): drone görüşünde fare drone kamerasını çevirir.
    if (!this.droneLook(look.dx, look.dy)) this.playerCamera.applyMouse(look.dx, look.dy);

    const feet = this.player.renderPosition(alpha);
    const now = performance.now();
    this.world.update(feet.x, feet.z, now / 1000); // bölümlerini kendisi açar
    this.perf.section('katmanlar');
    // Hava durumu: içeride (bina, cami, kulübe) yağmur damlası gösterilmez.
    this.world.setWeather?.(
      this.currentWeather(),
      this.interior !== null || this.exposure.shelter === 'hut',
    );
    this.world.setSun?.(this.survival.clock.sun);
    this.applyAimCamera(alpha);
    this.playerCamera.update(feet);
    this.playerModel.update(feet, this.playerCamera.yaw);
    this.structureLayer.update(now / 1000, feet.x, feet.z, this.campFires());
    this.structureLayer.setGhost(this.survival.alive ? this.placement.ghost : null);
    this.updateTorch(now / 1000, feet);
    this.creatureLayer.update(this.visibleCreatures(feet), now / 1000);
    this.peopleLayer.sync([...this.people.list(), ...this.nearbyVendors]);
    // Faz 11 akışlarının çizim katmanları (her akış yalnızca kendi yönteminin gövdesini yazar).
    this.drawStations(now / 1000, feet);
    this.drawFarming(now / 1000, feet);
    this.drawRanged(now / 1000, feet);
    this.drawHeld(now, alpha);
    this.drawBandits(now / 1000, feet);
    this.drawDrone(now / 1000, feet);

    this.perf.section('çizim');
    this.renderer.render(this.world.scene, this.activeCamera());
    this.perf.section('arayüz');
    this.sampleFrame(now);
    this.fps?.frame();
    this.updateLocationHud(now, feet);
    this.updateAmbient(now, feet);
    this.updateSurvivalHud(now);
    this.updateHotbarHud();
    this.hud.setHeading(this.playerCamera.yaw);
    this.updatePrompt();
    this.perfOverlay.update(
      now,
      () => this.perfInput(now),
      () => this.perf.history(),
    );
    this.perf.section(null);
    // Dev bilgisi performans göstergesiyle aynı köşededir: gösterge açıkken gizlenir.
    if (import.meta.env.DEV && this.perfOverlay.visible) this.hud.setDebugText('');
    else if (import.meta.env.DEV) {
      this.hud.setDebugText(
        formatDebugInfo({
          position: this.player.position,
          velocity: this.player.currentVelocity,
          grounded: this.player.grounded,
          cameraMode: this.playerCamera.mode,
          props: this.world.propStats,
          structures: this.structureLayer.stats,
          creatures: this.creatures.stats,
        }),
      );
    }
  }

  /** Çizilecek canlılar: demo açıksa sahte görünümler (oyuncunun ilk konumu merkez), yoksa simülasyon. */
  private visibleCreatures(feet: { x: number; z: number }): ReadonlyArray<CreatureView> {
    if (!this.creatureDemo) return this.creatures.views();
    this.demoAnchor ??= { x: feet.x, z: feet.z };
    return demoViews(performance.now() / 1000, this.demoAnchor, (x, z) =>
      this.world.terrain.heightAt(x, z),
    );
  }

  /** Konum satırı (il adı, rakım): pahalı olmasın diye saniyede birkaç kez güncellenir. */
  private updateLocationHud(now: number, feet: { x: number; y: number; z: number }): void {
    if (!this.world.locationInfo) return;
    if (now - this.lastLocationUpdate < LOCATION_HUD_INTERVAL_MS) return;
    this.lastLocationUpdate = now;
    const info = this.world.locationInfo(feet.x, feet.z, feet.y);
    this.hud.setLocation(formatLocation(info));
    if (info.province !== null) this.lastProvince = info.province;
    const change = this.provinceTracker.observe(
      { name: info.province, inRegion: info.inRegion },
      now / 1000,
    );
    if (change) {
      this.lastBannerAt = now;
      this.hud.showBanner(provinceNoticeText(change), PROVINCE_NOTICE.bannerMs);
    }
    // Yer adı (8.3): il bildiriminin gösterildiği sürede çıkarsa sessiz geçilir (üst üste binmesin).
    const place = this.placeTracker.observe(feet.x, feet.z, now / 1000);
    if (place !== null && now - this.lastBannerAt >= PROVINCE_NOTICE.bannerMs) {
      this.lastBannerAt = now;
      this.hud.showBanner(place, PLACE_NOTICE.bannerMs);
    }
  }

  /** Ortam seslerinin katman seviyelerini konumdan/zamandan günceller (saniyede birkaç kez). */
  private updateAmbient(now: number, feet: { x: number; y: number; z: number }): void {
    if (!this.world.ambientAt || this.loop.paused) return;
    if (now - this.lastAmbientUpdate < AMBIENT.updateIntervalMs) return;
    this.lastAmbientUpdate = now;
    const sample = this.world.ambientAt(feet.x, feet.z);
    this.ambient.setLevels(
      ambientMix({
        elevationM: feet.y * VERTICAL_SCALE,
        seaDistance: sample.seaDistance,
        cover: sample.cover,
        sunAltitudeDeg: this.survival.clock.sun.altitudeDeg,
        sheltered: this.exposure.sheltered,
        rain: this.currentWeather().rain,
      }),
    );
  }

  /** Şu anki hava (oyun saatinin deterministik fonksiyonu; kayda girmez). */
  private currentWeather(): WeatherState {
    const { day, hour } = this.survival.clock;
    return weatherAt(weatherHours(day, hour));
  }

  /** Hava değişince kısa bildirim (yağmur başladı/dindi). İlk gözlem sessizdir. */
  private lastWeatherKind: WeatherKind | null = null;
  private notifyWeather(): void {
    const kind = this.currentWeather().kind;
    if (this.lastWeatherKind !== null && kind !== this.lastWeatherKind) {
      const text =
        kind === 'rain'
          ? 'Yağmur başladı: ıslanırsan üşürsün, barınağa sığın'
          : this.lastWeatherKind === 'rain'
            ? 'Yağmur dindi'
            : kind === 'cloudy'
              ? 'Hava bulutlandı'
              : 'Hava açıldı';
      this.hud.notify(text, INTERACT.toastMs);
    }
    this.lastWeatherKind = kind;
  }

  /** Göstergeler, saat ve su içme ipucu: saniyede birkaç kez güncellenir. */
  private updateSurvivalHud(now: number): void {
    if (now - this.lastSurvivalHudUpdate < SURVIVAL_HUD.refreshIntervalMs) return;
    this.lastSurvivalHudUpdate = now;
    const { clock } = this.survival;
    this.hud.setSurvival({
      vitals: this.survival.state,
      clock: formatClock(clock.hour),
      day: formatDay(clock.day),
      ambientC: this.survival.ambientC,
      warmthC: this.exposure.warmthC,
      sheltered: this.exposure.sheltered,
      shelter: this.exposure.shelter,
      defense: defenseFor(this.inventory),
      daylight: clock.sun.altitudeDeg > 0,
      date: formatGameDate(CLOCK.startYear, CLOCK.dayOfYear, clock.day),
      prayer: this.prayerLabel(clock.hour),
      weather: WEATHER_LABELS[this.currentWeather().kind],
    });
    this.notifyWeather();
    this.notifyPrayer(clock.hour);
    this.updateHints(now);
  }

  /** Sonraki namaz vakti: "Sonraki vakit: İkindi 15:21". */
  private prayerLabel(hour: number): string {
    const next = nextPrayer(this.prayerTimes, hour);
    return `${PRAYER_NAMES[next.prayer]} ${formatClock(next.hour % 24)}`;
  }

  /** Vakit girince kısa bildirim (ezan sesi bilinçli olarak yok; güneş doğuşu namaz vakti değildir). */
  private notifyPrayer(hour: number): void {
    const last = this.lastPrayerHour;
    this.lastPrayerHour = hour;
    if (last === null || !this.survival.alive || hour === last) return;
    for (const p of prayersBetween(this.prayerTimes, last, hour)) {
      if (p === 'gunes') continue;
      this.hud.notify(`${PRAYER_NAMES[p]} vakti girdi`, INTERACT.dayNightToastMs);
    }
  }

  /**
   * İlk dakikalar için ipucu (8.5): durum koşulu sağlanınca bir kez, kısa bildirimle. Ayardan kapatılabilir; oyun
   * donukken (menü, envanter, ölüm) ve gerçek bölge dışında çalışmaz.
   */
  private updateHints(now: number): void {
    if (!this.settings.current.hints || !this.survival.alive || this.loop.paused) return;
    if (this.overlayOpen || !(this.world instanceof RegionWorld)) return;
    const feet = this.player.position;
    const structures = this.structureSystem.structures.all();
    const { state, clock } = this.survival;
    const ctx: HintContext = {
      hydration: state.hydration,
      satiety: state.satiety,
      bodyTempC: state.bodyTemp,
      isNight: clock.sun.altitudeDeg < HINTS.nightSunAltitudeDeg,
      fireBuilt: structures.some((s) => s.kind === 'campfire'),
      // Modüler parçalarla kurulan barınak (taban + duvar + çatı) ya da bina içi de barınak sayılır.
      shelterBuilt:
        this.exposure.sheltered ||
        structures.some((s) => s.kind === 'lean_to' || s.kind === 'wooden_hut'),
      preyNearby: this.creatures
        .views()
        .some(
          (v) =>
            !v.dead &&
            PREY_KINDS.has(v.kind) &&
            Math.hypot(v.x - feet.x, v.z - feet.z) <= HINTS.preyRadiusM,
        ),
      inSettlement: (this.world.settlementMap?.settlementAt(feet.x, feet.z) ?? null) !== null,
      personNearby: this.people
        .list()
        .some((p) => Math.hypot(p.x - feet.x, p.z - feet.z) <= HINTS.preyRadiusM),
      rangedHeld: this.ranged.weapon !== null,
    };
    const id = this.hintTracker.update(ctx, now / 1000);
    if (id === null) return;
    this.hud.notify(HINT_TEXT[id], HINTS.toastMs);
    writeSeenHints(this.hintStorage, this.hintTracker.seenIds);
  }

  /**
   * Ekran ortası ipucu ve ilerleme çubuğu (her karede; metin yalnızca değişince yazılır). Öncelik:
   * toplanabilir nesne, sonra su içme, sonra "balta gerekir"/"envanter dolu" gibi engeller.
   */
  private updatePrompt(): void {
    if (this.overlayOpen) {
      this.hud.setPrompt(null);
      this.hud.setProgress(null);
      return;
    }
    const alive = this.survival.alive;
    const ghost = alive ? this.placement.ghost : null;
    if (ghost) {
      this.hud.setProgress(null);
      const held = this.heldPlacement;
      const cancelKey =
        held && held.kind === ghost.kind
          ? keyLabel(INPUT.bindings.hotbar[held.slot] ?? '')
          : undefined;
      this.hud.setPrompt(aimPrompt(ghost, cancelKey));
      return;
    }
    // Sağlık eşyası kullanılıyor: ilerleme halkası.
    const healing = alive ? this.medical.active : null;
    if (healing) {
      this.hud.setPrompt(`${ITEMS[healing.item].name} kullanılıyor…`);
      this.hud.setProgress(this.medical.progress);
      return;
    }
    // Sökme (Faz 9): `X` basılıyken ilerleme ya da engel nedeni her şeyden önce.
    const dismantle = alive && this.input.dismantleHeld ? this.dismantler.offer : null;
    if (dismantle) {
      this.hud.setPrompt(dismantlePrompt(dismantle));
      this.hud.setProgress(this.dismantler.progress > 0 ? this.dismantler.progress : null);
      return;
    }
    const offer = alive ? this.gather.offer : null;
    if (offer?.status === 'ready') {
      this.hud.setPrompt(gatherPrompt(offer));
      this.hud.setProgress(this.gather.progress > 0 ? this.gather.progress : null);
      return;
    }
    const butcher = alive ? this.butcher.offer : null;
    if (butcher?.status === 'ready') {
      this.hud.setPrompt(butcherPrompt(butcher));
      this.hud.setProgress(this.butcher.progress > 0 ? this.butcher.progress : null);
      return;
    }
    const cook = alive ? this.cooking.offer : null;
    if (cook?.status === 'ready') {
      this.hud.setPrompt(
        cookPrompt(this.fireTender.offer?.status === 'ready', 'ready', cook.recipe),
      );
      this.hud.setProgress(this.cooking.progress > 0 ? this.cooking.progress : null);
      return;
    }
    const tend = alive ? this.fireTender.offer : null;
    if (tend?.status === 'ready') {
      this.hud.setPrompt(tendPrompt(tend));
      this.hud.setProgress(this.fireTender.progress > 0 ? this.fireTender.progress : null);
      return;
    }
    const search = alive ? this.search.offer : null;
    if (search?.status === 'ready') {
      this.hud.setPrompt(searchPrompt(search));
      this.hud.setProgress(this.search.progress > 0 ? this.search.progress : null);
      return;
    }
    const prayer = alive ? this.prayer.offer : null;
    if (prayer?.status === 'ready') {
      this.hud.setPrompt(prayerPrompt(prayer, this.prayerLabel(this.survival.clock.hour)));
      this.hud.setProgress(this.prayer.progress > 0 ? this.prayer.progress : null);
      return;
    }
    const person = alive ? this.personTarget : null;
    if (person) {
      this.hud.setProgress(null);
      this.hud.setPrompt(
        this.vendorOf(person) ? `E: ${person.name} · alışveriş` : `E: ${person.name} ile konuş`,
      );
      return;
    }
    const storage = alive ? this.storageTarget : null;
    if (storage) {
      this.hud.setProgress(null);
      this.hud.setPrompt(storagePrompt(storage.kind));
      return;
    }
    // Faz 11 (F): yerdeki drone'u alma.
    const droneText = alive ? this.promptDrone() : null;
    if (droneText) {
      this.hud.setProgress(null);
      this.hud.setPrompt(droneText);
      return;
    }
    const rack = alive ? this.rackTarget : null;
    if (rack?.rack) {
      this.hud.setProgress(null);
      this.hud.setPrompt(rackPrompt(rackOffer(rack.rack, this.inventory)));
      return;
    }
    const door = alive ? this.doorTarget : null;
    if (door) {
      this.hud.setProgress(null);
      this.hud.setPrompt(doorPrompt(door.open === true, door.kind));
      return;
    }
    const estate = alive ? this.propertyFocus : null;
    if (estate) {
      this.hud.setProgress(null);
      this.hud.setPrompt(this.propertyPrompt(estate));
      return;
    }
    // Faz 11 (E): eşkıya etkileşimi (teslim, üst arama, kamp sandığı).
    const bandit = alive ? this.promptBandits() : null;
    if (bandit) {
      this.hud.setPrompt(bandit.text);
      this.hud.setProgress(bandit.progress);
      return;
    }
    this.hud.setProgress(this.filler.progress > 0 ? this.filler.progress : null);
    const drink = this.drinkPrompt();
    this.hud.setPrompt(
      drink ??
        (offer ? gatherPrompt(offer) : null) ??
        (butcher ? butcherPrompt(butcher) : null) ??
        (cook ? cookPrompt(false, cook.status, cook.recipe) : null) ??
        (tend ? tendPrompt(tend) : null) ??
        (search ? searchPrompt(search) : null) ??
        (prayer ? prayerPrompt(prayer, this.prayerLabel(this.survival.clock.hour)) : null) ??
        (alive && this.carcassTarget && !isButcherable(this.carcassTarget.kind)
          ? unbutcherablePrompt(this.carcassTarget.kind)
          : null) ??
        this.structurePrompt(alive) ??
        this.attackHint(alive),
    );
  }

  /** Bakılan yapının adı ve sökme ipucu; içinde durulan barınak için gösterilmez (sürekli görünmesin). */
  private structurePrompt(alive: boolean): string | null {
    const target = alive ? this.dismantleTarget : null;
    if (!target) return null;
    const isShelter = target.kind === 'lean_to' || target.kind === 'wooden_hut';
    if (isShelter && this.exposure.sheltered) return null;
    // Modüler parçalar: plakalar (üstünde durulur) hiç, duvarlar içerideyken (sürekli bakılır) ipucu göstermez.
    if (isPieceKind(target.kind)) {
      // 11.1 (A): beşik çatı da plakadır.
      if (isPlateKind(target.kind) || this.exposure.sheltered) return null;
    }
    return structureHint(target.kind);
  }

  /** Elde meşale varsa ışığı oyuncunun üstünde titretir; yoksa söndürür (ışık sahnede kalır). */
  private updateTorch(time: number, feet: { x: number; y: number; z: number }): void {
    const torch = EQUIPMENT.torch;
    const lit = this.survival.alive && torchLit(this.inventory, this.hotbar.selectedItem);
    if (!lit) {
      this.torchLight.intensity = 0;
      return;
    }
    const t = time * torch.flickerSpeed;
    const flicker = 0.6 * Math.sin(t) + 0.4 * Math.sin(t * 2.7 + 1.3);
    this.torchLight.position.set(feet.x, feet.y + torch.height, feet.z);
    this.torchLight.intensity = torch.intensity * (1 + torch.flicker * flicker);
  }

  /** Kısayol çubuğu: kısayol ya da envanter değiştiyse yeniden çizilir. */
  private updateHotbarHud(): void {
    const signature = hotbarSignature(this.hotbar, this.inventory);
    if (signature === this.lastHotbarSignature) return;
    this.lastHotbarSignature = signature;
    this.hud.setHotbar(
      hotbarViews(this.hotbar, this.inventory),
      heldLabel(this.hotbar, this.inventory),
    );
  }

  /** Vurulabilecek canlı varsa "Sol tık: Saldır · Kurt" ipucu; yoksa null. */
  private attackHint(alive: boolean): string | null {
    if (!alive) return null;
    const hit = this.combat.target(this.meleeAim());
    return hit ? attackPrompt(hit.view.kind) : null;
  }

  /** C/G: yerleştirme hayaletini aç/kapa; eşya yoksa kısa bildirim. */
  private togglePlacement(kind: StructureKind): void {
    if (this.br) {
      this.hud.notify('Maçta yapı kurulmaz', INTERACT.toastMs);
      return;
    }
    const text = toggleToast(this.placement.toggle(kind), kind);
    if (text) this.hud.notify(text, INTERACT.toastMs);
  }

  /** Sol tık: yerleştirme hayaleti varsa onaylar, yoksa saldırır. */
  private primaryAction(): void {
    // Faz 11 (F): drone görüşünde işaretler; elde drone varsa kaldırır.
    if (this.droneClick()) return;
    if (this.placement.aiming) this.confirmPlacement();
    else this.attack();
  }

  /** Oyuncunun konumu ve bakışı (saldırı ve leş seçimi için). */
  private meleeAim(): MeleeAim {
    const feet = this.player.position;
    return {
      x: feet.x,
      y: feet.y,
      z: feet.z,
      eyeY: feet.y + PLAYER.eyeHeight,
      yaw: this.playerCamera.yaw,
      pitch: this.playerCamera.pitch,
    };
  }

  /** Bir canlı tehlikeli bir durumda oyuncuyu fark edince "Tehlike: Kurt" uyarısı (sık tekrarlanmaz). */
  private warnDanger(kind: CreatureKind, state: CreatureState): void {
    const text = noticedToast(kind, state);
    if (text === null) return;
    const now = performance.now();
    if (now - this.lastDangerToast < COMBAT_HUD.dangerToastCooldownMs) return;
    this.lastDangerToast = now;
    this.hud.notify(text, INTERACT.toastMs);
  }

  /** Sol tık saldırısı (ölüyken, envanter açıkken ya da duraklatılmışken yok). */
  private attack(): void {
    if (!this.survival.alive || this.overlayOpen || this.loop.paused) return;
    this.cancelMedical();
    if (this.br && this.inSanctuary) {
      this.hud.notify('Camide silah kullanılmaz', INTERACT.toastMs);
      return;
    }
    // Faz 11 (D): elde menzilli silah varsa sol tık ateş eder (yakın dövüş yok).
    if (this.fireRanged()) return;
    const result = this.combat.attack(this.meleeAim());
    if (result.status === 'exhausted') this.hud.notify('Çok yorgunsun', INTERACT.toastMs);
    // Faz 11 (E): canlıya isabet etmeyen salınış eşkıyaya/yankesiciye vurabilir.
    let hit = result.status === 'hit';
    if (result.status === 'miss' && result.weapon !== null) hit = this.meleeBandits(result.weapon);
    if ((result.status === 'hit' || result.status === 'miss') && result.weapon !== null) {
      this.showSwing(result.weapon, hit);
    }
  }

  /** Elde gösterilecek eşya: kısayoldaki (envanterde varsa); el boşsa vuruşta kullanılacak yakın silah. */
  private heldDisplayItem(): ItemId | null {
    const selected = this.hotbar.selectedItem;
    if (selected !== null && this.inventory.has(selected)) return selected;
    const weapon = this.combat.weapon;
    return weapon === 'fist' ? null : (weapon as ItemId);
  }

  /** Her çizim karesinde: eldeki eşyayı ve savaş efektlerini günceller. */
  private drawHeld(nowMs: number, alpha: number): void {
    const dt = this.lastHeldNow > 0 ? Math.min((nowMs - this.lastHeldNow) / 1000, 0.1) : 0;
    this.lastHeldNow = nowMs;
    const alive = this.survival.alive;
    this.heldItem.setItem(alive ? this.heldDisplayItem() : null);
    const v = this.player.currentVelocity;
    const ranged = this.ranged.weapon;
    this.heldItem.update(dt, this.playerCamera.camera, {
      firstPerson: this.playerCamera.viewFirstPerson,
      speed: this.overlayOpen || this.loop.paused ? 0 : Math.hypot(v.x, v.z),
      aim: ranged ? this.ranged.aimFractionAt(alpha) : 0,
      visible: alive,
    });
    const camera = this.activeCamera();
    const fov = camera instanceof PerspectiveCamera ? (camera.fov * Math.PI) / 180 : 1.2;
    const height = this.renderer.domElement.height;
    this.effects.update(dt, height / (2 * Math.tan(fov / 2)));
  }

  /** Oyuncunun atışı: tepme ve (ateşli silahta) ağız alevi + duman. */
  private showShot(weapon: string, suppressed: boolean): void {
    this.heldItem.recoil();
    if (!isFirearm(weapon as ItemId)) return;
    const yaw = this.playerCamera.yaw;
    const pitch = this.playerCamera.pitch;
    const dir = {
      x: -Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * Math.cos(pitch),
    };
    const muzzle = this.heldItem.muzzleWorld();
    const feet = this.player.position;
    const eye = { x: feet.x, y: feet.y + PLAYER.eyeHeight, z: feet.z };
    const origin = muzzle
      ? { x: muzzle.point.x, y: muzzle.point.y, z: muzzle.point.z }
      : { x: eye.x + dir.x * 0.6, y: eye.y - 0.2 + dir.y * 0.6, z: eye.z + dir.z * 0.6 };
    this.effects.muzzle(weapon, origin, dir, suppressed, muzzle?.firstPerson === false ? 1 : 0.4);
  }

  /** Oyuncunun yakın dövüş savurması: eldeki eşya savrulur, iz ve vınlama; isabette kıvılcım. */
  private showSwing(weapon: string, hit: boolean): void {
    const style = swingStyle(weapon as ItemId | 'fist');
    this.heldItem.swing(style);
    const yaw = this.playerCamera.yaw;
    const pitch = this.playerCamera.pitch;
    const feet = this.player.position;
    const eyeY = feet.y + PLAYER.eyeHeight - 0.25;
    this.effects.swing(style, { x: feet.x, y: eyeY, z: feet.z }, yaw, pitch);
    this.gunAudio?.swing(style, 0);
    if (hit) {
      const reach = COMBAT.weapons[weapon as keyof typeof COMBAT.weapons]?.reach ?? 1.5;
      const d = reach * 0.8;
      this.effects.impact(
        {
          x: feet.x - Math.sin(yaw) * d,
          y: eyeY + Math.sin(pitch) * d,
          z: feet.z - Math.cos(yaw) * d,
        },
        style,
      );
    }
  }

  /** Yerleştirmeyi onaylar; engel varsa nedenini söyler. */
  private confirmPlacement(): void {
    if (!this.placement.aiming) return;
    const result = this.placement.confirm();
    if (result.ok) return;
    const text = placeFailureText(result.reason);
    if (text) this.hud.notify(text, INTERACT.toastMs);
  }

  /** Yakındaki (40 m) bir ateş söndüyse bildirir; uzaktakiler sessiz söner. */
  private notifyExtinguished(id: number): void {
    const fire = this.structureSystem.structures.get(id);
    if (!fire) return;
    const feet = this.player.position;
    if (Math.hypot(fire.x - feet.x, fire.z - feet.z) <= EXTINGUISH_NOTICE_RADIUS) {
      this.hud.notify('Ateş söndü', INTERACT.toastMs);
    }
  }

  /**
   * Su kaynağı erişimdeyken ipucu: içiyorsa "İçiyorsun…", susuzsa "E: Su iç", değilse boş su kabı varsa
   * "E: Su kabını doldur", yoksa "Susuzluğun yok".
   */
  private drinkPrompt(): string | null {
    if (!this.survival.alive || !this.waterInReach) return null;
    if (this.survival.drinking) return 'İçiyorsun…';
    const missing = SURVIVAL.maxValue - this.survival.state.hydration;
    if (missing >= SURVIVAL.drinkMinDeficit) return 'E (basılı tut): Su iç';
    const fill = this.filler.offer;
    if (fill?.status === 'ready') return 'E (basılı tut): Su kabını doldur';
    if (fill?.status === 'full') return 'Envanter dolu: dolu su kabı sığmıyor';
    return 'Susuzluğun yok';
  }

  /**
   * Kullanıcı ayarlarını uygular (başlangıçta ve her değişimde): piksel oranı, dünya kalitesi (LOD,
   * nesne yarıçapı), fare hassasiyeti. Ses seviyesi ses sistemi tarafından okunur (`settings.current.volume`).
   */
  private applySettings(settings: Readonly<Settings>): void {
    const preset = QUALITY_PRESETS[settings.quality];
    // Kalite ya da otomatik çözünürlük değişince denetleyici tam çözünürlükten yeniden başlar.
    if (
      preset.maxPixelRatio !== this.presetMaxPixelRatio ||
      settings.adaptiveResolution !== this.adaptiveResolution
    ) {
      this.resolution.reset();
    }
    this.presetMaxPixelRatio = preset.maxPixelRatio;
    this.adaptiveResolution = settings.adaptiveResolution;
    this.applyPixelRatio(true);
    this.world.setQuality?.(preset);
    this.perfOverlay.setVisible(settings.perfOverlay);
    this.playerCamera.setSensitivityScale(settings.mouseSensitivity);
    this.setTestMode(settings.testMode);
    this.banditsEnabled = settings.bandits;
  }

  /** Test modunu açar/kapatır: toplama tükenmez, uçuş kapanır (kapanınca), rozet güncellenir. */
  private setTestMode(on: boolean): void {
    if (this.testMode === on) return;
    this.testMode = on;
    this.gather.setUnlimited(on);
    if (!on) this.player.setFlying(false);
    this.updateModeBadge();
    this.inventoryPanel.refresh();
  }

  /** Space'e çift basış (yalnızca test modunda): uçuşu aç/kapa. */
  private toggleFlight(): void {
    if (!this.testMode || !this.survival.alive || this.loop.paused) return;
    if (this.drone.viewActive) return; // Faz 11 (F): drone görüşünde Space drone'u yükseltir
    this.player.setFlying(!this.player.isFlying);
    this.updateModeBadge();
    this.hud.notify(this.player.isFlying ? 'Uçuş açık' : 'Uçuş kapalı', INTERACT.toastMs);
  }

  private updateModeBadge(): void {
    this.hud.setModeBadge(
      this.testMode ? (this.player.isFlying ? 'Test modu · Uçuş' : 'Test modu') : null,
    );
  }

  /**
   * Piksel oranını uygular: kalite ön ayarı üst sınır, otomatik çözünürlük açıksa denetleyicinin ölçeği. Değişince (ya
   * da `force`) çizim tamponu yeniden boyutlanır.
   */
  private applyPixelRatio(force = false): void {
    const scale = this.adaptiveResolution ? this.resolution.scale : 1;
    const ratio = pixelRatioFor(window.devicePixelRatio, this.presetMaxPixelRatio, scale);
    if (!force && ratio === this.renderer.getPixelRatio()) return;
    this.renderer.setPixelRatio(ratio);
    this.resize();
  }

  /** Performans göstergesinin girdisi (yalnızca gösterge yenilenirken hesaplanır). */
  private perfInput(now: number): PerfViewInput {
    const info = this.renderer.info.render;
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return {
      summary: this.perf.summary(),
      spike: this.perf.spike,
      now,
      drawCalls: info.calls,
      triangles: info.triangles,
      pixelRatio: this.renderer.getPixelRatio(),
      resolutionScale: this.adaptiveResolution ? this.resolution.scale : null,
      heapMb: memory ? memory.usedJSHeapSize / 1048576 : null,
      deferred: this.world instanceof RegionWorld ? this.world.budget.deferred : 0,
    };
  }

  /** Kare süresini otomatik çözünürlük denetleyicisine verir (yalnızca oyun sürerken ve sekme görünürken). */
  private sampleFrame(now: number): void {
    const last = this.lastFrameAt;
    this.lastFrameAt = now;
    if (last === null || !this.adaptiveResolution || this.loop.paused) return;
    if (document.visibilityState !== 'visible') return;
    if (this.resolution.sample(now - last)) this.applyPixelRatio();
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.playerCamera.resize(width, height);
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════════
  // Faz 11 akış kancaları (11.0 boş açar; docs/faz-11-paralel-plan.md §2.2–§2.3). Her akış YALNIZCA kendi
  // yöntemlerinin gövdesini yazar. Kurulum `setupX` (kurucunun sonunda; temizlik `this.offs`'a eklenir), sabit adım
  // `updateX(dt)` (canlı ve savaş güncellemesinden sonra), çizim `drawX(time, feet)` (render karesinde).
  // ════════════════════════════════════════════════════════════════════════════════════════════════════════

  // ── Faz 11: A (11.1 modüler inşa II) ──
  private setupBuilding2(): void {}
  private updateBuilding2(_dt: number): void {}

  // ── Faz 11: B (11.2/11.3 yapılar, çit, engel sorgusu) ──
  private setupStations(): void {
    const settlements = this.world.settlementMap ?? null;
    this.obstacles = new StructureObstacles(this.structureSystem.structures, {
      heightAt: (x, z) => this.world.terrain.heightAt(x, z),
      ...(settlements ? { solidAt: (x, z, r) => settlements.buildingAt(x, z, r) !== null } : {}),
      // Ağaç, kaya, çalı, köprü/tünel kutuları ve kamp çadırları canlıları, insanları ve eşkıyaları da keser.
      solidBlocks: (x0, z0, x1, z1, r) =>
        (this.world.walkBlocked?.(x0, z0, x1, z1, r) ?? false) ||
        this.campBlocksWalk(x0, z0, x1, z1, r),
      solidContains: (x, z, r) => this.world.walkContains?.(x, z, r) ?? false,
    });
  }
  private updateStations(_dt: number): void {}

  /** Kamp çadırı/sandığı (x0, z0)→(x1, z1) yürüyüşünü keser mi? Kamp kutuları kamp başına bir kez hesaplanır. */
  private campBlocksWalk(x0: number, z0: number, x1: number, z1: number, radius: number): boolean {
    const bandits = this.bandits;
    if (!bandits) return false;
    for (const camp of bandits.camps) {
      if (Math.abs(camp.x - x1) > 20 || Math.abs(camp.z - z1) > 20) continue;
      let boxes = this.campWalkBoxes.get(camp.id);
      if (!boxes) {
        const layout = bandits.layoutOf(camp.id);
        boxes = layout
          ? campSolidBoxes(layout, (x, z) => this.world.terrain.heightAt(x, z)).map(yawBox)
          : [];
        this.campWalkBoxes.set(camp.id, boxes);
      }
      const ground = this.world.terrain.heightAt(x1, z1);
      if (boxes.some((box) => walkBoxBlocks(box, x0, z0, x1, z1, radius, ground))) return true;
    }
    return false;
  }
  private drawStations(_time: number, _feet: { x: number; y: number; z: number }): void {}

  // ── Faz 11: C (11.4 ekme biçme) ──
  private setupFarming(): void {}
  private updateFarming(_dt: number): void {}
  private drawFarming(_time: number, _feet: { x: number; y: number; z: number }): void {}

  // ── Faz 11: D (11.5 silahlar) ──
  private setupRanged(): void {
    this.rangedHud = new RangedHud(this.container);
    this.gunAudio = new GunshotAudio(this.settings);
    this.tracers = new TracerLayer();
    this.world.scene.add(this.tracers.object);
    this.shotSolidQuery = shotSolids(
      this.structureSystem.structures,
      this.world.settlementMap ?? null,
    );
    const glass = this.world.glass ?? null;
    this.shotPaneQuery = glass ? shotPanes(this.world.settlementMap ?? null, glass.broken) : null;
    this.offs.push(
      this.events.on('glass:broken', ({ ids, x, z }) => {
        glass?.breakPanes(ids, { x, z });
        this.gunAudio?.glass();
      }),
      this.events.on('weapon:reloaded', () => this.gunAudio?.click()),
      this.events.on('weapon:empty', ({ weapon }) => {
        this.gunAudio?.click();
        if (weapon in RANGED_AMMO_NAMES)
          this.hud.notify(RANGED_AMMO_NAMES[weapon]!, INTERACT.toastMs);
      }),
      this.events.on('player:died', () => {
        this.playerCamera.setAim(CAMERA.fov, 1, false);
        this.playerCamera.setViewOffset(0, 0);
      }),
      this.events.on('player:respawned', () => this.ranged.reset()),
      () => {
        this.rangedHud?.dispose();
        this.gunAudio?.dispose();
        this.tracers?.dispose();
      },
    );
  }

  private updateRanged(dt: number): void {
    const v = this.player.currentVelocity;
    const speed = Math.hypot(v.x, v.z);
    const frozen = this.overlayOpen || this.loop.paused;
    this.ranged.update(dt, {
      held: this.hotbar.selectedItem,
      aiming: !frozen && this.input.aimHeld && this.placement.aiming === null,
      steady: this.input.steadyHeld,
      moving: speed > 0.5,
      running: !this.player.grounded || speed > PLAYER.walkSpeed * 1.15,
    });
  }

  /**
   * Nişan kamerasını (görüş açısı, hassasiyet, göz hizası geçişi, dürbün salınımı) çizim karesinde uygular: nişan oranı
   * ve salınım sabit adımlar arasında aradeğerlenir; 60 Hz'lik basamaklar yüksek yakınlaştırmada titreme olurdu.
   */
  private applyAimCamera(alpha: number): void {
    const weapon = this.survival.alive ? this.ranged.weapon : null;
    const aim = weapon ? this.ranged.aimFractionAt(alpha) : 0;
    const cam = aimCamera(weapon, aim, CAMERA.fov);
    this.playerCamera.setAim(cam.fovDeg, cam.sensitivity, cam.firstPerson, aim);
    const sway = weapon ? this.ranged.swayAt(alpha) : { yaw: 0, pitch: 0 };
    this.playerCamera.setViewOffset(sway.yaw, sway.pitch);
  }

  private drawRanged(time: number, _feet: { x: number; y: number; z: number }): void {
    this.tracers?.update(time);
    // Üçüncü şahısta nişan alınca görüntü göz hizasına geçer: oyuncu modeli gizlenir.
    this.playerModel.setVisible(
      this.playerCamera.mode === 'thirdPerson' && !this.playerCamera.viewFirstPerson,
    );
    const visible = this.survival.alive && !this.overlayOpen && !this.loop.paused;
    this.rangedHud?.update(this.ranged.hudState(), visible, this.playerCamera.camera.fov);
  }

  /** `R` (hayalet kapalıyken): elde silah varsa doldur. */
  private reloadWeapon(): void {
    if (!this.survival.alive || this.overlayOpen || this.loop.paused) return;
    const weapon = this.ranged.weapon;
    if (weapon && this.ranged.reload() === 'no_ammo') {
      this.hud.notify(RANGED_AMMO_NAMES[weapon] ?? 'Mühimmat yok', INTERACT.toastMs);
    }
  }

  /** Nişan alırken (sağ tık, elde menzilli silah) koşu kapanır: Shift nefes tutmaya ayrılır. */
  private rangedIntent(intent: MoveIntent): MoveIntent {
    if (!intent.run || this.ranged.weapon === null || !this.input.aimHeld) return intent;
    return { ...intent, run: false };
  }

  /** Sol tık: elde menzilli silah varsa ateş eder ve true döner (sonuç ne olursa olsun); yoksa false. */
  private fireRanged(): boolean {
    if (this.ranged.weaponOf(this.hotbar.selectedItem) === null) return false;
    const feet = this.player.position;
    const result: FireResult = this.ranged.fire(
      {
        x: feet.x,
        y: feet.y + PLAYER.eyeHeight,
        z: feet.z,
        yaw: this.playerCamera.yaw,
        pitch: this.playerCamera.pitch,
      },
      {
        heightAt: (x, z) => this.world.terrain.heightAt(x, z),
        targets: this.targets,
        solids: this.shotSolidQuery ?? undefined,
        panes: this.shotPaneQuery ?? undefined,
      },
    );
    if (result.status === 'fired' && result.weapon) {
      this.showShot(result.weapon, result.suppressed);
      this.playerCamera.kick(result.recoil);
      this.tracers?.add(result.weapon, result.shots, performance.now() / 1000);
      this.gunAudio?.play(result.weapon, 0, result.suppressed);
    } else if (result.status === 'exhausted') {
      this.hud.notify('Çok yorgunsun', INTERACT.toastMs);
    }
    return true;
  }

  // ── Faz 11: E (11.6/11.7 eşkıya ve yankesici) ──
  /** Eşkıya kampları (yerleşim verisi olan gerçek dünyada; yoksa null). */
  private bandits: BanditSystem | null = null;
  /** Kamp çadırı/sandığı yürüyüş kutuları (kamp kimliği → kutular). */
  private readonly campWalkBoxes = new Map<number, WalkBox[]>();
  /** Şehirlerde yankesiciler. */
  private readonly pickpockets = new PickpocketSystem(this.events);
  private pickpocketWorld: PickpocketWorld | null = null;
  private banditLayer: BanditLayer | null = null;
  private campColliders: CampColliders | null = null;
  /** Teslim olan eşkıyayla konuşma paneli açıkken onun kimliği. */
  private banditDialogId: number | null = null;
  /** Bakılan eşkıya etkileşimi (teslim, üst arama, kamp sandığı) ve basılı tutma ilerlemesi (sn). */
  private banditTarget: {
    kind: 'surrender' | 'corpse' | 'chest';
    id: number;
    name: string;
    progress: number;
    status: 'ready' | 'full' | 'empty';
  } | null = null;
  /** Kamp ateşlerinin zemin yüksekliği (kamp kimliğine göre; bir kez hesaplanır). */
  private readonly campFireY = new Map<number, number>();

  // ── Battle Royale ("Son Kalan"; `src/battleRoyale/`) ──

  /** Süren Battle Royale maçı (yoksa null; arayüz okur). */
  get battleRoyale(): BrSession | null {
    return this.br;
  }

  /**
   * Battle Royale maçı başlatır: hayatta kalma durumu bellekte saklanır (maç kayda girmez; çıkınca geri yüklenir), maç
   * planlanır, oyuncu eli boş başlangıç noktasına konur ve fare kilidi istenir. Yerleşim verisi yoksa false.
   */
  startBattleRoyale(setup: BrSetup, seed: number = randomSeedInt()): boolean {
    const world = this.world;
    const map = world.settlementMap ?? null;
    const bandits = this.bandits;
    if (!(world instanceof RegionWorld) || !map || !bandits) return false;
    if (this.br) this.exitBattleRoyale(false);
    this.brSnapshot = this.createSave();
    // Tarayıcı maç sırasında kapanırsa hayatta kalma ilerlemesi kaybolmasın.
    if (this.brSnapshot) void this.autosave();
    const terrain = world.terrain;
    const land = (x: number, z: number, slope: number): boolean =>
      terrain.contains(x, z) &&
      terrain.elevationAt(x, z) >= SPAWN_SEARCH.minElevation &&
      terrain.slopeDegAt(x, z) <= slope;
    const open = (x: number, z: number): boolean =>
      land(x, z, BATTLE_ROYALE_OPEN_SLOPE) &&
      map.buildingAt(x, z, 1) === null &&
      (world.freshWaterNear?.(x, z) ?? null) === null;
    const session = new BrSession(
      setup,
      seed,
      {
        provinces: world.region.provinces,
        spawnOpen: open,
        // Son iki daire camiye kapanmaz (camide silah kullanılmaz; orada saklanıp kazanılmasın).
        zoneCenterOk: (x, z, phase) => {
          if (!open(x, z)) return false;
          if (phase < BATTLE_ROYALE.zone.phases.length - 2) return true;
          const b = map.buildingAt(x, z, BATTLE_ROYALE_MOSQUE_CLEARANCE);
          return b === null || !isMosque(b.kind);
        },
        walkable: (x, z) => land(x, z, REGION_PLAYER.maxSlopeDeg),
        ready: (x, z) => world.isReadyAt(x, z),
        lootSpots: lootSpotsOf(
          map.settlements.map((s) => ({
            x: s.data.x,
            z: s.data.z,
            rank: s.data.rank,
            radius: s.radius,
          })),
        ),
      },
      bandits,
      this.events,
    );
    this.br = session;
    const spawn = session.spawn;
    const point = world.safePointAt(spawn.x, spawn.z) ?? {
      x: spawn.x,
      y: terrain.heightAt(spawn.x, spawn.z) + 0.05,
      z: spawn.z,
    };
    // Eli boş, taze göstergelerle başlanır (yükleme yolu: tek kaynaklı başlangıç durumu).
    this.loadSave(createNewGameSave(WORLD.id, point, new Date(), spawn.yaw));
    this.settlePending = true;
    this.survival.setFreeze({ needs: true, clock: setup.fixedDaylight });
    this.search.lootSource = (target, key) =>
      rollBuildingBrLoot(key, target.building, seedFrom(seed, 9));
    this.search.secondsScale = BATTLE_ROYALE.loot.searchScale;
    this.autosaver.reset();
    this.input.requestLock();
    return true;
  }

  /**
   * Maçtan çıkar: yarışmacılar kalkar, sistemler hayatta kalma kipine döner ve maçtan önceki durum geri yüklenir
   * (`restore` false ise yüklenmez: yeni maç hemen başlayacak).
   */
  exitBattleRoyale(restore = true): void {
    const session = this.br;
    if (!session) return;
    session.dispose();
    this.br = null;
    this.search.lootSource = null;
    this.search.secondsScale = 1;
    this.survival.setFreeze({ needs: false, clock: false });
    this.medical.cancel();
    if (!restore) return;
    const snapshot = this.brSnapshot;
    this.brSnapshot = null;
    if (snapshot) this.loadSave(snapshot);
    else if (this.world instanceof RegionWorld) {
      this.loadSave(createNewGameSave(WORLD.id, this.world.spawn, new Date(), PILOT_START_YAW));
      this.settlePending = true;
    }
  }

  /** Maç adımı: bölge hasarı oyuncuya işler. */
  private updateBattleRoyale(dt: number): void {
    const session = this.br;
    if (!session) return;
    const feet = this.player.position;
    const damage = session.update(dt, { x: feet.x, z: feet.z });
    if (damage > 0) this.survival.applyDamage(damage, 'zone');
  }

  /** Sağlık eşyası kullanımı (kısayol ya da envanter): süreli, hasar/saldırı/eşya değişimiyle yarıda kalır. */
  private startMedical(id: ItemId): void {
    if (!isMedical(id)) return;
    const result = this.medical.start(id, this.survival.state.health);
    const text = {
      started: `${ITEMS[id].name} kullanılıyor…`,
      missing: `Envanterinde ${ITEMS[id].name} yok`,
      full: 'Canın yeterince dolu',
      busy: 'Zaten iyileşiyorsun',
    }[result];
    this.hud.notify(text, INTERACT.toastMs);
  }

  private cancelMedical(): void {
    if (!this.medical.active) return;
    this.medical.cancel();
    this.hud.notify('İyileşme yarıda kaldı', INTERACT.toastMs);
  }

  private updateMedical(dt: number): void {
    const done = this.medical.update(dt, this.survival.state.health);
    if (!done) return;
    this.survival.consume({ health: done.heal });
    this.hud.notify(`${ITEMS[done.item].name}: +${Math.round(done.heal)} can`, INTERACT.toastMs);
  }

  private setupBandits(): void {
    const world = this.world;
    const map = world.settlementMap ?? null;
    const terrain = world.creatureTerrain;
    if (!(world instanceof RegionWorld) || !map || !terrain) return;
    const heightAt = (x: number, z: number): number => world.terrain.heightAt(x, z);
    const t0 = performance.now();
    const camps = placeCamps(campSiteQuery(terrain, map));
    if (import.meta.env.DEV) {
      console.info(`Eşkıya kampları: ${camps.length} (${(performance.now() - t0).toFixed(0)} ms)`);
    }
    const gangSites = placeGangSites({
      centers: map.settlements
        .filter((s) => GANGS.ranks.includes(s.data.rank))
        .map((s) => ({
          id: s.data.id,
          name: s.data.name,
          x: s.data.x,
          z: s.data.z,
          radius: s.radius,
        })),
      onStreet: (x, z, distance) => map.roads.nearest(x, z, distance) !== null,
      open: (x, z, margin) =>
        map.buildingAt(x, z, margin) === null &&
        !terrain.isSea(x, z) &&
        terrain.slopeDegAt(x, z) <= 25,
    });
    if (import.meta.env.DEV) console.info(`Sokak çetesi yerleri: ${gangSites.length}`);
    const bandits = new BanditSystem(
      this.events,
      camps,
      {
        heightAt,
        slopeDegAt: (x, z) => terrain.slopeDegAt(x, z),
        isSea: (x, z) => terrain.isSea(x, z),
      },
      undefined,
      gangSites,
    );
    this.bandits = bandits;
    // Kamp alanında ağaç/çalı/kaya çizilmez (çadırlar ağaçların içinde kalmasın).
    const clearance = BANDITS.campRadius + 2;
    world.addPropBlocker((x, z, r) =>
      camps.some(
        (c) => Math.abs(c.x - x) < clearance + r && Math.hypot(c.x - x, c.z - z) < clearance + r,
      ),
    );
    const people = world.peopleWorld;
    this.pickpocketWorld = people
      ? {
          heightAt,
          walkable: (x, z) =>
            people.elevationAt(x, z) > 1 &&
            people.slopeDegAt(x, z) <= PEOPLE.maxSlopeDeg &&
            !people.blocked(x, z) &&
            // Ağaç, kaya, çalı ve oyuncu yapıları yankesiciyi de keser.
            !(this.obstacles?.contains(x, z, 0.35) ?? false),
          townRankAt: (x, z) => people.settlementRankAt(x, z),
        }
      : null;
    this.banditLayer = new BanditLayer(heightAt);
    world.scene.add(this.banditLayer.group);
    this.campColliders = new CampColliders(this.physics, heightAt);
    this.saveSections.bandits = {
      toSave: () => ({ ...bandits.toSave(), stolen: this.pickpockets.toSave() }),
      loadSave: (save) => {
        bandits.loadSave(save);
        this.pickpockets.loadSave(save.stolen);
        this.banditTarget = null;
      },
    };
    const toast = (text: string): void => this.hud.notify(text, INTERACT.toastMs);
    const names = (items: readonly ItemStack[]): string =>
      items.map((s) => `${s.count} ${ITEMS[s.id].name}`).join(', ');
    this.offs.push(
      this.targets.register(bandits),
      this.targets.register(this.pickpockets),
      this.events.on('noise:made', ({ x, z, radius }) => bandits.hearNoise(x, z, radius)),
      this.events.on('bandit:noticed', ({ name, gang }) => {
        const now = performance.now();
        if (now - this.lastDangerToast < COMBAT_HUD.dangerToastCooldownMs) return;
        this.lastDangerToast = now;
        toast(gang ? `Tehlike: Sokak çetesi! (${name})` : `Tehlike: Eşkıya! (${name})`);
      }),
      this.events.on('gang:clash', ({ site }) =>
        toast(`${site}: sokakta iki çete çatışıyor — silah sesleri!`),
      ),
      this.events.on('bandit:damaged', ({ killed }) =>
        this.hud.showHitMarker(hitMarkerKind(killed)),
      ),
      this.events.on('bandit:surrendered', ({ name }) =>
        toast(`${name}: “Aman ağam, canımı bağışla!” (E: konuş)`),
      ),
      this.events.on('bandit:searched', ({ items }) =>
        toast(
          items.length > 0 ? `Eşkıyanın üstünden: ${names(items)}` : 'Üstünden bir şey çıkmadı',
        ),
      ),
      this.events.on('bandit:fired', (e) => this.onBanditFired(e)),
      this.events.on('bandit:swung', (e) => this.onBanditSwung(e)),
      this.events.on('camp:cleared', () =>
        this.hud.showBanner('Eşkıya kampı temizlendi', PROVINCE_NOTICE.bannerMs),
      ),
      this.events.on('camp:looted', ({ items, left }) =>
        toast(
          items.length === 0
            ? 'Kamp sandığından bir şey alamadın (envanter dolu)'
            : `Kamp sandığından: ${names(items)}${left > 0 ? ' · sandıkta daha var' : ''}`,
        ),
      ),
      this.events.on('pickpocket:near', () => toast('Biri çok yaklaştı… cebine dikkat!')),
      this.events.on('pickpocket:stole', ({ item, count }) => {
        toast(`Yankesici! ${count} ${ITEMS[item].name} çalındı — peşine düş!`);
        this.inventoryPanel.refresh();
      }),
      this.events.on('pickpocket:recovered', ({ item, count, lost }) => {
        toast(
          `Yankesiciden geri aldın: ${count} ${ITEMS[item].name}${lost > 0 ? ` (${lost} tanesi sığmadı)` : ''}`,
        );
        this.inventoryPanel.refresh();
      }),
      this.events.on('pickpocket:escaped', ({ item, camp }) =>
        toast(
          `Yankesici kaçtı: ${ITEMS[item].name}${camp === null ? ' gitti' : ' bir eşkıya kampına götürüldü'}`,
        ),
      ),
      () => {
        this.banditLayer?.dispose();
        this.campColliders?.dispose();
      },
    );
  }

  private updateBandits(dt: number): void {
    const bandits = this.bandits;
    if (!bandits) return;
    // Battle Royale maçında yarışmacılar eşkıya ayarından bağımsızdır; yankesiciler kapalıdır.
    const enabled = this.br !== null || this.banditsEnabled;
    if (bandits.enabled !== enabled) bandits.setEnabled(enabled);
    const pickpockets = this.br === null && this.banditsEnabled;
    if (this.pickpockets.enabled !== pickpockets) this.pickpockets.setEnabled(pickpockets);
    const feet = this.player.position;
    const clock = this.survival.clock;
    const v = this.player.currentVelocity;
    const speed = Math.hypot(v.x, v.z);
    const alive = this.survival.alive;
    bandits.update(dt, {
      player: {
        x: feet.x,
        y: feet.y,
        z: feet.z,
        activity: speed > PLAYER.walkSpeed + 0.5 ? 'run' : speed > 0.3 ? 'walk' : 'rest',
        alive,
        sanctuary: this.inSanctuary,
      },
      hour: clock.hour,
      darkness: darknessOf(clock.sun.altitudeDeg),
      now: (clock.day * 24 + clock.hour) * 3600,
      targets: this.targets,
      // Faz 11 (B): oyuncu yapıları (çit, duvar, kapalı kapı) eşkıyaların yürüyüşünü keser.
      ...(this.obstacles ? { obstacles: this.obstacles } : {}),
      // Bina duvarları görüşü ve mermiyi keser (şehirdeki sokak çeteleri).
      ...(this.shotSolidQuery ? { solids: this.shotSolidQuery } : {}),
      // Faz 11 (F): alçak uçan drone'a ateş ederler.
      drone: this.drone.state,
      prey: (x, z, r) =>
        this.creatures
          .near(x, z, r)
          .filter((c) => (c.kind === 'roe_deer' || c.kind === 'red_deer') && !c.dead)
          .map((c) => ({ id: `${CREATURE_TARGET_PREFIX}${c.id}`, x: c.x, z: c.z })),
    });
    if (this.pickpocketWorld && !this.br) {
      const ctx = {
        player: { x: feet.x, z: feet.z, alive, sanctuary: this.inSanctuary },
        inventory: this.inventory,
        held: this.hotbar.selectedItem,
        deposit: (items: readonly ItemStack[], x: number, z: number) =>
          bandits.depositToNearestChest(items, x, z),
      };
      this.pickpockets.bind(ctx);
      this.pickpockets.update(dt, ctx, this.pickpocketWorld);
    }
  }

  private drawBandits(time: number, feet: { x: number; y: number; z: number }): void {
    const bandits = this.bandits;
    const layer = this.banditLayer;
    if (!bandits || !layer) return;
    const on = this.banditsEnabled;
    layer.syncPeople(on ? bandits.views() : [], on ? this.pickpockets.list() : []);
    const near = (radius: number) =>
      on ? bandits.camps.filter((c) => Math.hypot(c.x - feet.x, c.z - feet.z) <= radius) : [];
    layer.syncCamps(
      near(BANDITS.drawRadius).map((camp) => ({
        camp,
        layout: bandits.layoutOf(camp.id)!,
        lit: !bandits.isCleared(camp.id),
      })),
      time,
    );
    this.campColliders?.sync(
      near(BANDITS.colliderRadius).map((camp) => ({
        id: camp.id,
        layout: bandits.layoutOf(camp.id)!,
      })),
    );
  }

  /** Bir eşkıya ateş etti: ağız alevi, duman, mermi izi ve (uzaklıkla kısılan) silah sesi. */
  private onBanditFired(e: GameEvents['bandit:fired']): void {
    const feet = this.player.position;
    const distance = Math.hypot(e.x - feet.x, e.z - feet.z);
    if (distance > COMBAT_FX.banditRadius) return;
    const weapon = e.weapon as WeaponId;
    const origin = {
      x: e.x + e.dx * 0.6,
      y: e.y - 0.25 + e.dy * 0.6,
      z: e.z + e.dz * 0.6,
    };
    this.effects.muzzle(weapon, origin, { x: e.dx, y: e.dy, z: e.dz });
    this.tracers?.add(weapon, e.shots, performance.now() / 1000);
    this.gunAudio?.play(weapon, distance, false);
  }

  /** Bir eşkıya yakın dövüş silahını savurdu: savurma izi ve vınlama. */
  private onBanditSwung(e: GameEvents['bandit:swung']): void {
    const feet = this.player.position;
    const distance = Math.hypot(e.x - feet.x, e.z - feet.z);
    if (distance > COMBAT_FX.banditRadius) return;
    const style = swingStyle(e.weapon);
    this.effects.swing(style, { x: e.x, y: e.y + 1.15, z: e.z }, e.yaw, 0);
    this.gunAudio?.swing(style, distance);
  }

  /** Yanık (temizlenmemiş) kamp ateşleri: ışık havuzu ve canlıların ateşten çekinmesi için (kimlik negatif). */
  private campFires(): Array<{ id: number; x: number; y: number; z: number }> {
    const bandits = this.bandits;
    if (!bandits || !this.banditsEnabled) return [];
    const feet = this.player.position;
    const out: Array<{ id: number; x: number; y: number; z: number }> = [];
    for (const camp of bandits.camps) {
      if (bandits.isCleared(camp.id)) continue;
      if (Math.hypot(camp.x - feet.x, camp.z - feet.z) > BANDITS.drawRadius) continue;
      let y = this.campFireY.get(camp.id);
      if (y === undefined) {
        y = this.world.terrain.heightAt(camp.x, camp.z);
        this.campFireY.set(camp.id, y);
      }
      out.push({ id: -(camp.id + 1), x: camp.x, y, z: camp.z });
    }
    return out;
  }

  /**
   * `E` sırasının sonu (kapıdan sonra, sudan önce). `free`: önceki hiçbir eylem `E`'yi almadı; `pressed` basış anı,
   * `held` basılı tutma. `E`'yi aldıysa true (su içme engellenir).
   */
  private interactBandits(free: boolean, pressed: boolean, held: boolean, dt: number): boolean {
    const bandits = this.bandits;
    const previous = this.banditTarget;
    this.banditTarget = null;
    if (!free || !bandits || !this.banditsEnabled || !this.survival.alive) return false;
    const feet = this.player.position;
    const pose = { x: feet.x, z: feet.z, yaw: this.playerCamera.yaw };
    const keep = (kind: 'surrender' | 'corpse' | 'chest', id: number): number =>
      previous && previous.kind === kind && previous.id === id && held ? previous.progress + dt : 0;

    const found = banditInView(bandits.views(), pose);
    if (found?.kind === 'surrender') {
      this.banditTarget = {
        kind: 'surrender',
        id: found.view.id,
        name: found.view.name,
        progress: 0,
        status: 'ready',
      };
      if (pressed) this.openBanditDialog(found.view.id, found.view.name);
      return true;
    }
    if (found?.kind === 'corpse') {
      const progress = keep('corpse', found.view.id);
      this.banditTarget = {
        kind: 'corpse',
        id: found.view.id,
        name: found.view.name,
        progress,
        status: 'ready',
      };
      if (progress >= BANDITS.searchSeconds) {
        const id = found.view.id;
        const list = bandits.corpseLoot(id);
        if (list && list.length > 0) {
          this.openLoot(list, found.view.name, (taken) => bandits.commitCorpse(id, taken));
        } else {
          bandits.commitCorpse(id, []);
        }
        this.banditTarget = null;
      }
      return held;
    }
    const camp = bandits.nearestCamp(feet.x, feet.z);
    const layout = camp ? bandits.layoutOf(camp.id) : null;
    if (
      camp &&
      layout &&
      inView(pose, layout.chest.x, layout.chest.z, BANDITS.chestReach) !== null
    ) {
      const empty = bandits.chestOf(camp.id).length === 0;
      const progress = empty ? 0 : keep('chest', camp.id);
      this.banditTarget = {
        kind: 'chest',
        id: camp.id,
        name: '',
        progress,
        status: empty ? 'empty' : 'ready',
      };
      if (progress >= BANDITS.chestSeconds) {
        const campId = camp.id;
        this.openLoot(bandits.chestLoot(campId), 'Kamp sandığı', (taken) =>
          bandits.commitChest(campId, taken),
        );
        this.banditTarget = null;
      }
      return held;
    }
    return false;
  }

  /** Eşkıya etkileşimi ipucu ve basılı tutma ilerlemesi (yoksa null). */
  private promptBandits(): { text: string; progress: number | null } | null {
    const t = this.banditTarget;
    if (!t) return null;
    if (t.kind === 'surrender')
      return { text: `E: ${t.name} ile konuş (teslim oldu)`, progress: null };
    if (t.kind === 'corpse') {
      return {
        text: 'E (basılı tut): Eşkıyanın üstünü ara',
        progress: t.progress > 0 ? t.progress / BANDITS.searchSeconds : null,
      };
    }
    if (t.status === 'empty') return { text: 'Kamp sandığı boş', progress: null };
    return {
      text: 'E (basılı tut): Kamp sandığını ara',
      progress: t.progress > 0 ? t.progress / BANDITS.chestSeconds : null,
    };
  }

  /** Canlıya isabet etmeyen yakın dövüş salınışı: bakılan eşkıya/yankesiciye vurur (`COMBAT.weapons` hasarı). */
  private meleeBandits(weapon: string): boolean {
    const stats = COMBAT.weapons[weapon as keyof typeof COMBAT.weapons];
    if (!stats || !this.bandits || !this.banditsEnabled) return false;
    const aim = this.meleeAim();
    const fx = -Math.sin(aim.yaw);
    const fz = -Math.cos(aim.yaw);
    let best: { id: string; bearing: number } | null = null;
    for (const t of this.targets.targetsNear(aim.x, aim.z, stats.reach + 2)) {
      if (t.kind !== 'bandit') continue;
      const dx = t.x - aim.x;
      const dz = t.z - aim.z;
      const d = Math.hypot(dx, dz);
      if (d - t.radius > stats.reach || Math.abs(t.y - aim.y) > COMBAT.aim.maxVerticalGap) continue;
      const bearing =
        d < 1e-6
          ? 0
          : (Math.acos(Math.min(Math.max((dx * fx + dz * fz) / d, -1), 1)) * 180) / Math.PI;
      if (bearing > COMBAT.aim.coneDeg) continue;
      if (!best || bearing < best.bearing) best = { id: t.id, bearing };
    }
    if (best) {
      this.targets.applyHit(best.id, stats.damage, {
        x: aim.x,
        y: aim.y,
        z: aim.z,
        by: 'player',
        weapon,
      });
    }
    return best !== null;
  }

  /** Teslim olan eşkıyayla konuşma: bağışla (silahını bırakır, kaçar), kampı sor, sus. Oyun panel açıkken donar. */
  private openBanditDialog(id: number, name: string): void {
    const bandits = this.bandits;
    if (!bandits || this.overlayOpen || !this.survival.alive || this.loop.paused) return;
    this.banditDialogId = id;
    this.placement.cancel();
    const feet = { x: this.player.position.x, z: this.player.position.z };
    const options = (): DialogOption[] => [
      {
        label: SURRENDER_TEXT.spare,
        closes: true,
        select: () => {
          const weapon = bandits.spare(id);
          if (weapon) {
            const lost = this.inventory.add(weapon, 1);
            if (lost > 0) bandits.depositToNearestChest([{ id: weapon, count: 1 }], feet.x, feet.z);
            this.hud.notify(
              lost > 0
                ? `${name} silahını bıraktı; taşıyamadığın için en yakın kamp sandığına kondu`
                : `${name} silahını bıraktı: ${ITEMS[weapon].name}`,
              INTERACT.toastMs,
            );
            this.inventoryPanel.refresh();
          }
          return SURRENDER_TEXT.spared;
        },
      },
      {
        label: SURRENDER_TEXT.campQuestion,
        select: () =>
          campAnswer(
            feet,
            bandits.nearestCamp(feet.x, feet.z, (c) => !bandits.isCleared(c.id)),
          ),
      },
      {
        label: SURRENDER_TEXT.silent,
        kind: 'farewell',
        closes: true,
        select: () => SURRENDER_TEXT.silentReply,
      },
    ];
    this.dialogPanel.show({
      title: name,
      subtitle: SURRENDER_TEXT.subtitle,
      opening: SURRENDER_TEXT.plea,
      options,
    });
    this.input.exitLock();
  }

  /** Yolcuların eşkıya uyarısı (konuşma seçeneği); eşkıyalar kapalıysa yok. */
  private banditWarningOption(role: PersonRole, feet: { x: number; z: number }): DialogOption[] {
    const bandits = this.bandits;
    if (!bandits || !this.banditsEnabled || role === 'dervis') return [];
    return [
      {
        label: WARNING_QUESTION,
        select: () =>
          banditWarning(
            ROLES[role].address,
            feet,
            bandits.nearestCamp(feet.x, feet.z, (c) => !bandits.isCleared(c.id)),
          ),
      },
    ];
  }

  /** Dev (`U`): önüne rastgele silahlı bir eşkıya çıkarır; Shift+U en yakın kampın yol tarafına ışınlar. */
  private devBandit(teleport: boolean): void {
    const bandits = this.bandits;
    if (!bandits) return;
    const feet = this.player.position;
    if (teleport) {
      const camp = bandits.nearestCamp(feet.x, feet.z);
      if (!camp) return;
      const x = camp.x - Math.sin(camp.yaw) * 45;
      const z = camp.z - Math.cos(camp.yaw) * 45;
      this.world.prepare(x, z);
      this.player.teleport({ x, y: this.world.terrain.heightAt(x, z) + 0.2, z });
      console.info(`Kampa ışınlanma: ${camp.id}`);
      return;
    }
    const weapons = ['pala', 'club', 'pistol', 'shotgun', 'rifle'] as const;
    const weapon = weapons[Math.floor(Math.random() * weapons.length)] ?? 'pala';
    const yaw = this.playerCamera.yaw;
    bandits.spawnAt(feet.x - Math.sin(yaw) * 15, feet.z - Math.cos(yaw) * 15, weapon);
  }

  // ── Faz 11: F (11.8 drone) ──
  /** Drone: uçuş, pil, işaretler, görüş (saf mantık). */
  private readonly drone = new DroneSystem(this.events);
  private droneLayer: DroneLayer | null = null;
  private droneHud: DroneHud | null = null;
  /** Drone görüşündeyken bu adımın uçuş girdisi (WASD, Space/Z, Shift). */
  private droneInput: DroneInput = NO_INPUT;
  /** Bakılan, yerdeki drone (E ile alınır). */
  private droneTarget: Readonly<Structure> | null = null;

  private setupDrone(): void {
    const groundAt = (x: number, z: number): number => this.world.terrain.heightAt(x, z);
    this.droneLayer = new DroneLayer();
    this.world.scene.add(this.droneLayer.group);
    this.droneHud = new DroneHud(this.container);
    this.saveSections.drone = {
      toSave: () => this.drone.toSave(groundAt),
      loadSave: (save) => {
        this.drone.loadSave(save);
        this.world.setViewFocus?.(null);
        // Uçuşta kaydedilen drone, kaydın zemin noktasında yere inmiş olarak bulunur.
        if (save.state === 'landed') {
          this.structureSystem.structures.add('drone', save.x, save.y, save.z, 0);
        }
      },
    };
    const toast = (text: string): void => this.hud.notify(text, INTERACT.toastMs);
    this.offs.push(
      this.targets.register(this.drone),
      this.events.on('drone:launched', () =>
        toast('Drone kalktı · Q: görüş · H: eve dön · sol tık: işaretle'),
      ),
      this.events.on('drone:outOfRange', () => toast('Sinyal zayıf: drone geri dönüyor')),
      this.events.on('drone:controlRestored', () => toast('Drone denetimi geri geldi')),
      this.events.on('drone:batteryLow', () => toast('Drone pili azaldı: eve döndür (H)')),
      this.events.on('drone:damaged', ({ health }) =>
        toast(health > 0 ? 'Drone vuruldu!' : 'Drone vuruldu, düşüyor!'),
      ),
      this.events.on('drone:landed', () => this.stowDrone()),
      this.events.on('drone:crashed', ({ x, y, z, shot }) => {
        this.world.setViewFocus?.(null);
        this.structureSystem.structures.add('drone', x, y, z, 0);
        toast(
          `${shot ? 'Drone düşürüldü' : "Drone'un pili bitti, düştü"}: yerden E ile alınabilir`,
        );
      }),
      this.events.on('drone:marked', ({ label, action }) =>
        toast(action === 'added' ? `İşaretlendi: ${label}` : `İşaret kaldırıldı: ${label}`),
      ),
      // Oyuncunun bedeni savunmasızdır: hasar alınca görüş oyuncuya döner.
      this.events.on('player:damaged', () => {
        if (!this.drone.viewActive || !DRONE.autoReturnOnDamage) return;
        this.setDroneView(false);
        toast('Bedenin saldırı altında! Görüş sana döndü');
      }),
      this.events.on('player:died', () => this.setDroneView(false)),
      () => {
        this.droneLayer?.dispose();
        this.droneHud?.dispose();
      },
    );
  }

  private updateDrone(dt: number): void {
    const feet = this.player.position;
    const structures = this.structureSystem.structures;
    const settlements = this.world.settlementMap ?? null;
    this.drone.update(
      dt,
      this.droneInput,
      {
        groundAt: (x, z) => this.world.terrain.heightAt(x, z),
        solidAt: settlements
          ? (x, y, z) => {
              const b = settlements.buildingAt(x, z);
              return b !== null && y < b.y + shapeVariant(b.kind, b.floors, b.ruined).height;
            }
          : undefined,
      },
      { x: feet.x, y: feet.y, z: feet.z },
      this.testMode,
    );
    const state = this.drone.state;
    this.world.setViewFocus?.(this.drone.viewActive && state ? { x: state.x, z: state.z } : null);

    // Güneş paneli şarjı: envanterdeki drone oyuncuyla, yerdeki drone kendi yerinde dolar.
    if (!this.drone.flying) {
      const all = structures.all();
      const landed = all.find((s) => s.kind === 'drone');
      const at = this.inventory.has('drone') ? feet : landed;
      if (at && nearPanel(all, at.x, at.z)) {
        this.drone.charge(dt, solarRate(this.survival.clock.sun.altitudeDeg));
      }
    }

    // Yerdeki drone'a bakıp E: alınır (basış anı; yalnızca hedef varken tüketilir).
    this.droneTarget =
      !this.drone.viewActive && this.survival.alive
        ? structureInView(
            structures,
            { x: feet.x, z: feet.z, yaw: this.playerCamera.yaw },
            { reach: DISMANTLE.reach, viewConeDeg: STORAGE.viewConeDeg, kinds: ['drone'] },
          )
        : null;
    if (this.droneTarget && this.input.consumeInteractPress()) {
      const target = this.droneTarget;
      if (this.inventory.add('drone', 1) === 0) {
        structures.remove(target.id);
        this.hotbar.autoAssign('drone');
        this.inventoryPanel.refresh();
        this.hud.notify(
          `Drone alındı · pil %${batteryPercent(this.drone.battery)}`,
          INTERACT.toastMs,
        );
      } else {
        this.hud.notify('Envanter dolu: drone sığmıyor', INTERACT.toastMs);
      }
      this.droneTarget = null;
    }
  }

  private drawDrone(time: number, feet: { x: number; y: number; z: number }): void {
    const state = this.drone.state;
    const view = this.drone.viewActive;
    const size = this.renderer.getSize(this.droneSize);
    this.droneLayer?.update(
      state,
      {
        active: view,
        pitch: this.drone.pitch,
        fovDeg: this.drone.fovDeg,
        aspect: size.x / Math.max(size.y, 1),
      },
      time,
    );
    // Drone görüşünde oyuncunun bedeni görünür (yerinde bekler).
    if (view) this.playerModel.setVisible(true);
    const from = view && state ? state : feet;
    const marks = this.drone.marks.map((m) => ({ label: m.label, ...bearingTo(from, m) }));
    this.hud.setCompassMarks(marks.map((m) => ({ bearing: m.bearing, label: m.label })));
    const visible = this.survival.alive && !this.overlayOpen && !this.loop.paused;
    this.droneHud?.update(
      {
        flying: state !== null,
        view,
        mode: state?.mode ?? 'manual',
        battery: this.drone.battery,
        altitude: state ? state.y - this.world.terrain.heightAt(state.x, state.z) : 0,
        distance: state ? rangeOf(state, feet) : 0,
        noise: this.drone.noise(feet),
        marks,
      },
      visible,
    );
  }

  private readonly droneSize = new Vector2();

  /** Çizimde kullanılan kamera: drone görüşünde drone kamerası. */
  private activeCamera(): Camera {
    return this.drone.viewActive && this.droneLayer
      ? this.droneLayer.camera
      : this.playerCamera.camera;
  }

  private setDroneView(on: boolean): void {
    this.drone.setView(on);
    if (!this.drone.viewActive) {
      this.world.setViewFocus?.(null);
      this.droneInput = NO_INPUT;
    }
  }

  /** `Q`: oyuncu ↔ drone görüşü. */
  private toggleDroneView(): void {
    if (!this.survival.alive || this.overlayOpen || this.loop.paused) return;
    if (!this.drone.flying) {
      this.hud.notify('Havada drone yok (kısayolda seçip sol tıkla kaldır)', INTERACT.toastMs);
      return;
    }
    this.setDroneView(!this.drone.viewActive);
  }

  /** `H`: drone'u eve döndür ve indir. */
  private droneHome(): void {
    if (!this.drone.flying || !this.survival.alive || this.loop.paused) return;
    this.drone.recall();
    this.hud.notify('Drone eve dönüyor', INTERACT.toastMs);
  }

  /** İnen drone envantere alınır; sığmazsa oyuncunun yanına yere konur. */
  private stowDrone(): void {
    this.world.setViewFocus?.(null);
    this.droneInput = NO_INPUT;
    if (this.inventory.add('drone', 1) === 0) {
      this.hotbar.autoAssign('drone');
      this.inventoryPanel.refresh();
      this.hud.notify('Drone indi ve alındı', INTERACT.toastMs);
      return;
    }
    const feet = this.player.position;
    this.structureSystem.structures.add(
      'drone',
      feet.x + 1,
      this.world.terrain.heightAt(feet.x + 1, feet.z),
      feet.z,
      0,
    );
    this.hud.notify('Drone indi (envanter dolu: yanına kondu)', INTERACT.toastMs);
  }

  /** Drone görüşünde oyuncu girdisini drone'a yönlendirir ve oyuncuya boş niyet döner. */
  private droneIntercept(intent: MoveIntent): MoveIntent {
    if (!this.drone.viewActive) {
      this.droneInput = NO_INPUT;
      return intent;
    }
    this.droneInput = {
      forward: intent.forward,
      strafe: intent.strafe,
      up: intent.jump,
      down: intent.descend === true,
      fast: intent.run,
    };
    return { forward: 0, strafe: 0, run: false, jump: false, descend: false };
  }

  /** Drone görüşünde fare: drone yaw'ı ve kamera eğimi (yakınlaştıkça hassasiyet düşer). Uygulandıysa true. */
  private droneLook(dx: number, dy: number): boolean {
    if (!this.drone.viewActive) return false;
    const sens =
      INPUT.mouseSensitivity *
      this.settings.current.mouseSensitivity *
      (this.drone.fovDeg / DRONE.fovDeg);
    this.drone.look(dx * sens, dy * sens);
    return true;
  }

  /** Drone görüşünde tekerlek yakınlaştırır (aşağı = uzaklaş). Uygulandıysa true. */
  private droneWheel(step: 1 | -1): boolean {
    if (!this.drone.viewActive) return false;
    this.drone.zoom(step === 1 ? -1 : 1);
    return true;
  }

  /**
   * Sol tık (Faz 11, F): drone görüşündeyse bakılanı işaretler; elde drone varsa kaldırır (pil azsa ve pil eşyası
   * varsa önce yeni pil takar). Tıklamayı aldıysa true.
   */
  private droneClick(): boolean {
    if (!this.survival.alive || this.overlayOpen || this.loop.paused) return false;
    if (this.drone.viewActive) {
      this.markFromDrone();
      return true;
    }
    if (
      this.placement.aiming ||
      this.hotbar.selectedItem !== 'drone' ||
      !this.inventory.has('drone')
    ) {
      return false;
    }
    if (this.drone.flying) {
      this.hud.notify('Drone zaten havada (Q: görüş, H: eve dön)', INTERACT.toastMs);
      return true;
    }
    if (this.drone.battery < DRONE.minLaunchBattery && this.inventory.remove('battery', 1)) {
      this.drone.insertBattery();
      this.hud.notify("Drone'a yeni pil takıldı", INTERACT.toastMs);
    }
    const feet = this.player.position;
    const result = this.drone.launch({ x: feet.x, z: feet.z, yaw: this.playerCamera.yaw }, (x, z) =>
      this.world.terrain.heightAt(x, z),
    );
    if (result === 'no_battery') {
      this.hud.notify(
        "Drone'un pili bitmiş: güneş panelinin yanında şarj et ya da pil taşı",
        INTERACT.toastMs,
      );
      return true;
    }
    if (result === 'ok') {
      this.inventory.remove('drone', 1);
      this.inventoryPanel.refresh();
    }
    return true;
  }

  /** Drone kamerasının baktığı canlıyı, eşkıyayı, kampı ya da yapıyı (yoksa zemini) işaretler. */
  private markFromDrone(): void {
    const s = this.drone.state;
    if (!s) return;
    const cos = Math.cos(this.drone.pitch);
    const ray = {
      x: s.x,
      y: s.y - 0.12,
      z: s.z,
      dx: -Math.sin(s.yaw) * cos,
      dy: Math.sin(this.drone.pitch),
      dz: -Math.cos(s.yaw) * cos,
    };
    const range = DRONE.markRange;
    const candidates: MarkCandidate[] = [];
    for (const v of this.creatures.near(s.x, s.z, range)) {
      if (!v.dead) {
        candidates.push({
          x: v.x,
          y: v.y + v.height / 2,
          z: v.z,
          radius: v.radius,
          label: CREATURE_NAMES[v.kind],
        });
      }
    }
    if (this.bandits && this.banditsEnabled) {
      for (const b of this.bandits.views()) {
        if (b.state !== 'dead' && Math.hypot(b.x - s.x, b.z - s.z) <= range) {
          candidates.push({
            x: b.x,
            y: b.y + 0.9,
            z: b.z,
            radius: 0.5,
            label: b.role === 'leader' ? 'Eşkıya reisi' : 'Eşkıya',
          });
        }
      }
      for (const c of this.bandits.camps) {
        if (Math.hypot(c.x - s.x, c.z - s.z) <= range) {
          const y = this.world.terrain.heightAt(c.x, c.z);
          candidates.push({ x: c.x, y: y + 1, z: c.z, radius: 8, label: 'Eşkıya kampı' });
        }
      }
    }
    for (const b of this.world.settlementMap?.buildingsNear(s.x, s.z, range) ?? []) {
      const shape = shapeVariant(b.kind, b.floors, b.ruined);
      candidates.push({
        x: b.x,
        y: b.y + shape.height / 2,
        z: b.z,
        radius: Math.max(shape.width, shape.depth) / 2,
        label: BUILDING_NAMES[b.kind],
      });
    }
    for (const st of this.structureSystem.structures.near(s.x, s.z, range)) {
      candidates.push({ x: st.x, y: st.y + 0.8, z: st.z, radius: 1.2, label: ITEMS[st.kind].name });
    }
    const t = rayTerrain(ray, { x: ray.dx, y: ray.dy, z: ray.dz }, range, (x, z) =>
      this.world.terrain.heightAt(x, z),
    );
    const ground = t === null ? null : { x: ray.x + ray.dx * t, z: ray.z + ray.dz * t };
    this.drone.mark(candidates, ray, ground);
  }

  /** Yerdeki drone'a bakılıyorsa ipucu. */
  private promptDrone(): string | null {
    if (this.drone.viewActive) return null;
    return this.droneTarget ? `E: Drone'u al · pil %${batteryPercent(this.drone.battery)}` : null;
  }
}
