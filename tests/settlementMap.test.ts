import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER, SETTLEMENT_LAYOUT } from '../src/config';
import type { RegionData } from '../src/data/region';
import { BUILDING_SHAPES, MAX_BURY, isMosque } from '../src/settlements/kinds';
import { worldToBuildingLocal, SettlementMap } from '../src/settlements/SettlementMap';
import type { LayoutTerrain } from '../src/settlements/layout';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealWorld } from './helpers/realRegion';

let world: RegionData;
let terrain: LayoutTerrain;
let map: SettlementMap;
let buildMs = 0;

beforeAll(async () => {
  world = await loadRealWorld();
  const source = RegionHeightSource.fromRegion(world);
  const water = world.features
    ? new FreshWaterIndex(world.features.water, FRESH_WATER.indexCellSize)
    : null;
  terrain = {
    heightAt: (x, z) => source.heightAt(x, z),
    elevationAt: (x, z) => source.elevationAt(x, z),
    isWater: (x, z, c) => water?.nearest(x, z, c) != null,
  };
  const t0 = performance.now();
  map = new SettlementMap(world.settlements!, terrain);
  buildMs = performance.now() - t0;
}, 60_000);

describe('SettlementMap — gerçek dünya (Faz 10)', () => {
  it('veri yüklü: 5 il merkezi, 30 ilçe merkezi, seçilmiş köyler', () => {
    const ranks = { il: 0, ilce: 0, koy: 0 };
    for (const s of map.settlements) ranks[s.data.rank]++;
    expect(ranks.il).toBe(5);
    expect(ranks.ilce).toBe(30);
    expect(ranks.koy).toBeGreaterThan(200);
    const names = map.settlements.filter((s) => s.data.rank === 'il').map((s) => s.data.name);
    expect(names.sort()).toEqual(['Bartın', 'Bolu', 'Düzce', 'Karabük', 'Zonguldak']);
  });

  it('il merkezleri kalabalık, ilçeler orta, köyler küçük; harita evle dolmaz', () => {
    if (process.env.SETTLEMENT_REPORT) {
      for (const s of map.settlements.filter((v) => v.data.rank !== 'koy')) {
        const kinds: Record<string, number> = {};
        for (const b of s.buildings) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
        console.log(
          `${s.data.rank} ${s.data.name}: ${s.buildings.length} ${JSON.stringify(kinds)}`,
        );
      }
      console.log(`toplam ${map.buildings.length} bina, düzen ${buildMs.toFixed(0)} ms`);
    }
    for (const s of map.settlements) {
      expect(s.buildings.length).toBeLessThanOrEqual(SETTLEMENT_LAYOUT.maxBuildings[s.data.rank]);
      if (s.data.rank === 'il') expect(s.buildings.length).toBeGreaterThanOrEqual(25);
    }
    // ~1500 yapı, yalnızca kara alanının küçük bir kesiminde.
    expect(map.buildings.length).toBeGreaterThan(800);
    expect(map.buildings.length).toBeLessThan(4000);
  });

  it('her il ve ilçe merkezinde cami var (ayak izi çoğunlukla deniz olan Amasra/Kurucaşile hariç), camiler kıbleye döner', () => {
    const without = map.settlements
      .filter((s) => s.data.rank !== 'koy' && !s.buildings.some((b) => isMosque(b.kind)))
      .map((s) => s.data.name);
    expect(without.filter((n) => n !== 'Amasra' && n !== 'Kurucaşile')).toEqual([]);
    const yaws = new Set(
      map.buildings.filter((b) => isMosque(b.kind)).map((b) => b.yaw.toFixed(6)),
    );
    expect(yaws.size).toBe(1);
  });

  it('elle seçilmiş simge yapılar adlarıyla yerinde (Safranbolu, Bolu)', () => {
    const named = (town: string) =>
      map.settlements
        .find((s) => s.data.name === town)!
        .buildings.filter((b) => b.name)
        .map((b) => b.name);
    expect(named('Safranbolu')).toEqual(
      expect.arrayContaining(['Köprülü Mehmet Paşa Camii', 'Cinci Hanı']),
    );
    expect(named('Bolu')).toEqual(expect.arrayContaining(['Yıldırım Bayezid Camii']));
  });

  it('yapılar denize/tatlı suya oturmaz, yamaç sınırlarını aşmaz, çakışmaz', () => {
    for (const s of map.settlements) {
      const list = s.buildings;
      for (const b of list) {
        const shape = BUILDING_SHAPES[b.kind];
        expect(terrain.elevationAt(b.x, b.z)).toBeGreaterThanOrEqual(
          SETTLEMENT_LAYOUT.minElevationM,
        );
        expect(b.y - b.base).toBeLessThanOrEqual(SETTLEMENT_LAYOUT.maxTerrace + 1e-6);
        // Arka kenar en çok MAX_BURY kadar gömülü.
        const back = worldToBuildingLocal(b, b.x, b.z); // merkez
        expect(back.x).toBeCloseTo(0);
        const bx = b.x - Math.sin(b.yaw) * (shape.depth / 2);
        const bz = b.z - Math.cos(b.yaw) * (shape.depth / 2);
        expect(terrain.heightAt(bx, bz) - b.y).toBeLessThanOrEqual(MAX_BURY[b.kind] + 1e-6);
      }
      // Aynı yerleşimde iki yapının merkezleri iç içe değil.
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const c = list[j]!;
          if (a.kind === 'fountain' || c.kind === 'fountain') continue;
          const local = worldToBuildingLocal(a, c.x, c.z);
          const sa = BUILDING_SHAPES[a.kind];
          expect(Math.abs(local.x) < sa.width / 2 && Math.abs(local.z) < sa.depth / 2).toBe(false);
        }
      }
    }
  });

  it('deterministik ve hızlı (açılışta < 2 sn)', () => {
    const again = new SettlementMap(world.settlements!, terrain);
    expect(again.buildings.map((b) => `${b.id}:${b.kind}:${b.x.toFixed(3)}`)).toEqual(
      map.buildings.map((b) => `${b.id}:${b.kind}:${b.x.toFixed(3)}`),
    );
    expect(buildMs).toBeLessThan(2000);
    const ids = new Set(map.buildings.map((b) => b.id));
    expect(ids.size).toBe(map.buildings.length);
  });

  it('kent içinde il yolu yok, sokak ızgarası var; nesne eleme yolda ve yapıda', () => {
    const zonguldak = map.settlements.find((s) => s.data.name === 'Zonguldak')!;
    const b = zonguldak.buildings.find((v) => v.kind === 'apartment' || v.kind === 'house')!;
    expect(map.blocksProp(b.x, b.z)).toBe(true);
    expect(map.buildingAt(b.x, b.z)?.id).toBe(b.id);
    expect(map.roadLines.length).toBeGreaterThan(world.settlements!.roads.length * 0.5);
    // Yerleşim sorgusu
    expect(map.settlementAt(zonguldak.data.x, zonguldak.data.z)?.data.name).toBe('Zonguldak');
  });

  it('çeşmeler su verir, cami içi kutsal barınaktır', () => {
    const fountain = map.buildings.find((b) => b.kind === 'fountain')!;
    const spoutX = fountain.x + Math.sin(fountain.yaw) * 1;
    const spoutZ = fountain.z + Math.cos(fountain.yaw) * 1;
    expect(map.fountainNear(spoutX, spoutZ, 2)).not.toBeNull();
    const mosque = map.buildings.find((b) => b.kind === 'mosque')!;
    const inside = map.interiorAt(mosque.x, mosque.y + 0.1, mosque.z);
    expect(inside?.sacred).toBe(true);
    expect(map.interiorAt(mosque.x, mosque.y + 40, mosque.z)).toBeNull();
  });
});
