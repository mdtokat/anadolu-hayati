import { CREATURES } from '../config';
import type { LandCoverClass } from '../data/landcover';
import type { CreatureTerrain } from './kinds';

/** Bölge verisinden canlı arazi sorgularını karşılayan kaynaklar (`RegionHeightSource` vb. bunu sağlar). */
export interface RegionTerrainSources {
  source: {
    bounds: CreatureTerrain['bounds'];
    heightAt(x: number, z: number): number;
    slopeDegAt(x: number, z: number): number;
    elevationAt(x: number, z: number): number;
  };
  cover: { classAt(x: number, z: number): LandCoverClass } | null;
  freshWater: { nearest(x: number, z: number, maxDistance: number): unknown } | null;
}

/**
 * Canlı için yumuşatılmış eğim: 100 m'lik veri ızgarası (2 oyun m) ×3,3 dikleşince eğim hücreden hücreye çok
 * oynar (9°→44° arası 2 m'de); canlı bu gürültüde "duvara" çarpıp titremesin diye merkez ve `CREATURES.slopeSmoothRadius`
 * uzaktaki dört noktanın ortalaması alınır.
 */
function smoothSlope(source: RegionTerrainSources['source'], x: number, z: number): number {
  const r = CREATURES.slopeSmoothRadius;
  return (
    (source.slopeDegAt(x, z) +
      source.slopeDegAt(x + r, z) +
      source.slopeDegAt(x - r, z) +
      source.slopeDegAt(x, z + r) +
      source.slopeDegAt(x, z - r)) /
    5
  );
}

/**
 * Canlıların arazi görünümü (5.4): `RegionWorld`'ün yükseklik, arazi örtüsü ve tatlı su verisini
 * `CreatureTerrain` arayüzüne uyarlar. Deniz, gerçek rakımı `seaElevationMeters`'in altındaki (ya da harita
 * dışı) yerdir; arazi örtüsü verisi yoksa her yer `none` sayılır (canlı doğmaz).
 */
export function createRegionCreatureTerrain(sources: RegionTerrainSources): CreatureTerrain {
  const { source, cover, freshWater } = sources;
  const bounds = source.bounds;
  return {
    bounds,
    heightAt: (x, z) => source.heightAt(x, z),
    slopeDegAt: (x, z) => smoothSlope(source, x, z),
    elevationAt: (x, z) => source.elevationAt(x, z),
    coverAt: (x, z) => cover?.classAt(x, z) ?? 'none',
    isSea: (x, z) =>
      x < bounds.minX ||
      x > bounds.maxX ||
      z < bounds.minZ ||
      z > bounds.maxZ ||
      source.elevationAt(x, z) < CREATURES.seaElevationMeters,
    waterNear: (x, z, maxDistance) => freshWater?.nearest(x, z, maxDistance) != null,
  };
}
