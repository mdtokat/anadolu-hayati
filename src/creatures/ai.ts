import { CREATURES } from '../config';
import type { Random } from '../utils/random';
import type { CreatureKind, CreatureState } from './kinds';
import { angleDiff, yawOf, type FireSense, type PlayerSense } from './perception';
import { SPECIES, type Behavior, type SpeciesDef } from './species';

/**
 * Yapay zekâ durum makinesi (5.2, saf mantık; Three.js ve dünya verisinden bağımsız). Bir canlının beyni
 * (`Brain`) ve duyuları (`Senses`) verilince bir sonraki beyni, hareket niyetini ve olayları üretir.
 * Rastgelelik yalnızca verilen `rng` iledir (aynı girdi + aynı tohum → aynı sonuç).
 *
 * Geçişler **tablo güdümlüdür** (`TRANSITIONS`): her durumda tablo sırayla taranır, koşulu sağlayan ilk
 * satır uygulanır. Bu yüzden her geçiş tek başına test edilebilir (`tests/ai.test.ts`).
 */

export type PassivePlan = 'idle' | 'wander' | 'graze';

export interface Brain {
  kind: CreatureKind;
  x: number;
  z: number;
  /** Bakış yönü (yaw; 0 = −Z, pozitif sola). */
  yaw: number;
  /** Gerçekleşen yatay hız (oyun m/sn): niyetin hizalanmaya göre kırpılmış hâli. */
  speed: number;
  state: CreatureState;
  /** Mevcut durumda geçen süre (sn). */
  stateTime: number;
  /** Zamanlı durumlar (idle/graze/wander) için planlanan süre (sn). */
  stateDuration: number;
  /** Zamanlı durum bitince geçilecek pasif durum. */
  plan: PassivePlan;
  health: number;
  maxHealth: number;
  /** Saldırı hamlesi ilerlemesi 0–1; `attack` dışında 0. */
  attackPhase: number;
  /** Bu saldırıda vuruş yapıldı mı (vuruş bir kez gelir). */
  struck: boolean;
  /** Yeni saldırıya kadar kalan bekleme (sn). */
  cooldown: number;
  /** Oyuncuyu fark ettiği bildirildi mi (`creature:noticed` bir kez). */
  noticed: boolean;
  /** Vurulunca kalan "kışkırtılmış" süresi (sn). */
  alarm: number;
  /** Oyuncuyu algılamadan geçen süre (sn): alert/stalk/chase'te. */
  lostTime: number;
  /** Kovalama/saldırı döngüsünde geçen toplam süre (sn): saldırı durumu sıfırlamaz, kovalama sonsuza uzamasın. */
  pursuitTime: number;
  homeX: number;
  homeZ: number;
  /** Dolaşma hedefi; null = yok/vardı. */
  target: { x: number; z: number } | null;
  /** Kaçışta uzaklaşılan nokta. */
  fleeFrom: { x: number; z: number } | null;
}

export interface ThreatSense {
  x: number;
  z: number;
  dist: number;
}

export interface Senses {
  /** Oyuncu algısı; oyuncu ölü/yoksa null. */
  player: PlayerSense | null;
  /** Otoburların algıladığı en yakın tehdit (oyuncu ya da yırtıcı); yoksa null. */
  threat: ThreatSense | null;
  /** Canlıya `fireAvoidRadius` içindeki en yakın yanan ateş. */
  fire: FireSense | null;
  /** 0 (gündüz) – 1 (gece). */
  darkness: number;
}

export type AiEvent =
  /** Oyuncuyu ilk fark etti (alert/stalk/chase'e geçti). */
  | { type: 'noticed'; state: CreatureState }
  /** Saldırı vuruşu oyuncuya isabet etti (saldırı başına bir kez); `damage` ham hasar. */
  | { type: 'strike'; damage: number };

export interface AiIntent {
  /** İstenen yön (yaw) ve hız (oyun m/sn). */
  heading: number;
  speed: number;
}

export interface StepResult {
  next: Brain;
  intent: AiIntent;
  events: AiEvent[];
}

const PASSIVE: readonly CreatureState[] = ['idle', 'wander', 'graze'];
const ENGAGED: readonly CreatureState[] = ['alert', 'stalk', 'chase', 'attack'];
const ALIVE: readonly CreatureState[] = [
  'idle',
  'wander',
  'graze',
  'alert',
  'flee',
  'stalk',
  'chase',
  'attack',
];
const ALL_BEHAVIORS: readonly Behavior[] = ['skittish', 'defensive', 'hunter'];
const FIGHTERS: readonly Behavior[] = ['defensive', 'hunter'];

