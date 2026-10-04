import { beforeAll, describe, expect, it } from 'vitest';
import {
  BrArea,
  isConnectedSelection,
  provinceAdjacency,
  targetProvinces,
  type Adjacency,
} from '../src/battleRoyale/area';
import { defaultSetup, type BrSetup } from '../src/battleRoyale/kinds';
import { planMatch, type MatchWorld } from '../src/battleRoyale/plan';
import { zoneAt } from '../src/battleRoyale/zone';
import type { RegionData } from '../src/data/region';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealWorld } from './helpers/realRegion';

/**
 * Battle Royale çekirdeği gerçek dünyada (BR.1): il komşuluğu, her il ve tüm harita için alan, bölge planı ve
 * 100 kişilik başlangıç dağılımı.
 */

let world: RegionData;
let source: RegionHeightSource;
let adjacency: Adjacency;
let names: string[];
let matchWorld: MatchWorld;

const land = (x: number, z: number): boolean =>
  source.contains(x, z) && source.elevationAt(x, z) >= 1 && source.slopeDegAt(x, z) <= 40;

beforeAll(async () => {
  world = await loadRealWorld();
  source = RegionHeightSource.fromRegion(world);
  const targets = targetProvinces(world.provinces);
  names = targets.map((p) => p.name);
  adjacency = provinceAdjacency(targets);
  matchWorld = { provinces: world.provinces, spawnOpen: land, zoneCenterOk: land };
}, 60_000);

/** Gerçek sınır komşulukları (il sınırlarından; kara sınırı paylaşanlar). */
const KNOWN_NEIGHBORS: Array<[string, string]> = [
  ['Zonguldak', 'Bartın'],
  ['Zonguldak', 'Karabük'],
  ['Zonguldak', 'Düzce'],
  ['Zonguldak', 'Bolu'],
  ['Bartın', 'Kastamonu'],
  ['Karabük', 'Kastamonu'],
  ['Karabük', 'Çankırı'],
  ['Düzce', 'Sakarya'],
  ['Kocaeli', 'Sakarya'],
  ['Bilecik', 'Sakarya'],
  ['Bolu', 'Ankara'],
  ['Ankara', 'Kırıkkale'],
  ['Ankara', 'Çankırı'],
  ['Kastamonu', 'Sinop'],
  ['Sinop', 'Samsun'],
  ['Samsun', 'Amasya'],
  ['Amasya', 'Çorum'],
  ['Çorum', 'Kırıkkale'],
];
const NOT_NEIGHBORS: Array<[string, string]> = [
  ['Zonguldak', 'Kastamonu'],
  ['Kocaeli', 'Düzce'],
  ['Kocaeli', 'Ankara'],
  ['Bartın', 'Bolu'],
  ['Samsun', 'Kastamonu'],
  ['Ankara', 'Çorum'],
];

describe('il komşuluğu (gerçek sınırlar)', () => {
  it('bilinen komşular komşu, bilinen komşu olmayanlar değil', () => {
    for (const [a, b] of KNOWN_NEIGHBORS) {
      expect(adjacency.get(a)?.has(b), `${a}–${b}`).toBe(true);
      expect(adjacency.get(b)?.has(a), `${b}–${a}`).toBe(true);
    }
    for (const [a, b] of NOT_NEIGHBORS) expect(adjacency.get(a)?.has(b), `${a}–${b}`).toBe(false);
  });

  it('16 hedef ilin hepsi bağlı (tüm harita tek parça), her ilin en az bir komşusu var', () => {
    expect(names).toHaveLength(16);
    expect(isConnectedSelection(names, adjacency)).toBe(true);
    for (const n of names) expect(adjacency.get(n)!.size, n).toBeGreaterThan(0);
  });
});

