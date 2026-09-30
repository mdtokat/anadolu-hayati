import { describe, expect, it } from 'vitest';
import { SURVIVAL, SURVIVAL_HUD } from '../src/config';
import { initialVitals } from '../src/survival/vitals';
import {
  bodyTempLabel,
  bodyTempLevel,
  deathCauseText,
  formatDay,
  formatSurvivedTime,
  formatTemperature,
  gaugeFraction,
  gaugeLevel,
  warnings,
} from '../src/ui/survivalFormat';

describe('gaugeLevel', () => {
  it('eşiklerde doğru düzey', () => {
    expect(gaugeLevel(100)).toBe('ok');
    expect(gaugeLevel(SURVIVAL_HUD.lowBelow)).toBe('ok');
    expect(gaugeLevel(SURVIVAL_HUD.lowBelow - 0.01)).toBe('low');
    expect(gaugeLevel(SURVIVAL_HUD.criticalBelow)).toBe('low');
    expect(gaugeLevel(SURVIVAL_HUD.criticalBelow - 0.01)).toBe('critical');
    expect(gaugeLevel(0)).toBe('critical');
  });
});

describe('gaugeFraction', () => {
  it('0–1 aralığına sıkıştırır', () => {
    expect(gaugeFraction(50)).toBe(0.5);
    expect(gaugeFraction(-5)).toBe(0);
    expect(gaugeFraction(140)).toBe(1);
  });
});

describe('bodyTempLevel / bodyTempLabel', () => {
  it('normal ısı sorunsuz, boş etiket', () => {
    expect(bodyTempLevel(SURVIVAL.bodyTempNormalC)).toBe('ok');
    expect(bodyTempLabel(SURVIVAL.bodyTempNormalC)).toBe('');
  });

  it('hafif soğuk/sıcak, ölümcül eşik ötesi kritik', () => {
    expect(bodyTempLevel(SURVIVAL_HUD.coldBelowC - 0.1)).toBe('cold');
    expect(bodyTempLevel(SURVIVAL_HUD.hotAboveC + 0.1)).toBe('hot');
    expect(bodyTempLevel(SURVIVAL.hypothermiaBelowC - 0.1)).toBe('critical');
    expect(bodyTempLevel(SURVIVAL.hyperthermiaAboveC + 0.1)).toBe('critical');
    expect(bodyTempLabel(SURVIVAL.hypothermiaBelowC - 0.1)).toBe('Donuyorsun!');
    expect(bodyTempLabel(SURVIVAL.hyperthermiaAboveC + 0.1)).toBe('Aşırı ısındın!');
  });

  it('uyarı eşikleri ölümcül eşiklerin içinde kalır (önce uyarı, sonra hasar)', () => {
    expect(SURVIVAL_HUD.coldBelowC).toBeGreaterThan(SURVIVAL.hypothermiaBelowC);
    expect(SURVIVAL_HUD.hotAboveC).toBeLessThan(SURVIVAL.hyperthermiaAboveC);
  });
});

describe('formatTemperature', () => {
  it('Türkçe ondalık ayracı ve tek basamak', () => {
    expect(formatTemperature(36.84)).toBe('36,8 °C');
    expect(formatTemperature(-3)).toBe('-3,0 °C');
  });

  it('-0 yazılmaz', () => {
    expect(formatTemperature(-0.01)).toBe('0,0 °C');
  });
});

describe('warnings', () => {
  it('tam sağlıklı durumda uyarı yok', () => {
    expect(warnings(initialVitals())).toEqual([]);
  });

  it('düşük ve kritik susuzluk/açlık, ısı ve bitkinlik uyarıları', () => {
    const state = {
      ...initialVitals(),
      hydration: 10,
      satiety: 20,
      bodyTemp: 34,
      exhausted: true,
    };
    expect(warnings(state)).toEqual([
      'Susuzluktan ölüyorsun!',
      'Acıktın',
      'Donuyorsun!',
      'Bitkinsin: koşamaz ve zıplayamazsın',
    ]);
  });
});

describe('ölüm ekranı yazıları', () => {
  it('her neden için metin var', () => {
    expect(deathCauseText('dehydration')).toBe('Susuzluktan öldün.');
    expect(deathCauseText('starvation')).toBe('Açlıktan öldün.');
    expect(deathCauseText('hypothermia')).toBe('Donarak öldün.');
    expect(deathCauseText('hyperthermia')).toBe('Sıcak çarpmasından öldün.');
  });

  it('hayatta kalma süresi', () => {
    expect(formatSurvivedTime(45.9)).toBe('45 sn');
    expect(formatSurvivedTime(125)).toBe('2 dk 05 sn');
    expect(formatSurvivedTime(-1)).toBe('0 sn');
  });

  it('gün numarası 1’den gösterilir', () => {
    expect(formatDay(0)).toBe('1. gün');
    expect(formatDay(3)).toBe('4. gün');
  });
});
