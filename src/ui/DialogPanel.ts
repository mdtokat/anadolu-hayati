import './ui.css';
import { INPUT } from '../config';
import { closeButton, el } from './widgets';

/** Konuşmada oyuncunun seçebileceği bir söz. */
export interface DialogOption {
  /** Oyuncunun sözü (düğme metni, konuşma kaydına da yazılır). */
  label: string;
  /** Seçilince kişinin cevabı (null: cevap yok). Seçenekler sonra yeniden okunur (takas sonrası güncellenir). */
  select(): string | null;
  /** Seçilince konuşma kapanır (vedalaşma). */
  closes?: boolean;
  /** Kullanılamaz (ör. eşya yok): düğme sönük. */
  disabled?: boolean;
  /** Takas gibi vurgulu seçenek. */
  kind?: 'talk' | 'trade' | 'farewell';
}

export interface DialogModel {
  /** Kişinin adı ("Çoban Hasan") ve kısa açıklama. */
  title: string;
  subtitle: string;
  /** Açılışta kişinin ilk sözü. */
  opening: string;
  /** Güncel seçenekler (her seçimden sonra yeniden okunur). */
  options(): DialogOption[];
}

/**
 * Konuşma paneli (Faz 10; HTML overlay, envanter paneliyle aynı görünüm): solda konuşma kaydı, altta oyuncunun
 * seçebileceği sözler (selam, yol sorma, takas, vedalaşma). Oyun panel açıkken duraklatılır (Game).
 */
export class DialogPanel {
  private readonly root = el('div', 'inv-panel dialog-panel');
  private readonly panel = el('div', 'inv-panel-body dialog-body');
  private readonly log = el('div', 'dialog-log');
  private readonly choices = el('div', 'dialog-choices');
  private model: DialogModel | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const closers: readonly string[] = [...INPUT.bindings.interact, 'Escape'];
    if (event.repeat) return;
    if (closers.includes(event.code)) {
      event.preventDefault();
      this.onClose();
      return;
    }
    // Rakam tuşlarıyla seçim (1–9).
    const digit = /^Digit([1-9])$/.exec(event.code);
    if (digit) {
      const button = this.choices.querySelectorAll('button')[Number(digit[1]) - 1];
      if (button instanceof HTMLButtonElement && !button.disabled) {
        event.preventDefault();
        button.click();
      }
    }
  };

  constructor(
    parent: HTMLElement,
    private readonly onClose: () => void,
  ) {
    this.root.hidden = true;
    this.panel.addEventListener('click', (event) => event.stopPropagation());
    this.root.addEventListener('click', () => this.onClose());
    this.root.append(this.panel);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.model !== null;
  }

  show(model: DialogModel): void {
    const wasOpen = this.model !== null;
    this.model = model;
    this.root.hidden = false;
    if (!wasOpen) document.addEventListener('keydown', this.onKeyDown);
    const header = el('div', 'inv-header');
    const titleBox = el('div', 'inv-title-box');
    titleBox.append(el('h2', 'inv-title', model.title), el('div', 'inv-title-sub', model.subtitle));
    header.append(
      titleBox,
      closeButton('Ayrıl', 'E', () => this.onClose()),
    );
    this.log.replaceChildren();
    this.say('them', model.opening);
    this.panel.replaceChildren(header, el('div', 'ui-ornament'), this.log, this.choices);
    this.renderChoices();
  }

  hide(): void {
    if (this.model === null) return;
    this.model = null;
    this.root.hidden = true;
    document.removeEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  private say(who: 'me' | 'them', text: string): void {
    const line = el('div', `dialog-line dialog-${who}`, text);
    this.log.append(line);
    this.log.scrollTop = this.log.scrollHeight;
  }

  private renderChoices(): void {
    const model = this.model;
    if (!model) return;
    const buttons = model.options().map((option, index) => {
      const button = el('button', `dialog-choice dialog-${option.kind ?? 'talk'}`);
      button.type = 'button';
      button.disabled = option.disabled ?? false;
      button.append(el('span', 'dialog-key', String(index + 1)), el('span', '', option.label));
      button.addEventListener('click', () => {
        this.say('me', option.label);
        const reply = option.select();
        if (reply) this.say('them', reply);
        if (option.closes) {
          // Veda sözü bir an görünsün.
          window.setTimeout(() => this.onClose(), 650);
          for (const b of this.choices.querySelectorAll('button')) b.disabled = true;
          return;
        }
        this.renderChoices();
      });
      return button;
    });
    this.choices.replaceChildren(...buttons);
  }
}
