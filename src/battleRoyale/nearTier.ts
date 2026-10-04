import {
  CONTESTANT_ID_BASE,
  type ContestantSpawn,
  type ContestantState,
} from '../bandits/BanditSystem';
import type { BanditState, BanditWeapon } from '../bandits/kinds';
import { BATTLE_ROYALE } from '../config';
import { gearOfWeapon, weaponForGear, type FarAgent, type FarSim, type FarZone } from './farSim';
import type { BrDifficulty } from './kinds';
import { PLAYER_ID, type BrMatch, type Elimination } from './match';
import { zoneAt, zoneDamageAt } from './zone';

/**
 * Yakın kademe (BR.3; saf — `BanditSystem` ve dünya arayüzle verilir). Oyuncunun çevresindeki uzak NPC'leri tam yapay
 * zekâlı yarışmacıya çevirir (`BanditSystem.spawnContestant`; herkes herkese rakip, teslim olmaz), uzaklaşanları soyut
 * kayda geri verir (`FarSim.restore`). Sakin yarışmacının hedefini uzak simülasyonla aynı kurallar belirler
 * (`FarSim.guide`: ganimet yeri, güvenli bölge, akış alanı); ganimet yerinde bekleyen yarışmacının teçhizatı artar ve
 * silahı yükselir. Bölge hasarı yakın yarışmacıya da işler. Ölümler `onKilled` ile maça yazılır (Game `bandit:damaged`
 * olayını bağlar); ceset oyuncu uzaklaşana dek yerinde kalır.
 */

/** Yakın kademenin yarışmacı sisteminden istedikleri (`BanditSystem` karşılar). */
export interface NearHost {
  spawnContestant(spec: ContestantSpawn): number;
  contestantState(contestant: number): ContestantState | null;
  setContestantGoal(contestant: number, goal: { x: number; z: number; speed: number } | null): void;
  setContestantWeapon(contestant: number, weapon: BanditWeapon): void;
  setContestantTruce(on: boolean): void;
  removeContestant(contestant: number): ContestantState | null;
  drainContestant(contestant: number, amount: number): boolean | null;
}

export interface NearWorld {
  /** (x, z)'de tam simülasyon hazır mı (karo yüklü: arazi, yapılar, collider)? */
  ready(x: number, z: number): boolean;
}

/** Çatışan (ya da çatışmadan yeni çıkmış) yarışmacı uzak kademeye hemen dönmez. */
const ENGAGED: ReadonlySet<BanditState> = new Set([
  'alert',
  'chase',
  'attack',
  'shoot',
  'cover',
  'retreat',
]);

interface NearRecord {
  agent: FarAgent;
  /** İlerleme denetimi: pencerenin başındaki konum ve geçen süre. */
  anchor: { x: number; z: number };
  window: number;
  /** Ceset mi (maçtan elendi; oyuncu uzaklaşınca kalkar)? */
  dead: boolean;
}

/** Yarışmacının eşkıya kimliği ↔ maç kimliği. */
export function banditIdOf(contestant: number): number {
  return CONTESTANT_ID_BASE + contestant;
}

/** Eşkıya kimliği bir yarışmacınınsa maç kimliği, değilse null. */
export function contestantOfBandit(id: number): number | null {
  return id >= CONTESTANT_ID_BASE ? id - CONTESTANT_ID_BASE : null;
}

export class BrNearTier {
  private readonly records = new Map<number, NearRecord>();
  private sinceGuide = Infinity;
  /** Bölge hasarı uygulanan yarışmacı (onun `bandit:damaged` ölümü `onKilled`'da sayılmaz: neden bölgedir). */
  private draining: number | null = null;

  constructor(
    private readonly match: BrMatch,
    private readonly far: FarSim,
    private readonly host: NearHost,
    private readonly world: NearWorld,
    private readonly zone: FarZone,
    private readonly difficulty: BrDifficulty,
  ) {}

