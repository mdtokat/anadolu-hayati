import './ui.css';
import type { DeathCause } from '../survival/vitals';
import { deathCauseText, formatDay, formatSurvivedTime } from './survivalFormat';

export interface DeathSummary {
  cause: DeathCause;
  survivedSeconds: number;
  day: number;
}

/**
 * Ölüm ekranı: neden, hayatta kalınan süre ve "Yeniden Doğ" düğmesi. Duraklatma menüsünün
 * üstünde görünür; düğme yeniden doğmayı ve fare kilidini ister.
 */
export class DeathScreen {
  private readonly root = document.createElement('div');
  private readonly cause = document.createElement('p');
  private readonly detail = document.createElement('div');
  private readonly day = document.createElement('span');
  private readonly survived = document.createElement('span');
  private readonly button = document.createElement('button');

  constructor(
    parent: HTMLElement,
    private readonly onRespawn: () => void,
  ) {
    this.root.className = 'death-screen';
    this.root.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'death-screen-panel';
    const title = document.createElement('h1');
    title.textContent = 'Öldün';
    this.cause.className = 'death-screen-cause';
    this.detail.className = 'death-screen-detail';
    this.detail.append(stat('Gün', this.day), stat('Hayatta kalınan süre', this.survived));
    this.button.type = 'button';
    this.button.textContent = 'Yeniden Doğ';
    this.button.addEventListener('click', () => this.onRespawn());

    panel.append(title, this.cause, this.detail, this.button);
    this.root.append(panel);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(summary: DeathSummary): void {
    this.cause.textContent = deathCauseText(summary.cause);
    this.day.textContent = formatDay(summary.day);
    this.survived.textContent = formatSurvivedTime(summary.survivedSeconds);
    this.root.hidden = false;
    this.button.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Ölüm özetinde bir istatistik kutusu (başlık + değer). */
function stat(label: string, value: HTMLElement): HTMLElement {
  const box = document.createElement('div');
  box.className = 'death-screen-stat';
  const caption = document.createElement('span');
  caption.className = 'death-screen-stat-label';
  caption.textContent = label;
  value.className = 'death-screen-stat-value';
  box.append(caption, value);
  return box;
}
