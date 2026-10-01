import { beforeAll, describe, expect, it } from 'vitest';
import { WORLD } from '../src/config';
import { loadRegion, type RegionData } from '../src/data/region';
import { loadWorld } from '../src/data/world';
import { publicFsFetch } from './helpers/fsFetch';

/**
 * Golden test (Faz 7.2): eski bölge karolara bölününce `loadWorld` çıktısı eski `loadRegion` çıktısıyla
 * **birebir** aynıdır. 7.4'te yeni alan eklenip dünya geneli yükseklik aralığı değişince bu test A'nın
 * belirleyeceği toleransa (≤ 1 nicem) çevrilir.
 */
let legacy: RegionData;
let world: RegionData;

beforeAll(async () => {
  const fetchFn = publicFsFetch();
  legacy = await loadRegion(WORLD.legacyRegionId, '/', fetchFn);
  world = await loadWorld(WORLD.id, '/', fetchFn);
});

describe('eski bölge ↔ karolu dünya (bit-eşdeğer)', () => {
  it('ızgara boyutu ve orijin: gridOrigin eski merkezli orijinle aynı', () => {
    expect(world.meta.gridWidth).toBe(legacy.meta.gridWidth);
    expect(world.meta.gridHeight).toBe(legacy.meta.gridHeight);
    expect(world.meta.gridOrigin).toEqual(legacy.meta.gridOrigin);
    expect(world.meta.originUtm).toEqual(legacy.meta.originUtm);
    expect(world.meta.cellSizeReal).toBe(legacy.meta.cellSizeReal);
    expect(world.meta.horizontalScale).toBe(legacy.meta.horizontalScale);
    expect(world.meta.crs).toBe(legacy.meta.crs);
  });

  it('yükseklik aralığı eskisiyle aynı', () => {
    expect(world.meta.elevationMin).toBe(legacy.meta.elevationMin);
    expect(world.meta.elevationMax).toBe(legacy.meta.elevationMax);
  });

  it('yükseklikler birebir aynı', () => {
    expect(world.heights).toHaveLength(legacy.heights.length);
    expect(
      Buffer.compare(Buffer.from(world.heights.buffer), Buffer.from(legacy.heights.buffer)),
    ).toBe(0);
  });

  it('arazi örtüsü birebir aynı', () => {
    expect(legacy.landcover).not.toBeNull();
    expect(world.landcover).not.toBeNull();
    expect(Buffer.compare(Buffer.from(world.landcover!), Buffer.from(legacy.landcover!))).toBe(0);
    expect(world.meta.landcover?.classes).toEqual(legacy.meta.landcover?.classes);
  });

  it('iller ve özellikler (su) birebir aynı', () => {
    expect(world.provinces).toEqual(legacy.provinces);
    expect(world.features).toEqual(legacy.features);
    expect(world.meta.features).toEqual(legacy.meta.features);
  });
});
