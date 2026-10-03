import { describe, expect, it } from 'vitest';
import { ECONOMY, INVENTORY, PROPERTY, VENDORS } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { searchMoney } from '../src/economy/lootMoney';
import { ITEM_VALUES, buyPrice, sellPrice } from '../src/economy/prices';
import {
  Property,
  homeSpawnPoint,
  isForSale,
  propertyPrice,
  propertyTarget,
  resalePrice,
  roomContains,
} from '../src/economy/property';
import { buyItem, maxBuyable, offerFor, sellSlot, sells } from '../src/economy/shop';
import {
  VENDOR_DEFS,
  VENDOR_KINDS,
  placeVendors,
  vendorFacing,
  type VendorMap,
} from '../src/economy/vendors';
import { Wallet, formatMoney } from '../src/economy/wallet';
import { Inventory } from '../src/items/Inventory';
import { ITEM_IDS, ITEMS } from '../src/items/itemDefs';
import { RECIPES, RECIPE_IDS } from '../src/items/recipes';
import { BUILDING_KINDS, BUILDING_SHAPES } from '../src/settlements/kinds';
import type { Building } from '../src/settlements/layout';
import { BuildingSearch } from '../src/settlements/search';
import { buildingLocalToWorld, type SettlementView } from '../src/settlements/SettlementMap';

function building(patch: Partial<Building> = {}): Building {
  return {
    id: 5 * 1024 + 3,
    settlement: 5,
    kind: 'house',
    x: 100,
    z: -40,
    y: 12,
    base: 11,
    yaw: 0.4,
    ruin: 0,
    ruined: false,
    tone: 0.3,
    floors: 1,
    name: null,
    stairRun: 0,
    ...patch,
  };
}

const inventory = (): Inventory => new Inventory({ slots: INVENTORY.slots, backpacks: true });

describe('cüzdan', () => {
  it('harcama atomik, tutar negatif olmayan tam sayı', () => {
    const w = new Wallet(100);
    expect(w.spend(30)).toBe(true);
    expect(w.money).toBe(70);
    expect(w.spend(71)).toBe(false);
    expect(w.money).toBe(70);
    w.add(5);
    expect(w.money).toBe(75);
    expect(() => w.add(-1)).toThrow();
    expect(() => w.add(1.5)).toThrow();
    expect(formatMoney(1250)).toBe('1.250 ₺');
  });
});

describe('fiyatlar ve satıcılar', () => {
  it('her eşyanın değeri tanımlı; satıcıların sattıkları alınabilir değerde', () => {
    for (const id of ITEM_IDS) expect(ITEM_VALUES[id]).toBeGreaterThanOrEqual(0);
    expect(ITEM_VALUES.farm_plot).toBe(0);
    for (const kind of VENDOR_KINDS) {
      const def = VENDOR_DEFS[kind];
      expect(def.stock.length).toBeGreaterThan(0);
      expect(new Set(def.stock).size).toBe(def.stock.length);
      for (const id of def.stock) expect(buyPrice(id)).toBeGreaterThan(0);
    }
  });

  it('yapı ustası tarla dışındaki tüm yerleştirilebilir yapıları satar', () => {
    for (const id of ITEM_IDS) {
      if (ITEMS[id].category !== 'placeable') continue;
      expect(sells('yapi_ustasi', id)).toBe(id !== 'farm_plot');
    }
  });

  it('geri alım fiyatı alış fiyatından düşük; uzmanlık alanı daha iyi öder', () => {
    for (const id of ITEM_IDS) {
      if (ITEM_VALUES[id] === 0) continue;
      expect(sellPrice(id, true)).toBeLessThan(buyPrice(id));
      expect(sellPrice(id, false)).toBeLessThanOrEqual(sellPrice(id, true));
      if (ITEM_VALUES[id] >= 2) expect(sellPrice(id, false)).toBeGreaterThanOrEqual(1);
    }
    expect(offerFor('bakkal', 'bulgur')).toBe(Math.floor(15 * ECONOMY.sellRatio));
    expect(offerFor('nalbur', 'bulgur')).toBe(Math.floor(15 * ECONOMY.offSellRatio));
    expect(offerFor('av_bayii', 'hide')).toBe(Math.floor(25 * ECONOMY.sellRatio));
  });

  it('kâr döngüsü yok: girdileri satıcılardan alınabilen tarifin çıktısı girdilerinden ucuza satılır', () => {
    const sold = new Set(VENDOR_KINDS.flatMap((k) => VENDOR_DEFS[k].stock));
    for (const rid of RECIPE_IDS) {
      const r = RECIPES[rid];
      if (!r.inputs.every((s) => sold.has(s.id))) continue;
      const cost = r.inputs.reduce((sum, s) => sum + buyPrice(s.id) * s.count, 0);
      const best = Math.max(...VENDOR_KINDS.map((k) => offerFor(k, r.output.id)));
      expect(best * r.output.count, rid).toBeLessThan(cost);
    }
  });
});

