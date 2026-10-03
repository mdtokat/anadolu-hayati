import { HINTS } from '../config';

/** İpucu kimlikleri, gösterim önceliği sırasıyla. Liste yalnızca sona eklenir (kayıtlı "görüldü" kimlikleri). */
export const HINT_IDS = [
  'controls',
  'water',
  'food',
  'fire',
  'shelter',
  'hunt',
  'town',
  'person',
  // ── Faz 11: D (11.5) ──
  'ranged',
] as const;
export type HintId = (typeof HINT_IDS)[number];

/** İpucu metinleri (tek yerde; tuşlar `config.ts` → `INPUT.bindings` ile uyumlu). */
export const HINT_TEXT: Readonly<Record<HintId, string>> = {
  controls:
    'Yürü: W A S D · Bak: fare · Koş: Shift · Zıpla: Boşluk · Envanter: I · Etkileşim: E (basılı tut) · Kısayol: 1–8 / tekerlek',
  water: 'Susuyorsun: bir nehir, dere ya da göl kenarına git ve E tuşunu basılı tutarak su iç.',
  food: 'Acıkıyorsun: böğürtlen, fındık, kestane ya da mantar topla (E basılı tut), F ile ye.',
  fire: 'Hava soğuyor: dal ve kütük topla, I ile taş balta üret, C ile kamp ateşi kur; yakıtı E ile ekle.',
  shelter:
    'Sundurma (G) soğuğu azaltır; çalışma tezgâhının yanında üretilen ahşap kulübe daha iyi korur. Ateşin yanında ve barınakta hareketsiz durarak dinlen: can ve enerji daha hızlı dolar.',
  hunt: 'Yakında av hayvanı var: sol tık saldırır (taş balta ya da mızrak daha güçlü). Karaca, geyik, tavşan ve sülünün eti helaldir: leşi E basılı tutarak kes, ateşte pişir. Yaban domuzu necistir, kesilmez; kurt ve ayının yalnızca derisi ve kemiği, tilkinin postu alınır. Ayıdan uzak dur.',
  town: 'Terk edilmiş bir yerleşimdesin: evlerin ve dükkânların kapısında E basılı tutarak kilerleri ara. Camiler kutsal ve güvenli sığınaktır (yağmalanmaz); çeşmelerden su içebilirsin. Bulgur ve tarhanayı bakır tencereyle ateşte pişir.',
  person:
    'Yakında biri var: yanına gidince selam verir. Yüzüne bakıp E’ye basarak konuş; yol sorabilir, takas yapabilirsin.',
  ranged:
    'Elinde menzilli silah var: sağ tık nişan alır, sol tık ateş eder, R doldurur. Mermi uzakta düşer: uzak hedefe biraz yukarıdan nişan al. Dürbünde Shift nefesini tutar. Atış sesi hayvanları kaçırır.',
};

/** İpucu kararı için oyundan alınan anlık durum (saf veri). */
export interface HintContext {
  hydration: number;
  satiety: number;
  /** Vücut ısısı (°C). */
  bodyTempC: number;
  /** Gece mi (güneş ufkun altında/yakın)? */
  isNight: boolean;
  /** Bu oyunda bir kamp ateşi kurulmuş mu (yanıyor ya da sönük)? */
  fireBuilt: boolean;
  /** Bu oyunda bir sundurma kurulmuş mu? */
  shelterBuilt: boolean;
  /** Yakında (HINTS.preyRadiusM) yaşayan bir av hayvanı var mı? */
  preyNearby: boolean;
  /** Faz 10: bir il/ilçe/köy yerleşiminin içinde mi? */
  inSettlement?: boolean;
  /** Faz 10: yakında bir kişi var mı? */
  personNearby?: boolean;
  /** Faz 11.5: elde menzilli silah var mı? */
  rangedHeld?: boolean;
}

export interface HintTrackerOptions {
  controlsDelaySeconds?: number;
  gapSeconds?: number;
  /** Başlangıçta görülmüş sayılan ipuçları (`localStorage`'dan). */
  seen?: Iterable<HintId>;
}

/**
 * İpucu izleyicisi (saf mantık). Her gözlemde durumu alır; koşulu sağlayan, daha önce gösterilmemiş en öncelikli
 * ipucunu döner ve onu görüldü sayar. İki ipucu arasında `gapSeconds` beklenir (üst üste binmesin); koşul
 * beklerken bozulursa ipucu verilmez. Yalnızca ipucudur: hiçbir ipucu oyunu engellemez ya da bir adımı zorunlu kılmaz.
 */
