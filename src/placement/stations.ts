import { STATIONS } from '../config';
import type { CraftContext } from '../items/craft';
import { STATION_KINDS, type StationKind } from '../items/recipes';
import { radiusOf } from './placeRules';
import type { StructureSet } from './structures';

/**
 * (x, z)'de üretim yaparken yakında bulunan istasyonlar (Faz 9): istasyon yapısının kenarına `STATIONS[tür].reach`
 * (oyun m, yatay) içinde olmak yeter. Saf; tarif denetimi (`craftStatus`) bu bağlamı kullanır.
 */
export function stationsNear(structures: StructureSet, x: number, z: number): CraftContext {
  const stations = new Set<StationKind>();
  for (const kind of STATION_KINDS) {
    const limit = STATIONS[kind].reach + radiusOf(kind);
    if (structures.near(x, z, limit).some((s) => s.kind === kind)) stations.add(kind);
  }
  return { stations };
}
