import './ui.css';

/**
 * Oyun içi HUD iskeleti (HTML overlay): artı imleç, hayatta kalma göstergeleri için boş alan
 * ve (yalnızca dev modunda) geliştirici bilgisi.
 */
export class Hud {
  /** Faz 3'te sağlık/açlık/susuzluk göstergeleri buraya eklenecek. */
  readonly gauges = document.createElement('div');

  private readonly root = document.createElement('div');
  private readonly debug: HTMLElement | null;

  constructor(parent: HTMLElement, showDebug: boolean) {
    this.root.className = 'hud';
    this.root.hidden = true; // başlangıçta menü açık

    const crosshair = document.createElement('div');
    crosshair.className = 'hud-crosshair';
    this.gauges.className = 'hud-gauges';
    this.root.append(crosshair, this.gauges);

    if (showDebug) {
      this.debug = document.createElement('div');
      this.debug.className = 'hud-debug';
      this.root.append(this.debug);
    } else {
      this.debug = null;
    }
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  setDebugText(text: string): void {
    if (this.debug && this.debug.textContent !== text) this.debug.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }
}
