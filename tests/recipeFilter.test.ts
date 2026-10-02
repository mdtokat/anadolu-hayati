import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/items/Inventory';
import { RECIPE_LIST, RECIPES } from '../src/items/recipes';
import {
  clampCraftCount,
  CRAFT_BATCH_MAX,
  filterRecipeRows,
  maxCraftable,
  recipeFilterCounts,
  recipeFilterOf,
  recipeRows,
} from '../src/ui/inventoryView';

describe('üretim süzgeci', () => {
  it('tarifleri çıktılarına göre gruplar', () => {
    expect(recipeFilterOf(RECIPES.stone_spear)).toBe('weapon');
    expect(recipeFilterOf(RECIPES.pistol)).toBe('weapon');
    expect(recipeFilterOf(RECIPES.arrow)).toBe('weapon');
    expect(recipeFilterOf(RECIPES.stone_axe)).toBe('tool');
    expect(recipeFilterOf(RECIPES.torch)).toBe('tool');
    expect(recipeFilterOf(RECIPES.campfire)).toBe('structure');
    expect(recipeFilterOf(RECIPES.wall)).toBe('structure');
    expect(recipeFilterOf(RECIPES.flour)).toBe('food');
    expect(recipeFilterOf(RECIPES.charcoal)).toBe('material');
  });

  it('"Tümü" her tarifi verir, gruplar toplamı tarif sayısıdır', () => {
    const rows = recipeRows(new Inventory());
    expect(filterRecipeRows(rows, 'all')).toHaveLength(RECIPE_LIST.length);
    const counts = recipeFilterCounts(rows);
    expect(counts.all).toBe(RECIPE_LIST.length);
    expect(counts.weapon + counts.tool + counts.structure + counts.food + counts.material).toBe(
      RECIPE_LIST.length,
    );
    const weapons = filterRecipeRows(rows, 'weapon');
    expect(weapons.length).toBe(counts.weapon);
    expect(weapons.every((row) => recipeFilterOf(RECIPES[row.id]) === 'weapon')).toBe(true);
  });
});

describe('üretim adedi', () => {
  it('malzemeye göre en çok adedi verir ve envanteri değiştirmez', () => {
    const inv = new Inventory();
    inv.add('stick', 10);
    inv.add('stone', 4);
    inv.add('tinder', 9);
    // Taş balta: 2 dal + 2 taş + 3 kav → taş 2 kez yeter.
    expect(maxCraftable(inv, RECIPES.stone_axe)).toBe(2);
    expect(inv.count('stone')).toBe(4);
    expect(maxCraftable(new Inventory(), RECIPES.stone_axe)).toBe(0);
  });

  it('test modunda (serbest) üst sınır yer ve sınırla belirlenir', () => {
    const free = maxCraftable(new Inventory(), RECIPES.stone_axe, {
      stations: new Set(),
      free: true,
    });
    expect(free).toBeGreaterThan(0);
    expect(free).toBeLessThanOrEqual(CRAFT_BATCH_MAX);
  });

  it('adet girişini aralığa çeker', () => {
    expect(clampCraftCount(Number.NaN, 5)).toBe(1);
    expect(clampCraftCount(0, 5)).toBe(1);
    expect(clampCraftCount(3.7, 5)).toBe(3);
    expect(clampCraftCount(99, 5)).toBe(5);
    expect(clampCraftCount(4, 0)).toBe(1);
  });
});
