import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SETTLEMENT_LAYOUT, VENDORS } from '../src/config';
import type { RegionData } from '../src/data/region';
import { placeVendors } from '../src/economy/vendors';
import { isMosque } from '../src/settlements/kinds';
import type { SettlementMap } from '../src/settlements/SettlementMap';
import { groupProvinces, noMosqueTowns } from './helpers/groups';
import { loadRealWorld } from './helpers/realRegion';
import { buildSettlementWorld, type SettlementWorld } from './helpers/settlementWorld';

/**
 * Faz 12.A (Batı grubu: Kocaeli, Bilecik) yerleşim doğrulaması: il/ilçe merkezleri, camiler, satıcılar,
 * yol ağı sayımları. Veri (`public/data/**`) bu illeri henüz içermiyorsa (12.9 öncesi commit'li dünya) atlanır.
 * `BATI_REPORT=1` sayıları yazdırır (docs/faz-12-bati-rapor.md).
 */
const PROVINCES = ['Kocaeli', 'Bilecik'] as const;
const REPORT = Boolean(process.env.BATI_REPORT);

/** Yüklenecek dünya verisindeki hedef iller (provinces.geojson `inRegion`). */
function provincesInData(): Set<string> {
  const file = resolve(__dirname, '../public/data/world/bati-karadeniz/provinces.geojson');
  const json = JSON.parse(readFileSync(file, 'utf-8')) as {
    features: { properties: { name: string; inRegion: boolean } }[];
  };
  return new Set(json.features.filter((f) => f.properties.inRegion).map((f) => f.properties.name));
}
const IN_DATA = provincesInData();
const AVAILABLE = PROVINCES.every((p) => IN_DATA.has(p));

describe('Batı grubu il listesi', () => {
  it('grup dosyası Kocaeli ve Bilecik illerini tanımlar', () => {
    expect(groupProvinces()).toEqual(expect.arrayContaining([...PROVINCES]));
  });
});

describe.skipIf(!AVAILABLE)('Batı grubu yerleşimleri (Kocaeli, Bilecik)', () => {
  let world: RegionData;
  let built: SettlementWorld;
  let map: SettlementMap;

  beforeAll(async () => {
    world = await loadRealWorld();
    built = buildSettlementWorld(world);
    map = built.map;
  }, 180_000);

  const townsOf = (province: string) => map.settlements.filter((s) => s.data.province === province);

  it('her ilde tek il merkezi (belediye kaydı çoğaltması yok) ve ilçe merkezleri', () => {
    for (const province of PROVINCES) {
      const towns = townsOf(province);
      const il = towns.filter((s) => s.data.rank === 'il');
      expect(
        il.map((s) => s.data.name),
        province,
      ).toEqual([province]);
      expect(towns.filter((s) => s.data.rank === 'ilce').length, province).toBeGreaterThanOrEqual(
        7,
      );
      expect(towns.filter((s) => s.data.rank === 'koy').length, province).toBeGreaterThan(20);
      // Hiçbir merkezin adı "… Belediyesi" ile bitmez.
      for (const s of towns) expect(s.data.name, province).not.toMatch(/ Belediyesi$/);
    }
  });

  it('il merkezleri kalabalık, her merkezde yapı ve cami var (istisnalar grup dosyasında)', () => {
    const exempt = new Set(noMosqueTowns());
    for (const province of PROVINCES) {
      const il = townsOf(province).find((s) => s.data.rank === 'il')!;
      expect(il.buildings.length, il.data.name).toBeGreaterThanOrEqual(20);
      expect(il.buildings.length, il.data.name).toBeLessThanOrEqual(
        SETTLEMENT_LAYOUT.maxBuildings.il,
      );
      for (const s of townsOf(province).filter((v) => v.data.rank !== 'koy')) {
        expect(s.buildings.length, s.data.name).toBeGreaterThan(0);
        if (!exempt.has(s.data.name))
          expect(
            s.buildings.some((b) => isMosque(b.kind)),
            `${s.data.name}: cami`,
          ).toBe(true);
      }
    }
  });

  it('elle seçilmiş simge yapılar adlarıyla yerinde (Kocaeli, Gebze, Karamürsel, Bilecik, Söğüt, Bozüyük, Osmaneli)', () => {
    const named = (town: string) =>
      map.settlements
        .find((s) => s.data.name === town)!
        .buildings.filter((b) => b.name)
        .map((b) => b.name);
    // Kent merkezinde parsel azdır (ilçeler önce yerleşir, İzmit ilçesi yalnız ~9 yapı alır): İzmit'in simge yapıları
    // il merkezine (Kocaeli) bağlıdır. Her simge yapı bağlı olduğu yerleşimin kendi parsellerine oturur.
    expect(named('Kocaeli')).toEqual(
      expect.arrayContaining(['İzmit Saat Kulesi', 'Orhan Gazi Camii']),
    );
    expect(named('Gebze')).toEqual(
      expect.arrayContaining(['Çoban Mustafa Paşa Camii', 'Gebze Saat Kulesi', 'Eskihisar Kalesi']),
    );
    expect(named('Karamürsel')).toEqual(expect.arrayContaining(['Ulu Camii']));
    expect(named('Bilecik')).toEqual(
      expect.arrayContaining(['Şeyh Edebali Türbesi', 'Bilecik Saat Kulesi', 'Bilecik Kalesi']),
    );
    expect(named('Söğüt')).toEqual(expect.arrayContaining(['Ertuğrul Gazi Türbesi']));
    expect(named('Bozüyük')).toEqual(expect.arrayContaining(['Ulu Camii']));
    expect(named('Osmaneli')).toEqual(expect.arrayContaining(['Lefke Kalesi']));
  });

  it('satıcılar: il merkezinde 4, ilçelerde 3; hepsi yapı dışında', () => {
    const vendors = placeVendors(map, {
      heightAt: built.terrain.heightAt,
      elevationAt: built.terrain.elevationAt,
      blocked: (x, z) => map.buildingAt(x, z, 0.4) !== null,
    });
    for (const province of PROVINCES) {
      for (const s of townsOf(province).filter((v) => v.data.rank !== 'koy')) {
        const mine = vendors.filter((v) => v.town === s.data.name);
        expect(mine.length, s.data.name).toBe(VENDORS.perRank[s.data.rank as 'il' | 'ilce'].length);
        for (const v of mine) expect(map.buildingAt(v.x, v.z, 0.3), s.data.name).toBeNull();
      }
    }
  });

  it('yol ağı: bağlanamayan yerleşim yok; sayımlar raporlanır', () => {
    const n = built.network;
    expect(n.unlinked).toBe(0);
    if (REPORT) {
      const lines: string[] = [`ağ: ${JSON.stringify(n)}`];
      for (const province of PROVINCES) {
        const towns = townsOf(province);
        const sum = (rank: string) =>
          towns.filter((s) => s.data.rank === rank).reduce((a, s) => a + s.buildings.length, 0);
        lines.push(
          `${province}: ${towns.length} yerleşim (il ${sum('il')} yapı, ilçe ${sum('ilce')}, köy ${sum('koy')}), ` +
            `camili ${towns.filter((s) => s.buildings.some((b) => isMosque(b.kind))).length}`,
        );
        for (const s of towns.filter((v) => v.data.rank !== 'koy'))
          lines.push(`  ${s.data.rank} ${s.data.name}: ${s.buildings.length} yapı`);
      }
      lines.push(`toplam ${map.buildings.length} yapı, düzen ${built.buildMs.toFixed(0)} ms`);
      process.stdout.write(`${lines.join('\n')}\n`);
    }
  });
});