interface Ctx {
  c: Brain;
  sp: SpeciesDef;
  s: Senses;
}

export interface Transition {
  name: string;
  from: readonly CreatureState[];
  to: CreatureState;
  behaviors: readonly Behavior[];
  when(ctx: Ctx): boolean;
}

/** Oyuncuyu kaybetme bekleme süresi (sn) ve sıkılma katsayısı. */
const LOST_SECONDS = 4;
const BORED_FACTOR = 3;
/** Sinsi yaklaşma, hedef `stalkRange` × bu değerin ötesine çıkınca bırakılır. */
const STALK_DROP_FACTOR = 1.4;
/** Dolaşma hedefine bu kadar yaklaşınca varılmış sayılır (oyun m). */
const ARRIVE_DIST = 1.5;
/** Atılan canlı hedefe bu kadar (oyun m) yaklaşınca durur (üst üste binmesin). */
const LUNGE_STOP_DIST = 0.9;
/** Zamanlı durumların süre aralıkları (sn). */
const IDLE_SECONDS: readonly [number, number] = [3, 8];
const GRAZE_SECONDS: readonly [number, number] = [6, 14];
const WANDER_MAX_SECONDS = 40;
/** Zamanlı durumdan sonra dolaşma olasılığı. */
const WANDER_CHANCE = 0.6;

const timeUp = ({ c }: Ctx): boolean =>
  c.state === 'wander'
    ? c.target === null || c.stateTime >= c.stateDuration
    : c.stateTime >= c.stateDuration;

const isWounded = ({ c, sp }: Ctx): boolean =>
  sp.woundedFraction > 0 && c.health / c.maxHealth < sp.woundedFraction;

/** Avcı hedefi izlemeye değer mi: karanlık ya da zayıf hedef. */
const huntWorthy = ({ s, sp }: Ctx): boolean =>
  s.player !== null &&
  s.player.noticed &&
  s.player.dist <= sp.stalkRange &&
  (s.darkness >= sp.darknessThreshold || s.player.weakness >= sp.weaknessThreshold);

/**
 * Geçiş tablosu. Sıra önemlidir: önce güvenlik (ateş, yaralanma), sonra kışkırtılma, fark etme, zamanlı
 * geçişler. `dead` uç durumdur; tabloda yoktur.
 */
