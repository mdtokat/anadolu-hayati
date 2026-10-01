import { describe, expect, it } from 'vitest';
import { Inventory, type ItemStack } from '../src/items/Inventory';
import { ITEM_IDS, ITEMS, type ItemId } from '../src/items/itemDefs';
import { createRandom } from '../src/utils/random';

const inv = (slots = 4, maxWeightG = 100_000) => new Inventory({ slots, maxWeightG });

describe('Inventory: ekleme', () => {
  it('yeni envanter boş ve sıfır ağırlıklı', () => {
    const i = inv();
    expect(i.slots.every((s) => s === null)).toBe(true);
    expect(i.totalWeightG).toBe(0);
    expect(i.version).toBe(0);
  });

  it('aynı eşyayı stackMax kadar birleştirir, taşanı yeni slota açar', () => {
    const i = inv();
    expect(i.add('stone', 25)).toBe(0); // stackMax 10
    expect(i.slots.map((s) => s?.count ?? 0)).toEqual([10, 10, 5, 0]);
    expect(i.add('stone', 7)).toBe(0);
    expect(i.slots.map((s) => s?.count ?? 0)).toEqual([10, 10, 10, 2]);
    expect(i.count('stone')).toBe(32);
    expect(i.totalWeightG).toBe(32 * ITEMS.stone.weightG);
  });

  it('mevcut kısmi yığını yeni slot açmadan önce doldurur', () => {
    const i = inv();
    i.add('stick', 5);
    i.add('stone', 1);
    i.add('stick', 3);
    expect(i.slots[0]).toEqual({ id: 'stick', count: 8 });
    expect(i.slots[1]).toEqual({ id: 'stone', count: 1 });
  });

  it('dolu slotlarda kısmi ekleme yapar ve artanı döndürür', () => {
    const i = inv(2);
    expect(i.add('log', 10)).toBe(4); // 2 slot × 3
    expect(i.count('log')).toBe(6);
    expect(i.capacityFor('log')).toBe(0);
    expect(i.add('log', 1)).toBe(1);
    expect(i.capacityFor('stick')).toBe(0);
  });

  it('ağırlık sınırında kısmi ekleme yapar; capacityFor ile tutarlı', () => {
    const i = inv(20, 1000);
    const cap = i.capacityFor('stone');
    expect(cap).toBe(2); // 1000 / 500
    expect(i.add('stone', 5)).toBe(3);
    expect(i.totalWeightG).toBe(1000);
    expect(i.capacityFor('stone')).toBe(0);
    expect(i.capacityFor('tinder')).toBe(0);
    expect(i.add('tinder', 1)).toBe(1);
  });

  it('ağırlığı tek adede bile yetmeyen eşya eklenmez', () => {
    const i = inv(4, 1000);
    expect(i.add('log', 1)).toBe(1);
    expect(i.version).toBe(0);
  });

  it('negatif veya tam olmayan adette RangeError', () => {
    const i = inv();
    expect(() => i.add('stick', -1)).toThrow(RangeError);
    expect(() => i.add('stick', 1.5)).toThrow(RangeError);
    expect(() => i.add('stick', Number.NaN)).toThrow(RangeError);
    expect(() => i.remove('stick', -1)).toThrow(RangeError);
    expect(() => i.remove('stick', 0.5)).toThrow(RangeError);
  });

  it('0 adet eklemek sürümü artırmaz', () => {
    const i = inv();
    expect(i.add('stick', 0)).toBe(0);
    expect(i.version).toBe(0);
  });

  it('geçersiz kurucu seçenekleri reddedilir', () => {
    expect(() => new Inventory({ slots: 0 })).toThrow(RangeError);
    expect(() => new Inventory({ slots: 2.5 })).toThrow(RangeError);
    expect(() => new Inventory({ maxWeightG: -1 })).toThrow(RangeError);
  });
});

