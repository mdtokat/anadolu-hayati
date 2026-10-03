import type { PlaceGroup } from './types';

/**
 * Doğu grubu (tools/groups/dogu.yaml): Samsun, Çorum, Amasya. Dosyayı yalnızca ilgili grubun oturumu doldurur
 * (docs/faz-12-paralel-plan.md §2.2); boş grup geçerlidir. `places`: il adına göre en çok 10 yer
 * (kurallar: `types.ts`); `campCount`: bu grubun eşkıya kampı katkısı.
 */
export const DOGU: PlaceGroup = {
  places: {},
  campCount: 0,
};
