import { PLACE_NOTICE } from '../config';

/** Bir yerin merkezi (oyun X/Z). */
export interface PlaceCenter {
  name: string;
  x: number;
  z: number;
}

export interface PlaceTrackerOptions {
  enterRadius?: number;
  exitRadius?: number;
  confirmSeconds?: number;
  cooldownSeconds?: number;
}

/**
 * Yer adı izleyicisi (saf mantık; il geçişi `ProvinceTracker`'ın il altı karşılığı). Her gözlemde oyuncunun
 * konumunu alır; bir yerin merkezine `enterRadius` içinde (en yakın yer kazanır) `confirmSeconds` kesintisiz
 * kalınca yerin adını bildirir. Kurallar:
 * - ilk gözlemde bulunulan yer sessizce kabul edilir (oyun başı, yükleme, yeni oyun, ışınlanma sonrası `reset`);
 * - yerden çıkış `exitRadius` ile (girişten geniş) olur: sınırda gidip gelmek tekrar bildirim üretmez;
 * - yerden çıkıp aynı ya da başka bir yere girmek yeni bildirimdir; iki bildirim arasında `cooldownSeconds`
 *   beklenir (araya giren yerler sessiz işlenir).
 */
export class PlaceTracker {
  private readonly places: readonly PlaceCenter[];
  private readonly enterRadius: number;
  private readonly exitRadius: number;
  private readonly confirmSeconds: number;
  private readonly cooldownSeconds: number;
  private current: string | null = null;
  private initialized = false;
  private candidate: { name: string; since: number } | null = null;
  private lastNoticeAt = Number.NEGATIVE_INFINITY;

  constructor(places: readonly PlaceCenter[], options: PlaceTrackerOptions = {}) {
    this.places = places;
    this.enterRadius = options.enterRadius ?? PLACE_NOTICE.enterRadiusM;
    this.exitRadius = options.exitRadius ?? PLACE_NOTICE.exitRadiusM;
    this.confirmSeconds = options.confirmSeconds ?? PLACE_NOTICE.confirmSeconds;
    this.cooldownSeconds = options.cooldownSeconds ?? PLACE_NOTICE.cooldownSeconds;
  }

  /** Bulunulan yer (yerde değilse null). */
  get place(): string | null {
    return this.current;
  }

  /** Yükleme/yeni oyun/ışınlanma sonrası: bir sonraki gözlemde bulunulan yer sessizce kabul edilir. */
  reset(): void {
    this.current = null;
    this.initialized = false;
    this.candidate = null;
    this.lastNoticeAt = Number.NEGATIVE_INFINITY;
  }

  /** Bir gözlem (`nowSeconds`: tek yönlü artan süre). Bildirilecek bir yer varsa adını döner. */
  observe(x: number, z: number, nowSeconds: number): string | null {
    const nearest = this.nearest(x, z);
    const entering = nearest !== null && nearest.distance <= this.enterRadius ? nearest.name : null;

    if (!this.initialized) {
      this.initialized = true;
      this.current = entering;
      return null;
    }

    // Çıkış histerezisi: mevcut yer, çıkış yarıçapı içinde olduğu sürece (başka bir yere girilmedikçe) korunur.
    if (this.current !== null && (entering === null || entering === this.current)) {
      const here = this.places.find((p) => p.name === this.current);
      if (here !== undefined && Math.hypot(x - here.x, z - here.z) <= this.exitRadius) {
        this.candidate = null;
        return null;
      }
      this.current = null;
    }

    if (entering === null || entering === this.current) {
      this.candidate = null;
      return null;
    }
    if (this.candidate?.name !== entering) {
      this.candidate = { name: entering, since: nowSeconds };
      return null;
    }
    if (nowSeconds - this.candidate.since < this.confirmSeconds) return null;

    this.current = entering;
    this.candidate = null;
    if (nowSeconds - this.lastNoticeAt < this.cooldownSeconds) return null;
    this.lastNoticeAt = nowSeconds;
    return entering;
  }

  private nearest(x: number, z: number): { name: string; distance: number } | null {
    let best: { name: string; distance: number } | null = null;
    for (const place of this.places) {
      const distance = Math.hypot(x - place.x, z - place.z);
      if (best === null || distance < best.distance) best = { name: place.name, distance };
    }
    return best;
  }
}
