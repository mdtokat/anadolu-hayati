import { DRYING } from '../config';
import type { Inventory } from '../items/Inventory';
import type { Structure, StructureSet } from './structures';

/**
 * Kurutma rafı (Faz 11, 11.2; saf mantık). `E` (basış anında; bakılan raf): hazır kurutulmuş et varsa alınır, yoksa
 * envanterdeki çiğ et rafa asılır (en çok `DRYING.capacity` parça); parti `DRYING.seconds` sonunda kurur
 * (`StructureSet.update`). Alma ve koyma atomiktir: sığmayan et rafta kalır, eksik et asılmaz.
 */

export type RackOfferStatus = 'collect' | 'load' | 'drying' | 'no_meat' | 'no_space';

export interface RackOffer {
  status: RackOfferStatus;
  /** `collect`/`load`: işlenecek parça sayısı. `drying`: kalan süre (gerçek sn) `remaining`'dedir. */
  pieces: number;
  remaining: number;
}

/** Çiğ et ile alınan kurutulmuş et: raf durumuna göre ne yapılabilir (HUD ipucu ve eylem tek yerde). */
export function rackOffer(
  rack: NonNullable<Structure['rack']>,
  inventory: Pick<Inventory, 'count' | 'capacityFor'>,
): RackOffer {
  const rawMeat = inventory.count('raw_meat');
  if (rack.dried > 0) {
    return inventory.capacityFor('dried_meat') >= rack.dried
      ? { status: 'collect', pieces: rack.dried, remaining: 0 }
      : { status: 'no_space', pieces: rack.dried, remaining: 0 };
  }
  if (rack.raw > 0) {
    return {
      status: 'drying',
      pieces: rack.raw,
      remaining: Math.max(0, DRYING.seconds - rack.progress),
    };
  }
  if (rawMeat <= 0) return { status: 'no_meat', pieces: 0, remaining: 0 };
  return { status: 'load', pieces: Math.min(rawMeat, DRYING.capacity), remaining: 0 };
}

/** Rafın görsel varyantı: `m` = üstünde et var (kuruyan ya da hazır), boş = boş raf. */
export function rackVariantKey(structure: Readonly<Pick<Structure, 'rack'>>): string {
  const rack = structure.rack;
  return rack && rack.raw + rack.dried > 0 ? 'm' : '';
}

/** Rafa çiğ et koyma/alma eylemi sonucu. */
export type RackAction = { ok: true; kind: 'load' | 'collect'; pieces: number } | { ok: false };

/**
 * Bakılan rafla `E` eylemi: hazır et varsa envantere alır, yoksa çiğ et asar. Envanter ve raf tutarlı kalır
 * (sığmıyorsa hiçbir şey değişmez).
 */
export function useRack(
  structures: StructureSet,
  id: number,
  inventory: Pick<Inventory, 'count' | 'capacityFor' | 'add' | 'remove'>,
): RackAction {
  const rack = structures.get(id)?.rack;
  if (!rack) return { ok: false };
  if (rack.dried > 0) {
    if (inventory.capacityFor('dried_meat') < rack.dried) return { ok: false };
    const taken = structures.collectRack(id);
    inventory.add('dried_meat', taken);
    return { ok: true, kind: 'collect', pieces: taken };
  }
  const have = inventory.count('raw_meat');
  const put = structures.loadRack(id, have);
  if (put === 0) return { ok: false };
  inventory.remove('raw_meat', put);
  return { ok: true, kind: 'load', pieces: put };
}
