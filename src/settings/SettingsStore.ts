import { SETTINGS } from '../config';
import {
  applyPatch,
  defaultSettings,
  parseSettings,
  settingsEqual,
  type Settings,
  type SettingsPatch,
} from './settings';

/** `localStorage`'ın kullandığımız yüzeyi (testte sahte verilir). */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type SettingsListener = (settings: Readonly<Settings>) => void;

/**
 * Kullanıcı ayarlarının tek sahibi: yükler, değişikliği doğrular/kırpar, kalıcılaştırır ve dinleyicilere
 * bildirir. Depolama yoksa ya da hata verirse (gizli pencere, kota) ayarlar yalnızca bu oturumda geçerlidir;
 * hata oyunu etkilemez.
 */
export class SettingsStore {
  private settings: Settings;
  private readonly listeners = new Set<SettingsListener>();

  constructor(private readonly storage: SettingsStorage | null = null) {
    this.settings = this.read();
  }

  get current(): Readonly<Settings> {
    return this.settings;
  }

  /** Değişikliği uygular. Gerçekten bir şey değiştiyse kaydeder ve dinleyicilere bildirir. */
  update(patch: SettingsPatch): void {
    this.set(applyPatch(this.settings, patch));
  }

  /** Tüm ayarları varsayılana döndürür. */
  reset(): void {
    this.set(defaultSettings());
  }

  /** Değişimleri dinler; dönen işlev aboneliği kaldırır. Dinleyici hemen çağrılmaz. */
  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(next: Settings): void {
    if (settingsEqual(this.settings, next)) return;
    this.settings = next;
    this.write();
    for (const listener of [...this.listeners]) listener(next);
  }

  private read(): Settings {
    try {
      const text = this.storage?.getItem(SETTINGS.storageKey);
      if (text) return parseSettings(JSON.parse(text));
    } catch {
      // Bozuk JSON ya da erişilemeyen depolama: varsayılanlarla devam.
    }
    return defaultSettings();
  }

  private write(): void {
    try {
      this.storage?.setItem(SETTINGS.storageKey, JSON.stringify(this.settings));
    } catch {
      // Kota dolu ya da depolama kapalı: ayar bu oturumda geçerli kalır.
    }
  }
}

/** Tarayıcının `localStorage`'ıyla bir depo kurar; erişim hata verirse (bazı gizlilik modları) bellekte çalışır. */
export function createSettingsStore(): SettingsStore {
  try {
    return new SettingsStore(typeof localStorage === 'undefined' ? null : localStorage);
  } catch {
    return new SettingsStore(null);
  }
}
