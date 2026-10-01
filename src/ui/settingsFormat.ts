import type { QualityLevel } from '../config';

/** Fare hassasiyeti çarpanı: "1,25×". */
export function formatSensitivity(value: number): string {
  return `${value.toFixed(2).replace('.', ',')}×`;
}

/** Ses seviyesi: "%70". */
export function formatVolume(value: number): string {
  return `%${Math.round(value * 100)}`;
}

/** Kalite seçeneklerinin ne değiştirdiğini anlatan kısa açıklamalar. */
export const QUALITY_HINTS: Readonly<Record<QualityLevel, string>> = {
  low: 'Daha kaba arazi, yakındaki nesneler ve düşük çözünürlük; zayıf ekran kartları için.',
  medium: 'Dengeli: orta nesne uzaklığı ve çözünürlük.',
  high: 'En uzak nesneler ve en keskin görüntü; güçlü ekran kartları için.',
};
