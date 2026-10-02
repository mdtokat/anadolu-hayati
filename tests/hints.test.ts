import { describe, expect, it } from 'vitest';
import { HINTS } from '../src/config';
import {
  HINT_IDS,
  HINT_TEXT,
  HintTracker,
  readSeenHints,
  writeSeenHints,
  type HintContext,
  type HintStorage,
} from '../src/hints/hints';

const calm: HintContext = {
  hydration: 100,
  satiety: 100,
  bodyTempC: 37,
  isNight: false,
  fireBuilt: false,
  shelterBuilt: false,
  preyNearby: false,
};
const make = () => new HintTracker({ controlsDelaySeconds: 4, gapSeconds: 20 });

class FakeStorage implements HintStorage {
  readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

describe('HintTracker', () => {
  it('kontrol özeti oyuna girdikten bir süre sonra çıkar, bir kez', () => {
    const t = make();
    expect(t.update(calm, 100)).toBeNull(); // ilk gözlem: süre başlar
    expect(t.update(calm, 103)).toBeNull();
    expect(t.update(calm, 104.1)).toBe('controls');
    expect(t.update(calm, 200)).toBeNull(); // başka koşul yok, controls tekrarlanmaz
  });

  it('koşul yoksa hiçbir ipucu çıkmaz', () => {
    const t = make();
    t.update(calm, 0);
    t.update(calm, 5); // controls
    for (let s = 30; s < 3000; s += 10) expect(t.update(calm, s)).toBeNull();
  });

  it('su, yiyecek, ateş, barınak, av: koşul sağlanınca öncelik sırasıyla, her biri bir kez', () => {
    const t = make();
    t.update(calm, 0);
    expect(t.update(calm, 5)).toBe('controls');
    const hungryThirsty = { ...calm, hydration: 50, satiety: 50 };
    expect(t.update(hungryThirsty, 30)).toBe('water'); // su yiyecekten önce
    expect(t.update(hungryThirsty, 60)).toBe('food');
    const cold = { ...hungryThirsty, isNight: true };
    expect(t.update(cold, 90)).toBe('fire');
    expect(t.update(cold, 120)).toBeNull(); // ateş kurulmadıkça barınak önerilmez
    const withFire = { ...cold, fireBuilt: true };
    expect(t.update(withFire, 150)).toBe('shelter');
    const prey = { ...withFire, shelterBuilt: true, preyNearby: true };
    expect(t.update(prey, 180)).toBe('hunt');
    for (let s = 200; s < 1000; s += 20) expect(t.update(prey, s)).toBeNull();
    // Faz 10: yerleşim ve kişi ipuçları.
    const town = { ...prey, inSettlement: true };
    expect(t.update(town, 1000)).toBe('town');
    expect(t.update({ ...town, personNearby: true }, 1030)).toBe('person');
    // Faz 11.5: elde menzilli silah.
    expect(t.update({ ...town, personNearby: true, rangedHeld: true }, 1060)).toBe('ranged');
    expect(t.seenIds).toEqual([...HINT_IDS]);
  });

  it('ipuçları arasında bekleme süresi vardır (üst üste binmez)', () => {
    const t = make();
    t.update(calm, 0);
    expect(t.update({ ...calm, hydration: 10, satiety: 10 }, 5)).toBe('controls');
    expect(t.update({ ...calm, hydration: 10, satiety: 10 }, 15)).toBeNull(); // 10 sn < 20 sn
    expect(t.update({ ...calm, hydration: 10, satiety: 10 }, 25.1)).toBe('water');
  });

  it('ateş zaten kurulmuşsa ateş ipucu çıkmaz; ısı düşükse (gündüz de) çıkar', () => {
    const t = make();
    t.update(calm, 0);
    t.update(calm, 5);
    // ateş kuruluysa 'fire' çıkmaz (yerine barınak önerilir)
    expect(t.update({ ...calm, isNight: true, fireBuilt: true }, 40)).toBe('shelter');
    const t2 = make();
    t2.update(calm, 0);
    t2.update(calm, 5);
    expect(t2.update({ ...calm, bodyTempC: HINTS.coldBelowC - 0.5 }, 40)).toBe('fire');
  });

  it('başlangıçtan görülmüş sayılanlar çıkmaz; reset hepsini unutur, restart görülenleri korur', () => {
    const t = new HintTracker({
      controlsDelaySeconds: 4,
      gapSeconds: 20,
      seen: ['controls', 'water'],
    });
    t.update(calm, 0);
    expect(t.update({ ...calm, hydration: 10 }, 10)).toBeNull(); // water görülmüş
    expect(t.update({ ...calm, satiety: 10 }, 40)).toBe('food');

    t.restart();
    expect(t.seenIds).toEqual(['controls', 'water', 'food']);
    t.reset();
    expect(t.seenIds).toEqual([]);
    t.update(calm, 100);
    expect(t.update(calm, 105)).toBe('controls');
  });

  it('her ipucunun metni vardır ve boş değildir', () => {
    for (const id of HINT_IDS) expect(HINT_TEXT[id].length).toBeGreaterThan(10);
  });

  it('ipuçları yalnızca ipucudur: hiçbir metin zorunlu adım ya da görev dili kullanmaz', () => {
    for (const id of HINT_IDS) expect(HINT_TEXT[id]).not.toMatch(/zorunlu|görev|tamamlamalısın/i);
  });
});

describe('görülen ipuçlarının kalıcılığı', () => {
  it('yaz → oku gidiş-dönüş; bilinmeyen kimlikler elenir', () => {
    const storage = new FakeStorage();
    writeSeenHints(storage, ['controls', 'fire']);
    expect(readSeenHints(storage)).toEqual(['controls', 'fire']);
    storage.data.set(HINTS.storageKey, JSON.stringify(['controls', 'uydurma', 7]));
    expect(readSeenHints(storage)).toEqual(['controls']);
  });

  it('boş liste anahtarı siler (Yeni Oyun)', () => {
    const storage = new FakeStorage();
    writeSeenHints(storage, ['water']);
    writeSeenHints(storage, []);
    expect(storage.data.has(HINTS.storageKey)).toBe(false);
    expect(readSeenHints(storage)).toEqual([]);
  });

  it('bozuk JSON, dizi olmayan değer, depo yok ya da hata veren depo oyunu bozmaz', () => {
    const storage = new FakeStorage();
    storage.data.set(HINTS.storageKey, '{bozuk');
    expect(readSeenHints(storage)).toEqual([]);
    storage.data.set(HINTS.storageKey, '{"a":1}');
    expect(readSeenHints(storage)).toEqual([]);
    expect(readSeenHints(null)).toEqual([]);
    expect(() => writeSeenHints(null, ['water'])).not.toThrow();
    const throwing: HintStorage = {
      getItem: () => {
        throw new Error('erişim yok');
      },
      setItem: () => {
        throw new Error('kota');
      },
      removeItem: () => {
        throw new Error('kota');
      },
    };
    expect(readSeenHints(throwing)).toEqual([]);
    expect(() => writeSeenHints(throwing, ['water'])).not.toThrow();
  });
});
