import { BATTLE_ROYALE } from '../config';

/**
 * Maç durumu (saf): yarışmacılar, elenme sırası, öldürme sayıları ve öldürme listesi (kill feed), bitiş ve sonuç.
 * Yarışmacı 0 oyuncudur. Oyuncu ya da tek kişi kalınca maç biter; oyuncu öldükten sonra da kalan NPC'ler elenmeye devam
 * edebilir (sonuç ekranında kazananın adı için), oyuncunun sırası değişmez.
 */

export const PLAYER_ID = 0;

export type EliminationCause = 'kill' | 'zone' | 'animal' | 'other';

export interface Contestant {
  id: number;
  name: string;
  isPlayer: boolean;
  alive: boolean;
  kills: number;
  /** Elenince sırası (n. çıkan = kalan sayısı); kazananda 1. */
  placement: number | null;
  /** Elendiği an (maç saniyesi). */
  diedAt: number | null;
  killer: number | null;
}

export interface Elimination {
  victim: number;
  killer: number | null;
  cause: EliminationCause;
  /** Öldürenin silahı (eşya kimliği), bilinmiyorsa null. */
  weapon: string | null;
  time: number;
  /** Elenenin sırası. */
  placement: number;
}

export interface BrResult {
  /** Oyuncunun sırası (1 = kazandı). */
  placement: number;
  total: number;
  kills: number;
  /** Oyuncunun hayatta kaldığı süre (sn). */
  survived: number;
  /** Kazanan (henüz belli değilse null). */
  winner: { id: number; name: string } | null;
  /** En çok öldüren NPC (hiç öldürme yoksa null). */
  topNpc: { id: number; name: string; kills: number } | null;
}

export class BrMatch {
  readonly contestants: Contestant[];
  private readonly feed: Elimination[] = [];
  private readonly log: Elimination[] = [];
  private alive: number;

  /** `names[0]` oyuncunun adıdır. */
  constructor(names: readonly string[]) {
    if (names.length < 2) throw new Error('Battle Royale en az iki yarışmacı ister');
    this.contestants = names.map((name, id) => ({
      id,
      name,
      isPlayer: id === PLAYER_ID,
      alive: true,
      kills: 0,
      placement: null,
      diedAt: null,
      killer: null,
    }));
    this.alive = names.length;
  }

  get total(): number {
    return this.contestants.length;
  }

  get aliveCount(): number {
    return this.alive;
  }

  get player(): Contestant {
    return this.contestants[PLAYER_ID]!;
  }

  /** Oyuncu için maç bitti mi (öldü ya da tek kalan)? */
  get finished(): boolean {
    return !this.player.alive || this.alive <= 1;
  }

  /** Tek kalan (kazanan); yoksa null. */
  get winner(): Contestant | null {
    return this.alive === 1 ? (this.contestants.find((c) => c.alive) ?? null) : null;
  }

  isAlive(id: number): boolean {
    return this.contestants[id]?.alive === true;
  }

  /**
   * Yarışmacıyı eler. Zaten elenmişse ya da tek kalan ise null (kazanan elenmez). Öldüren canlıysa ve kendisi değilse
   * öldürme sayısı artar.
   */
  eliminate(
    victim: number,
    killer: number | null,
    cause: EliminationCause,
    weapon: string | null,
    time: number,
  ): Elimination | null {
    const v = this.contestants[victim];
    if (!v || !v.alive || this.alive <= 1) return null;
    const k = killer !== null && killer !== victim ? this.contestants[killer] : undefined;
    const placement = this.alive;
    v.alive = false;
    v.placement = placement;
    v.diedAt = time;
    v.killer = k ? k.id : null;
    if (k) k.kills++;
    this.alive--;
    const winner = this.winner;
    if (winner) winner.placement = 1;
    const entry: Elimination = {
      victim,
      killer: k ? k.id : null,
      cause: k ? cause : cause === 'kill' ? 'other' : cause,
      weapon: k ? weapon : null,
      time,
      placement,
    };
    this.log.push(entry);
    this.feed.push(entry);
    if (this.feed.length > BATTLE_ROYALE.killFeedSize) this.feed.shift();
    return entry;
  }

  /** Son elenmeler (en yenisi sonda). */
  get killFeed(): readonly Elimination[] {
    return this.feed;
  }

  /** Bütün elenmeler (sırasıyla). */
  get eliminations(): readonly Elimination[] {
    return this.log;
  }

  /** Oyuncunun sonucu (`now`: maç saniyesi; oyuncu hâlâ hayattaysa hayatta kalma süresi ona göre). */
  result(now: number): BrResult {
    const p = this.player;
    const winner = this.winner;
    let topNpc: BrResult['topNpc'] = null;
    for (const c of this.contestants) {
      if (c.isPlayer || c.kills === 0) continue;
      if (!topNpc || c.kills > topNpc.kills) topNpc = { id: c.id, name: c.name, kills: c.kills };
    }
    return {
      placement: p.placement ?? (p.alive ? this.alive : this.total),
      total: this.total,
      kills: p.kills,
      survived: p.diedAt ?? now,
      winner: winner ? { id: winner.id, name: winner.name } : null,
      topNpc,
    };
  }
}
