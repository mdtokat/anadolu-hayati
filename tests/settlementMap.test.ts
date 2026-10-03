import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER, SETTLEMENT_LAYOUT } from '../src/config';
import type { RegionData } from '../src/data/region';
import { BUILDING_OVERHANG, BUILDING_SHAPES, MAX_BURY, isMosque } from '../src/settlements/kinds';
import { boxCorners, quadsOverlap, type OrientedBox } from '../src/settlements/footprints';
import {
  buildingLocalToWorld,
  worldToBuildingLocal,
  SettlementMap,
} from '../src/settlements/SettlementMap';
import type { Building } from '../src/settlements/layout';
import { noMosqueTowns, targetProvinces } from './helpers/groups';
import { loadRealWorld } from './helpers/realRegion';
import { buildSettlementWorld, type SettlementWorld } from './helpers/settlementWorld';

let world: RegionData;
let terrain: SettlementWorld['terrain'];
let map: SettlementMap;
let buildMs = 0;

beforeAll(async () => {
  world = await loadRealWorld();
  const built = buildSettlementWorld(world);
  terrain = built.terrain;
  map = built.map;
  buildMs = built.buildMs;
}, 60_000);

describe('SettlementMap — gerçek dünya (Faz 10)', () => {
  it('veri yüklü: her hedef ilin il merkezi, ilçe merkezleri ve seçilmiş köyler', () => {
    const ranks = { il: 0, ilce: 0, koy: 0 };
    for (const s of map.settlements) ranks[s.data.rank]++;
    const targets = targetProvinces(world);
    expect(ranks.il).toBe(targets.length);
    expect(ranks.ilce).toBeGreaterThanOrEqual(ranks.il * 2);
    expect(ranks.koy).toBeGreaterThan(ranks.il * 20);
    const names = map.settlements.filter((s) => s.data.rank === 'il').map((s) => s.data.name);
    expect(names.sort()).toEqual(targets);
    // Yerleşimler yalnızca hedef illerde.
    for (const s of map.settlements) expect(targets, s.data.name).toContain(s.data.province);
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
      // Zonguldak dik kıyı kasabasıdır ve büyütülmüş ayak izi Kozlu'yla örtüşür: üst üste binme yasaklanınca ~23 yapı.
      // Samsun (13) ve Ankara (41) gibi büyükşehirlerde ilçeler çekirdeği önce alır (düzen sırası ilçe → il): alt sınır 12.
      if (s.data.rank === 'il') expect(s.buildings.length).toBeGreaterThanOrEqual(12);
    }
    // Il başına ~550 yapı (9 ilde ~5 000), yalnızca kara alanının küçük bir kesiminde.
    const provinceCount = targetProvinces(world).length;
    expect(map.buildings.length).toBeGreaterThan(90 * provinceCount);
    expect(map.buildings.length).toBeLessThan(720 * provinceCount);
  });

  it('her il ve ilçe merkezinde cami var (ayak izi çoğunlukla deniz/dik kıyı olan kıyı kasabaları hariç), camiler kıbleye döner', () => {
    const without = map.settlements
      .filter((s) => s.data.rank !== 'koy' && !s.buildings.some((b) => isMosque(b.kind)))
      .map((s) => s.data.name);
    // Ayak izi çoğunlukla deniz (Amasra, Kurucaşile) ya da denize inen dik yamaçta dar şerit olan kıyı kasabaları
    // (Kastamonu, Sinop …): en küçük (ahşap) cami bile sığmaz (bilinçli istisna). Liste tools/groups/*.yaml
    // `no_mosque_towns` alanındadır (her grup kendi istisnalarını kendi dosyasına yazar).
    const coastal = new Set(noMosqueTowns());
    expect(without.filter((n) => !coastal.has(n))).toEqual([]);
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
        // Arka kenar en çok MAX_BURY kadar gömülü (komşu terasların şevi 2 m'lik hücrelerde kenarı en çok birkaç metre oynatabilir).
        const back = worldToBuildingLocal(b, b.x, b.z); // merkez
        expect(back.x).toBeCloseTo(0);
        const bx = b.x - Math.sin(b.yaw) * (shape.depth / 2);
        const bz = b.z - Math.cos(b.yaw) * (shape.depth / 2);
        expect(terrain.heightAt(bx, bz) - b.y).toBeLessThanOrEqual(
          MAX_BURY[b.kind] + SETTLEMENT_LAYOUT.buryTolerance + 1e-6,
        );
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

  it('görsel ayak izleri (saçak, merdiven dahil) yerleşimler arasında da çakışmaz; yapılar akarsuya değmez', () => {
    const boxOf = (b: Building, extra = 0): OrientedBox => ({
      x: b.x,
      z: b.z,
      hx: BUILDING_SHAPES[b.kind].width / 2 + BUILDING_OVERHANG[b.kind].x + extra,
      hz: BUILDING_SHAPES[b.kind].depth / 2 + BUILDING_OVERHANG[b.kind].z + extra,
      yaw: b.yaw,
    });
    let pairs = 0;
    for (const a of map.buildings) {
      const ca = boxCorners(boxOf(a));
      for (const b of map.buildingsNear(a.x, a.z, 70)) {
        if (b.id <= a.id || a.kind === 'fountain' || b.kind === 'fountain') continue;
        pairs++;
        expect(quadsOverlap(ca, boxCorners(boxOf(b))), `${a.id}/${b.id}`).toBe(false);
      }
      // Ayak izi köşeleri ve merkezi akarsu/göl dışında (nehir yarı genişliği + pay).
      const shape = BUILDING_SHAPES[a.kind];
      for (const [lx, lz] of [
        [0, 0],
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ] as const) {
        const p = buildingLocalToWorld(a, lx * shape.width, lz * shape.depth);
        expect(terrain.isWater(p.x, p.z, FRESH_WATER.lineWidth.river / 2)).toBe(false);
      }
    }
    expect(pairs).toBeGreaterThan(1000);
    // Merdivenler başka yapıya girmez ve ayrılan yeri aşmaz.
    for (const stair of map.stairs) {
      const owner = map.building(stair.building)!;
      expect(stair.run).toBeLessThanOrEqual(owner.stairRun + 1e-6);
      const shape = BUILDING_SHAPES[owner.kind];
      const box: OrientedBox = {
        ...buildingLocalToWorld(owner, shape.door.x, shape.depth / 2 + stair.run / 2),
        hx: stair.width / 2,
        hz: stair.run / 2,
        yaw: owner.yaw,
      };
      for (const b of map.buildingsNear(stair.x, stair.z, 50)) {
        if (b.id === owner.id) continue;
        expect(
          quadsOverlap(boxCorners(box), boxCorners(boxOf(b))),
          `merdiven ${owner.id}→${b.id}`,
        ).toBe(false);
      }
    }
  });

  it('yollar ve sokaklar yapıların ayak izinden geçmez', () => {
    for (const b of map.buildings) {
      const shape = BUILDING_SHAPES[b.kind];
      for (let u = -0.4; u <= 0.41; u += 0.2) {
        for (let v = -0.4; v <= 0.41; v += 0.2) {
          const p = buildingLocalToWorld(b, u * shape.width, v * shape.depth);
          expect(map.roads.onRoad(p.x, p.z), `${b.kind} ${b.id}`).toBe(false);
        }
      }
    }
  });

  it('deterministik ve hızlı (yol ağı + zemin düzeltme + düzen: veri hattı/bake hazırlığı < 60 sn)', () => {
    const again = buildSettlementWorld(world).map;
    expect(again.buildings.map((b) => `${b.id}:${b.kind}:${b.x.toFixed(3)}`)).toEqual(
      map.buildings.map((b) => `${b.id}:${b.kind}:${b.x.toFixed(3)}`),
    );
    if (process.env.SETTLEMENT_REPORT) console.log(`düzen ${buildMs.toFixed(0)} ms`);
    // 12.0a'dan beri oyun bu hesabı açılışta değil `npm run bake` ile bir kez yapar (açılışta ~20 ms); tavan bake hazırlığı
    // içindir (Faz 12 dünyası: ~25–35 sn, yük altında ~40 sn).
    expect(buildMs).toBeLessThan(60_000);
    const ids = new Set(map.buildings.map((b) => b.id));
    expect(ids.size).toBe(map.buildings.length);
  }, 180_000);

  it('kent içinde il yolu yok, sokak ızgarası var; nesne eleme yolda ve yapıda', () => {
    const zonguldak = map.settlements.find((s) => s.data.name === 'Zonguldak')!;
    const b = zonguldak.buildings.find((v) => v.kind === 'apartment' || v.kind === 'house')!;
    expect(map.blocksProp(b.x, b.z)).toBe(true);
    // Ağaç tacı (yarıçap) saçağa değiyorsa ağaç gizlenir; küçük taş aynı yerde kalır.
    const side = BUILDING_SHAPES[b.kind].width / 2 + BUILDING_OVERHANG[b.kind].x + 3;
    const p = buildingLocalToWorld(b, side, 0);
    if (!map.roads.onRoad(p.x, p.z, 6) && map.footprints.contains(p.x, p.z, 0.3) === false) {
      expect(map.blocksProp(p.x, p.z, 5)).toBe(true);
      expect(map.blocksProp(p.x, p.z, 0.3)).toBe(false);
    }
    expect(map.buildingAt(b.x, b.z)?.id).toBe(b.id);
    // Yol ağı veri yollarından seçilmiş seyrek bir omurgadır (tüm veri yolları çizilmez).
    const length = (lines: ReadonlyArray<{ xz: Float32Array }>) =>
      lines.reduce((sum, l) => {
        for (let i = 0; i + 3 < l.xz.length; i += 2)
          sum += Math.hypot(l.xz[i + 2]! - l.xz[i]!, l.xz[i + 3]! - l.xz[i + 1]!);
        return sum;
      }, 0);
    const network = length(map.roadLines.filter((l) => l.cls !== 3));
    expect(network).toBeGreaterThan(30_000);
    expect(network).toBeLessThan(length(world.settlements!.roads) * 0.4);
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

describe('satıcılar — gerçek dünya (alışveriş)', () => {
  it('il merkezlerinde 4, ilçelerde 3 satıcı; hepsi yapı dışında, karada', async () => {
    const { placeVendors } = await import('../src/economy/vendors');
    const { VENDORS } = await import('../src/config');
    const vendors = placeVendors(map, {
      heightAt: terrain.heightAt,
      elevationAt: terrain.elevationAt,
      blocked: (x, z) => map.buildingAt(x, z, 0.4) !== null,
    });
    const byTown = new Map<string, string[]>();
    for (const v of vendors) {
      byTown.set(v.town, [...(byTown.get(v.town) ?? []), v.kind]);
      expect(map.buildingAt(v.x, v.z, 0.3)).toBeNull();
      expect(terrain.elevationAt(v.x, v.z)).toBeGreaterThan(1);
      expect(v.y).toBeCloseTo(terrain.heightAt(v.x, v.z), 6);
    }
    for (const s of map.settlements) {
      if (s.data.rank === 'koy') continue;
      const kinds = byTown.get(s.data.name) ?? [];
      expect(kinds, s.data.name).toEqual(VENDORS.perRank[s.data.rank].slice(0, kinds.length));
      // Dükkânı/konutu olan her merkezde satıcıların hepsi (gerekirse aynı kapıda yan yana); yalnız çeşmesi sığan
      // kıyı ilçesinde (Çatalzeytin) satıcı yok.
      const usable = s.buildings.some(
        (b) =>
          !b.ruined && [...VENDORS.shopKinds, ...VENDORS.fallbackKinds].includes(b.kind as never),
      );
      expect(kinds.length, s.data.name).toBe(usable ? VENDORS.perRank[s.data.rank].length : 0);
    }
    expect(vendors.length).toBeGreaterThan(7 * 4 + 58 * 3 - 1);
  });
});
