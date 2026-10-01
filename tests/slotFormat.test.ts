import { describe, expect, it } from 'vitest';
import { summarizeSave } from '../src/save/saveGame';
import type { SlotState } from '../src/save/SaveStore';
import { formatSavedAt, formatSlotInfo, formatSummary } from '../src/ui/slotFormat';
import { sampleSave } from './helpers/sampleSave';

describe('slotFormat', () => {
  it('kayıt zamanını Türkçe ve 24 saatle yazar', () => {
    expect(formatSavedAt('2026-10-01T09:30:00.000Z', 'UTC')).toMatch(/^1 Eki 2026\s+09:30$/);
    expect(formatSavedAt('2026-12-25T23:05:00.000Z', 'UTC')).toMatch(/^25 Ara 2026\s+23:05$/);
  });

  it('geçersiz tarihte çökmez', () => {
    expect(formatSavedAt('dün')).toBe('—');
  });

  it("özet gün (1'den), saat ve canı gösterir", () => {
    expect(formatSummary(summarizeSave(sampleSave()))).toBe('Gün 4 · 14:15 · Can %80');
  });

  it('yuva durumlarını açıklar', () => {
    const ok: SlotState = { slot: 'slot-1', status: 'ok', summary: summarizeSave(sampleSave()) };
    expect(formatSlotInfo({ slot: 'slot-2', status: 'empty' })).toBe('Boş');
    expect(formatSlotInfo(ok, 'UTC')).toMatch(/^Gün 4 · 14:15 · Can %80 · 1 Eki 2026\s+09:30$/);
    expect(
      formatSlotInfo({
        slot: 'slot-3',
        status: 'corrupt',
        code: 'invalid',
        message: 'Kayıt bozuk.',
      }),
    ).toBe('Okunamıyor: Kayıt bozuk.');
  });
});
