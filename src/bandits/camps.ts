import { BANDITS } from '../config';
import type { LandCoverClass } from '../data/landcover';
import { createRandom, seedFrom, type Random } from '../utils/random';

/**
 * Eşkıya kampları (Faz 11, 11.6; saf, seed'li): ormanda, yerleşimlerden uzak, yola yakın ama yoldan görünmeyen düzlükler.
 * Aynı dünya verisi ve tohum aynı kampları ve aynı kimlikleri verir (`campId` aday hücresinin anahtarıdır: kayıttaki
 * temizlenen kamp ve sandık içerikleri buna bağlıdır).
 */

/** Kamp yeri seçiminin dünyadan istediği (RegionWorld + SettlementMap karşılar; testte sahte). */
export interface CampSiteQuery {
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  isSea(x: number, z: number): boolean;
  coverAt(x: number, z: number): LandCoverClass;
  slopeDegAt(x: number, z: number): number;
  /** En yakın yol: kenara uzaklık ve yön (atan2(dz, dx)); `radius` içinde yoksa null. */
  roadNear(x: number, z: number, radius: number): { edgeDistance: number; angle: number } | null;
  /**
   * Yerleşimlerin ayak izi kenarına uzaklık kuralı: il/ilçe kenarına `minTown`, köy kenarına `minVillage`'dan yakınsa
   * true.
   */
  nearSettlement(x: number, z: number, minTown: number, minVillage: number): boolean;
}

/** Bir kamp: merkez, yol tarafına bakış, üye sayısı, reisin silahı ve yol kenarındaki pusu yeri. */
export interface Camp {
  /** Kalıcı kimlik (negatif olmayan tam sayı). */
  id: number;
  x: number;
  z: number;
  /** Kampın yola baktığı yön (oyuncu yaw sözleşmesi: ileri = (−sin, −cos)). */
  yaw: number;
  /** Üye sayısı (reis dahil). */
  members: number;
  leaderWeapon: 'sniper_rifle' | 'shotgun';
  /** Yol kenarındaki pusu noktası (kamp tarafında); bulunamazsa null. */
  ambush: { x: number; z: number } | null;
}

/** Kimlik ofseti: hücre koordinatları negatif olabilir. */
const CELL_OFFSET = 4096;

/** Aday hücresinin kalıcı kimliği. */
export function campIdOf(cx: number, cz: number): number {
  return (cz + CELL_OFFSET) * (2 * CELL_OFFSET) + (cx + CELL_OFFSET);
}

/** Kamp çemberinde eğim sınanan noktalar (merkez + 6 yön). */
const RING = 6;

/** (x, z) kamp yeri olabilir mi? Uygunsa yol bilgisini döner. */
export function campSiteOk(
  q: CampSiteQuery,
  x: number,
  z: number,
): { edgeDistance: number; angle: number } | null {
  const b = q.bounds;
  const margin = BANDITS.campRadius + 2;
  if (x < b.minX + margin || x > b.maxX - margin || z < b.minZ + margin || z > b.maxZ - margin) {
    return null;
  }
  if (q.isSea(x, z) || q.coverAt(x, z) !== 'forest') return null;
  if (q.slopeDegAt(x, z) > BANDITS.maxSlopeDeg) return null;
  for (let i = 0; i < RING; i++) {
    const a = (i / RING) * Math.PI * 2;
    const px = x + Math.cos(a) * BANDITS.campRadius;
    const pz = z + Math.sin(a) * BANDITS.campRadius;
    if (q.isSea(px, pz) || q.slopeDegAt(px, pz) > BANDITS.maxSlopeDeg) return null;
  }
  const [near, far] = BANDITS.roadDistance;
  const road = q.roadNear(x, z, far + 20);
  if (!road || road.edgeDistance < near || road.edgeDistance > far) return null;
  if (q.nearSettlement(x, z, BANDITS.minSettlementDistance, BANDITS.minVillageDistance))
    return null;
  return road;
}

