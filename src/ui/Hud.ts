import './ui.css';
import { COMBAT_HUD, HUD_STYLE, INTERACT } from '../config';
import type { VitalsState } from '../survival/vitals';
import { defenseLabel, type HitMarkerKind } from './combatFormat';
import type { HotbarSlotView } from './hotbarView';
import {
  compassBearing,
  compassLabel,
  compassOffset,
  compassTicks,
  promptParts,
  toastKind,
  warningLevel,
} from './hudView';
import { CATEGORY_ACCENT, itemIcon, uiIcon, type UiIcon } from './icons';
import { ITEMS } from '../items/itemDefs';
import {
  bodyTempLabel,
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
] as const satisfies ReadonlyArray<readonly [UiIcon, string]>;

type GaugeKey = (typeof GAUGES)[number][0];

interface GaugeElements {
  row: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
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
  /** Barınak türü (Faz 9: kulübe ayrı yazılır). */
  shelter?: 'lean_to' | 'hut' | null;
  /** Giysilerin hasar azaltma oranı (0–1); yoksa 0. */
  defense?: number;
  /** Güneş ufkun üstünde mi (saat simgesi güneş/ay)? Verilmezse gündüz sayılır. */
  daylight?: boolean;
}

/**
 * Oyun içi HUD (HTML overlay): artı imleç ve etkileşim halkası, pusula, konum/saat kartı, hayatta kalma
 * göstergeleri ve durum çipleri, uyarılar, ipucu (tuş simgeleriyle), bildirimler, duyuru, kısayol çubuğu ve
 * (yalnızca dev modunda) geliştirici bilgisi. Biçimlendirme mantığı `survivalFormat`/`hudView`'dadır (saf, testli).
 */
export class Hud {
  /** Sağlık/tokluk/su/enerji kartı (sol alt). */
  readonly gauges = el('div', 'hud-vitals hud-card');

  private readonly root = el('div', 'hud');
  private readonly debug: HTMLElement | null;
  private readonly info = el('div', 'hud-info hud-card');
  private readonly location = el('div', 'hud-location');
  private readonly locationTitle = el('span', 'hud-location-title');
  private readonly locationDetail = el('span', 'hud-location-detail');
  private readonly gaugeElements = new Map<GaugeKey, GaugeElements>();
  private readonly statusChips = el('div', 'hud-chips');
  private readonly damageVignette = el('div', 'hud-damage');
  private readonly hitMarker = el('div', 'hud-hitmarker');
  private readonly clock = el('div', 'hud-clock');
  private readonly clockIcon = el('span', 'hud-clock-icon');
  private readonly clockTime = el('span', 'hud-clock-time');
  private readonly clockDay = el('span', 'hud-clock-day');
  private readonly clockTemp = el('span', 'hud-clock-temp');
  private clockDaylight: boolean | null = null;
  private readonly compass = el('div', 'hud-compass');
  private readonly compassTape = el('div', 'hud-compass-tape');
  private readonly compassReadout = el('div', 'hud-compass-readout');
  private lastBearing = Number.NaN;
  private readonly warningList = el('div', 'hud-warnings');
  private readonly prompt = el('div', 'hud-prompt');
  private readonly progress = el('div', 'hud-ring');
  private readonly toasts = el('div', 'hud-toasts');
  private readonly banner = el('div', 'hud-banner');
  private readonly bannerText = el('span', 'hud-banner-text');
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hotbar = el('div', 'hud-hotbar');
  private readonly hotbarSlots = el('div', 'hud-hotbar-slots');
  private readonly hotbarHeld = el('div', 'hud-hotbar-held');
  private readonly toastTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(parent: HTMLElement, showDebug: boolean) {
    this.root.hidden = true; // başlangıçta menü açık

    const crosshair = el('div', 'hud-crosshair');
    this.progress.hidden = true;

    // Konum ve saat kartı (sağ üst)
    this.location.append(
      uiIcon('pin', 'ui-icon hud-location-icon'),
      el('span', 'hud-location-text'),
    );
    this.location.lastElementChild?.append(this.locationTitle, this.locationDetail);
    this.location.hidden = true; // konum bilgisi olmayan dünyalarda (test arenası) görünmez
    const clockMain = el('span', 'hud-clock-main');
    clockMain.append(this.clockTime, this.clockDay);
    this.clock.append(this.clockIcon, clockMain, this.clockTemp);
    this.clock.hidden = true;
    this.info.append(this.location, this.clock);
    this.info.hidden = true;

    this.buildCompass();
    this.buildGauges();
    this.prompt.hidden = true;
    this.banner.append(this.bannerText);
    this.banner.hidden = true;
    this.hotbar.append(this.hotbarHeld, this.hotbarSlots);
    this.hotbar.hidden = true; // kısayol verisi gelene kadar
    this.gauges.hidden = true; // hayatta kalma verisi gelene kadar (test arenasında da) görünmez
    this.root.append(
      this.damageVignette,
      crosshair,
      this.progress,
      this.hitMarker,
      this.compass,
      this.gauges,
      this.info,
      this.warningList,
      this.prompt,
      this.toasts,
      this.banner,
      this.hotbar,
    );

    if (showDebug) {
      this.debug = el('div', 'hud-debug');
      this.root.append(this.debug);
    } else {
      this.debug = null;
    }
    parent.appendChild(this.root);
  }

