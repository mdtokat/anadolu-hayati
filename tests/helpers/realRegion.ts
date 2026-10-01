import { WORLD } from '../../src/config';
import type { RegionData } from '../../src/data/region';
import { loadWorld } from '../../src/data/world';
import { publicFsFetch } from './fsFetch';

/** Oyunun yüklediği dünya (`public/data/world/<id>/world.json`, karolu). */
export const REGION_ID = WORLD.id;

let cached: Promise<RegionData> | null = null;

/**
 * Depodaki gerçek dünyayı (karo manifesti, `loadWorld`) tarayıcı olmadan yükler. Sonuç **modül düzeyinde
 * önbelleklidir**: aynı test dosyasındaki çağrılar karoları yeniden birleştirmez (dönen veriyi değiştirme).
 */
export function loadRealWorld(): Promise<RegionData> {
  cached ??= loadWorld(WORLD.id, '/', publicFsFetch());
  return cached;
}

/** Faz 2–6 testlerinin adı: artık karolu dünyayı yükler (7.6; eski `public/data/regions/…` 7.10'da kalkar). */
export const loadRealRegion = loadRealWorld;
