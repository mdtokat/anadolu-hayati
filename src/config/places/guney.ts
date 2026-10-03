import type { PlaceGroup } from './types';

/**
 * Güney grubu (tools/groups/guney.yaml): Ankara (kuzey şeridi), Kırıkkale. Dosyayı yalnızca ilgili grubun oturumu
 * doldurur (docs/faz-12-paralel-plan.md §2.2). `places`: il adına göre en çok 10 yer (kurallar: `types.ts`); koordinatlar
 * yaklaşıktır (en yakın yürünebilir nokta bulunur) ve `tests/pilotPlaces` ile doğrulanır. `campCount`: bu grubun eşkıya
 * kampı katkısı (Faz 12.C ölçümüne göre; docs/faz-12-guney-rapor.md).
 */
export const GUNEY: PlaceGroup = {
  places: {
    Ankara: [
      { name: 'Ankara merkez', lat: 39.9208, lon: 32.8541 },
      { name: 'Kızılcahamam', lat: 40.4694, lon: 32.6522 },
      { name: 'Çamlıdere', lat: 40.4917, lon: 32.4744 },
      { name: 'Çubuk', lat: 40.2378, lon: 33.0311 },
      { name: 'Kalecik', lat: 40.1019, lon: 33.4108 },
      { name: 'Akyurt', lat: 40.1319, lon: 33.0875 },
      { name: 'Ayaş', lat: 40.0161, lon: 32.3447 },
      { name: 'Güdül', lat: 40.2133, lon: 32.2508 },
      { name: 'Beypazarı', lat: 40.1675, lon: 31.9211 },
      { name: 'Nallıhan', lat: 40.1853, lon: 31.3514 },
    ],
    Kırıkkale: [
      { name: 'Kırıkkale merkez', lat: 39.8468, lon: 33.5153 },
      { name: 'Yahşihan', lat: 39.8517, lon: 33.4511 },
      { name: 'Keskin Göleti', lat: 39.6385, lon: 33.6745 },
      { name: 'Delice', lat: 39.9597, lon: 34.0267 },
      { name: 'Sulakyurt', lat: 40.1675, lon: 33.7167 },
      { name: 'Bahşılı', lat: 39.9244, lon: 33.4781 },
      { name: 'Balışeyh', lat: 39.8969, lon: 33.7083 },
      { name: 'Çelebi', lat: 39.9833, lon: 33.5167 },
      { name: 'Karakeçili', lat: 39.5932, lon: 33.378 },
    ],
  },
  // Ölçüm (yerel dünya, sınırsız kamp aramasıyla): Ankara'da 10 uygun orman yeri (orman %10,7: Kızılcahamam–Çamlıdere–Nallıhan),
  // Kırıkkale'de 0 (orman %0,8). Neden bu sayı: docs/faz-12-guney-rapor.md.
  campCount: 10,
};
