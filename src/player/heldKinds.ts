import type { ItemId } from '../items/itemDefs';

/**
 * Elde tutulan eşyanın türü ve saldırı biçimi (saf; görsel katman `HeldItem`/`CombatEffects` okur). Silah efektleri
 * bu tabloyla ayırt edilir: ateşli silah = ağız alevi + duman + tepme; yakın dövüş = savurma/saplama izi + darbe kıvılcımı.
 */

export type HeldKind =
  | 'gun' // ateşli silah (tabanca, tüfek, pompalı)
  | 'bow' // yay
  | 'sling' // sapan
  | 'blade' // kesici (bıçak, kama, pala)
  | 'axe' // balta
  | 'blunt' // sopa
  | 'spear' // mızrak
  | 'light' // meşale, madenci lambası
  | 'tool' // çapa, tırpan
  | 'carry' // kap, tencere, giysi, battaniye (elde taşınır)
  | 'drone';

const KINDS: Partial<Record<ItemId, HeldKind>> = {
  pistol: 'gun',
  shotgun: 'gun',
  rifle: 'gun',
  sniper_rifle: 'gun',
  bow: 'bow',
  slingshot: 'sling',
  bone_knife: 'blade',
  iron_dagger: 'blade',
  pala: 'blade',
  stone_axe: 'axe',
  club: 'blunt',
  stone_spear: 'spear',
  torch: 'light',
  miner_lamp: 'light',
  hoe: 'tool',
  sickle: 'tool',
  water_container_empty: 'carry',
  water_container_full: 'carry',
  copper_pot: 'carry',
  wool_blanket: 'carry',
  hide_vest: 'carry',
  steel_vest: 'carry',
  fur_cloak: 'carry',
  drone: 'drone',
};

/** Eşyanın elde görünen türü (elde görünümü olmayan eşyada null). */
export function heldKind(id: ItemId | null): HeldKind | null {
  return id === null ? null : (KINDS[id] ?? null);
}

/** Saldırı biçimi: görsel savurma ve iz. */
export type SwingStyle = 'slash' | 'chop' | 'smash' | 'thrust' | 'punch';

const STYLES: Partial<Record<ItemId | 'fist', SwingStyle>> = {
  fist: 'punch',
  bone_knife: 'slash',
  iron_dagger: 'slash',
  pala: 'slash',
  stone_axe: 'chop',
  club: 'smash',
  stone_spear: 'thrust',
};

/** Yakın dövüş silahının savurma biçimi (silah dışı eşyalarda yumruk). */
export function swingStyle(weapon: ItemId | 'fist' | null): SwingStyle {
  return (weapon !== null ? STYLES[weapon] : undefined) ?? 'punch';
}

/** Elde taşınan eşya ateş eder mi (ağız alevi, duman, tepme)? */
export function isFirearm(id: ItemId | null): boolean {
  return heldKind(id) === 'gun';
}
