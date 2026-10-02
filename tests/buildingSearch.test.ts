import { describe, expect, it } from 'vitest';
import { INVENTORY, SEARCH } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { COOK_RECIPES, cookRecipeFor } from '../src/combat/cooking';
import { Inventory } from '../src/items/Inventory';
import { ITEMS } from '../src/items/itemDefs';
import { BUILDING_SHAPES, BUILDING_KINDS, isMosque } from '../src/settlements/kinds';
import type { Building } from '../src/settlements/layout';
import { BUILDING_LOOT, rollBuildingLoot } from '../src/settlements/loot';
import { BuildingSearch, searchPrompt, searchTarget } from '../src/settlements/search';

const building = (over: Partial<Building> = {}): Building => ({
  id: 77 * 1024 + 3,
  settlement: 77,
  kind: 'house',
  x: 0,
  z: 0,
  y: 0,
  base: 0,
  yaw: 0,
  ruin: 0,
  ruined: false,
  tone: 0.5,
  floors: 1,
  name: null,
  stairRun: 0,
  ...over,
});

describe('ganimet (Faz 10)', () => {
  it('deterministik; yalnızca tablodaki eşyalar; cami/türbe/mezarlık aranmaz', () => {
    const b = building();
    expect(rollBuildingLoot(b)).toEqual(rollBuildingLoot(b));
    for (const kind of BUILDING_KINDS) {
      const searchable = BUILDING_SHAPES[kind].searchable;
      if (isMosque(kind) || kind === 'tomb' || kind === 'cemetery') {
        expect(searchable, kind).toBe(false);
        expect(BUILDING_LOOT[kind], kind).toBeUndefined();
      }
    }
    for (let i = 0; i < 200; i++) {
      const loot = rollBuildingLoot(building({ id: i, kind: 'shop_row' }));
      const allowed = new Set(BUILDING_LOOT.shop_row!.map((e) => e.item));
      for (const s of loot) expect(allowed.has(s.id)).toBe(true);
    }
  });

  it('yıkık yapılar daha az verir; serender fındık ve kestane kileridir', () => {
    let whole = 0;
    let ruined = 0;
    let nuts = 0;
    for (let i = 0; i < 500; i++) {
      whole += rollBuildingLoot(building({ id: i })).length;
      ruined += rollBuildingLoot(building({ id: i, ruined: true })).length;
      nuts += rollBuildingLoot(building({ id: i, kind: 'serender' })).filter(
        (s) => s.id === 'hazelnut',
      ).length;
    }
    expect(ruined).toBeLessThan(whole * 0.7);
    expect(nuts).toBeGreaterThan(350);
  });
});

describe('BuildingSearch', () => {
  const setup = () => {
    const events = new EventBus<GameEvents>();
    const inventory = new Inventory({ slots: INVENTORY.slots });
    const search = new BuildingSearch(events, inventory);
    const searched: number[] = [];
    events.on('building:searched', ({ id }) => searched.push(id));
    return { events, inventory, search, searched };
  };
  // Ganimeti boş olmayan bir ev bul.
  let rich = building();
  for (let i = 0; i < 100 && rollBuildingLoot(rich).length === 0; i++) rich = building({ id: i });

  it('E basılı süre dolunca ganimet eklenir, yapı bir kez aranır ve kayda girer', () => {
    const { inventory, search, searched } = setup();
    const loot = rollBuildingLoot(rich);
    expect(loot.length).toBeGreaterThan(0);
    for (let t = 0; t < SEARCH.seconds - 0.1; t += 1 / 60) search.update(1 / 60, true, rich);
    expect(searched).toEqual([]);
    for (let t = 0; t < 0.3; t += 1 / 60) search.update(1 / 60, true, rich);
    expect(searched).toEqual([rich.id]);
    for (const s of loot) expect(inventory.count(s.id)).toBe(s.count);
    search.update(1 / 60, true, rich);
    expect(search.offer?.status).toBe('searched');
    expect(searchPrompt(search.offer!)).toContain('arandı');
    expect(search.toSave()).toEqual([rich.id]);
    const other = setup().search;
    other.loadSave(search.toSave());
    expect(other.isSearched(rich.id)).toBe(true);
  });

  it('tuş bırakılınca ilerleme sıfırlanır; sığmazsa hiçbir şey eklenmez (atomik)', () => {
    const { inventory, search, searched } = setup();
    for (let t = 0; t < 1; t += 1 / 60) search.update(1 / 60, true, rich);
    search.update(1 / 60, false, rich);
    expect(search.progress).toBe(0);
    // Envanteri ağır taşla doldur
    while (inventory.add('stone', 10) === 0);
    const before = inventory.toJSON();
    search.update(1 / 60, true, rich);
    expect(search.offer?.status).toBe('full');
    for (let t = 0; t < SEARCH.seconds + 1; t += 1 / 60) search.update(1 / 60, true, rich);
    expect(searched).toEqual([]);
    expect(inventory.toJSON()).toEqual(before);
  });

  it('hedef: kapıya yakın, yapıya bakan, aranabilir yapı', () => {
    const b = building();
    const door = BUILDING_SHAPES.house.door; // yerel +z, yaw 0 → dünya +z
    const pose = { x: 0, y: 0, z: door.z + 0.8, yaw: 0 };
    // yaw 0 ileri = −z (yapıya doğru)
    expect(searchTarget([b], pose)?.id).toBe(b.id);
    expect(searchTarget([b], { ...pose, yaw: Math.PI })).toBeNull(); // arkası dönük
    expect(searchTarget([b], { ...pose, z: door.z + 5 })).toBeNull(); // uzak
    expect(searchTarget([building({ kind: 'mosque' })], pose)).toBeNull(); // cami aranmaz
  });
});

describe('Türk mutfağı: bakır tencereyle pişirme', () => {
  it('tencere yoksa yalnızca et pişer; tencereyle tarhana çorbası, bulgur pilavı, kuru fasulye, çay', () => {
    const inv = new Inventory({ slots: INVENTORY.slots });
    inv.add('tarhana', 1);
    expect(cookRecipeFor(inv)).toBeNull();
    inv.add('copper_pot', 1);
    expect(cookRecipeFor(inv)?.to).toBe('tarhana_soup');
    inv.add('raw_meat', 1);
    expect(cookRecipeFor(inv)?.to).toBe('cooked_meat');
    for (const r of COOK_RECIPES) {
      expect(ITEMS[r.to].edible, r.to).toBeDefined();
      if (r.requires) expect(ITEMS[r.from].edible, r.from).toBeUndefined();
    }
  });
});
