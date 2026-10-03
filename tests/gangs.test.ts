import { describe, expect, it } from 'vitest';
import { GANGS } from '../src/config';
import {
  GANG_ID_BASE,
  gangHours,
  gangMemberId,
  gangFactionsPresent,
  gangPresent,
  gangRoster,
  gangSpot,
  placeGangSites,
  type GangSite,
  type GangSiteQuery,
} from '../src/bandits/gangs';

/** (0, 0) çevresinde x ekseni boyunca 200 m'lik bir cadde; binalar z > 6 tarafında. */
function query(over: Partial<GangSiteQuery> = {}): GangSiteQuery {
  return {
    centers: [
      { id: 11, name: 'Deneme', x: 0, z: 0, radius: 120 },
      { id: 12, name: 'Sokaksız', x: 5000, z: 5000, radius: 100 },
    ],
    onStreet: (x, z) => Math.abs(z) < 2.5 && Math.abs(x) < 100,
    open: (_x, z) => z < 6,
    ...over,
  };
}

describe('placeGangSites', () => {
  const sites = placeGangSites(query());

  it('cadde bulunan merkezde iki rakip nokta seçer, caddesiz merkezi atlar', () => {
    expect(sites).toHaveLength(1);
    const site = sites[0] as GangSite;
    expect(site.id).toBe(11);
    for (const p of [site.a, site.b]) expect(Math.abs(p.z)).toBeLessThan(2.5 + 1e-9);
    const gap = Math.hypot(site.a.x - site.b.x, site.a.z - site.b.z);
    expect(gap).toBeGreaterThanOrEqual(GANGS.pairDistance[0] - 3);
    expect(gap).toBeLessThanOrEqual(GANGS.pairDistance[1] + 3);
  });

  it('çoğu merkezde üçüncü çete noktası da bulunur (cadde yeterince uzunsa)', () => {
    const site = sites[0] as GangSite;
    expect(site.c).toBeDefined();
    const gapAC = Math.hypot(site.a.x - site.c!.x, site.a.z - site.c!.z);
    const gapBC = Math.hypot(site.b.x - site.c!.x, site.b.z - site.c!.z);
    expect(gapAC).toBeGreaterThanOrEqual(GANGS.pairDistance[0] - 3);
    expect(gapBC).toBeGreaterThanOrEqual(GANGS.pairDistance[0] - 1e-9);
    expect(gangSpot(site, 2)).toEqual(site.c);
  });

  it('deterministik: aynı girdi aynı yerleri verir', () => {
    expect(placeGangSites(query())).toEqual(sites);
  });

  it('binaya girmeyen nokta seçilir (open reddederse çete yeri yok)', () => {
    expect(placeGangSites(query({ open: () => false }))).toHaveLength(0);
  });
});

describe('gün, saat ve kadro', () => {
  const site = placeGangSites(query())[0] as GangSite;

  it('bazı günler çete var, bazıları yok (olasılık civarı) ve deterministik', () => {
    const days = Array.from({ length: 400 }, (_, d) => gangPresent(site, d));
    const share = days.filter(Boolean).length / days.length;
    expect(share).toBeGreaterThan(GANGS.presenceChance - 0.12);
    expect(share).toBeLessThan(GANGS.presenceChance + 0.12);
    expect(days).toEqual(Array.from({ length: 400 }, (_, d) => gangPresent(site, d)));
  });

  it('saat aralığı', () => {
    expect(gangHours(GANGS.hours[0])).toBe(true);
    expect(gangHours(GANGS.hours[1])).toBe(false);
    expect(gangHours(3)).toBe(false);
  });

  it('çete sayısı hep iki değil: 1, 2 ve 3 çete de çıkar; seçim deterministik ve noktası olanlarla sınırlı', () => {
    const counts = new Map<number, number>();
    for (let d = 0; d < 600; d++) {
      const present = gangFactionsPresent(site, d);
      counts.set(present.length, (counts.get(present.length) ?? 0) + 1);
      expect(present).toEqual(gangFactionsPresent(site, d));
      expect(new Set(present).size).toBe(present.length);
      for (const f of present) expect(gangSpot(site, f)).not.toBeNull();
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3]);
    // Üçüncü noktası olmayan yerde en çok iki çete.
    const two: GangSite = { ...site };
    delete two.c;
    for (let d = 0; d < 200; d++) {
      expect(gangFactionsPresent(two, d).length).toBeLessThanOrEqual(2);
      expect(gangFactionsPresent(two, d)).not.toContain(2);
    }
  });

  it('çete başına üye sayısı değişir (1–6) ve sınırlar içinde kalır', () => {
    const sizes = new Set<number>();
    for (let d = 0; d < 300; d++) {
      for (const f of [0, 1, 2] as const) {
        const n = gangRoster(site, d, f).length;
        expect(n).toBeGreaterThanOrEqual(GANGS.members[0]);
        expect(n).toBeLessThanOrEqual(GANGS.members[1]);
        sizes.add(n);
      }
    }
    expect(sizes.size).toBeGreaterThanOrEqual(5);
  });

  it('kadro: sayı aralıkta, ilk üye reis, silahlar tanımlı ve çeteler farklı', () => {
    for (const faction of [0, 1, 2] as const) {
      const roster = gangRoster(site, 5, faction);
      expect(roster.length).toBeGreaterThanOrEqual(GANGS.members[0]);
      expect(roster.length).toBeLessThanOrEqual(GANGS.members[1]);
      expect(roster[0]?.role).toBe('leader');
      expect(roster.slice(1).every((m) => m.role === 'member')).toBe(true);
      const spot = gangSpot(site, faction)!;
      expect(roster[0]?.x).toBe(spot.x);
      for (const m of roster) {
        expect(Math.hypot(m.x - spot.x, m.z - spot.z)).toBeLessThanOrEqual(GANGS.spread + 1e-9);
      }
    }
    expect(gangRoster(site, 5, 0)).toEqual(gangRoster(site, 5, 0));
  });

  it('üye kimlikleri kamp/serbest eşkıya aralığının dışında ve tekil', () => {
    const ids = new Set<number>();
    for (let site = 0; site < 3; site++) {
      for (const faction of [0, 1, 2] as const) {
        for (let i = 0; i < GANGS.members[1]; i++) {
          const id = gangMemberId(site, faction, i);
          expect(id).toBeGreaterThanOrEqual(GANG_ID_BASE);
          ids.add(id);
        }
      }
    }
    expect(ids.size).toBe(3 * 3 * GANGS.members[1]);
    expect(GANG_ID_BASE).toBeGreaterThan(2 ** 40);
  });
});
