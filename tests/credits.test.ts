import { describe, expect, it } from 'vitest';
import { CREDITS } from '../src/ui/credits';

describe('CREDITS', () => {
  it('kullanılan her veri kaynağı için atıf içerir (lisans şartı)', () => {
    const all = CREDITS.map((c) => c.text).join(' ');
    expect(all).toMatch(/Copernicus DEM GLO-30/);
    expect(all).toMatch(/DLR e\.V\./);
    expect(all).toMatch(/Airbus/);
    expect(all).toMatch(/geoBoundaries/);
    expect(all).toMatch(/CC BY 4\.0/);
  });

  it('her atıfın başlığı, metni ve https bağlantısı vardır', () => {
    for (const credit of CREDITS) {
      expect(credit.label.length).toBeGreaterThan(0);
      expect(credit.text.length).toBeGreaterThan(10);
      expect(credit.url).toMatch(/^https:\/\//);
    }
  });
});
