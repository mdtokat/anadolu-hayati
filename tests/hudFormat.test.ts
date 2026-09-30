import { describe, expect, it } from 'vitest';
import { formatDebugInfo, formatLocation, horizontalSpeed } from '../src/ui/hudFormat';

describe('horizontalSpeed', () => {
  it('yalnızca yatay bileşenleri hesaba katar', () => {
    expect(horizontalSpeed({ x: 3, y: 100, z: 4 })).toBe(5);
  });
});

describe('formatDebugInfo', () => {
  const info = {
    position: { x: 1.234, y: 5.678, z: -9.1 },
    velocity: { x: 3, y: 0, z: 4 },
    grounded: true,
    cameraMode: 'firstPerson' as const,
  };

  it('konum, hız, zemin ve kamera bilgisini biçimler', () => {
    expect(formatDebugInfo(info)).toBe(
      ['Konum: 1.2, 5.7, -9.1', 'Hız: 5.0 m/s', 'Zeminde: evet', 'Kamera: 1. şahıs'].join('\n'),
    );
  });

  it('sıfıra yakın değerleri -0.0 olarak yazmaz', () => {
    const text = formatDebugInfo({ ...info, position: { x: -0.001, y: 0.02, z: -0.04 } });
    expect(text).toContain('Konum: 0.0, 0.0, 0.0');
  });

  it('havada ve 3. şahıs durumunu gösterir', () => {
    const text = formatDebugInfo({ ...info, grounded: false, cameraMode: 'thirdPerson' });
    expect(text).toContain('Zeminde: hayır');
    expect(text).toContain('Kamera: 3. şahıs');
  });
});

describe('formatLocation', () => {
  it('hedef il: il adı ve yuvarlanmış rakım', () => {
    expect(formatLocation({ province: 'Zonguldak', inRegion: true, elevation: 133.6 })).toEqual({
      title: 'Zonguldak',
      detail: 'Rakım: 134 m',
    });
  });

  it('komşu il belirtilir', () => {
    expect(formatLocation({ province: 'Bolu', inRegion: false, elevation: 900 }).title).toBe(
      'Bolu (komşu il)',
    );
  });

  it('il yok: deniz seviyesindeyse Karadeniz, değilse harita dışı', () => {
    expect(formatLocation({ province: null, inRegion: false, elevation: 0 }).title).toBe(
      'Karadeniz',
    );
    expect(formatLocation({ province: null, inRegion: false, elevation: 300 }).title).toBe(
      'Harita dışı',
    );
  });
});
