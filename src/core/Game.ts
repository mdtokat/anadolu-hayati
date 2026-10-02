import { PointLight, WebGLRenderer } from 'three';
import {
  COMBAT,
  COMBAT_HUD,
  AMBIENT,
  CLOCK,
  DISMANTLE,
  EQUIPMENT,
  HINTS,
  INPUT,
  INTERACT,
  PROVINCE_NOTICE,
  PILOT,
  PROVINCE_PLACES,
  PLACE_NOTICE,
  QUALITY_PRESETS,
  SAVE,
  SEARCH,
  STORAGE,
  PLAYER,
  SURVIVAL,
  SURVIVAL_HUD,
  TELEPORTS,
  VERTICAL_SCALE,
  WORLD,
} from '../config';
import { CarcassButcher, pickCarcass } from '../combat/carcass';
import { defenseFor } from '../combat/damage';
import { CombatSystem } from '../combat/CombatSystem';
import { CookingSystem } from '../combat/cooking';
import { BuildingSearch, searchPrompt, searchTarget, searchedToast } from '../settlements/search';
import { PeopleSystem, personInView, type Person } from '../people/PeopleSystem';
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
import { pickFocus, lookDirection } from '../interaction/focus';
import { GatherSystem } from '../interaction/gather';
import { collectedToast, gatherPrompt } from '../interaction/promptText';
import { craft } from '../items/craft';
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
import { stationsNear } from '../placement/stations';
import { isPieceKind } from '../placement/pieces';
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
import { heldLabel, hotbarSignature, hotbarViews } from '../ui/hotbarView';
import { formatDebugInfo, formatLocation } from '../ui/hudFormat';
import { formatDay } from '../ui/survivalFormat';
import { GameMenu } from '../ui/GameMenu';
import { CreditsPanel } from '../ui/CreditsPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { createSettingsStore, type SettingsStore } from '../settings/SettingsStore';
import type { Settings } from '../settings/settings';
import { AmbientAudio } from '../audio/AmbientAudio';
import { ambientMix } from '../audio/ambientMix';
import { Autosaver } from '../save/Autosaver';
import { createNewGameSave } from '../save/newGame';
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
import { TargetRegistry, creatureTargetProvider, playerTargetProvider } from '../combat/targets';
import { WEAPON_IDS, WeaponState } from '../items/weaponState';
import { resolveContextAction } from './inputMapping';
// ── Faz 11: D (11.5 silahlar) ──
import { CAMERA } from '../config';
import { RangedSystem, aimCamera, type FireResult } from '../combat/RangedSystem';
import { ammoOf } from '../combat/ammo';
import type { SolidQuery } from '../combat/ballistics';
import { shotSolids } from '../combat/shotSolids';
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
  'forge',
  'stone_oven',
  'hand_mill',
  'drying_rack',
  'bedroll',
  'solar_panel',
  'wood_fence',
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

/** Oyunun kök nesnesi: renderer, fizik, dünya, oyuncu ve sabit adımlı döngüyü bir araya getirir. */
export class Game {
  readonly events = new EventBus<GameEvents>();
  /** Hayatta kalma durumu: saat, iklim, göstergeler (saf mantık; dev araçları da okur). */
  readonly survival = new SurvivalSystem(this.events);
  /** Oyuncunun envanteri (arayüzü 4.7'de; şimdilik toplama bildirimleri ve dev erişimi). */
  readonly inventory = new Inventory();
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
  /** Terk edilmiş yapıları arama (Faz 10). */
  readonly search = new BuildingSearch(this.events, this.inventory);
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
  /** Oyuncu bir caminin içinde mi (kutsal, güvenli alan; Faz 10)? */
  private inSanctuary = false;
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