describe('alışveriş', () => {
  it('alış atomik: para ya da yer yetmezse değişiklik yok', () => {
    const inv = inventory();
    const wallet = new Wallet(100);
    expect(buyItem('bakkal', 'bulgur', 2, { inventory: inv, wallet })).toBe('ok');
    expect(inv.count('bulgur')).toBe(2);
    expect(wallet.money).toBe(70);
    expect(buyItem('bakkal', 'copper_pot', 1, { inventory: inv, wallet })).toBe('money');
    expect(inv.count('copper_pot')).toBe(0);
    expect(wallet.money).toBe(70);
    expect(buyItem('bakkal', 'shotgun', 1, { inventory: inv, wallet })).toBe('not_sold');
    expect(buyItem('bakkal', 'bulgur', 0, { inventory: inv, wallet })).toBe('bad_count');
    // Ağırlık: 25 kg'a 14 kg'lık kulübeden iki tane sığmaz.
    const rich = new Wallet(100_000);
    const heavy = inventory();
    expect(maxBuyable('yapi_ustasi', 'wooden_hut', { inventory: heavy, wallet: rich })).toBe(1);
    expect(buyItem('yapi_ustasi', 'wooden_hut', 2, { inventory: heavy, wallet: rich })).toBe(
      'full',
    );
    expect(rich.money).toBe(100_000);
    // Test modu: ücretsiz.
    expect(buyItem('nalbur', 'torch', 1, { inventory: inv, wallet, free: true })).toBe('ok');
    expect(wallet.money).toBe(70);
  });

  it('en çok alınabilecek adet para, yer ve parti sınırıyla', () => {
    const inv = inventory();
    expect(maxBuyable('bakkal', 'peksimet', { inventory: inv, wallet: new Wallet(80) })).toBe(10);
    expect(
      maxBuyable('bakkal', 'wheat_seed', { inventory: inv, wallet: new Wallet(10_000) }),
    ).toBeLessThanOrEqual(ECONOMY.maxBatch);
    expect(maxBuyable('bakkal', 'rifle', { inventory: inv, wallet: new Wallet(1e6) })).toBe(0);
  });

  it('satış: slottan çıkar, para ekler; değersiz ve dolu çanta satılmaz', () => {
    const inv = inventory();
    const wallet = new Wallet(0);
    inv.add('hide', 3);
    const slot = inv.slots.findIndex((s) => s?.id === 'hide');
    const sold = sellSlot('av_bayii', slot, 2, { inventory: inv, wallet });
    expect(sold.result).toBe('ok');
    expect(sold.earned).toBe(2 * offerFor('av_bayii', 'hide'));
    expect(inv.count('hide')).toBe(1);
    expect(wallet.money).toBe(sold.earned);
    expect(sellSlot('av_bayii', slot, 5, { inventory: inv, wallet }).result).toBe('empty');
    inv.add('farm_plot', 1);
    const plot = inv.slots.findIndex((s) => s?.id === 'farm_plot');
    expect(sellSlot('bakkal', plot, 1, { inventory: inv, wallet }).result).toBe('worthless');
  });
});

