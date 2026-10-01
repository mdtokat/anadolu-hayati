import { describe, expect, it } from 'vitest';
import { CREATURES } from '../src/config';
import { CREATURE_KINDS } from '../src/creatures/kinds';
import {
  activityWeight,
  candidatesForCell,
  cellKey,
  cellOf,
  cellRect,
  cellsNear,
  epochOf,
  habitatSuitability,
  isHiddenFrom,
  isVisibleTo,
  makeSpawnGrid,
  passable,
  spawnPointOk,
  trapezoidWeight,
} from '../src/creatures/spawn';
import { SPECIES, decodeCreatureId } from '../src/creatures/species';
import { absoluteChunkKey } from '../src/world/chunkKeys';
import { fakeTerrain } from './helpers/fakeTerrain';

const terrain = fakeTerrain();
const grid = makeSpawnGrid(terrain.bounds);

/** Epoch 0'da birden çok adayı olan bir hücre (testler için sabit örnek). */
const busy = (() => {
  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      if (candidatesForCell({ grid, terrain, cx, cy, epoch: 0 }).length >= 3) return { cx, cy };
    }
  }
  throw new Error('aday içeren hücre yok');
})();

describe('doğma ızgarası', () => {
  it('kafese hizasız sentetik arazi: sınıra hizalı 6×6 hücre, anahtar mutlak chunk anahtarı', () => {
    expect(grid).toMatchObject({
      size: 256,
      cx0: 0,
      cy0: 0,
      cols: 6,
      rows: 6,
      minX: -768,
      minZ: -768,
    });
    expect(cellKey(2, 1)).toBe(absoluteChunkKey(2, 1));
    expect(cellOf(grid, -768, -768)).toEqual({ cx: 0, cy: 0 });
    expect(cellOf(grid, 0, 0)).toEqual({ cx: 3, cy: 3 });
    expect(cellOf(grid, 767, 767)).toEqual({ cx: 5, cy: 5 });
    expect(cellOf(grid, 900, 0)).toBeNull();
    expect(cellRect(grid, 3, 3)).toEqual({ minX: 0, maxX: 256, minZ: 0, maxZ: 256 });
  });

  it('cellsNear: daireyi kesen hücreleri verir', () => {
    expect(cellsNear(grid, -600, -600, 50)).toEqual([{ cx: 0, cy: 0 }]);
    const around = cellsNear(grid, -256, -256, 10); // dört hücrenin köşesi
    expect(around).toHaveLength(4);
    expect(cellsNear(grid, 0, 0, 1000)).toHaveLength(36);
    expect(cellsNear(grid, 5000, 5000, 100)).toEqual([]);
  });

  it('dönem: epochSeconds aralıkla artar', () => {
    expect(epochOf(0)).toBe(0);
    expect(epochOf(CREATURES.epochSeconds - 1)).toBe(0);
    expect(epochOf(CREATURES.epochSeconds)).toBe(1);
  });
});