export const TRANSITIONS: readonly Transition[] = [
  // ── Ortak (her aile) ──
  {
    name: 'fire_flee',
    from: ALIVE.filter((s) => s !== 'flee'),
    to: 'flee',
    behaviors: ALL_BEHAVIORS,
    when: ({ s }) => s.fire !== null,
  },
  {
    name: 'wounded_flee',
    from: ALIVE.filter((s) => s !== 'flee'),
    to: 'flee',
    behaviors: FIGHTERS,
    when: isWounded,
  },

  // ── Kaçak otobur (skittish) ──
  {
    name: 'provoked_flee',
    from: [...PASSIVE, 'alert'],
    to: 'flee',
    behaviors: ['skittish'],
    when: ({ c }) => c.alarm > 0,
  },
  {
    name: 'threat_close_flee',
    from: [...PASSIVE, 'alert'],
    to: 'flee',
    behaviors: ['skittish'],
    when: ({ s, sp }) => s.threat !== null && s.threat.dist <= sp.fleeTriggerDist,
  },
  {
    name: 'threat_alert',
    from: PASSIVE,
    to: 'alert',
    behaviors: ['skittish'],
    when: ({ s }) => s.threat !== null,
  },
  {
    name: 'alert_persist_flee',
    from: ['alert'],
    to: 'flee',
    behaviors: ['skittish'],
    when: ({ c, s, sp }) => s.threat !== null && c.stateTime >= sp.alertSeconds,
  },
  {
    name: 'alert_calm',
    from: ['alert'],
    to: 'graze',
    behaviors: ['skittish'],
    when: ({ c, s, sp }) => s.threat === null && c.stateTime >= sp.alertSeconds,
  },
  {
    name: 'flee_safe',
    from: ['flee'],
    to: 'wander',
    behaviors: ['skittish'],
    when: ({ c, s, sp }) =>
      s.fire === null &&
      c.stateTime >= sp.fleeSeconds &&
      (s.threat === null || s.threat.dist >= sp.safeDist),
  },

  // ── Savaşçılar (savunmacı + avcı) ──
  {
    name: 'provoked_chase',
    from: [...PASSIVE, 'alert', 'stalk'],
    to: 'chase',
    behaviors: FIGHTERS,
    when: ({ c }) => c.alarm > 0,
  },
  {
    name: 'chase_attack',
    from: ['chase'],
    to: 'attack',
    behaviors: FIGHTERS,
    when: ({ c, s, sp }) => s.player !== null && s.player.dist <= sp.attackRange && c.cooldown <= 0,
  },
  {
    name: 'attack_done',
    from: ['attack'],
    to: 'chase',
    behaviors: FIGHTERS,
    when: ({ c, sp }) => c.stateTime >= sp.attackWindup + sp.attackRecover,
  },
  {
    name: 'chase_lost',
    from: ['chase'],
    to: 'wander',
    behaviors: FIGHTERS,
    when: ({ c, s, sp }) =>
      s.player === null ||
      s.player.dist > sp.loseDist ||
      c.pursuitTime >= sp.chaseSeconds ||
      (!s.player.noticed && c.lostTime >= LOST_SECONDS),
  },
  {
    name: 'alert_lost',
    from: ['alert'],
    to: 'wander',
    behaviors: FIGHTERS,
    when: ({ c, s, sp }) =>
      (s.player === null || !s.player.noticed) && c.stateTime >= sp.alertSeconds,
  },
  {
    name: 'alert_bored',
    from: ['alert'],
    to: 'wander',
    behaviors: FIGHTERS,
    when: ({ c, s, sp }) =>
      c.stateTime >= sp.alertSeconds * BORED_FACTOR && !shouldEngage({ c, s, sp }),
  },

  // ── Savunmacı (boar, bear) ──
  {
    name: 'aggro_chase',
    from: [...PASSIVE, 'alert'],
    to: 'chase',
    behaviors: ['defensive'],
    when: ({ s, sp }) => s.player !== null && s.player.noticed && s.player.dist <= sp.aggroDist,
  },
  {
    name: 'notice_alert',
    from: PASSIVE,
    to: 'alert',
    behaviors: ['defensive'],
    when: ({ s }) => s.player !== null && s.player.noticed,
  },

  // ── Avcı (wolf) ──
  {
    name: 'hunt_stalk',
    from: [...PASSIVE, 'alert'],
    to: 'stalk',
    behaviors: ['hunter'],
    when: huntWorthy,
  },
  {
    name: 'hunter_notice',
    from: PASSIVE,
    to: 'alert',
    behaviors: ['hunter'],
    when: ({ s }) => s.player !== null && s.player.noticed,
  },
  {
    name: 'stalk_charge',
    from: ['stalk'],
    to: 'chase',
    behaviors: ['hunter'],
    when: ({ s, sp }) => s.player !== null && s.player.dist <= sp.chargeDist,
  },
  {
    name: 'stalk_abort',
    from: ['stalk'],
    to: 'wander',
    behaviors: ['hunter'],
    when: ({ c, s, sp }) =>
      s.player === null ||
      s.player.dist > sp.stalkRange * STALK_DROP_FACTOR ||
      (!s.player.noticed && c.lostTime >= LOST_SECONDS) ||
      (s.darkness < sp.darknessThreshold && s.player.weakness < sp.weaknessThreshold),
  },

  // ── Zamanlı pasif geçişler (tüm aileler) ──
  {
    name: 'timeout_to_idle',
    from: ['graze', 'wander'],
    to: 'idle',
    behaviors: ALL_BEHAVIORS,
    when: (ctx) => ctx.c.plan === 'idle' && timeUp(ctx),
  },
  {
    name: 'timeout_to_graze',
    from: ['idle', 'wander'],
    to: 'graze',
    behaviors: ALL_BEHAVIORS,
    when: (ctx) => ctx.c.plan === 'graze' && timeUp(ctx),
  },
  {
    name: 'timeout_to_wander',
    from: ['idle', 'graze'],
    to: 'wander',
    behaviors: ALL_BEHAVIORS,
    when: (ctx) => ctx.c.plan === 'wander' && timeUp(ctx),
  },
];

/** Uyarıdaki savaşçı tehdidi hâlâ ciddiye alıyor mu (sıkılmama koşulu). */
function shouldEngage(ctx: Ctx): boolean {
  if (ctx.sp.behavior === 'hunter') return huntWorthy(ctx);
  return (
    ctx.s.player !== null && ctx.s.player.noticed && ctx.s.player.dist <= ctx.sp.aggroDist * 1.5
  );
}

