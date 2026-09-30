import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { GATHER_RULES } from '../src/interaction/gatherRules';
import { GatherSystem, rollYield } from '../src/interaction/gather';
import { Inventory } from '../src/items/Inventory';
import { ITEM_IDS, ITEMS } from '../src/items/itemDefs';
import { PROP_KINDS, type PropKind, type PropRef } from '../src/world/propKinds';

const DT = 1 / 60;
let nextId = 100;
const prop = (kind: PropKind, id = nextId++): PropRef => ({
  id,
  kind,
  x: 0,
  y: 0,
  z: -2,
  scale: 1,
});

function setup(options?: ConstructorParameters<typeof Inventory>[0]) {
  const events = new EventBus<GameEvents>();
  const inventory = new Inventory(options);
  const gather = new GatherSystem(events, inventory);
  const collected: GameEvents['item:collected'][] = [];
  events.on('item:collected', (e) => collected.push(e));
  /** `seconds` saniye boyunca E'ye basılı tutar. */
  const hold = (target: PropRef | null, seconds: number, held = true) => {
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) gather.update(DT, held, target);
  };
  return { events, inventory, gather, collected, hold };
}

describe('verim tablosu (GATHER_RULES)', () => {
  it('her nesne türü için elle verim var; eşyalar geçerli, miktarlar ve süreler mantıklı', () => {
    for (const kind of PROP_KINDS) {
      const rule = GATHER_RULES[kind];
      expect(rule, kind).toBeDefined();
      for (const y of [rule.hand, rule.axe]) {
        if (!y) continue;
        expect(y.seconds).toBeGreaterThan(0);
        expect(y.label.length).toBeGreaterThan(0);
        expect(y.items.length).toBeGreaterThan(0);
        for (const item of y.items) {
          expect(ITEM_IDS).toContain(item.id);
          expect(Number.isInteger(item.min) && Number.isInteger(item.max)).toBe(true);
          expect(item.min).toBeGreaterThanOrEqual(1);
          expect(item.max).toBeGreaterThanOrEqual(item.min);
        }
      }
    }
  });

  it('plan §2.3 ile uyumlu: ağaç/çalı/kaya/bitki eşleşmeleri', () => {
    const ids = (kind: PropKind, axe = false) =>
      (axe ? GATHER_RULES[kind].axe : GATHER_RULES[kind].hand)?.items.map((i) => i.id);
    expect(ids('tree_broadleaf')).toEqual(['stick']);
    expect(ids('tree_conifer', true)).toEqual(['log', 'bark']);
    expect(ids('bush')).toEqual(['stick', 'tinder']);
    expect(ids('rock')).toEqual(['stone']);
    expect(ids('berry_bush')).toEqual(['blackberry']);
    expect(ids('hazel')).toEqual(['hazelnut']);
    expect(ids('chestnut')).toEqual(['chestnut']);
    expect(ids('chestnut', true)).toEqual(['log']);
    expect(ids('mushroom')).toEqual(['mushroom_edible']);
    expect(ids('stick')).toEqual(['stick']);
    expect(ids('stone')).toEqual(['stone']);
    for (const kind of [
      'bush',
      'rock',
      'berry_bush',
      'hazel',
      'mushroom',
      'stick',
      'stone',
    ] as const) {
      expect(GATHER_RULES[kind].axe, kind).toBeUndefined();
    }
  });

  it('yalnızca kesilen ağaçlar ve yerden alınanlar dünyadan kalkar', () => {
    expect(GATHER_RULES.tree_broadleaf.hand.removes).toBe(false);
    expect(GATHER_RULES.tree_broadleaf.axe?.removes).toBe(true);
    for (const kind of ['stick', 'stone', 'mushroom'] as const) {
      expect(GATHER_RULES[kind].hand.removes).toBe(true);
    }
    for (const kind of ['bush', 'rock', 'berry_bush', 'hazel'] as const) {
      expect(GATHER_RULES[kind].hand.removes).toBe(false);
    }
  });
});

