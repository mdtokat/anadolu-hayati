import type { RegionData, RegionFeatures, WaterFeatures } from '../../src/data/region';
import type { WorldExtent } from '../../src/data/worldTypes';
import { gridOriginOf, latticeX, latticeZ } from '../../src/world/lattice';

/**
 * Faz 7 hedef kapsamı (docs/faz-7-paralel-plan.md §1.4): sütun −640…1587, satır 0…1961 (2228 × 1962 örnek,
 * 18 × 16 chunk). Gerçek Düzce–Bolu verisi (A, 7.4) gelmeden büyük dünyayı ölçmek için kullanılır.
 */
export const TARGET_EXTENT: WorldExtent = { col0: -640, row0: 0, cols: 2228, rows: 1962 };

/**
 * Sentetik büyük dünya (7.8): eski bölgeyi kafesteki **kendi yerinde** bırakır, kapsamın geri kalanını eski
 * bölgenin kopyalarıyla (kafes indeksi `mod W/H`, yani 2 × 2 çoğaltma) doldurur. Eski alan bit-eşdeğer
 * kaldığından nesne/canlı yerleşiminin kapsamdan bağımsızlığı da bununla sınanır. Kopya dikişlerinde yükseklik
 * süreksizdir (ölçüm içindir, oynanış için değil). Tatlı su özellikleri de aynı kopyalara kaydırılarak çoğaltılır
 * (gerçek veride su ×2,2 olacak; mesh/draw call ölçümü için); il verisi eski bölgeninkidir.
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
    features: legacy.features && tileFeatures(legacy.features, legacy, extent),
    landcover,
  };
}

/** Su özelliklerini dünya kapsamına düşen her kopyaya (kafes `mod W/H` döşemesiyle aynı) kaydırır. */
function tileFeatures(
  features: RegionFeatures,
  legacy: RegionData,
  extent: WorldExtent,
): RegionFeatures {
  const W = legacy.meta.gridWidth;
  const H = legacy.meta.gridHeight;
  const cell = latticeX(1) - latticeX(0);
  const kx0 = Math.floor(extent.col0 / W);
  const kx1 = Math.floor((extent.col0 + extent.cols - 1) / W);
  const ky0 = Math.floor(extent.row0 / H);
  const ky1 = Math.floor((extent.row0 + extent.rows - 1) / H);
  const minX = latticeX(extent.col0);
  const maxX = latticeX(extent.col0 + extent.cols - 1);
  const minZ = latticeZ(extent.row0);
  const maxZ = latticeZ(extent.row0 + extent.rows - 1);
  const overlaps = (xz: Float64Array): boolean => {
    for (let i = 0; i < xz.length; i += 2) {
      const x = xz[i] as number;
      const z = xz[i + 1] as number;
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true;
    }
    return false;
  };
  // Kaynak yalnızca eski alandaki sudur: yükleyici (`loadLegacyRegion`) tüm dünyanın özelliklerini taşır; eski alanın
  // dışındaki su kaydırılınca kopyaların (ve eski alanın) içine düşerdi.
  const legacyMinX = latticeX(0);
  const legacyMaxX = latticeX(W - 1);
  const legacyMinZ = latticeZ(0);
  const legacyMaxZ = latticeZ(H - 1);
  const inLegacy = (xz: Float64Array): boolean => {
    for (let i = 0; i < xz.length; i += 2) {
      const x = xz[i] as number;
      const z = xz[i + 1] as number;
      if (x >= legacyMinX && x <= legacyMaxX && z >= legacyMinZ && z <= legacyMaxZ) return true;
    }
    return false;
  };
  const shift = (xz: Float64Array, dx: number, dz: number): Float64Array => {
    const out = new Float64Array(xz.length);
    for (let i = 0; i < xz.length; i += 2) {
      out[i] = (xz[i] as number) + dx;
      out[i + 1] = (xz[i + 1] as number) + dz;
    }
    return out;
  };

  const water: WaterFeatures = { lines: [], polygons: [], points: [] };
  for (let ky = ky0; ky <= ky1; ky++) {
    for (let kx = kx0; kx <= kx1; kx++) {
      const dx = kx * W * cell;
      const dz = ky * H * cell;
      for (const line of features.water.lines) {
        if (!inLegacy(line.xz)) continue;
        const xz = shift(line.xz, dx, dz);
        if (overlaps(xz)) water.lines.push({ ...line, xz });
      }
      for (const polygon of features.water.polygons) {
        if (!polygon.rings[0] || !inLegacy(polygon.rings[0])) continue;
        const rings = polygon.rings.map((ring) => shift(ring, dx, dz));
        if (rings[0] && overlaps(rings[0])) water.polygons.push({ ...polygon, rings });
      }
      for (const point of features.water.points) {
        if (!inLegacy(Float64Array.of(point.x, point.z))) continue;
        const x = point.x + dx;
        const z = point.z + dz;
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) water.points.push({ ...point, x, z });
      }
    }
  }
  return { ...features, water };
}
