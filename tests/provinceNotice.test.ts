import { describe, expect, it } from 'vitest';
import {
  ProvinceTracker,
  provinceNoticeText,
  turkishDative,
  type ProvinceSample,
} from '../src/world/provinceNotice';

const at = (name: string | null, inRegion = true): ProvinceSample => ({ name, inRegion });
const make = () => new ProvinceTracker({ confirmSeconds: 2, cooldownSeconds: 15 });

describe('turkishDative', () => {
  it.each([
    ['Bartın', "Bartın'a"],
    ['Karabük', "Karabük'e"],
    ['Zonguldak', "Zonguldak'a"],
    ['Bolu', "Bolu'ya"],
    ['Düzce', "Düzce'ye"],
    ['Çankırı', "Çankırı'ya"],
    ['Kastamonu', "Kastamonu'ya"],
    ['Kocaeli', "Kocaeli'ye"],
    ['Mersin', "Mersin'e"],
    ['Hatay', "Hatay'a"],
    ['İstanbul', "İstanbul'a"],
    ['Ordu', "Ordu'ya"],
  ])('%s → %s', (name, expected) => expect(turkishDative(name)).toBe(expected));
});

describe('provinceNoticeText', () => {
  it('hedef il için karşılama, komşu il için giriş metni', () => {
    expect(provinceNoticeText({ name: 'Bartın', inRegion: true })).toBe("Bartın'a hoş geldiniz");
    expect(provinceNoticeText({ name: 'Bolu', inRegion: false })).toBe("Bolu'ya girdiniz");
  });
});

describe('ProvinceTracker', () => {
  it('ilk bilinen ili sessizce kabul eder (oyun başı / yükleme: hoş geldiniz yok)', () => {
    const t = make();
    expect(t.observe(at('Zonguldak'), 0)).toBeNull();
    expect(t.province).toBe('Zonguldak');
    expect(t.observe(at('Zonguldak'), 1)).toBeNull();
  });

  it('başlangıç denizdeyse (il yok) bekler, ilk karaya çıkılan ili sessizce kabul eder', () => {
    const t = make();
    expect(t.observe(at(null), 0)).toBeNull();
    expect(t.province).toBeNull();
    expect(t.observe(at('Bartın'), 1)).toBeNull();
    expect(t.province).toBe('Bartın');
  });

  it('yeni ilde confirmSeconds kalınca bildirir; önceki ili de verir', () => {
    const t = make();
    t.observe(at('Zonguldak'), 0);
    expect(t.observe(at('Bartın'), 10)).toBeNull(); // aday
    expect(t.observe(at('Bartın'), 11)).toBeNull(); // 1 sn: yetmez
    expect(t.observe(at('Bartın'), 12)).toEqual({
      name: 'Bartın',
      inRegion: true,
      from: 'Zonguldak',
    });
    expect(t.province).toBe('Bartın');
    expect(t.observe(at('Bartın'), 13)).toBeNull(); // tekrar bildirilmez
  });

  it('sınır boyunca titreme (kısa süreli geçişler) bildirim üretmez', () => {
    const t = make();
    t.observe(at('Zonguldak'), 0);
    for (let s = 1; s < 30; s += 1) {
      const sample = s % 2 === 0 ? at('Bartın') : at('Zonguldak');
      expect(t.observe(sample, s)).toBeNull();
    }
    expect(t.province).toBe('Zonguldak');
  });

  it('aday süresi, aday değişince yeniden başlar (A→B→C)', () => {
    const t = make();
    t.observe(at('A'), 0);
    t.observe(at('B'), 1);
    t.observe(at('C'), 2.5); // B'nin süresi C'ye geçmez
    expect(t.observe(at('C'), 3)).toBeNull();
    expect(t.observe(at('C'), 4.5)).toMatchObject({ name: 'C', from: 'A' });
  });

  it('deniz (il yok) mevcut ili değiştirmez: A → deniz → A bildirim vermez', () => {
    const t = make();
    t.observe(at('A'), 0);
    expect(t.observe(at(null), 5)).toBeNull();
    expect(t.observe(at(null), 20)).toBeNull();
    expect(t.observe(at('A'), 25)).toBeNull();
    expect(t.province).toBe('A');
  });

  it('A → deniz → B: B bildirilir', () => {
    const t = make();
    t.observe(at('A'), 0);
    t.observe(at(null), 5);
    t.observe(at('B'), 20);
    expect(t.observe(at('B'), 22)).toMatchObject({ name: 'B', from: 'A' });
  });

  it('komşu il bayrağı bildirimle taşınır', () => {
    const t = make();
    t.observe(at('Zonguldak'), 0);
    t.observe(at('Bolu', false), 5);
    expect(t.observe(at('Bolu', false), 7)).toEqual({
      name: 'Bolu',
      inRegion: false,
      from: 'Zonguldak',
    });
  });

  it('cooldown: hemen ardından gelen geçiş sessizce işlenir, il yine de güncellenir', () => {
    const t = make();
    t.observe(at('A'), 0);
    t.observe(at('B'), 1);
    expect(t.observe(at('B'), 3)).not.toBeNull(); // bildirildi (t=3)
    t.observe(at('C'), 4);
    expect(t.observe(at('C'), 6)).toBeNull(); // 3 sn sonra: cooldown'da
    expect(t.province).toBe('C');
    // cooldown dolunca yeni geçiş yine bildirilir
    t.observe(at('A'), 30);
    expect(t.observe(at('A'), 32)).toMatchObject({ name: 'A', from: 'C' });
  });

  it('reset sonrası ilk il yine sessizce kabul edilir (yükleme/yeni oyun)', () => {
    const t = make();
    t.observe(at('A'), 0);
    t.reset();
    expect(t.province).toBeNull();
    expect(t.observe(at('B'), 100)).toBeNull();
    expect(t.province).toBe('B');
  });

  it('reset cooldown süresini de sıfırlar', () => {
    const t = make();
    t.observe(at('A'), 0);
    t.observe(at('B'), 1);
    expect(t.observe(at('B'), 3)).not.toBeNull();
    t.reset();
    t.observe(at('A'), 4);
    t.observe(at('B'), 5);
    expect(t.observe(at('B'), 7)).not.toBeNull(); // cooldown'a takılmaz
  });

  it('varsayılan seçenekler config değerlerinden gelir', () => {
    const t = new ProvinceTracker();
    t.observe(at('A'), 0);
    t.observe(at('B'), 10);
    expect(t.observe(at('B'), 10.5)).toBeNull();
    expect(t.observe(at('B'), 12)).not.toBeNull(); // confirmSeconds = 2
  });
});
