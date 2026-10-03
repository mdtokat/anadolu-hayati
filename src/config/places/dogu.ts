import type { PlaceGroup } from './types';

/**
 * Doğu grubu (tools/groups/dogu.yaml): Samsun, Çorum, Amasya. Dosyayı yalnızca ilgili grubun oturumu doldurur
 * (docs/faz-12-paralel-plan.md §2.2). `places`: il adına göre en çok 10 yer (kurallar: `types.ts`); koordinatlar yaklaşıktır
 * (en yakın yürünebilir nokta bulunur; ilçe merkezleri Overture `divisions` konumlarıdır) ve `tests/pilotPlaces` ile
 * doğrulanır. `campCount`: bu grubun eşkıya kampı katkısı (Faz 12.B ölçümüne göre; docs/faz-12-dogu-rapor.md).
 */
export const DOGU: PlaceGroup = {
  places: {
    Samsun: [
      { name: 'Samsun merkez', lat: 41.2946, lon: 36.3321 },
      { name: 'Bafra', lat: 41.5666, lon: 35.9025 },
      { name: 'Çarşamba', lat: 41.1983, lon: 36.727 },
      { name: 'Terme', lat: 41.209, lon: 36.9722 },
      { name: 'Alaçam', lat: 41.6069, lon: 35.5973 },
      { name: 'Havza', lat: 40.9661, lon: 35.6653 },
      { name: 'Vezirköprü', lat: 41.1434, lon: 35.4605 },
      { name: 'Ladik', lat: 40.9082, lon: 35.8946 },
      { name: 'Kavak', lat: 41.0773, lon: 36.0431 },
      { name: 'Atakum', lat: 41.3323, lon: 36.2705 },
    ],
    Çorum: [
      { name: 'Çorum merkez', lat: 40.5499, lon: 34.9537 },
      { name: 'Alaca', lat: 40.169, lon: 34.8415 },
      { name: 'Sungurlu', lat: 40.1638, lon: 34.3753 },
      { name: 'Osmancık', lat: 40.9715, lon: 34.801 },
      { name: 'İskilip', lat: 40.7307, lon: 34.471 },
      { name: 'Boğazkale', lat: 40.0215, lon: 34.6092 },
      { name: 'Mecitözü', lat: 40.5206, lon: 35.2953 },
      { name: 'Kargı', lat: 41.1328, lon: 34.4912 },
      { name: 'Ortaköy', lat: 40.2728, lon: 35.2504 },
      { name: 'Uğurludağ', lat: 40.4463, lon: 34.4525 },
    ],
    Amasya: [
      { name: 'Amasya merkez', lat: 40.6503, lon: 35.8329 },
      { name: 'Amasya Kalesi', lat: 40.6555, lon: 35.8269 },
      { name: 'Merzifon Barajı', lat: 40.9067, lon: 35.4627 },
      { name: 'Suluova', lat: 40.8364, lon: 35.6456 },
      { name: 'Gümüşhacıköy', lat: 40.869, lon: 35.2151 },
      { name: 'Taşova', lat: 40.7603, lon: 36.322 },
      { name: 'Göynücek', lat: 40.3971, lon: 35.5237 },
      { name: 'Hamamözü', lat: 40.7832, lon: 35.0242 },
    ],
  },
  campCount: 13,
};
