import { describe, expect, it } from 'vitest';
import { canCraft, craft, craftStatus } from '../src/items/craft';
import { Inventory } from '../src/items/Inventory';
import { ITEM_IDS, ITEMS, type ItemId } from '../src/items/itemDefs';
import { RECIPE_LIST, RECIPES, type Recipe } from '../src/items/recipes';
import { createRandom } from '../src/utils/random';

/** Tarifin girdilerini (ve aletini) envantere koyar. */
function stocked(recipeId: keyof typeof RECIPES, extra = 0): Inventory {
  const inv = new Inventory();
  const r = RECIPES[recipeId];
  for (const { id, count } of r.inputs) inv.add(id, count + extra);
  if (r.tool) inv.add(r.tool, 1);
  return inv;
}

describe('craft: başarılı üretim', () => {
  it.each(RECIPE_LIST.map((r) => [r.id]))('%s: girdiler düşer, çıktı eklenir', (id) => {
    const r = RECIPES[id as keyof typeof RECIPES];
    const inv = stocked(r.id);
    expect(canCraft(inv, r)).toBe(true);
    const result = craft(inv, r);
    expect(result).toEqual({ ok: true, output: r.output });
    for (const { id: item } of r.inputs) expect(inv.count(item), item).toBe(0);
    expect(inv.count(r.output.id)).toBe(r.output.count);
    if (r.tool) expect(inv.count(r.tool), 'alet tüketilmez').toBe(1);
  });

  it('fazla malzeme kalır; çıktı dönüş değeri tarifin kopyasıdır', () => {
    const r = RECIPES.stone_axe;
    const inv = stocked('stone_axe', 3);
    const result = craft(inv, r);
    expect(inv.count('stick')).toBe(3);
    if (!result.ok) throw new Error('üretim başarısız');
    result.output.count = 99;
    expect(r.output.count).toBe(1);
  });

  it('art arda üretim: iki su kabı ayrı slotlara girer, üçüncüsü malzeme yetersizliğinden olmaz', () => {
    const r = RECIPES.water_container;
    const inv = new Inventory();
    inv.add('bark', 12);
    inv.add('tinder', 2);
    expect(craft(inv, r).ok).toBe(true);
    expect(craft(inv, r).ok).toBe(true);
    expect(inv.count('water_container_empty')).toBe(2);
    expect(inv.slots.filter((x) => x?.id === 'water_container_empty')).toHaveLength(2);
    expect(craftStatus(inv, r)).toMatchObject({ ok: false, reason: 'missing_inputs' });
  });
});