describe('Inventory: çıkarma', () => {
  it('remove yetmeyince hiçbir şeyi değiştirmez (atomik)', () => {
    const i = inv();
    i.add('stick', 5);
    i.add('stone', 2);
    const before = JSON.stringify(i.slots);
    const version = i.version;
    const weight = i.totalWeightG;
    expect(i.remove('stick', 6)).toBe(false);
    expect(i.remove('hazelnut', 1)).toBe(false);
    expect(JSON.stringify(i.slots)).toBe(before);
    expect(i.version).toBe(version);
    expect(i.totalWeightG).toBe(weight);
  });

  it('birden çok yığından çıkarır, boşalan slotları temizler, ağırlığı düşürür', () => {
    const i = inv();
    i.add('stone', 25); // 10, 10, 5
    expect(i.remove('stone', 12)).toBe(true);
    expect(i.count('stone')).toBe(13);
    expect(i.slots.map((s) => s?.count ?? 0)).toEqual([10, 3, 0, 0]);
    expect(i.totalWeightG).toBe(13 * ITEMS.stone.weightG);
  });

  it('remove 0 başarılıdır ve sürümü artırmaz', () => {
    const i = inv();
    expect(i.remove('stick', 0)).toBe(true);
    expect(i.version).toBe(0);
  });

  it('removeFromSlot çıkarılan yığını döndürür; boş veya yetersizse null', () => {
    const i = inv();
    i.add('stick', 5);
    expect(i.removeFromSlot(0, 2)).toEqual({ id: 'stick', count: 2 });
    expect(i.slots[0]).toEqual({ id: 'stick', count: 3 });
    expect(i.removeFromSlot(0, 9)).toBeNull();
    expect(i.removeFromSlot(1, 1)).toBeNull();
    expect(i.removeFromSlot(0, 3)).toEqual({ id: 'stick', count: 3 });
    expect(i.slots[0]).toBeNull();
    expect(i.totalWeightG).toBe(0);
  });

  it('sınır dışı slot indekslerinde RangeError', () => {
    const i = inv(4);
    expect(() => i.removeFromSlot(-1, 1)).toThrow(RangeError);
    expect(() => i.removeFromSlot(4, 1)).toThrow(RangeError);
    expect(() => i.removeFromSlot(0.5, 1)).toThrow(RangeError);
    expect(() => i.moveSlot(0, 4)).toThrow(RangeError);
    expect(() => i.moveSlot(-1, 0)).toThrow(RangeError);
  });
});

describe('Inventory: moveSlot', () => {
  it('boş slota taşır', () => {
    const i = inv();
    i.add('stick', 3);
    i.moveSlot(0, 2);
    expect(i.slots.map((s) => s?.count ?? 0)).toEqual([0, 0, 3, 0]);
  });

  it('aynı eşyayı birleştirir; taşan hedefte değil kaynakta kalır', () => {
    const i = inv();
    i.add('stone', 14); // 10, 4
    i.moveSlot(1, 0);
    expect(i.slots[0]).toEqual({ id: 'stone', count: 10 });
    expect(i.slots[1]).toEqual({ id: 'stone', count: 4 });
    i.removeFromSlot(0, 3); // 7, 4
    i.moveSlot(1, 0);
    expect(i.slots[0]).toEqual({ id: 'stone', count: 10 });
    expect(i.slots[1]).toEqual({ id: 'stone', count: 1 });
    i.moveSlot(1, 0); // hedef dolu: değişiklik yok
    const v = i.version;
    i.moveSlot(1, 0);
    expect(i.version).toBe(v);
  });

  it('farklı eşyayı takas eder; aynı slota taşıma etkisizdir', () => {
    const i = inv();
    i.add('stick', 2);
    i.add('stone', 3);
    i.moveSlot(0, 1);
    expect(i.slots[0]).toEqual({ id: 'stone', count: 3 });
    expect(i.slots[1]).toEqual({ id: 'stick', count: 2 });
    const v = i.version;
    i.moveSlot(0, 0);
    i.moveSlot(3, 0); // boş kaynak
    expect(i.version).toBe(v);
    expect(i.slots[0]).toEqual({ id: 'stone', count: 3 });
  });

  it('ağırlığı değiştirmez', () => {
    const i = inv();
    i.add('stick', 2);
    i.add('stone', 3);
    const w = i.totalWeightG;
    i.moveSlot(0, 3);
    i.moveSlot(1, 3);
    expect(i.totalWeightG).toBe(w);
  });
});

describe('Inventory: maliyet (canAfford / take)', () => {
  const costs: ItemStack[] = [
    { id: 'stick', count: 3 },
    { id: 'stone', count: 2 },
  ];

  it('tutarlı: canAfford doğruysa take başarılıdır ve maliyeti düşer', () => {
    const i = inv();
    i.add('stick', 5);
    i.add('stone', 2);
    expect(i.canAfford(costs)).toBe(true);
    expect(i.take(costs)).toBe(true);
    expect(i.count('stick')).toBe(2);
    expect(i.count('stone')).toBe(0);
  });

  it('karşılanmıyorsa take hiçbir şeyi değiştirmez (atomik)', () => {
    const i = inv();
    i.add('stick', 5);
    i.add('stone', 1);
    const v = i.version;
    expect(i.canAfford(costs)).toBe(false);
    expect(i.take(costs)).toBe(false);
    expect(i.count('stick')).toBe(5);
    expect(i.count('stone')).toBe(1);
    expect(i.version).toBe(v);
  });

  it('aynı eşya birden çok satırdaysa toplamı karşılaştırır', () => {
    const i = inv();
    i.add('stick', 4);
    const split: ItemStack[] = [
      { id: 'stick', count: 3 },
      { id: 'stick', count: 3 },
    ];
    expect(i.canAfford(split)).toBe(false);
    expect(i.take(split)).toBe(false);
    expect(i.count('stick')).toBe(4);
  });

  it('boş maliyet her zaman karşılanır', () => {
    const i = inv();
    expect(i.canAfford([])).toBe(true);
    expect(i.take([])).toBe(true);
    expect(i.version).toBe(0);
  });
});

