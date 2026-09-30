import { WebGLRenderer } from 'three';
import { RENDER, SURVIVAL, SURVIVAL_HUD, TELEPORTS, VERTICAL_SCALE } from '../config';
import { loadRegion } from '../data/region';
import { initPhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { Player } from '../player/Player';
import { PlayerCamera } from '../player/PlayerCamera';
import { PlayerModel } from '../player/PlayerModel';
import { activityFromIntent, gateIntent } from '../survival/activity';
import { formatClock } from '../survival/clock';
import { SurvivalSystem } from '../survival/SurvivalSystem';
import { canSprint } from '../survival/vitals';
import { DeathScreen } from '../ui/DeathScreen';
import { FpsCounter } from '../ui/FpsCounter';
import { Hud } from '../ui/Hud';
import { formatDebugInfo, formatLocation } from '../ui/hudFormat';
import { formatDay } from '../ui/survivalFormat';
import { PauseMenu } from '../ui/PauseMenu';
import type { GameWorld } from '../world/GameWorld';
import { ProceduralHeightSource } from '../world/ProceduralHeightSource';
import { RegionWorld } from '../world/RegionWorld';
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

/** Bölge kimliği (public/data/regions/<id>). */
const REGION_ID = 'zonguldak-bartin-karabuk';

/** Oyunun kök nesnesi: renderer, fizik, dünya, oyuncu ve sabit adımlı döngüyü bir araya getirir. */
export class Game {
  readonly events = new EventBus<GameEvents>();
  /** Hayatta kalma durumu: saat, iklim, göstergeler (saf mantık; dev araçları da okur). */
  readonly survival = new SurvivalSystem(this.events);

  private readonly renderer: WebGLRenderer;
  private readonly world: GameWorld;
  private readonly player: Player;
  private readonly playerCamera: PlayerCamera;
  private readonly playerModel = new PlayerModel();
  private readonly input: Input;
  private readonly loop: GameLoop;
  private readonly fps: FpsCounter | null;
  private readonly hud: Hud;
  private readonly pauseMenu: PauseMenu;
  private readonly deathScreen: DeathScreen;
  private readonly offs: Array<() => void> = [];
  private readonly onResize = (): void => this.resize();
  private lastLocationUpdate = -Infinity;
  private lastSurvivalHudUpdate = -Infinity;
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

    this.input = new Input(this.renderer.domElement, document, this.events, window);
    this.fps = import.meta.env.DEV ? new FpsCounter(container) : null;
    this.hud = new Hud(container, import.meta.env.DEV);
    this.pauseMenu = new PauseMenu(container, this.events, () => this.input.requestLock());
    this.deathScreen = new DeathScreen(container, () => this.respawnPlayer());

    // Başlangıçta duraklatılmış: ilk tıklamayla pointer lock alınınca oyun başlar.
    this.loop = new GameLoop({
      update: (step) => this.update(step),
      render: (alpha) => this.render(alpha),
    });
    this.loop.setPaused(true);

    this.offs.push(
      this.events.on('input:pointerLockChanged', ({ locked }) => this.setPaused(!locked)),
      this.events.on('game:paused', () => this.hud.setVisible(false)),
      this.events.on('game:resumed', () => this.hud.setVisible(true)),
      this.events.on('input:action', ({ action }) => {
        if (action === 'toggleCamera') this.playerCamera.toggleMode();
        if (action === 'toggleBorders') this.world.toggleBorders?.();
      }),
      this.events.on('player:died', (death) => {
        this.hud.setPrompt(null);
        this.deathScreen.show(death);
        this.input.exitLock(); // fareyle "Yeniden Doğ"a tıklanabilsin
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
    this.world.dispose();
    this.physics.dispose();
    this.pauseMenu.dispose();
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
    const water = this.world.freshWaterNear?.(feet.x, feet.z) ?? null;
    this.waterInReach = water !== null;
    this.survival.update(step, {
      activity: activityFromIntent(intent),
      elevationM: Math.max(0, feet.y * VERTICAL_SCALE),
      drinking: water !== null && this.input.interactHeld,
    });
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

    this.renderer.render(this.world.scene, this.playerCamera.camera);
    this.fps?.frame();
    this.updateLocationHud(now, feet);
    this.updateSurvivalHud(now);
    if (import.meta.env.DEV) {
      this.hud.setDebugText(
        formatDebugInfo({
          position: this.player.position,
          velocity: this.player.currentVelocity,
          grounded: this.player.grounded,
          cameraMode: this.playerCamera.mode,
          props: this.world.propStats,
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
    });
    this.hud.setPrompt(this.drinkPrompt());
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
