import { scatterWaterOf } from '../src/data/waterThinning';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BufferGeometry, InstancedMesh, Material } from 'three';
import { FRESH_WATER, SCATTER, TELEPORTS } from '../src/config';
import type { RegionData } from '../src/data/region';
import { latLonToGame } from '../src/world/geo';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { PropLayer } from '../src/world/PropLayer';
import { PROP_KINDS } from '../src/world/propKinds';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealRegion } from './helpers/realRegion';

/** three nesnelerinin ortak `dispose` olayı (tip birleşimi çağrılamadığından dar arayüz). */
interface Disposable {
  addEventListener(type: 'dispose', listener: () => void): void;
}

let region: RegionData;
let source: RegionHeightSource;
let cover: LandCoverMap;
let water: FreshWaterIndex;
/** Yenice çevresi (yoğun orman) ve Zonguldak (kıyı/yerleşim). */
let forest: { x: number; z: number };
let coast: { x: number; z: number };

function makeLayer(): PropLayer {
  return new PropLayer(source, cover, water);
}

beforeAll(async () => {
  region = await loadRealRegion();
  source = RegionHeightSource.fromRegion(region);
  cover = LandCoverMap.fromRegion(region)!;
  water = new FreshWaterIndex(scatterWaterOf(region.features!), FRESH_WATER.indexCellSize);
  forest = latLonToGame(41.2, 32.34, region.meta.originUtm);
  coast = latLonToGame(TELEPORTS[0].lat, TELEPORTS[0].lon, region.meta.originUtm);
}, 60_000);

