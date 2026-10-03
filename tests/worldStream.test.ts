import { beforeAll, describe, expect, it } from 'vitest';
import { STREAMING, WORLD } from '../src/config';
import type { RegionData } from '../src/data/region';
import { loadWorldStream, type StreamedWorldData } from '../src/data/worldStreamLoader';
import { PhysicsWorld, initPhysics } from '../src/physics/PhysicsWorld';
import { latLonToGame } from '../src/world/geo';
import { RegionWorld } from '../src/world/RegionWorld';
import { loadRealWorld } from './helpers/realRegion';
import { bakedWorld, loadStreamedWorld, streamFetch } from './helpers/streamWorld';

let region: RegionData;
let streamed: StreamedWorldData;

beforeAll(async () => {
  await initPhysics();
  region = await loadRealWorld();
  streamed = await loadStreamedWorld();
}, 600_000);

const at = (lat: number, lon: number) => latLonToGame(lat, lon, region.meta.originUtm);

describe('loadWorldStream', () => {
  it('stream.json yoksa null döner (eski tam bellek yolu)', async () => {
    const baked = await bakedWorld();
    const inner = streamFetch(baked);
    const none = await loadWorldStream(WORLD.id, '/', async (url) =>
      url.includes('stream.json')
        ? {
            ok: false,
            status: 404,
            json: async () => null,
            arrayBuffer: async () => new ArrayBuffer(0),
          }
        : inner(url),
    );
    expect(none).toBeNull();
  });

  it('bozuk karo dosyası sha256 ile reddedilir', async () => {
    const baked = await bakedWorld();
    const data = await loadWorldStream(
      WORLD.id,
      '/',
      streamFetch(baked, (p) => p === 't_0_0.bin' || p.endsWith('t_0_0.bin')),
    );
    await expect(data!.fetchTile(0, 0)).rejects.toThrow(/sha256/);
  });

  it('meta, il sınırları ve su vektörleri yoğun yüklemeyle aynı', () => {
    expect(streamed.meta).toEqual(region.meta);
    expect(streamed.provinces.length).toBe(region.provinces.length);
    expect(streamed.features?.water.lines.length).toBe(region.features?.water.lines.length);
    expect(streamed.features?.minorStreams?.length).toBe(region.features?.minorStreams?.length);
  });
});

describe('RegionWorld akış kipi', () => {
  it('açılışta karo yok; preload sonrası çevre hazır, zemin yoğun dünyayla aynı, collider kurulu', async () => {
    const physics = new PhysicsWorld();
    const world = new RegionWorld(streamed, physics);
    expect(world.tileStats.streaming).toBe(true);
    expect(world.tileStats.ready).toBe(0);
    expect(world.isReadyAt(world.spawn.x, world.spawn.z)).toBe(false);
    // Tüm arazi genel bakıştan çizilir (karo olmadan da dünya görünür).
    expect(world.stats.chunks).toBeGreaterThan(500);

    const p = at(41.45, 31.8); // Zonguldak
    await world.preload(p.x, p.z);
    expect(world.isReadyAt(p.x, p.z)).toBe(true);
    expect(world.tileStats.ready).toBeGreaterThan(0);
    expect(world.tileStats.materials).toBe(world.tileStats.ready);
    expect(world.stats.colliders).toBeGreaterThan(0);

    const dense = new RegionWorld(region, new PhysicsWorld());
    for (const [dx, dz] of [
      [0, 0],
      [40, 30],
      [-120, 90],
      [200, -150],
    ] as const) {
      expect(world.source.heightAt(p.x + dx, p.z + dz)).toBe(
        dense.source.heightAt(p.x + dx, p.z + dz),
      );
    }
    // Yerleşim haritası ve nesneler yoğun dünyayla aynı.
    expect(world.settlementMap?.buildings.length).toBe(dense.settlementMap?.buildings.length);
    const near = world
      .propsNear(p.x, p.z, 120)
      .map((r) => r.id)
      .sort((a, b) => a - b);
    const denseNear = dense
      .propsNear(p.x, p.z, 120)
      .map((r) => r.id)
      .sort((a, b) => a - b);
    expect(near.length).toBeGreaterThan(0);
    expect(near).toEqual(denseNear);
    dense.dispose();
    world.dispose();
    physics.dispose();
  }, 300_000);

  it('uzağa ışınlanınca eski karolar boşalır, bellek tavanı aşılmaz', async () => {
    const physics = new PhysicsWorld();
    const world = new RegionWorld(streamed, physics);
    world.frameBudgetMs = Number.POSITIVE_INFINITY;
    const a = at(41.45, 31.8); // Zonguldak
    const b = at(41.38, 33.78); // Kastamonu (3 km+ doğuda)
    await world.preload(a.x, a.z);
    const tileA = world.source.tileAt(a.x, a.z);
    expect(world.source.hasTile(tileA.tx, tileA.ty)).toBe(true);
    await world.preload(b.x, b.z);
    // Boşaltma: eski odak 1900 m dışında kalan karolar kalkar (birkaç güncellemede).
    for (let i = 0; i < 5; i++) world.update(b.x, b.z, i);
    expect(world.source.hasTile(tileA.tx, tileA.ty)).toBe(false);
    expect(world.source.tileCount).toBeLessThanOrEqual(STREAMING.tiles.maxResident);
    expect(world.isReadyAt(b.x, b.z)).toBe(true);
    // Boşaltılan karonun yeri genel bakıştan çizilmeye devam eder (delik yok).
    expect(Number.isFinite(world.source.heightAt(a.x, a.z))).toBe(true);
    world.dispose();
    physics.dispose();
  }, 300_000);
});