/**
 * Kampları seçer: dünya `campCell` hücrelerine bölünür, her hücrede seed'li sırayla `campCellTries`² nokta denenir; uygun
 * adaylar seed'li sıraya dizilir ve birbirine `campSpacing`'ten yakın olmayacak şekilde en çok `campCount` kamp alınır.
 * Sonuç kimliğe göre sıralıdır.
 */
export function placeCamps(q: CampSiteQuery, seed: number = BANDITS.seed): Camp[] {
  const cell = BANDITS.campCell;
  const b = q.bounds;
  const candidates: Array<{
    id: number;
    x: number;
    z: number;
    road: { edgeDistance: number; angle: number };
    order: number;
  }> = [];
  const cx0 = Math.floor(b.minX / cell);
  const cx1 = Math.floor(b.maxX / cell);
  const cz0 = Math.floor(b.minZ / cell);
  const cz1 = Math.floor(b.maxZ / cell);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const random = createRandom(seedFrom(seed, cx, cz));
      const order = random.next();
      // Hücre içinde seed'li sırayla taranan n × n ızgara (kenarlardan yarım adım içeride, hafif sarsıntılı).
      const n = BANDITS.campCellTries;
      const slots = Array.from({ length: n * n }, (_, i) => i);
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(random.next() * (i + 1));
        [slots[i], slots[j]] = [slots[j]!, slots[i]!];
      }
      for (const slot of slots) {
        const x = (cx + ((slot % n) + 0.25 + random.next() * 0.5) / n) * cell;
        const z = (cz + (Math.floor(slot / n) + 0.25 + random.next() * 0.5) / n) * cell;
        const road = campSiteOk(q, x, z);
        if (!road) continue;
        candidates.push({ id: campIdOf(cx, cz), x, z, road, order });
        break;
      }
    }
  }
  candidates.sort((a, b2) => a.order - b2.order || a.id - b2.id);
  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (chosen.length >= BANDITS.campCount) break;
    if (chosen.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < BANDITS.campSpacing)) continue;
    chosen.push(c);
  }
  return chosen
    .map((c) => buildCamp(q, c.id, c.x, c.z, c.road, seed))
    .sort((a, b2) => a.id - b2.id);
}

function buildCamp(
  q: CampSiteQuery,
  id: number,
  x: number,
  z: number,
  road: { edgeDistance: number; angle: number },
  seed: number,
): Camp {
  const random = createRandom(seedFrom(seed, id, 1));
  const [lo, hi] = BANDITS.members;
  const members = random.int(lo, hi);
  const leaderWeapon = pickWeighted(random, BANDITS.leaderWeapons);
  // Yola dik yön: yolun iki yanından hangisinde olduğumuzu, normal boyunca yola yaklaşınca anlarız.
  const nx = -Math.sin(road.angle);
  const nz = Math.cos(road.angle);
  const step = road.edgeDistance;
  const plus = q.roadNear(x + nx * step, z + nz * step, step + 20);
  const minus = q.roadNear(x - nx * step, z - nz * step, step + 20);
  const sign = (plus?.edgeDistance ?? Infinity) <= (minus?.edgeDistance ?? Infinity) ? 1 : -1;
  const dx = nx * sign;
  const dz = nz * sign;
  // Oyuncu yaw sözleşmesi: ileri = (−sin yaw, −cos yaw) → yaw = atan2(−dx, −dz).
  const yaw = Math.atan2(-dx, -dz);
  const inset = Math.max(road.edgeDistance - BANDITS.ambushOffset, 0);
  const ax = x + dx * inset;
  const az = z + dz * inset;
  const ambush =
    !q.isSea(ax, az) && q.slopeDegAt(ax, az) <= BANDITS.maxSlopeDeg + 10 ? { x: ax, z: az } : null;
  return { id, x, z, yaw, members, leaderWeapon, ambush };
}

/** Ağırlıklı seçim (anahtar → ağırlık). */
export function pickWeighted<K extends string>(
  random: Random,
  weights: Readonly<Record<K, number>>,
): K {
  const entries = Object.entries(weights) as Array<[K, number]>;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = random.next() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1]![0];
}