  /** Yakın kademedeki yarışmacılar (cesetler dahil). */
  get ids(): number[] {
    return [...this.records.keys()];
  }

  /** Yakın kademede canlı yarışmacı sayısı. */
  get aliveCount(): number {
    let n = 0;
    for (const r of this.records.values()) if (!r.dead) n++;
    return n;
  }

  isNear(contestant: number): boolean {
    return this.records.has(contestant);
  }

  /** Yakın yarışmacının teçhizat düzeyi (ganimet için; yakında değilse 0). */
  gearOf(contestant: number): number {
    return this.records.get(contestant)?.agent.gear ?? 0;
  }

  /**
   * Bir adım (sabit adım, `t`: maç saniyesi): durum eşitleme, bölge hasarı, hedefler, kademe geçişleri. Bu adımda olan
   * elenmeleri (bölge) döner; çatışma ölümleri `onKilled`'dan gelir.
   */
  update(dt: number, t: number, player: { x: number; z: number }): Elimination[] {
    const cfg = BATTLE_ROYALE.near;
    const out: Elimination[] = [];
    const zone = zoneAt(this.zone.plan, t);
    // Uzak kademeyle aynı ateşkes: maçın başında kimse çatışmaz.
    this.host.setContestantTruce(t < BATTLE_ROYALE.far.graceSeconds);
    this.sinceGuide += dt;
    const guideNow = this.sinceGuide >= cfg.guideInterval;
    if (guideNow) this.sinceGuide = 0;

    for (const [id, rec] of [...this.records]) {
      const st = this.host.contestantState(id);
      if (!st) {
        this.records.delete(id);
        continue;
      }
      const distance = Math.hypot(st.x - player.x, st.z - player.z);
      if (rec.dead || st.state === 'dead') {
        if (!rec.dead) {
          // Çatışma dışı ölüm (ör. hayvan): maça "diğer" olarak yazılır.
          rec.dead = true;
          const e = this.match.eliminate(id, null, 'other', null, t);
          if (e) out.push(e);
        }
        if (distance > cfg.corpseRadius) {
          this.host.removeContestant(id);
          this.records.delete(id);
        }
        continue;
      }
      rec.agent.x = st.x;
      rec.agent.z = st.z;
      rec.agent.health = st.health;
      // Bölge hasarı.
      const damage = zoneDamageAt(zone, this.zone.area.contains(st.x, st.z), st.x, st.z) * dt;
      this.draining = id;
      const drained = damage > 0 && this.host.drainContestant(id, damage) === true;
      this.draining = null;
      if (drained) {
        rec.dead = true;
        const e = this.match.eliminate(id, null, 'zone', null, t);
        if (e) out.push(e);
        continue;
      }
      // Uzak kademeye dönüş.
      const engaged = ENGAGED.has(st.state);
      if (distance > cfg.radius + cfg.margin * (engaged ? 3 : 1) && this.match.isAlive(id)) {
        this.demote(id, rec);
        continue;
      }
      if (guideNow) this.guide(id, rec, st, cfg.guideInterval, t);
    }

    this.promote(player);
    return out;
  }

  /**
   * Yakın yarışmacı öldürüldü (Game: `bandit:damaged` `killed`). `killer`: öldürenin maç kimliği (oyuncu `PLAYER_ID`),
   * bilinmiyorsa null.
   */
  onKilled(
    contestant: number,
    killer: number | null,
    weapon: string | null,
    t: number,
  ): Elimination | null {
    const rec = this.records.get(contestant);
    if (!rec || rec.dead || contestant === this.draining) return null;
    rec.dead = true;
    return this.match.eliminate(contestant, killer, killer === null ? 'other' : 'kill', weapon, t);
  }