describe('craftStatus: başarısızlık nedenleri', () => {
  it('alet eksikse missing_tool (malzeme tam olsa bile)', () => {
    const inv = new Inventory();
    for (const { id, count } of RECIPES.lean_to.inputs) inv.add(id, count);
    const status = craftStatus(inv, RECIPES.lean_to);
    expect(status).toEqual({
      ok: false,
      reason: 'missing_tool',
      missing: [{ id: 'stone_axe', count: 1 }],
    });
  });

  it('malzeme eksikse missing_inputs ve yalnızca eksik adetler', () => {
    const inv = new Inventory();
    inv.add('stick', 1);
    inv.add('stone', 2);
    const status = craftStatus(inv, RECIPES.stone_axe);
    expect(status).toEqual({
      ok: false,
      reason: 'missing_inputs',
      missing: [
        { id: 'stick', count: 1 },
        { id: 'tinder', count: 3 },
      ],
    });
  });

  it('boş envanterde ilk eksik alet olur; alet varken malzeme listelenir', () => {
    const inv = new Inventory();
    expect(craftStatus(inv, RECIPES.lean_to).ok).toBe(false);
    inv.add('stone_axe', 1);
    const status = craftStatus(inv, RECIPES.lean_to);
    expect(status.ok).toBe(false);
    if (!status.ok) {
      expect(status.reason).toBe('missing_inputs');
      expect(status.missing).toHaveLength(3);
    }
  });

  it('girdiler bir slotu tamamen boşaltıyorsa çıktı o slota sığar', () => {
    const inv = new Inventory({ slots: 3, maxWeightG: 25_000 });
    inv.add('stick', 2);
    inv.add('stone', 2);
    inv.add('tinder', 3);
    expect(craftStatus(inv, RECIPES.stone_axe).ok).toBe(true);
    expect(craft(inv, RECIPES.stone_axe).ok).toBe(true);
    expect(inv.count('stone_axe')).toBe(1);
  });

  it('slotlar dolu kalıyorsa (yığınlarda artan malzeme) no_space; envanter değişmez', () => {
    // Her girdi kendi yığınında artıyor: hiçbir slot boşalmaz, çıktıya slot kalmaz.
    const inv = new Inventory({ slots: 3, maxWeightG: 25_000 });
    inv.add('stick', 20);
    inv.add('stone', 10);
    inv.add('tinder', 30);
    const before = JSON.stringify(inv.toJSON());
    const version = inv.version;
    expect(craftStatus(inv, RECIPES.stone_axe)).toEqual({
      ok: false,
      reason: 'no_space',
      missing: [],
    });
    expect(craft(inv, RECIPES.stone_axe).ok).toBe(false);
    expect(JSON.stringify(inv.toJSON())).toBe(before);
    expect(inv.version).toBe(version);
    expect(inv.count('stone_axe')).toBe(0);
  });

  it('ağırlık sınırı çıktıyı engelliyorsa no_space (girdiden ağır çıktılı özel tarif)', () => {
    const heavy: Recipe = {
      id: 'stone_axe',
      name: 'Deneme',
      inputs: [{ id: 'tinder', count: 1 }],
      output: { id: 'log', count: 1 }, // 3000 g
    };
    const inv = new Inventory({ slots: 5, maxWeightG: 3000 });
    inv.add('tinder', 1);
    inv.add('stone', 5); // 2500 g → 2530 g; kav çıkınca 2500 + 3000 > 3000
    expect(craftStatus(inv, heavy).ok).toBe(false);
    expect(craftStatus(inv, heavy)).toMatchObject({ reason: 'no_space' });
    const before = JSON.stringify(inv.toJSON());
    expect(craft(inv, heavy).ok).toBe(false);
    expect(JSON.stringify(inv.toJSON())).toBe(before);

    inv.remove('stone', 5); // yer açılınca yapılır
    expect(craft(inv, heavy).ok).toBe(true);
    expect(inv.count('log')).toBe(1);
  });
});

describe('craft: atomiklik ve değişmezler', () => {
  it('başarısız üretim envanteri, sürümü ve ağırlığı değiştirmez', () => {
    const inv = new Inventory();
    inv.add('stick', 1);
    const before = JSON.stringify(inv.toJSON());
    const version = inv.version;
    const result = craft(inv, RECIPES.stone_axe);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(inv.toJSON())).toBe(before);
    expect(inv.version).toBe(version);
  });

  it('craftStatus envanteri değiştirmez (yer denetimi kopya üzerinde)', () => {
    const inv = stocked('campfire');
    const version = inv.version;
    const before = JSON.stringify(inv.toJSON());
    craftStatus(inv, RECIPES.campfire);
    expect(inv.version).toBe(version);
    expect(JSON.stringify(inv.toJSON())).toBe(before);
  });

  it.each([1, 2, 3])('seed %i: rastgele envanterlerde eşya korunumu ve sınırlar', (seed) => {
    const rnd = createRandom(seed);
    const materials = ITEM_IDS.filter((id) => ITEMS[id].category === 'material');
    for (let round = 0; round < 200; round++) {
      const inv = new Inventory({ slots: rnd.int(3, 12), maxWeightG: rnd.int(2000, 25_000) });
      for (let k = 0; k < 10; k++) {
        inv.add(materials[rnd.int(0, materials.length - 1)] as ItemId, rnd.int(0, 12));
      }
      if (rnd.next() < 0.5) inv.add('stone_axe', 1);

      const recipe = RECIPE_LIST[rnd.int(0, RECIPE_LIST.length - 1)]!;
      const counts = new Map(ITEM_IDS.map((id) => [id, inv.count(id)]));
      const status = craftStatus(inv, recipe);
      const result = craft(inv, recipe);
      expect(result.ok, `tutarlılık`).toBe(status.ok);

      if (result.ok) {
        for (const id of ITEM_IDS) {
          const consumed = recipe.inputs.find((i) => i.id === id)?.count ?? 0;
          const produced = recipe.output.id === id ? recipe.output.count : 0;
          expect(inv.count(id), id).toBe((counts.get(id) ?? 0) - consumed + produced);
        }
      } else {
        for (const id of ITEM_IDS) expect(inv.count(id), id).toBe(counts.get(id));
      }
      expect(inv.totalWeightG).toBeLessThanOrEqual(inv.maxWeightG);
    }
  });
});