describe('tapu', () => {
  it('satılık türler ve fiyat kuralları', () => {
    expect(isForSale('house')).toBe(true);
    for (const kind of [
      'mosque',
      'mosque_grand',
      'tomb',
      'cemetery',
      'fountain',
      'sadirvan',
    ] as const)
      expect(isForSale(kind)).toBe(false);
    expect(isForSale('government')).toBe(false);
    expect(isForSale('monument')).toBe(false);
    for (const kind of BUILDING_KINDS)
      if (isForSale(kind)) expect(BUILDING_SHAPES[kind]).toBeTruthy();
    const house = building();
    expect(propertyPrice(house, 'ilce')).toBe(PROPERTY.prices.house);
    expect(propertyPrice(house, 'il')).toBeGreaterThan(propertyPrice(house, 'ilce') as number);
    expect(propertyPrice(house, 'koy')).toBeLessThan(propertyPrice(house, 'ilce') as number);
    expect(propertyPrice(building({ ruined: true }), 'ilce')).toBeLessThan(PROPERTY.prices.house);
    expect(propertyPrice(building({ kind: 'apartment', floors: 4 }), 'ilce')).toBe(
      4 * PROPERTY.prices.apartment,
    );
    expect(propertyPrice(building({ kind: 'mosque' }), 'il')).toBeNull();
    for (const rank of ['il', 'ilce', 'koy'] as const)
      expect((propertyPrice(house, rank) as number) % PROPERTY.round).toBe(0);
  });

  it('satın alma ve geri satış; kayıt alış sırasını korur', () => {
    const p = new Property();
    const wallet = new Wallet(1000);
    const house = building();
    expect(p.buy(building({ kind: 'mosque' }), 'ilce', wallet)).toBe('not_for_sale');
    expect(p.buy(house, 'il', wallet)).toBe('money');
    expect(p.buy(house, 'ilce', wallet)).toBe('ok');
    expect(wallet.money).toBe(100);
    expect(p.isOwned(house.id)).toBe(true);
    expect(p.buy(house, 'ilce', wallet)).toBe('owned');
    const shed = building({ id: 77, kind: 'serender' });
    expect(p.buy(shed, 'koy', wallet, true)).toBe('ok');
    expect(p.toSave()).toEqual([house.id, 77]);
    expect(p.sell(house, 'ilce', wallet)).toBe('ok');
    expect(wallet.money).toBe(100 + resalePrice(900));
    expect(p.sell(house, 'ilce', wallet)).toBe('not_owned');
    const q = new Property();
    q.loadSave([3, 9, 3]);
    expect(q.list()).toEqual([3, 9]);
  });

  it('kapıya bakınca tapu hedefi; içeride oda ve kaplar', () => {
    const house = building();
    const shape = BUILDING_SHAPES.house;
    const door = buildingLocalToWorld(house, shape.door.x, shape.door.z + 1);
    // Kapının önünde, yapıya bakarak (yapı yerel −z yönü).
    const yaw = Math.atan2(-(house.x - door.x), -(house.z - door.z));
    expect(propertyTarget([house], { ...door, y: house.y, yaw })?.id).toBe(house.id);
    expect(propertyTarget([house], { ...door, y: house.y, yaw: yaw + Math.PI })).toBeNull();
    expect(propertyTarget([building({ kind: 'mosque' })], { ...door, y: house.y, yaw })).toBeNull();
    const center = buildingLocalToWorld(house, 0, 0);
    expect(roomContains(house, center.x, center.z, 0.5)).toBe(true);
    const outside = buildingLocalToWorld(house, shape.width, 0);
    expect(roomContains(house, outside.x, outside.z, 0)).toBe(false);
    const c = shape.containers[0];
    if (c) {
      const at = buildingLocalToWorld(house, c.x, c.z);
      expect(roomContains(house, at.x, at.z, 0.2)).toBe(false);
    }
    const spawn = homeSpawnPoint(house);
    expect(spawn).not.toBeNull();
    expect(roomContains(house, spawn!.x, spawn!.z, 0)).toBe(true);
    expect(homeSpawnPoint(building({ kind: 'mine_tower' }))).toBeNull();
  });
});

describe('aramada para', () => {
  it('deterministik, adımına yuvarlı; dükkân kasası daha dolu', () => {
    let found = 0;
    for (let id = 0; id < 400; id++) {
      const m = searchMoney('container', id, { kind: 'house', ruined: false });
      expect(m).toBe(searchMoney('container', id, { kind: 'house', ruined: false }));
      expect(m % ECONOMY.loot.step).toBe(0);
      if (m > 0) {
        found++;
        expect(m).toBeLessThanOrEqual(ECONOMY.loot.containerMax + ECONOMY.loot.step);
      }
    }
    expect(found / 400).toBeGreaterThan(ECONOMY.loot.containerChance - 0.1);
    expect(found / 400).toBeLessThan(ECONOMY.loot.containerChance + 0.1);
  });

  it('arama parayı cüzdana ekler ve olaya yazar', () => {
    const events = new EventBus<GameEvents>();
    const inv = inventory();
    const wallet = new Wallet(0);
    const search = new BuildingSearch(events, inv, wallet);
    let money = -1;
    events.on('building:searched', (e) => (money = e.money ?? -1));
    // Para çıkan bir serender bul (kapıdan aranır).
    let b = building({ kind: 'serender' });
    for (let id = 1; searchMoney('door', b.id, b) === 0; id++)
      b = building({ kind: 'serender', id });
    const target = { type: 'door' as const, id: b.id, building: b };
    for (let t = 0; t < 5; t += 1 / 60) search.update(1 / 60, true, target);
    expect(money).toBe(searchMoney('door', b.id, b));
    expect(wallet.money).toBe(money);
  });
});

