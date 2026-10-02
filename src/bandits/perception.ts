import { BANDITS, CREATURES } from '../config';
import type { Activity } from '../survival/vitals';
import type { PlayerSense } from './ai';

/** Eşkıyanın algıladığı oyuncu durumu (Game sağlar). */
export interface BanditPlayer {
  x: number;
  y: number;
  z: number;
  activity: Activity;
  alive: boolean;
  /** Camide: eşkıya algılamaz, saldırmaz (kutsal alan). */
  sanctuary: boolean;
}

/** Görüş hattı: gözden hedefe arazi engel olmadan bakılabiliyor mu? */
export type LineOfSight = (
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
) => boolean;

/**
 * Oyuncu algısı (saf): görüş (menzil gece kısalır, durgun oyuncu daha geç görülür; görüş konisi, çok yakında her yön;
 * arazi görüş hattı) ve duyma (oyuncunun hareketine göre; uyurken zayıf). Oyuncu ölü ya da camideyse null.
 */
export function perceivePlayer(
  self: { x: number; z: number; yaw: number; eyeY: number },
  player: BanditPlayer,
  darkness: number,
  sleeping: boolean,
  los: LineOfSight,
): PlayerSense | null {
  if (!player.alive || player.sanctuary) return null;
  const dx = player.x - self.x;
  const dz = player.z - self.z;
  const dist = Math.hypot(dx, dz);
  const heard =
    dist <=
    BANDITS.hearingRange *
      CREATURES.noise[player.activity] *
      (sleeping ? BANDITS.sleepHearingFactor : 1);
  let visible = false;
  if (!sleeping) {
    const night = 1 + (BANDITS.nightSightFactor - 1) * Math.min(Math.max(darkness, 0), 1);
    const range = BANDITS.sightRange * night * CREATURES.visibility[player.activity];
    if (dist <= range) {
      const inCone =
        dist <= BANDITS.senseRadius ||
        (dx * -Math.sin(self.yaw) + dz * -Math.cos(self.yaw)) / dist >=
          Math.cos(((BANDITS.viewConeDeg / 2) * Math.PI) / 180);
      visible =
        inCone &&
        los(
          { x: self.x, y: self.eyeY, z: self.z },
          { x: player.x, y: player.y + 1.2, z: player.z },
        );
    }
  }
  return { x: player.x, z: player.z, dist, visible, heard };
}
