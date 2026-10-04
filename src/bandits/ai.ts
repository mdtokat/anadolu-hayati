import { BANDITS, RANGED } from '../config';
import type { Random } from '../utils/random';
import {
  isMeleeWeapon,
  type BanditActivity,
  type BanditRole,
  type BanditState,
  type BanditWeapon,
} from './kinds';

/**
 * Eşkıya yapay zekâsı (Faz 11, 11.6; saf, tablo güdümlü — `creatures/ai.ts` kalıbı). Her adımda önce geçiş tablosu
 * (`TRANSITIONS`, sırası önceliktir; ilk uyan kazanır), sonra durumun davranışı çalışır: hareket niyeti ve eylemler
 * (yakın vuruş, atış, fark etme, teslim olma). Algı ve dünya `BanditSystem`'in işidir; burası yalnızca karar verir.
 */

export interface Point {
  x: number;
  z: number;
}

/** Beyin: bir eşkıyanın karar durumu. */
export interface BanditBrain {
  state: BanditState;
  /** Bu durumda geçen süre (sn). */
  stateTime: number;
  x: number;
  z: number;
  yaw: number;
  health: number;
  maxHealth: number;
  weapon: BanditWeapon;
  role: BanditRole;
  /** Saldırı/atış beklemesi (sn). */
  cooldown: number;
  /** Son hasardan beri geçen süre (sn; hiç vurulmadıysa sonsuz). */
  sinceHurt: number;
  /** Oyuncunun son görüldüğü yer ve görülmeyeli geçen süre. */
  lastSeen: Point | null;
  lostTime: number;
  /** Araştırılacak nokta (ses). */
  investigate: Point | null;
  /** Yürüyüş hedefi (devriye, odun, av) ve orada bekleme süresi. */
  waypoint: Point | null;
  dwell: number;
  /** Bu çatışmada geri çekildi mi (bir kez)? */
  retreated: boolean;
  /** Oyuncuyu ilk kez fark etti mi (olay bir kez)? */
  noticed: boolean;
  /** Yakın vuruş bu hamlede yapıldı mı? */
  struck: boolean;
  /** Teslim olmaz (Battle Royale yarışmacısı); yoksa teslim olabilir. */
  noSurrender?: boolean;
}

/** Oyuncu algısı (ölü ya da camideyse null: eşkıya onu algılamaz, saldırmaz). */
export interface PlayerSense {
  x: number;
  z: number;
  dist: number;
  /** Görüş hattında ve menzilde mi? */
  visible: boolean;
  /** Duyuldu mu (hareket gürültüsü)? */
  heard: boolean;
}

export interface BanditSenses {
  player: PlayerSense | null;
  /** Bu adımda duyulan gürültü (atış…); yoksa null. */
  noise: Point | null;
  /** Saate göre sakin etkinlik ve onun yeri (oturak, çadır, nöbet, pusu). */
  activity: BanditActivity;
  home: Point & { yaw: number };
  camp: Point;
  /** Av (yalnızca `hunt`): menzildeki karaca. */
  prey: (Point & { id: string; dist: number }) | null;
  /** `travel` etkinliğinde `home`'a gidiş hızı (oyun m/sn; yoksa yürüme hızı). */
  travelSpeed?: number;
}

export type BanditAction =
  | { type: 'noticed' }
  | { type: 'strike'; damage: number }
  | { type: 'shoot'; target: 'player' | 'prey'; x: number; z: number; preyId?: string }
  | { type: 'surrender' };

export interface BanditIntent {
  /** İstenen yön (yaw; ileri = (−sin, −cos)) ve hız (oyun m/sn). */
  heading: number;
  speed: number;
  /** Hareket etmese de bakılacak yön (yoksa heading). */
  face?: number;
}

export interface BanditStep {
  next: BanditBrain;
  intent: BanditIntent;
  actions: BanditAction[];
}