  private buildCompass(): void {
    this.compass.style.setProperty('--compass-width', `${HUD_STYLE.compassWidthPx}px`);
    for (const tick of compassTicks()) {
      const mark = el('span', 'hud-compass-tick');
      mark.style.left = `${(tick.deg + 180) * HUD_STYLE.compassPxPerDeg}px`;
      if (tick.label) {
        mark.dataset.kind = tick.major ? 'major' : 'minor';
        if (tick.label === 'K') mark.dataset.north = 'true';
        mark.textContent = tick.label;
      }
      this.compassTape.append(mark);
    }
    const window = el('div', 'hud-compass-window');
    window.append(this.compassTape);
    this.compass.append(window, this.compassReadout);
    this.compass.hidden = true;
  }

  private buildGauges(): void {
    for (const [key, label] of GAUGES) {
      const row = el('div', 'hud-gauge');
      row.dataset.gauge = key;
      row.title = label;
      const track = el('div', 'hud-gauge-track');
      const fill = el('div', 'hud-gauge-fill');
      track.append(fill);
      const value = el('span', 'hud-gauge-value');
      row.append(uiIcon(key, 'ui-icon hud-gauge-icon'), track, value);
      this.gauges.append(row);
      this.gaugeElements.set(key, { row, fill, value });
    }
    this.gauges.append(this.statusChips);
  }

  /** Hayatta kalma göstergelerini, saati ve uyarıları günceller. */
  setSurvival(info: SurvivalHudInfo): void {
    this.gauges.hidden = false;
    this.clock.hidden = false;
    this.info.hidden = false;
    const { vitals } = info;
    for (const [key] of GAUGES) {
      const element = this.gaugeElements.get(key);
      if (!element) continue;
      const value = vitals[key];
      const width = `${(gaugeFraction(value) * 100).toFixed(1)}%`;
      if (element.fill.style.width !== width) element.fill.style.width = width;
      setText(element.value, String(Math.round(value)));
      setState(element.row, key === 'energy' && vitals.exhausted ? 'critical' : gaugeLevel(value));
    }
    this.renderChips(info);

    const daylight = info.daylight ?? true;
    if (this.clockDaylight !== daylight) {
      this.clockDaylight = daylight;
      this.clockIcon.replaceChildren(uiIcon(daylight ? 'sun' : 'moon'));
      this.clock.dataset.daylight = String(daylight);
    }
    setText(this.clockTime, info.clock);
    setText(this.clockDay, info.day);
    setText(this.clockTemp, formatTemperature(info.ambientC));

    const list = warnings(vitals);
    const joined = list.join('\n');
    if (this.warningList.dataset.text !== joined) {
      this.warningList.dataset.text = joined;
      this.warningList.replaceChildren(
        ...list.map((text) => {
          const line = el('div', 'hud-warning');
          line.dataset.level = warningLevel(text);
          line.append(uiIcon('warning'), el('span', '', text));
          return line;
        }),
      );
    }
  }

  /** Durum çipleri: vücut ısısı (her zaman), ateş başında, barınakta/kulübede, savunma. */
  private renderChips(info: SurvivalHudInfo): void {
    const temp = info.vitals.bodyTemp;
    const tempLabel = bodyTempLabel(temp);
    const chips: Array<{ icon: UiIcon; text: string; state: string }> = [
      {
        icon: 'thermometer',
        text: tempLabel ? `${formatTemperature(temp)} · ${tempLabel}` : formatTemperature(temp),
        state: bodyTempLevel(temp),
      },
    ];
    if (info.warmthC > 0) chips.push({ icon: 'fire', text: 'Ateş başında', state: 'fire' });
    if (info.sheltered) {
      chips.push({
        icon: 'shelter',
        text: info.shelter === 'hut' ? 'Kulübede' : 'Barınakta',
        state: 'shelter',
      });
    }
    const defense = defenseLabel(info.defense ?? 0);
    if (defense) chips.push({ icon: 'shield', text: defense, state: 'defense' });

    const signature = chips.map((c) => `${c.icon}:${c.text}:${c.state}`).join('|');
    if (this.statusChips.dataset.signature === signature) return;
    this.statusChips.dataset.signature = signature;
    this.statusChips.replaceChildren(
      ...chips.map((chip) => {
        const element = el('span', 'hud-chip');
        element.dataset.state = chip.state;
        element.append(uiIcon(chip.icon), el('span', '', chip.text));
        return element;
      }),
    );
  }