/** Yeni bir beyin (doğma anı): pasif durumda, tam canlı. */
export function createBrain(
  kind: CreatureKind,
  x: number,
  z: number,
  yaw: number,
  rng: Random,
): Brain {
  const brain: Brain = {
    kind,
    x,
    z,
    yaw,
    speed: 0,
    state: 'idle',
    stateTime: 0,
    stateDuration: 0,
    plan: 'wander',
    health: SPECIES[kind].maxHealth,
    maxHealth: SPECIES[kind].maxHealth,
    attackPhase: 0,
    struck: false,
    cooldown: 0,
    noticed: false,
    alarm: 0,
    lostTime: 0,
    pursuitTime: 0,
    homeX: x,
    homeZ: z,
    target: null,
    fleeFrom: null,
  };
  enter(brain, 'idle', SPECIES[kind], { player: null, threat: null, fire: null, darkness: 0 }, rng);
  return brain;
}

/** `state`'e girerken başlangıç değerlerini kurar (brain'i yerinde değiştirir). */
function enter(c: Brain, state: CreatureState, sp: SpeciesDef, s: Senses, rng: Random): void {
  const previous = c.state;
  c.state = state;
  c.stateTime = 0;
  c.lostTime = 0;
  c.attackPhase = 0;
  c.struck = false;
  c.target = null;

  if (PASSIVE.includes(state)) {
    c.noticed = false;
    c.fleeFrom = null;
    const roll = rng.next();
    if (state === 'idle') {
      c.stateDuration = rng.range(IDLE_SECONDS[0], IDLE_SECONDS[1]);
      c.plan = roll < WANDER_CHANCE ? 'wander' : sp.behavior === 'hunter' ? 'wander' : 'graze';
    } else if (state === 'graze') {
      c.stateDuration = rng.range(GRAZE_SECONDS[0], GRAZE_SECONDS[1]);
      c.plan = roll < WANDER_CHANCE ? 'wander' : 'idle';
    } else {
      c.stateDuration = WANDER_MAX_SECONDS;
      c.plan = roll < 0.5 || sp.behavior === 'hunter' ? 'idle' : 'graze';
      const angle = rng.range(0, Math.PI * 2);
      const distance = rng.range(sp.wanderRadius * 0.25, sp.wanderRadius);
      c.target = {
        x: c.homeX + Math.cos(angle) * distance,
        z: c.homeZ + Math.sin(angle) * distance,
      };
    }
    return;
  }

  if (state === 'flee') {
    const from = s.fire ?? s.threat ?? s.player;
    c.fleeFrom = from
      ? { x: 'dx' in from ? c.x + from.dx : from.x, z: 'dz' in from ? c.z + from.dz : from.z }
      : { x: c.x + Math.sin(c.yaw), z: c.z + Math.cos(c.yaw) };
    return;
  }

  if (previous === 'attack' && state === 'chase') c.cooldown = sp.attackCooldown;
}

/** Hedef yönüne dönüş: dönüş hızıyla sınırlı yeni yaw ve hizalanma (0–1). */
function turnToward(
  yaw: number,
  heading: number,
  turnRate: number,
  dt: number,
): { yaw: number; alignment: number } {
  const diff = angleDiff(yaw, heading);
  const maxTurn = turnRate * dt;
  const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
  const remaining = diff - turn;
  return { yaw: yaw + turn, alignment: Math.max(CREATURES.minAlignedSpeed, Math.cos(remaining)) };
}

/**
 * Bir sabit adım (dt sn). `next` yeni beyindir (girdi değişmez); `intent` istenen yön/hız (test ve
 * hareket için), `events` bu adımda oluşan olaylardır.
 */
