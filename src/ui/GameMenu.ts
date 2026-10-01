import './ui.css';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { SaveError } from '../save/saveGame';
import type { SaveStore, SlotId, SlotState } from '../save/SaveStore';
import { icon } from './icons';
import { SlotPicker } from './SlotPicker';
import { formatSummary } from './slotFormat';

/** Kontrol listesi: tuşlar (her biri ayrı tuş simgesi) ve eylem; menünün sağ sütununda gruplanır. */
type ControlRow = readonly [keys: readonly string[], action: string];

const CONTROL_GROUPS: ReadonlyArray<readonly [title: string, rows: readonly ControlRow[]]> = [
  [
    'Hareket',
    [
      [['W', 'A', 'S', 'D'], 'Yürü'],
      [['Shift'], 'Koş'],
      [['Boşluk'], 'Zıpla'],
      [['Fare'], 'Etrafa bak'],
      [['V'], '1. / 3. şahıs kamera'],
    ],
  ],
  [
    'Hayatta kalma',
    [
      [['E'], 'Topla, leş kes, pişir, yakıt at, su iç (basılı tut)'],
      [['Sol tık'], 'Saldır · hayalet varken kur'],
      [['F'], 'Hızlı yemek'],
      [['I', 'Tab'], 'Envanter ve üretim'],
      [['1–8', 'Tekerlek'], 'Kısayol çubuğu'],
    ],
  ],
  [
    'İnşa',
    [
      [['C', 'G'], 'Ateş / sundurma hayaleti'],
      [['R'], 'Hayaleti döndür'],
      [['X'], 'Yapıyı sök (basılı tut)'],
    ],
  ],
  [
    'Diğer',
    [
      [['B'], 'İl sınırları'],
      [['Esc'], 'Duraklat'],
    ],
  ],
];

/** Yalnızca geliştirme modunda gösterilen ek kontroller. */
const DEV_CONTROLS: readonly ControlRow[] = [
  [['T', '1–0'], 'Işınlan'],
  [['Shift', '1–0'], 'İldeki yerlere ışınlan'],
  [['P', 'O'], 'Malzeme / inşa eşyası ver'],
  [['[', ']'], 'Saati ±1 saat'],
  [['K'], 'Canı sıfırla'],
];

/** Menünün oyundan istedikleri; mantık `Game`'dedir, menü yalnızca arayüzdür. */
export interface GameMenuHost {
  /** Oyuna döner (fare kilidi ister). */
  resume(): void;
  /** Yeni oyun başlatır: durumu başlangıca döndürür ve fare kilidi ister. */
  newGame(): void;
  /** En son kayıttan devam eder (kilit ister); okunabilir kayıt yoksa `false`. Bozuk kayıtta `SaveError` fırlatır. */
  continueLatest(): Promise<boolean>;
  saveToSlot(slot: SlotId): Promise<void>;
  /** Yuvayı yükler ve fare kilidi ister. */
  loadFromSlot(slot: SlotId): Promise<void>;
  /** Şu an kaydedilebilir mi (ölüyken ya da test dünyasında değil)? */
  canSave(): boolean;
  /** Ana menüye dönmeden önce ilerlemeyi otomatik yuvaya yazar (hata sessizce yutulur). */
  autosaveNow(): Promise<void>;
}

export interface GameMenuOptions {
  host: GameMenuHost;
  store: SaveStore;
  openSettings: () => void;
  openCredits: () => void;
  /** Menü şu an gösterilmemeli mi (ör. envanter paneli açıkken oyun duraklıdır ama menü çıkmaz)? */
  isSuppressed?: () => boolean;
}

type View = 'main' | 'pause';
type Confirm = 'newGame';

/**
 * Ana menü ve duraklatma menüsü. Oyun açılınca ana menü (Devam / Yeni Oyun / Yükle / Ayarlar), oyun
 * sürerken duraklayınca (pointer lock kaybı, örn. Esc) duraklatma menüsü (Devam Et / Kaydet / Yükle /
 * Ayarlar / Ana Menüye Dön) görünür. Mevcut ilerlemeyi silebilecek eylemler (Yeni Oyun) iki adımlıdır.
 */
export class GameMenu {
  private readonly root = document.createElement('div');
  private readonly subtitle = document.createElement('p');
  private readonly latest = document.createElement('p');
  private readonly buttons = document.createElement('div');
  private readonly hint = document.createElement('p');
  private readonly picker: SlotPicker;
  private readonly host: GameMenuHost;
  private readonly store: SaveStore;
  private readonly openSettings: () => void;
  private readonly openCredits: () => void;
  private readonly isSuppressed: () => boolean;
  private readonly offs: Array<() => void> = [];

