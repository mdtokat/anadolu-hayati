import './ui.css';
import { COMBAT_HUD } from '../config';
import type { VitalsState } from '../survival/vitals';
import { defenseLabel, type HitMarkerKind } from './combatFormat';
import {
  bodyTempLabel,
  exposureLabel,
  bodyTempLevel,
  formatTemperature,
  gaugeFraction,
  gaugeLevel,
  warnings,
} from './survivalFormat';

/** HUD'da gösterilen dört seviye göstergesi: anahtar, başlık. */
const GAUGES = [
  ['health', 'Sağlık'],
  ['satiety', 'Tokluk'],
  ['hydration', 'Su'],
  ['energy', 'Enerji'],
] as const;

type GaugeKey = (typeof GAUGES)[number][0];

interface GaugeElements {
  row: HTMLElement;
  fill: HTMLElement;
}

/** Saat/sıcaklık satırında gösterilen zaman ve ortam bilgisi. */
export interface SurvivalHudInfo {
  vitals: Readonly<VitalsState>;
  /** "HH:MM" */
  clock: string;
  /** "3. gün" gibi gün etiketi. */
  day: string;
  /** Ortam sıcaklığı (°C). */
  ambientC: number;
  /** Yakındaki ateşlerin ısıtması (°C) ve barınak altında olma durumu. */
  warmthC: number;
  sheltered: boolean;
  /** Giysilerin hasar azaltma oranı (0–1); yoksa 0. */
  defense?: number;
}

/**
 * Oyun içi HUD iskeleti (HTML overlay): artı imleç, hayatta kalma göstergeleri için boş alan
 * ve (yalnızca dev modunda) geliştirici bilgisi.
 */
export class Hud {
  /** Sağlık/tokluk/su/enerji çubukları (sol alt). */
  readonly gauges = document.createElement('div');

  private readonly root = document.createElement('div');
  private readonly debug: HTMLElement | null;
  private readonly location = document.createElement('div');
  private readonly locationTitle = document.createElement('div');
  private readonly locationDetail = document.createElement('div');
  private readonly gaugeElements = new Map<GaugeKey, GaugeElements>();
  private readonly bodyTemp = document.createElement('div');
  private readonly defense = document.createElement('div');
  private readonly damageVignette = document.createElement('div');
  private readonly hitMarker = document.createElement('div');
  private readonly clock = document.createElement('div');
  private readonly warningList = document.createElement('div');
  private readonly prompt = document.createElement('div');
  private readonly progress = document.createElement('div');
  private readonly progressFill = document.createElement('div');
  private readonly banner = document.createElement('div');
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly toasts = document.createElement('div');
  private readonly toastTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(parent: HTMLElement, showDebug: boolean) {
    this.root.className = 'hud';
    this.root.hidden = true; // başlangıçta menü açık

    const crosshair = document.createElement('div');
    crosshair.className = 'hud-crosshair';
    this.damageVignette.className = 'hud-damage';
    this.hitMarker.className = 'hud-hitmarker';
    this.gauges.className = 'hud-gauges';
    this.location.className = 'hud-location';
    this.locationTitle.className = 'hud-location-title';
    this.locationDetail.className = 'hud-location-detail';
    this.location.append(this.locationTitle, this.locationDetail);
    this.location.hidden = true; // konum bilgisi olmayan dünyalarda (test arenası) görünmez
    this.buildGauges();
    this.clock.className = 'hud-clock';
    this.warningList.className = 'hud-warnings';
    this.prompt.className = 'hud-prompt';
    this.prompt.hidden = true;
    this.progress.className = 'hud-progress';
    this.progress.hidden = true;
    this.progressFill.className = 'hud-progress-fill';
    this.progress.append(this.progressFill);
    this.toasts.className = 'hud-toasts';
    this.banner.className = 'hud-banner';
    this.banner.hidden = true;
    this.gauges.hidden = true; // hayatta kalma verisi gelene kadar (test arenasında da) görünmez
    this.clock.hidden = true;
    this.root.append(
      this.damageVignette,
      crosshair,
      this.hitMarker,
      this.gauges,
      this.location,
      this.clock,
      this.warningList,
      this.prompt,
      this.progress,
      this.toasts,
      this.banner,
    );

    if (showDebug) {
      this.debug = document.createElement('div');
      this.debug.className = 'hud-debug';
      this.root.append(this.debug);
    } else {
      this.debug = null;
    }
    parent.appendChild(this.root);
  }

  private buildGauges(): void {
    for (const [key, label] of GAUGES) {
      const row = document.createElement('div');
      row.className = 'hud-gauge';
      const name = document.createElement('span');
      name.className = 'hud-gauge-label';
      name.textContent = label;
      const track = document.createElement('div');
      track.className = 'hud-gauge-track';
      const fill = document.createElement('div');
      fill.className = 'hud-gauge-fill';
      track.append(fill);
      row.append(name, track);
      this.gauges.append(row);
      this.gaugeElements.set(key, { row, fill });
    }
    this.bodyTemp.className = 'hud-body-temp';
    this.defense.className = 'hud-defense';
    this.defense.hidden = true;
    this.gauges.append(this.bodyTemp, this.defense);
  }

