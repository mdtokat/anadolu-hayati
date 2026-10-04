import { describe, expect, it } from 'vitest';
import { BrArea } from '../src/battleRoyale/area';
import {
  BrPickups,
  ammoOf,
  contestantLoot,
  crateLoot,
  planCrates,
  rollBrLoot,
  rollBuildingBrLoot,
} from '../src/battleRoyale/loot';
import { defenseFor } from '../src/combat/damage';
import { BATTLE_ROYALE, INVENTORY, MEDICAL, SEARCH } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import type { ProvinceShape } from '../src/data/region';
import { hotbarUse } from '../src/items/hotbar';
import { Inventory } from '../src/items/Inventory';
import { ITEMS, isItemId, type ItemId } from '../src/items/itemDefs';
import { MedicalUse, isMedical, medicalHeal, medicalStatus } from '../src/items/medical';
import type { Building } from '../src/settlements/layout';
import { BUILDING_LOOT } from '../src/settlements/loot';
import { BuildingSearch, type BuildingLoot, type SearchTarget } from '../src/settlements/search';
import { createRandom } from '../src/utils/random';

const SEED = 12345;
const WEAPONS = new Set(Object.keys(BATTLE_ROYALE.loot.weapons));

describe('Battle Royale ganimet tabloları', () => {
  it('deterministik, geçerli eşyalar; menzilli silah mühimmatıyla gelir', () => {
    expect(rollBrLoot(7, 1, SEED)).toEqual(rollBrLoot(7, 1, SEED));
    expect(rollBrLoot(7, 1, SEED)).not.toEqual(rollBrLoot(7, 1, SEED + 1));
    let withRanged = 0;
    for (let key = 0; key < 3000; key++) {
      const loot = rollBrLoot(key, 1, SEED);
      for (const s of loot) {
        expect(isItemId(s.id)).toBe(true);
        expect(s.count).toBeGreaterThan(0);
      }
      expect(new Set(loot.map((s) => s.id)).size).toBe(loot.length); // birleştirilmiş
      const weapon = loot.find((s) => WEAPONS.has(s.id));
      const ammo = weapon && ammoOf(weapon.id);
      if (ammo) {
        withRanged++;
        expect(loot.some((s) => s.id === ammo)).toBe(true);
      }
    }
    expect(withRanged).toBeGreaterThan(300);
  });

  it('oranlar yaklaşık ayarlanan değerlerde; yapı türü ve yıkıklık çarpanı', () => {
    const rate = (
      fn: (k: number) => ReturnType<typeof rollBrLoot>,
      pred: (id: ItemId) => boolean,
    ) => {
      let n = 0;
      for (let k = 0; k < 4000; k++) if (fn(k).some((s) => pred(s.id))) n++;
      return n / 4000;
    };
    const weapon = rate(
      (k) => rollBrLoot(k, 1, SEED),
      (id) => WEAPONS.has(id),
    );
    expect(weapon).toBeGreaterThan(BATTLE_ROYALE.loot.weaponChance - 0.04);
    expect(weapon).toBeLessThan(BATTLE_ROYALE.loot.weaponChance + 0.04);
    const bandage = rate(
      (k) => rollBrLoot(k, 1, SEED),
      (id) => id === 'bandage',
    );
    expect(bandage).toBeGreaterThan(0.3);
    expect(bandage).toBeLessThan(0.4);
    const gov = rate(
      (k) => rollBuildingBrLoot(k, { kind: 'government', ruined: false }, SEED),
      (id) => WEAPONS.has(id),
    );
    const ruinedHouse = rate(
      (k) => rollBuildingBrLoot(k, { kind: 'house', ruined: true }, SEED),
      (id) => WEAPONS.has(id),
    );
    expect(gov).toBeGreaterThan(weapon + 0.1);
    expect(ruinedHouse).toBeLessThan(weapon - 0.1);
  });

  it('sandıkta silah kesindir', () => {
    for (let id = 0; id < 200; id++) {
      expect(crateLoot({ id, x: 0, z: 0 }, SEED).some((s) => WEAPONS.has(s.id))).toBe(true);
    }
  });

  it('ölü yarışmacının üstü: silahı ve mühimmatı; teçhizatlı olan daha çok sağlık ve zırh taşır', () => {
    const loot = contestantLoot(5, 'rifle', 0.5, SEED);
    expect(loot[0]).toEqual({ id: 'rifle', count: 1 });
    expect(loot.some((s) => s.id === 'rifle_ammo')).toBe(true);
    expect(contestantLoot(5, 'club', 0, SEED).some((s) => s.id.endsWith('ammo'))).toBe(false);
    const count = (gear: number, ids: ItemId[]) => {
      let n = 0;
      for (let c = 0; c < 1000; c++)
        n += contestantLoot(c, 'pistol', gear, SEED).filter((s) => ids.includes(s.id)).length;
      return n;
    };
    expect(count(0.9, ['first_aid_kit', 'steel_vest'])).toBeGreaterThan(
      count(0.1, ['first_aid_kit', 'steel_vest']) + 200,
    );
    expect(count(0.1, ['steel_vest'])).toBe(0);
  });
});

