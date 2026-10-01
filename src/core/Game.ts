import { WebGLRenderer } from 'three';
import {
  COMBAT,
  COMBAT_HUD,
  AMBIENT,
  INTERACT,
  PROVINCE_NOTICE,
  QUALITY_PRESETS,
  SAVE,
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
import type { MeleeAim } from '../combat/melee';
import { updateInteractions } from '../combat/interactChain';
import { butcherPrompt, butcheredToast, cookedToast, cookPrompt } from '../combat/promptText';
import { CreatureSystem } from '../creatures/CreatureSystem';
import type {
  CreatureContext,
  CreatureKind,
  CreatureState,
  CreatureView,
} from '../creatures/kinds';
import { playerWeakness } from '../creatures/perception';
import type { RegionData } from '../data/region';
import { loadWorld } from '../data/world';
import { pickFocus, lookDirection } from '../interaction/focus';
import { GatherSystem } from '../interaction/gather';
import { collectedToast, gatherPrompt } from '../interaction/promptText';
import { craft } from '../items/craft';
import { eatItem, quickEat } from '../items/eatItem';
import { Inventory } from '../items/Inventory';
import { isLit, type StructureKind } from '../placement/structures';
import { PlacementController } from '../placement/PlacementController';
import {
  aimPrompt,
  fuelToast,
  placeFailureText,
  placedToast,
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
import { SurvivalSystem } from '../survival/SurvivalSystem';
import { canSprint, type Activity } from '../survival/vitals';
import { DeathScreen } from '../ui/DeathScreen';
import { FpsCounter } from '../ui/FpsCounter';
import { attackPrompt, hitMarkerKind, noticedToast, vignetteStrength } from '../ui/combatFormat';
import { Hud } from '../ui/Hud';
import { InventoryPanel } from '../ui/InventoryPanel';
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
import { ProvinceTracker, provinceNoticeText } from '../world/provinceNotice';
import { CreatureLayer } from '../world/CreatureLayer';
import { demoViews } from '../world/creatureDemo';
import type { GameWorld } from '../world/GameWorld';
import { ProceduralHeightSource } from '../world/ProceduralHeightSource';
import { RegionWorld } from '../world/RegionWorld';
import { StructureLayer } from '../world/StructureLayer';
import { TestScene } from '../world/TestScene';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { GameLoop } from './GameLoop';
import { Input } from './Input';
import { teleportSlotForKey } from './inputMapping';

/** Hangi dünyanın oynanacağı: gerçek bölge ya da Faz 1 test arenası (`?world=test`). */
export type WorldKind = 'region' | 'test';

export interface GameOptions {
  world?: WorldKind;
  /** Yalnızca dev: canlı simülasyonu yerine sahte canlı demosu çizilir (`?creatures=demo`; görsel doğrulama). */
  creatureDemo?: boolean;
  /** Kullanıcı ayarları deposu; verilmezse tarayıcının `localStorage`'ı kullanılır (testte sahte verilir). */
  settings?: SettingsStore;
  /**
   * Yalnızca dev: yüklenen bölge verisini dünya kurulmadan önce dönüştürür (`?world=wide`: Faz 7 kapsamında
   * sentetik büyük dünya; gerçek Düzce–Bolu verisi gelmeden performans ölçümü için).
   */
  regionTransform?: (region: RegionData) => RegionData;
}

/** Konum HUD'unun güncelleme aralığı (ms). */
const LOCATION_HUD_INTERVAL_MS = 250;

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
  /** Yapı yerleştirme: hayalet ve onay (saf mantık). */
  readonly placement: PlacementController;
  /** Canlıların simülasyonu (saf mantık; Faz 5, Hesap A). */
  readonly creatures = new CreatureSystem(this.events);
  /** Oyuncu tarafı savaş ve av mantığı (saf mantık; Faz 5, Hesap B). */
  readonly combat = new CombatSystem(this.events, this.inventory, this.creatures, this.survival);

  /** Bakılan leşe `E` ile kesme (saf mantık; Faz 5, Hesap B). */
  readonly butcher = new CarcassButcher(this.events, this.inventory, this.creatures);
  /** Yanık ateşin yanında `E` ile et pişirme (saf mantık; Faz 5, Hesap B). */
  readonly cooking = new CookingSystem(
    this.events,
    this.inventory,
    this.structureSystem.structures,
  );

  private readonly renderer: WebGLRenderer;
  private readonly world: GameWorld;
  private readonly player: Player;
  private readonly playerCamera: PlayerCamera;
  private readonly playerModel = new PlayerModel();
  private readonly structureLayer: StructureLayer;
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
  /** Envanter paneli açık: oyun duraklı (fare serbest) ama duraklatma menüsü çıkmaz. */
  private inventoryOpen = false;
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
  private readonly provinceTracker = new ProvinceTracker();
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
    const { backend, persistent } = createBackend();
    this.saves = new SaveStore(backend, persistent);
    this.renderer = new WebGLRenderer({ antialias: true });
    // Piksel oranı ve diğer kalite/hassasiyet ayarları aşağıda `applySettings` ile uygulanır.
    container.appendChild(this.renderer.domElement);

    this.player = new Player(this.physics, world.spawn, { maxSlopeDeg: world.maxSlopeDeg });
    this.playerCamera = new PlayerCamera(this.events, world.terrain);
    this.world.scene.add(this.playerModel.object);
    this.structureLayer = new StructureLayer(this.structureSystem.structures);
    this.world.scene.add(this.structureLayer.group);
    this.creatureLayer = new CreatureLayer();
    this.world.scene.add(this.creatureLayer.group);
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
    });

    this.input = new Input(this.renderer.domElement, document, this.events, window);
    this.fps = import.meta.env.DEV ? new FpsCounter(container) : null;
    this.hud = new Hud(container, import.meta.env.DEV);
    this.settingsPanel = new SettingsPanel(container, this.settings);
    this.ambient = new AmbientAudio(this.settings);
    this.creditsPanel = new CreditsPanel(container);
    this.pauseMenu = new GameMenu(container, this.events, {
      store: this.saves,
      openSettings: () => this.settingsPanel.show(),
      openCredits: () => this.creditsPanel.show(),
      isSuppressed: () => this.inventoryOpen,
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
      onClose: () => this.closeInventory(),
      getVitals: () => this.survival.state,
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
        this.hud.setVisible(this.inventoryOpen);
        this.placement.cancel();
      }),
      this.events.on('game:resumed', () => {
        this.sessionActive = true;
        this.hud.setVisible(true);
        this.ambient.start();
      }),
      this.events.on('input:action', ({ action }) => {
        if (action === 'toggleCamera') this.playerCamera.toggleMode();
        if (action === 'toggleBorders') this.world.toggleBorders?.();
        if (action === 'placeCampfire') this.togglePlacement('campfire');
        if (action === 'placeShelter') this.togglePlacement('lean_to');
        if (action === 'primaryAction') this.primaryAction();
        if (action === 'toggleInventory') this.openInventory();
        if (action === 'eat') this.quickEatFood();
      }),
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
      this.events.on('structure:refueled', ({ seconds }) =>
        this.hud.notify(fuelToast(seconds), INTERACT.toastMs),
      ),
      this.events.on('structure:extinguished', ({ id }) => this.notifyExtinguished(id)),
      this.events.on('item:crafted', ({ item, count }) => {
        this.hud.notify(
          `Üretildi: ${ITEMS[item].name}${count > 1 ? ` ×${count}` : ''}`,
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
      this.events.on('item:cooked', ({ count }) =>
        this.hud.notify(cookedToast(count), INTERACT.toastMs),
      ),
      this.events.on('camera:modeChanged', ({ mode }) =>
        this.playerModel.setVisible(mode === 'thirdPerson'),
      ),
    );
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
    const [loaded] = await Promise.all([
      kind === 'region' ? loadWorld(WORLD.id) : null,
      initPhysics(),
    ]);
    const region = loaded && options.regionTransform ? options.regionTransform(loaded) : loaded;

    const physics = new PhysicsWorld();
    const world: GameWorld =
      region !== null
        ? new RegionWorld(region, physics)
        : new TestScene(physics, new ProceduralHeightSource());
    return new Game(container, physics, world, options.creatureDemo === true, options.settings);
  }

  /** Geliştirici kısayolu: 1–9 ve 0 tuşları TELEPORTS listesindeki noktalara ışınlar (yalnızca dev modunda bağlanır). */
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
    const slot = teleportSlotForKey(event.code);
    const target = slot === null ? undefined : TELEPORTS[slot];
    if (!target) return;
    const ok = this.teleportToLatLon(target.lat, target.lon);
    console.info(
      `Işınlanma: ${target.name}${ok ? '' : ' (yürünebilir nokta bulunamadı ya da bu dünyada desteklenmiyor)'}`,
    );
  };

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
    this.butcher.reset();
    this.deathScreen.hide();
    this.hud.setPrompt(null);
    this.inventoryPanel.refresh();
    this.lastSurvivalHudUpdate = -Infinity;
    this.lastLocationUpdate = -Infinity;
    this.provinceTracker.reset();
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
      this.loadSave(createNewGameSave(WORLD.id, this.world.spawn, new Date()));
      this.autosaver.reset();
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
    };
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
    this.playerModel.dispose();
    this.player.dispose();
    this.structureLayer.dispose();
    this.creatureLayer.dispose();
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

    // Sabit adım: önce oyuncu hareketi (kinematik hedef), sonra fizik adımı.
    const intent = gateIntent(this.input.pollIntent(), canSprint(this.survival.state));
    this.player.update(step, intent, this.playerCamera.yaw);
    this.physics.step();

    const feet = this.player.position;
    this.placement.update({ x: feet.x, z: feet.z, yaw: this.playerCamera.yaw });
    this.structureSystem.update(step);
    this.creatures.update(step, this.creatureContext(activityFromIntent(intent)));
    this.combat.update(step);
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
    // E öncelik sırası: toplama > leş kesme > pişirme > ateşe yakıt > su içme (combat/interactChain.ts).
    const interaction = updateInteractions(
      step,
      {
        gather: this.gather,
        butcher: this.butcher,
        cooking: this.cooking,
        fireTender: this.fireTender,
      },
      {
        held,
        feet,
        prop: focus?.prop ?? null,
        carcass: this.carcassInReach(feet),
        alive: this.survival.alive,
      },
    );

    const water = this.world.freshWaterNear?.(feet.x, feet.z) ?? null;
    this.waterInReach = water !== null;
    this.exposure = exposureAt(this.structureSystem.structures, feet.x, feet.y, feet.z);
    this.survival.update(step, {
      activity: activityFromIntent(intent),
      elevationM: Math.max(0, feet.y * VERTICAL_SCALE),
      drinking: water !== null && interaction.drinkAllowed,
      warmthC: this.exposure.warmthC,
      sheltered: this.exposure.sheltered,
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
    if (this.inventoryOpen || !this.survival.alive || this.loop.paused) return;
    this.inventoryOpen = true; // önce bayrak: kilit bırakılınca duraklatma menüsü çıkmasın
    this.inventoryPanel.show();
    this.input.exitLock();
  }

  /** Paneli kapatır ve fare kilidini ister; kilit verilmezse duraklatma menüsü devreye girer. */
  private closeInventory(): void {
    if (!this.inventoryOpen) return;
    this.inventoryOpen = false;
    this.inventoryPanel.hide();
    this.input.requestLock();
    if (this.lockFallback !== null) clearTimeout(this.lockFallback);
    this.lockFallback = setTimeout(() => {
      this.lockFallback = null;
      if (this.loop.paused && !this.inventoryOpen && !this.pauseMenu.visible) this.pauseMenu.show();
    }, 500);
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

  private craftRecipe(id: RecipeId): void {
    const result = craft(this.inventory, RECIPES[id]);
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
    this.creatureLayer.update(this.visibleCreatures(feet), now / 1000);

    this.renderer.render(this.world.scene, this.playerCamera.camera);
    this.fps?.frame();
    this.updateLocationHud(now, feet);
    this.updateAmbient(now, feet);
    this.updateSurvivalHud(now);
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
    const change = this.provinceTracker.observe(
      { name: info.province, inRegion: info.inRegion },
      now / 1000,
    );
    if (change) this.hud.showBanner(provinceNoticeText(change), PROVINCE_NOTICE.bannerMs);
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
      defense: defenseFor(this.inventory),
    });
  }

  /**
   * Ekran ortası ipucu ve ilerleme çubuğu (her karede; metin yalnızca değişince yazılır). Öncelik:
   * toplanabilir nesne, sonra su içme, sonra "balta gerekir"/"envanter dolu" gibi engeller.
   */
  private updatePrompt(): void {
    if (this.inventoryOpen) {
      this.hud.setPrompt(null);
      this.hud.setProgress(null);
      return;
    }
    const alive = this.survival.alive;
    const ghost = alive ? this.placement.ghost : null;
    if (ghost) {
      this.hud.setProgress(null);
      this.hud.setPrompt(aimPrompt(ghost));
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
    if (cook) {
      this.hud.setPrompt(cookPrompt(this.fireTender.offer?.status === 'ready'));
      this.hud.setProgress(this.cooking.progress > 0 ? this.cooking.progress : null);
      return;
    }
    const tend = alive ? this.fireTender.offer : null;
    if (tend?.status === 'ready') {
      this.hud.setPrompt(tendPrompt(tend));
      this.hud.setProgress(this.fireTender.progress > 0 ? this.fireTender.progress : null);
      return;
    }
    this.hud.setProgress(null);
    const drink = this.drinkPrompt();
    this.hud.setPrompt(
      drink ??
        (offer ? gatherPrompt(offer) : null) ??
        (butcher ? butcherPrompt(butcher) : null) ??
        (tend ? tendPrompt(tend) : null) ??
        this.attackHint(alive),
    );
  }

  /** Vurulabilecek canlı varsa "Sol tık: Saldır · Kurt" ipucu; yoksa null. */
  private attackHint(alive: boolean): string | null {
    if (!alive) return null;
    const hit = this.combat.target(this.meleeAim());
    return hit ? attackPrompt(hit.view.kind) : null;
  }

  /** F/G: yerleştirme hayaletini aç/kapa; eşya yoksa kısa bildirim. */
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
    if (!this.survival.alive || this.inventoryOpen || this.loop.paused) return;
    const result = this.combat.attack(this.meleeAim());
    if (result.status === 'exhausted') this.hud.notify('Çok yorgunsun', INTERACT.toastMs);
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

  /** Su kaynağı erişimdeyken ipucu: içiyorsa "İçiyorsun…", değilse "E: Su iç". */
  private drinkPrompt(): string | null {
    if (!this.survival.alive || !this.waterInReach) return null;
    if (this.survival.drinking) return 'İçiyorsun…';
    const missing = SURVIVAL.maxValue - this.survival.state.hydration;
    return missing < SURVIVAL.drinkMinDeficit ? 'Susuzluğun yok' : 'E (basılı tut): Su iç';
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
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.playerCamera.resize(width, height);
  }
}
