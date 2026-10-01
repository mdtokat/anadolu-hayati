import type { GatherSystem } from '../interaction/gather';
import type { CreatureView } from '../creatures/kinds';
import type { FireTender } from '../placement/tend';
import type { PropRef } from '../world/propKinds';
import type { CarcassButcher } from './carcass';
import type { CookingSystem } from './cooking';

export interface InteractionSystems {
  gather: GatherSystem;
  butcher: CarcassButcher;
  cooking: CookingSystem;
  fireTender: FireTender;
}

export interface InteractionInput {
  /** `E` basılı mı? */
  held: boolean;
  feet: { x: number; z: number };
  /** Bakılan toplanabilir nesne ve leş (yoksa null). */
  prop: PropRef | null;
  carcass: CreatureView | null;
  alive: boolean;
}

/** `E`'yi alabilecek eylemler (öncelik sırasıyla). */
export type InteractionTaker = 'gather' | 'butcher' | 'cook' | 'tend';

/**
 * Bu adımda `E`'yi kimin aldığı: `taker`, `E` basılıyken öncelik sırasındaki ilk uygun eylem (yoksa null).
 * `drinkAllowed`: `E` basılı ve kimse almadıysa su içilebilir.
 */
export interface InteractionResult {
  taker: InteractionTaker | null;
  drinkAllowed: boolean;
}

/**
 * `E` tuşunun öncelik sırası (docs/faz-5-paralel-plan.md §5, 5.9): toplama > leş kesme > pişirme > ateşe yakıt >
 * su içme. Her sistem yalnızca kendinden öncekilerin `E`'yi almadığı durumda ilerler; çiğ et varken pişirme
 * yakıttan önceliklidir (et bitince sıradaki `E` yakıt atar). Sırayı tek yerde tutar (Game ve testler kullanır).
 */
export function updateInteractions(
  dt: number,
  systems: InteractionSystems,
  input: InteractionInput,
): InteractionResult {
  const { held, feet, alive } = input;
  systems.gather.update(dt, held, input.prop);
  const gathering = systems.gather.offer?.status === 'ready';

  systems.butcher.update(dt, held && !gathering, input.carcass, alive);
  const butchering = systems.butcher.offer?.status === 'ready';

  const free = held && !gathering && !butchering;
  systems.cooking.update(dt, free, feet, alive);
  const cooking = systems.cooking.offer?.status === 'ready';

  systems.fireTender.update(dt, free && !cooking, feet, alive);
  const tending = systems.fireTender.offer?.status === 'ready';

  const taker: InteractionTaker | null = !held
    ? null
    : gathering
      ? 'gather'
      : butchering
        ? 'butcher'
        : cooking
          ? 'cook'
          : tending
            ? 'tend'
            : null;
  return { taker, drinkAllowed: held && taker === null };
}
