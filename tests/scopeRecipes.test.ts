import { describe, expect, it } from 'vitest';
import { RANGED } from '../src/config';
import { Inventory } from '../src/items/Inventory';
import { craft, craftStatus } from '../src/items/craft';
import { SCOPE_IDS } from '../src/items/weaponState';
import { RECIPES } from '../src/items/recipes';
import { filterRecipeRows, recipeFilterOf } from '../src/ui/inventoryView';

/** Dürbünler (kullanıcı talimatı): 2x/4x/8x/16x'in tamamı envanterde, istasyonsuz üretilir. */

describe('dürbün tarifleri', () => {
  it('her dürbünün tarifi var, istasyon/alet istemez, silah süzgecindedir', () => {
    for (const id of SCOPE_IDS) {
      const recipe = RECIPES[id];
      expect(recipe.output).toEqual({ id, count: 1 });
      expect(recipe.station, id).toBeUndefined();
      expect(recipe.tool, id).toBeUndefined();
      expect(recipeFilterOf(recipe), id).toBe('weapon');
    }
    expect(filterRecipeRows(SCOPE_IDS.map((id) => ({ id })) as never, 'weapon')).toHaveLength(
      SCOPE_IDS.length,
    );
  });

  it('büyütme arttıkça girdi maliyeti artar', () => {
    const cost = (id: (typeof SCOPE_IDS)[number]): number =>
      RECIPES[id].inputs.reduce((sum, s) => sum + s.count, 0);
    const byZoom = [...SCOPE_IDS].sort((a, b) => RANGED.scopes[a].zoom - RANGED.scopes[b].zoom);
    for (let i = 1; i < byZoom.length; i++) {
      expect(cost(byZoom[i]!)).toBeGreaterThan(cost(byZoom[i - 1]!));
    }
  });

  it('malzemeyle envanterde üretilir (istasyon yokken); eksikse üretilmez', () => {
    for (const id of SCOPE_IDS) {
      const recipe = RECIPES[id];
      const inv = new Inventory();
      expect(craftStatus(inv, recipe).ok, id).toBe(false);
      for (const input of recipe.inputs) inv.add(input.id, input.count);
      expect(craftStatus(inv, recipe).ok, id).toBe(true);
      expect(craft(inv, recipe).ok, id).toBe(true);
      expect(inv.count(id)).toBe(1);
    }
  });
});
