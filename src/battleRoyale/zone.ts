import { BATTLE_ROYALE } from '../config';
import type { Random } from '../utils/random';
import type { Circle } from './area';

/**
 * Güvenli bölge (saf): maç başında bütün aşamaların daireleri ve zamanları bir kez planlanır (`planZone`), oyun her
 * an `zoneAt(plan, t)` ile durumu okur. Her yeni daire bir öncekinin içindedir; merkezi alanın içinde ve `centerOk`'un
 * kabul ettiği (karada, yürünebilir…) bir noktadır. Her aşama `intervalMinutes` dakika sürer (bekleme `waitShare`
 * payı, kalanı daralma); sınırın en hızlı noktası `maxEdgeSpeed`'i aşacaksa daralma (dolayısıyla aşama) uzar.
 */

/** `planZone`'un alandan istediği (BrArea karşılar; testte sahte). */
export interface ZoneArea {
  enclosingCircle(): Circle;
  contains(x: number, z: number): boolean;
}

export interface ZonePhase {
  /** Aşamanın başladığı, daralmanın başladığı ve bittiği an (maç saniyesi). */
  start: number;
  shrinkStart: number;
  end: number;
  from: Circle;
  to: Circle;
  /** Bu aşamada bölge dışındakine saniye başı hasar (can). */
  damage: number;
}

export interface ZonePlan {
  initial: Circle;
  phases: ZonePhase[];
  /** Son aşamanın bittiği an (bölge tamamen kapandı). */
  total: number;
}

export type ZoneStage = 'wait' | 'shrink' | 'closed';

export interface ZoneState {
  /** Aşama sırası (0'dan); bölge kapandıysa `phases.length`. */
  phase: number;
  stage: ZoneStage;
  /** Şimdiki güvenli daire. */
  circle: Circle;
  /** Aşamanın hedef dairesi (kapandıysa null). */
  next: Circle | null;
  /** Bu evrenin bittiği an (kapandıysa sonsuz). */
  stageEnds: number;
  /** Dışarıda saniye başı hasar. */
  damage: number;
}

/**
 * Bölge planı. `centerOk(x, z, aşama)`: yeni dairenin merkezi olabilir mi (kara, yürünebilir, cami ayak izi değil…).
 * Uygun merkez bulunamazsa önceki merkez korunur (her zaman geçerlidir: yeni daire içeride kalır).
 */
export function planZone(
  area: ZoneArea,
  random: Random,
  intervalMinutes: number,
  centerOk: (x: number, z: number, phase: number) => boolean,
): ZonePlan {
  const cfg = BATTLE_ROYALE.zone;
  const period = intervalMinutes * 60;
  const initial = area.enclosingCircle();
  const phases: ZonePhase[] = [];
  let from = initial;
  let t = 0;
  cfg.phases.forEach((p, index) => {
    const r = from.r * p.radiusFactor;
    const room = from.r - r; // yeni merkez eski merkezden en çok bu kadar uzakta olabilir
    let to: Circle | null = null;
    for (let i = 0; i < cfg.centerTries && !to; i++) {
      // Disk içinde düzgün dağılım.
      const angle = random.next() * Math.PI * 2;
      const d = Math.sqrt(random.next()) * room;
      const x = from.x + Math.cos(angle) * d;
      const z = from.z + Math.sin(angle) * d;
      if (area.contains(x, z) && centerOk(x, z, index)) to = { x, z, r };
    }
    to ??= { x: from.x, z: from.z, r };
    const travel = from.r - to.r + Math.hypot(to.x - from.x, to.z - from.z);
    const wait = period * cfg.waitShare;
    // Büyük alanda kısa aralık, sınırı yetişilemez hızda kapatmasın: daralma gerekirse seçilenden uzar.
    const shrink = Math.max(period - wait, travel / cfg.maxEdgeSpeed);
    phases.push({
      start: t,
      shrinkStart: t + wait,
      end: t + wait + shrink,
      from,
      to,
      damage: p.damage,
    });
    t += wait + shrink;
    from = to;
  });
  return { initial, phases, total: t };
}

/** `t` maç saniyesindeki bölge durumu. */
export function zoneAt(plan: ZonePlan, t: number): ZoneState {
  for (let i = 0; i < plan.phases.length; i++) {
    const p = plan.phases[i]!;
    if (t >= p.end) continue;
    if (t < p.shrinkStart) {
      return {
        phase: i,
        stage: 'wait',
        circle: p.from,
        next: p.to,
        stageEnds: p.shrinkStart,
        damage: p.damage,
      };
    }
    const k = (t - p.shrinkStart) / (p.end - p.shrinkStart);
    return {
      phase: i,
      stage: 'shrink',
      circle: {
        x: p.from.x + (p.to.x - p.from.x) * k,
        z: p.from.z + (p.to.z - p.from.z) * k,
        r: p.from.r + (p.to.r - p.from.r) * k,
      },
      next: p.to,
      stageEnds: p.end,
      damage: p.damage,
    };
  }
  const last = plan.phases[plan.phases.length - 1];
  return {
    phase: plan.phases.length,
    stage: 'closed',
    circle: last?.to ?? plan.initial,
    next: null,
    stageEnds: Infinity,
    damage: last?.damage ?? 0,
  };
}

/** (x, z) güvenli dairenin içinde mi? */
export function insideCircle(circle: Circle, x: number, z: number): boolean {
  return Math.hypot(x - circle.x, z - circle.z) <= circle.r;
}

/**
 * (x, z)'de saniye başı bölge hasarı: güvenli dairenin dışındaysa aşamanın hasarı; seçili alanın dışındaysa (komşu
 * il, deniz) daire içinde de en az `outsideAreaDamage`. İçerideyse 0.
 */
export function zoneDamageAt(state: ZoneState, inArea: boolean, x: number, z: number): number {
  const outsideCircle = !insideCircle(state.circle, x, z);
  const base = outsideCircle ? state.damage : 0;
  return inArea ? base : Math.max(base, BATTLE_ROYALE.zone.outsideAreaDamage);
}

/** Güvenli daireye uzaklık (içerideyse 0; oyun m). */
export function distanceToSafety(circle: Circle, x: number, z: number): number {
  return Math.max(0, Math.hypot(x - circle.x, z - circle.z) - circle.r);
}
