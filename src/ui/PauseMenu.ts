import './ui.css';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { CREDITS } from './credits';

const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['W A S D', 'Yürü'],
  ['Shift', 'Koş'],
  ['Boşluk', 'Zıpla'],
  ['Fare', 'Etrafa bak'],
  ['V', '1. / 3. şahıs kamera'],
  ['B', 'İl sınırlarını aç/kapa'],
  ['Esc', 'Duraklat'],
];

/** Yalnızca geliştirme modunda gösterilen ek kontroller. */
const DEV_CONTROLS: ReadonlyArray<readonly [string, string]> = [['1 – 5', 'Işınlan (geliştirici)']];

/**
 * Başlangıç ve duraklatma menüsü. Oyun duraklayınca (pointer lock kaybı, örn. Esc) görünür;
 * düğmeye ya da menü alanına tıklamak pointer lock'u yeniden ister ve oyunu sürdürür.
 */
export class PauseMenu {
  private readonly root = document.createElement('div');
  private readonly subtitle = document.createElement('p');
  private readonly button = document.createElement('button');
  private readonly hint = document.createElement('p');
  private readonly offs: Array<() => void> = [];
  private started = false;

  constructor(
    parent: HTMLElement,
    events: EventBus<GameEvents>,
    private readonly onResume: () => void,
  ) {
    this.root.className = 'pause-menu';

    const panel = document.createElement('div');
    panel.className = 'pause-menu-panel';
    // Panele tıklamak menüyü kapatmaz; yalnızca düğme ve dış alan devam ettirir.
    panel.addEventListener('click', (event) => event.stopPropagation());

    const title = document.createElement('h1');
    title.textContent = 'Anadolu Hayatı';
    this.subtitle.className = 'pause-menu-subtitle';
    this.hint.className = 'pause-menu-hint';
    this.button.type = 'button';
    this.button.addEventListener('click', () => this.onResume());

    const controls = document.createElement('dl');
    const rows = import.meta.env.DEV ? [...CONTROLS, ...DEV_CONTROLS] : CONTROLS;
    for (const [key, action] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = action;
      controls.append(dt, dd);
    }

    const credits = document.createElement('div');
    credits.className = 'pause-menu-credits';
    for (const credit of CREDITS) {
      const paragraph = document.createElement('p');
      const link = document.createElement('a');
      link.href = credit.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = credit.label;
      paragraph.append(link, ` — ${credit.text}`);
      credits.append(paragraph);
    }

    panel.append(title, this.subtitle, this.button, this.hint, controls, credits);
    this.root.append(panel);
    this.root.addEventListener('click', () => this.onResume());
    parent.appendChild(this.root);

    this.render();
    this.offs.push(
      events.on('game:resumed', () => {
        this.started = true;
        this.hint.textContent = '';
        this.root.hidden = true;
      }),
      events.on('game:paused', () => this.show()),
      events.on('input:pointerLockFailed', () => {
        this.hint.textContent = 'Tarayıcı fare kilidini hemen vermedi; lütfen tekrar tıkla.';
      }),
    );
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.root.remove();
  }

  private show(): void {
    this.render();
    this.root.hidden = false;
    this.button.focus({ preventScroll: true });
  }

  private render(): void {
    this.subtitle.textContent = this.started ? 'Duraklatıldı' : 'Başlamak için tıkla';
    this.button.textContent = this.started ? 'Devam Et' : 'Başla';
  }
}
