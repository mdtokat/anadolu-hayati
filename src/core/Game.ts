import { WebGLRenderer } from 'three';
import {
  INTERACT,
  PLAYER,
  RENDER,
  SURVIVAL,
  SURVIVAL_HUD,
  TELEPORTS,
  VERTICAL_SCALE,
} from '../config';
import { CombatSystem } from '../combat/CombatSystem';
import { CreatureSystem } from '../creatures/CreatureSystem';
import type { CreatureContext } from '../creatures/kinds';
import { loadRegion } from '../data/region';
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
import { Hud } from '../ui/Hud';
import { InventoryPanel } from '../ui/InventoryPanel';
import { formatDebugInfo, formatLocation } from '../ui/hudFormat';
import { formatDay } from '../ui/survivalFormat';
import { PauseMenu } from '../ui/PauseMenu';
import { CreatureLayer } from '../world/CreatureLayer';
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
}

/** Konum HUD'unun güncelleme aralığı (ms). */
const LOCATION_HUD_INTERVAL_MS = 250;

/** Söner bir ateş oyuncuya bu uzaklıkta (oyun m) ya da daha yakındaysa bildirilir. */
const EXTINGUISH_NOTICE_RADIUS = 40;

/** Bölge kimliği (public/data/regions/<id>). */
const REGION_ID = 'zonguldak-bartin-karabuk';

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
  private readonly pauseMenu: PauseMenu;
  private readonly deathScreen: DeathScreen;
  private readonly inventoryPanel: InventoryPanel;
  /** Envanter paneli açık: oyun duraklı (fare serbest) ama duraklatma menüsü çıkmaz. */
  private inventoryOpen = false;
  private lockFallback: ReturnType<typeof setTimeout> | null = null;
  private readonly offs: Array<() => void> = [];
  private readonly onResize = (): void => this.resize();
  private lastLocationUpdate = -Infinity;
  private lastSurvivalHudUpdate = -Infinity;
  /** Ayak konumundaki ateş ısısı ve barınak etkisi (her sabit adımda yenilenir). */
  private exposure: Readonly<Exposure> = NO_EXPOSURE;
  /** Fizik adımında hesaplanan: E basılı ve tatlı su erişimde mi (HUD ipucu için). */
  private waterInReach = false;

  private constructor(
    private readonly container: HTMLElement,
    private readonly physics: PhysicsWorld,
    world: GameWorld,
  ) {
    this.world = world;
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
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
    this.pauseMenu = new PauseMenu(
      container,
      this.events,
      () => this.input.requestLock(),
      () => this.inventoryOpen,
    );
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
        this.hud.setVisible(this.inventoryOpen);
        this.placement.cancel();
      }),
      this.events.on('game:resumed', () => this.hud.setVisible(true)),
      this.events.on('input:action', ({ action }) => {
        if (action === 'toggleCamera') this.playerCamera.toggleMode();
        if (action === 'toggleBorders') this.world.toggleBorders?.();
        if (action === 'placeCampfire') this.togglePlacement('campfire');
        if (action === 'placeShelter') this.togglePlacement('lean_to');
        if (action === 'confirmPlacement') this.confirmPlacement();
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
      this.events.on('camera:modeChanged', ({ mode }) =>
        this.playerModel.setVisible(mode === 'thirdPerson'),
      ),
    );
    window.addEventListener('resize', this.onResize);
    if (import.meta.env.DEV) document.addEventListener('keydown', this.onDevKey);
    this.resize();
  }

  /** WASM fizik motorunu ve (gerçek bölgede) bölge verisini yükleyip oyunu kurar. */
  static async create(container: HTMLElement, options: GameOptions = {}): Promise<Game> {
    const kind = options.world ?? 'region';
    const [region] = await Promise.all([
      kind === 'region' ? loadRegion(REGION_ID) : null,
      initPhysics(),
    ]);

    const physics = new PhysicsWorld();
    const world: GameWorld =
      region !== null
        ? new RegionWorld(region, physics)
        : new TestScene(physics, new ProceduralHeightSource());
    return new Game(container, physics, world);
  }

  /** Geliştirici kısayolu: 1–5 tuşları TELEPORTS listesindeki noktalara ışınlar (yalnızca dev modunda bağlanır). */
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

  start(): void {
    this.loop.start();
    this.events.emit('game:started', undefined);
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
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
    this.gather.update(step, held, focus?.prop ?? null);
    const gathering = this.gather.offer?.status === 'ready';

    // Ateşe yakıt: toplanabilir nesne yoksa ve ateşin yakınındaysa E yakıt atar (su içmeden önceliklidir).
    this.fireTender.update(step, held && !gathering, feet);
    const tending = this.fireTender.offer?.status === 'ready';

    const water = this.world.freshWaterNear?.(feet.x, feet.z) ?? null;
    this.waterInReach = water !== null;
    this.exposure = exposureAt(this.structureSystem.structures, feet.x, feet.y, feet.z);
    this.survival.update(step, {
      activity: activityFromIntent(intent),
      elevationM: Math.max(0, feet.y * VERTICAL_SCALE),
      drinking: water !== null && held && !gathering && !tending,
      warmthC: this.exposure.warmthC,
      sheltered: this.exposure.sheltered,
    });
  }

  /**
   * Canlı simülasyonunun her adımda dünyadan/oyuncudan aldığı bilgi. Hesap A (5.4) `terrain`'i dünyadan bağlar
   * ve gerekirse alan ekler; başka hiçbir şey bu yöntemin dışında `Game`'e dokunmaz.
   */
  private creatureContext(activity: Activity): CreatureContext {
    const feet = this.player.position;
    const { clock } = this.survival;
    return {
      player: { x: feet.x, y: feet.y, z: feet.z, activity, alive: this.survival.alive },
      hour: clock.hour,
      sunAltitudeDeg: clock.sun.altitudeDeg,
      isNight: clock.isNight,
      fires: this.structureSystem.structures.all().filter(isLit),
      terrain: null,
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
    this.creatureLayer.update(this.creatures.views());

    this.renderer.render(this.world.scene, this.playerCamera.camera);
    this.fps?.frame();
    this.updateLocationHud(now, feet);
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

  /** Konum satırı (il adı, rakım): pahalı olmasın diye saniyede birkaç kez güncellenir. */
  private updateLocationHud(now: number, feet: { x: number; y: number; z: number }): void {
    if (!this.world.locationInfo) return;
    if (now - this.lastLocationUpdate < LOCATION_HUD_INTERVAL_MS) return;
    this.lastLocationUpdate = now;
    this.hud.setLocation(formatLocation(this.world.locationInfo(feet.x, feet.z, feet.y)));
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
    const tend = alive ? this.fireTender.offer : null;
    if (tend?.status === 'ready') {
      this.hud.setPrompt(tendPrompt(tend));
      this.hud.setProgress(this.fireTender.progress > 0 ? this.fireTender.progress : null);
      return;
    }
    this.hud.setProgress(null);
    const drink = this.drinkPrompt();
    this.hud.setPrompt(
      drink ?? (offer ? gatherPrompt(offer) : null) ?? (tend ? tendPrompt(tend) : null),
    );
  }

  /** F/G: yerleştirme hayaletini aç/kapa; eşya yoksa kısa bildirim. */
  private togglePlacement(kind: StructureKind): void {
    const text = toggleToast(this.placement.toggle(kind), kind);
    if (text) this.hud.notify(text, INTERACT.toastMs);
  }

  /** Sol tık: hayaleti yapıya çevir; engel varsa nedenini söyle. */
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

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.playerCamera.resize(width, height);
  }
}