export class HintTracker {
  private readonly controlsDelaySeconds: number;
  private readonly gapSeconds: number;
  private readonly seen: Set<HintId>;
  private startedAt: number | null = null;
  private lastShownAt = Number.NEGATIVE_INFINITY;

  constructor(options: HintTrackerOptions = {}) {
    this.controlsDelaySeconds = options.controlsDelaySeconds ?? HINTS.controlsDelaySeconds;
    this.gapSeconds = options.gapSeconds ?? HINTS.gapSeconds;
    this.seen = new Set(options.seen ?? []);
  }

  /** Görülen ipuçları (kalıcılaştırmak için). */
  get seenIds(): readonly HintId[] {
    return HINT_IDS.filter((id) => this.seen.has(id));
  }

  /** Yeni oyun: hiçbir ipucu görülmemiş sayılır ve süre yeniden başlar. */
  reset(): void {
    this.seen.clear();
    this.startedAt = null;
    this.lastShownAt = Number.NEGATIVE_INFINITY;
  }

  /** Yükleme: görülenler korunur, ama başlangıç süresi ve bekleme sıfırlanır. */
  restart(): void {
    this.startedAt = null;
    this.lastShownAt = Number.NEGATIVE_INFINITY;
  }

  /** Bir gözlem (`nowSeconds`: tek yönlü artan süre); gösterilecek bir ipucu varsa kimliğini döner. */
  update(ctx: HintContext, nowSeconds: number): HintId | null {
    this.startedAt ??= nowSeconds;
    if (nowSeconds - this.lastShownAt < this.gapSeconds) return null;

    for (const id of HINT_IDS) {
      if (this.seen.has(id) || !this.applies(id, ctx, nowSeconds)) continue;
      this.seen.add(id);
      this.lastShownAt = nowSeconds;
      return id;
    }
    return null;
  }

  private applies(id: HintId, ctx: HintContext, nowSeconds: number): boolean {
    switch (id) {
      case 'controls':
        return nowSeconds - (this.startedAt ?? nowSeconds) >= this.controlsDelaySeconds;
      case 'water':
        return ctx.hydration < HINTS.waterBelow;
      case 'food':
        return ctx.satiety < HINTS.foodBelow;
      case 'fire':
        return !ctx.fireBuilt && (ctx.isNight || ctx.bodyTempC < HINTS.coldBelowC);
      case 'shelter':
        // Ateş kurulduktan sonra, hâlâ soğuk ya da geceyken barınak önerilir.
        return (
          ctx.fireBuilt && !ctx.shelterBuilt && (ctx.isNight || ctx.bodyTempC < HINTS.coldBelowC)
        );
      case 'hunt':
        return ctx.preyNearby;
      case 'town':
        return ctx.inSettlement === true;
      case 'person':
        return ctx.personNearby === true;
      case 'ranged':
        return ctx.rangedHeld === true;
    }
  }
}

/** `localStorage`'ın kullandığımız yüzeyi (testte sahte verilir). */
export type HintStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Kalıcı "görüldü" listesini okur; bozuk/eksik/depo yoksa boş (ipucu ayarı oyunu asla bozmaz). */
export function readSeenHints(storage: HintStorage | null): HintId[] {
  try {
    const text = storage?.getItem(HINTS.storageKey);
    if (!text) return [];
    const raw: unknown = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    return HINT_IDS.filter((id) => raw.includes(id));
  } catch {
    return [];
  }
}

/** Görülenleri yazar (hata sessizce yutulur: gizli pencere, kota). Boş liste anahtarı siler. */
export function writeSeenHints(storage: HintStorage | null, seen: readonly HintId[]): void {
  try {
    if (seen.length === 0) storage?.removeItem(HINTS.storageKey);
    else storage?.setItem(HINTS.storageKey, JSON.stringify(seen));
  } catch {
    // Kalıcılaştırılamazsa ipucu bu oturumda yine bir kez gösterilmiş sayılır.
  }
}

/** Tarayıcının `localStorage`'ı; erişim hata verirse (bazı gizlilik modları) ya da yoksa null (oturumluk). */
export function browserHintStorage(): HintStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
