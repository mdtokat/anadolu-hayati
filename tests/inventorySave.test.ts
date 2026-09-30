import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/items/Inventory';
import { ITEM_IDS, type ItemId } from '../src/items/itemDefs';
import { createRandom } from '../src/utils/random';

const filled = (): Inventory => {
  const i = new Inventory({ slots: 8, maxWeightG: 20_000 });
  i.add('stick', 25);
  i.add('stone', 3);
  i.add('hazelnut', 12);
  i.add('stone_axe', 1);
  i.removeFromSlot(0, 4);
  return i;
};

describe('Inventory kaydı', () => {
  it('toJSON sürümlüdür ve canlı duruma bağlı değildir (kopya)', () => {
    const i = filled();
    const save = i.toJSON();
    expect(save.version).toBe(1);
    expect(save.slots).toHaveLength(8);
    i.add('stick', 1);
    expect(JSON.stringify(save)).toBe(JSON.stringify(filled().toJSON()));
  });

  it('fromJSON(toJSON(x)) birebir aynı durumu verir (JSON gidiş-dönüşüyle de)', () => {
    const i = filled();
    const viaObject = Inventory.fromJSON(i.toJSON());
    const viaText = Inventory.fromJSON(JSON.parse(JSON.stringify(i.toJSON())));
    for (const copy of [viaObject, viaText]) {
      expect(copy.toJSON()).toEqual(i.toJSON());
      expect(copy.totalWeightG).toBe(i.totalWeightG);
      expect(copy.slotCount).toBe(i.slotCount);
      for (const id of ITEM_IDS) expect(copy.count(id)).toBe(i.count(id));
    }
  });

  it("seed'li rastgele envanterlerde gidiş-dönüş", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = createRandom(seed);
      const i = new Inventory({ slots: 10, maxWeightG: 9000 });
      for (let s = 0; s < 60; s++) {
        i.add(ITEM_IDS[rnd.int(0, ITEM_IDS.length - 1)] as ItemId, rnd.int(0, 8));
        if (s % 4 === 0) i.removeFromSlot(rnd.int(0, 9), rnd.int(0, 3));
      }
      expect(Inventory.fromJSON(i.toJSON()).toJSON()).toEqual(i.toJSON());
    }
  });

  it('yüklenen envanter çalışır: ekleme sınırları geçerli', () => {
    const copy = Inventory.fromJSON(filled().toJSON());
    const before = copy.count('stick');
    expect(copy.add('stick', 2)).toBe(0);
    expect(copy.count('stick')).toBe(before + 2);
    expect(copy.version).toBe(1); // yükleme sürümü artırmaz
  });

  it('seçenekler kayıtla uyuşmazsa reddeder (slot sayısı, ağırlık sınırı)', () => {
    const save = filled().toJSON();
    expect(() => Inventory.fromJSON(save, { slots: 9 })).toThrow(/Slot sayısı/);
    expect(() => Inventory.fromJSON(save, { slots: 8, maxWeightG: 1000 })).toThrow(/ağırlık/i);
  });

  const valid = () => filled().toJSON();
  const bad: Array<[string, unknown]> = [
    ['null', null],
    ['dizi olmayan slots', { version: 1, slots: 'x' }],
    ['sürüm yok', { slots: [null] }],
    ['bilinmeyen sürüm', { ...valid(), version: 2 }],
    ['bilinmeyen kimlik', { version: 1, slots: [{ id: 'sword', count: 1 }] }],
    ['kimlik yok', { version: 1, slots: [{ count: 1 }] }],
    ['slot nesne değil', { version: 1, slots: [5] }],
    ['adet 0', { version: 1, slots: [{ id: 'stick', count: 0 }] }],
    ['negatif adet', { version: 1, slots: [{ id: 'stick', count: -2 }] }],
    ['kesirli adet', { version: 1, slots: [{ id: 'stick', count: 1.5 }] }],
    ['metin adet', { version: 1, slots: [{ id: 'stick', count: '3' }] }],
    ['yığın sınırı aşımı', { version: 1, slots: [{ id: 'stick', count: 21 }] }],
    ['alet yığını', { version: 1, slots: [{ id: 'stone_axe', count: 2 }] }],
    ['boş slots (0 slot)', { version: 1, slots: [] }],
  ];
  it.each(bad)('bozuk kayıt reddedilir: %s', (_name, data) => {
    expect(() => Inventory.fromJSON(data)).toThrow(Error);
  });

  it('ağırlık sınırını aşan kayıt reddedilir', () => {
    const save = {
      version: 1,
      slots: [
        { id: 'log', count: 3 },
        { id: 'log', count: 3 },
      ],
    };
    expect(() => Inventory.fromJSON(save, { maxWeightG: 5000 })).toThrow(/ağırlık/i);
  });
});
