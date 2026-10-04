import './ui.css';
import { BATTLE_ROYALE } from '../config';
import { isConnectedSelection, toggleProvince, type Adjacency } from '../battleRoyale/area';
import {
  BR_DIFFICULTIES,
  clampPlayers,
  clampShrinkMinutes,
  defaultPlayers,
  normalizeSetup,
  type BrAreaChoice,
  type BrSetup,
} from '../battleRoyale/kinds';
import type { ProvinceShape } from '../data/region';
import {
  BR_SETUP_STORAGE_KEY,
  DIFFICULTY_LABELS,
  provinceButtonStates,
  provinceMapPaths,
  setupSummary,
} from './brFormat';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface BrSetupOptions {
  /** Hedef iller (seçilebilir alan) ve komşulukları. */
  provinces: readonly ProvinceShape[];
  adjacency: Adjacency;
  /** "Başlat": maçı başlatır (başarısızsa false; panel açık kalır ve uyarır). */
  start: (setup: BrSetup) => boolean;
  /** Kurulum kapandı (Geri). */
  closed?: () => void;
  /** Kurulumun hatırlandığı depo (yoksa oturumluk). */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/**
 * Battle Royale kurulum penceresi (BR.6): alan (tüm harita ya da sınır komşuluğuyla bağlı il seçimi — haritada ya da
 * listede tıklanır; yalnız seçime komşu iller eklenebilir, seçimi bölecek il çıkarılamaz), oyuncu sayısı, bölgenin daralma aralığı (dk), zorluk,
 * hayvanlar ve saat. Son kurulum tarayıcıda hatırlanır (`BR_SETUP_STORAGE_KEY`).
 */
export class BrSetupPanel {
  private readonly root = document.createElement('div');
  private readonly areaButtons = new Map<'world' | 'provinces', HTMLButtonElement>();
  private readonly list = document.createElement('div');
  private readonly svg = document.createElementNS(SVG_NS, 'svg');
  private readonly paths = new Map<string, SVGPathElement>();
  private readonly playersInput = document.createElement('input');
  private readonly playersNumber = document.createElement('input');
  private readonly shrinkInput = document.createElement('input');
  private readonly shrinkNumber = document.createElement('input');
  private readonly difficultyButtons = new Map<string, HTMLButtonElement>();
  private readonly animalsButtons = new Map<boolean, HTMLButtonElement>();
  private readonly daylightButtons = new Map<boolean, HTMLButtonElement>();
  private readonly summary = document.createElement('p');
  private readonly hint = document.createElement('p');
  private readonly startButton = document.createElement('button');
  private readonly names: string[];
  private setup: BrSetup;
  /** İl kipinde seçim (tüm harita seçiliyken de son il seçimi korunur). */
  private selection: string[];

  constructor(
    parent: HTMLElement,
    private readonly options: BrSetupOptions,
  ) {
    this.names = options.provinces.map((p) => p.name).sort((a, b) => a.localeCompare(b, 'tr'));
    this.setup = this.read();
    this.selection = this.setup.area.kind === 'provinces' ? [...this.setup.area.names] : [];

    this.root.className = 'settings-panel br-setup';
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.hide());
    const body = document.createElement('div');
    body.className = 'settings-panel-body br-setup-body';
    body.setAttribute('role', 'dialog');
    body.setAttribute('aria-label', 'Son Kalan kurulumu');
    body.addEventListener('click', (event) => event.stopPropagation());

    const title = document.createElement('h2');
    title.textContent = 'Son Kalan (Battle Royale)';
    const intro = document.createElement('p');
    intro.className = 'settings-hint';
    intro.textContent =
      'Herkes eli boş başlar; silahı ve sağlık eşyasını binalardan, sandıklardan toplarsın. Güvenli bölge daralır, son kalan kazanır. Maç kayda girmez.';

    // Alan
    const areaRow = this.segmentedRow(
      'Alan',
      [
        ['world', 'Tüm harita'],
        ['provinces', 'İl seç'],
      ],
      this.areaButtons,
      (value) => this.setAreaKind(value as 'world' | 'provinces'),
    );
    const areaBox = document.createElement('div');
    areaBox.className = 'br-setup-area';
    this.svg.classList.add('br-setup-map');
    this.svg.setAttribute('role', 'group');
    this.svg.setAttribute('aria-label', 'İl haritası');
    const map = provinceMapPaths(options.provinces);
    const { x, y, w, h } = map.viewBox;
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    for (const p of map.provinces) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', p.d);
      path.setAttribute('fill-rule', 'evenodd');
      path.classList.add('br-map-province');
      const tip = document.createElementNS(SVG_NS, 'title');
      tip.textContent = p.name;
      path.append(tip);
      path.addEventListener('click', () => this.toggle(p.name));
      this.paths.set(p.name, path);
      this.svg.append(path);
    }
    for (const p of map.provinces) {
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(Math.round(p.cx)));
      label.setAttribute('y', String(Math.round(p.cz)));
      // Küçük harita (~380 px): yazı ≈ 9 px.
      label.setAttribute('font-size', String(Math.round(map.span / 42)));
      label.setAttribute('stroke-width', String(Math.round(map.span / 220)));
      label.classList.add('br-map-label');
      label.textContent = p.name;
      this.svg.append(label);
    }
    this.list.className = 'br-setup-list';
    areaBox.append(this.svg, this.list);

    // Oyuncu sayısı
    const playersRow = document.createElement('div');
    playersRow.className = 'settings-row';
    const playersLabel = document.createElement('span');
    playersLabel.className = 'settings-label';
    playersLabel.textContent = 'Oyuncu sayısı';
    const { min, max } = BATTLE_ROYALE.players;
    for (const input of [this.playersInput, this.playersNumber]) {
      input.min = String(min);
      input.max = String(max);
      input.step = '1';
      input.addEventListener('input', () => this.setPlayers(Number(input.value)));
    }
    this.playersInput.type = 'range';
    this.playersInput.className = 'br-setup-range';
    this.playersInput.setAttribute('aria-label', 'Oyuncu sayısı');
    this.playersNumber.type = 'number';
    this.playersNumber.className = 'br-setup-number';
    this.playersNumber.setAttribute('aria-label', 'Oyuncu sayısı (sayı)');
    const playersBox = document.createElement('div');
    playersBox.className = 'br-setup-players';
    playersBox.append(this.playersInput, this.playersNumber);
    playersRow.append(playersLabel, playersBox);

    // Bölge daralma aralığı (dakika)
    const shrinkRow = document.createElement('div');
    shrinkRow.className = 'settings-row';
    const shrinkLabel = document.createElement('span');
    shrinkLabel.className = 'settings-label';
    shrinkLabel.textContent = 'Bölge kaç dakikada bir daralsın';
    const interval = BATTLE_ROYALE.zone.intervalMinutes;
    for (const input of [this.shrinkInput, this.shrinkNumber]) {
      input.min = String(interval.min);
      input.max = String(interval.max);
      input.step = '1';
      input.addEventListener('input', () => this.setShrinkMinutes(Number(input.value)));
    }
    this.shrinkInput.type = 'range';
    this.shrinkInput.className = 'br-setup-range';
    this.shrinkInput.setAttribute('aria-label', 'Bölge daralma aralığı (dakika)');
    this.shrinkNumber.type = 'number';
    this.shrinkNumber.className = 'br-setup-number';
    this.shrinkNumber.setAttribute('aria-label', 'Bölge daralma aralığı (dakika, sayı)');
    const shrinkBox = document.createElement('div');
    shrinkBox.className = 'br-setup-players';
    shrinkBox.append(this.shrinkInput, this.shrinkNumber);
    shrinkRow.append(shrinkLabel, shrinkBox);
    const shrinkHint = document.createElement('p');
    shrinkHint.className = 'settings-hint';
    shrinkHint.textContent =
      'Her aşama bu kadar sürer (önce bekleme, sonra daralma). Alan çok büyükse bölge koşarak yetişilemeyecek hızda kapanmasın diye daralma seçtiğinden uzun sürebilir.';

    const difficultyRow = this.segmentedRow(
      'Zorluk',
      BR_DIFFICULTIES.map((d) => [d, DIFFICULTY_LABELS[d]] as [string, string]),
      this.difficultyButtons,
      (value) => this.patch({ difficulty: value as BrSetup['difficulty'] }),
    );
    const animalsRow = this.toggleRow('Vahşi hayvanlar', this.animalsButtons, (on) =>
      this.patch({ animals: on }),
    );
    const daylightRow = this.toggleRow('Sabit gündüz', this.daylightButtons, (on) =>
      this.patch({ fixedDaylight: on }),
    );

    this.summary.className = 'settings-hint br-setup-summary';
    this.hint.className = 'settings-hint br-setup-warning';
    this.hint.setAttribute('role', 'status');
    const actions = document.createElement('div');
    actions.className = 'br-setup-actions';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'secondary';
    back.textContent = 'Geri';
    back.addEventListener('click', () => this.hide());
    this.startButton.type = 'button';
    this.startButton.textContent = 'Başlat';
    this.startButton.addEventListener('click', () => this.start());
    actions.append(back, this.startButton);

    body.append(
      title,
      intro,
      areaRow,
      areaBox,
      playersRow,
      shrinkRow,
      shrinkHint,
      difficultyRow,
      animalsRow,
      daylightRow,
      this.summary,
      this.hint,
      actions,
    );
    this.root.append(body);
    parent.appendChild(this.root);
    this.render();
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.hint.textContent = '';
    this.render();
    this.startButton.focus({ preventScroll: true });
  }

  hide(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.options.closed?.();
  }

  dispose(): void {
    this.root.remove();
  }

  /** Şimdiki kurulum (testler/arayüz). */
  get current(): BrSetup {
    return this.setup;
  }

  private read(): BrSetup {
    let raw: unknown;
    try {
      const text = this.options.storage?.getItem(BR_SETUP_STORAGE_KEY);
      raw = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      raw = null;
    }
    return normalizeSetup(
      raw,
      (names) =>
        names.every((n) => this.options.adjacency.has(n)) &&
        isConnectedSelection(names, this.options.adjacency),
    );
  }

  private write(): void {
    try {
      this.options.storage?.setItem(BR_SETUP_STORAGE_KEY, JSON.stringify(this.setup));
    } catch {
      // Depo yoksa ya da doluysa kurulum yalnız bu oturumda kalır.
    }
  }

  private patch(change: Partial<BrSetup>): void {
    this.setup = { ...this.setup, ...change };
    this.write();
    this.render();
  }

  private setPlayers(n: number): void {
    if (!Number.isFinite(n)) return;
    this.patch({ players: clampPlayers(n) });
  }

  private setShrinkMinutes(n: number): void {
    if (!Number.isFinite(n)) return;
    this.patch({ shrinkMinutes: clampShrinkMinutes(n) });
  }

  private setAreaKind(kind: 'world' | 'provinces'): void {
    const area: BrAreaChoice =
      kind === 'world' ? { kind: 'world' } : { kind: 'provinces', names: [...this.selection] };
    const changed = area.kind !== this.setup.area.kind;
    this.patch({
      area,
      // Alan türü değişince oyuncu sayısı o türün varsayılanına döner.
      ...(changed ? { players: defaultPlayers(area) } : {}),
    });
  }

  private toggle(name: string): void {
    const next = toggleProvince(this.selection, name, this.options.adjacency);
    if (next === null) {
      const removing = this.selection.includes(name);
      this.hint.textContent = removing
        ? `${name} çıkarılamaz: seçili iller ikiye bölünür.`
        : `${name} eklenemez: seçili illerden birine sınır komşusu olmalı.`;
      return;
    }
    this.hint.textContent = '';
    this.selection = next;
    this.patch({ area: { kind: 'provinces', names: [...next] } });
  }

  private start(): void {
    if (this.setup.area.kind === 'provinces' && this.setup.area.names.length === 0) {
      this.hint.textContent = 'En az bir il seç (ya da "Tüm harita").';
      return;
    }
    this.hint.textContent = 'Maç hazırlanıyor…';
    // Hazırlık (plan, akış alanları) bir an sürebilir: ipucu çizilsin diye bir kare sonra başlatılır.
    requestAnimationFrame(() => {
      if (this.options.start(this.setup)) {
        this.hint.textContent = '';
        this.root.hidden = true;
      } else {
        this.hint.textContent = 'Maç başlatılamadı (bu dünyada yerleşim verisi yok).';
      }
    });
  }

  private render(): void {
    const setup = this.setup;
    const provincesMode = setup.area.kind === 'provinces';
    for (const [kind, button] of this.areaButtons) {
      mark(button, kind === setup.area.kind);
    }
    const states = provinceButtonStates(this.names, this.selection, this.options.adjacency);
    const buttons: HTMLButtonElement[] = [];
    for (const { name, state } of states) {
      const button = document.createElement('button');
      button.type = 'button';
      // Seçili il dolu (birincil) düğme, diğerleri ikincil görünümde.
      button.className =
        state === 'selected' || state === 'locked'
          ? 'br-setup-province'
          : 'br-setup-province secondary';
      button.dataset.state = state;
      button.textContent = name;
      button.disabled = !provincesMode || state === 'blocked';
      button.setAttribute('aria-pressed', String(state === 'selected' || state === 'locked'));
      if (state === 'locked') button.title = 'Çıkarılırsa seçili iller ikiye bölünür';
      button.addEventListener('click', () => this.toggle(name));
      buttons.push(button);
      const path = this.paths.get(name);
      if (path) path.dataset.state = provincesMode ? state : 'world';
    }
    this.list.replaceChildren(...buttons);
    this.list.hidden = !provincesMode;
    this.svg.dataset.mode = setup.area.kind;
    this.playersInput.value = String(setup.players);
    if (document.activeElement !== this.playersNumber) {
      this.playersNumber.value = String(setup.players);
    }
    this.shrinkInput.value = String(setup.shrinkMinutes);
    if (document.activeElement !== this.shrinkNumber) {
      this.shrinkNumber.value = String(setup.shrinkMinutes);
    }
    for (const [key, button] of this.difficultyButtons) {
      mark(button, key === setup.difficulty);
    }
    for (const [on, button] of this.animalsButtons) {
      mark(button, on === setup.animals);
    }
    for (const [on, button] of this.daylightButtons) {
      mark(button, on === setup.fixedDaylight);
    }
    this.summary.textContent = setupSummary(setup);
    this.startButton.disabled = provincesMode && this.selection.length === 0;
  }

  private segmentedRow(
    label: string,
    items: ReadonlyArray<[string, string]>,
    store: Map<string, HTMLButtonElement>,
    onPick: (value: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const caption = document.createElement('span');
    caption.className = 'settings-label';
    caption.textContent = label;
    const segmented = document.createElement('div');
    segmented.className = 'settings-segmented';
    segmented.setAttribute('role', 'radiogroup');
    segmented.setAttribute('aria-label', label);
    for (const [value, text] of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.textContent = text;
      button.addEventListener('click', () => onPick(value));
      store.set(value, button);
      segmented.append(button);
    }
    row.append(caption, segmented);
    return row;
  }

  private toggleRow(
    label: string,
    store: Map<boolean, HTMLButtonElement>,
    onPick: (on: boolean) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const caption = document.createElement('span');
    caption.className = 'settings-label';
    caption.textContent = label;
    const segmented = document.createElement('div');
    segmented.className = 'settings-segmented';
    segmented.setAttribute('role', 'radiogroup');
    segmented.setAttribute('aria-label', label);
    for (const [on, text] of [
      [true, 'Açık'],
      [false, 'Kapalı'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.textContent = text;
      button.addEventListener('click', () => onPick(on));
      store.set(on, button);
      segmented.append(button);
    }
    row.append(caption, segmented);
    return row;
  }
}

/** Bölümlü seçimde seçili düğme (ayarlar penceresiyle aynı görünüm: `active`). */
function mark(button: HTMLButtonElement, on: boolean): void {
  button.classList.toggle('active', on);
  button.setAttribute('aria-checked', String(on));
}
