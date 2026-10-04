import { BATTLE_ROYALE } from '../config';

/**
 * Battle Royale sözleşmesi (saf): maç kurulumu ve seçenekleri. Listeler yalnızca sona eklenir.
 */

export const BR_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type BrDifficulty = (typeof BR_DIFFICULTIES)[number];

/** Oyun alanı: tüm harita (hedef illerin hepsi) ya da sınır komşuluğuyla bağlı bir ya da birden çok il. */
export type BrAreaChoice = { kind: 'world' } | { kind: 'provinces'; names: string[] };

/** Maç kurulumu (kurulum panelinde seçilir; son seçim tarayıcıda hatırlanır). */
export interface BrSetup {
  area: BrAreaChoice;
  /** Oyuncu sayısı (oyuncu dahil). */
  players: number;
  /** Güvenli bölge kaç dakikada bir daralsın (aşama başına bekleme + daralma; tam sayı, `intervalMinutes` aralığı). */
  shrinkMinutes: number;
  difficulty: BrDifficulty;
  /** Vahşi hayvanlar maçta bulunsun mu? */
  animals: boolean;
  /** Saat sabit gündüz mü (yoksa gerçek akış)? */
  fixedDaylight: boolean;
}

/** Alan türüne göre varsayılan oyuncu sayısı. */
export function defaultPlayers(area: BrAreaChoice): number {
  return area.kind === 'world'
    ? BATTLE_ROYALE.players.defaultWorld
    : BATTLE_ROYALE.players.defaultProvinces;
}

export function defaultSetup(): BrSetup {
  const area: BrAreaChoice = { kind: 'world' };
  return {
    area,
    players: defaultPlayers(area),
    shrinkMinutes: BATTLE_ROYALE.zone.intervalMinutes.default,
    difficulty: 'normal',
    animals: true,
    fixedDaylight: true,
  };
}

export function clampPlayers(n: number): number {
  const { min, max } = BATTLE_ROYALE.players;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
}

/** Daralma aralığını (dk) tam sayıya yuvarlayıp izin verilen aralığa çeker (bozuk değer varsayılana düşer). */
export function clampShrinkMinutes(n: number): number {
  const { min, max, default: fallback } = BATTLE_ROYALE.zone.intervalMinutes;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Hoşgörülü okuma (`localStorage`'daki eski/bozuk kurulum): bilinmeyen alan varsayılana düşer, sayı kırpılır. İl
 * seçimi `valid` (bilinen ve bağlı il kümesi mi?) denetiminden geçmezse tüm haritaya döner.
 */
export function normalizeSetup(raw: unknown, valid: (names: string[]) => boolean): BrSetup {
  const base = defaultSetup();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  let area: BrAreaChoice = base.area;
  const a = r.area as Record<string, unknown> | undefined;
  if (a && a.kind === 'provinces' && Array.isArray(a.names)) {
    const names = [...new Set(a.names.filter((n): n is string => typeof n === 'string'))];
    if (names.length > 0 && valid(names)) area = { kind: 'provinces', names };
  }
  return {
    area,
    players: typeof r.players === 'number' ? clampPlayers(r.players) : defaultPlayers(area),
    shrinkMinutes:
      typeof r.shrinkMinutes === 'number'
        ? clampShrinkMinutes(r.shrinkMinutes)
        : base.shrinkMinutes,
    difficulty: oneOf(BR_DIFFICULTIES, r.difficulty, base.difficulty),
    animals: typeof r.animals === 'boolean' ? r.animals : base.animals,
    fixedDaylight: typeof r.fixedDaylight === 'boolean' ? r.fixedDaylight : base.fixedDaylight,
  };
}
