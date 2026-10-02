import { BANDITS } from '../config';
import type { BanditView } from './kinds';

/** Bakış: oyuncunun ayak konumu ve yaw'ı. */
export interface InteractPose {
  x: number;
  z: number;
  yaw: number;
}

/** (x, z) erişimde ve bakış konisinde mi; öyleyse uzaklık (yoksa null). */
export function inView(pose: InteractPose, x: number, z: number, reach: number): number | null {
  const dx = x - pose.x;
  const dz = z - pose.z;
  const d = Math.hypot(dx, dz);
  if (d > reach) return null;
  if (d < 0.5) return d;
  const cos = (dx * -Math.sin(pose.yaw) + dz * -Math.cos(pose.yaw)) / d;
  return cos >= Math.cos((BANDITS.interactConeDeg * Math.PI) / 180) ? d : null;
}

/** Etkileşilebilecek eşkıya: teslim olmuş ya da aranmamış ceset; en yakın. */
export function banditInView(
  views: readonly BanditView[],
  pose: InteractPose,
): { view: BanditView; kind: 'surrender' | 'corpse' } | null {
  let best: { view: BanditView; kind: 'surrender' | 'corpse' } | null = null;
  let bestD = Infinity;
  for (const view of views) {
    const kind =
      view.state === 'surrender'
        ? 'surrender'
        : view.state === 'dead' && !view.searched
          ? 'corpse'
          : null;
    if (!kind) continue;
    const d = inView(pose, view.x, view.z, BANDITS.interactReach);
    if (d !== null && d < bestD) {
      best = { view, kind };
      bestD = d;
    }
  }
  return best;
}
