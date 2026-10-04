import { describe, expect, it } from 'vitest';
import {
  addableProvinces,
  BrArea,
  canRemoveProvince,
  convexHull,
  isConnectedSelection,
  minimalEnclosingCircle,
  provinceAdjacency,
  toggleProvince,
} from '../src/battleRoyale/area';
import { clampPlayers, defaultSetup, normalizeSetup } from '../src/battleRoyale/kinds';
import { BrMatch } from '../src/battleRoyale/match';
import { contestantNames } from '../src/battleRoyale/names';
import { planSpawns, spawnSpacing } from '../src/battleRoyale/spawn';
import {
  distanceToSafety,
  insideCircle,
  planZone,
  zoneAt,
  zoneDamageAt,
} from '../src/battleRoyale/zone';
import { BATTLE_ROYALE } from '../src/config';
import type { ProvinceShape } from '../src/data/region';
import { createRandom } from '../src/utils/random';

/** Eksen hizalı dikdörtgen il (oyun X/Z). */
function rect(
  name: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  inRegion = true,
): ProvinceShape {
  return {
    name,
    iso: name,
    inRegion,
    polygons: [[Float64Array.from([x0, z0, x1, z0, x1, z1, x0, z1])]],
    bounds: { minX: x0, minZ: z0, maxX: x1, maxZ: z1 },
  };
}

/**
 * Izgara iller: A | B | C yan yana (ortak kenarlar), D yalnız C'nin köşesine değer, E uzakta. Ortak kenarların
 * köşeleri birebir aynıdır (veri hattındaki topoloji korumalı sadeleştirme gibi).
 */
const A = rect('A', 0, 0, 100, 100);
const B = rect('B', 100, 0, 200, 100);
const C = rect('C', 200, 0, 300, 100);
const D = rect('D', 300, 100, 400, 200);
const E = rect('E', 1000, 1000, 1100, 1100);
const ALL = [A, B, C, D, E];

describe('il komşuluğu ve bağlı seçim', () => {
  const adj = provinceAdjacency(ALL);

  it('ortak kenarı olan iller komşudur; köşe teması ve uzak il değildir', () => {
    expect([...adj.get('A')!]).toEqual(['B']);
    expect([...adj.get('B')!].sort()).toEqual(['A', 'C']);
    expect([...adj.get('C')!]).toEqual(['B']);
    expect(adj.get('D')!.size).toBe(0);
    expect(adj.get('E')!.size).toBe(0);
  });

  it('bağlılık', () => {
    expect(isConnectedSelection(['A'], adj)).toBe(true);
    expect(isConnectedSelection(['A', 'B', 'C'], adj)).toBe(true);
    expect(isConnectedSelection(['A', 'C'], adj)).toBe(false);
    expect(isConnectedSelection([], adj)).toBe(false);
    expect(isConnectedSelection(['X'], adj)).toBe(false);
  });

  it('ekleme yalnız komşulara, çıkarma seçimi bölmüyorsa', () => {
    expect(addableProvinces([], adj).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(addableProvinces(['A'], adj)).toEqual(['B']);
    expect(addableProvinces(['B'], adj).sort()).toEqual(['A', 'C']);
    expect(toggleProvince(['A'], 'C', adj)).toBeNull();
    expect(toggleProvince(['A'], 'B', adj)).toEqual(['A', 'B']);
    expect(toggleProvince(['A', 'B', 'C'], 'B', adj)).toBeNull(); // A ile C kopar
    expect(canRemoveProvince(['A', 'B', 'C'], 'C', adj)).toBe(true);
    expect(toggleProvince(['A', 'B', 'C'], 'A', adj)).toEqual(['B', 'C']);
    expect(toggleProvince(['A'], 'A', adj)).toEqual([]);
  });
});

describe('BrArea', () => {
  it('seçili illerin birleşimi; komşu il ve dışarısı alan değil', () => {
    const area = new BrArea(ALL, ['A', 'B'], 4, 8);
    expect(area.contains(50, 50)).toBe(true);
    expect(area.contains(150, 50)).toBe(true);
    expect(area.contains(250, 50)).toBe(false); // C seçilmedi
    expect(new BrArea(ALL, ['A', 'B'], 4, 0).areaM2).toBe(200 * 100);
  });

  it('kıyı tamponu: ilsiz şerit en yakın ile katılır, komşu ilin şeridi katılmaz', () => {
    const area = new BrArea(ALL, ['A'], 4, 8);
    expect(area.contains(50, -5)).toBe(true); // A'nın 5 m kuzeyi, ilsiz
    expect(area.contains(50, -20)).toBe(false); // tamponun ötesi
    expect(area.contains(150, -5)).toBe(false); // B'nin şeridi
  });

  it('rastgele nokta alanın içinde; çevreleyen daire alanı kapsar', () => {
    const area = new BrArea(ALL, ['A', 'B', 'C'], 4, 0);
    const random = createRandom(3);
    for (let i = 0; i < 500; i++) {
      const p = area.randomPoint(random);
      expect(area.contains(p.x, p.z)).toBe(true);
    }
    const circle = area.enclosingCircle();
    expect(circle.x).toBeCloseTo(150, 0);
    expect(circle.z).toBeCloseTo(50, 0);
    expect(circle.r).toBeCloseTo(Math.hypot(150, 50), 0);
  });

  it('en küçük çevreleyen daire ve zarf', () => {
    const pts: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [5, 3],
      [5, -3],
      [3, 1],
    ];
    expect(convexHull(pts)).toHaveLength(4);
    const c = minimalEnclosingCircle(pts);
    expect(c.x).toBeCloseTo(5);
    expect(c.z).toBeCloseTo(0);
    expect(c.r).toBeCloseTo(5);
  });
});

