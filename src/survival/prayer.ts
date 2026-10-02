import { PRAYER } from '../config';
import { PRAYERS, PRAYER_NAMES, type Prayer } from './islamicTime';

/**
 * Camide vakit namazı (saf mantık). Vakit, girdiği saatten bir sonraki vakte kadar sürer: imsak → güneş (sabah
 * namazı), öğle → ikindi, ikindi → akşam, akşam → yatsı, yatsı → ertesi imsak. Güneş doğuşu ile öğle arası namaz
 * vakti değildir (kerahat ve kuşluk; vakit namazı yok). Camide `E` basılı tutulup `PRAYER.seconds` dolunca sağlık
 * `PRAYER.healthGain` kadar artar; her vakitte yalnızca bir kez (vaktin mutlak sırası kayda girer).
 */

/** Namazı kılınan vakitler (güneş doğuşu hariç) ve namazın görünen adı. */
export const PRAYER_PRAYABLE: Readonly<Record<Prayer, string | null>> = {
  imsak: 'Sabah',
  gunes: null,
  ogle: PRAYER_NAMES.ogle,
  ikindi: PRAYER_NAMES.ikindi,
  aksam: PRAYER_NAMES.aksam,
  yatsi: PRAYER_NAMES.yatsi,
};

/** İçinde bulunulan vakit: namazın adı ve mutlak sırası (`(gün + 1) · 6 + vakit sırası`; hep ≥ 0). */
export interface PrayerWindow {
  prayer: Prayer;
  name: string;
  key: number;
}

/**
 * `day`. günün `hour` saatinde içinde bulunulan namaz vakti; güneş doğuşu–öğle arasıysa null. İmsaktan önceki saatler
 * önceki günün yatsı vaktidir.
 */
export function prayerWindow(
  times: Readonly<Record<Prayer, number | null>>,
  hour: number,
  day: number,
): PrayerWindow | null {
  let index = -1;
  for (let i = 0; i < PRAYERS.length; i++) {
    const t = times[PRAYERS[i] as Prayer];
    if (t !== null && t <= hour + 1e-9) index = i;
  }
  let d = day;
  if (index < 0) {
    // Gece yarısından imsaka: dünün son (hesaplanabilen) vakti.
    d = day - 1;
    for (let i = PRAYERS.length - 1; i >= 0; i--) {
      if (times[PRAYERS[i] as Prayer] !== null) {
        index = i;
        break;
      }
    }
    if (index < 0) return null;
  }
  const prayer = PRAYERS[index] as Prayer;
  const name = PRAYER_PRAYABLE[prayer];
  if (name === null) return null;
  return { prayer, name, key: (d + 1) * PRAYERS.length + index };
}

export interface PrayerContext {
  /** Oyuncu caminin harimi içinde mi? */
  inMosque: boolean;
  alive: boolean;
  /** İçinde bulunulan vakit (yoksa null). */
  window: PrayerWindow | null;
}

/** Camideki namaz önerisi (HUD ipucu): `ready` kılınabilir, `prayed` bu vakit kılındı, `no_time` vakit değil. */
export interface PrayerOffer {
  status: 'ready' | 'prayed' | 'no_time';
  window: PrayerWindow | null;
  seconds: number;
}

/** Namaz takibi: camide `E` basılı tutma, vakit başına tek hak ve sağlık kazancı (`heal` geri çağrısıyla). */
export class PrayerTracker {
  private lastKey = -1;
  private elapsed = 0;
  private currentOffer: PrayerOffer | null = null;

  constructor(
    /** Sağlığı artırır (ölüyse false); `prayed` olayı çağıranın işidir. */
    private readonly heal: (amount: number) => boolean,
    private readonly onPrayed: (window: PrayerWindow, health: number) => void = () => {},
  ) {}

  get offer(): PrayerOffer | null {
    return this.currentOffer;
  }

  get progress(): number {
    return this.currentOffer?.status === 'ready' ? Math.min(this.elapsed / PRAYER.seconds, 1) : 0;
  }

  /** Bu vaktin namazı kılındı mı? */
  prayedIn(window: PrayerWindow): boolean {
    return window.key === this.lastKey;
  }

  toSave(): number {
    return this.lastKey;
  }

  loadSave(key: number): void {
    this.lastKey = Number.isInteger(key) && key >= -1 ? key : -1;
    this.elapsed = 0;
    this.currentOffer = null;
  }

  /** Bir sabit adım. `held`: `E` basılı (ve öncelikli başka eylem yok) mu? */
  update(dt: number, held: boolean, ctx: PrayerContext): void {
    if (!ctx.inMosque || !ctx.alive) {
      this.currentOffer = null;
      this.elapsed = 0;
      return;
    }
    const window = ctx.window;
    const status: PrayerOffer['status'] =
      window === null ? 'no_time' : this.prayedIn(window) ? 'prayed' : 'ready';
    this.currentOffer = { status, window, seconds: PRAYER.seconds };
    if (status !== 'ready' || !held || window === null) {
      this.elapsed = 0;
      return;
    }
    this.elapsed += dt;
    if (this.elapsed < PRAYER.seconds) return;
    this.elapsed = 0;
    if (!this.heal(PRAYER.healthGain)) return;
    this.lastKey = window.key;
    this.currentOffer = { status: 'prayed', window, seconds: PRAYER.seconds };
    this.onPrayed(window, PRAYER.healthGain);
  }
}

/** Camideki ipucu: "E (basılı tut): Öğle namazını kıl" / "Öğle namazı kılındı" / "Vakit değil (öğle: 12:05)". */
export function prayerPrompt(offer: PrayerOffer, nextLabel: string): string {
  if (offer.status === 'ready' && offer.window) {
    return `E (basılı tut): ${offer.window.name} namazını kıl`;
  }
  if (offer.status === 'prayed' && offer.window) {
    return `${offer.window.name} namazı kılındı · sonraki vakit: ${nextLabel}`;
  }
  return `Namaz vakti değil · sonraki vakit: ${nextLabel}`;
}