const CALM: readonly BanditState[] = [
  'sit',
  'sleep',
  'guard',
  'patrol',
  'hunt',
  'wood',
  'ambush',
  'travel',
];
const FIGHTING: readonly BanditState[] = ['chase', 'attack', 'shoot', 'cover'];
const ALIVE: readonly BanditState[] = [
  ...CALM,
  'alert',
  ...FIGHTING,
  'retreat',
  'surrender',
  'flee',
];

/** Yeni vurulmuş sayılma süresi (sn). */
const HURT_WINDOW = 0.5;
/** Siper (yan kaçış) süresi (sn). */
const COVER_SECONDS = 2.5;
/** Yakın vuruşta menzile eklenen pay (hamle sırasında oyuncu biraz kaçabilir). */
const STRIKE_GRACE = 0.6;
/** Odun toplama/avda bir noktada bekleme (sn). */
const DWELL_SECONDS = 6;
/** Yolculukta varış payı (oyun m). */
const TRAVEL_ARRIVE = 1.5;

export function createBrain(
  x: number,
  z: number,
  yaw: number,
  weapon: BanditWeapon,
  role: BanditRole,
  activity: BanditActivity,
): BanditBrain {
  const maxHealth = role === 'leader' ? BANDITS.leaderHealth : BANDITS.health;
  return {
    state: activity,
    stateTime: 0,
    x,
    z,
    yaw,
    health: maxHealth,
    maxHealth,
    weapon,
    role,
    cooldown: 0,
    sinceHurt: Infinity,
    lastSeen: null,
    lostTime: 0,
    investigate: null,
    waypoint: null,
    dwell: 0,
    retreated: false,
    noticed: false,
    struck: false,
  };
}

/** Saldırıya geçince girilen durum: menzilli silahta atış, yakında kovalamaca. */
export function engageState(weapon: BanditWeapon): BanditState {
  return isMeleeWeapon(weapon) ? 'chase' : 'shoot';
}

/** Saate göre sakin etkinlik (saf, deterministik): uyku saatleri, reis ateş başında, nöbetçi nöbette, üyeler dönüşümlü. */
export function scheduledActivity(
  role: BanditRole,
  index: number,
  campId: number,
  hour: number,
  hasAmbush: boolean,
): BanditActivity {
  const [sleepFrom, sleepTo] = BANDITS.sleepHours;
  const asleep =
    sleepFrom > sleepTo ? hour >= sleepFrom || hour < sleepTo : hour >= sleepFrom && hour < sleepTo;
  if (role === 'guard') return 'guard'; // nöbetçi uyumaz (gece görüşü zayıftır)
  if (asleep) return 'sleep';
  if (role === 'leader') return 'sit';
  const [ambushFrom, ambushTo] = BANDITS.ambushHours;
  const block = Math.floor(hour / BANDITS.activityHours);
  const options: BanditActivity[] = ['sit', 'patrol', 'wood', 'hunt'];
  if (hasAmbush && hour >= ambushFrom && hour < ambushTo) options.push('ambush');
  const h = Math.abs(
    Math.imul(campId ^ (index * 0x9e3779b1), 0x85ebca6b) ^ Math.imul(block + 1, 0xc2b2ae35),
  );
  return options[h % options.length]!;
}

interface Ctx {
  c: BanditBrain;
  s: BanditSenses;
}

interface Transition {
  name: string;
  from: readonly BanditState[];
  to: (ctx: Ctx) => BanditState;
  when: (ctx: Ctx) => boolean;
}

const fraction = (c: BanditBrain): number => c.health / c.maxHealth;
const visible = (s: BanditSenses): boolean => s.player?.visible === true;
const fixed = (state: BanditState) => () => state;

