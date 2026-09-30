import { CREATURES } from '../config';
import type { Activity } from '../survival/vitals';
import type { SpeciesDef } from './species';

/**
 * Algı (5.2, saf mantık): bir canlının oyuncuyu görüp duyup duymadığı ve yakındaki yanan ateşler.
 * Yön sözleşmesi `Player` ile aynıdır: yaw 0 = −Z, pozitif sola döner; ileri = (−sin yaw, −cos yaw).
 * Arazi/ağaç engeli yoktur (görüş hattı denetlenmez; ağaçların collider'ı da yok).
 */

/** (dx, dz) yönünün yaw'ı. */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** a'dan b'ye en kısa açı farkı, (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Karanlık 0 (gündüz) – 1 (gece): güneş yüksekliğine göre alacakaranlık bandında yumuşak geçiş. */
export function darknessOf(sunAltitudeDeg: number): number {
  const [low, high] = CREATURES.twilightAltitudeDeg;
  const t = Math.min(Math.max((sunAltitudeDeg - low) / (high - low), 0), 1);
  return 1 - t;
}

/** Görüş mesafesi: gece tür çarpanı kadar kısalır. */
export function visionRange(species: SpeciesDef, darkness: number): number {
  const factor = 1 + (species.perception.nightSightFactor - 1) * darkness;
  return species.perception.sightRange * factor;
}

export interface PlayerSense {
  /** Oyuncuya yatay uzaklık ve yön vektörü (oyuncu − canlı). */
  dist: number;
  dx: number;
  dz: number;
  /** Görüldü / duyuldu. */
  visible: boolean;
  heard: boolean;
  /** `visible || heard` (kışkırtılmış canlı için sistem true yapar). */
  noticed: boolean;
  weakness: number;
}

/**
 * Oyuncuyu algılar. Görme: mesafe ≤ görüş × etkinlik görünürlüğü ve bakış konisi içinde (çok yakındaysa koni
 * aranmaz). Duyma: mesafe ≤ duyma menzili × etkinlik gürültüsü (dinlenen oyuncu neredeyse duyulmaz).
 */
export function perceivePlayer(
  species: SpeciesDef,
  creature: { x: number; z: number; yaw: number },
  player: { x: number; z: number; activity: Activity; weakness?: number },
  darkness: number,
): PlayerSense {
  const dx = player.x - creature.x;
  const dz = player.z - creature.z;
  const dist = Math.hypot(dx, dz);

  const sight = visionRange(species, darkness) * CREATURES.visibility[player.activity];
  let visible = false;
  if (dist <= sight) {
    visible =
      dist <= CREATURES.senseRadius ||
      Math.abs(angleDiff(creature.yaw, yawOf(dx, dz))) <=
        (species.perception.sightHalfAngleDeg * Math.PI) / 180;
  }
  const heard = dist <= species.perception.hearRange * CREATURES.noise[player.activity];

  return {
    dist,
    dx,
    dz,
    visible,
    heard,
    noticed: visible || heard,
    weakness: player.weakness ?? 0,
  };
}

export interface FireSense {
  x: number;
  z: number;
  dist: number;
}

/** Canlıya `radius` içindeki en yakın yanan ateş; yoksa null. `radius` 0 ise hep null. */
export function nearestFire(
  x: number,
  z: number,
  fires: ReadonlyArray<{ x: number; z: number }>,
  radius: number,
): FireSense | null {
  if (radius <= 0) return null;
  let best: FireSense | null = null;
  for (const fire of fires) {
    const dist = Math.hypot(fire.x - x, fire.z - z);
    if (dist <= radius && (best === null || dist < best.dist))
      best = { x: fire.x, z: fire.z, dist };
  }
  return best;
}

/**
 * Oyuncunun "zayıflığı" 0–1: can, tokluk ve suyun en düşüğü (0 → 1, 100 → 0). Avcılar zayıf hedefi gündüz
 * de izler (`SpeciesDef.weaknessThreshold`).
 */
export function playerWeakness(state: {
  health: number;
  satiety: number;
  hydration: number;
}): number {
  const lowest = Math.min(state.health, state.satiety, state.hydration);
  return Math.min(Math.max(1 - lowest / 100, 0), 1);
}
