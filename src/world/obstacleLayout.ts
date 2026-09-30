import { OBSTACLES, TERRAIN_TEST } from '../config';
import { createRandom } from '../utils/random';
import type { HeightSource } from './HeightSource';

/** Yatay (Y ekseni etrafında dönebilen) kutu engel; konum kutunun merkezidir. */
export interface ObstacleSpec {
  x: number;
  y: number;
  z: number;
  /** Tam boyutlar (oyun metresi). */
  sx: number;
  sy: number;
  sz: number;
  /** Y ekseni etrafında dönüş (radyan). */
  yaw: number;
  color: number;
  /** Elle yerleştirilmiş parkur parçası mı (true) yoksa seed'li kaya mı (false)? */
  course: boolean;
}

/** Parkur blokları: düz zeminde durur (y = 0), konum sabit. */
function courseObstacles(source: HeightSource): ObstacleSpec[] {
  return OBSTACLES.course.map((block) => ({
    x: block.x,
    y: source.heightAt(block.x, block.z) + block.h / 2,
    z: block.z,
    sx: block.w,
    sy: block.h,
    sz: block.d,
    yaw: 0,
    color: OBSTACLES.courseColor,
    course: true,
  }));
}

/**
 * Seed'li kayalar: doğma alanının ve test rampalarının dışında, arazi kenarından içeride.
 * Aynı seed her zaman aynı yerleşimi verir (deterministik rastgelelik kuralı).
 */
function rockObstacles(source: HeightSource, seed: number): ObstacleSpec[] {
  const random = createRandom(seed);
  const half = TERRAIN_TEST.size / 2 - OBSTACLES.rockEdgeMargin;
  const minDistance = TERRAIN_TEST.spawnFlatRadius + OBSTACLES.rockClearMargin;

  const rocks: ObstacleSpec[] = [];
  while (rocks.length < OBSTACLES.rockCount) {
    const x = random.range(-half, half);
    const z = random.range(-half, half);
    // Sabit sayıda RNG çağrısı: reddedilen adaylar da akışı aynı ilerletir.
    const sx = random.range(OBSTACLES.rockMinSize, OBSTACLES.rockMaxSize);
    const sz = random.range(OBSTACLES.rockMinSize, OBSTACLES.rockMaxSize);
    const sy = random.range(OBSTACLES.rockMinHeight, OBSTACLES.rockMaxHeight);
    const yaw = random.range(0, Math.PI * 2);
    if (Math.hypot(x, z) < minDistance) continue;

    rocks.push({
      x,
      y: source.heightAt(x, z) + sy / 2 - OBSTACLES.rockSink,
      z,
      sx,
      sy,
      sz,
      yaw,
      color: OBSTACLES.rockColor,
      course: false,
    });
  }
  return rocks;
}

/** Test ortamının tüm engelleri: parkur + kayalar. */
export function generateObstacles(
  source: HeightSource,
  seed: number = OBSTACLES.seed,
): ObstacleSpec[] {
  return [...courseObstacles(source), ...rockObstacles(source, seed)];
}
