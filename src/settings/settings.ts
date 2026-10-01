import { QUALITY_PRESETS, SETTINGS, type QualityLevel } from '../config';

/** Ayar formatı sürümü (`localStorage`'daki JSON'un). Şema değişirse artır ve `parseSettings`'e göç ekle. */
export const SETTINGS_VERSION = 1;

export interface Settings {
  version: typeof SETTINGS_VERSION;
  quality: QualityLevel;
  /** Fare hassasiyeti çarpanı (`SETTINGS.mouseSensitivity` aralığında). */
  mouseSensitivity: number;
  /** Ana ses seviyesi 0–1. */
  volume: number;
  /** İlk dakikalar için ipuçları (Faz 8.5) açık mı? */
  hints: boolean;
}

/** Kullanıcının değiştirebildiği alanlar. */
export type SettingsPatch = Partial<Omit<Settings, 'version'>>;

export const QUALITY_LEVELS = Object.keys(QUALITY_PRESETS) as QualityLevel[];

export function isQualityLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as string[]).includes(value);
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    quality: SETTINGS.defaultQuality,
    mouseSensitivity: SETTINGS.mouseSensitivity.default,
    volume: SETTINGS.volume.default,
    hints: SETTINGS.defaultHints,
  };
}

/** `value`'yu `[min, max]`'a kırpar ve `step` adımına yuvarlar (kayan nokta kalıntısı kalmasın). */
export function snapToRange(
  value: number,
  range: { readonly min: number; readonly max: number; readonly step: number },
): number {
  const clamped = Math.min(Math.max(value, range.min), range.max);
  const snapped = range.min + Math.round((clamped - range.min) / range.step) * range.step;
  return Number(Math.min(snapped, range.max).toFixed(6));
}

/**
 * Ham veriyi (`localStorage`'dan okunan, güvenilmez) ayara çevirir. Kayıttan farklı olarak ayarlar
 * hoşgörülüdür: bozuk ya da eksik her alan varsayılana düşer, aralık dışı sayılar kırpılır; ayar hiçbir
 * zaman oyunu açılmaz hale getirmemeli. Yeni sürümden gelen veride bilinen alanlar yine okunur.
 */
export function parseSettings(raw: unknown): Settings {
  const out = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return out;
  const o = raw as Record<string, unknown>;
  if (isQualityLevel(o.quality)) out.quality = o.quality;
  if (typeof o.mouseSensitivity === 'number' && Number.isFinite(o.mouseSensitivity)) {
    out.mouseSensitivity = snapToRange(o.mouseSensitivity, SETTINGS.mouseSensitivity);
  }
  if (typeof o.volume === 'number' && Number.isFinite(o.volume)) {
    out.volume = snapToRange(o.volume, SETTINGS.volume);
  }
  if (typeof o.hints === 'boolean') out.hints = o.hints;
  return out;
}

/** Kısmi değişikliği mevcut ayara uygular (geçersiz değerler yok sayılır, sayılar kırpılır). */
export function applyPatch(current: Readonly<Settings>, patch: SettingsPatch): Settings {
  return parseSettings({ ...current, ...patch });
}

export function settingsEqual(a: Readonly<Settings>, b: Readonly<Settings>): boolean {
  return (
    a.quality === b.quality &&
    a.mouseSensitivity === b.mouseSensitivity &&
    a.volume === b.volume &&
    a.hints === b.hints
  );
}
