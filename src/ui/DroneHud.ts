import './ui.css';
import type { DroneMode } from '../drone/flight';
import { batteryPercent, droneStatus, markLine, realAltitude, realDistance } from './droneFormat';
import { el } from './widgets';

/** Drone HUD'unun her karede aldığı durum. */
export interface DroneHudState {
  /** Drone havada mı; görüş drone'da mı? */
  flying: boolean;
  view: boolean;
  mode: DroneMode;
  battery: number;
  /** Yerden yükseklik ve oyuncuya yatay uzaklık (oyun m). */
  altitude: number;
  distance: number;
  /** Sinyal karlanması 0–1. */
  noise: number;
  /** İşaretler (görüş noktasından uzaklık ve pusula yönü). */
  marks: ReadonlyArray<{ label: string; distance: number; bearing: number }>;
}

/**
 * Drone HUD'u (Faz 11, 11.8; HTML overlay): drone görüşünde karlanma, nişangâh, pil/yükseklik/uzaklık kartı, durum ve
 * tuş ipucu; oyuncu görüşünde drone havadaysa küçük bir çip. İşaret listesi (en çok 8) her iki görüşte de görünür.
 */
export class DroneHud {
  private readonly root = el('div', 'drone-hud');
  private readonly view = el('div', 'drone-hud-view');
  private readonly noise = el('div', 'drone-noise');
  private readonly info = el('div', 'drone-info');
  private readonly title = el('div', 'drone-title', 'DRONE');
  private readonly batteryFill = el('div', 'drone-battery-fill');
  private readonly stats = el('div', 'drone-stats');
  private readonly status = el('div', 'drone-status');
  private readonly hint = el(
    'div',
    'drone-hint',
    'Sol tık: işaretle · Tekerlek: yakınlaştır · Q: oyuncuya dön · H: eve dön',
  );
  private readonly chip = el('div', 'drone-chip');
  private readonly marks = el('ul', 'drone-marks');
  private lastKey = '';

  constructor(parent: HTMLElement) {
    const battery = el('div', 'drone-battery');
    battery.append(this.batteryFill);
    this.info.append(this.title, battery, this.stats, this.status);
    this.view.append(this.noise, el('div', 'drone-reticle'), this.info, this.hint);
    this.root.append(this.view, this.chip, this.marks);
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  update(state: DroneHudState | null, visible: boolean): void {
    const show = visible && state !== null && (state.flying || state.marks.length > 0);
    this.root.hidden = !show;
    if (!show || !state) return;
    this.view.hidden = !state.view;
    this.chip.hidden = state.view || !state.flying;
    const pct = batteryPercent(state.battery);
    const status = state.flying ? droneStatus(state.mode, state.battery, state.noise) : '';
    if (state.view) {
      this.noise.style.opacity = (0.08 + 0.85 * state.noise).toFixed(2);
      this.noise.style.backgroundPosition = `${Math.floor(Math.random() * 64)}px ${Math.floor(Math.random() * 64)}px`;
    }
    const key = [
      state.view,
      state.flying,
      pct,
      realAltitude(state.altitude),
      realDistance(state.distance),
      status,
      ...state.marks.map((m) => markLine(m.label, m.distance, m.bearing)),
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.batteryFill.style.width = `${pct}%`;
    this.batteryFill.dataset.low = String(pct <= 20);
    this.stats.textContent = `Pil %${pct} · Yükseklik ${realAltitude(state.altitude)} · Uzaklık ${realDistance(state.distance)}`;
    this.status.textContent = status;
    this.status.hidden = status === '';
    this.chip.textContent = `Drone havada · pil %${pct} · ${realDistance(state.distance)}${status ? ` · ${status}` : ''} · Q: görüş`;
    this.marks.replaceChildren(
      ...state.marks.map((m) => el('li', 'drone-mark', markLine(m.label, m.distance, m.bearing))),
    );
    this.marks.hidden = state.marks.length === 0;
  }

  dispose(): void {
    this.root.remove();
  }
}
