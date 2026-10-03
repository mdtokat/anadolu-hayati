import { describe, expect, it } from 'vitest';
import { Inventory, type ItemStack } from '../src/items/Inventory';
import { takeAllStacks, takeStack } from '../src/items/lootTransfer';

const small = () => new Inventory({ slots: 1, maxWeightG: 100_000 });

describe('ganimet alma', () => {
  it('seçilen yığını alır ve listeden düşer', () => {
    const list: ItemStack[] = [
      { id: 'peksimet', count: 2 },
      { id: 'pekmez', count: 1 },
    ];
    const inv = new Inventory();
    expect(takeStack(list, 1, inv)).toEqual({ id: 'pekmez', count: 1 });
    expect(list).toEqual([{ id: 'peksimet', count: 2 }]);
    expect(inv.count('pekmez')).toBe(1);
    expect(inv.count('peksimet')).toBe(0);
  });

  it('hiç sığmıyorsa null döner ve liste değişmez', () => {
    const inv = small();
    inv.add('pekmez', 1);
    const list: ItemStack[] = [{ id: 'peksimet', count: 2 }];
    expect(takeStack(list, 0, inv)).toBeNull();
    expect(list).toEqual([{ id: 'peksimet', count: 2 }]);
  });

  it('geçersiz dizinde null döner', () => {
    expect(takeStack([], 0, new Inventory())).toBeNull();
  });

  it('hepsini al: sığanı alır, sığmayanı listede bırakır', () => {
    const inv = small();
    const list: ItemStack[] = [
      { id: 'peksimet', count: 3 },
      { id: 'pekmez', count: 1 },
    ];
    const taken = takeAllStacks(list, inv);
    expect(taken).toEqual([{ id: 'peksimet', count: 3 }]);
    expect(list).toEqual([{ id: 'pekmez', count: 1 }]);
  });

  it('hepsini al: her şey sığarsa liste boşalır', () => {
    const inv = new Inventory();
    const list: ItemStack[] = [
      { id: 'peksimet', count: 3 },
      { id: 'pekmez', count: 1 },
      { id: 'hide', count: 2 },
    ];
    expect(takeAllStacks(list, inv)).toHaveLength(3);
    expect(list).toEqual([]);
  });
});