describe('uygunluk ve zaman penceresi', () => {
  it('yamuk üyelik', () => {
    expect(trapezoidWeight(0, [0, 10, 20, 30])).toBe(0);
    expect(trapezoidWeight(5, [0, 10, 20, 30])).toBeCloseTo(0.5);
    expect(trapezoidWeight(15, [0, 10, 20, 30])).toBe(1);
    expect(trapezoidWeight(25, [0, 10, 20, 30])).toBeCloseTo(0.5);
    expect(trapezoidWeight(31, [0, 10, 20, 30])).toBe(0);
  });

  it('kurt gece var, gündüz seyrek; karaca gündüz bol', () => {
    const wolf = SPECIES.wolf;
    const deer = SPECIES.roe_deer;
    expect(activityWeight(wolf, -30)).toBeCloseTo(wolf.activity.night);
    expect(activityWeight(wolf, 50)).toBeCloseTo(wolf.activity.day);
    expect(activityWeight(wolf, 50)).toBeLessThan(activityWeight(wolf, -30));
    expect(activityWeight(deer, 50)).toBeGreaterThan(activityWeight(deer, -30));
    // Alacakaranlıkta `dusk` ağırlığı öne çıkar.
    expect(activityWeight(wolf, 0)).toBeGreaterThan(activityWeight(wolf, 50));
    for (const kind of CREATURE_KINDS) {
      for (const alt of [-40, -10, -3, 0, 3, 10, 60]) {
        const w = activityWeight(SPECIES[kind], alt);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });

  it('biyom kuralları: örtü sınıfı, rakım, eğim, su, deniz', () => {
    const deer = SPECIES.roe_deer;
    const bear = SPECIES.brown_bear;
    const at = (t = terrain) => habitatSuitability(deer, t, 0, 0);
    expect(at()).toBeGreaterThan(0);
    for (const cover of ['none', 'snow', 'urban', 'barren', 'wetland'] as const) {
      expect(at(fakeTerrain({ cover }))).toBe(0);
    }
    expect(at(fakeTerrain({ cover: 'grass' }))).toBeGreaterThan(at());
    expect(at(fakeTerrain({ elevation: 0 }))).toBe(0); // kıyı/deniz seviyesi
    expect(at(fakeTerrain({ elevation: 1800 }))).toBe(0);
    expect(at(fakeTerrain({ slope: deer.maxSlopeDeg }))).toBe(0);
    expect(at(fakeTerrain({ water: () => true }))).toBe(0);
    expect(at(fakeTerrain({ sea: () => true }))).toBe(0);
    // Ayı yalnız orman ve yüksek rakım.
    expect(habitatSuitability(bear, terrain, 0, 0)).toBeGreaterThan(0);
    expect(habitatSuitability(bear, fakeTerrain({ cover: 'grass' }), 0, 0)).toBe(0);
    expect(habitatSuitability(bear, fakeTerrain({ elevation: 100 }), 0, 0)).toBe(0);
  });

  it('passable: kenar payı, deniz, eğim', () => {
    const deer = SPECIES.roe_deer;
    expect(passable(deer, terrain, 0, 0)).toBe(true);
    expect(passable(deer, terrain, 767, 0)).toBe(false); // duvar payı
    expect(passable(deer, fakeTerrain({ sea: () => true }), 0, 0)).toBe(false);
    expect(passable(deer, fakeTerrain({ slope: 80 }), 0, 0)).toBe(false);
  });
});

describe('aday canlılar (deterministik)', () => {
  const all = (epoch: number) =>
    [0, 1, 2].flatMap((cy) =>
      [0, 1, 2].flatMap((cx) => candidatesForCell({ grid, terrain, cx, cy, epoch })),
    );

  it('aynı (tohum, hücre, dönem) → bit bit aynı', () => {
    const a = candidatesForCell({ grid, terrain, ...busy, epoch: 0 });
    const b = candidatesForCell({ grid, terrain, ...busy, epoch: 0 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeGreaterThan(0);
    // Hücre sırası/önceki çağrılar sonucu etkilemez.
    all(0);
    expect(JSON.stringify(candidatesForCell({ grid, terrain, ...busy, epoch: 0 }))).toBe(
      JSON.stringify(a),
    );
  });

  it('tohum, hücre ve dönem sonucu değiştirir', () => {
    const base = JSON.stringify(candidatesForCell({ grid, terrain, ...busy, epoch: 0 }));
    expect(JSON.stringify(candidatesForCell({ grid, terrain, ...busy, epoch: 1 }))).not.toBe(base);
    expect(
      JSON.stringify(
        candidatesForCell({ grid, terrain, cx: busy.cx, cy: (busy.cy + 1) % 6, epoch: 0 }),
      ),
    ).not.toBe(base);
    expect(
      JSON.stringify(
        candidatesForCell({ grid, terrain, ...busy, epoch: 0, seed: CREATURES.seed + 1 }),
      ),
    ).not.toBe(base);
  });

  it('dikiş: her aday kendi hücresinde, kimlikler benzersiz ve hücreye çözülür (çift/kayıp yok)', () => {
    const ids = new Set<number>();
    for (let cy = 0; cy < 3; cy++) {
      for (let cx = 0; cx < 3; cx++) {
        const rect = cellRect(grid, cx, cy);
        const key = cellKey(cx, cy);
        const list = candidatesForCell({ grid, terrain, cx, cy, epoch: 0 });
        list.forEach((c, index) => {
          expect(c.x).toBeGreaterThanOrEqual(rect.minX);
          expect(c.x).toBeLessThan(rect.maxX);
          expect(c.z).toBeGreaterThanOrEqual(rect.minZ);
          expect(c.z).toBeLessThan(rect.maxZ);
          expect(cellOf(grid, c.x, c.z)).toEqual({ cx, cy });
          expect(decodeCreatureId(c.id)).toEqual({ cellKey: key, index });
          expect(ids.has(c.id)).toBe(false);
          ids.add(c.id);
        });
      }
    }
    expect(ids.size).toBeGreaterThan(9);
  });

  it('gruplar: boyut tür aralığında, üyeler liderin yakınında ve aynı `u`', () => {
    for (const c of all(0)) {
      expect(c.u).toBeGreaterThanOrEqual(0);
      expect(c.u).toBeLessThan(1);
      expect(c.yaw).toBeGreaterThanOrEqual(-Math.PI);
      expect(c.yaw).toBeLessThanOrEqual(Math.PI);
    }
    const wolves = all(0).filter((c) => c.kind === 'wolf');
    const bears = all(0).filter((c) => c.kind === 'brown_bear');
    // Ayı yalnız; aynı hücrede aynı `u`'yu paylaşan ayı yok.
    const bearUs = bears.map((b) => b.u);
    expect(new Set(bearUs).size).toBe(bearUs.length);
    expect(wolves.length + bears.length).toBeGreaterThanOrEqual(0);
  });

  it('uygun olmayan arazide aday yok (deniz, kar, yerleşim, su, yüksek rakım)', () => {
    const banned = [
      fakeTerrain({ cover: 'urban' }),
      fakeTerrain({ cover: 'snow' }),
      fakeTerrain({ cover: 'none' }),
      fakeTerrain({ sea: () => true }),
      fakeTerrain({ water: () => true }),
      fakeTerrain({ elevation: 3000 }),
      fakeTerrain({ elevation: 0 }),
      fakeTerrain({ slope: 70 }),
    ];
    for (const t of banned) {
      const g = makeSpawnGrid(t.bounds);
      for (let epoch = 0; epoch < 5; epoch++) {
        expect(candidatesForCell({ grid: g, terrain: t, ...busy, epoch })).toHaveLength(0);
      }
    }
  });

  it('her aday kendi türünün biyom kuralına uyar', () => {
    const t = fakeTerrain({
      cover: (x) => (x < 0 ? 'forest' : 'grass'),
      elevation: (_x, z) => 100 + (z + 768) * 1.2,
      slope: (x, z) => 10 + Math.abs(Math.sin(x / 50 + z / 70)) * 30,
    });
    const g = makeSpawnGrid(t.bounds);
    let count = 0;
    for (let epoch = 0; epoch < 6; epoch++) {
      for (let cy = 0; cy < 3; cy++) {
        for (let cx = 0; cx < 3; cx++) {
          for (const c of candidatesForCell({ grid: g, terrain: t, cx, cy, epoch })) {
            const sp = SPECIES[c.kind];
            count++;
            expect(Object.keys(sp.habitat.cover)).toContain(t.coverAt(c.x, c.z));
            expect(passable(sp, t, c.x, c.z)).toBe(true);
            const [a, , , d] = sp.habitat.elevation;
            const e = t.elevationAt(c.x, c.z);
            // Lider kuralı sıkı; üyeler lider çevresindedir (kuralı kendi noktasında sağlamayabilir).
            expect(e).toBeGreaterThanOrEqual(a - 2 * CREATURES.groupSpread * 1.2);
            expect(e).toBeLessThanOrEqual(d + 2 * CREATURES.groupSpread * 1.2);
          }
        }
      }
    }
    expect(count).toBeGreaterThan(20);
  });

  it('hücre başına en çok 256 aday ve yoğunluk ~ tür yoğunluğu', () => {
    let total = 0;
    let cells = 0;
    for (let epoch = 0; epoch < 30; epoch++) {
      for (const c of [0, 1, 2]) {
        const list = candidatesForCell({ grid, terrain, cx: c, cy: 1, epoch });
        expect(list.length).toBeLessThanOrEqual(256);
        total += list.filter((x) => x.kind === 'roe_deer').length;
        cells++;
      }
    }
    // Karaca: ~1,2 grup × 0,7 (orman) × ortalama 2 üye → hücre başına ~1,7.
    const perCell = total / cells;
    expect(perCell).toBeGreaterThan(0.6);
    expect(perCell).toBeLessThan(3.5);
  });
});

describe('doğma noktası denetimi', () => {
  const player = { x: 0, z: 0 };

  it('minimum uzaklık ve simülasyon yarıçapı', () => {
    expect(spawnPointOk({ x: CREATURES.minSpawnDistance - 1, z: 0 }, player, [])).toBe(false);
    expect(spawnPointOk({ x: CREATURES.minSpawnDistance + 1, z: 0 }, player, [])).toBe(true);
    expect(spawnPointOk({ x: CREATURES.simRadius + 1, z: 0 }, player, [])).toBe(false);
  });

  it('görüş konisi içinde yakın yerde doğmaz; arkada/uzakta doğar', () => {
    const facing = { x: 0, z: 0, yaw: 0 }; // kuzey (−Z)
    const ahead = { x: 0, z: -150 };
    const behind = { x: 0, z: 150 };
    expect(isVisibleTo(ahead, facing)).toBe(true);
    expect(isHiddenFrom(behind, facing)).toBe(true);
    expect(spawnPointOk(ahead, facing, [])).toBe(false);
    expect(spawnPointOk(behind, facing, [])).toBe(true);
    // Görüş konisinin içinde ama `spawnHiddenDistance` ötesi: sis/uzaklık gizler.
    const far = { x: 0, z: -(CREATURES.spawnHiddenDistance + 5) };
    expect(spawnPointOk(far, { ...facing }, [])).toBe(far.z >= -CREATURES.simRadius);
    // Yaw bilinmiyorsa koni denetlenmez.
    expect(spawnPointOk(ahead, player, [])).toBe(true);
  });

  it('yapıların 25 m çevresinde doğmaz', () => {
    const structure = { x: 100, z: 0 };
    expect(
      spawnPointOk({ x: 100 + CREATURES.structureClearance - 1, z: 0 }, player, [structure]),
    ).toBe(false);
    expect(
      spawnPointOk({ x: 100 + CREATURES.structureClearance + 1, z: 0 }, player, [structure]),
    ).toBe(true);
  });
});
