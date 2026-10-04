import { BATTLE_ROYALE } from '../config';
import type { Random } from '../utils/random';

/**
 * Başlangıç noktaları (saf, seed'li): herkes alanın içinde, `open`'ın kabul ettiği (karada, yürünebilir, yapı dışı)
 * noktalarda ve birbirinden uzakta başlar. Hedef aralık alan/oyuncu oranından türer; tutmazsa kademeli gevşer.
 */

export interface SpawnArea {
  readonly areaM2: number;
  randomPoint(random: Random): { x: number; z: number };
}

export interface BrSpawn {
  x: number;
  z: number;
  /** Bakış yönü (radyan). */
  yaw: number;
}

/** Hedef başlangıç aralığı (oyun m). */
export function spawnSpacing(areaM2: number, count: number): number {
  const s = BATTLE_ROYALE.spawn;
  const ideal = s.spacingFactor * Math.sqrt(areaM2 / Math.max(1, count));
  return Math.min(s.maxSpacing, Math.max(s.minSpacing, ideal));
}

/**
 * `count` başlangıç noktası. Sıra önemlidir: 0. nokta oyuncunundur. Bulunamazsa (alan çok küçük ya da hep kapalı)
 * hata fırlatır.
 */
export function planSpawns(
  area: SpawnArea,
  count: number,
  random: Random,
  open: (x: number, z: number) => boolean,
): BrSpawn[] {
  const s = BATTLE_ROYALE.spawn;
  let spacing = spawnSpacing(area.areaM2, count);
  const points: BrSpawn[] = [];
  // Aralık denetimi için ızgara (hücre = aralık; gevşedikçe yeniden kurulur).
  let grid = new Map<number, BrSpawn[]>();
  let cell = spacing;
  const key = (cx: number, cz: number): number => cx * 65_537 + cz;
  const rebuild = (): void => {
    cell = Math.max(1, spacing);
    grid = new Map();
    for (const p of points) add(p);
  };
  const add = (p: BrSpawn): void => {
    const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(p);
  };
  const farEnough = (x: number, z: number): boolean => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const p of grid.get(key(cx + dx, cz + dz)) ?? []) {
          if (Math.hypot(p.x - x, p.z - z) < spacing) return false;
        }
      }
    }
    return true;
  };
  for (let round = 0; round < s.rounds && points.length < count; round++) {
    for (let i = 0; i < s.attemptsPerRound && points.length < count; i++) {
      const { x, z } = area.randomPoint(random);
      const yaw = random.next() * Math.PI * 2;
      if (!farEnough(x, z) || !open(x, z)) continue;
      const p = { x, z, yaw };
      points.push(p);
      add(p);
    }
    if (points.length < count) {
      spacing *= s.relax;
      rebuild();
    }
  }
  if (points.length < count) {
    throw new Error(`Battle Royale: ${count} başlangıç noktası bulunamadı (${points.length})`);
  }
  return points;
}
