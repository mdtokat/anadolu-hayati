import type { RoadData, SettlementData } from '../data/settlements';
import type { Building } from './layout';
import type { RoadPlan } from './roadProfile';
import type { RoadSign } from './roadSigns';
import type { Stair } from './SettlementMap';

/** Baked harita biçim sürümü (`SettlementMap.toBaked`; şema değişirse artırılır). */
export const BAKED_MAP_VERSION = 2;

/** Bir yerleşim: veri (ayak izi hücreleri çıkarılmış) + yerleştirilmiş yapılar. */
export interface BakedSettlement {
  data: Omit<SettlementData, 'cells'>;
  buildings: Building[];
  radius: number;
}

/**
 * `SettlementMap`'in veri hattında hesaplanmış durumu (Faz 12, karo akışı). Düzen, yol ağı, profil/köprü/tünel planı,
 * sokaklar, merdivenler ve ayak izleri bir kez hesaplanır; oyun açılışta yalnızca bunu kurar. Tipli diziler
 * `data/bakedBlob.ts` ile ikili olarak taşınır.
 */
export interface BakedSettlementMap {
  version: number;
  settlements: BakedSettlement[];
  /** Yol ağı (kentlerde kesilmiş); `roadLines` = ağ + bağlantılar + sokaklar. */
  networkRoads: RoadData[];
  joinLines: RoadData[];
  streetLines: RoadData[];
  plan: RoadPlan;
  stairs: Stair[];
  /** Yol levhaları (sürüm 2). */
  signs: RoadSign[];
  /** `FootprintRegistry.dump` çıktısı. */
  footprints: Float64Array;
}