describe('alan', () => {
  it('her il merkezi kendi ilinin alanında; başka ilin alanında değil', () => {
    const centers = (world.settlements?.settlements ?? []).filter((s) => s.rank === 'il');
    expect(centers.length).toBeGreaterThanOrEqual(16);
    for (const name of names) {
      const area = new BrArea(world.provinces, [name]);
      for (const c of centers) {
        if (!names.includes(c.province)) continue;
        expect(area.contains(c.x, c.z), `${c.name} (${c.province}) in ${name}`).toBe(
          c.province === name,
        );
      }
    }
  });

  it('tüm harita = 16 ilin alan toplamı', () => {
    const all = new BrArea(world.provinces, names);
    const sum = names.reduce((acc, n) => acc + new BrArea(world.provinces, [n], 8, 0).areaM2, 0);
    // Kıyı tamponu ve sınır hücreleri yüzünden küçük fark.
    expect(Math.abs(all.areaM2 - sum) / sum).toBeLessThan(0.03);
  });
});

/** Kurulum: il seçimi ya da tüm harita, 100 kişi. */
function setupFor(provinces: string[] | null, shrinkMinutes = 4): BrSetup {
  return {
    ...defaultSetup(),
    area: provinces ? { kind: 'provinces', names: provinces } : { kind: 'world' },
    players: 100,
    shrinkMinutes,
  };
}

describe('maç planı (gerçek dünya)', () => {
  function checkPlan(setup: BrSetup, seed: number): { total: number } {
    const plan = planMatch(setup, seed, matchWorld);
    expect(plan.spawns).toHaveLength(setup.players);
    for (const s of plan.spawns) {
      expect(plan.area.contains(s.x, s.z)).toBe(true);
      expect(land(s.x, s.z)).toBe(true);
    }
    for (const [i, p] of plan.zone.phases.entries()) {
      if (i === plan.zone.phases.length - 1) continue; // son daire noktaya kapanır
      expect(plan.area.contains(p.to.x, p.to.z)).toBe(true);
      expect(land(p.to.x, p.to.z)).toBe(true);
    }
    // Son güvenli daire karada ve alanda kalan bir noktaya kapanır.
    const last = zoneAt(plan.zone, plan.zone.total + 1).circle;
    expect(plan.area.contains(last.x, last.z)).toBe(true);
    expect(plan.match.total).toBe(setup.players);
    return { total: plan.zone.total };
  }

  it('her il tek başına: 100 kişi sığar, bölge karada; 4 dk aralıkla 28–40 dk', () => {
    for (const [i, name] of names.entries()) {
      const { total } = checkPlan(setupFor([name]), 100 + i);
      // 7 aşama × 4 dk; hız sınırı yalnız büyük illerde biraz uzatır.
      expect(total / 60, name).toBeGreaterThanOrEqual(28 - 1e-6);
      expect(total / 60, name).toBeLessThan(40);
    }
  });

  it('bağlı il grubu (Zonguldak + Bartın + Karabük) ve tüm harita', () => {
    checkPlan(setupFor(['Zonguldak', 'Bartın', 'Karabük']), 7);
    const { total } = checkPlan(setupFor(null), 8);
    // Tüm haritada sınır hızı sınırı (6 m/sn) aşamaları 4 dk'dan (toplam 28 dk) uzatır.
    expect(total / 60).toBeGreaterThan(28);
    expect(total / 60).toBeLessThan(75);
    // Aralık tüm haritada da etkili: 2 dk seçimi daha kısa maç verir (hız sınırı altında kalarak).
    expect(checkPlan(setupFor(null, 2), 8).total).toBeLessThan(total);
  });

  it('aynı tohum aynı plan', () => {
    const a = planMatch(setupFor(['Düzce']), 42, matchWorld);
    const b = planMatch(setupFor(['Düzce']), 42, matchWorld);
    expect(a.spawns).toEqual(b.spawns);
    expect(a.zone).toEqual(b.zone);
    expect(a.match.contestants.map((c) => c.name)).toEqual(b.match.contestants.map((c) => c.name));
  });
});