  /** Hayatta kalma göstergelerini, saati ve uyarıları günceller. */
  setSurvival(info: SurvivalHudInfo): void {
    this.gauges.hidden = false;
    this.clock.hidden = false;
    const { vitals } = info;
    for (const [key] of GAUGES) {
      const element = this.gaugeElements.get(key);
      if (!element) continue;
      const value = vitals[key];
      element.fill.style.width = `${(gaugeFraction(value) * 100).toFixed(1)}%`;
      setState(element.row, key === 'energy' && vitals.exhausted ? 'critical' : gaugeLevel(value));
    }

    const level = bodyTempLevel(vitals.bodyTemp);
    setText(
      this.bodyTemp,
      [
        `Vücut: ${formatTemperature(vitals.bodyTemp)} ${bodyTempLabel(vitals.bodyTemp)}`.trim(),
        exposureLabel(info.warmthC, info.sheltered),
      ]
        .filter((part) => part !== '')
        .join(' · '),
    );
    setState(this.bodyTemp, level);
    const defense = defenseLabel(info.defense ?? 0);
    this.defense.hidden = defense === '';
    setText(this.defense, defense);

    setText(this.clock, `${info.clock} · ${info.day} · ${formatTemperature(info.ambientC)}`);

    const list = warnings(vitals);
    const joined = list.join('\n');
    if (this.warningList.dataset.text !== joined) {
      this.warningList.dataset.text = joined;
      this.warningList.replaceChildren(
        ...list.map((text) => {
          const line = document.createElement('div');
          line.textContent = text;
          return line;
        }),
      );
    }
  }

  /** Hasar vinyeti: kenarlar kısa süre kızarır (`strength` 0–1). */
  flashDamage(strength: number): void {
    animateFade(this.damageVignette, strength, COMBAT_HUD.vignetteMs);
  }

  /** Vuruş işareti: imleç çevresinde kısa süre çarpı (öldüren vuruş kırmızı). */
  showHitMarker(kind: HitMarkerKind): void {
    this.hitMarker.dataset.kind = kind;
    animateFade(this.hitMarker, 1, COMBAT_HUD.hitMarkerMs);
  }

  /** Ekran ortası altında kısa ipucu (ör. "E: su iç"); `null` gizler. */
  setPrompt(text: string | null): void {
    this.prompt.hidden = text === null;
    if (text !== null) setText(this.prompt, text);
  }

  /** İpucunun altında ilerleme çubuğu (0–1); `null` gizler. */
  setProgress(fraction: number | null): void {
    this.progress.hidden = fraction === null;
    if (fraction === null) return;
    const width = `${(Math.min(Math.max(fraction, 0), 1) * 100).toFixed(1)}%`;
    if (this.progressFill.style.width !== width) this.progressFill.style.width = width;
  }

  /** Kısa süreli bildirim (ör. "+3 Fındık"); `durationMs` sonra kendiliğinden kalkar. */
  notify(text: string, durationMs: number): void {
    const toast = document.createElement('div');
    toast.className = 'hud-toast';
    toast.textContent = text;
    this.toasts.append(toast);
    const timer = setTimeout(() => {
      toast.remove();
      this.toastTimers.delete(timer);
    }, durationMs);
    this.toastTimers.add(timer);
  }

  /** Ekranın üstünde büyük, kendiliğinden sönen duyuru (ör. "Bartın'a hoş geldiniz"); yenisi eskisinin yerini alır. */
  showBanner(text: string, durationMs: number): void {
    this.banner.textContent = text;
    this.banner.hidden = false;
    animateFade(this.banner, 1, durationMs);
    if (this.bannerTimer !== null) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.banner.hidden = true;
      this.bannerTimer = null;
    }, durationMs);
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
    for (const timer of this.toastTimers) clearTimeout(timer);
    this.toastTimers.clear();
    if (this.bannerTimer !== null) clearTimeout(this.bannerTimer);
    this.root.remove();
  }
}

/** Elemanı `peak` opaklığından 0'a `ms` içinde söndürür (Web Animations destekliyse; yoksa etkisiz). */
function animateFade(element: HTMLElement, peak: number, ms: number): void {
  if (typeof element.animate !== 'function') return;
  element.getAnimations?.().forEach((animation) => animation.cancel());
  element.animate([{ opacity: peak }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
}

/** Metni yalnızca değiştiyse yazar (gereksiz DOM güncellemesi olmasın). */
function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

function setState(element: HTMLElement, state: string): void {
  if (element.dataset.state !== state) element.dataset.state = state;
}
