import './ui.css';
import { SaveError } from '../save/saveGame';
import {
  AUTO_SLOT,
  slotLabel,
  type SaveStore,
  type SlotId,
  type SlotState,
} from '../save/SaveStore';
import { formatSlotInfo } from './slotFormat';

export type SlotPickerMode = 'save' | 'load';

export interface SlotPickerActions {
  /** Oyunu yuvaya kaydeder; hata fırlatırsa mesajı pencerede gösterilir. */
  save(slot: SlotId): Promise<void>;
  /** Yuvadaki kaydı yükler; başarılı olursa pencere kapanır. */
  load(slot: SlotId): Promise<void>;
}

/** Bekleyen iki adımlı onayın (üzerine yaz / sil) kendiliğinden vazgeçme süresi. */
const CONFIRM_TIMEOUT_MS = 4000;

/**
 * Kayıt yuvası seçici: "Kaydet" ya da "Yükle" kipinde yuvaları listeler. Dolu yuvanın üzerine yazmak ve
 * silmek iki adımlıdır (ilk tık onay ister). Otomatik yuva elle kaydedilmez (yalnızca yüklenir/silinir).
 */
export class SlotPicker {
  private readonly root = document.createElement('div');
  private readonly title = document.createElement('h2');
  private readonly list = document.createElement('div');
  private readonly hint = document.createElement('p');
  private readonly closeButton = document.createElement('button');
  private readonly offs: Array<() => void> = [];

  private mode: SlotPickerMode = 'load';
  private states: SlotState[] = [];
  private busy = false;
  private pending: { slot: SlotId; kind: 'overwrite' | 'delete' } | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  /** Eski (geç dönen) liste yanıtlarını yok saymak için. */
  private refreshToken = 0;

  constructor(
    parent: HTMLElement,
    private readonly store: SaveStore,
    private readonly actions: SlotPickerActions,
  ) {
    this.root.className = 'settings-panel slot-picker';
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.hide());

    const body = document.createElement('div');
    body.className = 'settings-panel-body slot-picker-body';
    body.setAttribute('role', 'dialog');
    body.addEventListener('click', (event) => event.stopPropagation());

    this.list.className = 'slot-list';
    this.hint.className = 'settings-hint slot-hint';
    this.closeButton.type = 'button';
    this.closeButton.textContent = 'Kapat';
    this.closeButton.addEventListener('click', () => this.hide());
    const actionsRow = document.createElement('div');
    actionsRow.className = 'settings-actions';
    actionsRow.append(this.closeButton);

    body.append(this.title, this.list, this.hint, actionsRow);
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

  open(mode: SlotPickerMode): void {
    this.mode = mode;
    this.title.textContent = mode === 'save' ? 'Kaydet' : 'Yükle';
    this.title.parentElement?.setAttribute('aria-label', this.title.textContent);
    this.hint.textContent = this.store.persistent
      ? ''
      : 'Tarayıcı depolaması kullanılamıyor: kayıtlar yalnızca bu oturumda kalır.';
    this.clearPending();
    this.states = [];
    this.render();
    this.root.hidden = false;
    this.closeButton.focus({ preventScroll: true });
    void this.refresh();
  }

  hide(): void {
    this.root.hidden = true;
    this.clearPending();
  }

  dispose(): void {
    this.clearPending();
    for (const off of this.offs) off();
    this.root.remove();
  }

  private async refresh(): Promise<void> {
    const token = ++this.refreshToken;
    try {
      const states = await this.store.list();
      if (token !== this.refreshToken) return;
      this.states = states;
    } catch (error) {
      if (token !== this.refreshToken) return;
      this.hint.textContent = messageOf(error);
    }
    this.render();
  }

  private render(): void {
    this.list.replaceChildren(...this.states.map((state) => this.row(state)));
  }

  private row(state: SlotState): HTMLElement {
    const { slot } = state;
    const row = document.createElement('div');
    row.className = 'slot-row';

    const name = document.createElement('span');
    name.className = 'slot-name';
    name.textContent = slotLabel(slot);
    const info = document.createElement('span');
    info.className = `slot-info${state.status === 'corrupt' ? ' corrupt' : ''}`;
    info.textContent = formatSlotInfo(state);

    const buttons = document.createElement('div');
    buttons.className = 'slot-buttons';

    if (this.mode === 'save') {
      if (slot !== AUTO_SLOT) {
        const occupied = state.status !== 'empty';
        const confirming = this.pending?.slot === slot && this.pending.kind === 'overwrite';
        buttons.append(
          this.button(confirming ? 'Üzerine yaz?' : 'Kaydet', this.busy, () => {
            if (occupied && !confirming) this.setPending(slot, 'overwrite');
            else void this.run(slot, 'save');
          }),
        );
      }
    } else {
      buttons.append(
        this.button('Yükle', this.busy || state.status !== 'ok', () => void this.run(slot, 'load')),
      );
    }

    if (state.status !== 'empty') {
      const confirming = this.pending?.slot === slot && this.pending.kind === 'delete';
      const del = this.button(confirming ? 'Emin misin?' : 'Sil', this.busy, () => {
        if (confirming) void this.remove(slot);
        else this.setPending(slot, 'delete');
      });
      del.classList.add('secondary');
      buttons.append(del);
    }

    row.append(name, info, buttons);
    return row;
  }

  private button(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  private setPending(slot: SlotId, kind: 'overwrite' | 'delete'): void {
    this.clearPending();
    this.pending = { slot, kind };
    this.pendingTimer = setTimeout(() => {
      this.pending = null;
      this.pendingTimer = null;
      this.render();
    }, CONFIRM_TIMEOUT_MS);
    this.render();
  }

  private clearPending(): void {
    this.pending = null;
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
  }

  private async run(slot: SlotId, kind: 'save' | 'load'): Promise<void> {
    this.clearPending();
    this.busy = true;
    this.hint.textContent = '';
    this.render();
    try {
      await (kind === 'save' ? this.actions.save(slot) : this.actions.load(slot));
      if (kind === 'load') {
        this.hide();
      } else {
        this.hint.textContent = `Kaydedildi: ${slotLabel(slot)}`;
      }
    } catch (error) {
      this.hint.textContent = messageOf(error);
    } finally {
      this.busy = false;
      if (this.visible) await this.refresh();
    }
  }

  private async remove(slot: SlotId): Promise<void> {
    this.clearPending();
    this.busy = true;
    this.render();
    try {
      await this.store.delete(slot);
      this.hint.textContent = `Silindi: ${slotLabel(slot)}`;
    } catch (error) {
      this.hint.textContent = messageOf(error);
    } finally {
      this.busy = false;
      await this.refresh();
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof SaveError ? error.message : 'Beklenmeyen bir hata oluştu.';
}
