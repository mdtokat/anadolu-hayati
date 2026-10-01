import { describe, expect, it } from 'vitest';
import { HUD_STYLE } from '../src/config';
import { ITEM_IDS } from '../src/items/itemDefs';
import { ITEM_ICONS, UI_ICONS } from '../src/ui/icons';
import {
  compassBearing,
  compassLabel,
  compassOffset,
  compassTicks,
  loadLevel,
  promptParts,
  toastKind,
  warningLevel,
} from '../src/ui/hudView';
import { aimPrompt } from '../src/placement/promptText';

describe('pusula', () => {
  it('yaw 0 kuzey, sağa dönmek (yaw azalır) doğu', () => {
    expect(compassBearing(0)).toBe(0);
    expect(compassBearing(-Math.PI / 2)).toBeCloseTo(90);
    expect(compassBearing(Math.PI)).toBeCloseTo(180);
    expect(compassBearing(Math.PI / 2)).toBeCloseTo(270); // PILOT.start.yawDeg = 90 → batı
    expect(compassBearing(-1e-6)).toBeCloseTo(0, 3); // 359,99… → 0
    expect(compassBearing(4 * Math.PI + 0.1)).toBeGreaterThanOrEqual(0);
    expect(compassBearing(4 * Math.PI + 0.1)).toBeLessThan(360);
  });

  it('yön kısaltmaları en yakın 45°e yuvarlanır', () => {
    expect(compassLabel(0)).toBe('K');
    expect(compassLabel(44)).toBe('KD');
    expect(compassLabel(90)).toBe('D');
    expect(compassLabel(200)).toBe('G');
    expect(compassLabel(270)).toBe('B');
    expect(compassLabel(338)).toBe('K');
    expect(compassLabel(-90)).toBe('B');
  });

  it('tikler iki tur boyunca kesintisiz; ana yönler işaretli', () => {
    const ticks = compassTicks(15);
    expect(ticks[0]?.deg).toBe(-180);
    expect(ticks.at(-1)?.deg).toBe(525);
    const labelled = ticks.filter((t) => t.label !== '');
    expect(labelled.every((t) => ((t.deg % 45) + 45) % 45 === 0)).toBe(true);
    expect(ticks.find((t) => t.deg === 0)).toEqual({ deg: 0, label: 'K', major: true });
    expect(ticks.find((t) => t.deg === 45)).toEqual({ deg: 45, label: 'KD', major: false });
    expect(ticks.find((t) => t.deg === 30)).toEqual({ deg: 30, label: '', major: false });
  });

  it('kayma: bakılan açı pencerenin ortasına gelir ve görünür aralık şeridin içinde kalır', () => {
    const width = HUD_STYLE.compassWidthPx;
    const px = HUD_STYLE.compassPxPerDeg;
    for (const bearing of [0, 90, 180, 359.9]) {
      const offset = compassOffset(bearing, width, px);
      // Şeritteki `bearing` noktası (−180'den itibaren) + kayma = pencere ortası.
      expect((bearing + 180) * px + offset).toBeCloseTo(width / 2);
      // Pencerenin iki kenarı da şeridin (−180…540) içinde.
      const leftDeg = -offset / px - 180;
      const rightDeg = (width - offset) / px - 180;
      expect(leftDeg).toBeGreaterThanOrEqual(-180);
      expect(rightDeg).toBeLessThan(540);
    }
  });
});

describe('promptParts', () => {
  it('tuşları ve "basılı tut" ekini ayırır', () => {
    expect(promptParts('E (basılı tut): Topla Fındık')).toEqual([
      { key: 'E', hold: true, text: 'Topla Fındık' },
    ]);
    expect(promptParts('E: aç · X (basılı tut): sök')).toEqual([
      { key: 'E', hold: false, text: 'aç' },
      { key: 'X', hold: true, text: 'sök' },
    ]);
  });

  it('"Sol tık" tuş sayılır; tuşsuz parçalar düz kalır', () => {
    expect(promptParts('Sol tık: Saldır · Kurt')).toEqual([
      { key: 'Sol tık', hold: false, text: 'Saldır' },
      { key: null, hold: false, text: 'Kurt' },
    ]);
    expect(promptParts('Zemin çok dik')).toEqual([
      { key: null, hold: false, text: 'Zemin çok dik' },
    ]);
    // İki nokta içeren ama tuş olmayan metinler tuşa dönüşmez.
    expect(promptParts('Sökülüyor: Sandık')[0]?.key).toBeNull();
    expect(promptParts('Pişti: Pişmiş Et')[0]?.key).toBeNull();
  });

  it('gerçek yerleştirme ipucu üç tuşlu parçaya ayrılır', () => {
    const text = aimPrompt({ kind: 'campfire', valid: true } as Parameters<typeof aimPrompt>[0]);
    const parts = promptParts(text);
    expect(parts.map((p) => p.key)).toEqual(['Sol tık', 'R', 'C']);
  });
});

describe('uyarı/bildirim/yük düzeyleri', () => {
  it('ünlemli uyarılar kritiktir', () => {
    expect(warningLevel('Susuzluktan ölüyorsun!')).toBe('critical');
    expect(warningLevel('Susadın')).toBe('warn');
  });

  it('bildirim türleri', () => {
    expect(toastKind('+3 Fındık')).toBe('gain');
    expect(toastKind('Kamp Ateşi kuruldu')).toBe('gain');
    expect(toastKind('Tehlike: Kurt')).toBe('danger');
    expect(toastKind('Gece bastı: hava soğuyor, yırtıcılar avda')).toBe('info');
  });

  it('yük oranı kırpılır; eşiğin üstü ağır, sınır dolu', () => {
    expect(loadLevel(0, 25_000)).toEqual({ fraction: 0, level: 'ok' });
    expect(loadLevel(12_500, 25_000).level).toBe('ok');
    expect(loadLevel(25_000 * HUD_STYLE.loadHighFraction, 25_000).level).toBe('high');
    expect(loadLevel(30_000, 25_000)).toEqual({ fraction: 1, level: 'full' });
    expect(loadLevel(1, 0).level).toBe('full');
  });
});

describe('simgeler', () => {
  it('her eşyanın SVG simgesi var', () => {
    for (const id of ITEM_IDS) expect(ITEM_ICONS[id]).toMatch(/^<(path|g|rect|circle|ellipse)/);
  });

  it('arayüz simgeleri yalnızca SVG şekil öğeleri içerir (betik/olay yok)', () => {
    for (const markup of [...Object.values(UI_ICONS), ...Object.values(ITEM_ICONS)]) {
      expect(markup).not.toMatch(/<script|on[a-z]+=|href=/i);
    }
  });
});
