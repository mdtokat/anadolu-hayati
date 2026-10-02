import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS, SETTINGS, TEST_MODE } from '../src/config';
import {
  QUALITY_LEVELS,
  SETTINGS_VERSION,
  applyPatch,
  defaultSettings,
  isQualityLevel,
  parseSettings,
  settingsEqual,
  snapToRange,
} from '../src/settings/settings';

describe('varsayılan ayarlar', () => {
  it('config değerlerinden gelir ve geçerlidir', () => {
    const d = defaultSettings();
    expect(d).toEqual({
      version: SETTINGS_VERSION,
      quality: SETTINGS.defaultQuality,
      mouseSensitivity: 1,
      volume: SETTINGS.volume.default,
      hints: SETTINGS.defaultHints,
      testMode: TEST_MODE.defaultEnabled,
      bandits: SETTINGS.defaultBandits,
    });
    expect(parseSettings(d)).toEqual(d);
  });

  it('her kalite düzeyinin ön ayarı var ve değerler sırayla artar', () => {
    expect(QUALITY_LEVELS).toEqual(['low', 'medium', 'high']);
    const [low, medium, high] = QUALITY_LEVELS.map((l) => QUALITY_PRESETS[l]);
    expect(low!.propDrawRadius).toBeLessThan(medium!.propDrawRadius);
    expect(medium!.propDrawRadius).toBeLessThan(high!.propDrawRadius);
    expect(low!.lodScale).toBeLessThan(medium!.lodScale);
    expect(medium!.lodScale).toBeLessThan(high!.lodScale);
    expect(low!.maxPixelRatio).toBeLessThanOrEqual(medium!.maxPixelRatio);
    expect(medium!.maxPixelRatio).toBeLessThanOrEqual(high!.maxPixelRatio);
  });

  it('"yüksek" Faz 5 davranışını korur (varsayılan kalite)', () => {
    expect(SETTINGS.defaultQuality).toBe('high');
    expect(QUALITY_PRESETS.high.lodScale).toBe(1);
  });
});

describe('snapToRange', () => {
  const r = SETTINGS.mouseSensitivity;
  it('aralığa kırpar', () => {
    expect(snapToRange(-5, r)).toBe(r.min);
    expect(snapToRange(99, r)).toBe(r.max);
  });
  it('adıma yuvarlar ve kayan nokta kalıntısı bırakmaz', () => {
    expect(snapToRange(1.234, r)).toBe(1.25);
    expect(snapToRange(0.2 + 0.05 * 3, r)).toBe(0.35);
    expect(String(snapToRange(0.7, SETTINGS.volume))).toBe('0.7');
  });
});

describe('parseSettings: hoşgörülü okuma', () => {
  it.each([null, undefined, 5, 'x', [1]])('nesne olmayan (%j) varsayılana düşer', (raw) => {
    expect(parseSettings(raw)).toEqual(defaultSettings());
  });

  it('geçerli alanları okur', () => {
    expect(parseSettings({ quality: 'low', mouseSensitivity: 1.5, volume: 0.25 })).toEqual({
      version: SETTINGS_VERSION,
      quality: 'low',
      mouseSensitivity: 1.5,
      volume: 0.25,
      hints: SETTINGS.defaultHints,
      testMode: TEST_MODE.defaultEnabled,
      bandits: SETTINGS.defaultBandits,
    });
  });

  it('ipuçları: yalnızca mantıksal değer okunur, bozuk değer varsayılana düşer', () => {
    expect(parseSettings({ hints: false }).hints).toBe(false);
    expect(parseSettings({ hints: true }).hints).toBe(true);
    expect(parseSettings({ hints: 'hayır' }).hints).toBe(SETTINGS.defaultHints);
    expect(parseSettings({}).hints).toBe(true); // eski kayıtlı ayarlarda alan yoktur: varsayılan açık
  });

  it('test modu: varsayılan kapalı; yalnızca mantıksal değer okunur', () => {
    expect(parseSettings({}).testMode).toBe(false);
    expect(parseSettings({ testMode: true }).testMode).toBe(true);
    expect(parseSettings({ testMode: 'evet' }).testMode).toBe(TEST_MODE.defaultEnabled);
  });

  it('eşkıyalar (Faz 11): varsayılan açık; eski ayarda alan yok; yalnızca mantıksal değer okunur', () => {
    expect(parseSettings({}).bandits).toBe(true);
    expect(parseSettings({ bandits: false }).bandits).toBe(false);
    expect(parseSettings({ bandits: 'hayır' }).bandits).toBe(SETTINGS.defaultBandits);
  });

  it('bozuk alanları tek tek varsayılana düşürür, diğerlerini korur', () => {
    const s = parseSettings({ quality: 'ultra', mouseSensitivity: 'hızlı', volume: 0.5 });
    expect(s.quality).toBe(defaultSettings().quality);
    expect(s.mouseSensitivity).toBe(1);
    expect(s.volume).toBe(0.5);
  });

  it('NaN/Infinity ve aralık dışı sayıları güvenli hale getirir', () => {
    expect(parseSettings({ mouseSensitivity: Number.NaN }).mouseSensitivity).toBe(1);
    expect(parseSettings({ mouseSensitivity: Infinity }).mouseSensitivity).toBe(1);
    expect(parseSettings({ mouseSensitivity: 100 }).mouseSensitivity).toBe(
      SETTINGS.mouseSensitivity.max,
    );
    expect(parseSettings({ volume: -3 }).volume).toBe(0);
    expect(parseSettings({ volume: 7 }).volume).toBe(1);
  });

  it('bilinmeyen ve daha yeni sürümlü alanları atar, bilinenleri okur', () => {
    const s = parseSettings({ version: 99, quality: 'medium', extra: true });
    expect(s).toEqual({ ...defaultSettings(), quality: 'medium' });
  });

  it('isQualityLevel yalnızca tanımlı düzeyleri kabul eder', () => {
    expect(isQualityLevel('low')).toBe(true);
    expect(isQualityLevel('ultra')).toBe(false);
    expect(isQualityLevel(1)).toBe(false);
  });
});

describe('applyPatch / settingsEqual', () => {
  it('yalnızca verilen alanı değiştirir ve doğrular', () => {
    const base = defaultSettings();
    const next = applyPatch(base, { volume: 0.1 });
    expect(next).toEqual({ ...base, volume: 0.1 });
    expect(base.volume).toBe(SETTINGS.volume.default); // girdi değişmez
    expect(applyPatch(base, { mouseSensitivity: 50 }).mouseSensitivity).toBe(
      SETTINGS.mouseSensitivity.max,
    );
  });

  it('settingsEqual değerleri karşılaştırır', () => {
    expect(settingsEqual(defaultSettings(), defaultSettings())).toBe(true);
    expect(
      settingsEqual(defaultSettings(), applyPatch(defaultSettings(), { quality: 'low' })),
    ).toBe(false);
  });
});
