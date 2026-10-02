import './ui.css';
import { QUALITY_PRESETS, SETTINGS, type QualityLevel } from '../config';
import type { SettingsStore } from '../settings/SettingsStore';
import { QUALITY_LEVELS } from '../settings/settings';
import { QUALITY_HINTS, formatSensitivity, formatVolume } from './settingsFormat';

interface Slider {
  input: HTMLInputElement;
  value: HTMLSpanElement;
}

/**
 * Ayarlar penceresi: grafik kalitesi, fare hassasiyeti, ses, ipuçları. Değişiklikler anında uygulanır ve kaydedilir
 * (`SettingsStore`); "Kapat" yalnızca pencereyi kapatır. Duraklatma menüsünün (ve ana menünün) üstünde açılır;
 * `Esc` ya da dış alana tıklamak kapatır.
 */
export class SettingsPanel {
  private readonly root = document.createElement('div');
  private readonly qualityButtons = new Map<QualityLevel, HTMLButtonElement>();
  private readonly qualityHint = document.createElement('p');
  private readonly mouse: Slider;
  private readonly volume: Slider;
  private readonly hintButtons = new Map<boolean, HTMLButtonElement>();
  private readonly testModeButtons = new Map<boolean, HTMLButtonElement>();
  private readonly testModeHint = document.createElement('p');
  private readonly closeButton = document.createElement('button');
  private readonly offs: Array<() => void> = [];

  constructor(
    parent: HTMLElement,
    private readonly store: SettingsStore,
  ) {
    this.root.className = 'settings-panel';
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.hide());

    const panel = document.createElement('div');
    panel.className = 'settings-panel-body';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Ayarlar');
    panel.addEventListener('click', (event) => event.stopPropagation());

    const title = document.createElement('h2');
    title.textContent = 'Ayarlar';

    // Grafik kalitesi
    const qualityGroup = document.createElement('div');
    qualityGroup.className = 'settings-row';
    const qualityLabel = document.createElement('span');
    qualityLabel.className = 'settings-label';
    qualityLabel.textContent = 'Grafik kalitesi';
    const segmented = document.createElement('div');
    segmented.className = 'settings-segmented';
    segmented.setAttribute('role', 'radiogroup');
    segmented.setAttribute('aria-label', 'Grafik kalitesi');
    for (const level of QUALITY_LEVELS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.textContent = QUALITY_PRESETS[level].label;
      button.addEventListener('click', () => this.store.update({ quality: level }));
      this.qualityButtons.set(level, button);
      segmented.append(button);
    }
    this.qualityHint.className = 'settings-hint';
    qualityGroup.append(qualityLabel, segmented);

    this.mouse = this.makeSlider('Fare hassasiyeti', SETTINGS.mouseSensitivity, (v) =>
      this.store.update({ mouseSensitivity: v }),
    );
    this.volume = this.makeSlider('Ses', SETTINGS.volume, (v) => this.store.update({ volume: v }));

    // İpuçları (Faz 8.5): ilk dakikalar için kısa yönlendirmeler açık/kapalı
    const hintsGroup = document.createElement('div');
    hintsGroup.className = 'settings-row';
    const hintsLabel = document.createElement('span');
    hintsLabel.className = 'settings-label';
    hintsLabel.textContent = 'İpuçları';
    const hintsSegmented = document.createElement('div');
    hintsSegmented.className = 'settings-segmented';
    hintsSegmented.setAttribute('role', 'radiogroup');
    hintsSegmented.setAttribute('aria-label', 'İpuçları');
    for (const [enabled, label] of [
      [true, 'Açık'],
      [false, 'Kapalı'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.textContent = label;
      button.addEventListener('click', () => this.store.update({ hints: enabled }));
      this.hintButtons.set(enabled, button);
      hintsSegmented.append(button);
    }
    hintsGroup.append(hintsLabel, hintsSegmented);

    // Test modu (geçici): uçma ve sınırsız malzeme
    const testGroup = document.createElement('div');
    testGroup.className = 'settings-row';
    const testLabel = document.createElement('span');
    testLabel.className = 'settings-label';
    testLabel.textContent = 'Test modu';
    const testSegmented = document.createElement('div');
    testSegmented.className = 'settings-segmented';
    testSegmented.setAttribute('role', 'radiogroup');
    testSegmented.setAttribute('aria-label', 'Test modu');
    for (const [enabled, label] of [
      [true, 'Açık'],
      [false, 'Kapalı'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.textContent = label;
      button.addEventListener('click', () => this.store.update({ testMode: enabled }));
      this.testModeButtons.set(enabled, button);
      testSegmented.append(button);
    }
    this.testModeHint.className = 'settings-hint';
    this.testModeHint.textContent =
      'Uçma (Space çift bas; Space yukarı, Z aşağı, Shift hızlı) ve sınırsız malzeme: üretim ve yapı yerleştirme eşya harcamaz.';
    testGroup.append(testLabel, testSegmented);

    const actions = document.createElement('div');
    actions.className = 'settings-actions';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'secondary';
    reset.textContent = 'Varsayılanlara Dön';
    reset.addEventListener('click', () => this.store.reset());
    this.closeButton.type = 'button';
    this.closeButton.textContent = 'Kapat';
    this.closeButton.addEventListener('click', () => this.hide());
    actions.append(reset, this.closeButton);

    panel.append(
      title,
      qualityGroup,
      this.qualityHint,
      this.sliderRow('Fare hassasiyeti', this.mouse),
      this.sliderRow('Ses', this.volume),
      hintsGroup,
      testGroup,
      this.testModeHint,
      actions,
    );
    this.root.append(panel);
    parent.appendChild(this.root);

    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape' && this.visible) this.hide();
    };
    document.addEventListener('keydown', onKey);
    this.offs.push(
      () => document.removeEventListener('keydown', onKey),
      this.store.subscribe(() => this.render()),
    );
    this.render();
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.render();
    this.root.hidden = false;
    this.closeButton.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.root.remove();
  }

  private makeSlider(
    label: string,
    range: { readonly min: number; readonly max: number; readonly step: number },
    onChange: (value: number) => void,
  ): Slider {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.step);
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => onChange(Number(input.value)));
    return { input, value: document.createElement('span') };
  }

  private sliderRow(label: string, slider: Slider): HTMLElement {
    const row = document.createElement('label');
    row.className = 'settings-row';
    const text = document.createElement('span');
    text.className = 'settings-label';
    text.textContent = label;
    slider.value.className = 'settings-value';
    row.append(text, slider.input, slider.value);
    return row;
  }

  /** Denetimleri mevcut ayarla eşler (sıfırlama ya da başka yerden değişimde de güncel kalır). */
  private render(): void {
    const s = this.store.current;
    for (const [level, button] of this.qualityButtons) {
      const active = level === s.quality;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    for (const [enabled, button] of this.hintButtons) {
      const active = enabled === s.hints;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    for (const [enabled, button] of this.testModeButtons) {
      const active = enabled === s.testMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    this.qualityHint.textContent = QUALITY_HINTS[s.quality];
    this.mouse.input.value = String(s.mouseSensitivity);
    this.mouse.value.textContent = formatSensitivity(s.mouseSensitivity);
    this.volume.input.value = String(s.volume);
    this.volume.value.textContent = formatVolume(s.volume);
  }
}
