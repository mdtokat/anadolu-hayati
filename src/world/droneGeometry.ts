import { BoxGeometry, CylinderGeometry } from 'three';
import type { BufferGeometry } from 'three';
import { createRandom } from '../utils/random';
import { merge, place, type Part } from './propGeometry';

/**
 * Drone modeli (Faz 11, 11.8): dört kollu küçük gözlem dronu — gövde, kamera kubbesi, kollar, motorlar ve iniş
 * ayakları. Yerel orijin ayakların altı (y = 0); pervaneler ayrı (dönsün diye) `ROTOR_POSITIONS`'ta. Yere inmiş drone
 * yapısı (`drone`) ve uçan drone aynı gövdeyi kullanır.
 */

const COLORS = {
  body: 0x2f3236,
  arm: 0x44484d,
  motor: 0x1c1d1f,
  camera: 0x0e1012,
  lens: 0x3b6e8f,
  skid: 0x5a5d61,
  light: 0xd9372b,
  rotor: 0x26282a,
} as const;

/** Kol ucu (motor) konumları (yerel, gövde üstü). */
export const ROTOR_POSITIONS: ReadonlyArray<readonly [number, number, number]> = [
  [0.3, 0.27, 0.3],
  [-0.3, 0.27, 0.3],
  [0.3, 0.27, -0.3],
  [-0.3, 0.27, -0.3],
];

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
  yaw = 0,
): Part {
  const g = new BoxGeometry(w, h, d);
  if (yaw !== 0) g.rotateY(yaw);
  return { geometry: place(g, x, y, z), color };
}

export function droneBodyParts(): Part[] {
  const parts: Part[] = [
    box(0.26, 0.09, 0.32, 0, 0.2, 0, COLORS.body),
    box(0.14, 0.07, 0.1, 0, 0.13, -0.14, COLORS.camera),
    box(0.06, 0.04, 0.02, 0, 0.13, -0.195, COLORS.lens),
    box(0.03, 0.02, 0.03, 0, 0.255, 0.15, COLORS.light),
    box(0.012, 0.11, 0.012, 0.06, 0.29, 0.12, COLORS.skid), // anten
  ];
  for (const [x, y, z] of ROTOR_POSITIONS) {
    const yaw = Math.atan2(x, z);
    parts.push(box(0.035, 0.03, 0.42, x / 2, y - 0.05, z / 2, COLORS.arm, yaw));
    parts.push({
      geometry: place(new CylinderGeometry(0.035, 0.04, 0.06, 6), x, y - 0.03, z),
      color: COLORS.motor,
    });
  }
  // İniş ayakları: iki kızak.
  for (const sx of [-0.1, 0.1]) {
    parts.push(box(0.02, 0.12, 0.02, sx, 0.09, -0.08, COLORS.skid));
    parts.push(box(0.02, 0.12, 0.02, sx, 0.09, 0.08, COLORS.skid));
    parts.push(box(0.025, 0.02, 0.3, sx, 0.02, 0, COLORS.skid));
  }
  return parts;
}

/** Uçan drone gövdesi (pervanesiz). Çağıran `dispose()` eder. */
export function buildDroneGeometry(): BufferGeometry {
  return merge(droneBodyParts(), createRandom(8811));
}

/** Pervane: ince iki kanatlı disk (dönerken bulanık görünür). */
export function buildRotorGeometry(): BufferGeometry {
  return merge(
    [
      { geometry: new BoxGeometry(0.24, 0.006, 0.03), color: COLORS.rotor },
      { geometry: new BoxGeometry(0.03, 0.006, 0.24), color: COLORS.rotor },
    ],
    createRandom(8812),
  );
}
