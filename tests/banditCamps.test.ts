import { beforeAll, describe, expect, it } from 'vitest';
import { BANDITS } from '../src/config';
import {
  campIdOf,
  campLayout,
  campSiteOk,
  placeCamps,
  type Camp,
  type CampSiteQuery,
} from '../src/bandits/camps';
import { loadBanditWorld, type BanditWorld } from './helpers/banditWorld';

/** Sahte dünya: her yer orman ve düz; yol z = 0 boyunca (x ekseni), yerleşim (0, 600)'de. */
function fakeQuery(patch: Partial<CampSiteQuery> = {}): CampSiteQuery {
  return {
    bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
    isSea: () => false,
    coverAt: () => 'forest',
    slopeDegAt: () => 5,
    roadNear: (_x, z, r) =>
      Math.abs(z) - 2 <= r ? { edgeDistance: Math.abs(z) - 2, angle: 0 } : null,
    nearSettlement: (x, z, minTown) => Math.hypot(x, z - 600) - 50 < minTown,
    ...patch,
  };
}

describe('kamp yeri kuralları (sahte dünya)', () => {
  it('orman, düzlük, yoldan uygun uzaklık, yerleşimden uzak', () => {
    const q = fakeQuery();
    expect(campSiteOk(q, 0, -200)).not.toBeNull();
    expect(campSiteOk(q, 0, -50)).toBeNull(); // yola çok yakın
    expect(campSiteOk(q, 0, -750)).toBeNull(); // yoldan çok uzak
    expect(campSiteOk(q, 0, 400)).toBeNull(); // yerleşime yakın
    expect(campSiteOk(fakeQuery({ coverAt: () => 'grass' }), 0, -200)).toBeNull();
    expect(campSiteOk(fakeQuery({ slopeDegAt: () => 40 }), 0, -200)).toBeNull();
    expect(campSiteOk(fakeQuery({ isSea: (x) => x > 5 }), 0, -200)).toBeNull(); // çember denize değiyor
  });

  it('deterministik; kamplar birbirinden uzak, sayı sınırlı; kimlikler hücre anahtarı', () => {
    const a = placeCamps(fakeQuery());
    const b = placeCamps(fakeQuery());
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(3);
    expect(a.length).toBeLessThanOrEqual(BANDITS.campCount);
    for (const c of a) {
      expect(campSiteOk(fakeQuery(), c.x, c.z)).not.toBeNull();
      for (const o of a) {
        if (o !== c)
          expect(Math.hypot(o.x - c.x, o.z - c.z)).toBeGreaterThanOrEqual(BANDITS.campSpacing);
      }
      expect(Number.isSafeInteger(c.id) && c.id >= 0).toBe(true);
    }
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
    expect(campIdOf(-1, 2)).not.toBe(campIdOf(2, -1));
    expect(placeCamps(fakeQuery(), 123)).not.toEqual(a); // başka tohum başka seçim
  });

  it('kamp yola bakar; pusu yeri yol kenarında, kamp tarafında', () => {
    for (const c of placeCamps(fakeQuery())) {
      const forward = { x: -Math.sin(c.yaw), z: -Math.cos(c.yaw) };
      // Yol z = 0: kamp güneydeyse (z < 0) ileri +z, kuzeydeyse −z.
      expect(Math.sign(forward.z)).toBe(-Math.sign(c.z));
      expect(c.ambush).not.toBeNull();
      expect(Math.abs(c.ambush!.z)).toBeCloseTo(2 + BANDITS.ambushOffset, 0);
      expect(Math.sign(c.ambush!.z)).toBe(Math.sign(c.z));
      const [lo, hi] = BANDITS.members;
      expect(c.members).toBeGreaterThanOrEqual(lo);
      expect(c.members).toBeLessThanOrEqual(hi);
    }
  });

  it('düzen: ateş merkezde, nöbet yol tarafında, çadır ve sandık kamp yarıçapında', () => {
    const camp: Camp = {
      id: 1,
      x: 10,
      z: -200,
      yaw: Math.PI,
      members: 4,
      leaderWeapon: 'shotgun',
      ambush: null,
    };
    const l = campLayout(camp);
    expect(l.fire).toEqual({ x: 10, z: -200 });
    expect(l.post.z).toBeGreaterThan(camp.z + BANDITS.campRadius * 0.9); // yaw π: ileri +z (yol)
    expect(l.seats).toHaveLength(4);
    for (const p of [...l.tents, l.chest, ...l.seats]) {
      expect(Math.hypot(p.x - camp.x, p.z - camp.z)).toBeLessThanOrEqual(BANDITS.campRadius);
    }
    for (const t of l.tents) expect(t.z).toBeLessThan(camp.z); // arka taraf
    expect(campLayout(camp)).toEqual(l);
  });
});

describe('kamp yerleri (gerçek dünya)', () => {
  let w: BanditWorld;
  beforeAll(async () => {
    w = await loadBanditWorld();
  }, 120_000);

  it('40–48 kamp; hepsi ormanda, yürünebilir, yerleşimlerden ve yoldan kurala uygun uzaklıkta', () => {
    expect(w.camps.length).toBeGreaterThanOrEqual(40);
    expect(w.camps.length).toBeLessThanOrEqual(BANDITS.campCount);
    for (const c of w.camps) {
      expect(w.terrain.coverAt(c.x, c.z)).toBe('forest');
      expect(w.terrain.slopeDegAt(c.x, c.z)).toBeLessThanOrEqual(BANDITS.maxSlopeDeg);
      const road = w.settlement.map.roads.nearest(c.x, c.z, 800)!;
      expect(road.edgeDistance).toBeGreaterThanOrEqual(BANDITS.roadDistance[0]);
      expect(road.edgeDistance).toBeLessThanOrEqual(BANDITS.roadDistance[1]);
      for (const s of w.settlement.map.settlements) {
        const edge = Math.hypot(s.data.x - c.x, s.data.z - c.z) - s.radius;
        const limit =
          s.data.rank === 'koy' ? BANDITS.minVillageDistance : BANDITS.minSettlementDistance;
        expect(edge).toBeGreaterThanOrEqual(limit);
      }
      expect(w.settlement.map.buildingAt(c.x, c.z, BANDITS.campRadius)).toBeNull();
    }
    if (process.env.BANDIT_REPORT)
      console.log(w.camps.map((c) => `${c.id}: ${c.x.toFixed(0)}, ${c.z.toFixed(0)}`));
  });

  it('il/ilçe merkezlerinin çoğuna kısa yürüyüşte bir kamp düşer (oyuncu eşkıyaya rastlayabilsin)', () => {
    const towns = w.settlement.map.settlements.filter((s) => s.data.rank !== 'koy');
    const close = towns.filter((s) =>
      w.camps.some((c) => Math.hypot(c.x - s.data.x, c.z - s.data.z) <= 600),
    );
    expect(close.length / towns.length).toBeGreaterThanOrEqual(0.55);
  });

  it('yeniden kurulunca aynı kamplar (kimlik kalıcı)', async () => {
    const { placeCamps: again } = await import('../src/bandits/camps');
    expect(again(w.query)).toEqual(w.camps);
  });
});
