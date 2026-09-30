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
  private readonly location = document.createElement('div');
  private readonly locationTitle = document.createElement('div');
  private readonly locationDetail = document.createElement('div');

  constructor(parent: HTMLElement, showDebug: boolean) {
    this.root.className = 'hud';
    this.root.hidden = true; // başlangıçta menü açık

    const crosshair = document.createElement('div');
    crosshair.className = 'hud-crosshair';
    this.gauges.className = 'hud-gauges';
    this.location.className = 'hud-location';
    this.locationTitle.className = 'hud-location-title';
    this.locationDetail.className = 'hud-location-detail';
    this.location.append(this.locationTitle, this.locationDetail);
    this.location.hidden = true; // konum bilgisi olmayan dünyalarda (test arenası) görünmez
    this.root.append(crosshair, this.gauges, this.location);

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

  /** Konum bilgisini gösterir (il adı ve rakım); `null` gizler. */
  setLocation(location: { title: string; detail: string } | null): void {
    this.location.hidden = location === null;
    if (location === null) return;
    if (this.locationTitle.textContent !== location.title)
      this.locationTitle.textContent = location.title;
    if (this.locationDetail.textContent !== location.detail)
      this.locationDetail.textContent = location.detail;
  }

  setDebugText(text: string): void {
    if (this.debug && this.debug.textContent !== text) this.debug.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }
}
