import type { PlaceGroup } from './types';

/**
 * Batı grubu (tools/groups/bati.yaml): Kocaeli, Bilecik. Dosyayı yalnızca ilgili grubun oturumu doldurur
 * (docs/faz-12-paralel-plan.md §2.2). `places`: il adına göre en çok 10 yer (kurallar: `types.ts`); koordinatlar
 * yaklaşıktır (en yakın yürünebilir nokta bulunur) ve `tests/pilotPlaces` ile doğrulanır. Konumlar ilçe merkezleridir
 * (yerleşim verisindeki merkez noktası). `campCount`: bu grubun eşkıya kampı katkısı (Faz 12.A ölçümüne göre;
 * docs/faz-12-bati-rapor.md).
 */
export const BATI: PlaceGroup = {
  places: {
    Kocaeli: [
      { name: 'Kocaeli merkez', lat: 40.7654, lon: 29.9407 },
      { name: 'Gebze', lat: 40.8007, lon: 29.4318 },
      { name: 'Gölcük', lat: 40.7169, lon: 29.8196 },
      { name: 'Karamürsel', lat: 40.6913, lon: 29.6166 },
      { name: 'Kandıra', lat: 41.0704, lon: 30.1523 },
      { name: 'Kartepe', lat: 40.7454, lon: 30.0113 },
      { name: 'Körfez', lat: 40.7608, lon: 29.7839 },
      { name: 'Dilovası', lat: 40.7756, lon: 29.5261 },
      { name: 'Derince', lat: 40.7574, lon: 29.8308 },
      { name: 'Darıca', lat: 40.7575, lon: 29.3841 },
    ],
    Bilecik: [
      { name: 'Bilecik merkez', lat: 40.1435, lon: 29.9753 },
      { name: 'Söğüt', lat: 40.0156, lon: 30.1814 },
      { name: 'Bozüyük', lat: 39.9068, lon: 30.0346 },
      { name: 'Osmaneli', lat: 40.3591, lon: 30.0166 },
      { name: 'Pazaryeri', lat: 40.0007, lon: 29.901 },
      { name: 'Gölpazarı', lat: 40.2671, lon: 30.3075 },
      { name: 'Yenipazar', lat: 40.1767, lon: 30.5191 },
      { name: 'İnhisar', lat: 40.0503, lon: 30.3848 },
    ],
  },
  campCount: 0,
};