describe('ganimet sandıkları ve yerdeki ganimet', () => {
  const square: ProvinceShape = {
    name: 'K',
    iso: 'K',
    inRegion: true,
    polygons: [[Float64Array.from([0, 0, 1000, 0, 1000, 1000, 0, 1000])]],
    bounds: { minX: 0, minZ: 0, maxX: 1000, maxZ: 1000 },
  };
  const area = new BrArea([square], ['K'], 8, 0);
  const spots = [
    { x: 200, z: 200, radius: 40, richness: 1 },
    { x: 800, z: 700, radius: 20, richness: 0.4 },
  ];
  const open = (x: number): boolean => x < 900;

  it('sayı alanla orantılı; alanda, açık yerde, aralıklı; çoğu yerleşim yakınında', () => {
    const crates = planCrates(area, spots, createRandom(3), open);
    expect(crates).toHaveLength(Math.round(area.areaM2 / BATTLE_ROYALE.loot.crateAreaM2));
    let nearTown = 0;
    for (const [i, c] of crates.entries()) {
      expect(area.contains(c.x, c.z)).toBe(true);
      expect(open(c.x)).toBe(true);
      expect(c.id).toBe(i);
      for (const d of crates.slice(i + 1))
        expect(Math.hypot(c.x - d.x, c.z - d.z)).toBeGreaterThanOrEqual(
          BATTLE_ROYALE.loot.crateSpacing,
        );
      if (spots.some((s) => Math.hypot(c.x - s.x, c.z - s.z) <= s.radius * 1.3)) nearTown++;
    }
    expect(nearTown / crates.length).toBeGreaterThan(0.4);
    expect(planCrates(area, spots, createRandom(3), open)).toEqual(crates);
  });

  it('BrPickups: içerik ilk açılışta zarlanır ve aynı kalır; boşalan kalkar; çanta bir kez eklenir', () => {
    const pickups = new BrPickups(
      [
        { id: 0, x: 10, z: 0 },
        { id: 1, x: 3, z: 0 },
      ],
      SEED,
    );
    expect(pickups.near(0, 0, 20).map((p) => p.key)).toEqual(['crate:1', 'crate:0']);
    const list = pickups.items('crate:1')!;
    expect(list).toEqual(crateLoot({ id: 1, x: 3, z: 0 }, SEED));
    expect(pickups.items('crate:1')).toBe(list);
    list.length = 0;
    pickups.settle('crate:1');
    expect(pickups.items('crate:1')).toBeNull();
    expect(pickups.near(0, 0, 20).map((p) => p.key)).toEqual(['crate:0']);
    pickups.addDrop({ victim: 9, x: 1, z: 1, gear: 0.6 }, 'shotgun');
    pickups.addDrop({ victim: 9, x: 50, z: 50, gear: 0 }, 'club');
    expect(pickups.size).toBe(3);
    const bag = pickups.items('bag:9')!;
    expect(bag[0]).toEqual({ id: 'shotgun', count: 1 });
  });
});

