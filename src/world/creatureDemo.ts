import { CREATURE_KINDS, type CreatureKind, type CreatureView } from '../creatures/kinds';

/**
 * Geliştirme demosu (`?creatures=demo`, yalnızca dev): canlı simülasyonundan bağımsız, sahte `CreatureView[]`
 * üretir; görsel doğrulama (yürüme, koşma, saldırı, vuruş parlaması, leş) Hesap A'nın sistemini beklemeden
 * yapılır. Her tür, merkezin çevresinde kendi çemberinde daire çizerek yürür; bir de yerde yatan leşi vardır.
 * Saf: aynı zaman → aynı görünümler.
 */

/** Döngü: otla, yürü, koş, saldır, tetikte (sn). */
const SCHEDULE = [
  { state: 'graze', seconds: 2, speed: 0 },
  { state: 'wander', seconds: 3, speed: 1.5 },
  { state: 'chase', seconds: 2, speed: 7 },
  { state: 'attack', seconds: 2, speed: 0 },
  { state: 'alert', seconds: 1, speed: 0 },
] as const;

const CYCLE_SECONDS = SCHEDULE.reduce((sum, step) => sum + step.seconds, 0);
const CYCLE_DISTANCE = SCHEDULE.reduce((sum, step) => sum + step.seconds * step.speed, 0);
/** Tür başına yürüyen canlı sayısı ve çemberlerin yarıçapı (oyun m). */
const PER_KIND = 2;
const FIRST_RADIUS = 6;
const RADIUS_STEP = 3;
/** Vuruş parlamasının tekrar aralığı ve süresi (sn). */
const FLASH_PERIOD = 5;
const FLASH_SECONDS = 0.5;

/** Gerçek boyutlara yakın vuruş hacmi (yatay yarıçap, boy; oyun m). */
const SIZES: Record<CreatureKind, { radius: number; height: number; health: number }> = {
  roe_deer: { radius: 0.35, height: 0.85, health: 40 },
  wild_boar: { radius: 0.45, height: 0.9, health: 90 },
  wolf: { radius: 0.4, height: 0.85, health: 70 },
  brown_bear: { radius: 0.7, height: 1.3, health: 250 },
  red_deer: { radius: 0.6, height: 1.4, health: 120 },
  red_fox: { radius: 0.25, height: 0.45, health: 25 },
  hare: { radius: 0.2, height: 0.35, health: 12 },
  pheasant: { radius: 0.25, height: 0.5, health: 8 },
};

/** Döngünün başından `t` saniyede (döngü içi) alınan yol (oyun m). */
function distanceWithinCycle(t: number): {
  distance: number;
  step: (typeof SCHEDULE)[number];
  into: number;
} {
  let remaining = t;
  let distance = 0;
  for (const step of SCHEDULE) {
    if (remaining < step.seconds)
      return { distance: distance + remaining * step.speed, step, into: remaining };
    remaining -= step.seconds;
    distance += step.seconds * step.speed;
  }
  const last = SCHEDULE[SCHEDULE.length - 1] as (typeof SCHEDULE)[number];
  return { distance, step: last, into: last.seconds };
}

/** `time` (sn) anındaki demo görünümleri; `anchor` çemberlerin merkezi, `heightAt` zemin yüksekliği. */
export function demoViews(
  time: number,
  anchor: { x: number; z: number },
  heightAt: (x: number, z: number) => number,
): CreatureView[] {
  const views: CreatureView[] = [];
  let id = 1;
  CREATURE_KINDS.forEach((kind, k) => {
    const radius = FIRST_RADIUS + RADIUS_STEP * k;
    const size = SIZES[kind];
    for (let i = 0; i < PER_KIND; i += 1) {
      // Canlılar aynı anda aynı durumda olmasın: döngüye kayma ve çemberde başlangıç açısı.
      const shifted = time + i * (CYCLE_SECONDS / PER_KIND) + k * 1.3;
      const cycles = Math.floor(shifted / CYCLE_SECONDS);
      const within = shifted - cycles * CYCLE_SECONDS;
      const { distance, step, into } = distanceWithinCycle(within);
      const traveled = cycles * CYCLE_DISTANCE + distance;
      const theta = (i * Math.PI) / PER_KIND + (k * Math.PI) / 6 + traveled / radius;
      const x = anchor.x + Math.cos(theta) * radius;
      const z = anchor.z + Math.sin(theta) * radius;
      const flash = (time + id * 1.7) % FLASH_PERIOD;
      views.push({
        id: id++,
        kind,
        x,
        y: heightAt(x, z),
        z,
        yaw: Math.PI - theta, // çemberin teğetinde (saat yönünün tersi) ilerler
        speed: step.speed,
        state: step.state,
        attackPhase: step.state === 'attack' ? into / step.seconds : 0,
        hitFlash: flash < FLASH_SECONDS ? 1 - flash / FLASH_SECONDS : 0,
        health: size.health,
        maxHealth: size.health,
        radius: size.radius,
        height: size.height,
        dead: false,
        deadSeconds: 0,
      });
    }
    // Yerde yatan leş (çemberin dışında, sabit).
    const theta = k * (Math.PI / 2) + 0.4;
    const x = anchor.x + Math.cos(theta) * (radius + 14);
    const z = anchor.z + Math.sin(theta) * (radius + 14);
    views.push({
      id: id++,
      kind,
      x,
      y: heightAt(x, z),
      z,
      yaw: theta,
      speed: 0,
      state: 'dead',
      attackPhase: 0,
      hitFlash: 0,
      health: 0,
      maxHealth: size.health,
      radius: size.radius,
      height: size.height,
      dead: true,
      deadSeconds: time,
    });
  });
  return views;
}
