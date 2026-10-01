import { describe, expect, it } from 'vitest';
import { COMBAT, EQUIPMENT, LOOT, SHELTER_EFFECTS, SURVIVAL } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CarcassButcher } from '../src/combat/carcass';
import { defenseFor } from '../src/combat/damage';
import { activeWeapon, bestWeapon } from '../src/combat/melee';
import { butcherPrompt } from '../src/combat/promptText';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import { clothingWarmth, torchLit } from '../src/items/equipment';
import { Inventory } from '../src/items/Inventory';
import { exposureAt, isUnderShelter } from '../src/placement/exposure';
import { StructureSet } from '../src/placement/structures';
import { bodyTempEquilibrium, initialVitals, stepVitals } from '../src/survival/vitals';

describe('silah seçimi (kısayol)', () => {
  it('elde silah varsa o, yoksa en iyisi; envanterde olmayan elde silah sayılmaz', () => {
    const inv = new Inventory();
    inv.add('stone_spear', 1);
    inv.add('bone_knife', 1);
    expect(bestWeapon(inv)).toBe('stone_spear');
    expect(activeWeapon(inv, null)).toBe('stone_spear');
    expect(activeWeapon(inv, 'bone_knife')).toBe('bone_knife');
    expect(activeWeapon(inv, 'torch')).toBe('stone_spear');
    expect(activeWeapon(inv, 'stone_axe')).toBe('stone_spear'); // elde ama envanterde yok
    expect(COMBAT.weapons.bone_knife.damage).toBeLessThan(COMBAT.weapons.stone_axe.damage);
  });
});

describe('giysi ve meşale', () => {
  it('kürk pelerin ısıtır ve biraz korur; üst sınırlar', () => {
    const inv = new Inventory();
    expect(clothingWarmth(inv)).toBe(0);
    inv.add('fur_cloak', 1);
    expect(clothingWarmth(inv)).toBe(EQUIPMENT.clothingWarmthC.fur_cloak);
    inv.add('hide_vest', 1);
    expect(defenseFor(inv)).toBeCloseTo(COMBAT.defense.hide_vest + COMBAT.defense.fur_cloak, 9);
    expect(defenseFor(inv)).toBeLessThanOrEqual(COMBAT.maxDefense);
  });

  it('pelerin soğukta denge ısısını yükseltir ama normal ısının üstüne çıkarmaz', () => {
    const cold = bodyTempEquilibrium(-5, 'rest');
    const warm = bodyTempEquilibrium(-5, 'rest', EQUIPMENT.clothingWarmthC.fur_cloak);
    expect(warm).toBeCloseTo(cold + EQUIPMENT.clothingWarmthC.fur_cloak, 9);
    expect(bodyTempEquilibrium(20, 'rest', 10)).toBeLessThanOrEqual(
      SURVIVAL.bodyTempNormalC + 1e-9,
    );
  });

  it('meşale yalnızca elde (seçili) ve envanterdeyken yanar', () => {
    const inv = new Inventory();
    expect(torchLit(inv, 'torch')).toBe(false);
    inv.add('torch', 1);
    expect(torchLit(inv, 'torch')).toBe(true);
    expect(torchLit(inv, null)).toBe(false);
    expect(torchLit(inv, 'stone_axe')).toBe(false);
  });
});

describe('kemik bıçakla leş kesme', () => {
  it('bıçak baltadan hızlıdır ve ipucunda söylenir', () => {
    const events = new EventBus<GameEvents>();
    const inv = new Inventory();
    const butcher = new CarcassButcher(events, inv, new CreatureSystem(events));
    const view = { id: 1, kind: 'roe_deer' as const, dead: true };
    expect(butcher.inspect(view)?.seconds).toBe(LOOT.butcherSeconds);
    inv.add('stone_axe', 1);
    expect(butcher.inspect(view)).toMatchObject({ seconds: LOOT.butcherSecondsAxe, withAxe: true });
    inv.add('bone_knife', 1);
    const offer = butcher.inspect(view);
    expect(offer).toMatchObject({ seconds: LOOT.butcherSecondsKnife, tool: 'bone_knife' });
    expect(LOOT.butcherSecondsKnife).toBeLessThan(LOOT.butcherSecondsAxe);
    expect(offer && butcherPrompt(offer)).toContain('bıçakla');
  });
});

describe('ahşap kulübe barınağı', () => {
  it('kulübe içi barınaktır; kulübe sundurmadan iyidir ve öncelik alır', () => {
    const set = new StructureSet();
    const hut = set.add('wooden_hut', 0, 0, 0, 0.7);
    expect(isUnderShelter(hut, 0, 0, 0)).toBe(true);
    expect(isUnderShelter(hut, 0, 5, 0)).toBe(false); // çok yukarıda
    expect(isUnderShelter(hut, 3, 0, 3)).toBe(false);
    expect(exposureAt(set, 0.5, 0, 0.5)).toEqual({ warmthC: 0, sheltered: true, shelter: 'hut' });
    expect(SHELTER_EFFECTS.hut.coldFactor).toBeLessThan(SHELTER_EFFECTS.shelter.coldFactor);
    expect(SHELTER_EFFECTS.hut.restRefillFactor).toBeGreaterThan(
      SHELTER_EFFECTS.shelter.restRefillFactor,
    );
  });

  it('soğuk gecede kulübede vücut ısısı sundurmadakinden yüksek kalır', () => {
    const lean = bodyTempEquilibrium(-5, 'rest', 0, true, 'lean_to');
    const hut = bodyTempEquilibrium(-5, 'rest', 0, true, 'hut');
    const open = bodyTempEquilibrium(-5, 'rest');
    expect(hut).toBeGreaterThan(lean);
    expect(lean).toBeGreaterThan(open);
    // Dinlenirken enerji kulübede daha hızlı dolar.
    const tired = { ...initialVitals(), energy: 20 };
    const inLean = stepVitals(tired, { activity: 'rest', ambientC: 15, sheltered: true }, 10);
    const inHut = stepVitals(
      tired,
      { activity: 'rest', ambientC: 15, sheltered: true, shelter: 'hut' },
      10,
    );
    expect(inHut.state.energy).toBeGreaterThan(inLean.state.energy);
  });
});
