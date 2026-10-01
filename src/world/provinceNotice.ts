import { PROVINCE_NOTICE } from '../config';

/** Oyuncunun o anki ili: `name` null ise hiçbir ilin içinde değil (deniz, harita dışı). */
export interface ProvinceSample {
  name: string | null;
  /** Bölgenin hedef illerinden biri mi (`true`), yoksa yürünebilir komşu il mi (`false`)? */
  inRegion: boolean;
}

/** Bildirilecek il geçişi. */
export interface ProvinceChange {
  /** Girilen il. */
  name: string;
  inRegion: boolean;
  /** Önceki (bilinen son) il. */
  from: string;
}

export interface ProvinceTrackerOptions {
  confirmSeconds?: number;
  cooldownSeconds?: number;
}

/**
 * İl geçişi izleyicisi (saf mantık). Her gözlemde oyuncunun ilini alır; yeni bir ile girildiğini ancak
 * orada `confirmSeconds` kesintisiz kalınınca bildirir (sınır çizgisi boyunca yürürken titreme elenir) ve
 * iki bildirim arasında `cooldownSeconds` bekler (araya giren geçişler sessizce işlenir).
 *
 * Kurallar: ilk bilinen il sessizce kabul edilir (oyun başlangıcı, yükleme, yeni oyun: "hoş geldiniz" yok);
 * ilsiz yer (deniz) mevcut ili değiştirmez, yani A → deniz → A bildirim üretmez, A → deniz → B üretir.
 */
export class ProvinceTracker {
  private readonly confirmSeconds: number;
  private readonly cooldownSeconds: number;
  private current: string | null = null;
  private candidate: { name: string; inRegion: boolean; since: number } | null = null;
  private lastNoticeAt = Number.NEGATIVE_INFINITY;

  constructor(options: ProvinceTrackerOptions = {}) {
    this.confirmSeconds = options.confirmSeconds ?? PROVINCE_NOTICE.confirmSeconds;
    this.cooldownSeconds = options.cooldownSeconds ?? PROVINCE_NOTICE.cooldownSeconds;
  }

  /** Bilinen son il (henüz yoksa null). */
  get province(): string | null {
    return this.current;
  }

  /** Yükleme/yeni oyun/ışınlanma sonrası: bir sonraki bilinen il sessizce kabul edilir. */
  reset(): void {
    this.current = null;
    this.candidate = null;
    this.lastNoticeAt = Number.NEGATIVE_INFINITY;
  }

  /** Bir gözlem (`nowSeconds`: tek yönlü artan süre). Bildirilecek bir geçiş varsa döner. */
  observe(sample: ProvinceSample, nowSeconds: number): ProvinceChange | null {
    const { name } = sample;
    if (name === null || name === this.current) {
      this.candidate = null;
      return null;
    }
    if (this.current === null) {
      this.current = name;
      this.candidate = null;
      return null;
    }
    if (this.candidate?.name !== name) {
      this.candidate = { name, inRegion: sample.inRegion, since: nowSeconds };
      return null;
    }
    if (nowSeconds - this.candidate.since < this.confirmSeconds) return null;

    const change: ProvinceChange = { name, inRegion: sample.inRegion, from: this.current };
    this.current = name;
    this.candidate = null;
    if (nowSeconds - this.lastNoticeAt < this.cooldownSeconds) return null;
    this.lastNoticeAt = nowSeconds;
    return change;
  }
}

const BACK_VOWELS = 'aıou';
const VOWELS = 'aeıioöuü';

/**
 * Özel ismin yönelme (-e hâli) biçimi, kesme işaretiyle: Bartın'a, Karabük'e, Bolu'ya, Düzce'ye.
 * Ünlü uyumu son ünlüye, kaynaştırma "y"si sesli harfle bitişe bakar.
 */
export function turkishDative(name: string): string {
  const lower = name.toLocaleLowerCase('tr');
  const chars = [...lower];
  const lastVowel = [...chars].reverse().find((c) => VOWELS.includes(c));
  const suffix = lastVowel !== undefined && BACK_VOWELS.includes(lastVowel) ? 'a' : 'e';
  const endsWithVowel = VOWELS.includes(chars.at(-1) ?? '');
  return `${name}'${endsWithVowel ? 'y' : ''}${suffix}`;
}

/** Bildirim metni: hedef bölge ilinde "Bartın'a hoş geldiniz", komşu ilde "Bolu'ya girdiniz". */
export function provinceNoticeText(change: Pick<ProvinceChange, 'name' | 'inRegion'>): string {
  const dative = turkishDative(change.name);
  return change.inRegion ? `${dative} hoş geldiniz` : `${dative} girdiniz`;
}
