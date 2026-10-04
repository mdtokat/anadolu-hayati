import './ui.css';
import { BATTLE_ROYALE } from '../config';

/**
 * Battle Royale maç göstergeleri (BR.6; HTML, `backdrop-filter` yok): üst ortada pusulanın altında kalan/öldürme ve bölge
 * satırı (dışarıdayken kızıl), ateşkes sayacı; sağ üstte öldürme listesi (son `killFeedSize` olay, `feedMs` sonra solar).
 */
export class BrHud {
  private readonly root = document.createElement('div');
  private readonly counts = document.createElement('div');
  private readonly zone = document.createElement('div');
  private readonly truce = document.createElement('div');
  private readonly feed = document.createElement('ul');
  private readonly entries: Array<{ el: HTMLLIElement; until: number }> = [];

  constructor(parent: HTMLElement) {
    this.root.className = 'br-hud';
    this.root.hidden = true;
    this.counts.className = 'br-hud-counts';
    this.zone.className = 'br-hud-zone';
    this.truce.className = 'br-hud-truce';
    this.feed.className = 'br-feed';
    this.feed.hidden = true;
    this.feed.setAttribute('aria-live', 'polite');
    this.root.append(this.counts, this.zone, this.truce);
    parent.append(this.root, this.feed);
  }

  setVisible(on: boolean): void {
    this.root.hidden = !on;
    this.feed.hidden = !on;
    if (!on) {
      this.entries.length = 0;
      this.feed.replaceChildren();
    }
  }

  /** Satırlar (değişmediyse DOM'a dokunmaz). `truce`: ateşkes metni (yoksa null). */
  set(counts: string, zone: string, outside: boolean, truce: string | null): void {
    if (this.counts.textContent !== counts) this.counts.textContent = counts;
    if (this.zone.textContent !== zone) this.zone.textContent = zone;
    this.zone.dataset.danger = String(outside);
    this.truce.hidden = truce === null;
    if (truce !== null && this.truce.textContent !== truce) this.truce.textContent = truce;
  }

  /** Öldürme listesine satır ekler (`mine`: oyuncunun kendi öldürmesi/ölümü vurgulu). */
  push(text: string, now: number, mine: boolean): void {
    const li = document.createElement('li');
    li.textContent = text;
    if (mine) li.dataset.mine = 'true';
    this.feed.append(li);
    this.entries.push({ el: li, until: now + BR_HUD_FEED_MS });
    while (this.entries.length > BATTLE_ROYALE.killFeedSize) this.entries.shift()?.el.remove();
  }

  /** Süresi dolan satırları kaldırır (kare başına). */
  tick(now: number): void {
    while (this.entries.length > 0 && this.entries[0]!.until <= now)
      this.entries.shift()?.el.remove();
  }

  dispose(): void {
    this.root.remove();
    this.feed.remove();
  }
}

/** Öldürme listesi satırının ekranda kalma süresi (ms). */
export const BR_HUD_FEED_MS = 7000;
