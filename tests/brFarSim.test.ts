import { describe, expect, it } from 'vitest';
import { BrArea } from '../src/battleRoyale/area';
import {
  FarSim,
  weaponForGear,
  winChance,
  type FarWorld,
  type LootSpot,
} from '../src/battleRoyale/farSim';
import { FlowField, WalkGrid } from '../src/battleRoyale/flowField';
import { BrMatch } from '../src/battleRoyale/match';
import { planSpawns } from '../src/battleRoyale/spawn';
import { planZone } from '../src/battleRoyale/zone';
import { BATTLE_ROYALE } from '../src/config';
import type { ProvinceShape } from '../src/data/region';
import { createRandom } from '../src/utils/random';

/** 2 km × 1 km il; ortasında yürünemez bir göl; ızgara hâlinde ganimet yerleri. */
const SQUARE: ProvinceShape = {
  name: 'K',
  iso: 'K',
  inRegion: true,
  polygons: [[Float64Array.from([0, 0, 2000, 0, 2000, 1000, 0, 1000])]],
  bounds: { minX: 0, minZ: 0, maxX: 2000, maxZ: 1000 },
};
const lake = (x: number, z: number): boolean => Math.hypot(x - 1000, z - 500) < 120;
const spots: LootSpot[] = [];
for (let x = 150; x < 2000; x += 300) {
  for (let z = 150; z < 1000; z += 300) {
    if (!lake(x, z)) spots.push({ x, z, radius: 30, richness: (x + z) % 600 === 0 ? 1 : 0.5 });
  }
}
const world: FarWorld = {
  walkable: (x, z) => x >= 0 && z >= 0 && x <= 2000 && z <= 1000 && !lake(x, z),
  lootSpots: spots,
};

function setup(count: number, seed: number) {
  const area = new BrArea([SQUARE], ['K'], 8, 0);
  const plan = planZone(area, createRandom(seed), 2, (x, z) => world.walkable(x, z));
  const spawns = planSpawns(area, count, createRandom(seed + 1), world.walkable);
  const match = new BrMatch(Array.from({ length: count }, (_, i) => `Y${i}`));
  const sim = new FarSim(
    match,
    { plan, area },
    world,
    seed,
    spawns.map((s, id) => ({ id, ...s })),
  );
  return { area, plan, match, sim };
}

describe('uzak kademe simülasyonu', () => {
  it('bölge kapanana kadar tek kazanan kalır; her elenmenin nedeni ve sırası tutarlı', () => {
    const { plan, match, sim } = setup(40, 3);
    const events = sim.update(plan.total + 120);
    expect(match.aliveCount).toBe(1);
    expect(events).toHaveLength(39);
    expect(events.map((e) => e.placement)).toEqual(Array.from({ length: 39 }, (_, i) => 40 - i));
    for (const e of events) {
      if (e.cause === 'kill') {
        expect(e.killer).not.toBeNull();
        expect(e.weapon).not.toBeNull();
      } else expect(e.cause).toBe('zone');
    }
    const kills = events.filter((e) => e.cause === 'kill').length;
    expect(kills).toBeGreaterThan(10); // çoğu çatışmada ölür, bölge yalnız geç kalanları
    expect(sim.drops).toHaveLength(39);
  });

  it('aynı tohum aynı maç', () => {
    const a = setup(30, 9);
    const b = setup(30, 9);
    a.sim.update(600);
    b.sim.update(600);
    expect(a.match.eliminations).toEqual(b.match.eliminations);
    expect(a.sim.all()).toEqual(b.sim.all());
  });

  it('NPC hep yürünebilir yerde kalır; ganimet yerinde teçhizat artar', () => {
    const { sim } = setup(30, 5);
    let maxGear = 0;
    for (let t = 30; t <= 600; t += 30) {
      sim.update(t);
      for (const a of sim.all()) {
        expect(world.walkable(a.x, a.z)).toBe(true);
        maxGear = Math.max(maxGear, a.gear);
      }
    }
    expect(maxGear).toBeGreaterThan(0.3);
  });

  it('bölge dışında kalan ve kıpırdayamayan NPC bölgeden ölür', () => {
    const area = new BrArea([SQUARE], ['K'], 8, 0);
    const plan = planZone(area, createRandom(1), 2, () => true);
    const match = new BrMatch(['Sen', 'A', 'B']);
    const frozen: FarWorld = { walkable: () => false, lootSpots: [] };
    // B bölgenin son dairesinden en uzak köşede, A tam merkezde; ikisi de yürüyemez.
    const end = plan.phases.at(-1)!.to;
    const corner = { x: end.x < 1000 ? 1999 : 1, z: end.z < 500 ? 999 : 1 };
    const sim = new FarSim(match, { plan, area }, frozen, 1, [
      { id: 1, x: end.x, z: end.z },
      { id: 2, ...corner },
    ]);
    match.eliminate(0, null, 'other', null, 0);
    const events = sim.update(plan.total + 60);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ victim: 2, cause: 'zone', killer: null });
    expect(match.winner!.id).toBe(1);
  });

  it('take/restore: yakın kademedeki NPC hareket etmez; geri dönünce durumu korunur', () => {
    const { sim } = setup(10, 4);
    sim.update(60);
    const taken = sim.take(3)!;
    expect(sim.get(3)).toBeNull();
    sim.update(120);
    expect(sim.get(3)).toBeNull();
    sim.restore({ ...taken, x: taken.x + 1, health: 55, gear: 0.6 });
    expect(sim.get(3)).toMatchObject({ x: taken.x + 1, health: 55, gear: 0.6 });
  });

  it('hızlı sonuçlandırma kazanana kadar sürer', () => {
    const { plan, match, sim } = setup(25, 8);
    match.eliminate(0, null, 'other', null, 0); // oyuncu öldü
    sim.take(0);
    sim.update(100);
    sim.runToEnd(plan.total + 300);
    expect(match.aliveCount).toBe(1);
  });

  it('güç ve silah', () => {
    expect(winChance({ gear: 0.8, health: 100 }, { gear: 0, health: 100 })).toBeGreaterThan(0.9);
    expect(winChance({ gear: 0.5, health: 100 }, { gear: 0.5, health: 100 })).toBeCloseTo(0.5);
    expect(winChance({ gear: 0.5, health: 10 }, { gear: 0.5, health: 100 })).toBeLessThan(0.2);
    expect(weaponForGear(0)).toBe('club');
    expect(weaponForGear(0.6)).toBe('shotgun');
    expect(weaponForGear(1)).toBe('sniper_rifle');
    expect(BATTLE_ROYALE.far.gearWeapons.at(-1)!.below).toBe(Infinity);
  });
});

