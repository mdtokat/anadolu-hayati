import { CombatSystem } from '../../src/combat/CombatSystem';
import { RangedSystem } from '../../src/combat/RangedSystem';
import { ammoOf } from '../../src/combat/ammo';
import { creatureTargetProvider } from '../../src/combat/targets';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/events';
import { CreatureSystem } from '../../src/creatures/CreatureSystem';
import type { CreatureContext, CreatureKind } from '../../src/creatures/kinds';
import { yawOf } from '../../src/creatures/perception';
import { Inventory } from '../../src/items/Inventory';
import type { ItemId } from '../../src/items/itemDefs';
import { WeaponState, type WeaponId } from '../../src/items/weaponState';
import { SurvivalSystem } from '../../src/survival/SurvivalSystem';
import { createRandom } from '../../src/utils/random';
import { DT } from './encounter';
import { fakeTerrain } from './fakeTerrain';

/** Göz yüksekliği (oyun m; oyuncu ayağı y = 0). */
const EYE = 1.65;

export interface RangedEncounterOptions {
  kind: CreatureKind;
  /** Başlangıç uzaklığı (oyun m; canlı oyuncunun kuzeyinde, oyuncuya bakar). */
  distance: number;
  weapon: WeaponId;
  /** Yedek mühimmat (şarjör dolu başlar). */
  reserve?: number;
  /** Başlangıçta canlıyı kışkırt (1 hasar): yırtıcı saldırır, av kaçar. */
  provoke?: boolean;
  /** Nişan alır mı (sağ tık; varsayılan evet). */
  aimed?: boolean;
  seconds?: number;
  seed?: number;
  night?: boolean;
}

export interface RangedEncounterResult {
  playerDied: boolean;
  kills: number;
  damageTaken: number;
  /** İlk ölüme kadar geçen süre (sn) ya da null. */
  timeToKill: number | null;
  shots: number;
  hits: number;
}

/**
 * Menzilli silahla bot karşılaşması (Faz 11.5): gerçek `CreatureSystem`, `CombatSystem` (hayvan saldırısı),
 * `SurvivalSystem` ve `RangedSystem` ile. Oyuncu yerinde durur, en yakın canlının gövde ortasına nişan alır ve
 * hazır oldukça ateş eder (boşalınca doldurur); düz arazi, atış gürültüsü canlılara iletilir (Game'deki gibi).
 */
export function runRangedEncounter(o: RangedEncounterOptions): RangedEncounterResult {
  const events = new EventBus<GameEvents>();
  const survival = new SurvivalSystem(events);
  const inventory = new Inventory();
  inventory.add(o.weapon, 1);
  const weapons = new WeaponState();
  weapons.set(o.weapon, weapons.capacity(o.weapon));
  const creatures = new CreatureSystem(events);
  new CombatSystem(events, inventory, creatures, survival);
  const ranged = new RangedSystem(
    events,
    inventory,
    weapons,
    survival,
    createRandom(o.seed ?? 1).next,
  );
  const ammo = ammoOf(o.weapon);
  if (o.reserve) inventory.add(ammo, o.reserve);
  const targets = creatureTargetProvider(creatures);
  events.on('noise:made', ({ x, z, radius }) => creatures.hearNoise(x, z, radius));

  let kills = 0;
  let damageTaken = 0;
  let timeToKill: number | null = null;
  let shots = 0;
  let hits = 0;
  let t = 0;
  events.on('creature:died', () => {
    kills++;
    timeToKill ??= t;
  });
  events.on('creature:damaged', () => hits++);
  events.on('player:damaged', ({ amount }) => (damageTaken += amount));

  const terrain = fakeTerrain({ half: 3000, cover: 'urban' });
  const ctx: CreatureContext = {
    player: { x: 0, y: 0, z: 0, activity: 'rest', alive: true, yaw: 0, weakness: 0 },
    hour: o.night ? 23 : 12,
    sunAltitudeDeg: o.night ? -30 : 50,
    isNight: o.night ?? false,
    fires: [],
    terrain,
  };
  creatures.update(DT, ctx);
  const id = creatures.spawnAt(o.kind, 0, -o.distance, Math.PI);
  if (o.provoke && id !== null) creatures.damage(id, 1, { x: 0, z: 0 });

  const held: ItemId = o.weapon;
  const aimed = o.aimed ?? true;
  const limit = o.seconds ?? 40;
  while (t < limit && survival.alive) {
    t += DT;
    const target = creatures.views().find((v) => !v.dead);
    ranged.update(DT, { held, aiming: aimed, steady: aimed, moving: false, running: false });
    if (target) {
      const dx = target.x;
      const dz = target.z;
      const flat = Math.hypot(dx, dz);
      const yaw = yawOf(dx, dz);
      const pitch = Math.atan2(target.y + target.height / 2 - EYE, flat);
      ctx.player = { ...ctx.player, yaw };
      if (ranged.aimFraction >= 1 || !aimed) {
        const r = ranged.fire(
          { x: 0, y: EYE, z: 0, yaw, pitch },
          { heightAt: terrain.heightAt, targets },
        );
        if (r.status === 'fired') shots++;
      }
    }
    creatures.update(DT, ctx);
  }
  return { playerDied: !survival.alive, kills, damageTaken, timeToKill, shots, hits };
}