  /** Pusulayı kamera yaw'ına (radyan) göre döndürür; her render karesinde çağrılabilir (küçük değişimler atlanır). */
  setHeading(yaw: number): void {
    const bearing = compassBearing(yaw);
    if (Math.abs(bearing - this.lastBearing) < HUD_STYLE.compassEpsilonDeg) return;
    this.lastBearing = bearing;
    this.compass.hidden = false;
    const offset = compassOffset(bearing, HUD_STYLE.compassWidthPx);
    this.compassTape.style.transform = `translateX(${offset.toFixed(1)}px)`;
    setText(this.compassReadout, `${compassLabel(bearing)} ${Math.round(bearing) % 360}°`);
  }

  /** Kısayol çubuğunu (alt orta) ve elde tutulan eşyayı çizer. */
  setHotbar(slots: ReadonlyArray<HotbarSlotView>, held: string): void {
    this.hotbar.hidden = false;
    setText(this.hotbarHeld, held);
    this.hotbarHeld.hidden = held === '';
    this.hotbarSlots.replaceChildren(
      ...slots.map((view) => {
        const slot = el('div', 'hud-hotbar-slot');
        slot.title = view.title;
        slot.dataset.empty = String(view.empty);
        slot.dataset.missing = String(view.missing);
        slot.dataset.selected = String(view.selected);
        if (view.id !== null) {
          slot.style.setProperty('--accent', CATEGORY_ACCENT[ITEMS[view.id].category]);
          slot.append(itemIcon(view.id, 'item-icon hud-hotbar-icon'));
        }
        slot.append(el('span', 'hud-hotbar-key', view.key));
        if (view.count) slot.append(el('span', 'hud-hotbar-count', view.count));
        return slot;
      }),
    );
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

  /** Ekran ortası altında kısa ipucu (ör. "E: su iç"); tuşlar tuş simgesiyle çizilir. `null` gizler. */
  setPrompt(text: string | null): void {
    this.prompt.hidden = text === null;
    if (text === null || this.prompt.dataset.text === text) return;
    this.prompt.dataset.text = text;
    const parts = promptParts(text);
    this.prompt.replaceChildren(
      ...parts.map((part, index) => {
        const element = el('span', 'hud-prompt-part');
        if (index > 0) element.classList.add('hud-prompt-sep');
        if (part.key !== null) {
          const key = el('kbd', 'hud-key', part.key);
          if (part.hold) key.dataset.hold = 'true';
          element.append(key);
        }
        element.append(el('span', 'hud-prompt-text', part.text));
        return element;
      }),
    );
  }

  /** İmleç çevresinde ilerleme halkası (0–1); `null` gizler. */
  setProgress(fraction: number | null): void {
    this.progress.hidden = fraction === null;
    if (fraction === null) return;
    const value = (Math.min(Math.max(fraction, 0), 1) * 100).toFixed(1);
    if (this.progress.dataset.value !== value) {
      this.progress.dataset.value = value;
      this.progress.style.setProperty('--progress', `${value}%`);
    }
  }

  /** Kısa süreli bildirim (ör. "+3 Fındık"); `durationMs` sonra kendiliğinden kalkar. */
  notify(text: string, durationMs: number): void {
    const toast = el('div', 'hud-toast');
    toast.dataset.kind = toastKind(text);
    toast.style.setProperty('--toast-ms', `${durationMs}ms`);
    toast.append(el('span', 'hud-toast-dot'), el('span', '', text));
    this.toasts.append(toast);
    // Sınır aşılınca en eski bildirim erken kalkar (zamanlayıcısı sonra kopuk öğeyi siler; zararsız).
    while (this.toasts.childElementCount > INTERACT.maxToasts)
      this.toasts.firstElementChild?.remove();
    const timer = setTimeout(() => {
      toast.remove();
      this.toastTimers.delete(timer);
    }, durationMs);
    this.toastTimers.add(timer);
  }

  /** Ekranın üstünde büyük, kendiliğinden sönen duyuru (ör. "Bartın'a hoş geldiniz"); yenisi eskisinin yerini alır. */
  showBanner(text: string, durationMs: number): void {
    this.bannerText.textContent = text;
    this.banner.hidden = false;
    if (typeof this.banner.animate === 'function') {
      this.banner.getAnimations?.().forEach((animation) => animation.cancel());
      this.banner.animate(
        [
          { opacity: 0, transform: 'translate(-50%, -8px)', letterSpacing: '0.24em' },
          { opacity: 1, transform: 'translate(-50%, 0)', letterSpacing: '0.12em', offset: 0.12 },
          { opacity: 1, transform: 'translate(-50%, 0)', letterSpacing: '0.12em', offset: 0.75 },
          { opacity: 0, transform: 'translate(-50%, 0)', letterSpacing: '0.12em' },
        ],
        { duration: durationMs, easing: 'ease-out', fill: 'forwards' },
      );
    }
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
    this.info.hidden = false;
    setText(this.locationTitle, location.title);
    setText(this.locationDetail, location.detail);
  }

  setDebugText(text: string): void {
    if (this.debug) setText(this.debug, text);
  }

  dispose(): void {
    for (const timer of this.toastTimers) clearTimeout(timer);
    this.toastTimers.clear();
    if (this.bannerTimer !== null) clearTimeout(this.bannerTimer);
    this.root.remove();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
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
