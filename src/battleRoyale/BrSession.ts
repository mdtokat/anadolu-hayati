import type { BanditWeapon } from '../bandits/kinds';
import type { HitSource } from '../combat/targets';
import { BATTLE_ROYALE } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { ItemStack } from '../items/Inventory';
import type { DeathCause } from '../survival/vitals';
import { createRandom, seedFrom } from '../utils/random';
import { FarSim, gearOfWeapon, weaponForGear, type LootSpot } from './farSim';
import type { BrSetup } from './kinds';
import { BrPickups, contestantLoot, planCrates } from './loot';
import { PLAYER_ID, type BrResult, type Elimination, type EliminationCause } from './match';
import { BrNearTier, contestantOfBandit, type NearHost } from './nearTier';
import { planMatch, type MatchPlan, type MatchWorld } from './plan';
import type { BrSpawn } from './spawn';
import { zoneAt, zoneDamageAt, type ZoneState } from './zone';

/**
 * Battle Royale maç oturumu (BR.5; Three.js'siz). Maç planını kurar, uzak ve yakın kademeyi, yerdeki ganimeti, bölge
 * hasarını, elenmeleri ve bitişi yönetir; `Game` yalnızca oyuncuyu, girdiyi ve çizimi bağlar. Olaylar: `br:started`,
 * `br:phase`, `br:eliminated`, `br:ended`.
 */

/** Oturumun dünyadan istedikleri (Game `RegionWorld` ve yerleşim haritasıyla karşılar; testte sahte). */
export interface BrSessionWorld extends MatchWorld {
  /** Uzak NPC yürüyebilir mi (genel bakış arazisi; karolar yüklenmeden çalışır)? */
  walkable(x: number, z: number): boolean;
  /** Tam simülasyon hazır mı (karo yüklü)? */
  ready(x: number, z: number): boolean;
  readonly lootSpots: readonly LootSpot[];
}

/** Yarışmacı sistemi (`BanditSystem`). */
export interface BrBandits extends NearHost {
  setWildEnabled(on: boolean): void;
  setContestantLoot(fn: ((contestant: number, weapon: BanditWeapon) => ItemStack[]) | null): void;
}

/** Oyuncuya son isabet: öldüreni bulmak için (`killCreditSeconds` içinde ölürse ona yazılır). */
interface PlayerHit {
  attacker: number | null;
  weapon: string | null;
  at: number;
}

/** Oyuncu son isabetten bu kadar sn içinde ölürse ölüm isabet edene yazılır. */
const KILL_CREDIT_SECONDS = 15;
/** Oyuncu öldükten sonra hızlı sonuçlandırma dilimi (maç saniyesi) ve kare başına süre bütçesi (ms). */
const FINISH_SLICE_SECONDS = 10;
const FINISH_BUDGET_MS = 10;

export class BrSession {
  readonly plan: MatchPlan;
  readonly far: FarSim;
  readonly tier: BrNearTier;
  readonly pickups: BrPickups;
  readonly timings: { plan: number; flow: number; crates: number };
  private time = 0;
  private lastPhase = -1;
  private lastShrinking = false;
  private dropsSeen = 0;
  private playerHit: PlayerHit | null = null;
  private ended = false;
  private disposed = false;