describe('akış alanı', () => {
  // 400 × 200 m; x = 200'de duvar, yalnız z ∈ [160, 200) aralığında geçit.
  const wall = (x: number, z: number): boolean => !(x >= 190 && x < 210 && z < 160);
  const grid = new WalkGrid({ minX: 0, minZ: 0, maxX: 400, maxZ: 200 }, 10, wall);
  const flow = new FlowField(grid, { x: 350, z: 20, r: 15 });

  it('uzaklık duvarın etrafından (geçitten) ölçülür', () => {
    // Düz çizgi 285 m; geçitten (z ≈ 165) çapraz iniş-çıkış ≈ 2 · √(150² + 145²) − 15 ≈ 400 m.
    const straight = Math.hypot(350 - 50, 0) - 15;
    expect(flow.distanceAt(50, 20)).toBeGreaterThan(straight + 100);
    expect(flow.distanceAt(50, 20)).toBeLessThan(straight + 160);
    expect(flow.distanceAt(350, 20)).toBe(0);
    expect(flow.distanceAt(200, 20)).toBe(Infinity); // duvar
    expect(flow.distanceAt(-5, 20)).toBe(Infinity); // ızgara dışı
  });

  it('ara noktaları izleyen yürüyüş geçitten geçip daireye varır', () => {
    let p = { x: 50, z: 20 };
    let passedGap = false;
    for (let i = 0; i < 200; i++) {
      const wp = flow.nextWaypoint(p.x, p.z);
      if (!wp) break;
      p = wp;
      expect(wall(p.x, p.z)).toBe(true);
      if (p.x > 190 && p.x < 210) passedGap ||= p.z >= 160;
    }
    expect(passedGap).toBe(true);
    expect(Math.hypot(p.x - 350, p.z - 20)).toBeLessThan(25);
  });

  it('alan dışı hücreler pahalı: yol alanın içinden dolaşmayı yeğler', () => {
    const open = new WalkGrid(
      { minX: 0, minZ: 0, maxX: 300, maxZ: 300 },
      10,
      () => true,
      (x, z) => !(x > 100 && x < 200 && z < 250),
    );
    const f = new FlowField(open, { x: 280, z: 20, r: 10 });
    let p = { x: 20, z: 20 };
    let outside = 0;
    for (let i = 0; i < 200; i++) {
      const wp = f.nextWaypoint(p.x, p.z);
      if (!wp) break;
      p = wp;
      if (p.x > 100 && p.x < 200 && p.z < 250) outside++;
    }
    expect(outside).toBe(0);
  });
});