describe('güvenli bölge', () => {
  const area = new BrArea([rect('K', 0, 0, 2000, 1000)], ['K'], 8, 0);
  const plan = planZone(area, createRandom(11), 'medium', () => true);

  it('her daire öncekinin içinde, merkez alanda; zamanlar artan; son daire kapanır', () => {
    let prev = plan.initial;
    let t = 0;
    for (const p of plan.phases) {
      expect(p.from).toEqual(prev);
      expect(Math.hypot(p.to.x - p.from.x, p.to.z - p.from.z) + p.to.r).toBeLessThanOrEqual(
        p.from.r + 1e-6,
      );
      if (p.to.r > 0) expect(area.contains(p.to.x, p.to.z)).toBe(true);
      expect(p.start).toBeCloseTo(t);
      expect(p.shrinkStart).toBeGreaterThan(p.start);
      expect(p.end).toBeGreaterThan(p.shrinkStart);
      t = p.end;
      prev = p.to;
    }
    expect(plan.total).toBeCloseTo(t);
    expect(plan.phases.at(-1)!.to.r).toBe(0);
  });

  it('sınır hızı aşamanın sınırını aşmaz', () => {
    BATTLE_ROYALE.zone.phases.forEach((cfg, i) => {
      const p = plan.phases[i]!;
      const travel = p.from.r - p.to.r + Math.hypot(p.to.x - p.from.x, p.to.z - p.from.z);
      expect(travel / (p.end - p.shrinkStart)).toBeLessThanOrEqual(
        cfg.edgeSpeed / BATTLE_ROYALE.zone.durationScale.medium + 1e-9,
      );
    });
  });

  it('zoneAt: bekleme, daralma (doğrusal), kapanma', () => {
    const p0 = plan.phases[0]!;
    const wait = zoneAt(plan, p0.start + 1);
    expect(wait.stage).toBe('wait');
    expect(wait.circle).toEqual(p0.from);
    expect(wait.next).toEqual(p0.to);
    const mid = zoneAt(plan, (p0.shrinkStart + p0.end) / 2);
    expect(mid.stage).toBe('shrink');
    expect(mid.circle.r).toBeCloseTo((p0.from.r + p0.to.r) / 2);
    expect(zoneAt(plan, p0.end).phase).toBe(1);
    const closed = zoneAt(plan, plan.total + 5);
    expect(closed.stage).toBe('closed');
    expect(closed.circle.r).toBe(0);
  });

  it('süre seçimi aşamaları ölçekler', () => {
    const short = planZone(area, createRandom(11), 'short', () => true);
    const long = planZone(area, createRandom(11), 'long', () => true);
    expect(short.total).toBeLessThan(plan.total);
    expect(long.total).toBeGreaterThan(plan.total);
  });

  it('hasar: daire dışı aşama hasarı, alan dışı en az alan hasarı', () => {
    const s = zoneAt(plan, 0);
    const c = s.circle;
    expect(zoneDamageAt(s, true, c.x, c.z)).toBe(0);
    expect(zoneDamageAt(s, false, c.x, c.z)).toBe(BATTLE_ROYALE.zone.outsideAreaDamage);
    expect(zoneDamageAt(s, true, c.x + c.r + 1, c.z)).toBe(s.damage);
    expect(insideCircle(c, c.x + c.r - 1, c.z)).toBe(true);
    expect(distanceToSafety(c, c.x + c.r + 7, c.z)).toBeCloseTo(7);
  });

  it('uygun merkez yoksa önceki merkez korunur', () => {
    const stuck = planZone(area, createRandom(1), 'medium', () => false);
    for (const p of stuck.phases) {
      expect(p.to.x).toBeCloseTo(stuck.initial.x);
      expect(p.to.z).toBeCloseTo(stuck.initial.z);
    }
  });
});