/** Geçiş tablosu (sıra önceliktir). Her satır `tests/banditAi.test.ts`'te sınanır. */
export const TRANSITIONS: readonly Transition[] = [
  { name: 'died', from: ALIVE, to: fixed('dead'), when: ({ c }) => c.health <= 0 },
  {
    name: 'surrender',
    from: ALIVE.filter((s) => s !== 'surrender' && s !== 'flee'),
    to: fixed('surrender'),
    when: ({ c }) => !c.noSurrender && fraction(c) < BANDITS.surrenderHealthFraction,
  },
  {
    name: 'retreat',
    from: FIGHTING,
    to: fixed('retreat'),
    when: ({ c }) => !c.retreated && fraction(c) < BANDITS.retreatHealthFraction,
  },
  {
    name: 'retreat_done',
    from: ['retreat'],
    to: ({ c, s }) => (visible(s) ? engageState(c.weapon) : 'alert'),
    when: ({ c }) => c.stateTime >= BANDITS.retreatSeconds,
  },
  {
    name: 'ambush_spring',
    from: ['ambush'],
    to: ({ c }) => engageState(c.weapon),
    when: ({ c, s }) =>
      c.sinceHurt < HURT_WINDOW ||
      (visible(s) && (s.player?.dist ?? Infinity) <= BANDITS.ambushTrigger),
  },
  {
    name: 'provoked',
    from: [...CALM, 'alert'],
    to: ({ c }) => engageState(c.weapon),
    when: ({ c, s }) => c.sinceHurt < HURT_WINDOW && s.player !== null,
  },
  {
    name: 'notice',
    from: CALM.filter((s) => s !== 'ambush' && s !== 'sleep'),
    to: ({ c }) => engageState(c.weapon),
    when: ({ s }) => visible(s),
  },
  {
    name: 'wake',
    from: ['sleep'],
    to: fixed('alert'),
    when: ({ s, c }) => s.noise !== null || s.player?.heard === true || c.sinceHurt < HURT_WINDOW,
  },
  {
    name: 'hear',
    from: CALM.filter((s) => s !== 'sleep'),
    to: fixed('alert'),
    when: ({ s }) => s.noise !== null || s.player?.heard === true,
  },
  {
    name: 'alert_engage',
    from: ['alert'],
    to: ({ c }) => engageState(c.weapon),
    when: ({ s }) => visible(s),
  },
  {
    name: 'alert_calm',
    from: ['alert'],
    to: ({ s }) => s.activity,
    when: ({ c, s }) => !visible(s) && c.stateTime >= BANDITS.alertSeconds,
  },
  {
    name: 'disengage',
    from: FIGHTING,
    to: fixed('alert'),
    when: ({ c, s }) => s.player === null || (!visible(s) && c.lostTime >= BANDITS.lostSeconds),
  },
  {
    name: 'chase_attack',
    from: ['chase'],
    to: fixed('attack'),
    when: ({ c, s }) =>
      visible(s) &&
      isMeleeWeapon(c.weapon) &&
      (s.player?.dist ?? Infinity) <= BANDITS.melee[c.weapon].reach &&
      c.cooldown <= 0,
  },
  {
    name: 'attack_done',
    from: ['attack'],
    to: fixed('chase'),
    when: ({ c }) => isMeleeWeapon(c.weapon) && c.stateTime >= BANDITS.melee[c.weapon].windup,
  },
  {
    name: 'take_cover',
    from: ['shoot'],
    to: fixed('cover'),
    when: ({ c }) => c.sinceHurt < HURT_WINDOW,
  },
  {
    name: 'cover_done',
    from: ['cover'],
    to: fixed('shoot'),
    when: ({ c }) => c.stateTime >= COVER_SECONDS,
  },
  {
    name: 'schedule',
    from: CALM,
    to: ({ s }) => s.activity,
    when: ({ c, s }) => s.activity !== c.state,
  },
];

