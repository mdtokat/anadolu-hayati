import { BATI } from './bati';
import { CEKIRDEK } from './cekirdek';
import { DOGU } from './dogu';
import { GUNEY } from './guney';
import type { PlaceDef, PlaceGroup } from './types';

export type { PlaceDef, PlaceGroup } from './types';

/** Birleştirme sırası tools/world.yaml `groups` ile aynıdır. */
export const PLACE_GROUPS: readonly PlaceGroup[] = [CEKIRDEK, BATI, DOGU, GUNEY];

/** Grup yer tablolarını tek tabloda birleştirir; aynı il iki grupta tanımlıysa hata verir (sahiplik karışmasın). */
export function mergePlaces(
  groups: readonly PlaceGroup[],
): Readonly<Record<string, readonly PlaceDef[]>> {
  const merged: Record<string, readonly PlaceDef[]> = {};
  for (const group of groups) {
    for (const [province, places] of Object.entries(group.places)) {
      if (province in merged) throw new Error(`Yer adları: '${province}' iki grupta tanımlı`);
      merged[province] = places;
    }
  }
  return merged;
}

/** Grupların toplam eşkıya kampı katkısı (`BANDITS.campCount`). */
export function totalCampCount(groups: readonly PlaceGroup[]): number {
  return groups.reduce((sum, group) => sum + group.campCount, 0);
}