describe("Inventory: değişmezler (seed'li rastgele işlem dizisi)", () => {
  it.each([1, 2, 3, 4])('seed %i: sınırlar, korunum ve sürüm tutarlı', (seed) => {
    const rnd = createRandom(seed);
    const i = new Inventory({ slots: 6, maxWeightG: 6000 });
    const expected = new Map<ItemId, number>(ITEM_IDS.map((id) => [id, 0]));
    const pick = (): ItemId => ITEM_IDS[rnd.int(0, ITEM_IDS.length - 1)] as ItemId;

    for (let step = 0; step < 2000; step++) {
      const before = i.version;
      const snapshot = JSON.stringify(i.slots);
      const op = rnd.int(0, 4);
      if (op <= 1) {
        const id = pick();
        const n = rnd.int(0, 12);
        const left = i.add(id, n);
        expected.set(id, (expected.get(id) ?? 0) + n - left);
      } else if (op === 2) {
        const id = pick();
        const n = rnd.int(0, 12);
        if (i.remove(id, n)) expected.set(id, (expected.get(id) ?? 0) - n);
      } else if (op === 3) {
        const removed = i.removeFromSlot(rnd.int(0, 5), rnd.int(0, 5));
        if (removed) expected.set(removed.id, (expected.get(removed.id) ?? 0) - removed.count);
      } else {
        i.moveSlot(rnd.int(0, 5), rnd.int(0, 5));
      }

      expect(i.totalWeightG).toBeLessThanOrEqual(6000);
      let weight = 0;
      for (const slot of i.slots) {
        if (!slot) continue;
        expect(slot.count).toBeGreaterThanOrEqual(1);
        expect(slot.count).toBeLessThanOrEqual(ITEMS[slot.id].stackMax);
        weight += slot.count * ITEMS[slot.id].weightG;
      }
      expect(i.totalWeightG).toBe(weight);
      for (const id of ITEM_IDS) expect(i.count(id)).toBe(expected.get(id));
      // sürüm yalnızca gerçek değişimde artar
      const changed = JSON.stringify(i.slots) !== snapshot;
      if (!changed) expect(i.version).toBe(before);
      else expect(i.version).toBeGreaterThan(before);
    }
  });
});

describe('Inventory.canExchange / exchange', () => {
  it('bir eşyayı diğerine atomik dönüştürür', () => {
    const inv = new Inventory();
    inv.add('raw_meat', 2);
    expect(inv.exchange('raw_meat', 'cooked_meat')).toBe(true);
    expect(inv.count('raw_meat')).toBe(1);
    expect(inv.count('cooked_meat')).toBe(1);
    expect(inv.totalWeightG).toBe(500 + 400);
  });

  it('kaynak yoksa ya da hedef sığmıyorsa hiçbir şey değişmez', () => {
    const inv = new Inventory();
    expect(inv.exchange('raw_meat', 'cooked_meat')).toBe(false);
    inv.add('raw_meat', 2);
    inv.add('tinder', 19 * 30);
    const before = inv.toJSON();
    expect(inv.canExchange('raw_meat', 'cooked_meat')).toBe(false);
    expect(inv.exchange('raw_meat', 'cooked_meat')).toBe(false);
    expect(inv.toJSON()).toEqual(before);
  });

  it('tek adetlik kaynak yığını boşalacağı slotu hedefe bırakır; ağırlık sınırı denetlenir', () => {
    const inv = new Inventory({ maxWeightG: 1000 });
    inv.add('water_container_empty', 1);
    expect(inv.canExchange('water_container_empty', 'water_container_full')).toBe(false); // 1300 g > 1000 g
    const roomy = new Inventory({ slots: 1 });
    roomy.add('water_container_empty', 1);
    expect(roomy.exchange('water_container_empty', 'water_container_full')).toBe(true);
    expect(roomy.slots[0]).toEqual({ id: 'water_container_full', count: 1 });
  });
});
