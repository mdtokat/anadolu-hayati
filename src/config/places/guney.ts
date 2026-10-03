import type { PlaceGroup } from './types';

/**
 * Güney grubu (tools/groups/guney.yaml): Ankara, Kırıkkale. Dosyayı yalnızca ilgili grubun oturumu doldurur
 * (docs/faz-12-paralel-plan.md §2.2); boş grup geçerlidir. `places`: il adına göre en çok 10 yer
 * (kurallar: `types.ts`); `campCount`: bu grubun eşkıya kampı katkısı.
 */
export const GUNEY: PlaceGroup = {
  places: {},
  campCount: 0,
};
