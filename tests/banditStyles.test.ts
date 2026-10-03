import { describe, expect, it } from 'vitest';
import { CAMP_STYLES, GANG_STYLES, campStyle, gangStyle, isGangStyle } from '../src/bandits/styles';
import { buildBanditGeometry } from '../src/world/banditGeometry';

describe('eşkıya çeşitleri', () => {
  it('kamp: silaha göre çeşit çıkar, nişancı tüfeği nişancıdır, hepsi kamp çeşididir', () => {
    const seen = new Set<string>();
    for (let id = 1; id <= 400; id++) {
      for (const weapon of ['pala', 'club', 'pistol', 'shotgun', 'rifle'] as const) {
        const style = campStyle(id, weapon, id % 5 === 0 ? 'leader' : 'member');
        expect(CAMP_STYLES).toContain(style);
        seen.add(style);
      }
      expect(campStyle(id, 'sniper_rifle', 'leader')).toBe('marksman');
    }
    expect([...seen].sort()).toEqual([...CAMP_STYLES].sort());
  });

  it('sokak çetesi: hepsi çete çeşididir ve dördü de çıkar; deterministik', () => {
    const seen = new Set<string>();
    for (let id = 1; id <= 400; id++) {
      const style = gangStyle(id, id % 2 ? 'pistol' : 'club', id % 7 === 0 ? 'leader' : 'member');
      expect(GANG_STYLES).toContain(style);
      expect(isGangStyle(style)).toBe(true);
      seen.add(style);
    }
    expect(seen.size).toBe(GANG_STYLES.length);
    expect(gangStyle(9, 'pistol', 'member')).toBe(gangStyle(9, 'pistol', 'member'));
  });

  it('her çeşidin ayrı, geçerli bir modeli vardır', () => {
    const sizes = new Map<string, number>();
    for (const style of CAMP_STYLES) {
      const g = buildBanditGeometry('member', 'pistol', -1, style);
      expect(g.body.getAttribute('position').count).toBeGreaterThan(0);
      sizes.set(style, g.body.getAttribute('position').count);
    }
    for (const faction of [0, 1, 2]) {
      for (const style of GANG_STYLES) {
        const g = buildBanditGeometry('leader', 'rifle', faction, style);
        expect(g.body.getAttribute('position').count).toBeGreaterThan(0);
      }
    }
    // Çeşitler birbirinin aynısı değildir (farklı parça sayısı).
    expect(new Set(sizes.values()).size).toBeGreaterThan(2);
  });
});