  private readonly renderer: WebGLRenderer;
  private readonly world: GameWorld;
  private readonly player: Player;
  private readonly playerCamera: PlayerCamera;
  private readonly playerModel = new PlayerModel();
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
  private readonly deathScreen: DeathScreen;
  private readonly inventoryPanel: InventoryPanel;
  private readonly storagePanel: StoragePanel;
  /** Envanter paneli açık: oyun duraklı (fare serbest) ama duraklatma menüsü çıkmaz. */
  private inventoryOpen = false;
  /** Açık sandığın kimliği (Faz 9; sandık paneli açıkken oyun envanterdeki gibi duraklıdır). */
  private storageOpenId: StructureId | null = null;
  /** Bu adımda `E` ile açılabilecek sandık (ipucu ve su içme engeli için). */
  private storageTarget: Readonly<Structure> | null = null;
  /** Bu adımda bakılan (sökülebilecek) yapı. */
  private dismantleTarget: Readonly<Structure> | null = null;
  /** Bakılan kapı (modüler parça): `E` basışında açılır/kapanır. */
  private doorTarget: Readonly<Structure> | null = null;
  /** Kısayoldan açılan yerleştirme: yapı türü ve slotu (hayalet kapanınca seçim de kalkar). */
  private heldPlacement: { kind: StructureKind; slot: number } | null = null;
  /** Test modu (Ayarlar): uçma, sınırsız malzeme (`TEST_MODE`). */
  private testMode = false;
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
      },
      isAlive: () => this.survival.alive,
      freeBuild: () => this.testMode,
    });

    this.input = new Input(this.renderer.domElement, document, this.events, window, {
      devTeleportKeys: import.meta.env.DEV,
    });
    this.fps = import.meta.env.DEV ? new FpsCounter(container) : null;
    this.hud = new Hud(container, import.meta.env.DEV);
    this.settingsPanel = new SettingsPanel(container, this.settings);
    this.ambient = new AmbientAudio(this.settings);
    this.creditsPanel = new CreditsPanel(container);
    this.pauseMenu = new GameMenu(container, this.events, {
      store: this.saves,
      openSettings: () => this.settingsPanel.show(),
      openCredits: () => this.creditsPanel.show(),
      isSuppressed: () => this.overlayOpen,
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
      onCraft: (recipe) => this.craftRecipe(recipe),
      onDrink: () => this.drinkContainer(),
      onDrop: (slot, count) => this.dropFromSlot(slot, count),
      onClose: () => this.closeInventory(),
      getVitals: () => this.survival.state,
      getStations: () => this.stationsHere(),
      hotbar: this.hotbar,
      onAssignHotbar: (slot, item) => this.assignHotbar(slot, item),
    });
    this.dialogPanel = new DialogPanel(container, () => this.closeDialog());
    this.storagePanel = new StoragePanel(container, this.inventory, {
      onStore: (slot) => this.moveToStorage(slot),
      onTake: (slot) => this.takeFromStorage(slot),
      onStoreAll: () => this.moveAllStorage('store'),
      onTakeAll: () => this.moveAllStorage('take'),
      onClose: () => this.closeStorage(),
    });
    this.deathScreen = new DeathScreen(container, () => this.respawnPlayer());

    // Başlangıçta duraklatılmış: ilk tıklamayla pointer lock alınınca oyun başlar.
    this.loop = new GameLoop({
      update: (step) => this.update(step),
      render: (alpha) => this.render(alpha),
    });
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
      this.events.on('input:hotbarCycle', ({ step }) => this.cycleHotbar(step)),
      this.events.on('player:died', (death) => {
        this.placement.cancel();
        this.hud.setPrompt(null);
        this.deathScreen.show(death);
        this.input.exitLock(); // fareyle "Yeniden Doğ"a tıklanabilsin
      }),
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
      this.events.on('building:searched', ({ items }) =>
        this.hud.notify(
          searchedToast(items, (id) => ITEMS[id].name),
          INTERACT.toastMs,
        ),
      ),
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
          damage: (amount) => this.combat.receiveShot(amount),
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
      kind === 'region' ? loadWorld(WORLD.id) : null,
      initPhysics(),
    ]);

    const physics = new PhysicsWorld();
    const world: GameWorld =
      region !== null
        ? new RegionWorld(region, physics)
        : new TestScene(physics, new ProceduralHeightSource());
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
    if (event.code === 'KeyJ') this.giveDev(FAZ11_DEV_WEAPONS);
    if (event.code === 'KeyY') this.giveDev(FAZ11_DEV_FARMING);
    if (event.code === 'KeyM') this.giveDev(FAZ11_DEV_DRONE);
    // L: Faz 10 eşyaları (kiler erzakı, bakır tencere); N: önüne bir yolcu çıkar (konuşma/takas denemesi).
    if (event.code === 'KeyL') {
      for (const id of ['bulgur', 'tarhana', 'black_tea', 'copper_pot', 'pekmez'] as const) {
        this.inventory.add(id, id === 'copper_pot' ? 1 : 2);
      }
    }
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
    if (!(this.world instanceof RegionWorld) || !this.survival.alive) return null;
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
    this.butcher.reset();
    this.filler.reset();
    this.dismantler.reset();
    this.closeStorage(false);
    this.closeDialog(false);
    this.people.clear();
    this.deathScreen.hide();
    this.hud.setPrompt(null);
    this.inventoryPanel.refresh();
    this.lastSurvivalHudUpdate = -Infinity;
    this.lastLocationUpdate = -Infinity;
    this.provinceTracker.reset();
    this.lastPrayerHour = null; // yükleme saati atlatır: arada kalan vakitler bildirilmesin
    this.placeTracker.reset();
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
      // Faz 11 (v5): C `farm`, E `bandits`, F `drone` bölümlerini kendi setup'larında bağlar (`saveSections`).
      weapons: this.weapons,
      ...this.saveSections,
    };
  }

  /** Faz 11 akışlarının kendi `setupX()`'lerinde doldurduğu kayıt bölümleri (C `farm`, E `bandits`, F `drone`). */
  private readonly saveSections: Pick<SaveTargets, 'farm' | 'bandits' | 'drone'> = {};

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
    this.playerModel.dispose();
    this.player.dispose();
    this.structureLayer.dispose();
    this.structureColliders.dispose();
    this.torchLight.removeFromParent();
    this.torchLight.dispose();
    this.creatureLayer.dispose();
    this.peopleLayer.dispose();
    this.dialogPanel.dispose();
    this.combat.dispose();
    this.creatures.dispose();
    this.world.dispose();
    this.physics.dispose();
    if (this.lockFallback !== null) clearTimeout(this.lockFallback);
    this.pauseMenu.dispose();
    this.settingsPanel.dispose();
    this.ambient.dispose();
    this.creditsPanel.dispose();
    this.inventoryPanel.dispose();
    this.storagePanel.dispose();
    this.deathScreen.dispose();
    this.hud.dispose();
    this.fps?.dispose();
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

  private update(step: number): void {
    if (!this.survival.alive) return; // ölü: oyun donar, ölüm ekranı gösterilir
    this.autosaver.update(step);
    this.structureColliders.sync(); // yeni/sökülen katı yapılar oyuncu hareketinden önce

    // Sabit adım: önce oyuncu hareketi (kinematik hedef), sonra fizik adımı.
    const polled = this.input.pollIntent();
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
    this.creatures.update(step, this.creatureContext(activityFromIntent(intent)));
    this.combat.update(step);
    // Faz 11 akışları (her akış yalnızca kendi yönteminin gövdesini yazar).
    this.updateBuilding2(step);
    this.updateStations(step);
    this.updateFarming(step);
    this.updateRanged(step);
    this.updateBandits(step);
    this.updateDrone(step);
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
        ...(settlements ? { search: this.search } : {}),
      },
      {
        held,
        feet,
        prop: focus?.prop ?? null,
        carcass: (this.carcassTarget = this.carcassInReach(feet)),
        building,
        alive: this.survival.alive,
      },
    );

    // Diğer insanlar (Faz 10): kinematik yürüyüş; bakılan kişiyle `E` ile konuşulur (basış anında).
    const peopleWorld = this.world instanceof RegionWorld ? this.world.peopleWorld : null;
    if (peopleWorld) {
      this.people.update(step, { x: feet.x, z: feet.z, alive: this.survival.alive }, peopleWorld);
    }
    this.personTarget =
      interaction.taker === null && this.survival.alive
        ? personInView(this.people.list(), pose)
        : null;

    // Sandık (Faz 9): `E`'yi başka eylem almadıysa bakılan sandık açılır (basış anında; basılı tutma değil).
    const structures = this.structureSystem.structures;
    const interactPressed = this.input.consumeInteractPress();
    if (this.personTarget && interactPressed) {
      this.openDialog(this.personTarget);
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
    // Kapı (modüler parça): `E`'yi başka eylem almadıysa bakılan kapı açılır/kapanır (basış anında).
    this.doorTarget =
      interaction.taker === null && this.personTarget === null && this.storageTarget === null
        ? structureInView(structures, pose, {
            reach: DOOR_REACH,
            viewConeDeg: STORAGE.viewConeDeg,
            kinds: ['door'],
          })
        : null;
    if (this.doorTarget && interactPressed) this.toggleDoor(this.doorTarget.id);
    // Faz 11: `E` sırasının sonu (kapıdan sonra, sudan önce): E teslim olan eşkıya, üst arama, kamp sandığı.
    const banditTook = this.interactBandits(
      interaction.taker === null &&
        this.personTarget === null &&
        this.storageTarget === null &&
        this.doorTarget === null,
      interactPressed,
      held,
      step,
    );
    const drinkAllowed =
      interaction.drinkAllowed &&
      this.storageTarget === null &&
      this.doorTarget === null &&
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
      fires: this.structureSystem.structures.all().filter(isLit),
      structures: this.structureSystem.structures.all(),
      terrain: this.world.creatureTerrain ?? null,
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
    return this.inventoryOpen || this.storageOpenId !== null || this.talkingTo !== null;
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
    if (this.talkingTo === null) return;
    this.talkingTo.talking = false;
    this.talkingTo = null;
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
      this.hud.notify('Sandık dolu', INTERACT.toastMs);
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
    const open = this.structureSystem.structures.toggleDoor(id);
    if (open !== null) this.hud.notify(open ? 'Kapı açıldı' : 'Kapı kapandı', INTERACT.toastMs);
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
      this.hud.notify(`${ITEMS[id].name}: tatlı su kenarında E ile doldur`, INTERACT.toastMs);
      return;
    }
    this.hotbar.select(this.hotbar.selected === slot ? null : slot);
    this.onHeldChanged();
  }

  /** Fare tekerleği: seçimi kaydırır. */
  private cycleHotbar(step: 1 | -1): void {
    if (!this.survival.alive) return;
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
    if (slot !== null && id !== null && isStructureKind(id)) {
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
    if (id === 'water_container_full') {
      const result = drinkFromContainer(this.inventory, this.survival, this.events);
      this.hud.notify(
        result.ok ? `Su kabından içtin (+${Math.round(result.amount)} Su)` : 'Susuz değilsin',
        INTERACT.toastMs,
      );
      return;
    }
    const eaten = eatItem(this.inventory, this.survival, id);
    this.hud.notify(eaten ? `Yedin: ${ITEMS[eaten].name}` : 'Tokluk dolu', INTERACT.toastMs);
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
    if (item !== null) this.hud.notify(`Yedin: ${ITEMS[item].name}`, INTERACT.toastMs);
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
    const dropped = this.inventory.removeFromSlot(slot, count);
    if (dropped) {
      this.hud.notify(
        `Atıldı: ${ITEMS[dropped.id].name}${dropped.count > 1 ? ` ×${dropped.count}` : ''}`,
        INTERACT.toastMs,
      );
    }
    this.inventoryPanel.refresh();
  }

  private craftRecipe(id: RecipeId): void {
    const result = craft(this.inventory, RECIPES[id], this.stationsHere());
    if (result.ok) {
      this.events.emit('item:crafted', {
        recipe: id,
        item: result.output.id,
        count: result.output.count,
      });
    } else {
      this.inventoryPanel.refresh();
    }
  }

  /** Ölüm ekranındaki "Yeniden Doğ": göstergeler dolar, oyuncu rastgele güvenli noktaya taşınır. */
  private respawnPlayer(): void {
    if (this.survival.alive) return;
    this.survival.respawn();
    const point = this.world.respawnPoint?.(this.survival.deathCount) ?? null;
    if (point) {
      this.world.prepare(point.x, point.z);
      this.player.teleport(point);
    } else {
      this.player.respawn();
    }
    this.deathScreen.hide();
    this.input.requestLock();
  }

  private render(alpha: number): void {
    // Bakış her render karesinde uygulanır: fare hareketi 60 Hz'e kısıtlanmaz.
    const look = this.input.consumeLook();
    this.playerCamera.applyMouse(look.dx, look.dy);

    const feet = this.player.renderPosition(alpha);
    const now = performance.now();
    this.world.update(feet.x, feet.z, now / 1000);
    this.world.setSun?.(this.survival.clock.sun);
    this.playerCamera.update(feet);
    this.playerModel.update(feet, this.playerCamera.yaw);
    this.structureLayer.update(now / 1000, feet.x, feet.z);
    this.structureLayer.setGhost(this.survival.alive ? this.placement.ghost : null);
    this.updateTorch(now / 1000, feet);
    this.creatureLayer.update(this.visibleCreatures(feet), now / 1000);
    this.peopleLayer.sync(this.people.list());
    // Faz 11 akışlarının çizim katmanları (her akış yalnızca kendi yönteminin gövdesini yazar).
    this.drawStations(now / 1000, feet);
    this.drawFarming(now / 1000, feet);
    this.drawRanged(now / 1000, feet);
    this.drawBandits(now / 1000, feet);
    this.drawDrone(now / 1000, feet);

    this.renderer.render(this.world.scene, this.playerCamera.camera);
    this.fps?.frame();
    this.updateLocationHud(now, feet);
    this.updateAmbient(now, feet);
    this.updateSurvivalHud(now);
    this.updateHotbarHud();
    this.hud.setHeading(this.playerCamera.yaw);
    this.updatePrompt();
    if (import.meta.env.DEV) {
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
      }),
    );
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
    });
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
      shelterBuilt: structures.some((s) => s.kind === 'lean_to' || s.kind === 'wooden_hut'),
      preyNearby: this.creatures
        .views()
        .some(
          (v) =>
            !v.dead &&
            (v.kind === 'roe_deer' || v.kind === 'wild_boar') &&
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
    const person = alive ? this.personTarget : null;
    if (person) {
      this.hud.setProgress(null);
      this.hud.setPrompt(`E: ${person.name} ile konuş`);
      return;
    }
    const storage = alive ? this.storageTarget : null;
    if (storage) {
      this.hud.setProgress(null);
      this.hud.setPrompt(storagePrompt(storage.kind));
      return;
    }
    const door = alive ? this.doorTarget : null;
    if (door) {
      this.hud.setProgress(null);
      this.hud.setPrompt(doorPrompt(door.open === true));
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
      if (target.kind === 'foundation' || target.kind === 'roof' || this.exposure.sheltered) {
        return null;
      }
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
    const text = toggleToast(this.placement.toggle(kind), kind);
    if (text) this.hud.notify(text, INTERACT.toastMs);
  }

  /** Sol tık: yerleştirme hayaleti varsa onaylar, yoksa saldırır. */
  private primaryAction(): void {
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
    // Faz 11 (D): elde menzilli silah varsa sol tık ateş eder (yakın dövüş yok).
    if (this.fireRanged()) return;
    const result = this.combat.attack(this.meleeAim());
    if (result.status === 'exhausted') this.hud.notify('Çok yorgunsun', INTERACT.toastMs);
    // Faz 11 (E): canlıya isabet etmeyen salınış eşkıyaya/yankesiciye vurabilir.
    if (result.status === 'miss' && result.weapon !== null) this.meleeBandits(result.weapon);
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.maxPixelRatio));
    this.resize(); // piksel oranı değişince çizim tamponu yeniden boyutlanmalı
    this.world.setQuality?.(preset);
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
    this.player.setFlying(!this.player.isFlying);
    this.updateModeBadge();
    this.hud.notify(this.player.isFlying ? 'Uçuş açık' : 'Uçuş kapalı', INTERACT.toastMs);
  }

  private updateModeBadge(): void {
    this.hud.setModeBadge(
      this.testMode ? (this.player.isFlying ? 'Test modu · Uçuş' : 'Test modu') : null,
    );
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
  private setupStations(): void {}
  private updateStations(_dt: number): void {}
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
    this.offs.push(
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
    const cam = aimCamera(this.ranged.weapon, this.ranged.aimFraction, CAMERA.fov);
    this.playerCamera.setAim(cam.fovDeg, cam.sensitivity, cam.firstPerson);
    const sway = this.ranged.sway;
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
      },
    );
    if (result.status === 'fired' && result.weapon) {
      this.playerCamera.kick(result.recoil);
      this.tracers?.add(result.weapon, result.shots, performance.now() / 1000);
      this.gunAudio?.play(result.weapon);
    } else if (result.status === 'exhausted') {
      this.hud.notify('Çok yorgunsun', INTERACT.toastMs);
    }
    return true;
  }

  // ── Faz 11: E (11.6/11.7 eşkıya ve yankesici) ──
  private setupBandits(): void {}
  private updateBandits(_dt: number): void {
    if (!this.banditsEnabled) return;
  }
  private drawBandits(_time: number, _feet: { x: number; y: number; z: number }): void {}
  /**
   * `E` sırasının sonu (kapıdan sonra, sudan önce). `free`: önceki hiçbir eylem `E`'yi almadı; `pressed` basış anı,
   * `held` basılı tutma. `E`'yi aldıysa true (su içme engellenir).
   */
  private interactBandits(_free: boolean, _pressed: boolean, _held: boolean, _dt: number): boolean {
    return false;
  }
  /** Eşkıya etkileşimi ipucu ve basılı tutma ilerlemesi (yoksa null). */
  private promptBandits(): { text: string; progress: number | null } | null {
    return null;
  }
  /** Canlıya isabet etmeyen yakın dövüş salınışı (`weapon`: kullanılan silah; bekleme/enerji işlendi). */
  private meleeBandits(_weapon: string): void {}

  // ── Faz 11: F (11.8 drone) ──
  private setupDrone(): void {}
  private updateDrone(_dt: number): void {}
  private drawDrone(_time: number, _feet: { x: number; y: number; z: number }): void {}
  /** `Q`: oyuncu ↔ drone görüşü. */
  private toggleDroneView(): void {}
  /** `H`: drone'u eve döndür ve indir. */
  private droneHome(): void {}
}