describe('PropLayer', () => {
  it("prepare çizim yarıçapındaki chunk'ları senkron kurar; ormanda çok örnek çizilir", () => {
    const layer = makeLayer();
    layer.prepare(forest.x, forest.z);
    const stats = layer.stats;
    expect(stats.activeChunks).toBeGreaterThan(0);
    expect(stats.loadedChunks).toBe(stats.activeChunks);
    expect(stats.pendingChunks).toBe(0);
    expect(stats.instances).toBeGreaterThan(2000);
    expect(stats.meshes).toBeGreaterThan(3);
    expect(Object.values(stats.byKind).reduce((a, b) => a + b, 0)).toBe(stats.instances);
    layer.dispose();
  });

  it('örnek sayısı tür kapasitesini aşmaz; draw call en çok mesh sayısı kadar', () => {
    const layer = makeLayer();
    layer.prepare(forest.x, forest.z);
    for (const kind of PROP_KINDS) {
      const spec = SCATTER.kinds[kind];
      const cap = spec.farLod ? spec.maxInstances * 2 : spec.maxInstances;
      expect(layer.stats.byKind[kind]).toBeLessThanOrEqual(cap);
    }
    // 10 tür; 6'sının uzak kademesi var → en çok 16 mesh (plan: ≤ +20 draw call)
    expect(layer.group.children.length).toBeLessThanOrEqual(20);
    expect(layer.stats.meshes).toBeLessThanOrEqual(layer.group.children.length);
    layer.dispose();
  });

  it("bütçeli update chunk'ları kademeli hesaplar ve sonunda prepare ile aynı duruma varır", () => {
    const layer = makeLayer();
    layer.update(forest.x, forest.z);
    expect(layer.stats.loadedChunks).toBeLessThanOrEqual(SCATTER.maxChunkBuildsPerFrame);
    expect(layer.stats.pendingChunks).toBeGreaterThan(0);

    for (let i = 0; i < 200 && layer.stats.pendingChunks > 0; i++) layer.update(forest.x, forest.z);
    expect(layer.stats.pendingChunks).toBe(0);

    const reference = makeLayer();
    reference.prepare(forest.x, forest.z);
    expect(layer.stats.instances).toBe(reference.stats.instances);
    expect(layer.stats.byKind).toEqual(reference.stats.byKind);
    layer.dispose();
    reference.dispose();
  });

  it('propsNear yakından uzağa sıralı, yarıçap içinde ve çizilenle tutarlı', () => {
    const layer = makeLayer();
    layer.prepare(forest.x, forest.z);
    const refs = layer.propsNear(forest.x, forest.z, 50);
    expect(refs.length).toBeGreaterThan(10);
    let last = 0;
    for (const ref of refs) {
      const d = Math.hypot(ref.x - forest.x, ref.z - forest.z);
      expect(d).toBeLessThanOrEqual(50);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
      expect(PROP_KINDS).toContain(ref.kind);
      expect(ref.y).toBeCloseTo(source.heightAt(ref.x, ref.z), 3);
    }
    layer.dispose();
  });

  it('kimlikler yeniden yüklemede aynı nesneyi gösterir (aynı seed → aynı kimlik)', () => {
    const a = makeLayer();
    a.prepare(forest.x, forest.z);
    const first = a.propsNear(forest.x, forest.z, 30);
    a.dispose();

    const b = makeLayer();
    b.prepare(forest.x, forest.z);
    expect(b.propsNear(forest.x, forest.z, 30)).toEqual(first);
    b.dispose();
  });

  it('setPropDepleted nesneyi sorgudan ve çizimden çıkarır, geri getirir', () => {
    const layer = makeLayer();
    layer.prepare(forest.x, forest.z);
    const before = layer.stats.instances;
    const refs = layer.propsNear(forest.x, forest.z, 20);
    const target = refs.find((r) => SCATTER.kinds[r.kind].maxDistance >= SCATTER.nearRadius)!;
    expect(target).toBeDefined();

    layer.setPropDepleted(target.id, true);
    expect(layer.isPropDepleted(target.id)).toBe(true);
    expect(layer.propsNear(forest.x, forest.z, 20).some((r) => r.id === target.id)).toBe(false);
    layer.update(forest.x, forest.z); // dirty → yeniden doldurur
    expect(layer.stats.instances).toBe(before - 1);

    layer.setPropDepleted(target.id, false);
    layer.update(forest.x, forest.z);
    expect(layer.stats.instances).toBe(before);
    expect(layer.propsNear(forest.x, forest.z, 20).some((r) => r.id === target.id)).toBe(true);
    layer.dispose();
  });

  it('oyuncu uzaklaşınca önbellek kapasitesi aşılmaz; uzak nesneler çizilmez', () => {
    const layer = makeLayer();
    layer.prepare(forest.x, forest.z);
    layer.prepare(coast.x, coast.z);
    layer.prepare(forest.x + 1500, forest.z - 600);
    expect(layer.stats.loadedChunks).toBeLessThanOrEqual(SCATTER.chunkCacheSize);
    // çizilen her örnek odak çevresinde çizim yarıçapı içinde
    const focus = { x: forest.x + 1500, z: forest.z - 600 };
    for (const child of layer.group.children as InstancedMesh[]) {
      const m = child.instanceMatrix.array;
      for (let i = 0; i < child.count; i++) {
        const d = Math.hypot(
          (m[i * 16 + 12] as number) - focus.x,
          (m[i * 16 + 14] as number) - focus.z,
        );
        expect(d).toBeLessThanOrEqual(SCATTER.drawRadius + 1);
      }
    }
    layer.dispose();
  });

  it('dispose sonrası tüm geometri ve materyal dispose edilmiştir', () => {
    const layer = makeLayer();
    layer.prepare(forest.x, forest.z);

    const disposed = new Set<unknown>();
    const watch = (target: BufferGeometry | Material | InstancedMesh) => {
      (target as unknown as Disposable).addEventListener('dispose', () => disposed.add(target));
    };
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    for (const child of layer.group.children as InstancedMesh[]) {
      geometries.add(child.geometry);
      materials.add(child.material as Material);
      watch(child);
    }
    for (const g of geometries) watch(g);
    for (const m of materials) watch(m);
    expect(geometries.size).toBe(layer.group.children.length);

    layer.dispose();
    const disposedMeshes = [...disposed].filter((t) => (t as InstancedMesh).isInstancedMesh);
    expect(disposedMeshes).toHaveLength(geometries.size); // her mesh kendi geometrisine sahip
    expect(disposed.size).toBe(geometries.size * 2 + materials.size);
    for (const g of geometries) expect(disposed.has(g)).toBe(true);
    for (const m of materials) expect(disposed.has(m)).toBe(true);
    expect(layer.group.children).toHaveLength(0);
  });
});

describe('PropLayer.setDrawRadius', () => {
  it('yarıçapı küçültünce etkin chunk ve örnek sayısı azalır; geri açınca artar', () => {
    const layer = makeLayer();
    layer.prepare(forest.x, forest.z);
    const full = layer.stats;

    layer.setDrawRadius(SCATTER.drawRadius / 3);
    layer.update(forest.x, forest.z, Infinity);
    const small = layer.stats;
    expect(small.activeChunks).toBeLessThan(full.activeChunks);
    expect(small.instances).toBeLessThan(full.instances);

    layer.setDrawRadius(SCATTER.drawRadius);
    layer.update(forest.x, forest.z, Infinity);
    expect(layer.stats.activeChunks).toBe(full.activeChunks);
    expect(layer.stats.instances).toBe(full.instances);
    layer.dispose();
  });
});