  constructor(
    readonly setup: BrSetup,
    readonly seed: number,
    world: BrSessionWorld,
    private readonly bandits: BrBandits,
    private readonly events: EventBus<GameEvents>,
    playerName = 'Sen',
  ) {
    const t0 = performance.now();
    this.plan = planMatch(setup, seed, world, playerName);
    const t1 = performance.now();
    const zone = { plan: this.plan.zone, area: this.plan.area };
    this.far = new FarSim(
      this.plan.match,
      zone,
      { walkable: (x, z) => world.walkable(x, z), lootSpots: world.lootSpots },
      seedFrom(seed, 5),
      this.plan.spawns.slice(1).map((s, i) => ({ id: i + 1, x: s.x, z: s.z })),
    );
    const t2 = performance.now();
    this.far.prepare();
    const t3 = performance.now();
    this.tier = new BrNearTier(
      this.plan.match,
      this.far,
      bandits,
      { ready: (x, z) => world.ready(x, z) },
      zone,
      setup.difficulty,
    );
    const crates = planCrates(
      this.plan.area,
      world.lootSpots,
      createRandom(seedFrom(seed, 6)),
      (x, z) => world.spawnOpen(x, z),
    );
    this.pickups = new BrPickups(crates, seedFrom(seed, 7));
    /** Kurulum süreleri (ms; ölçüm ve performans göstergesi için). */
    this.timings = {
      plan: t1 - t0,
      flow: t3 - t2,
      crates: performance.now() - t3,
    };
    bandits.setWildEnabled(false);
    bandits.setContestantLoot((contestant, weapon) =>
      contestantLoot(
        contestant,
        weapon,
        Math.max(this.tier.gearOf(contestant), gearOfWeapon(weapon)),
        seedFrom(seed, 8),
      ),
    );
    events.emit('br:started', {
      players: setup.players,
      area: setup.area.kind === 'world' ? 'Tüm harita' : setup.area.names.join(', '),
    });
  }

  /** Oyuncunun başlangıç noktası (ayak yüksekliği Game'de zemine oturtulur). */
  get spawn(): BrSpawn {
    return this.plan.spawns[0]!;
  }

  /** Maç saati (sn). */
  get now(): number {
    return this.time;
  }

  get match() {
    return this.plan.match;
  }

  /** Şimdiki güvenli bölge durumu. */
  get zone(): ZoneState {
    return zoneAt(this.plan.zone, this.time);
  }

  /** Maç oyuncu için bitti mi (öldü ya da kazandı)? */
  get finished(): boolean {
    return this.plan.match.finished;
  }

  /** Ateşkes sürüyor mu (maç başı)? */
  get truce(): boolean {
    return this.time < BATTLE_ROYALE.far.graceSeconds;
  }

  /**
   * Bir sabit adım (oyuncu hayattayken): maç saati, uzak/yakın kademe, aşama bildirimi. Dönüş: oyuncuya bu adımda
   * uygulanacak bölge hasarı (can).
   */
  update(dt: number, player: { x: number; z: number }): number {
    if (this.disposed) return 0;
    if (this.finished) {
      this.checkVictory();
      return 0;
    }
    this.time += dt;
    for (const e of this.far.update(this.time)) this.announce(e);
    this.collectDrops();
    for (const e of this.tier.update(dt, this.time, player)) this.announce(e);
    const zone = this.zone;
    this.notifyPhase(zone);
    this.checkVictory();
    return zoneDamageAt(zone, this.plan.area.contains(player.x, player.z), player.x, player.z) * dt;
  }

  /** `bandit:damaged`: yakın yarışmacı öldüyse öldürenle maça yazılır. */
  onBanditDamaged(e: GameEvents['bandit:damaged']): void {
    if (!e.killed || this.disposed) return;
    const contestant = contestantOfBandit(e.id);
    if (contestant === null) return;
    const elimination = this.tier.onKilled(
      contestant,
      BrNearTier.killerOf(e),
      e.weapon ?? null,
      this.time,
    );
    if (elimination) this.announce(elimination);
    this.checkVictory();
  }

  /** Oyuncuya isabet (Game hedef sağlayıcısı): ölürse öldüren bulunur. */
  notePlayerHit(from: HitSource | undefined): void {
    if (!from) return;
    const attacker =
      from.by === 'bandit' && from.attacker !== undefined
        ? contestantOfBandit(from.attacker)
        : null;
    this.playerHit = { attacker, weapon: from.weapon ?? null, at: this.time };
  }