/** Kamp içindeki yerler (kamp yerel uzayında, sonra dünyaya çevrilmiş): ateş, çadırlar, sandık, oturaklar, nöbet. */
export interface CampLayout {
  fire: { x: number; z: number };
  tents: Array<{ x: number; z: number; yaw: number }>;
  chest: { x: number; z: number; yaw: number };
  seats: Array<{ x: number; z: number; yaw: number }>;
  /** Nöbet yeri: kampın yol tarafı kenarı. */
  post: { x: number; z: number; yaw: number };
}

/**
 * Kampın düzeni (saf, deterministik): ateş merkezde, kütük oturaklar ateşin çevresinde (yüzleri ateşe dönük), çadırlar
 * arka yarım çemberde, sandık reis çadırının yanında, nöbet yeri yol tarafında. Yerel +Z kampın arkası, −Z yol tarafı.
 */
export function campLayout(camp: Camp): CampLayout {
  const r = BANDITS.campRadius;
  const cos = Math.cos(camp.yaw);
  const sin = Math.sin(camp.yaw);
  // Yerel (lx, lz) → dünya: rotation.y = yaw (Three.js sözleşmesi), oyuncu yaw'ıyla aynı.
  const world = (lx: number, lz: number) => ({
    x: camp.x + lx * cos + lz * sin,
    z: camp.z - lx * sin + lz * cos,
  });
  const random = createRandom(seedFrom(BANDITS.seed, camp.id, 2));
  const tents: CampLayout['tents'] = [];
  const tentCount = Math.min(3, Math.max(2, Math.ceil(camp.members / 2)));
  for (let i = 0; i < tentCount; i++) {
    const a =
      Math.PI * (0.25 + (0.5 * i) / Math.max(tentCount - 1, 1)) + (random.next() - 0.5) * 0.15;
    // Arka yarım çember (+Z): açı 0..π yerel x ekseninden ölçülür.
    const p = world(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
    // Çadırın kapısı ateşe baksın.
    tents.push({ ...p, yaw: Math.atan2(-(camp.x - p.x), -(camp.z - p.z)) + Math.PI });
  }
  const seats: CampLayout['seats'] = [];
  const seatCount = Math.max(camp.members, 3);
  for (let i = 0; i < seatCount; i++) {
    const a = (i / seatCount) * Math.PI * 2 + random.next() * 0.3;
    const p = world(Math.cos(a) * 2.4, Math.sin(a) * 2.4);
    seats.push({ ...p, yaw: Math.atan2(-(camp.x - p.x), -(camp.z - p.z)) });
  }
  const chestLocal = world(r * 0.45, r * 0.55);
  const post = world(0, -r * 0.95);
  return {
    fire: { x: camp.x, z: camp.z },
    tents,
    chest: { ...chestLocal, yaw: camp.yaw },
    seats,
    post: { ...post, yaw: camp.yaw },
  };
}

/** Kamp yeri sorgusu: canlı arazisi (örtü, eğim, deniz) + yerleşim haritası (yollar, yerleşim ayak izleri). */
export function campSiteQuery(
  terrain: Pick<CampSiteQuery, 'bounds' | 'isSea' | 'coverAt' | 'slopeDegAt'>,
  settlements: {
    roads: {
      nearest(x: number, z: number, r: number): { edgeDistance: number; angle: number } | null;
    };
    settlements: ReadonlyArray<{ data: { x: number; z: number; rank: string }; radius: number }>;
  },
): CampSiteQuery {
  return {
    bounds: terrain.bounds,
    isSea: (x, z) => terrain.isSea(x, z),
    coverAt: (x, z) => terrain.coverAt(x, z),
    slopeDegAt: (x, z) => terrain.slopeDegAt(x, z),
    roadNear: (x, z, r) => settlements.roads.nearest(x, z, r),
    nearSettlement: (x, z, minTown, minVillage) =>
      settlements.settlements.some((s) => {
        const limit = s.data.rank === 'koy' ? minVillage : minTown;
        return Math.hypot(s.data.x - x, s.data.z - z) - s.radius < limit;
      }),
  };
}
