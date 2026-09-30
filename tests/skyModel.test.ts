import { describe, expect, it } from 'vitest';
import { SKY } from '../src/config';
import { hexToRgb, mixRgb, skyLook, smoothstep } from '../src/world/skyModel';

const at = (altitudeDeg: number) => skyLook({ altitudeDeg, azimuthDeg: 180 });
const luminance = (c: readonly [number, number, number]) =>
  0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('yardımcılar', () => {
  it('hexToRgb 0–1 aralığına çevirir', () => {
    expect(hexToRgb(0xff8000)).toEqual([1, 128 / 255, 0]);
  });

  it('mixRgb uçlarda tam değeri verir', () => {
    expect(mixRgb([0, 0, 0], [1, 0.5, 0.2], 0)).toEqual([0, 0, 0]);
    expect(mixRgb([0, 0, 0], [1, 0.5, 0.2], 1)).toEqual([1, 0.5, 0.2]);
  });

  it('smoothstep sınırlar ve ters yön', () => {
    expect(smoothstep(0, 10, -5)).toBe(0);
    expect(smoothstep(0, 10, 15)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5, 12);
    expect(smoothstep(-3, -12, 0)).toBe(0);
    expect(smoothstep(-3, -12, -20)).toBe(1);
  });
});

describe('skyLook', () => {
  it('öğlen: tam gündüz, güçlü güneş, ay ışığı yok, yıldız yok', () => {
    const look = at(60);
    expect(look.dayFactor).toBe(1);
    expect(look.sunIntensity).toBeCloseTo(SKY.sunIntensity, 12);
    expect(look.moonIntensity).toBe(0);
    expect(look.starAlpha).toBe(0);
    expect(look.ambientIntensity).toBeCloseTo(SKY.ambientDay, 12);
  });

  it('gece yarısı: güneş ışığı yok, ay ışığı var, yıldızlar tam, ortam düşük ama sıfır değil', () => {
    const look = at(-60);
    expect(look.dayFactor).toBe(0);
    expect(look.sunIntensity).toBe(0);
    expect(look.moonIntensity).toBeCloseTo(SKY.moonIntensity, 12);
    expect(look.starAlpha).toBe(1);
    expect(look.ambientIntensity).toBeCloseTo(SKY.ambientNight, 12);
    expect(look.ambientIntensity).toBeGreaterThan(0);
  });

  it('güneş yüksekliği arttıkça gökyüzü ve ufuk parlaklığı azalmaz (alacakaranlık dışı)', () => {
    let previous = -1;
    for (let alt = -30; alt <= 60; alt += 5) {
      const l = luminance(at(alt).zenith);
      expect(l).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = l;
    }
  });

  it('ufka yakınken (gün batımı) ufuk gündüzden ve geceden daha kırmızıdır', () => {
    const dusk = at(0).horizon;
    const day = at(60).horizon;
    const night = at(-60).horizon;
    // Kırmızı/mavi oranı: turuncu yön
    const warmth = (c: readonly [number, number, number]) => c[0] / c[2];
    expect(warmth(dusk)).toBeGreaterThan(warmth(day));
    expect(warmth(dusk)).toBeGreaterThan(warmth(night));
  });

  it('güneş ufka yaklaştıkça ışık rengi sıcaklaşır (kırmızı/mavi oranı artar)', () => {
    const warmth = (c: readonly [number, number, number]) => c[0] / c[2];
    expect(warmth(at(3).sunColor)).toBeGreaterThan(warmth(at(60).sunColor));
  });

  it('gün doğumunda ay ışığı sönerken güneş ışığı açılır', () => {
    const before = at(-5);
    const after = at(10);
    expect(after.sunIntensity).toBeGreaterThan(before.sunIntensity);
    expect(after.moonIntensity).toBeLessThan(before.moonIntensity);
  });

  it('tüm değerler geçerli aralıkta (−90…90°)', () => {
    for (let alt = -90; alt <= 90; alt += 3) {
      const look = at(alt);
      for (const c of [look.zenith, look.horizon, look.sunColor, look.moonColor, look.ambientColor])
        for (const v of c) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      expect(look.sunIntensity).toBeGreaterThanOrEqual(0);
      expect(look.moonIntensity).toBeGreaterThanOrEqual(0);
      expect(look.starAlpha).toBeGreaterThanOrEqual(0);
      expect(look.starAlpha).toBeLessThanOrEqual(1);
    }
  });
});