  /** `bandit:damaged` olayını çözer: öldüren yarışmacı/oyuncu (yoksa null). */
  static killerOf(event: { by?: 'player' | 'bandit' | 'other'; attacker?: number }): number | null {
    if (event.by === 'player') return PLAYER_ID;
    if (event.by === 'bandit' && event.attacker !== undefined)
      return contestantOfBandit(event.attacker);
    return null;
  }

  /** Bütün canlı yakın yarışmacıları uzak kademeye geri verir (oyuncu ölünce hızlı sonuçlandırmadan önce). */
  returnAll(): void {
    for (const [id, rec] of [...this.records]) {
      if (rec.dead) continue;
      this.demote(id, rec);
    }
  }

  /** Bütün yarışmacıları (cesetler dahil) dünyadan kaldırır (maç bitti/çıkıldı). */
  clear(): void {
    for (const id of this.records.keys()) this.host.removeContestant(id);
    this.records.clear();
  }

  private demote(id: number, rec: NearRecord): void {
    const st = this.host.removeContestant(id);
    this.records.delete(id);
    if (!st || st.state === 'dead') return;
    this.far.restore({
      ...rec.agent,
      x: st.x,
      z: st.z,
      health: st.health,
      gear: Math.max(rec.agent.gear, gearOfWeapon(st.weapon)),
    });
  }

  private guide(id: number, rec: NearRecord, st: ContestantState, dt: number, t: number): void {
    const cfg = BATTLE_ROYALE.near;
    const agent = rec.agent;
    const goal = this.far.guide(agent, dt, t);
    this.host.setContestantGoal(id, goal);
    // Ganimet yerinde kalınca teçhizat artar: silah yükselir.
    const weapon = weaponForGear(agent.gear);
    if (gearOfWeapon(weapon) > gearOfWeapon(st.weapon)) this.host.setContestantWeapon(id, weapon);
    // İlerleme: hedefi olan sakin yarışmacı yerinde sayıyorsa kaçış noktası seçer.
    rec.window += dt;
    if (!goal || st.state !== 'travel') {
      rec.window = 0;
      rec.anchor = { x: st.x, z: st.z };
      return;
    }
    if (rec.window >= cfg.progressWindow) {
      if (Math.hypot(st.x - rec.anchor.x, st.z - rec.anchor.z) < cfg.minProgress)
        this.far.nudge(agent);
      rec.window = 0;
      rec.anchor = { x: st.x, z: st.z };
    }
  }

  /** Oyuncuya yakın, karosu hazır uzak NPC'leri (yakından uzağa) yarışmacıya çevirir. */
  private promote(player: { x: number; z: number }): void {
    const cfg = BATTLE_ROYALE.near;
    if (this.aliveCount >= cfg.maxAgents) return;
    const candidates = this.far
      .near(player.x, player.z, cfg.radius)
      .map((a) => ({ a, d: Math.hypot(a.x - player.x, a.z - player.z) }))
      .sort((p, q) => p.d - q.d || p.a.id - q.a.id);
    for (const { a } of candidates) {
      if (this.aliveCount >= cfg.maxAgents) return;
      if (!this.match.isAlive(a.id) || !this.world.ready(a.x, a.z)) continue;
      const agent = this.far.take(a.id);
      if (!agent) continue;
      const contestant = this.match.contestants[agent.id];
      this.host.spawnContestant({
        contestant: agent.id,
        name: contestant?.name ?? `#${agent.id}`,
        x: agent.x,
        z: agent.z,
        // Bakış: hedefine doğru (yoksa sabit); ileri = (−sin, −cos).
        yaw: agent.target
          ? Math.atan2(-(agent.target.x - agent.x), -(agent.target.z - agent.z))
          : 0,
        weapon: weaponForGear(agent.gear),
        health: Math.max(1, agent.health),
        maxHealth: cfg.maxHealth,
        aimScale: cfg.difficulty[this.difficulty].aimScale,
      });
      this.records.set(agent.id, {
        agent,
        anchor: { x: agent.x, z: agent.z },
        window: 0,
        dead: false,
      });
    }
  }
}
