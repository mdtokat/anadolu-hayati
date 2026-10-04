import { describe, expect, it } from 'vitest';
import { BUILDING_LOOK, CITY_SIZE } from '../src/config';
import {
  APARTMENT_FLOORS,
  apartmentFloorRange,
  apartmentFloors,
  konakFloors,
  paintIndex,
  provinceScale,
  urbanScale,
} from '../src/settlements/citySize';
import { shapeVariant, storeyCount, storeyPlanOf } from '../src/settlements/kinds';
import { MAX_PANES, windowPanes } from '../src/settlements/windows';
import { UPPER_CONTAINER_SLOTS } from '../src/settlements/search';
import { groupProvinces } from './helpers/groups';

/** Kent büyüklüğü (kullanıcı talimatı: "büyük illerin küçük illerden farkı olsun"): saf kurallar. */
describe('kent büyüklüğü ölçeği', () => {
  it('her hedef ilin nüfusu tabloda; ölçek nüfusla artar (Ankara 1, Çankırı 0)', () => {
    for (const p of groupProvinces()) expect(CITY_SIZE.provincePopulation[p], p).toBeGreaterThan(0);
    expect(provinceScale('Ankara')).toBe(1);
    expect(provinceScale('Çankırı')).toBe(0);
    expect(provinceScale('Bilinmeyen')).toBe(0);
    const order = ['Ankara', 'Kocaeli', 'Samsun', 'Sakarya', 'Zonguldak', 'Bolu', 'Sinop'];
    for (let i = 1; i < order.length; i++) {
      expect(provinceScale(order[i - 1]!)).toBeGreaterThan(provinceScale(order[i]!));
    }
  });

  it('ilçe il ve kendi büyüklüğünün karışımı; köy 0', () => {
    const ilce = (province: string, buildings: number) =>
      urbanScale({ rank: 'ilce', province, buildings });
    expect(ilce('Ankara', 9800)).toBeGreaterThan(ilce('Ankara', 1200));
    expect(ilce('Ankara', 1200)).toBeGreaterThan(ilce('Çankırı', 1200));
    expect(ilce('Çankırı', 300)).toBe(0);
    expect(urbanScale({ rank: 'koy', province: 'Ankara', buildings: 9000 })).toBe(0);
    expect(urbanScale({ rank: 'il', province: 'Kocaeli', buildings: 0 })).toBe(
      provinceScale('Kocaeli'),
    );
  });
});

describe('kat sayısı', () => {
  it('küçük il merkezi 3–5, metropol 6–10; küçük ilçe 2–4, büyük ilçe 4–8 katlı apartman', () => {
    expect(apartmentFloorRange('il', 0)).toEqual({ min: 3, max: 5 });
    expect(apartmentFloorRange('il', 1)).toEqual({ min: 6, max: 10 });
    expect(apartmentFloorRange('ilce', 0)).toEqual({ min: 2, max: 4 });
    expect(apartmentFloorRange('ilce', 1)).toEqual({ min: 4, max: 8 });
  });

  it('kat aralık içinde; merkez ve yoğun doku kenardan yüksek', () => {
    for (const rank of ['il', 'ilce'] as const) {
      for (const scale of [0, 0.3, 0.7, 1]) {
        const { min, max } = apartmentFloorRange(rank, scale);
        for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
          const center = apartmentFloors(rank, scale, roll, 1, 1);
          const edge = apartmentFloors(rank, scale, roll, 0, 0);
          expect(center).toBeGreaterThanOrEqual(edge);
          for (const f of [center, edge]) {
            expect(f).toBeGreaterThanOrEqual(min);
            expect(f).toBeLessThanOrEqual(max);
          }
        }
        expect(apartmentFloors(rank, scale, 0.999, 1, 1)).toBe(max);
        expect(apartmentFloors(rank, scale, 0, 0, 0)).toBe(min);
      }
    }
  });

  it('konak 2 ya da 3 katlı; büyük kentte ve Osmanlı üslubunda 3 kat daha sık', () => {
    const share = (scale: number, osmanli: boolean) => {
      let tall = 0;
      for (let i = 0; i < 1000; i++) if (konakFloors(scale, osmanli, i / 1000) === 3) tall++;
      return tall / 1000;
    };
    expect(share(1, false)).toBeGreaterThan(share(0, false));
    expect(share(0, true)).toBeGreaterThan(share(0, false));
    for (const roll of [0, 0.5, 0.99]) expect([2, 3]).toContain(konakFloors(0.5, true, roll));
  });

  it('en yüksek apartman pencere ve kap kimlik sınırlarına sığar; kat sayısı sınırlanır', () => {
    const max = APARTMENT_FLOORS.max;
    expect(windowPanes('apartment', max).length).toBeLessThanOrEqual(MAX_PANES);
    expect(shapeVariant('apartment', max).upperContainers.length).toBeLessThan(
      UPPER_CONTAINER_SLOTS,
    );
    expect(storeyCount('apartment', 40)).toBe(max);
    expect(storeyCount('konak', 3)).toBe(3);
    expect(storeyCount('konak', 7)).toBe(3);
    // Eski kayıt/baked harita: konakta `floors` 1 → türün sabiti (2 kat).
    expect(storeyCount('konak', 1)).toBe(2);
    expect(storeyCount('konak')).toBe(2);
    expect(storeyCount('lojman', 5)).toBe(2);
    expect(storeyPlanOf('konak', 3)!.storeys).toBe(3);
    expect(shapeVariant('konak', 3).height).toBeGreaterThan(shapeVariant('konak', 2).height);
  });
});

describe('cephe boyası', () => {
  it('büyük kentte daha çok apartman boyalı; dizin paletin içinde', () => {
    const painted = (scale: number) => {
      let n = 0;
      for (let i = 0; i < 1000; i++) if (paintIndex(scale, i / 1000, 0.5) > 0) n++;
      return n / 1000;
    };
    expect(painted(1)).toBeGreaterThan(painted(0) + 0.3);
    for (const roll of [0, 0.3, 0.999]) {
      const p = paintIndex(1, 0, roll);
      expect(p).toBeGreaterThanOrEqual(1);
      expect(p).toBeLessThanOrEqual(BUILDING_LOOK.paints.length);
    }
  });
});
