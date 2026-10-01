import './ui.css';
import { BUILD_INFO, formatBuildInfo } from '../buildInfo';
import { CREDITS, CREDITS_NOTE, SOFTWARE_CREDITS, type Credit } from './credits';

/**
 * Krediler ekranı: veri kaynakları (lisansların şart koştuğu atıflar), kullanılan yazılımlar ve derleme kimliği.
 * Uzun olduğundan kaydırılır; `Esc`, "Kapat" ya da dış alana tıklamak kapatır. Metinler `credits.ts`'tedir
 * (README.md ile tutarlı olmalı; `tests/credits.test.ts` bunu denetler).
 */
export class CreditsPanel {
  private readonly root = document.createElement('div');
  private readonly closeButton = document.createElement('button');
  private readonly offs: Array<() => void> = [];

  constructor(parent: HTMLElement) {
    this.root.className = 'settings-panel credits-panel';
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.hide());

    const body = document.createElement('div');
    body.className = 'settings-panel-body credits-panel-body';
    body.setAttribute('role', 'dialog');
    body.setAttribute('aria-label', 'Krediler');
    body.addEventListener('click', (event) => event.stopPropagation());

    const title = document.createElement('h2');
    title.textContent = 'Krediler';

    const note = document.createElement('p');
    note.className = 'credits-note';
    note.textContent = CREDITS_NOTE;

    // Derleme kimliği: elle doğrulama sonuçları hangi derlemede denendiğiyle birlikte bildirilsin.
    const build = document.createElement('p');
    build.className = 'credits-build';
    build.textContent = formatBuildInfo(BUILD_INFO);

    this.closeButton.type = 'button';
    this.closeButton.textContent = 'Kapat';
    this.closeButton.addEventListener('click', () => this.hide());
    const actions = document.createElement('div');
    actions.className = 'settings-actions';
    actions.append(this.closeButton);

    body.append(
      title,
      this.section('Veri kaynakları', CREDITS),
      this.section('Yazılım', SOFTWARE_CREDITS),
      note,
      build,
      actions,
    );
    this.root.append(body);
    parent.appendChild(this.root);

    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape' && this.visible) this.hide();
    };
    document.addEventListener('keydown', onKey);
    this.offs.push(() => document.removeEventListener('keydown', onKey));
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
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

  private section(heading: string, credits: readonly Credit[]): HTMLElement {
    const section = document.createElement('section');
    section.className = 'credits-section';
    const h3 = document.createElement('h3');
    h3.textContent = heading;
    section.append(h3);
    for (const credit of credits) {
      const paragraph = document.createElement('p');
      const link = document.createElement('a');
      link.href = credit.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = credit.label;
      paragraph.append(link, ` — ${credit.text}`);
      section.append(paragraph);
    }
    return section;
  }
}
