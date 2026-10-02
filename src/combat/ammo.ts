import { RANGED } from '../config';
import type { Inventory } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import { isWeaponId, type WeaponId, type WeaponState } from '../items/weaponState';

/**
 * Mühimmat ve doldurma (Faz 11.5, saf). Şarjör `WeaponState`'tedir (silah türü başına); yedek mühimmat envanterdeki
 * eşyadır (`RANGED.weapons[w].ammo`: saçma fişeği, tabanca/tüfek mermisi, ok, sapan için taş). Doldurma atomiktir:
 * envanterden düşen kadar mermi şarjöre girer.
 */

/** Eşya menzilli (şarjörlü) bir silah mı? */
export function isRangedWeapon(id: ItemId | null): id is ItemId & WeaponId {
  return isWeaponId(id);
}

/** Silahın mühimmat eşyası. */
export function ammoOf(weapon: WeaponId): ItemId {
  return RANGED.weapons[weapon].ammo;
}

/** Envanterdeki yedek mühimmat. */
export function reserveAmmo(inventory: Pick<Inventory, 'count'>, weapon: WeaponId): number {
  return inventory.count(ammoOf(weapon));
}

export type ReloadCheck = 'ok' | 'full' | 'no_ammo';

/** Doldurulabilir mi: şarjör dolu değil ve envanterde mühimmat var. */
export function reloadCheck(
  state: Pick<WeaponState, 'loaded' | 'capacity'>,
  inventory: Pick<Inventory, 'count'>,
  weapon: WeaponId,
): ReloadCheck {
  if (state.loaded(weapon) >= state.capacity(weapon)) return 'full';
  if (reserveAmmo(inventory, weapon) <= 0) return 'no_ammo';
  return 'ok';
}

/**
 * Şarjörü envanterden doldurur (atomik): eksik kadar (yedek yetiyorsa) mermi envanterden düşer ve şarjöre girer.
 * Şarjöre giren mermi sayısını döner (0: dolu ya da mühimmat yok).
 */
export function loadRounds(
  state: Pick<WeaponState, 'loaded' | 'capacity' | 'set'>,
  inventory: Pick<Inventory, 'count' | 'remove'>,
  weapon: WeaponId,
): number {
  const missing = state.capacity(weapon) - state.loaded(weapon);
  const rounds = Math.min(missing, reserveAmmo(inventory, weapon));
  if (rounds <= 0) return 0;
  if (!inventory.remove(ammoOf(weapon), rounds)) return 0;
  state.set(weapon, state.loaded(weapon) + rounds);
  return rounds;
}
