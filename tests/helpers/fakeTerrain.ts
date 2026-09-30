import type { LandCoverClass } from '../../src/data/landcover';
import type { CreatureTerrain } from '../../src/creatures/kinds';

export interface FakeTerrainOptions {
  /** Yarım kenar (oyun m); varsayılan 3 hücre = ±768. */
  half?: number;
  cover?: LandCoverClass | ((x: number, z: number) => LandCoverClass);
  elevation?: number | ((x: number, z: number) => number);
  slope?: number | ((x: number, z: number) => number);
  sea?: (x: number, z: number) => boolean;
  water?: (x: number, z: number, maxDistance: number) => boolean;
  height?: (x: number, z: number) => number;
}

function fn<T>(v: T | ((x: number, z: number) => T)): (x: number, z: number) => T {
  return typeof v === 'function' ? (v as (x: number, z: number) => T) : () => v;
}

/** Sentetik arazi: her yer orman, 800 m, düz (tüm türlerin yaşayabildiği yer); seçeneklerle değiştirilir. */
export function fakeTerrain(options: FakeTerrainOptions = {}): CreatureTerrain {
  const half = options.half ?? 768;
  const cover = fn<LandCoverClass>(options.cover ?? 'forest');
  const elevation = fn(options.elevation ?? 800);
  const slope = fn(options.slope ?? 5);
  const height = options.height ?? (() => 0);
  return {
    bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    heightAt: height,
    slopeDegAt: slope,
    elevationAt: elevation,
    coverAt: cover,
    isSea: options.sea ?? (() => false),
    waterNear: options.water ?? (() => false),
  };
}
