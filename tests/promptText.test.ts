import { describe, expect, it } from 'vitest';
import type { GatherOffer } from '../src/interaction/gather';
import { collectedToast, gatherPrompt } from '../src/interaction/promptText';

const offer = (status: GatherOffer['status'], label = 'Dal topla'): GatherOffer => ({
  status,
  action: 'hand',
  label,
  seconds: 1,
});

describe('gatherPrompt', () => {
  it('hazır: tuş ipucu; balta gerekir: etiket; dolu: uyarı', () => {
    expect(gatherPrompt(offer('ready'))).toBe('E (basılı tut): Dal topla');
    expect(gatherPrompt(offer('needAxe', 'Kesmek için taş balta gerekir'))).toBe(
      'Kesmek için taş balta gerekir',
    );
    expect(gatherPrompt(offer('full'))).toBe('Envanter dolu');
  });
});

describe('collectedToast', () => {
  it('"+adet Ad" biçimi', () => {
    expect(collectedToast('hazelnut', 4)).toBe('+4 Fındık');
    expect(collectedToast('stone_axe', 1)).toBe('+1 Taş Balta');
  });
});