describe('BuildingSearch: Battle Royale ganimet kaynağı', () => {
  const b: Building = {
    id: 77 * 1024 + 3,
    settlement: 77,
    kind: 'serender',
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
  };
  const target: SearchTarget = { type: 'door', id: b.id, building: b };

  it('takılı kaynak hayatta kalma tablosunun yerine geçer; süre çarpanı aramayı kısaltır', () => {
    const search = new BuildingSearch(new EventBus<GameEvents>(), new Inventory({ slots: 20 }));
    const opened: BuildingLoot[] = [];
    search.onLoot = (loot) => opened.push(loot);
    search.lootSource = (_t, key) => [
      { id: 'pistol', count: 1 },
      { id: 'bandage', count: key < 0 ? 2 : 1 },
    ];
    search.secondsScale = BATTLE_ROYALE.loot.searchScale;
    const seconds = SEARCH.seconds * BATTLE_ROYALE.loot.searchScale;
    for (let t = 0; t < seconds - 0.1; t += 1 / 60) search.update(1 / 60, true, target);
    expect(opened).toHaveLength(0);
    for (let t = 0; t < 0.3; t += 1 / 60) search.update(1 / 60, true, target);
    expect(opened).toHaveLength(1);
    expect(opened[0]!.items).toEqual([
      { id: 'pistol', count: 1 },
      { id: 'bandage', count: 2 },
    ]);
    // Serender hayatta kalma tablosunda tabanca/sargı yok: kaynak gerçekten değişti.
    const table = new Set(BUILDING_LOOT.serender!.map((e) => e.item));
    expect(table.has('pistol')).toBe(false);
  });
});

describe('sağlık eşyaları ve çelik yelek', () => {
  it('kısayolda "kullan" (consume) türüdür; kategori alet', () => {
    for (const id of ['bandage', 'first_aid_kit'] as const) {
      expect(isMedical(id)).toBe(true);
      expect(hotbarUse(id)).toBe('consume');
      expect(ITEMS[id].category).toBe('tool');
    }
    expect(isMedical('pistol')).toBe(false);
    expect(hotbarUse('steel_vest')).toBe('hold');
  });

  it('iyileşme sınıra kadar; sınırdaysa kullanılamaz', () => {
    expect(medicalHeal('bandage', 50)).toBe(MEDICAL.bandage.heal);
    expect(medicalHeal('bandage', 70)).toBe(MEDICAL.bandage.cap - 70);
    expect(medicalStatus('bandage', MEDICAL.bandage.cap)).toBe('full');
    expect(medicalStatus('first_aid_kit', 80)).toBe('ok');
    expect(medicalHeal('first_aid_kit', 80)).toBe(20);
  });

  it('süreli kullanım: bitince bir tane harcanır; yarıda kalan harcamaz', () => {
    const inventory = new Inventory({ slots: INVENTORY.slots });
    inventory.add('bandage', 2);
    const use = new MedicalUse(inventory);
    expect(use.start('first_aid_kit', 40)).toBe('missing');
    expect(use.start('bandage', 80)).toBe('full');
    expect(use.start('bandage', 40)).toBe('started');
    expect(use.start('bandage', 40)).toBe('busy');
    expect(use.update(MEDICAL.bandage.seconds / 2, 40)).toBeNull();
    expect(use.progress).toBeCloseTo(0.5);
    use.cancel();
    expect(inventory.count('bandage')).toBe(2);
    expect(use.start('bandage', 40)).toBe('started');
    expect(use.update(MEDICAL.bandage.seconds + 0.01, 40)).toEqual({
      item: 'bandage',
      heal: MEDICAL.bandage.heal,
    });
    expect(inventory.count('bandage')).toBe(1);
    expect(use.active).toBeNull();
    // Kullanım sürerken eşya envanterden çıkarsa boşa düşer.
    use.start('bandage', 40);
    inventory.remove('bandage', 1);
    expect(use.update(10, 40)).toBeNull();
  });

  it('yelekler toplanmaz: en iyisi geçerli; diğer giysiler eklenir', () => {
    const inv = (...ids: ItemId[]) => {
      const i = new Inventory({ slots: INVENTORY.slots });
      for (const id of ids) i.add(id, 1);
      return i;
    };
    expect(defenseFor(inv('hide_vest'))).toBeCloseTo(0.2);
    expect(defenseFor(inv('steel_vest'))).toBeCloseTo(0.35);
    expect(defenseFor(inv('hide_vest', 'steel_vest'))).toBeCloseTo(0.35);
    expect(defenseFor(inv('steel_vest', 'fur_cloak'))).toBeCloseTo(0.45);
  });

  it('hayatta kalma modunda sağlık eşyaları ve çelik yelek nadir bulunur (tablo sonunda)', () => {
    const rows = Object.values(BUILDING_LOOT).flatMap((t) => t ?? []);
    const medical = rows.filter((r) => isMedical(r.item) || r.item === 'steel_vest');
    expect(medical.length).toBeGreaterThan(5);
    for (const r of medical) expect(r.chance).toBeLessThanOrEqual(0.12);
    expect(rows.find((r) => r.item === 'steel_vest')!.chance).toBeLessThan(0.03);
  });
});
