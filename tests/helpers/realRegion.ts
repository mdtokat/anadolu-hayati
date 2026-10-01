import { WORLD } from '../../src/config';
import type { RegionData } from '../../src/data/region';
import { loadWorld } from '../../src/data/world';
import { LATTICE_CELL } from '../../src/world/lattice';
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

/** Faz 2–6 testlerinin adı: artık karolu dünyayı yükler (7.6; eski tek-parça bölge verisi 7.10'da kaldırıldı). */
export const loadRealRegion = loadRealWorld;

let legacyCached: Promise<RegionData> | null = null;

/** Faz 6 bölgesinin kapladığı alan: kafesin (0, 0) köşesinde 1588 × 1176 örnek (13 × 10 chunk). */
const LEGACY_AREA = { cols: 1588, rows: 1176 };

/**
 * Faz 6 alanı (orijin merkezli, 13 × 10 chunk), karolu dünyanın (0, 0) köşesindeki pencere olarak: eski kimlik ve
 * ızgara uyumluluğu testleri içindir. Eski `public/data/regions/…` 7.10'da kalktı; pencerenin `gridOrigin`'i eski
 * merkezli formülle birebir aynıdır (`WORLD.lattice`). Dönen veri dünya örneklerinin kopyasıdır (önbellekli).
 */
export function loadLegacyRegion(): Promise<RegionData> {
  legacyCached ??= loadRealWorld().then((world) => {
    const { cols, rows } = LEGACY_AREA;
    const col0 = Math.round((WORLD.lattice.anchorX - world.meta.gridOrigin.x) / LATTICE_CELL);
    const row0 = Math.round((WORLD.lattice.anchorZ - world.meta.gridOrigin.z) / LATTICE_CELL);
    const heights = new Uint16Array(cols * rows);
    const landcover = world.landcover === null ? null : new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const from = (row0 + r) * world.meta.gridWidth + col0;
      heights.set(world.heights.subarray(from, from + cols), r * cols);
      if (landcover !== null && world.landcover !== null) {
        landcover.set(world.landcover.subarray(from, from + cols), r * cols);
      }
    }
    return {
      ...world,
      meta: {
        ...world.meta,
        id: WORLD.legacyRegionId,
        gridWidth: cols,
        gridHeight: rows,
        gridOrigin: { x: WORLD.lattice.anchorX, z: WORLD.lattice.anchorZ },
      },
      heights,
      landcover,
    };
  });
  return legacyCached;
}