describe('rollYield', () => {
  it('deterministik: aynı nesne ve eylem aynı miktarı verir; aralık içinde kalır', () => {
    const y = GATHER_RULES.berry_bush.hand;
    for (let id = 0; id < 200; id++) {
      const a = rollYield(id, 'hand', y);
      expect(rollYield(id, 'hand', y)).toEqual(a);
      expect(a[0]!.count).toBeGreaterThanOrEqual(2);
      expect(a[0]!.count).toBeLessThanOrEqual(5);
    }
  });

  it('farklı nesneler farklı miktarlar verir (aralığın tamamı kullanılır)', () => {
    const y = GATHER_RULES.berry_bush.hand;
    const seen = new Set<number>();
    for (let id = 0; id < 300; id++) seen.add(rollYield(id, 'hand', y)[0]!.count);
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
});

describe('GatherSystem: tutma ve toplama', () => {
  it('süre dolunca eşya envantere girer ve item:collected yayınlanır', () => {
    const { gather, inventory, collected, hold } = setup();
    const berry = prop('berry_bush');
    hold(berry, GATHER_RULES.berry_bush.hand.seconds + 0.1);

    const expected = rollYield(berry.id, 'hand', GATHER_RULES.berry_bush.hand)[0]!.count;
    expect(inventory.count('blackberry')).toBe(expected);
    expect(collected).toEqual([
      {
        item: 'blackberry',
        count: expected,
        source: 'berry_bush',
        propId: berry.id,
        removed: false,
      },
    ]);
    expect(gather.isRemoved(berry.id)).toBe(false);
  });

  it('süre dolmadan toplanmaz; ilerleme 0–1 arasında artar', () => {
    const { gather, inventory, hold } = setup();
    const berry = prop('berry_bush');
    hold(berry, GATHER_RULES.berry_bush.hand.seconds / 2);
    expect(inventory.count('blackberry')).toBe(0);
    expect(gather.progress).toBeGreaterThan(0.4);
    expect(gather.progress).toBeLessThan(0.6);
    expect(gather.offer?.status).toBe('ready');
  });

  it('tuş bırakılırsa ilerleme sıfırlanır; yeniden başlayınca baştan sayar', () => {
    const { gather, inventory, hold } = setup();
    const bush = prop('bush');
    hold(bush, 0.8);
    gather.update(DT, false, bush);
    expect(gather.progress).toBe(0);
    hold(bush, 0.8); // toplam 1,6 sn ama kesintili: tamamlanmamalı
    expect(inventory.count('stick')).toBe(0);
    hold(bush, 0.4);
    expect(inventory.count('stick')).toBeGreaterThan(0);
  });

  it('hedef değişirse ilerleme sıfırlanır; hedef kaybolursa da', () => {
    const { gather, inventory, hold } = setup();
    const a = prop('bush');
    const b = prop('bush');
    hold(a, 0.8);
    hold(b, 0.5);
    expect(inventory.count('stick')).toBe(0);
    hold(null, 1);
    expect(gather.progress).toBe(0);
    expect(gather.offer).toBeNull();
  });

  it('tuş basılı değilken süre işlemez', () => {
    const { inventory, hold } = setup();
    hold(prop('stick'), 5, false);
    expect(inventory.count('stick')).toBe(0);
  });

  it('nesne başına verim bir kez alınır', () => {
    const { gather, inventory, collected, hold } = setup();
    const bush = prop('bush');
    hold(bush, 3);
    const after = { sticks: inventory.count('stick'), tinder: inventory.count('tinder') };
    expect(after.sticks).toBeGreaterThan(0);
    expect(collected).toHaveLength(2); // dal + kav
    hold(bush, 5);
    expect(inventory.count('stick')).toBe(after.sticks);
    expect(gather.inspect(bush)).toBeNull();
  });

  it('yerden alınan nesneler dünyadan kalkar (removed)', () => {
    const { gather, collected, hold } = setup();
    const stick = prop('stick');
    hold(stick, 1);
    expect(gather.isRemoved(stick.id)).toBe(true);
    expect(collected[0]).toMatchObject({ item: 'stick', count: 1, removed: true });
  });

  it('dünyadan kalkan nesneler sunulmaz', () => {
    const { gather, hold } = setup();
    const stone = prop('stone');
    hold(stone, 1);
    expect(gather.inspect(stone)).toBeNull();
  });
});

describe('GatherSystem: balta', () => {
  it('ağaçta önce elle dal, sonra baltayla kütük+kabuk; ağaç kalkar', () => {
    const { gather, inventory, collected, hold } = setup();
    inventory.add('stone_axe', 1);
    const tree = prop('tree_conifer');

    hold(tree, GATHER_RULES.tree_conifer.hand.seconds + 0.1);
    expect(inventory.count('stick')).toBeGreaterThan(0);
    expect(gather.isRemoved(tree.id)).toBe(false);
    expect(gather.inspect(tree)).toMatchObject({ status: 'ready', action: 'axe' });

    hold(tree, GATHER_RULES.tree_conifer.axe!.seconds + 0.1);
    expect(inventory.count('log')).toBe(1);
    expect(inventory.count('bark')).toBeGreaterThanOrEqual(1);
    expect(gather.isRemoved(tree.id)).toBe(true);
    expect(collected.filter((e) => e.removed).map((e) => e.item)).toEqual(['log', 'bark']);
    expect(gather.inspect(tree)).toBeNull();
  });

  it('baltasız ağaçta elle verimden sonra "balta gerekir" sunulur ve toplama olmaz', () => {
    const { gather, inventory, hold } = setup();
    const tree = prop('tree_broadleaf');
    hold(tree, 2);
    const sticks = inventory.count('stick');
    expect(gather.inspect(tree)?.status).toBe('needAxe');
    hold(tree, 10);
    expect(inventory.count('log')).toBe(0);
    expect(inventory.count('stick')).toBe(sticks);
  });

  it('balta sonradan bulununca aynı ağaç kesilebilir', () => {
    const { gather, inventory, hold } = setup();
    const tree = prop('chestnut');
    hold(tree, 2); // kestane (elle)
    expect(gather.inspect(tree)?.status).toBe('needAxe');
    inventory.add('stone_axe', 1);
    expect(gather.inspect(tree)).toMatchObject({ status: 'ready', action: 'axe' });
    hold(tree, 4.2);
    expect(inventory.count('log')).toBe(1);
  });

  it('balta olmayan türde (çalı) balta eylemi yoktur', () => {
    const { gather, inventory, hold } = setup();
    inventory.add('stone_axe', 1);
    const bush = prop('bush');
    hold(bush, 2);
    expect(gather.inspect(bush)).toBeNull();
  });
});

describe('GatherSystem: envanter dolu', () => {
  it('sığmıyorsa toplanmaz, nesne tükenmez ve "full" sunulur; yer açılınca toplanır', () => {
    const { gather, inventory, collected, hold } = setup({ slots: 1, maxWeightG: 25_000 });
    inventory.add('stone', 10); // tek slot dolu
    const berry = prop('berry_bush');
    expect(gather.inspect(berry)?.status).toBe('full');
    hold(berry, 5);
    expect(inventory.count('blackberry')).toBe(0);
    expect(collected).toHaveLength(0);

    inventory.remove('stone', 10);
    expect(gather.inspect(berry)?.status).toBe('ready');
    hold(berry, 1.4);
    expect(inventory.count('blackberry')).toBeGreaterThan(0);
  });

  it('atomik: çok eşyalı verimde yalnızca bir kısmı sığıyorsa hiçbir şey eklenmez', () => {
    // 2 slot: biri taşla dolu; ikinci slot dal alır ama kav için yer kalmaz.
    const { gather, inventory, collected, hold } = setup({ slots: 2, maxWeightG: 25_000 });
    inventory.add('stone', 10);
    const bush = prop('bush');
    hold(bush, 5);
    expect(inventory.count('stick')).toBe(0);
    expect(inventory.count('tinder')).toBe(0);
    expect(collected).toHaveLength(0);
    expect(inventory.slots.filter((s) => s !== null)).toHaveLength(1);
    expect(gather.inspect(bush)?.status).toBe('full');
  });

  it('ağırlık sınırı da sığmamayı doğurur', () => {
    const { gather, hold, inventory } = setup({ slots: 20, maxWeightG: 400 });
    const stone = prop('stone'); // 500 g
    expect(gather.inspect(stone)?.status).toBe('full');
    hold(stone, 2);
    expect(inventory.count('stone')).toBe(0);
  });
});

describe('eşya tablosu ile tutarlılık', () => {
  it('her verim eşyasının ağırlığı tanımlı ve tek bir verim envantere sığar (varsayılan sınırlar)', () => {
    const inventory = new Inventory();
    for (const kind of PROP_KINDS) {
      for (const y of [GATHER_RULES[kind].hand, GATHER_RULES[kind].axe]) {
        if (!y) continue;
        for (const item of y.items) {
          expect(ITEMS[item.id].weightG).toBeGreaterThan(0);
          expect(inventory.capacityFor(item.id)).toBeGreaterThanOrEqual(item.max);
        }
      }
    }
  });
});
