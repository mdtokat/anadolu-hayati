import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER } from '../src/config';
import { packBlob, packCompressed, unpackBlob, unpackCompressed } from '../src/data/bakedBlob';
import type { RegionData } from '../src/data/region';
import { bakeWorld, type BakeResult } from '../src/data/worldBake';
import {
  parseStreamManifest,
  type OverviewBlob,
  type SettlementBlob,
  type TileBlob,
} from '../src/data/worldStream';
import { SettlementMap } from '../src/settlements/SettlementMap';
import { restoreHoles } from '../src/world/roadTunnels';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { prepareDenseWorld, type PreparedWorld } from '../src/world/worldPrep';
import { loadRealWorld } from './helpers/realRegion';

let region: RegionData;
let baked: BakeResult;
let dense: PreparedWorld;

const blobOf = async <T>(path: string): Promise<T> => {
  const file = baked.files.find((f) => f.path === path);
  if (!file) throw new Error(`${path} yok`);
  return unpackCompressed<T>(file.bytes.slice().buffer as ArrayBuffer);
};

beforeAll(async () => {
  region = await loadRealWorld();
  baked = await bakeWorld(region, { bytes: 1, sha256: '0'.repeat(64) });
  // Bağımsız ikinci hesap: bake'in sonuçları belirlenimcidir ve oyunun açılış hesabıyla aynıdır.
  const water = region.features
    ? new FreshWaterIndex(region.features.water, FRESH_WATER.indexCellSize)
    : null;
  dense = prepareDenseWorld(region, water);
}, 600_000);

describe('bakedBlob', () => {
  it('tipli diziler ve iç içe nesneler gidiş-dönüşte aynı kalır (hizalı, kopyasız görünüm)', () => {
    const value = {
      a: 1,
      s: 'ğüş',
      nested: { f: new Float32Array([1.5, -2, 3.25]), u: new Uint16Array([7, 8]) },
      list: [new Float64Array([0.1, 0.2]), new Uint8Array([1, 2, 3]), new Int32Array(0)],
    };
    const bytes = packBlob(value);
    const out = unpackBlob<typeof value>(bytes.buffer as ArrayBuffer);
    expect(out.a).toBe(1);
    expect(out.s).toBe('ğüş');
    expect(Array.from(out.nested.f)).toEqual([1.5, -2, 3.25]);
    expect(out.nested.f).toBeInstanceOf(Float32Array);
    expect(Array.from(out.nested.u)).toEqual([7, 8]);
    expect(Array.from(out.list[0] as Float64Array)).toEqual([0.1, 0.2]);
    expect(Array.from(out.list[1] as Uint8Array)).toEqual([1, 2, 3]);
    expect((out.list[2] as Int32Array).length).toBe(0);
  });

  it('sıkıştırılmış kapsayıcı gidiş-dönüşte aynı kalır ve gerçekten küçülür', async () => {
    const big = { z: new Uint16Array(50_000).fill(1234), f: new Float32Array([0.5, 1.5]) };
    const packed = await packCompressed(big);
    expect(packed.length).toBeLessThan(packBlob(big).length / 10);
    const out = await unpackCompressed<typeof big>(packed.slice().buffer as ArrayBuffer);
    expect(out.z.length).toBe(50_000);
    expect(out.z[49_999]).toBe(1234);
    expect(Array.from(out.f)).toEqual([0.5, 1.5]);
  });
});

