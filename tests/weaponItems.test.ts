import { describe, expect, it } from 'vitest';
import { CarcassButcher } from '../src/combat/carcass';
import { bestWeapon, isWeapon } from '../src/combat/melee';
import { butcherPrompt } from '../src/combat/promptText';
import { AMMO, COMBAT, LOOT, RANGED } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import { hotbarUse } from '../src/items/hotbar';
import { Inventory } from '../src/items/Inventory';
import { ITEMS, type ItemId } from '../src/items/itemDefs';
import { RECIPE_LIST, RECIPES } from '../src/items/recipes';
import { WEAPON_IDS } from '../src/items/weaponState';
import { BUILDING_LOOT } from '../src/settlements/loot';
import { ITEM_ICONS } from '../src/ui/icons';

/** Faz 11.5: silahlar hem üretilir hem ganimetten çıkar; yakın silahlar, mühimmat, simgeler. */

const D_WEAPONS: readonly ItemId[] = [
  'club',
  'iron_dagger',
  'pala',
  'slingshot',
  'bow',
  'shotgun',
  'pistol',
  'rifle',
  'sniper_rifle',
];
const D_AMMO: readonly ItemId[] = ['arrow', 'shotgun_shell', 'pistol_ammo', 'rifle_ammo'];

const lootItems = new Set<ItemId>(
  Object.values(BUILDING_LOOT).flatMap((rows) => (rows ?? []).map((r) => r.item)),
);

describe('silahlar: tarif ve ganimet', () => {
  it('her silah ve mühimmat hem bir tarifle üretilir hem bir yapının ganimetinden çıkar', () => {
    for (const id of [...D_WEAPONS, ...D_AMMO, 'gunpowder' as const]) {
      expect(
        RECIPE_LIST.some((r) => r.output.id === id),
        `${id} tarifi`,
      ).toBe(true);
      expect(lootItems.has(id), `${id} ganimeti`).toBe(true);
    }
  });

  it('keskin nişancı tüfeği dürbün ister; dürbün hem üretilir hem ganimetten çıkar', () => {
    expect(RECIPES.sniper_rifle.inputs.some((s) => s.id === 'scope')).toBe(true);
    expect(RECIPE_LIST.some((r) => r.output.id === 'scope')).toBe(true);
    expect(lootItems.has('scope')).toBe(true);
  });

  it('ateşli silahlar ve mühimmat demirci ocağında; sapan ve sopa istasyonsuz', () => {
    for (const id of [
      'shotgun',
      'pistol',
      'rifle',
      'sniper_rifle',
      'pala',
      'iron_dagger',
    ] as const) {
      expect(RECIPES[id].station, id).toBe('forge');
    }
    for (const id of ['shotgun_shell', 'pistol_ammo', 'rifle_ammo', 'gunpowder'] as const) {
      expect(RECIPES[id].station, id).toBe('forge');
    }
    expect(RECIPES.slingshot.station).toBeUndefined();
    expect(RECIPES.club.station).toBeUndefined();
  });

  it('mühimmat ganimet satırları AMMO.lootCount aralığını kullanır', () => {
    for (const rows of Object.values(BUILDING_LOOT)) {
      for (const row of rows ?? []) {
        if (!(row.item in AMMO.lootCount)) continue;
        const [min, max] = AMMO.lootCount[row.item as keyof typeof AMMO.lootCount];
        expect([row.min, row.max], row.item).toEqual([min, max]);
      }
    }
  });
});

describe('silahlar: kullanım', () => {
  it('menzilli silahlar elde tutulur; mühimmatları envanter eşyasıdır', () => {
    for (const id of WEAPON_IDS) {
      expect(hotbarUse(id), id).toBe('hold');
      expect(ITEMS[RANGED.weapons[id].ammo].category, id).toBe('material');
    }
    expect(RANGED.weapons.slingshot.ammo).toBe('stone');
  });

  it('yakın silahlar COMBAT.weapons’ta; pala en güçlü yakın silahtır', () => {
    for (const id of ['club', 'iron_dagger', 'pala'] as const) {
      expect(isWeapon(id), id).toBe(true);
      expect(COMBAT.weapons[id].damage).toBeGreaterThan(COMBAT.weapons.fist.damage);
    }
    const inv = new Inventory();
    inv.add('stone_spear', 1);
    inv.add('pala', 1);
    expect(bestWeapon(inv)).toBe('pala');
    // Menzilli silahlar yakın dövüşte en iyi silah seçilmez.
    expect(isWeapon('rifle')).toBe(false);
  });

  it('demir kama bıçak hızında, pala balta hızında leş keser', () => {
    const events = new EventBus<GameEvents>();
    const inv = new Inventory();
    const butcher = new CarcassButcher(events, inv, new CreatureSystem(events));
    const view = { id: 1, kind: 'roe_deer' as const, dead: true };
    inv.add('pala', 1);
    expect(butcher.inspect(view)).toMatchObject({ seconds: LOOT.butcherSecondsAxe, tool: 'pala' });
    expect(butcherPrompt(butcher.inspect(view)!)).toContain('palayla');
    inv.add('iron_dagger', 1);
    expect(butcher.inspect(view)).toMatchObject({
      seconds: LOOT.butcherSecondsKnife,
      tool: 'iron_dagger',
    });
  });

  it('silah ve mühimmat simgeleri yer tutucu değil (her biri ayrı çizim)', () => {
    const icons = [...D_WEAPONS, ...D_AMMO, 'scope' as const, 'gunpowder' as const].map(
      (id) => ITEM_ICONS[id],
    );
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('en ağır silah tek başına envantere sığar', () => {
    for (const id of D_WEAPONS) expect(ITEMS[id].weightG).toBeLessThan(10_000);
  });
});
