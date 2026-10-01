import { CombatSystem } from '../../src/combat/CombatSystem';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/events';
import { CreatureSystem } from '../../src/creatures/CreatureSystem';
import type { CreatureContext, CreatureKind, CreatureTerrain } from '../../src/creatures/kinds';
import { yawOf } from '../../src/creatures/perception';
import { Inventory } from '../../src/items/Inventory';
import type { ItemId } from '../../src/items/itemDefs';
import { SurvivalSystem } from '../../src/survival/SurvivalSystem';
import { fakeTerrain } from './fakeTerrain';

export const DT = 1 / 60;

export type Policy =
  /** Yerinde durur, önüne gelene vurur. */
  | 'stand'
  /** Canlıya doğru koşar ve menzile girince vurur. */
  | 'charge'
  /** Canlıdan ters yöne koşar. */
  | 'flee'
  /** Canlıya yürüyerek yaklaşır ve vurur (sinsi av). */
  | 'stalk'
  /** Yürüyerek yaklaşır; canlı uyarıya (alert) geçince koşarak atılır. */
  | 'ambush';

export interface EncounterOptions {
  kind: CreatureKind;
  /** Başlangıç uzaklığı (oyun m, canlı oyuncunun kuzeyinde). */
  distance: number;
  policy: Policy;
  weapon?: ItemId | null;
  vest?: boolean;
  /** Yanan ateşler (oyuncu ateşin başındaysa oyuncu konumuna koy). */
  fireAtPlayer?: boolean;
  /** Canlı sayısı (sürü: yan yana). */
  count?: number;
  night?: boolean;
  seconds?: number;
  /** Başlangıçta canlıya bir kez vur (kışkırt). */
  provoke?: boolean;
  seed?: number;
  /** Canlı oyuncuya mı, ters yöne mi bakarak başlar (varsayılan: oyuncuya). */
  facing?: 'toward' | 'away';
  terrain?: CreatureTerrain;
}

export interface EncounterResult {
  playerDied: boolean;
  /** Oyuncunun kalan canı. */
  health: number;
  /** Öldürülen canlı sayısı. */
  kills: number;
  /** Oyuncunun aldığı toplam hasar (savunma sonrası). */
  damageTaken: number;
  /** İlk ölümün süresi (sn) ya da null. */
  timeToKill: number | null;
  swings: number;
}

/** Gerçek `CreatureSystem`/`CombatSystem`/`SurvivalSystem` ile tek bir karşılaşma (başsız, düz orman arazisi). */
export function runEncounter(o: EncounterOptions): EncounterResult {
  const events = new EventBus<GameEvents>();
  const survival = new SurvivalSystem(events);
  const inventory = new Inventory();
  if (o.weapon) inventory.add(o.weapon, 1);
  if (o.vest) inventory.add('hide_vest', 1);
  const creatures = new CreatureSystem(events);
  const combat = new CombatSystem(events, inventory, creatures, survival);

  let kills = 0;
  let damageTaken = 0;
  let timeToKill: number | null = null;
  let swings = 0;
  let t = 0;
  events.on('creature:died', () => {
    kills++;
    timeToKill ??= t;
  });
  events.on('player:damaged', ({ amount }) => (damageTaken += amount));

  // Doğal doğmayı kapatmak için arazi örtüsü 'urban' (hiçbir türün yaşam alanı değil); spawnAt yine çalışır.
  const terrain = o.terrain ?? fakeTerrain({ half: 3000, cover: 'urban' });
  const player = { x: 0, y: 0, z: 0 };
  const ctx: CreatureContext = {
    player: { ...player, activity: 'rest', alive: true, yaw: 0, weakness: 0 },
    hour: o.night ? 23 : 12,
    sunAltitudeDeg: o.night ? -30 : 50,
    isNight: o.night ?? false,
    fires: o.fireAtPlayer ? [{ x: 0, z: 0 }] : [],
    terrain,
  };
  creatures.update(DT, ctx);

  const count = o.count ?? 1;
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const id = creatures.spawnAt(
      o.kind,
      (i - (count - 1) / 2) * 2,
      -o.distance,
      o.facing === 'away' ? 0 : Math.PI,
    );
    if (id !== null) ids.push(id);
  }
  if (o.provoke && ids[0] !== undefined) creatures.damage(ids[0], 1, { x: 0, z: 0 });

  const limit = o.seconds ?? 60;
  while (t < limit && survival.alive) {
    t += DT;
    const nearest = creatures
      .views()
      .filter((v) => !v.dead)
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];

    let activity: CreatureContext['player']['activity'] = 'rest';
    let yaw = ctx.player.yaw ?? 0;
    if (nearest) {
      const dx = nearest.x - player.x;
      const dz = nearest.z - player.z;
      const dist = Math.hypot(dx, dz);
      const toward = yawOf(dx, dz);
      if (o.policy === 'flee') {
        yaw = toward;
        activity = 'run';
        player.x -= (dx / dist) * 7 * DT;
        player.z -= (dz / dist) * 7 * DT;
      } else {
        yaw = toward;
        if (o.policy === 'charge' && dist > 1.5) {
          activity = 'run';
          player.x += (dx / dist) * 7 * DT;
          player.z += (dz / dist) * 7 * DT;
        } else if (o.policy === 'ambush' && dist > 1.5) {
          const alarmed = nearest.state === 'alert' || nearest.state === 'flee';
          activity = alarmed ? 'run' : 'walk';
          const speed = alarmed ? 7 : 4;
          player.x += (dx / dist) * speed * DT;
          player.z += (dz / dist) * speed * DT;
        } else if (o.policy === 'stalk' && dist > 1.5) {
          activity = 'walk';
          player.x += (dx / dist) * 4 * DT;
          player.z += (dz / dist) * 4 * DT;
        }
      }
      if (o.policy !== 'flee') {
        const r = combat.attack({ x: player.x, y: 0, z: player.z, eyeY: 1.65, yaw, pitch: 0 });
        if (r.status === 'hit' || r.status === 'miss') swings++;
      }
    }
    ctx.player = { ...ctx.player, x: player.x, z: player.z, activity, yaw };
    if (o.fireAtPlayer) ctx.fires = [{ x: player.x, z: player.z }];
    creatures.update(DT, ctx);
    combat.update(DT);
  }
  return {
    playerDied: !survival.alive,
    health: survival.state.health,
    kills,
    damageTaken,
    timeToKill,
    swings,
  };
}

/** `n` tohumla tekrarlar; oranlar/ortalamalar. */
export function monteCarlo(o: EncounterOptions, n: number) {
  let died = 0;
  let killed = 0;
  let dmg = 0;
  let ttk = 0;
  let ttkN = 0;
  for (let i = 0; i < n; i++) {
    const r = runEncounter({ ...o, seed: i });
    if (r.playerDied) died++;
    if (r.kills > 0) killed++;
    dmg += r.damageTaken;
    if (r.timeToKill !== null) {
      ttk += r.timeToKill;
      ttkN++;
    }
  }
  return {
    deathRate: died / n,
    killRate: killed / n,
    meanDamage: dmg / n,
    meanTimeToKill: ttkN ? ttk / ttkN : null,
  };
}
