import { BIRDS } from '../config';
import { createRandom, seedFrom } from '../utils/random';

/**
 * Gökyüzü kuşları (saf; kullanıcı talimatı: "kuşlar eklenebilir"): oyuncu çevresindeki `BIRDS.cellSize` hücrelerin
 * bir kısmında (hücre tohumuyla deterministik) daire çizen bir sürü vardır — karga sürüsü (kara), martı (kıyıda) ya da
 * tek başına süzülen yırtıcı (kartal/şahin). Yalnız görseldir: avlanmaz, oyuncuyu algılamaz (ortam sesindeki kuş
 * cıvıltısının görsel karşılığı). Gece (güneş ufkun altında) görünmezler.
 */

export type FlockKind = 'crow' | 'gull' | 'raptor';

export interface Flock {
  kind: FlockKind;
  /** Dairenin merkezi (oyun X/Z) ve yarıçapı (oyun m). */
  cx: number;
  cz: number;
  radius: number;
  /** Zeminden uçuş yüksekliği (oyun m). */
  altitude: number;
  /** Açısal hız (rad/sn; işaret dönüş yönü) ve faz. */
  omega: number;
  phase: number;
  count: number;
  /** Hücre tohumu: kuş başına sapmalar. */
  seed: number;
}

/** Hücredeki sürü (yoksa null). `elevationAt` gerçek rakım (m): martılar kıyıda, kargalar karada. */
export function flockForCell(
  col: number,
  row: number,
  elevationAt: (x: number, z: number) => number,
): Flock | null {
  const seed = seedFrom(BIRDS.seed, col, row);
  const rng = createRandom(seed);
  if (rng.next() >= BIRDS.flockChance) return null;
  const size = BIRDS.cellSize;
  const cx = (col + 0.2 + rng.next() * 0.6) * size;
  const cz = (row + 0.2 + rng.next() * 0.6) * size;
  const elevation = elevationAt(cx, cz);
  const roll = rng.next();
  const kind: FlockKind =
    elevation < BIRDS.gullMaxElevation ? 'gull' : roll < BIRDS.raptorShare ? 'raptor' : 'crow';
  const spec = BIRDS.kinds[kind];
  const pick = (range: readonly [number, number]) => range[0] + rng.next() * (range[1] - range[0]);
  const radius = pick(spec.radius);
  const speed = pick(spec.speed);
  return {
    kind,
    cx,
    cz,
    radius,
    altitude: pick(spec.altitude),
    omega: (speed / radius) * (rng.next() < 0.5 ? -1 : 1),
    phase: rng.next() * Math.PI * 2,
    count: Math.round(pick(spec.count)),
    seed,
  };
}

/** Bir kuşun anlık konumu (zeminden yükseklik hariç: `y` sürünün tabanına göre) ve uçuş yönü (yaw). */
export interface BirdPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Kanat çırpma açısı (−1…1; süzülürken 0'a yakın). */
  flap: number;
}

/** Sürünün `i`. kuşunun `time` (sn) anındaki pozu; `y` zeminden yüksekliktir. */
export function birdPose(flock: Flock, i: number, time: number): BirdPose {
  const rng = createRandom(seedFrom(flock.seed, i));
  const spread = BIRDS.kinds[flock.kind].spread;
  const lag = i * 0.12 + rng.next() * 0.1;
  const angle = flock.phase + flock.omega * time - lag * Math.sign(flock.omega);
  const r = flock.radius + (rng.next() - 0.5) * spread;
  const bob = Math.sin(time * 0.6 + i) * spread * 0.15;
  const x = flock.cx + Math.cos(angle) * r;
  const z = flock.cz + Math.sin(angle) * r;
  // Teğet yön (dönüş yönüne göre); yaw sözleşmesi: 0 = −Z.
  const sign = Math.sign(flock.omega) || 1;
  const tx = -Math.sin(angle) * sign;
  const tz = Math.cos(angle) * sign;
  const yaw = Math.atan2(-tx, -tz);
  const flapRate = BIRDS.kinds[flock.kind].flapHz * Math.PI * 2;
  const glide = BIRDS.kinds[flock.kind].glide;
  // Süzülen kuş arada bir çırpar.
  const burst = glide > 0 ? Math.max(0, Math.sin(time * 0.35 + i * 1.7) - glide) / (1 - glide) : 1;
  const flap = Math.sin(time * flapRate + rng.next() * 6) * burst;
  return { x, y: flock.altitude + bob + (rng.next() - 0.5) * spread * 0.3, z, yaw, flap };
}
