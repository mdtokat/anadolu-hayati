import './ui.css';
import type { BrResult } from '../battleRoyale/match';
import { resultLines } from './brFormat';

export interface BrResultActions {
  /** Aynı kurulumla yeni maç (yeni tohum). */
  again: () => void;
  /** Kurulum penceresine dön. */
  setup: () => void;
  /** Maçtan çık, ana menüye dön. */
  menu: () => void;
}

/**
 * Battle Royale sonuç ekranı (BR.6): "Son Kalan Sensin!" ya da "#7 / 32", sıra, öldürme, hayatta kalınan süre, kazanan,
 * en çok öldüren NPC ve maç tohumu; "Tekrar Oyna", "Kurulum", "Ana Menü". Ölüm ekranının görünümünü paylaşır.
 */
export class BrResultScreen {
  private readonly root = document.createElement('div');
  private readonly title = document.createElement('h1');
  private readonly detail = document.createElement('div');
  private readonly seed = document.createElement('p');
  private readonly againButton = document.createElement('button');

  constructor(parent: HTMLElement, actions: BrResultActions) {
    this.root.className = 'death-screen br-result';
    this.root.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'death-screen-panel';
    this.detail.className = 'death-screen-detail br-result-detail';
    this.seed.className = 'br-result-seed';
    const buttons = document.createElement('div');
    buttons.className = 'br-result-actions';
    this.againButton.type = 'button';
    this.againButton.textContent = 'Tekrar Oyna';
    this.againButton.addEventListener('click', () => actions.again());
    const setup = document.createElement('button');
    setup.type = 'button';
    setup.className = 'secondary';
    setup.textContent = 'Kurulum';
    setup.addEventListener('click', () => actions.setup());
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'secondary';
    menu.textContent = 'Ana Menü';
    menu.addEventListener('click', () => actions.menu());
    buttons.append(this.againButton, setup, menu);
    panel.append(this.title, this.detail, this.seed, buttons);
    this.root.append(panel);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(result: BrResult, seed: number): void {
    const { title, lines } = resultLines(result);
    this.title.textContent = title;
    this.root.dataset.win = String(result.placement === 1);
    this.detail.replaceChildren(
      ...lines.map(([label, value]) => {
        const box = document.createElement('div');
        box.className = 'death-screen-stat';
        const caption = document.createElement('span');
        caption.className = 'death-screen-stat-label';
        caption.textContent = label;
        const v = document.createElement('span');
        v.className = 'death-screen-stat-value';
        v.textContent = value;
        box.append(caption, v);
        return box;
      }),
    );
    this.seed.textContent = `Maç tohumu: ${seed}`;
    this.root.hidden = false;
    this.againButton.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.remove();
  }
}
