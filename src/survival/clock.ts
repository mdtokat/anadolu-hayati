import { CLOCK } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { sunPosition, type SkyPosition } from './astronomy';

export interface ClockOptions {
  dayLengthSeconds?: number;
  startHour?: number;
  dayOfYear?: number;
  latitudeDeg?: number;
  nightSunAltitudeDeg?: number;
}

/**
 * Oyun saati (saf mantık). Gerçek saniyeyi oyun saatine çevirir, güneşin konumunu verir ve
 * gece/gündüz geçişinde `time:nightStarted` / `time:dayStarted` olaylarını yayınlar.
 * Yılın günü sabittir (mevsim ileride); `day` yalnızca geçen gün sayısıdır.
 */
export class GameClock {
  private readonly dayLengthSeconds: number;
  private readonly dayOfYear: number;
  private readonly latitudeDeg: number;
  private readonly nightSunAltitudeDeg: number;

  private hourValue: number;
  private dayCount = 0;
  private night: boolean;

  constructor(
    options: ClockOptions = {},
    private readonly events?: EventBus<GameEvents>,
  ) {
    this.dayLengthSeconds = options.dayLengthSeconds ?? CLOCK.dayLengthSeconds;
    this.dayOfYear = options.dayOfYear ?? CLOCK.dayOfYear;
    this.latitudeDeg = options.latitudeDeg ?? CLOCK.latitudeDeg;
    this.nightSunAltitudeDeg = options.nightSunAltitudeDeg ?? CLOCK.nightSunAltitudeDeg;
    this.hourValue = normalizeHour(options.startHour ?? CLOCK.startHour);
    this.night = this.computeNight();
  }

  /** Gün saati (0 ≤ h < 24). */
  get hour(): number {
    return this.hourValue;
  }

  /** Oyun başından beri tamamlanan gün sayısı (0'dan başlar). */
  get day(): number {
    return this.dayCount;
  }

  get isNight(): boolean {
    return this.night;
  }

  /** Şu anki güneş konumu. */
  get sun(): SkyPosition {
    return sunPosition(this.latitudeDeg, this.dayOfYear, this.hourValue);
  }

  /** Bir oyun saatinin gerçek süresi (saniye). */
  get secondsPerHour(): number {
    return this.dayLengthSeconds / 24;
  }

  /** `seconds` gerçek saniye kadar ilerletir. */
  advance(seconds: number): void {
    if (seconds <= 0) return;
    this.moveTo(this.hourValue + (seconds / this.dayLengthSeconds) * 24, true);
  }

  /** Saati doğrudan ayarlar (geliştirici kısayolu); gün sayısı değişmez, geçiş olayları yine yayınlanır. */
  setHour(hour: number): void {
    this.moveTo(normalizeHour(hour), false);
  }

  /**
   * Kayıttan saati ve gün sayısını yükler. Gece/gündüz bayrağı yeniden hesaplanır ama geçiş olayı
   * yayınlanmaz (yüklemede "gece bastı" bildirimi çıkmasın).
   */
  restore(hour: number, day: number): void {
    this.hourValue = normalizeHour(hour);
    this.dayCount = Math.max(0, Math.floor(day));
    this.night = this.computeNight();
  }

  /** `hours` oyun saati ileri (ya da geri) sarar; gün sınırını aşarsa gün sayısı da ilerler. */
  skipHours(hours: number): void {
    this.moveTo(this.hourValue + hours, true);
  }

  private moveTo(rawHour: number, countDays: boolean): void {
    if (countDays) this.dayCount = Math.max(0, this.dayCount + Math.floor(rawHour / 24));
    this.hourValue = normalizeHour(rawHour);

    const night = this.computeNight();
    if (night !== this.night) {
      this.night = night;
      this.events?.emit(night ? 'time:nightStarted' : 'time:dayStarted', { day: this.dayCount });
    }
  }

  private computeNight(): boolean {
    return this.sun.altitudeDeg < this.nightSunAltitudeDeg;
  }
}

/** Saati [0, 24) aralığına sarar. */
export function normalizeHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/** "HH:MM" biçimi (24 saat). */
export function formatClock(hour: number): string {
  const totalMinutes = Math.floor(normalizeHour(hour) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