/** Bir karar adımı (saf; `rng` yalnızca yürüyüş hedefleri ve uyku dışı bakınma için). */
export function stepBandit(
  brain: Readonly<BanditBrain>,
  senses: BanditSenses,
  dt: number,
  rng: Random,
): BanditStep {
  const c: BanditBrain = { ...brain };
  const actions: BanditAction[] = [];
  c.stateTime += dt;
  c.sinceHurt += dt;
  c.cooldown = Math.max(0, c.cooldown - dt);
  if (senses.player?.visible) {
    c.lastSeen = { x: senses.player.x, z: senses.player.z };
    c.lostTime = 0;
  } else {
    c.lostTime += dt;
  }
  if (senses.noise) c.investigate = { ...senses.noise };
  else if (senses.player?.heard) c.investigate = { x: senses.player.x, z: senses.player.z };

  if (c.state !== 'dead') {
    for (const t of TRANSITIONS) {
      if (!t.from.includes(c.state) || !t.when({ c, s: senses })) continue;
      enter(c, t.to({ c, s: senses }), actions);
      break;
    }
  }
  return { next: c, intent: behave(c, senses, dt, rng, actions), actions };
}

function enter(c: BanditBrain, state: BanditState, actions: BanditAction[]): void {
  if (state === c.state) return;
  const wasCalm = CALM.includes(c.state) || c.state === 'alert';
  c.state = state;
  c.stateTime = 0;
  c.struck = false;
  if (FIGHTING.includes(state) && wasCalm && !c.noticed) {
    c.noticed = true;
    actions.push({ type: 'noticed' });
  }
  if (state === 'retreat') c.retreated = true;
  if (state === 'surrender') actions.push({ type: 'surrender' });
  if (CALM.includes(state)) {
    c.waypoint = null;
    c.dwell = 0;
    c.noticed = false;
    c.retreated = false;
  }
}

