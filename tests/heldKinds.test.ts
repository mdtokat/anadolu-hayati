import { describe, expect, it } from 'vitest';
import { ITEM_IDS, ITEMS } from '../src/items/itemDefs';
import { hotbarUse } from '../src/items/hotbar';
import { heldKind, isFirearm, swingStyle } from '../src/player/heldKinds';
import { recoilOffset, restPose, swingPose } from '../src/player/heldPose';
import { COMBAT_FX } from '../src/config';
import { buildHeldModel } from '../src/world/heldItemGeometry';

describe('elde tutulan eşya', () => {
  it('ateşli silahlar ateş eder, yakın silahlar etmez', () => {
    for (const id of ['pistol', 'shotgun', 'rifle', 'sniper_rifle'] as const) {
      expect(isFirearm(id)).toBe(true);
    }
    for (const id of ['pala', 'club', 'stone_axe', 'stone_spear', 'bow', 'slingshot'] as const) {
      expect(isFirearm(id)).toBe(false);
    }
    expect(isFirearm(null)).toBe(false);
  });

  it('her yakın silahın ayrı savurma biçimi vardır; silah dışı yumruktur', () => {
    expect(swingStyle('stone_spear')).toBe('thrust');
    expect(swingStyle('club')).toBe('smash');
    expect(swingStyle('stone_axe')).toBe('chop');
    expect(swingStyle('pala')).toBe('slash');
    expect(swingStyle('fist')).toBe('punch');
    expect(swingStyle(null)).toBe('punch');
    for (const style of ['slash', 'chop', 'smash', 'thrust', 'punch'] as const) {
      expect(COMBAT_FX.swing[style].seconds).toBeGreaterThan(0);
    }
  });

  it('kısayolda elde tutulan (hold) her eşyanın elde görünümü ve modeli vardır (yapılar hariç)', () => {
    for (const id of ITEM_IDS) {
      if (hotbarUse(id) !== 'hold') continue;
      const kind = heldKind(id);
      expect(kind, `${id} elde görünümsüz`).not.toBeNull();
      const model = buildHeldModel(id);
      expect(model, `${id} modeli yok`).not.toBeNull();
      expect(model!.geometry.getAttribute('position').count).toBeGreaterThan(0);
      if (kind === 'gun') expect(model!.muzzle, `${id} ağız noktası yok`).not.toBeNull();
      if (kind === 'blade' || kind === 'axe' || kind === 'blunt' || kind === 'spear') {
        expect(model!.tip, `${id} ucu yok`).not.toBeNull();
      }
      model!.geometry.dispose();
    }
    expect(ITEMS.pistol.name).toBeTruthy();
  });

  it('savurma duruşu bekleme duruşuna döner; saplamada ileri itme olur', () => {
    const rest = restPose('blade');
    const start = swingPose('slash', 0, rest);
    const end = swingPose('slash', 1, rest);
    expect(start.theta).toBeCloseTo(rest.theta, 5);
    expect(end.theta).toBeCloseTo(rest.theta, 5);
    expect(end.yaw).toBeCloseTo(0, 5);
    const mid = swingPose('thrust', 0.55, restPose('spear'));
    expect(mid.push).toBeGreaterThan(0.4);
  });

  it('tepme zamanla söner', () => {
    expect(recoilOffset(0).back).toBeGreaterThan(recoilOffset(0.5).back);
    expect(recoilOffset(1).back).toBe(0);
    expect(recoilOffset(1).pitch).toBe(0);
  });
});