describe('satıcı yerleşimi', () => {
  const shop = building({ id: 1, kind: 'shop_row', x: 10, z: 0, yaw: 0 });
  const cafe = building({ id: 2, kind: 'kahvehane', x: 40, z: 0, yaw: Math.PI / 2 });
  const house = building({ id: 3, kind: 'house', x: -30, z: 0, yaw: 0 });
  const view = (rank: 'il' | 'ilce' | 'koy'): SettlementView =>
    ({
      data: { id: 1, name: 'Devrek', rank, x: 0, z: 0 },
      buildings: [house, cafe, shop],
      radius: 80,
    }) as unknown as SettlementView;
  const terrain = { heightAt: () => 5, elevationAt: () => 80, blocked: () => false };

  it('il/ilçe merkezinde rütbe sırasıyla; köyde yok', () => {
    const map: VendorMap = { settlements: [view('ilce')], stairs: [] };
    const vendors = placeVendors(map, terrain);
    expect(vendors.map((v) => v.kind)).toEqual(VENDORS.perRank.ilce);
    // Önce merkeze en yakın dükkân, sonra kahvehane, sonra konut (yedek).
    expect(vendors.map((v) => v.building)).toEqual([1, 2, 3]);
    expect(vendors[0]?.name.startsWith('Bakkal ')).toBe(true);
    expect(vendors[0]?.id).toBe(VENDORS.idBase);
    expect(placeVendors({ settlements: [view('koy')], stairs: [] }, terrain)).toEqual([]);
    // Deterministik.
    expect(placeVendors(map, terrain)).toEqual(vendors);
  });

  it('kapının önünde, merdiven ayağının ötesinde ve dışarı bakarak durur', () => {
    const map: VendorMap = {
      settlements: [view('ilce')],
      stairs: [{ building: 1, x: 0, z: 0, yaw: 0, y0: 0, rise: 1, run: 2, width: 2 }],
    };
    const v = placeVendors(map, terrain)[0]!;
    const front = BUILDING_SHAPES.shop_row.depth / 2 + 2 + VENDORS.standOut;
    const expected = buildingLocalToWorld(shop, BUILDING_SHAPES.shop_row.door.x, front);
    expect(v.x).toBeCloseTo(expected.x, 6);
    expect(v.z).toBeCloseTo(expected.z, 6);
    // Dışarı bakar (yaw = 0 → yerel +z = dünya +z; kişi ileri (−sin, −cos) = (0, 1)).
    expect(-Math.cos(v.yaw)).toBeCloseTo(1, 6);
    // Yakındaki oyuncuya döner.
    const facing = vendorFacing(v, { x: v.x + 3, z: v.z });
    expect(-Math.sin(facing)).toBeCloseTo(1, 6);
  });

  it('yapı içine düşen nokta atlanır', () => {
    const blocked = { ...terrain, blocked: () => true };
    expect(placeVendors({ settlements: [view('il')], stairs: [] }, blocked)).toEqual([]);
  });
});

describe('kayıt v8', () => {
  it('v7 kaydı başlangıç parası ve boş tapu listesiyle göç eder; v8 alanı doğrulanır', async () => {
    const { migrateSave, parseSave } = await import('../src/save/saveGame');
    const { sampleSave } = await import('./helpers/sampleSave');
    const v7 = { ...JSON.parse(JSON.stringify(sampleSave())), version: 7 } as Record<
      string,
      unknown
    >;
    delete v7.economy;
    const migrated = migrateSave(v7) as { economy: unknown };
    expect(migrated.economy).toEqual({ money: ECONOMY.startMoney, owned: [] });
    const parsed = parseSave(sampleSave());
    expect(parsed.economy).toEqual({ money: 1725, owned: [12 * 1024 + 4, 3 * 1024] });
    const bad = { ...sampleSave(), economy: { money: -5, owned: [] } };
    expect(() => parseSave(bad)).toThrow();
    const dup = parseSave({ ...sampleSave(), economy: { money: 0, owned: [9, 2, 9] } });
    expect(dup.economy.owned).toEqual([9, 2]);
  });
});