describe('bake çıktısı', () => {
  it('manifest geçerli; her dosyanın bayt sayısı ve sha256 değeri tutar', async () => {
    const manifest = parseStreamManifest(JSON.parse(JSON.stringify(baked.manifest)));
    expect(manifest.tiles.length).toBeGreaterThanOrEqual(50);
    const entries = [manifest.overview, manifest.settlements!, ...manifest.tiles];
    for (const e of entries) {
      const file = baked.files.find((f) => f.path === e.file)!;
      expect(file.bytes.length).toBe(e.bytes);
    }
    const digest = await crypto.subtle.digest('SHA-256', baked.files[0]!.bytes as BufferSource);
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(manifest.overview.sha256);
  });

  it('genel bakış dizisi yoğun kaynağın her 8. örneğidir', async () => {
    const overview = await blobOf<OverviewBlob>('stream/overview.bin');
    const reference = dense.source.buildOverview();
    expect(overview.heights.length).toBe(reference.length);
    for (let i = 0; i < reference.length; i += 97) expect(overview.heights[i]).toBe(reference[i]);
    expect(overview.cover.length).toBe(overview.cols * overview.rows);
  });

  it('tüm karolar pencere + yamalarla yoğun (düzeltilmiş) kaynakla bire bir aynı', async () => {
    const streamed = RegionHeightSource.streamed(
      region.meta,
      (await blobOf<OverviewBlob>('stream/overview.bin')).heights,
    );
    let patched = 0;
    for (const t of baked.manifest.tiles) {
      const blob = await blobOf<TileBlob>(t.file);
      streamed.loadTile(blob.tx, blob.ty, { ...blob.window, raw: blob.raw });
      streamed.patchTile(blob.tx, blob.ty, blob.patchIndices, blob.patchValues);
      patched += blob.patchIndices.length;
      const core = streamed.tileCore(blob.tx, blob.ty)!;
      for (let r = core.row0; r < core.row0 + core.rows; r += 4) {
        for (let c = core.col0; c < core.col0 + core.cols; c += 4) {
          expect(streamed.sample(c, r)).toBe(dense.source.sample(c, r));
        }
      }
      // Doğal yükseklik de aynı: nesne dağılımı bunu okur.
      const x = streamed.xAt(core.col0 + 40.5);
      const z = streamed.zAt(core.row0 + 40.5);
      expect(streamed.natural().heightAt(x, z)).toBe(dense.source.natural().heightAt(x, z));
      expect(streamed.scatterView().heightAt(x, z)).toBe(dense.source.scatterView().heightAt(x, z));
    }
    expect(patched).toBeGreaterThan(10_000);
    expect(streamed.graded).toBe(true);
  }, 300_000);

  it('baked yerleşim haritası hesaplananla aynı', async () => {
    const blob = await blobOf<SettlementBlob>('stream/settlements.bin');
    const hydrated = new SettlementMap(blob.map);
    const map = dense.settlementMap!;
    expect(hydrated.settlements.length).toBe(map.settlements.length);
    expect(hydrated.buildings.length).toBe(map.buildings.length);
    expect(hydrated.buildings.length).toBeGreaterThan(4000);
    map.buildings.forEach((b, i) => expect(hydrated.buildings[i]).toEqual(b));
    map.settlements.forEach((s, i) => {
      const h = hydrated.settlements[i]!;
      expect(h.data.id).toBe(s.data.id);
      expect(h.data.name).toBe(s.data.name);
      expect(h.radius).toBe(s.radius);
    });
    expect(hydrated.stairs).toEqual(map.stairs);
    expect(hydrated.roadLines.length).toBe(map.roadLines.length);
    expect(hydrated.paintLines.length).toBe(map.paintLines.length);
    map.roadLines.forEach((road, i) => {
      const h = hydrated.roadLines[i]!;
      expect(h.cls).toBe(road.cls);
      expect(Array.from(h.xz)).toEqual(Array.from(road.xz));
    });
    expect(hydrated.plan.spans).toEqual(map.plan.spans);
    expect(hydrated.plan.roads.length).toBe(map.plan.roads.length);
    map.plan.roads.forEach((road, i) => {
      const h = hydrated.plan.roads[i]!;
      expect(h.cls).toBe(road.cls);
      expect(h.step).toBe(road.step);
      expect(Array.from(h.bed)).toEqual(Array.from(road.bed));
      expect(Array.from(h.kind)).toEqual(Array.from(road.kind));
    });
    // Sorgular: yapı, ayak izi, yol dizini ve yerleşim.
    for (const b of map.buildings.filter((_, i) => i % 40 === 0)) {
      for (const [dx, dz] of [
        [0, 0],
        [3, 2],
        [-6, 5],
        [12, -9],
      ] as const) {
        const x = b.x + dx;
        const z = b.z + dz;
        expect(hydrated.buildingAt(x, z, 0.5)?.id ?? null).toBe(
          map.buildingAt(x, z, 0.5)?.id ?? null,
        );
        expect(hydrated.blocksProp(x, z, 0.8)).toBe(map.blocksProp(x, z, 0.8));
        expect(hydrated.roads.onRoad(x, z, 2)).toBe(map.roads.onRoad(x, z, 2));
        expect(hydrated.settlementAt(x, z)?.data.id ?? null).toBe(
          map.settlementAt(x, z)?.data.id ?? null,
        );
      }
    }
    // Tünel delikleri.
    const holes = restoreHoles(region.meta.gridWidth, blob.holes);
    expect(holes.count).toBe(dense.holes!.count);
    for (let i = 0; i + 1 < blob.holes.length; i += 2) {
      expect(dense.holes!.has(blob.holes[i] as number, blob.holes[i + 1] as number)).toBe(true);
    }
  });
});
