import { ADAPTIVE_RESOLUTION } from '../config';

/**
 * Uyarlanır çözünürlük denetleyicisi (saf mantık): kare süresi hedefi sürekli aşarsa çizim ölçeğini bir kademe
 * düşürür, uzun süre rahatsa bir kademe yükseltmeyi dener. Kare süresi pencere **medyanıyla** değerlendirilir: tekil
 * takılmalar (yükleme, çöp toplama) çözünürlüğü düşürmez; sürekli GPU darboğazı düşürür.
 *
 * Dikey eşitlemede (vsync) kare süresi ekran yenilemesine kilitlidir; "boş pay" ölçülemez. Bu yüzden yükseltme bir
 * denemedir: denenen kademe hemen yavaşlarsa geri düşülür ve o kademe için bekleme süresi katlanır (titreme olmasın).
 */
export class ResolutionGovernor {
  private level = 0;
  private readonly samples: number[] = [];
  private windowMs = 0;
  /** Hedefin altında (rahat) geçen kesintisiz süre (ms). */
  private calmMs = 0;
  /** Düşürmeden sonra kalan bekleme (ms): yeni kademe oturmadan tekrar karar verilmez. */
  private cooldownMs = 0;
  /** Kademe başına yükseltme denemesi beklemesi (ms); başarısız denemede katlanır. */
  private readonly upDelay: number[];
  /** Son yükseltme denemesinin kademesi ve üzerinden geçen süre (deneme başarısız mı?). */
  private probe: { level: number; elapsedMs: number } | null = null;

  constructor(private readonly config = ADAPTIVE_RESOLUTION) {
    this.upDelay = config.scales.map(() => config.upHoldSeconds * 1000);
  }

  /** Geçerli çizim ölçeği (1 = ayarın piksel oranı). */
  get scale(): number {
    return this.config.scales[this.level] as number;
  }

  /** Geçerli kademe (0 = tam çözünürlük). */
  get currentLevel(): number {
    return this.level;
  }

  /** Tam çözünürlüğe döner ve ölçümleri sıfırlar (ayar kapatılınca/değişince). */
  reset(): void {
    this.level = 0;
    this.clearWindow();
    this.calmMs = 0;
    this.cooldownMs = 0;
    this.probe = null;
    this.upDelay.fill(this.config.upHoldSeconds * 1000);
  }

  /**
   * Bir çizim karesinin süresini (ms) işler; ölçek değiştiyse true döner. Çok uzun kareler (sekme arka planda,
   * duraklama sonrası) `maxSampleMs`'e kırpılır.
   */
  sample(frameMs: number): boolean {
    if (!(frameMs > 0)) return false;
    const ms = Math.min(frameMs, this.config.maxSampleMs);
    this.samples.push(ms);
    this.windowMs += ms;
    if (this.cooldownMs > 0) this.cooldownMs -= ms;
    if (this.probe) this.probe.elapsedMs += ms;
    if (this.windowMs < this.config.windowSeconds * 1000) return false;

    const median = medianOf(this.samples);
    const windowMs = this.windowMs;
    this.clearWindow();
    const target = 1000 / this.config.targetFps;
    if (median > target * this.config.downRatio) {
      this.calmMs = 0;
      if (this.cooldownMs > 0 || this.level >= this.config.scales.length - 1) return false;
      // Yükseltme denemesi kısa sürede yavaşladıysa o kademeye dönüş beklemesi katlanır.
      if (this.probe && this.probe.level === this.level) {
        if (this.probe.elapsedMs <= this.config.probeSeconds * 1000) {
          this.upDelay[this.level] = Math.min(
            (this.upDelay[this.level] as number) * 2,
            this.config.maxUpHoldSeconds * 1000,
          );
        }
      }
      this.probe = null;
      this.level++;
      this.cooldownMs = this.config.cooldownSeconds * 1000;
      return true;
    }
    if (median <= target * this.config.upRatio) {
      this.calmMs += windowMs;
      if (this.level > 0 && this.calmMs >= (this.upDelay[this.level - 1] as number)) {
        this.level--;
        this.calmMs = 0;
        this.cooldownMs = this.config.cooldownSeconds * 1000;
        this.probe = { level: this.level, elapsedMs: 0 };
        return true;
      }
    } else {
      this.calmMs = 0;
    }
    return false;
  }

  private clearWindow(): void {
    this.samples.length = 0;
    this.windowMs = 0;
  }
}

function medianOf(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Uygulanacak piksel oranı: cihaz oranı ve ayar üst sınırının küçüğü × ölçek, `minPixelRatio`'nun altına inmez. */
export function pixelRatioFor(
  devicePixelRatio: number,
  presetMax: number,
  scale: number,
  minPixelRatio: number = ADAPTIVE_RESOLUTION.minPixelRatio,
): number {
  const base = Math.min(devicePixelRatio, presetMax);
  return Math.max(Math.min(base, minPixelRatio), base * scale);
}
