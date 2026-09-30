import { BORDERS, WATER } from '../config';
import type { ProvinceShape } from '../data/region';

/**
 * İl sınırlarını çizgi parçalarına (LineSegments) çevirir: halkalar `spacing` aralığında sıklaştırılır,
 * her köşe `heightAt` ile araziye oturtulur (+ `lift`); su seviyesinin altına inmez.
 * Dönüş: konumlar (x,y,z ×2 her parça) ve köşe renkleri (r,g,b).
 */
export function buildBorderSegments(
  provinces: readonly ProvinceShape[],
  heightAt: (x: number, z: number) => number,
  colors: { region: number; neighbor: number } = {
    region: BORDERS.regionColor,
    neighbor: BORDERS.neighborColor,
  },
  spacing: number = BORDERS.spacing,
  lift: number = BORDERS.lift,
): { positions: Float32Array; colors: Float32Array; segments: number } {
  const positions: number[] = [];
  const vertexColors: number[] = [];
  const floor = WATER.level;

  const push = (x: number, z: number, rgb: readonly [number, number, number]) => {
    positions.push(x, Math.max(heightAt(x, z), floor) + lift, z);
    vertexColors.push(rgb[0], rgb[1], rgb[2]);
  };
  const toRgb = (hex: number): [number, number, number] => [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];

  for (const province of provinces) {
    const rgb = toRgb(province.inRegion ? colors.region : colors.neighbor);
    for (const polygon of province.polygons) {
      for (const ring of polygon) {
        for (let i = 0; i + 3 < ring.length; i += 2) {
          const x0 = ring[i] as number;
          const z0 = ring[i + 1] as number;
          const x1 = ring[i + 2] as number;
          const z1 = ring[i + 3] as number;
          const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / spacing));
          for (let k = 0; k < n; k++) {
            push(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, rgb);
            push(x0 + ((x1 - x0) * (k + 1)) / n, z0 + ((z1 - z0) * (k + 1)) / n, rgb);
          }
        }
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(vertexColors),
    segments: positions.length / 6,
  };
}
