import { describe, expect, it } from 'vitest';
import { INVENTORY, SEARCH } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { COOK_RECIPES, cookRecipeFor } from '../src/combat/cooking';
import { Inventory } from '../src/items/Inventory';
import { takeAllStacks, takeStack } from '../src/items/lootTransfer';
import { ITEMS } from '../src/items/itemDefs';
import {
  BUILDING_SHAPES,
  BUILDING_KINDS,
  containerFront,
  isMosque,
} from '../src/settlements/kinds';
import type { Building } from '../src/settlements/layout';
import { BUILDING_LOOT, rollBuildingLoot, rollContainerLoot } from '../src/settlements/loot';
import {
  BuildingSearch,
  containerId,
  type BuildingLoot,
  searchPrompt,
  searchTarget,
  type SearchTarget,
} from '../src/settlements/search';

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

describe('BuildingSearch: ganimet paneli kipi', () => {
  let rich = building({ kind: 'serender' });
  for (let i = 0; i < 100 && rollBuildingLoot(rich).length < 2; i++)
    rich = building({ id: i, kind: 'serender' });
  const target = (): SearchTarget => ({ type: 'door', id: rich.id, building: rich });
  const hold = (search: BuildingSearch) => {
    for (let t = 0; t < SEARCH.seconds + 0.5; t += 1 / 60) search.update(1 / 60, true, target());
  };

  it('eşyalar otomatik alınmaz; panel açılır, boşalınca hedef aranmış olur', () => {
    const events = new EventBus<GameEvents>();
    const inventory = new Inventory({ slots: INVENTORY.slots });
    const search = new BuildingSearch(events, inventory);
    const opened: BuildingLoot[] = [];
    search.onLoot = (loot) => opened.push(loot);
    hold(search);
    expect(opened).toHaveLength(1);
    expect(inventory.slots.every((s) => s === null)).toBe(true);
    expect(search.isSearched(rich.id)).toBe(false);

    // Bir yığın alınır: hedef hâlâ açık (kalan var), kalan kayda girer.
    const loot = opened[0]!;
    const total = loot.items.length;
    takeStack(loot.items, 0, inventory);
    loot.settle();
    expect(loot.items).toHaveLength(total - 1);
    expect(search.isSearched(rich.id)).toBe(false);
    const saved = search.leftoversToSave();
    expect(saved).toHaveLength(1);

    // Yeniden aranınca aynı kalan liste açılır (yeniden zarlanmaz), kayıt yükleme de korur.
    const other = new BuildingSearch(new EventBus<GameEvents>(), inventory);
    other.loadSave(search.toSave(), search.containersToSave(), saved);
    const reopened: BuildingLoot[] = [];
    other.onLoot = (l) => reopened.push(l);
    hold(other);
    expect(reopened[0]!.items).toEqual(loot.items);

    // Kalanı da alınca hedef biter.
    takeAllStacks(reopened[0]!.items, inventory);
    reopened[0]!.settle();
    expect(other.isSearched(rich.id)).toBe(true);
    expect(other.leftoversToSave()).toEqual([]);
  });

  it('envanter doluyken de panel açılır (sığan alınır, kalan hedefte kalır)', () => {
    const events = new EventBus<GameEvents>();
    const inventory = new Inventory({ slots: INVENTORY.slots });
    while (inventory.add('stone', 10) === 0);
    const search = new BuildingSearch(events, inventory);
    const opened: BuildingLoot[] = [];
    search.onLoot = (loot) => opened.push(loot);
    hold(search);
    expect(search.offer?.status).toBe('ready');
    expect(opened).toHaveLength(1);
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
  // Ganimeti boş olmayan bir serender (kapıdan aranır) bul.
  let rich = building({ kind: 'serender' });
  for (let i = 0; i < 100 && rollBuildingLoot(rich).length === 0; i++)
    rich = building({ id: i, kind: 'serender' });
  const door = (b: Building): SearchTarget => ({ type: 'door', id: b.id, building: b });

  it('E basılı süre dolunca ganimet eklenir, yapı bir kez aranır ve kayda girer', () => {
    const { inventory, search, searched } = setup();
    const loot = rollBuildingLoot(rich);
    expect(loot.length).toBeGreaterThan(0);
    for (let t = 0; t < SEARCH.seconds - 0.1; t += 1 / 60) search.update(1 / 60, true, door(rich));
    expect(searched).toEqual([]);
    for (let t = 0; t < 0.3; t += 1 / 60) search.update(1 / 60, true, door(rich));
    expect(searched).toEqual([rich.id]);
    for (const s of loot) expect(inventory.count(s.id)).toBe(s.count);
    search.update(1 / 60, true, door(rich));
    expect(search.offer?.status).toBe('searched');
    expect(searchPrompt(search.offer!)).toContain('arandı');
    expect(search.toSave()).toEqual([rich.id]);
    const other = setup().search;
    other.loadSave(search.toSave());
    expect(other.isSearched(rich.id)).toBe(true);
  });

  it('tuş bırakılınca ilerleme sıfırlanır; sığmazsa hiçbir şey eklenmez (atomik)', () => {
    const { inventory, search, searched } = setup();
    for (let t = 0; t < 1; t += 1 / 60) search.update(1 / 60, true, door(rich));
    search.update(1 / 60, false, door(rich));
    expect(search.progress).toBe(0);
    // Envanteri ağır taşla doldur
    while (inventory.add('stone', 10) === 0);
    const before = inventory.toJSON();
    search.update(1 / 60, true, door(rich));
    expect(search.offer?.status).toBe('full');
    for (let t = 0; t < SEARCH.seconds + 1; t += 1 / 60) search.update(1 / 60, true, door(rich));
    expect(searched).toEqual([]);
    expect(inventory.toJSON()).toEqual(before);
  });

  it('kapı hedefi: kapıya yakın, yapıya bakan, kapıdan aranan yapı', () => {
    const b = building({ kind: 'serender' });
    const d = BUILDING_SHAPES.serender.door; // yerel +z, yaw 0 → dünya +z
    const pose = { x: 0, y: 0, z: d.z + 0.8, yaw: 0 };
    // yaw 0 ileri = −z (yapıya doğru)
    expect(searchTarget([b], pose)).toMatchObject({ type: 'door', id: b.id });
    expect(searchTarget([b], { ...pose, yaw: Math.PI })).toBeNull(); // arkası dönük
    expect(searchTarget([b], { ...pose, z: d.z + 5 })).toBeNull(); // uzak
    expect(searchTarget([building({ kind: 'mosque' })], pose)).toBeNull(); // cami aranmaz
    // Konutlar artık kapıdan değil, içerideki kaplarından aranır.
    const house = building();
    const hd = BUILDING_SHAPES.house.door;
    expect(searchTarget([house], { x: 0, y: 0, z: hd.z + 0.8, yaw: 0 })).toBeNull();
  });

  it('kap hedefi: içeride sandığa/dolaba bakan oyuncu; kimlik yapı · 8 + sıra', () => {
    const house = building();
    const shape = BUILDING_SHAPES.house;
    expect(shape.containers.length).toBeGreaterThan(0);
    shape.containers.forEach((c, index) => {
      const f = containerFront(c);
      // Kabın önünde 0,9 m, kaba bakan oyuncu (ileri = (−sin yaw, −cos yaw) = −f).
      const pose = {
        x: c.x + f.x * 0.9,
        y: 0,
        z: c.z + f.z * 0.9,
        yaw: Math.atan2(f.x, f.z),
      };
      const t = searchTarget([house], pose);
      expect(t, `kap ${index}`).toMatchObject({ type: 'container', index });
      expect(t?.id).toBe(containerId(house, index));
      // Arkasını dönen ya da başka kattaki oyuncu bulamaz.
      expect(searchTarget([house], { ...pose, yaw: pose.yaw + Math.PI })).toBeNull();
      expect(searchTarget([house], { ...pose, y: 3 })).toBeNull();
    });
  });

  it('kaplar ayrı ayrı aranır ve kayda girer; eski kayıtta kapıdan aranmış yapının kapları boştur', () => {
    const { inventory, search, searched } = setup();
    let house = building();
    for (let i = 0; i < 200; i++) {
      house = building({ id: 5000 + i });
      if (rollContainerLoot(house, 0).length > 0) break;
    }
    const c = BUILDING_SHAPES.house.containers[0]!;
    const target: SearchTarget = {
      type: 'container',
      id: containerId(house, 0),
      building: house,
      index: 0,
      container: c,
    };
    for (let t = 0; t < SEARCH.containerSeconds + 0.1; t += 1 / 60)
      search.update(1 / 60, true, target);
    expect(searched).toEqual([house.id]);
    for (const s of rollContainerLoot(house, 0)) expect(inventory.count(s.id)).toBeGreaterThan(0);
    expect(search.containersToSave()).toEqual([containerId(house, 0)]);
    expect(search.toSave()).toEqual([]);
    search.update(1 / 60, true, target);
    expect(searchPrompt(search.offer!)).toBe('Sandık: arandı, içi boş');
    // İkinci kap ayrı.
    const second: SearchTarget = { ...target, id: containerId(house, 1), index: 1 };
    expect(search.isTargetSearched(second)).toBe(false);
    // Eski (v5) kayıt: yapı kapıdan aranmış → kapları da boş.
    const legacy = setup().search;
    legacy.loadSave([house.id]);
    expect(legacy.isTargetSearched(target)).toBe(true);
  });

  it('kap ganimeti deterministik, tablodan; yiyecek dolaba gider; tüm kaplar birlikte ≥ kapı ganimeti kadar', () => {
    let total = 0;
    let door = 0;
    for (let i = 0; i < 300; i++) {
      const b = building({ id: 9000 + i, kind: 'konak' });
      const shape = BUILDING_SHAPES.konak;
      const allowed = new Set(BUILDING_LOOT.konak!.map((e) => e.item));
      shape.containers.forEach((c, index) => {
        const loot = rollContainerLoot(b, index);
        expect(rollContainerLoot(b, index)).toEqual(loot);
        for (const s of loot) {
          expect(allowed.has(s.id)).toBe(true);
          if (ITEMS[s.id].category === 'food') expect(c.kind).toBe('cupboard');
        }
        total += loot.length;
      });
      door += rollBuildingLoot(b).length;
    }
    expect(total).toBeGreaterThan(door);
    expect(rollContainerLoot(building(), 99)).toEqual([]);
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
