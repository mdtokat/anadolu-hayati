import { describe, expect, it, vi } from 'vitest';
import { SETTINGS } from '../src/config';
import { SettingsStore, type SettingsStorage } from '../src/settings/SettingsStore';
import { defaultSettings } from '../src/settings/settings';

class FakeStorage implements SettingsStorage {
  readonly data = new Map<string, string>();
  writes = 0;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes += 1;
    this.data.set(key, value);
  }
}

describe('SettingsStore', () => {
  it('depo yoksa varsayılanlarla çalışır ve değişiklikleri bellekte tutar', () => {
    const store = new SettingsStore(null);
    expect(store.current).toEqual(defaultSettings());
    store.update({ quality: 'low' });
    expect(store.current.quality).toBe('low');
  });

  it('değişikliği kaydeder; yeni örnek (sayfa yenileme) aynı ayarı okur', () => {
    const storage = new FakeStorage();
    new SettingsStore(storage).update({ quality: 'medium', mouseSensitivity: 1.75, volume: 0.3 });
    const reloaded = new SettingsStore(storage);
    expect(reloaded.current).toEqual({
      ...defaultSettings(),
      quality: 'medium',
      mouseSensitivity: 1.75,
      volume: 0.3,
    });
  });

  it('bozuk JSON, bozuk alan ve erişilemeyen depo oyunu bozmaz', () => {
    const bad = new FakeStorage();
    bad.data.set(SETTINGS.storageKey, '{bozuk');
    expect(new SettingsStore(bad).current).toEqual(defaultSettings());

    const partial = new FakeStorage();
    partial.data.set(SETTINGS.storageKey, JSON.stringify({ quality: 'low', volume: 'çok' }));
    expect(new SettingsStore(partial).current).toEqual({ ...defaultSettings(), quality: 'low' });

    const throwing: SettingsStorage = {
      getItem: () => {
        throw new Error('erişim yok');
      },
      setItem: () => {
        throw new Error('kota dolu');
      },
    };
    const store = new SettingsStore(throwing);
    expect(store.current).toEqual(defaultSettings());
    expect(() => store.update({ quality: 'low' })).not.toThrow();
    expect(store.current.quality).toBe('low'); // oturumda geçerli
  });

  it('değerleri kırpar', () => {
    const store = new SettingsStore(null);
    store.update({ mouseSensitivity: 99, volume: -1 });
    expect(store.current.mouseSensitivity).toBe(SETTINGS.mouseSensitivity.max);
    expect(store.current.volume).toBe(0);
  });

  it('abone yalnızca gerçek değişimde bildirilir; aynı değer yazmaz da', () => {
    const storage = new FakeStorage();
    const store = new SettingsStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.update({ quality: 'high' }); // zaten yüksek
    store.update({});
    expect(listener).not.toHaveBeenCalled();
    expect(storage.writes).toBe(0);

    store.update({ quality: 'low' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ quality: 'low' }));
    expect(storage.writes).toBe(1);
  });

  it('abonelik iptal edilebilir', () => {
    const store = new SettingsStore(null);
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.update({ volume: 0.1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('reset varsayılana döner, kaydeder ve bildirir', () => {
    const storage = new FakeStorage();
    const store = new SettingsStore(storage);
    store.update({ quality: 'low', volume: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.reset();
    expect(store.current).toEqual(defaultSettings());
    expect(listener).toHaveBeenCalledTimes(1);
    expect(new SettingsStore(storage).current).toEqual(defaultSettings());
    store.reset(); // zaten varsayılan: bildirim yok
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
