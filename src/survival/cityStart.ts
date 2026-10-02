import { CITY_START } from '../config';
import type { SettlementRank } from '../data/settlements';
import type { Vec3 } from '../player/movement';
import { createRandom, type Random } from '../utils/random';

/** Başlangıç için aday şehir merkezi (oyun X/Z). */
export interface CityCenter {
  name: string;
  x: number;
  z: number;
  /** Yerleşim ayak izi yarıçapı (oyun m). */
  radius: number;
}

/** Seçilen başlangıç: yerleşim adı, güvenli ayak noktası ve rastgele bakış yönü (radyan). */
export interface CityStart {
  name: string;
  point: Vec3;
  yaw: number;
}

interface SettlementLike {
  data: { name: string; rank: SettlementRank; x: number; z: number };
  radius: number;
}

/** Yerleşimlerden il ve ilçe merkezlerini (`CITY_START.ranks`) süzer. */
export function cityCentersOf(settlements: ReadonlyArray<SettlementLike>): CityCenter[] {
  const ranks: readonly string[] = CITY_START.ranks;
  return settlements
    .filter((s) => ranks.includes(s.data.rank))
    .map((s) => ({ name: s.data.name, x: s.data.x, z: s.data.z, radius: s.radius }));
}

/** n. ölüm için deterministik rastgele üreteç (yeniden doğma). */
export function cityRespawnRandom(deathIndex: number): Random {
  return createRandom(CITY_START.respawnSeed + deathIndex * 7919);
}

/**
 * Merkezlerden rastgele birini seçer ve çevresinde `resolve`'un (en yakın yürünebilir, bina dışı noktayı bulan işlev)
 * kabul ettiği bir nokta bulur. Merkez sırası karıştırılır (her merkez en çok bir kez); bir merkezde noktalar
 * merkezden `maxOffsetFraction × yarıçap` içinde rastgele denenir. Hiçbiri olmazsa null.
 */
export function pickCityStart(
  centers: readonly CityCenter[],
  random: Random,
  resolve: (x: number, z: number) => Vec3 | null,
): CityStart | null {
  const order = centers.map((_, i) => i);
  // Fisher–Yates: seed'li karıştırma.
  for (let i = order.length - 1; i > 0; i--) {
    const j = random.int(0, i);
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  for (const index of order.slice(0, CITY_START.maxCenters)) {
    const center = centers[index] as CityCenter;
    for (let attempt = 0; attempt < CITY_START.attemptsPerCenter; attempt++) {
      // İlk deneme tam merkez; sonrakiler merkez çevresinde.
      const angle = random.range(0, Math.PI * 2);
      const distance =
        attempt === 0 ? 0 : random.range(0, center.radius * CITY_START.maxOffsetFraction);
      const point = resolve(
        center.x + Math.cos(angle) * distance,
        center.z + Math.sin(angle) * distance,
      );
      const yaw = random.range(0, Math.PI * 2);
      if (point) return { name: center.name, point, yaw };
    }
  }
  return null;
}

/** `openYaw` için bakış yönü sayısı ve ölçüm adımı/menzili (oyun m). */
const OPEN_YAW = { directions: 12, step: 2, range: 16 } as const;

/**
 * Başlangıç bakışını açık alana çevirir: `yaw`'dan başlayarak 12 yönden, önünde (2 m adımlarla 16 m'ye kadar) en uzun
 * engelsiz mesafeyi bulan yönü seçer (eşitlikte `yaw`'a en yakın). Böylece oyun duvara bakarak başlamaz.
 */
export function openYaw(
  point: Readonly<Vec3>,
  yaw: number,
  blockedAt: (x: number, z: number) => boolean,
): number {
  let best = yaw;
  let bestFree = -1;
  for (let k = 0; k < OPEN_YAW.directions; k++) {
    const candidate = yaw + (k / OPEN_YAW.directions) * Math.PI * 2;
    let free = 0;
    while (free < OPEN_YAW.range) {
      const d = free + OPEN_YAW.step;
      if (blockedAt(point.x - Math.sin(candidate) * d, point.z - Math.cos(candidate) * d)) break;
      free = d;
    }
    if (free > bestFree) {
      best = candidate;
      bestFree = free;
    }
  }
  return best % (Math.PI * 2);
}
