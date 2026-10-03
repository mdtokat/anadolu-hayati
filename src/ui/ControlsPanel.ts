import './ui.css';
import { CONTROL_GROUPS, DEV_CONTROLS, type ControlRow } from './controls';

/**
 * Kontroller penceresi: tuş göstergeleri gruplar hâlinde (Hareket, Hayatta kalma, İnşa, Silahlar…).
 * Eskiden ana menünün sağ sütunuydu; artık menüdeki "Kontroller" düğmesiyle ayrı açılır. `Esc`,
 * "Kapat" ya da dış alana tıklamak kapatır. Liste `controls.ts`'tedir.
 */
export class ControlsPanel {
  private readonly root = document.createElement('div');
  private readonly closeButton = document.createElement('button');
  private readonly offs: Array<() => void> = [];

  constructor(parent: HTMLElement, devControls = import.meta.env.DEV) {
    this.root.className = 'settings-panel controls-panel';
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.hide());

    const body = document.createElement('div');
    body.className = 'settings-panel-body controls-panel-body';
    body.setAttribute('role', 'dialog');
    body.setAttribute('aria-label', 'Kontroller');
    body.addEventListener('click', (event) => event.stopPropagation());

    const title = document.createElement('h2');
    title.textContent = 'Kontroller';

    const list = document.createElement('div');
    list.className = 'controls-list';
    const groups = devControls
      ? [...CONTROL_GROUPS, ['Geliştirici', DEV_CONTROLS] as const]
      : CONTROL_GROUPS;
    for (const [heading, rows] of groups) list.append(controlGroup(heading, rows));

    this.closeButton.type = 'button';
    this.closeButton.textContent = 'Kapat';
    this.closeButton.addEventListener('click', () => this.hide());
    const actions = document.createElement('div');
    actions.className = 'settings-actions';
    actions.append(this.closeButton);

    body.append(title, list, actions);
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
}

/** Kontrol grubu: başlık ve "tuş simgeleri — eylem" satırları. */
function controlGroup(heading: string, rows: readonly ControlRow[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'controls-group';
  const h3 = document.createElement('h3');
  h3.textContent = heading;
  const list = document.createElement('dl');
  for (const [keys, action] of rows) {
    const dt = document.createElement('dt');
    for (const key of keys) {
      const kbd = document.createElement('kbd');
      kbd.className = 'ui-key';
      kbd.textContent = key;
      dt.append(kbd);
    }
    const dd = document.createElement('dd');
    dd.textContent = action;
    list.append(dt, dd);
  }
  section.append(h3, list);
  return section;
}
