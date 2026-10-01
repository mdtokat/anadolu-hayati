import { beforeAll, describe, expect, it } from 'vitest';
import { WORLD } from '../src/config';
import { loadRegion, type RegionData } from '../src/data/region';
import { loadWorld } from '../src/data/world';
import { publicFsFetch } from './helpers/fsFetch';

/**
 * Golden test (Faz 7.2 → 7.4): eski bölge (Faz 6 verisi) ile karolu dünyanın **eski alana düşen kısmı** uyumludur.
 *  - 7.2'de dünya yalnızca eski alanı kapsıyordu ve çıktı bit-eşdeğerdi.
 *  - 7.4'te yeni alan eklendi: dünya geneli yükseklik aralığı büyüdü (en yüksek nokta 1996 m → 2368 m), bu yüzden
 *    yükseklikler **≤ 1 nicem** (yeni aralıkta `max / 65535` m) farkla yeniden nicemlendi; eski alan, eskiyle aynı
 *    örnekleme penceresinde yeniden hesaplanır (`tools/build_world.py` `PINNED_WINDOWS`), arazi örtüsü birebir aynıdır.
 */
let legacy: RegionData;
let world: RegionData;

/** Eski ızgaranın (0, 0) örneğinin birleştirilmiş dünya dizisindeki sütun/satırı. */
let col0: number;
let row0: number;

beforeAll(async () => {
  const fetchFn = publicFsFetch();
  legacy = await loadRegion(WORLD.legacyRegionId, '/', fetchFn);
  world = await loadWorld(WORLD.id, '/', fetchFn);
  col0 = Math.round((legacy.meta.gridOrigin.x - world.meta.gridOrigin.x) / 2);
  row0 = Math.round((legacy.meta.gridOrigin.z - world.meta.gridOrigin.z) / 2);
});

describe('eski bölge ↔ karolu dünya (eski alan)', () => {
  it('orijin, ölçek ve kafes: eski ızgara dünya dizisinin içinde, kafese oturur', () => {
    expect(world.meta.originUtm).toEqual(legacy.meta.originUtm);
    expect(world.meta.cellSizeReal).toBe(legacy.meta.cellSizeReal);
    expect(world.meta.horizontalScale).toBe(legacy.meta.horizontalScale);
    expect(world.meta.crs).toBe(legacy.meta.crs);
    expect(col0).toBeGreaterThanOrEqual(0);
    expect(row0).toBeGreaterThanOrEqual(0);
    expect(col0 + legacy.meta.gridWidth).toBeLessThanOrEqual(world.meta.gridWidth);
    expect(row0 + legacy.meta.gridHeight).toBeLessThanOrEqual(world.meta.gridHeight);
    // Konumlar kafes hücresinin tam katı kadar kayar (gridOrigin farkı hücrenin tam katı).
    expect(legacy.meta.gridOrigin.x - world.meta.gridOrigin.x).toBe(col0 * 2);
    expect(legacy.meta.gridOrigin.z - world.meta.gridOrigin.z).toBe(row0 * 2);
  });

  it('dünya geneli yükseklik aralığı eskiyi kapsar', () => {
    expect(world.meta.elevationMin).toBe(legacy.meta.elevationMin);
    expect(world.meta.elevationMax).toBeGreaterThanOrEqual(legacy.meta.elevationMax);
  });

  it('yükseklikler ≤ 1 nicem (yeni aralıkta) farkla aynı', () => {
    const { gridWidth, gridHeight } = legacy.meta;
    const oldScale = legacy.meta.elevationMax / 65535;
    const newScale = world.meta.elevationMax / 65535;
    let worst = 0;
    for (let r = 0; r < gridHeight; r++) {
      for (let c = 0; c < gridWidth; c++) {
        const oldMeters = (legacy.heights[r * gridWidth + c] as number) * oldScale;
        const newMeters =
          (world.heights[(row0 + r) * world.meta.gridWidth + (col0 + c)] as number) * newScale;
        worst = Math.max(worst, Math.abs(newMeters - oldMeters));
      }
    }
    expect(worst).toBeLessThanOrEqual(newScale + 1e-9);
  });

  it('arazi örtüsü birebir aynı', () => {
    expect(legacy.landcover).not.toBeNull();
    expect(world.landcover).not.toBeNull();
    const { gridWidth, gridHeight } = legacy.meta;
    let differing = 0;
    for (let r = 0; r < gridHeight; r++) {
      for (let c = 0; c < gridWidth; c++) {
        if (
          legacy.landcover?.[r * gridWidth + c] !==
          world.landcover?.[(row0 + r) * world.meta.gridWidth + (col0 + c)]
        ) {
          differing++;
        }
      }
    }
    expect(differing).toBe(0);
    expect(world.meta.landcover?.classes).toEqual(legacy.meta.landcover?.classes);
  });

  it('eski illerin hepsi yeni dünyada var; eski hedef iller hedef kalır, Düzce ve Bolu artık hedef', () => {
    const byName = new Map(world.provinces.map((p) => [p.name, p]));
    for (const old of legacy.provinces) expect(byName.has(old.name), old.name).toBe(true);
    for (const old of legacy.provinces.filter((p) => p.inRegion)) {
      expect(byName.get(old.name)?.inRegion, old.name).toBe(true);
    }
    expect(byName.get('Düzce')?.inRegion).toBe(true);
    expect(byName.get('Bolu')?.inRegion).toBe(true);
  });

  it('eski su özellikleri korunur: adlı göller ve akarsu çizgileri yeni dünyada da var', () => {
    const oldWater = legacy.features?.water;
    const newWater = world.features?.water;
    expect(oldWater).toBeDefined();
    expect(newWater).toBeDefined();
    const newLakes = new Set((newWater?.polygons ?? []).map((p) => `${p.kind}:${p.name ?? ''}`));
    for (const lake of (oldWater?.polygons ?? []).filter((p) => p.name)) {
      expect(newLakes.has(`${lake.kind}:${lake.name}`), `${lake.kind} ${lake.name}`).toBe(true);
    }
    expect(newWater?.lines.length).toBeGreaterThan(oldWater?.lines.length ?? 0);
    expect(world.meta.features).toEqual(legacy.meta.features);
  });
});
