import { HUD_STYLE } from '../config';

/** HUD görünüm yardımcıları (saf, testli): pusula, ipucu parçaları, uyarı düzeyi. */

/** Pusulada her 45°'de yazılan yön kısaltmaları (K = kuzey, D = doğu, G = güney, B = batı). */
const DIRECTIONS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'] as const;

/**
 * Kamera yaw'ından (radyan) pusula açısı (derece, 0 = kuzey, saat yönünde; [0, 360)). Yaw = 0 kuzeye (−Z) bakar,
 * fareyi sağa çekmek yaw'ı azaltıp doğuya döndürür; bu yüzden açı yaw'ın eksisidir.
 */
export function compassBearing(yaw: number): number {
  const deg = (-yaw * 180) / Math.PI;
  const wrapped = ((deg % 360) + 360) % 360;
  // 359,99… yuvarlanınca 360 görünmesin.
  return wrapped >= 359.95 ? 0 : wrapped;
}

/** Açıya en yakın yön kısaltması ("K", "KD", …). */
export function compassLabel(bearing: number): string {
  const index = Math.round((((bearing % 360) + 360) % 360) / 45) % DIRECTIONS.length;
  return DIRECTIONS[index] ?? 'K';
}

/** Pusula şeridinin tik listesi: [-180, 540) aralığında her `tickStepDeg`'de bir tik (kenarda kesinti olmasın). */
export interface CompassTick {
  /** Şeritteki açı (derece; −180…540). */
  deg: number;
  /** Ana yönlerde/ara yönlerde yazı; diğer tiklerde "". */
  label: string;
  /** Ana yön (K, D, G, B) mi? */
  major: boolean;
}

export function compassTicks(stepDeg: number = HUD_STYLE.compassTickStepDeg): CompassTick[] {
  const ticks: CompassTick[] = [];
  for (let deg = -180; deg < 540; deg += stepDeg) {
    const norm = ((deg % 360) + 360) % 360;
    const onDirection = norm % 45 === 0;
    ticks.push({
      deg,
      label: onDirection ? compassLabel(norm) : '',
      major: norm % 90 === 0,
    });
  }
  return ticks;
}

/**
 * Pusula şeridinin kayma miktarı (px): şeritte `bearing` açısı pencerenin ortasına gelir. Şerit −180°'den başlar,
 * `pxPerDeg` ölçeğiyle çizilir.
 */
export function compassOffset(
  bearing: number,
  windowWidthPx: number,
  pxPerDeg: number = HUD_STYLE.compassPxPerDeg,
): number {
  return windowWidthPx / 2 - (bearing + 180) * pxPerDeg;
}

/** Ekrandaki etkileşim ipucunun bir parçası: tuş (ör. "E", "Sol tık") ve eylem metni. */
export interface PromptPart {
  /** Tuş etiketi; tuşsuz parça (ör. engel nedeni) için null. */
  key: string | null;
  /** "(basılı tut)" eki vardı. */
  hold: boolean;
  text: string;
}

/** Ipucunda tuş sayılan önekler: tek harf/rakam (≤ 3 büyük harf) ya da adlandırılmış tuşlar. */
const PROMPT_KEY =
  /^(Sol tık|Sağ tık|Tab|Shift|Boşluk|Esc|[A-ZÇĞİÖŞÜ0-9[\]]{1,3})( \(basılı tut\))?: (.+)$/u;

/**
 * "E (basılı tut): Topla · X (basılı tut): sök" → tuş + eylem parçaları. Ayraç " · "; tuş tanınmayan parça
 * (ör. "Sökülüyor: Sandık", "Zemin çok dik") tuşsuz kalır.
 */
export function promptParts(text: string): PromptPart[] {
  return text
    .split(' · ')
    .filter((part) => part !== '')
    .map((part) => {
      const match = PROMPT_KEY.exec(part);
      if (!match) return { key: null, hold: false, text: part };
      return { key: match[1] ?? null, hold: match[2] !== undefined, text: match[3] ?? '' };
    });
}

/** Uyarı satırının düzeyi: ünlemle biten (ölümcül) uyarılar kritiktir. */
export function warningLevel(text: string): 'critical' | 'warn' {
  return text.endsWith('!') ? 'critical' : 'warn';
}

/** Ağırlık doluluk oranı (0–1) ve düzeyi: sınıra yaklaşınca sarı, dolunca kırmızı. */
export function loadLevel(
  usedG: number,
  maxG: number,
): { fraction: number; level: 'ok' | 'high' | 'full' } {
  const fraction = maxG > 0 ? Math.min(Math.max(usedG / maxG, 0), 1) : 1;
  const level = fraction >= 1 ? 'full' : fraction >= HUD_STYLE.loadHighFraction ? 'high' : 'ok';
  return { fraction, level };
}

/** Kısa bildirimin türü (renk/simge): kazanç ("+3 Fındık"), tehlike ("Tehlike: Kurt") ya da bilgi. */
export function toastKind(text: string): 'gain' | 'danger' | 'info' {
  if (/^(Tehlike|Otomatik kayıt başarısız)/u.test(text)) return 'danger';
  if (/^(\+|Söküldü|Pişti|Yedin|Su kabı doldu|.* kuruldu$)/u.test(text)) return 'gain';
  return 'info';
}
