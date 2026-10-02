/**
 * Eşkıya sözleşmesi (Faz 11, 11.6; saf): durumlar, etkinlikler, roller ve silahlar. Yalnızca sona eklenir.
 */

/** Sakin etkinlikler (kamp hayatı). */
export const BANDIT_ACTIVITIES = [
  'sit',
  'sleep',
  'guard',
  'patrol',
  'hunt',
  'wood',
  'ambush',
] as const;
export type BanditActivity = (typeof BANDIT_ACTIVITIES)[number];

/** Durumlar: sakin etkinlikler + uyarı, savaş, geri çekilme, teslim olma, kaçış ve ölüm. */
export const BANDIT_STATES = [
  ...BANDIT_ACTIVITIES,
  'alert',
  'chase',
  'attack',
  'shoot',
  'cover',
  'retreat',
  'surrender',
  'flee',
  'dead',
] as const;
export type BanditState = (typeof BANDIT_STATES)[number];

export type BanditRole = 'leader' | 'guard' | 'member';

/** Eşkıya silahları (eşya kimlikleriyle aynı; ölünce üstünden çıkar). */
export type BanditWeapon = 'pala' | 'club' | 'pistol' | 'shotgun' | 'rifle' | 'sniper_rifle';
export type BanditMeleeWeapon = 'pala' | 'club';
export type BanditRangedWeapon = 'pistol' | 'shotgun' | 'rifle' | 'sniper_rifle';

export function isMeleeWeapon(weapon: BanditWeapon): weapon is BanditMeleeWeapon {
  return weapon === 'pala' || weapon === 'club';
}

/** Çizim ve etkileşim için bir eşkıyanın anlık görünümü. */
export interface BanditView {
  id: number;
  /** Kamp kimliği (dev tuşuyla doğan serbest eşkıyada −1). */
  camp: number;
  name: string;
  role: BanditRole;
  weapon: BanditWeapon;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  state: BanditState;
  health: number;
  maxHealth: number;
  /** Yürüme salınımı için biriken adım. */
  stride: number;
  /** Vurulma parlaması (0–1). */
  hitFlash: number;
  /** Ölüyse üstü arandı mı? */
  searched: boolean;
}