describe('başlangıç noktaları', () => {
  const area = new BrArea([rect('K', 0, 0, 1000, 1000)], ['K'], 8, 0);
  const open = (x: number): boolean => !(x > 400 && x < 600); // ortada geçilmez şerit

  it('sayı, alan, açık nokta ve aralık', () => {
    const spawns = planSpawns(area, 40, createRandom(5), open);
    expect(spawns).toHaveLength(40);
    const spacing = spawnSpacing(area.areaM2, 40);
    for (const [i, s] of spawns.entries()) {
      expect(area.contains(s.x, s.z)).toBe(true);
      expect(open(s.x)).toBe(true);
      for (const t of spawns.slice(i + 1)) {
        expect(Math.hypot(s.x - t.x, s.z - t.z)).toBeGreaterThanOrEqual(spacing * 0.8 ** 12 - 1e-6);
      }
    }
  });

  it('aynı tohum aynı noktalar; sıkışık alanda aralık gevşer', () => {
    expect(planSpawns(area, 20, createRandom(9), open)).toEqual(
      planSpawns(area, 20, createRandom(9), open),
    );
    const tiny = new BrArea([rect('T', 0, 0, 60, 60)], ['T'], 4, 0);
    expect(planSpawns(tiny, 100, createRandom(2), () => true)).toHaveLength(100);
  });

  it('hiç açık yer yoksa hata', () => {
    expect(() => planSpawns(area, 5, createRandom(1), () => false)).toThrow();
  });
});

describe('maç durumu', () => {
  it('elenme sırası, öldürme sayısı, kill feed ve kazanan', () => {
    const match = new BrMatch(['Sen', 'A', 'B', 'C']);
    expect(match.aliveCount).toBe(4);
    const e = match.eliminate(2, 1, 'kill', 'rifle', 10)!;
    expect(e.placement).toBe(4);
    expect(match.contestants[1]!.kills).toBe(1);
    expect(match.eliminate(2, 1, 'kill', 'rifle', 11)).toBeNull(); // iki kez elenmez
    match.eliminate(3, null, 'zone', null, 20);
    expect(match.finished).toBe(false);
    match.eliminate(1, 0, 'kill', 'pistol', 30);
    expect(match.finished).toBe(true);
    expect(match.winner!.isPlayer).toBe(true);
    const result = match.result(31);
    expect(result).toMatchObject({ placement: 1, total: 4, kills: 1, survived: 31 });
    expect(result.topNpc).toEqual({ id: 1, name: 'A', kills: 1 });
    expect(match.killFeed.map((k) => k.victim)).toEqual([2, 3, 1]);
  });

  it('oyuncu ölünce sırası sabit; kalanlar elenmeye devam eder; kazanan elenmez', () => {
    const match = new BrMatch(['Sen', 'A', 'B']);
    match.eliminate(0, 1, 'kill', 'club', 5);
    expect(match.finished).toBe(true);
    expect(match.result(9)).toMatchObject({ placement: 3, survived: 5, winner: null });
    match.eliminate(2, 1, 'kill', 'club', 8);
    expect(match.result(9).winner).toEqual({ id: 1, name: 'A' });
    expect(match.eliminate(1, null, 'zone', null, 9)).toBeNull();
    expect(match.result(9).placement).toBe(3);
  });

  it('öldüreni olmayan "kill" diğer sayılır; kendini öldürme sayılmaz', () => {
    const match = new BrMatch(['Sen', 'A', 'B']);
    expect(match.eliminate(1, null, 'kill', 'rifle', 1)!.cause).toBe('other');
    expect(match.eliminate(2, 2, 'kill', 'rifle', 1)!.killer).toBeNull();
  });
});

describe('kurulum ve adlar', () => {
  it('hoşgörülü okuma', () => {
    const valid = (names: string[]): boolean => names.every((n) => n === 'A' || n === 'B');
    expect(normalizeSetup(null, valid)).toEqual(defaultSetup());
    const s = normalizeSetup(
      {
        area: { kind: 'provinces', names: ['A', 'B', 'A', 3] },
        players: 999,
        duration: 'x',
        animals: false,
      },
      valid,
    );
    expect(s.area).toEqual({ kind: 'provinces', names: ['A', 'B'] });
    expect(s.players).toBe(BATTLE_ROYALE.players.max);
    expect(s.duration).toBe('medium');
    expect(s.animals).toBe(false);
    expect(normalizeSetup({ area: { kind: 'provinces', names: ['Z'] } }, valid).area).toEqual({
      kind: 'world',
    });
    expect(clampPlayers(1)).toBe(BATTLE_ROYALE.players.min);
    expect(clampPlayers(Number.NaN)).toBe(BATTLE_ROYALE.players.min);
  });

  it('adlar tekrarsız ve deterministik', () => {
    const names = contestantNames(99, createRandom(4));
    expect(new Set(names).size).toBe(99);
    expect(contestantNames(99, createRandom(4))).toEqual(names);
  });
});
