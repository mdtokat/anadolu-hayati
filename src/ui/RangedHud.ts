import { ITEMS } from '../items/itemDefs';
import type { RangedHudState } from '../combat/RangedSystem';
import { RANGED } from '../config';
import { itemIcon } from './icons';
import { ammoLevel, ammoText, crosshairKind, spreadRadiusPx } from './rangedView';
import { el } from './widgets';

/**
 * Silah HUD'u (Faz 11.5; HTML overlay): silaha göre nişangâh (saçılmayla açılan artı, saçma dairesi, yay kavis
 * işaretleri), dürbün görüntüsü (siyah çerçeve, artı ve mil noktaları, nefes çubuğu) ve mermi sayacı (sağ alt:
 * silah, şarjör / yedek, doldurma çubuğu). Elde menzilli silah yokken gizlidir; varken HUD'un nokta imleci gizlenir
 * (kapsayıcının `data-ranged` özniteliği).
 */
export class RangedHud {
  private readonly root = el('div', 'ranged-hud');
  private readonly cross = el('div', 'ranged-cross');
  private readonly scope = el('div', 'ranged-scope');
  private readonly zoomLabel = el('div', 'ranged-scope-zoom');
  private readonly breath = el('div', 'ranged-breath');
  private readonly breathFill = el('div', 'ranged-breath-fill');
  private readonly panel = el('div', 'ranged-ammo hud-card');
  private readonly icon = el('span', 'ranged-ammo-icon');
  private readonly name = el('span', 'ranged-ammo-name');
  private readonly count = el('span', 'ranged-ammo-count');
  private readonly reload = el('div', 'ranged-reload');
  private readonly reloadFill = el('div', 'ranged-reload-fill');
  private lastWeapon: string | null = null;
  private lastKey = '';

  constructor(private readonly container: HTMLElement) {
    for (const side of ['t', 'r', 'b', 'l']) {
      const arm = el('span', 'ranged-cross-arm');
      arm.dataset.side = side;
      this.cross.append(arm);
    }
    this.cross.append(el('span', 'ranged-cross-dot'));
    const reticle = el('div', 'ranged-scope-reticle');
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      const dot = el('span', 'ranged-scope-mil');
      dot.style.setProperty('--mil', String(i));
      reticle.append(dot);
    }
    this.scope.append(reticle, this.zoomLabel);
    this.breath.append(this.breathFill);
    this.reload.append(this.reloadFill);
    const text = el('div', 'ranged-ammo-text');
    text.append(this.name, this.count);
    this.panel.append(this.icon, text, this.reload);
    this.root.append(this.scope, this.cross, this.breath, this.panel);
    this.root.hidden = true;
    container.append(this.root);
  }

  /** Durumu çizer; `state` null ya da `visible` false ise gizler. */
  update(state: RangedHudState | null, visible: boolean, fovDeg: number): void {
    const show = visible && state !== null;
    this.root.hidden = !show;
    if (show) this.container.dataset.ranged = '1';
    else delete this.container.dataset.ranged;
    if (!show || !state) return;

    const label = `${state.weapon}:${state.suppressed}:${state.zoom}`;
    if (this.lastWeapon !== label) {
      this.lastWeapon = label;
      this.icon.replaceChildren(itemIcon(state.weapon));
      const extras = [
        ...(state.suppressed ? ['susturuculu'] : []),
        ...(state.zoom > 0 ? [`${state.zoom}x`] : []),
      ];
      this.name.textContent = [ITEMS[state.weapon].name, ...extras].join(' · ');
      this.zoomLabel.textContent = state.zoom > 0 ? `${state.zoom}x` : '';
    }
    const kind = crosshairKind(state.weapon, state.scoped);
    this.root.dataset.kind = kind;
    this.scope.hidden = kind !== 'scope';
    this.breath.hidden = kind !== 'scope';
    this.cross.hidden = kind === 'scope';
    const height = this.container.clientHeight || 720;
    const radius = spreadRadiusPx(state.spreadDeg, fovDeg, height);
    this.cross.style.setProperty('--gap', `${radius.toFixed(1)}px`);
    this.breathFill.style.width = `${(state.breath * 100).toFixed(0)}%`;
    this.breath.dataset.out = state.breathExhausted ? '1' : '0';

    const reloading = state.reload !== null;
    const key = `${state.loaded}|${state.reserve}|${reloading}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.count.textContent = ammoText(state.loaded, state.reserve, reloading);
      this.panel.dataset.level = ammoLevel(state.loaded, state.reserve);
      this.panel.title = `${ITEMS[RANGED.weapons[state.weapon].ammo].name}`;
    }
    this.reload.hidden = !reloading;
    if (reloading) this.reloadFill.style.width = `${((state.reload ?? 0) * 100).toFixed(0)}%`;
  }

  dispose(): void {
    delete this.container.dataset.ranged;
    this.root.remove();
  }
}
