import { WebGLRenderer } from 'three';
import { RENDER, TERRAIN_TEST } from '../config';
import { initPhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { Player } from '../player/Player';
import { PlayerCamera } from '../player/PlayerCamera';
import { PlayerModel } from '../player/PlayerModel';
import { FpsCounter } from '../ui/FpsCounter';
import { ProceduralHeightSource } from '../world/ProceduralHeightSource';
import { TestScene } from '../world/TestScene';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { GameLoop } from './GameLoop';
import { Input } from './Input';

/** Oyunun kök nesnesi: renderer, fizik, dünya, oyuncu ve sabit adımlı döngüyü bir araya getirir. */
export class Game {
  readonly events = new EventBus<GameEvents>();

  private readonly renderer: WebGLRenderer;
  private readonly physics: PhysicsWorld;
  private readonly terrain = new ProceduralHeightSource();
  private readonly world: TestScene;
  private readonly player: Player;
  private readonly playerCamera: PlayerCamera;
  private readonly playerModel = new PlayerModel();
  private readonly input: Input;
  private readonly loop: GameLoop;
  private readonly fps: FpsCounter | null;
  private readonly offs: Array<() => void> = [];
  private readonly onResize = (): void => this.resize();

  private constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    container.appendChild(this.renderer.domElement);

    this.physics = new PhysicsWorld();
    this.world = new TestScene(this.physics, this.terrain);

    const { x, z } = TERRAIN_TEST.spawn;
    this.player = new Player(this.physics, { x, y: this.terrain.heightAt(x, z) + 0.05, z });
    this.playerCamera = new PlayerCamera(this.events, this.terrain);
    this.world.scene.add(this.playerModel.object);

    this.input = new Input(this.renderer.domElement, document, this.events, window);
    this.fps = import.meta.env.DEV ? new FpsCounter(container) : null;

    // Başlangıçta duraklatılmış: ilk tıklamayla pointer lock alınınca oyun başlar.
    this.loop = new GameLoop({
      update: (step) => this.update(step),
      render: (alpha) => this.render(alpha),
    });
    this.loop.setPaused(true);

    this.offs.push(
      this.events.on('input:pointerLockChanged', ({ locked }) => this.setPaused(!locked)),
      this.events.on('input:action', ({ action }) => {
        if (action === 'toggleCamera') this.playerCamera.toggleMode();
      }),
      this.events.on('camera:modeChanged', ({ mode }) =>
        this.playerModel.setVisible(mode === 'thirdPerson'),
      ),
    );
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  /** WASM fizik motorunu yükleyip oyunu kurar. */
  static async create(container: HTMLElement): Promise<Game> {
    await initPhysics();
    return new Game(container);
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
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    for (const off of this.offs) off();
    this.input.dispose();
    this.playerModel.dispose();
    this.player.dispose();
    this.world.dispose();
    this.physics.dispose();
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

  private readonly onCanvasClick = (): void => this.input.requestLock();

  private update(step: number): void {
    // Sabit adım: önce oyuncu hareketi (kinematik hedef), sonra fizik adımı.
    this.player.update(step, this.input.pollIntent(), this.playerCamera.yaw);
    this.physics.step();
  }

  private render(alpha: number): void {
    // Bakış her render karesinde uygulanır: fare hareketi 60 Hz'e kısıtlanmaz.
    const look = this.input.consumeLook();
    this.playerCamera.applyMouse(look.dx, look.dy);

    const feet = this.player.renderPosition(alpha);
    this.playerCamera.update(feet);
    this.playerModel.update(feet, this.playerCamera.yaw);

    this.renderer.render(this.world.scene, this.playerCamera.camera);
    this.fps?.frame();
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.playerCamera.resize(width, height);
  }
}