/** Yaw: (x, z)'den (tx, tz)'ye bakış (ileri = (−sin, −cos)). */
export function yawTo(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

const STOP: BanditIntent = { heading: 0, speed: 0 };

function goTo(c: BanditBrain, target: Point, speed: number, arrive = 0.6): BanditIntent {
  const d = Math.hypot(target.x - c.x, target.z - c.z);
  if (d <= arrive) return { heading: c.yaw, speed: 0 };
  return { heading: yawTo(c.x, c.z, target.x, target.z), speed: Math.min(speed, d * 4) };
}

function randomAround(rng: Random, center: Point, radius: number): Point {
  const a = rng.next() * Math.PI * 2;
  const r = radius * (0.4 + 0.6 * rng.next());
  return { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
}

/** Bir yere gidip orada bekleyip sonra yenisini seçen yürüyüş (devriye, odun, av). */
function roam(
  c: BanditBrain,
  center: Point,
  radius: number,
  dt: number,
  rng: Random,
  dwell: number,
): BanditIntent {
  if (!c.waypoint) c.waypoint = randomAround(rng, center, radius);
  const move = goTo(c, c.waypoint, BANDITS.walkSpeed, 1);
  if (move.speed > 0) return move;
  c.dwell += dt;
  if (c.dwell >= dwell) {
    c.waypoint = null;
    c.dwell = 0;
  }
  return STOP;
}

function behave(
  c: BanditBrain,
  s: BanditSenses,
  dt: number,
  rng: Random,
  actions: BanditAction[],
): BanditIntent {
  const player = s.player;
  const toPlayer = player ? yawTo(c.x, c.z, player.x, player.z) : c.yaw;
  switch (c.state) {
    case 'dead':
    case 'surrender':
      return { ...STOP, face: c.state === 'surrender' ? toPlayer : c.yaw };
    case 'sit':
    case 'sleep':
    case 'ambush': {
      const move = goTo(c, s.home, BANDITS.walkSpeed, 0.4);
      return move.speed > 0 ? move : { ...STOP, face: s.home.yaw };
    }
    case 'guard': {
      const move = goTo(c, s.home, BANDITS.walkSpeed, 0.4);
      if (move.speed > 0) return move;
      // Nöbet: yol tarafına bakıp yavaşça sağa sola göz gezdirir.
      return { ...STOP, face: s.home.yaw + Math.sin(c.stateTime * 0.4) * 1.0 };
    }
    case 'patrol':
      return roam(c, s.camp, BANDITS.patrolRadius, dt, rng, 2);
    case 'travel': {
      const move = goTo(c, s.home, s.travelSpeed ?? BANDITS.walkSpeed, TRAVEL_ARRIVE);
      return move.speed > 0 ? move : { ...STOP, face: s.home.yaw };
    }
    case 'wood':
      return roam(c, s.camp, BANDITS.woodRadius, dt, rng, DWELL_SECONDS);
    case 'hunt': {
      const prey = s.prey;
      if (prey && !isMeleeWeapon(c.weapon) && prey.dist <= BANDITS.huntRange) {
        const face = yawTo(c.x, c.z, prey.x, prey.z);
        if (c.cooldown <= 0) {
          c.cooldown = BANDITS.ranged[c.weapon].interval;
          actions.push({ type: 'shoot', target: 'prey', x: prey.x, z: prey.z, preyId: prey.id });
        }
        return { ...STOP, face };
      }
      return roam(c, s.camp, BANDITS.huntRadius, dt, rng, DWELL_SECONDS);
    }
    case 'alert': {
      const target = c.investigate ?? c.lastSeen;
      if (!target) return { ...STOP, face: c.yaw + Math.sin(c.stateTime) * 1.2 };
      const move = goTo(c, target, BANDITS.walkSpeed, 2);
      return move.speed > 0 ? move : { ...STOP, face: c.yaw + Math.sin(c.stateTime) * 1.2 };
    }
    case 'chase': {
      const target = player?.visible ? player : c.lastSeen;
      if (!target) return STOP;
      return goTo(c, target, BANDITS.runSpeed, 0.8);
    }
    case 'attack': {
      if (
        isMeleeWeapon(c.weapon) &&
        !c.struck &&
        c.stateTime >= BANDITS.melee[c.weapon].windup * 0.8
      ) {
        c.struck = true;
        c.cooldown = BANDITS.melee[c.weapon].cooldown;
        const reach = BANDITS.melee[c.weapon].reach + STRIKE_GRACE;
        if (player && player.dist <= reach) {
          actions.push({ type: 'strike', damage: BANDITS.melee[c.weapon].damage });
        }
      }
      return { ...STOP, face: toPlayer };
    }
    case 'shoot': {
      if (isMeleeWeapon(c.weapon)) return STOP;
      const spec = BANDITS.ranged[c.weapon];
      const range = Math.min(RANGED.weapons[c.weapon].range, BANDITS.sightRange * 1.5);
      if (!player?.visible) {
        return c.lastSeen ? goTo(c, c.lastSeen, BANDITS.runSpeed, 2) : STOP;
      }
      if (c.cooldown <= 0 && player.dist <= range) {
        c.cooldown = spec.interval;
        actions.push({ type: 'shoot', target: 'player', x: player.x, z: player.z });
      }
      if (player.dist > spec.preferred * 1.3) {
        return { heading: toPlayer, speed: BANDITS.runSpeed * 0.7, face: toPlayer };
      }
      if (player.dist < spec.preferred * 0.5) {
        return { heading: toPlayer + Math.PI, speed: BANDITS.walkSpeed, face: toPlayer };
      }
      return { ...STOP, face: toPlayer };
    }
    case 'cover': {
      // Siper: oyuncuya dik yönde koşarak yer değiştirir (yan taraf kimliğe göre değil, zamana göre seçilir).
      const side = Math.floor(c.stateTime / COVER_SECONDS + c.x) % 2 === 0 ? 1 : -1;
      return { heading: toPlayer + (side * Math.PI) / 2, speed: BANDITS.runSpeed, face: toPlayer };
    }
    case 'retreat':
      return {
        heading: player ? toPlayer + Math.PI : yawTo(c.x, c.z, s.camp.x, s.camp.z),
        speed: BANDITS.runSpeed,
      };
    case 'flee':
      return { heading: player ? toPlayer + Math.PI : c.yaw, speed: BANDITS.runSpeed };
  }
}
