import { PerspectiveCamera, WebGLRenderer } from 'three';
import { CAMERA, RENDER } from '../config';
import { FpsCounter } from '../ui/FpsCounter';
import { TestScene } from '../world/TestScene';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { GameLoop } from './GameLoop';

/** Oyunun kök nesnesi: renderer, sahne ve sabit adımlı döngüyü bir araya getirir. */
export class Game {
  readonly events = new EventBus<GameEvents>();

  private readonly renderer: WebGLRenderer;
  private readonly camera: PerspectiveCamera;
  private readonly world = new TestScene();
  private readonly loop: GameLoop;
  private readonly fps: FpsCounter | null;
  private readonly onResize = (): void => this.resize();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.camera.position.set(...CAMERA.position);
    this.camera.lookAt(...CAMERA.lookAt);

    this.fps = import.meta.env.DEV ? new FpsCounter(container) : null;

    this.loop = new GameLoop({
      update: (step) => this.update(step),
      render: (alpha) => this.render(alpha),
    });

    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  start(): void {
    this.loop.start();
    this.events.emit('game:started', undefined);
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    this.world.dispose();
    this.fps?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.events.emit('game:disposed', undefined);
    this.events.clear();
  }

  private update(step: number): void {
    // Sabit adım: fizik ve oyun mantığı burada ilerler.
    this.world.update(step);
  }

  private render(alpha: number): void {
    this.world.syncVisuals(alpha);
    this.renderer.render(this.world.scene, this.camera);
    this.fps?.frame();
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }
}
