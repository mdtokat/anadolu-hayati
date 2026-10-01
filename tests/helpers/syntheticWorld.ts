import type { RegionData } from '../../src/data/region';
import type { WorldExtent } from '../../src/data/worldTypes';
import { gridOriginOf } from '../../src/world/lattice';

/**
 * Faz 7 hedef kapsamı (docs/faz-7-paralel-plan.md §1.4): sütun −640…1587, satır 0…1961 (2228 × 1962 örnek,
 * 18 × 16 chunk). Gerçek Düzce–Bolu verisi (A, 7.4) gelmeden büyük dünyayı ölçmek için kullanılır.
 */
export const TARGET_EXTENT: WorldExtent = { col0: -640, row0: 0, cols: 2228, rows: 1962 };

/**
 * Sentetik büyük dünya (7.8): eski bölgeyi kafesteki **kendi yerinde** bırakır, kapsamın geri kalanını eski
 * bölgenin kopyalarıyla (kafes indeksi `mod W/H`, yani 2 × 2 çoğaltma) doldurur. Eski alan bit-eşdeğer
 * kaldığından nesne/canlı yerleşiminin kapsamdan bağımsızlığı da bununla sınanır. Kopya dikişlerinde yükseklik
 * süreksizdir (ölçüm içindir, oynanış için değil). İl ve özellik verisi eski bölgeninkidir.
 */
export function syntheticWorld(
  legacy: RegionData,
  extent: WorldExtent = TARGET_EXTENT,
): RegionData {
  const W = legacy.meta.gridWidth;
  const H = legacy.meta.gridHeight;
  const legacyCol0 = 0; // eski bölgenin (0, 0) örneği kafesin (0, 0)'ıdır (§3.1)
  const legacyRow0 = 0;
  const heights = new Uint16Array(extent.cols * extent.rows);
  const landcover = legacy.landcover ? new Uint8Array(extent.cols * extent.rows) : null;

  for (let r = 0; r < extent.rows; r++) {
    const row = extent.row0 + r - legacyRow0;
    const sr = ((row % H) + H) % H;
    for (let c = 0; c < extent.cols; c++) {
      const col = extent.col0 + c - legacyCol0;
      const sc = ((col % W) + W) % W;
      const from = sr * W + sc;
      const to = r * extent.cols + c;
      heights[to] = legacy.heights[from] as number;
      if (landcover) landcover[to] = legacy.landcover![from] as number;
    }
  }

  return {
    meta: {
      ...legacy.meta,
      gridWidth: extent.cols,
      gridHeight: extent.rows,
      gridOrigin: gridOriginOf(extent),
    },
    heights,
    provinces: legacy.provinces,
    features: legacy.features,
    landcover,
  };
}