export function stepCreature(c: Brain, senses: Senses, dt: number, rng: Random): StepResult {
  if (c.state === 'dead') {
    return { next: c, intent: { heading: c.yaw, speed: 0 }, events: [] };
  }
  const sp = SPECIES[c.kind];
  const next: Brain = { ...c };
  const events: AiEvent[] = [];

  next.stateTime += dt;
  next.alarm = Math.max(0, next.alarm - dt);
  if (next.state !== 'attack') next.cooldown = Math.max(0, next.cooldown - dt);
  next.pursuitTime = next.state === 'chase' || next.state === 'attack' ? next.pursuitTime + dt : 0;
  const tracking = ENGAGED.includes(next.state);
  if (tracking) {
    next.lostTime = senses.player?.noticed ? 0 : next.lostTime + dt;
  }

  // Geçiş: tabloyu sırayla tara, ilk koşulu sağlayan uygulanır.
  const ctx: Ctx = { c: next, sp, s: senses };
  for (const transition of TRANSITIONS) {
    if (
      transition.behaviors.includes(sp.behavior) &&
      transition.from.includes(next.state) &&
      transition.when(ctx)
    ) {
      enter(next, transition.to, sp, senses, rng);
      if (
        (transition.to === 'alert' || transition.to === 'stalk' || transition.to === 'chase') &&
        !next.noticed &&
        senses.player?.noticed
      ) {
        next.noticed = true;
        events.push({ type: 'noticed', state: transition.to });
      }
      break;
    }
  }

  // Durum içi davranış: yön ve hız niyeti.
  let heading = next.yaw;
  let speed = 0;
  const toPlayer = senses.player ? yawOf(senses.player.dx, senses.player.dz) : next.yaw;

  switch (next.state) {
    case 'idle':
    case 'graze':
      break;
    case 'wander': {
      if (next.target) {
        const dx = next.target.x - next.x;
        const dz = next.target.z - next.z;
        if (Math.hypot(dx, dz) <= ARRIVE_DIST) {
          next.target = null;
        } else {
          heading = yawOf(dx, dz);
          speed = sp.walkSpeed;
        }
      }
      break;
    }
    case 'alert': {
      const look = senses.threat
        ? yawOf(senses.threat.x - next.x, senses.threat.z - next.z)
        : senses.player
          ? toPlayer
          : next.yaw;
      heading = look;
      break;
    }
    case 'flee': {
      const source =
        senses.fire ?? senses.threat ?? (senses.player?.noticed ? senses.player : null);
      if (source) {
        next.fleeFrom =
          'dx' in source
            ? { x: next.x + source.dx, z: next.z + source.dz }
            : { x: source.x, z: source.z };
      }
      const from = next.fleeFrom ?? {
        x: next.x + Math.sin(next.yaw),
        z: next.z + Math.cos(next.yaw),
      };
      heading = yawOf(next.x - from.x, next.z - from.z);
      speed = sp.runSpeed;
      break;
    }
    case 'stalk':
      heading = toPlayer;
      speed = sp.walkSpeed;
      break;
    case 'chase':
      heading = toPlayer;
      speed = sp.runSpeed;
      break;
    case 'attack': {
      heading = toPlayer;
      // Hazırlıkta hedefe atılır (lunge); çok yakınsa ya da vuruştan sonra yerinde durur.
      if (
        next.stateTime < sp.attackWindup &&
        senses.player &&
        senses.player.dist > LUNGE_STOP_DIST
      ) {
        speed = sp.runSpeed * CREATURES.attackLungeSpeedFactor;
      }
      const duration = sp.attackWindup + sp.attackRecover;
      next.attackPhase = Math.min(next.stateTime / duration, 1);
      if (!next.struck && next.stateTime >= sp.attackWindup) {
        next.struck = true;
        if (senses.player && senses.player.dist <= sp.attackRange * CREATURES.attackReachSlack) {
          events.push({ type: 'strike', damage: sp.attackDamage });
        }
      }
      break;
    }
    case 'dead':
      break;
  }

  const turned = turnToward(next.yaw, heading, sp.turnRate, dt);
  next.yaw = turned.yaw;
  next.speed = speed * (speed > 0 ? turned.alignment : 0);
  return { next, intent: { heading, speed }, events };
}

/** Takılan canlıyı yeni bir dolaşma hedefiyle kurtarır (beyni yerinde değiştirir; `rng` yalnızca hedef için). */
export function forceWander(c: Brain, rng: Random): void {
  if (c.state === 'dead') return;
  enter(c, 'wander', SPECIES[c.kind], { player: null, threat: null, fire: null, darkness: 0 }, rng);
  // Mevcut bakıştan uzağa: aynı engele tekrar yönelmesin.
  const away = c.yaw + Math.PI + rng.range(-0.8, 0.8);
  const distance = rng.range(SPECIES[c.kind].wanderRadius * 0.25, SPECIES[c.kind].wanderRadius);
  c.target = { x: c.x - Math.sin(away) * distance, z: c.z - Math.cos(away) * distance };
}