  /** Bu açılışta oyuna girildi mi (kayıt yüklendi, yeni oyun başladı ya da oyun sürdü)? */
  private session = false;
  private view: View = 'main';
  private slots: SlotState[] = [];
  private busy = false;
  private confirm: Confirm | null = null;
  private refreshToken = 0;

  constructor(parent: HTMLElement, events: EventBus<GameEvents>, options: GameMenuOptions) {
    this.host = options.host;
    this.store = options.store;
    this.openSettings = options.openSettings;
    this.openCredits = options.openCredits;
    this.isSuppressed = options.isSuppressed ?? (() => false);

    this.root.className = 'pause-menu';
    const panel = document.createElement('div');
    panel.className = 'pause-menu-panel';
    // Panele tıklamak menüyü kapatmaz; yalnızca dış alan (duraklatma menüsünde) devam ettirir.
    panel.addEventListener('click', (event) => event.stopPropagation());

    const brand = document.createElement('div');
    brand.className = 'pause-menu-brand';
    const logo = icon(LOGO, 'pause-menu-logo');
    const title = document.createElement('h1');
    title.textContent = 'Anadolu Hayatı';
    const tagline = document.createElement('p');
    tagline.className = 'pause-menu-tagline';
    tagline.textContent = 'Batı Karadeniz’de hayatta kal';
    brand.append(logo, title, tagline);
    this.subtitle.className = 'pause-menu-subtitle';
    this.latest.className = 'pause-menu-latest';
    this.buttons.className = 'pause-menu-buttons';
    this.hint.className = 'pause-menu-hint';
    this.hint.setAttribute('role', 'status');

    const main = document.createElement('div');
    main.className = 'pause-menu-main';
    main.append(brand, this.subtitle, this.latest, this.buttons, this.hint);

    const controls = document.createElement('div');
    controls.className = 'pause-menu-controls';
    const groups = import.meta.env.DEV
      ? [...CONTROL_GROUPS, ['Geliştirici', DEV_CONTROLS] as const]
      : CONTROL_GROUPS;
    for (const [heading, rows] of groups) controls.append(controlGroup(heading, rows));

    panel.append(main, controls);
    this.root.append(panel);
    // Dış alana tık: yalnızca duraklatma menüsünde oyuna döner (ana menüde yanlışlıkla başlamasın).
    this.root.addEventListener('click', () => {
      if (this.view === 'pause' && !this.busy) this.host.resume();
    });
    parent.appendChild(this.root);

    this.picker = new SlotPicker(parent, this.store, {
      save: (slot) => this.pickSave(slot),
      load: (slot) => this.pickLoad(slot),
    });

    this.render();
    this.offs.push(
      events.on('game:resumed', () => {
        this.session = true;
        this.hint.textContent = '';
        this.confirm = null;
        this.root.hidden = true;
      }),
      events.on('game:paused', () => {
        if (!this.isSuppressed()) this.show();
      }),
      events.on('input:pointerLockFailed', () => {
        this.hint.textContent = 'Tarayıcı fare kilidini hemen vermedi; lütfen tekrar tıkla.';
        if (!this.isSuppressed()) this.show();
      }),
    );
    void this.refreshSlots();
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.picker.dispose();
    this.root.remove();
  }

  /** Menüyü gösterir (oyun duraklıyken; envanter kapanınca fare kilidi alınamazsa da çağrılır). */
  show(): void {
    this.view = this.session ? 'pause' : 'main';
    this.confirm = null;
    this.root.hidden = false;
    this.render();
    void this.refreshSlots();
    this.root
      .querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus({ preventScroll: true });
  }

  /** Yuva listesini yeniler (düğmelerin etkin/pasif durumu ve "Devam" satırı için). */
  private async refreshSlots(): Promise<void> {
    const token = ++this.refreshToken;
    try {
      const slots = await this.store.list();
      if (token !== this.refreshToken) return;
      this.slots = slots;
    } catch (error) {
      if (token !== this.refreshToken) return;
      this.slots = [];
      this.hint.textContent = errorMessage(error);
    }
    this.render();
  }

  private get playable(): SlotState[] {
    return this.slots.filter((s) => s.status === 'ok');
  }

  private get autoOccupied(): boolean {
    return this.slots.some((s) => s.slot === 'auto' && s.status !== 'empty');
  }

