import './ui.css';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { SaveError } from '../save/saveGame';
import type { SaveStore, SlotId, SlotState } from '../save/SaveStore';
import { CREDITS } from './credits';
import { SlotPicker } from './SlotPicker';
import { formatSummary } from './slotFormat';

const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['W A S D', 'Yürü'],
  ['Shift', 'Koş'],
  ['Boşluk', 'Zıpla'],
  ['Fare', 'Etrafa bak'],
  ['V', '1. / 3. şahıs kamera'],
  ['E', 'Topla / leş kes / et pişir / ateşe yakıt / su iç (basılı tut)'],
  ['Sol tık', 'Saldır (yerleştirme hayaleti varken kur)'],
  ['I / Tab', 'Envanter ve üretim'],
  ['F', 'Hızlı yemek'],
  ['C / G', 'Ateş / sundurma yerleştirme hayaleti (aynı tuş iptal)'],
  ['B', 'İl sınırlarını aç/kapa'],
  ['Esc', 'Duraklat'],
];

/** Yalnızca geliştirme modunda gösterilen ek kontroller. */
const DEV_CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['1 – 5', 'Işınlan (geliştirici)'],
  ['[ ]', 'Saati 1 saat geri/ileri (geliştirici)'],
  ['K', 'Canı sıfırla (geliştirici)'],
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
    this.isSuppressed = options.isSuppressed ?? (() => false);

    this.root.className = 'pause-menu';
    const panel = document.createElement('div');
    panel.className = 'pause-menu-panel';
    // Panele tıklamak menüyü kapatmaz; yalnızca dış alan (duraklatma menüsünde) devam ettirir.
    panel.addEventListener('click', (event) => event.stopPropagation());

    const title = document.createElement('h1');
    title.textContent = 'Anadolu Hayatı';
    this.subtitle.className = 'pause-menu-subtitle';
    this.latest.className = 'pause-menu-latest';
    this.buttons.className = 'pause-menu-buttons';
    this.hint.className = 'pause-menu-hint';

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

    panel.append(title, this.subtitle, this.latest, this.buttons, this.hint, controls, credits);
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
      );
    } else {
      items.push(
        this.button('Devam Et', false, true, () => this.host.resume()),
        this.button('Kaydet', !this.host.canSave(), false, () => this.picker.open('save')),
        this.button('Yükle', !hasSave, false, () => this.picker.open('load')),
        this.button('Ayarlar', false, false, this.openSettings),
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

function errorMessage(error: unknown): string {
  return error instanceof SaveError ? error.message : 'Beklenmeyen bir hata oluştu.';
}
