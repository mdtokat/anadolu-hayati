import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS } from '../src/config';
import { QUALITY_HINTS, formatSensitivity, formatVolume } from '../src/ui/settingsFormat';

describe('settingsFormat', () => {
  it('fare hassasiyeti Türkçe ondalıkla yazılır', () => {
    expect(formatSensitivity(1)).toBe('1,00×');
    expect(formatSensitivity(1.25)).toBe('1,25×');
    expect(formatSensitivity(0.2)).toBe('0,20×');
  });

  it('ses yüzde olarak yazılır', () => {
    expect(formatVolume(0)).toBe('%0');
    expect(formatVolume(0.7)).toBe('%70');
    expect(formatVolume(1)).toBe('%100');
  });

  it('her kalite düzeyi için açıklama var', () => {
    for (const level of Object.keys(QUALITY_PRESETS)) {
      expect(QUALITY_HINTS[level as keyof typeof QUALITY_HINTS]?.length).toBeGreaterThan(10);
    }
  });
});
