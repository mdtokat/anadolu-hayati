import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial } from 'three';
import { ChunkManager } from '../src/world/ChunkManager';
import { chunkIndexAt } from '../src/world/chunks';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { TileStreamer, distanceToRect, type StreamerHooks } from '../src/world/TileStreamer';
import { loadRealRegion } from './helpers/realRegion';

/** 3 × 1 karolu sentetik dünya: karolar 1000 m genişliğinde, x = 0…3000. */
function makeStreamer(overrides: Partial<StreamerHooks<number>> = {}) {
  const log: string[] = [];
  const resolvers = new Map<string, (v: number) => void>();
  const rejecters = new Map<string, (e: unknown) => void>();
  const hooks: StreamerHooks<number> = {
    tiles: [0, 1, 2].map((tx) => ({
      tx,
      ty: 0,
      rect: { minX: tx * 1000, maxX: tx * 1000 + 1000, minZ: 0, maxZ: 1000 },
    })),
    fetch: (tx, ty) =>
      new Promise<number>((resolve, reject) => {
        log.push(`fetch ${tx},${ty}`);
        resolvers.set(`${tx},${ty}`, resolve);
        rejecters.set(`${tx},${ty}`, reject);
      }),
    activate: (tx, ty) => {
      log.push(`activate ${tx},${ty}`);
      return true;
    },
    release: (tx, ty) => log.push(`release ${tx},${ty}`),
    ...overrides,
  };
  const streamer = new TileStreamer<number>(hooks, {
    loadRadius: 300,
    unloadRadius: 600,
    maxResident: 2,
    maxFetches: 1,
  });
  return {
    streamer,
    log,
    resolve: (tx: number) => resolvers.get(`${tx},0`)?.(1),
    reject: (tx: number) => rejecters.get(`${tx},0`)?.(new Error('ağ')),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('TileStreamer', () => {
  it('uzaklık: içerideki nokta 0, dışarıdaki dikdörtgene olan uzaklık', () => {
    const rect = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    expect(distanceToRect(rect, 5, 5)).toBe(0);
    expect(distanceToRect(rect, 13, 14)).toBe(5);
  });

  it('yalnız yarıçap içindeki karo istenir; eşzamanlı indirme maxFetches ile sınırlı', async () => {
    const { streamer, log, resolve } = makeStreamer();
    streamer.update([{ x: 900, z: 500 }]); // karo 0'a 0, karo 1'e 0 (900 karo 0'da), karo 1: 100 m
    expect(log).toEqual(['fetch 0,0']); // maxFetches = 1
    resolve(0);
    await tick();
    streamer.update([{ x: 900, z: 500 }]);
    expect(log).toContain('activate 0,0');
    expect(log).toContain('fetch 1,0');
    expect(streamer.isTileReady(0, 0)).toBe(true);
    expect(streamer.isReady(900, 500, 0)).toBe(true);
    expect(streamer.isReady(900, 500, 300)).toBe(false); // karo 1 henüz hazır değil
  });

  it('hazır olma tüm dünya karoları üzerinden: dünya dışındaki alan beklemez', async () => {
    const { streamer, resolve } = makeStreamer();
    streamer.update([{ x: 100, z: 500 }]);
    resolve(0);
    await tick();
    streamer.update([{ x: 100, z: 500 }]);
    // Karo 0 hazır, karo 1 (900 m uzakta) yarıçap dışında: 200 m'lik diske yalnız karo 0 değer.
    expect(streamer.isReady(100, 500, 200)).toBe(true);
  });

  it('histerezis: yükleme yarıçapını aşınca boşalmaz, boşaltma yarıçapını aşınca boşalır', async () => {
    const { streamer, log, resolve } = makeStreamer();
    streamer.update([{ x: 100, z: 500 }]);
    resolve(0);
    await tick();
    streamer.update([{ x: 100, z: 500 }]);
    log.length = 0;
    streamer.update([{ x: 400, z: 500 }]); // karo 0'a 0 m (karo 0: 0–1000)
    streamer.update([{ x: 1500, z: 500 }]); // karo 0'a 500 m: yükleme (300) dışında ama boşaltma (600) içinde
    expect(log).not.toContain('release 0,0');
    streamer.update([{ x: 1700, z: 500 }]); // karo 0'a 700 m
    expect(log).toContain('release 0,0');
    expect(streamer.isTileReady(0, 0)).toBe(false);
  });

  it('indirme hatasında karo atlanır, bir süre sonra yeniden denenir', async () => {
    const errors: number[] = [];
    const { streamer, log, reject } = makeStreamer({ onError: (tx) => errors.push(tx) });
    streamer.update([{ x: 100, z: 500 }]);
    reject(0);
    await tick();
    expect(errors).toEqual([0]);
    log.length = 0;
    streamer.update([{ x: 100, z: 500 }]);
    expect(log).toEqual([]); // hemen yeniden denenmez
    for (let i = 0; i < 130; i++) streamer.update([{ x: 100, z: 500 }]);
    expect(log).toContain('fetch 0,0');
  });

  it('dilimli etkinleştirme: karo, activate true dönene kadar hazır olmaz', async () => {
    let calls = 0;
    const { streamer, resolve } = makeStreamer({ activate: () => ++calls >= 3 });
    streamer.update([{ x: 100, z: 500 }]);
    resolve(0);
    await tick();
    streamer.update([{ x: 100, z: 500 }]);
    expect(calls).toBe(3); // bütçe yok: tüm dilimler bu güncellemede
    expect(streamer.isTileReady(0, 0)).toBe(true);
    expect(streamer.version).toBeGreaterThan(0);
  });
});

describe('ChunkManager akış kipi', () => {
  it('karosu hazır olmayan chunk en kaba LOD ile ve genel bakış materyaliyle kurulur, hazır olunca incelir', async () => {
    const source = RegionHeightSource.fromRegion(await loadRealRegion());
    const overview = new MeshBasicMaterial();
    const tileMaterial = new MeshBasicMaterial();
    let ready = false;
    const manager = new ChunkManager(source, overview, {
      resident: () => ready,
      materialFor: (_cx, _cy, lod) => (lod >= 3 ? overview : tileMaterial),
      maxBuildsPerFrame: 5000,
    });
    manager.update(0, 0, Infinity);
    const own = chunkIndexAt(manager.grid, 0, 0);
    expect(manager.lodOf(own.cx, own.cy)).toBe(3);
    ready = true;
    manager.update(0, 0, Infinity);
    expect(manager.lodOf(own.cx, own.cy)).toBe(0);
    const mesh = manager.group.children.find(
      (m) => m.name === `chunk-${own.cx}-${own.cy}`,
    ) as unknown as { material: unknown };
    expect(mesh.material).toBe(tileMaterial);
    manager.dispose();
  }, 60_000);
});