  /**
   * Oyuncu öldü: maça yazılır (vurulduysa ve son isabet yakınsa öldürene, bölgeyse bölgeye, hayvansa hayvana), yakın
   * yarışmacılar uzak kademeye döner ve maç hızlı sonuçlandırılmaya başlar (`finishStep`).
   */
  onPlayerDied(cause: DeathCause): Elimination | null {
    if (this.disposed) return null;
    const hit = this.playerHit;
    const recent = hit !== null && this.time - hit.at <= KILL_CREDIT_SECONDS;
    let killer: number | null = null;
    let mcause: EliminationCause = 'other';
    let weapon: string | null = null;
    if (cause === 'zone') mcause = 'zone';
    else if (cause === 'mauled') mcause = 'animal';
    else if (recent && hit.attacker !== null) {
      killer = hit.attacker;
      mcause = 'kill';
      weapon = hit.weapon;
    }
    const e = this.plan.match.eliminate(PLAYER_ID, killer, mcause, weapon, this.time);
    if (e) this.announce(e);
    this.tier.returnAll();
    if (this.plan.match.aliveCount <= 1) this.end();
    return e;
  }

  /**
   * Oyuncu öldükten sonra kare başına çağrılır: maçı kazanan belli olana dek `budgetMs` boyunca dilim dilim hızlı
   * ilerletir (en az bir dilim). Bittiyse true (`br:ended` bir kez yayınlanır).
   */
  finishStep(budgetMs: number = FINISH_BUDGET_MS): boolean {
    if (this.ended) return true;
    const match = this.plan.match;
    const limit = this.plan.zone.total + 600;
    const started = performance.now();
    // Kare bütçesi dolana dek dilim dilim (en az bir dilim).
    do {
      if (match.aliveCount <= 1 || this.far.now >= limit) break;
      for (const e of this.far.runToEnd(FINISH_SLICE_SECONDS)) this.announce(e);
      this.time = Math.max(this.time, this.far.now);
      this.collectDrops();
    } while (performance.now() - started < budgetMs);
    if (match.aliveCount <= 1 || this.far.now >= limit) {
      this.end();
      return true;
    }
    return false;
  }

  /** Oyuncunun sonucu (sonuç ekranı). */
  result(): BrResult {
    return this.plan.match.result(this.time);
  }

  /** Maç bitti/çıkıldı: yarışmacılar kalkar, eşkıyalar ve ganimet kaynağı eski hâline döner. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.tier.clear();
    this.bandits.setContestantTruce(false);
    this.bandits.setContestantLoot(null);
    this.bandits.setWildEnabled(true);
  }

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    const r = this.result();
    this.events.emit('br:ended', {
      placement: r.placement,
      total: r.total,
      kills: r.kills,
      winner: r.winner?.name ?? null,
    });
  }

  /** Oyuncu tek kalınca kazanır. */
  private checkVictory(): void {
    const winner = this.plan.match.winner;
    if (winner?.isPlayer) this.end();
  }

  /** Uzakta ölenlerin çantaları yere düşer. */
  private collectDrops(): void {
    const drops = this.far.drops;
    for (; this.dropsSeen < drops.length; this.dropsSeen++) {
      const d = drops[this.dropsSeen]!;
      this.pickups.addDrop(d, weaponForGear(d.gear));
    }
  }

  private notifyPhase(zone: ZoneState): void {
    const shrinking = zone.stage === 'shrink';
    if (zone.phase === this.lastPhase && shrinking === this.lastShrinking) return;
    this.lastPhase = zone.phase;
    this.lastShrinking = shrinking;
    if (zone.stage === 'closed') return;
    this.events.emit('br:phase', { phase: zone.phase, shrinking });
  }

  private announce(e: Elimination): void {
    const c = this.plan.match.contestants;
    this.events.emit('br:eliminated', {
      victim: c[e.victim]?.name ?? `#${e.victim}`,
      killer: e.killer === null ? null : (c[e.killer]?.name ?? `#${e.killer}`),
      cause: e.cause,
      weapon: e.weapon,
      left: this.plan.match.aliveCount,
      player: e.victim === PLAYER_ID,
      byPlayer: e.killer === PLAYER_ID,
    });
  }
}
