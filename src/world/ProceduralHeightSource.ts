import { TERRAIN_TEST } from '../config';
import { fbm2D } from '../utils/noise';
import { lerp } from '../utils/math';
import type { HeightSource } from './HeightSource';

const DEG_TO_RAD = Math.PI / 180;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Rampa katkısı: +X yönünde yamaç – plato – yamaç; Z'de kenarlardan yumuşakça söner. */
function rampHeight(x: number, z: number, ramp: (typeof TERRAIN_TEST.ramps)[number]): number {
  const tan = Math.tan(ramp.angleDeg * DEG_TO_RAD);
  const run = ramp.height / tan; // yamacın yatay uzunluğu
  const end = ramp.x + 2 * run + ramp.plateau;
  const rise = Math.max(Math.min((x - ramp.x) * tan, ramp.height, (end - x) * tan), 0);

  const halfWidth = ramp.width / 2;
  const side =
    1 - smoothstep(halfWidth - TERRAIN_TEST.rampEdgeWidth, halfWidth, Math.abs(z - ramp.z));
  return rise * side;
}

/**
 * Faz 1 test arazisi: seed'li fBm engebe + doğma noktasında düz alan + sabit test rampaları.
 * Saf hesaplamadır (Three/Rapier'e bağımlı değil).
 */
export class ProceduralHeightSource implements HeightSource {
  constructor(private readonly seed: number = TERRAIN_TEST.seed) {}

  heightAt(x: number, z: number): number {
    const t = TERRAIN_TEST;
    const noise = fbm2D(x * t.frequency, z * t.frequency, this.seed, t.octaves); // [-1, 1]
    const hills = t.amplitude * (noise * 0.5 + 0.5);

    // Doğma noktası (orijin) çevresi düz: dışa doğru engebeye yumuşak geçiş.
    const distance = Math.hypot(x, z);
    const blend = smoothstep(t.spawnFlatRadius, t.spawnFlatRadius + t.spawnBlendWidth, distance);
    let height = lerp(0, hills, blend);

    for (const ramp of t.ramps) height = Math.max(height, rampHeight(x, z, ramp));
    return height;
  }
}
