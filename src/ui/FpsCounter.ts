import { DEBUG } from '../config';

/** Basit FPS sayacı (HTML overlay). Yalnızca geliştirme modunda oluşturulmalıdır. */
export class FpsCounter {
  private readonly element = document.createElement('div');
  private frames = 0;
  private elapsed = 0;
  private lastTime = performance.now();

  constructor(parent: HTMLElement = document.body) {
    Object.assign(this.element.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      padding: '4px 8px',
      font: '12px/1 monospace',
      color: '#0f0',
      background: 'rgba(0, 0, 0, 0.6)',
      pointerEvents: 'none',
      zIndex: '1000',
    });
    this.element.textContent = 'FPS: --';
    parent.appendChild(this.element);
  }

  /** Her render karesinde bir kez çağrılır. */
  frame(now: number = performance.now()): void {
    this.frames++;
    this.elapsed += (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (this.elapsed >= DEBUG.fpsSampleSeconds) {
      this.element.textContent = `FPS: ${Math.round(this.frames / this.elapsed)}`;
      this.frames = 0;
      this.elapsed = 0;
    }
  }

  dispose(): void {
    this.element.remove();
  }
}