  /** En yeni okunabilir yuva (Devam satırı için). */
  private latestState(): Extract<SlotState, { status: 'ok' }> | null {
    let best: Extract<SlotState, { status: 'ok' }> | null = null;
    for (const state of this.slots) {
      if (state.status !== 'ok') continue;
      if (!best || Date.parse(state.summary.savedAt) > Date.parse(best.summary.savedAt))
        best = state;
    }
    return best;
  }

  private render(): void {
    const main = this.view === 'main';
    this.subtitle.textContent = main ? 'Ana Menü' : 'Duraklatıldı';

    const latest = this.latestState();
    const showLatest = main && !this.session && latest !== null;
    this.latest.hidden = !showLatest;
    this.latest.textContent = showLatest ? `Son kayıt: ${formatSummary(latest.summary)}` : '';

    const hasSave = this.playable.length > 0;
    const items: HTMLButtonElement[] = [];
    if (main) {
      if (this.session) {
        items.push(this.button('Oyuna Dön', false, true, () => this.host.resume()));
      } else {
        items.push(
          this.button('Devam', !hasSave, true, () =>
            this.act(async () => {
              if (!(await this.host.continueLatest())) {
                this.hint.textContent = 'Okunabilir kayıt bulunamadı.';
              } else {
                this.session = true;
              }
            }),
          ),
        );
      }
      items.push(
        this.button(
          this.confirm === 'newGame' ? 'Onayla: Yeni Oyun' : 'Yeni Oyun',
          false,
          false,
          () => this.onNewGame(),
        ),
        this.button('Yükle', !hasSave, false, () => this.picker.open('load')),
        this.button('Ayarlar', false, false, this.openSettings),
        this.button('Krediler', false, false, this.openCredits),
      );
    } else {
      items.push(
        this.button('Devam Et', false, true, () => this.host.resume()),
        this.button('Kaydet', !this.host.canSave(), false, () => this.picker.open('save')),
        this.button('Yükle', !hasSave, false, () => this.picker.open('load')),
        this.button('Ayarlar', false, false, this.openSettings),
        this.button('Krediler', false, false, this.openCredits),
        this.button('Ana Menüye Dön', false, false, () =>
          this.act(async () => {
            await this.host.autosaveNow();
            this.view = 'main';
            this.hint.textContent = '';
          }),
        ),
      );
    }
    this.buttons.replaceChildren(...items);
  }

  private button(
    label: string,
    disabled: boolean,
    primary: boolean,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled || this.busy;
    if (!primary) button.className = 'secondary';
    button.addEventListener('click', () => {
      if (this.confirm !== null && label !== 'Onayla: Yeni Oyun') {
        this.confirm = null;
        this.hint.textContent = '';
      }
      onClick();
    });
    return button;
  }

  /** Yeni Oyun: ilerleme ya da otomatik kayıt kaybolabilecekse önce onay ister. */
  private onNewGame(): void {
    const risky = this.session || this.autoOccupied;
    if (risky && this.confirm !== 'newGame') {
      this.confirm = 'newGame';
      this.hint.textContent = this.session
        ? 'Kaydetmediğin ilerleme kaybolur. Devam etmek için tekrar tıkla.'
        : 'Yeni oyun otomatik kayıt yuvasının üzerine yazar. Devam etmek için tekrar tıkla.';
      this.render();
      return;
    }
    this.confirm = null;
    this.hint.textContent = '';
    this.session = true;
    this.host.newGame();
  }

  /** Eşzamansız eylem: bitene kadar düğmeler kilitli; hata mesajı gösterilir. */
  private act(action: () => Promise<void>): void {
    this.busy = true;
    this.hint.textContent = '';
    this.render();
    void action()
      .catch((error: unknown) => {
        this.hint.textContent = errorMessage(error);
      })
      .finally(() => {
        this.busy = false;
        this.render();
        void this.refreshSlots();
      });
  }

  private async pickSave(slot: SlotId): Promise<void> {
    await this.host.saveToSlot(slot);
  }

  private async pickLoad(slot: SlotId): Promise<void> {
    await this.host.loadFromSlot(slot);
    this.session = true;
  }
}

/** Menü logosu: favicon'daki dağ ve güneş (sabit SVG). */
const LOGO =
  '<rect width="24" height="24" rx="5" fill="#1d3b2a"/><path d="M2.2 19 9 8.4l3.8 5.3 3-3.8 6 9.1z" fill="#6fae5c"/><path d="M9 8.4l1.9 2.6-1.9 1.4-1.6-1.6z" fill="#cfe8c2"/><circle cx="17.3" cy="6" r="2.3" fill="#ffd23f"/>';

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

function errorMessage(error: unknown): string {
  return error instanceof SaveError ? error.message : 'Beklenmeyen bir hata oluştu.';
}
