import { HELD_ITEM } from '../config';
import type { HeldKind, SwingStyle } from './heldKinds';

/**
 * Elde tutulan eşyanın duruşu ve animasyonu (saf; `HeldItem` uygular). `theta`: kolun öne kalkışı (rad; 0 sarkık,
 * π/2 yatay ileri, π baş üstü), `beta`: eşyanın kola göre ucunu kaldırması (rad; + uç yukarı), `yaw`: sağa (−) / sola (+)
 * savurma (rad), `push`: ileri itme (+) ya da geri çekme (−) (oyun m).
 */
export interface HeldPose {
  theta: number;
  beta: number;
  yaw: number;
  push: number;
}

/** Bekleme duruşu: türe göre (silah öne kalkık, yakın silah ucu yukarı, boş el sarkık yumruk). */
export function restPose(kind: HeldKind | null): HeldPose {
  switch (kind) {
    case 'gun':
    case 'bow':
    case 'sling':
      return { theta: 1.3, beta: 0.04, yaw: 0, push: 0 };
    case 'blade':
    case 'axe':
    case 'blunt':
      return { theta: 0.7, beta: 0.8, yaw: 0, push: 0 };
    case 'spear':
      return { theta: 0.9, beta: 0.5, yaw: 0, push: 0 };
    case 'light':
      return { theta: 0.6, beta: 0.7, yaw: 0, push: 0 };
    case 'tool':
      return { theta: 0.7, beta: 0.6, yaw: 0, push: 0 };
    case 'carry':
    case 'drone':
      return { theta: 0.5, beta: 0, yaw: 0, push: 0 };
    default:
      return { theta: 0.35, beta: 0, yaw: 0, push: 0 };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
}

/** Üç anahtarlı hareket: bekleme → hazırlık (`t` 0–0,25) → vuruş (0,25–0,55) → dönüş (0,55–1). */
function keys(t: number, wind: number, strike: number, rest: number): number {
  if (t < 0.25) return lerp(rest, wind, smooth(t / 0.25));
  if (t < 0.55) return lerp(wind, strike, smooth((t - 0.25) / 0.3));
  return lerp(strike, rest, smooth((t - 0.55) / 0.45));
}

/** Savurma animasyonunun `t` (0–1) anındaki duruşu; `rest` bekleme duruşu. */
export function swingPose(style: SwingStyle, t: number, rest: HeldPose): HeldPose {
  const x = Math.min(Math.max(t, 0), 1);
  switch (style) {
    case 'slash':
      return {
        theta: keys(x, rest.theta + 0.5, rest.theta - 0.2, rest.theta),
        beta: keys(x, rest.beta + 0.2, rest.beta - 0.5, rest.beta),
        yaw: keys(x, -0.9, 0.9, 0),
        push: keys(x, 0, 0.12, 0),
      };
    case 'chop':
      return {
        theta: keys(x, 2.3, 0.6, rest.theta),
        beta: keys(x, 1.4, -0.4, rest.beta),
        yaw: 0,
        push: keys(x, 0, 0.1, 0),
      };
    case 'smash':
      return {
        theta: keys(x, 2.5, 0.4, rest.theta),
        beta: keys(x, 1.5, -0.7, rest.beta),
        yaw: keys(x, -0.25, 0.25, 0),
        push: keys(x, 0, 0.14, 0),
      };
    case 'thrust':
      return {
        theta: rest.theta,
        beta: rest.beta,
        yaw: 0,
        push: keys(x, -0.1, 0.55, 0),
      };
    case 'punch':
      return {
        theta: keys(x, 0.1, 1.25, rest.theta),
        beta: 0,
        yaw: keys(x, -0.3, 0.2, 0),
        push: keys(x, -0.05, 0.35, 0),
      };
  }
}

/** Tepme (`t`: 0 atış anı – 1 bitti): geri çekilme (oyun m) ve ucun kalkışı (rad); hızlı söner. */
export function recoilOffset(t: number): { back: number; pitch: number } {
  const x = Math.min(Math.max(t, 0), 1);
  const k = (1 - x) * (1 - x);
  return { back: HELD_ITEM.recoilBack * k, pitch: HELD_ITEM.recoilPitch * k };
}
