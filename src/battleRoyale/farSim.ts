import { BATTLE_ROYALE } from '../config';
import type { BanditWeapon } from '../bandits/kinds';
import type { SettlementRank } from '../data/settlements';
import { createRandom, type Random } from '../utils/random';
import type { Circle } from './area';
import { FlowField, WalkGrid, type GridBounds } from './flowField';
import type { BrMatch, Elimination } from './match';
import { distanceToSafety, insideCircle, zoneAt, zoneDamageAt, type ZonePlan } from './zone';

/**
 * Uzak kademe simülasyonu (BR.2; saf, seed'li, sabit adımlı). Oyuncudan uzaktaki NPC'ler tam yapay zekâ/fizik yerine
 * soyut bir modelle yaşar: konum, can, teçhizat düzeyi (0–1) ve niyet (ganimet / bölge). Ganimet yerlerinde (yerleşimler)
 * kalarak teçhizat toplar, güvenli bölgeye yetişemeyecekse ona yönelir, bölge dışında hasar alır. İki NPC
 * `engageRadius` içinde rastlaşırsa karşılaşma güç oranıyla zarlanır; yenilen elenir (öldürme listesine düşer), ganimeti
 * yerinde çanta olarak kalır (`drops`). Bölgeye giden NPC kaba bir akış alanını izler (`flowField.ts`). Arazi yalnız `walkable` ile sorulur (oyunda genel bakış verisi: karolar
 * yüklenmeden çalışır).
 *
 * Yakın kademe (BR.3) bir NPC'yi `take` ile alır (oyuncu yaklaşınca tam üyeye çevrilir), uzaklaşınca `restore` ile
 * geri verir; alınan NPC uzak simülasyonda hareket etmez ve karşılaşmaya girmez.
 */

/** Ganimet yeri (yerleşim): merkez, yarıçap ve zenginlik (0–1; il > ilçe > köy). */
export interface LootSpot {
  x: number;
  z: number;
  radius: number;
  richness: number;
}

/** Uzak simülasyonun dünyadan istediği (Game genel bakış arazisi + yerleşimlerle karşılar; testte sahte). */
export interface FarWorld {
  /** Yürünebilir mi (karada, su dışı, eğim sınırında)? */
  walkable(x: number, z: number): boolean;
  readonly lootSpots: readonly LootSpot[];
}

export interface FarZone {
  plan: ZonePlan;
  area: { contains(x: number, z: number): boolean; readonly bounds: GridBounds };
}

export type FarIntent = 'loot' | 'zone';

export interface FarAgent {
  id: number;
  x: number;
  z: number;
  /** Can (0–100). */
  health: number;
  /** Teçhizat düzeyi (0 eli boş – 1 en iyi silah, zırh, sağlık). */
  gear: number;
  intent: FarIntent;
  target: { x: number; z: number } | null;
  /** Hedefteki ganimet yeri (yoksa −1) ve orada kalan süre (sn). */
  spot: number;
  dwell: number;
  /** Son ziyaret edilen ganimet yerleri (yakın zamanda yeniden seçilmez). */
  visited: number[];
  /** Bölge hedefinin seçildiği aşama (−1: yok). */
  zonePhase: number;
  /** Son hasardan beri (sn) ve yeniden çatışmaya kalan süre (sn). */
  sinceHurt: number;
  cooldown: number;
  stuck: number;
  /** Takılınca geçici kaçış noktası (oraya varınca asıl hedefe döner). */
  escape: { x: number; z: number } | null;
}

/** Uzakta ölen NPC'nin yerinde kalan ganimeti. */
export interface FarDrop {
  victim: number;
  x: number;
  z: number;
  gear: number;
}

/** Yerleşimlerden ganimet yerleri (zenginlik rütbeden; yarıçap yerleşim ayak izinin yarıçapı). */
export function lootSpotsOf(
  settlements: ReadonlyArray<{ x: number; z: number; rank: SettlementRank; radius: number }>,
): LootSpot[] {
  const richness = BATTLE_ROYALE.far.richness;
  return settlements.map((s) => ({ x: s.x, z: s.z, radius: s.radius, richness: richness[s.rank] }));
}

/** Teçhizat düzeyinin silahı (öldürme listesi ve yakın kademeye geçişte silah). */
export function weaponForGear(gear: number): BanditWeapon {
  for (const g of BATTLE_ROYALE.far.gearWeapons) if (gear < g.below) return g.weapon;
  return 'sniper_rifle';
}

/** Silahın teçhizat düzeyi (o silahı veren aralığın alt sınırı; yakın kademeden dönüşte teçhizat bunun altına inmez). */
export function gearOfWeapon(weapon: BanditWeapon): number {
  let below = 0;
  for (const g of BATTLE_ROYALE.far.gearWeapons) {
    if (g.weapon === weapon) return below;
    below = g.below;
  }
  return 0;
}

/** Güç: teçhizat ve canla artar. */
export function fightStrength(agent: Pick<FarAgent, 'gear' | 'health'>): number {
  const f = BATTLE_ROYALE.far;
  return (f.gearBase + agent.gear) * Math.sqrt(Math.max(0, agent.health) / 100);
}

/** `a`'nın `b`'yi yenme olasılığı. */
export function winChance(
  a: Pick<FarAgent, 'gear' | 'health'>,
  b: Pick<FarAgent, 'gear' | 'health'>,
): number {
  const k = BATTLE_ROYALE.far.strengthExponent;
  const sa = fightStrength(a) ** k;
  const sb = fightStrength(b) ** k;
  return sa + sb > 0 ? sa / (sa + sb) : 0.5;
}

const ARRIVE = 3;
const TARGET_TRIES = 24;

export class FarSim {
  private readonly agents = new Map<number, FarAgent>();
  /** Uzakta ölenlerin ganimeti (yakın kademe/ganimet sistemi okur). */
  readonly drops: FarDrop[] = [];
  private readonly rng: Random;
  /** Simülasyonun saati (maç saniyesi; adım sonu). */
  private time = 0;
  /** Kaba yürüme ızgarası (ilk gerektiğinde kurulur) ve aşama başına akış alanları. */
  private grid: WalkGrid | null = null;
  private readonly flows = new Map<number, FlowField>();

  constructor(
    private readonly match: BrMatch,
    private readonly zone: FarZone,
    private readonly world: FarWorld,
    seed: number,
    starts: ReadonlyArray<{ id: number; x: number; z: number }>,
    /** Başlangıç saati (maç saniyesi; testlerde ateşkes sonrasından başlamak için). */
    startTime = 0,
  ) {
    this.rng = createRandom(seed);
    this.time = startTime;
    for (const s of starts) {
      this.agents.set(s.id, {
        id: s.id,
        x: s.x,
        z: s.z,
        health: 100,
        gear: 0,
        intent: 'loot',
        target: null,
        spot: -1,
        dwell: 0,
        visited: [],
        zonePhase: -1,
        sinceHurt: Infinity,
        cooldown: 0,
        stuck: 0,
        escape: null,
      });
    }
  }

  /** Simülasyon saati (son adımın sonu). */
  get now(): number {
    return this.time;
  }

  /** Uzak kademedeki NPC sayısı. */
  get size(): number {
    return this.agents.size;
  }

  get(id: number): Readonly<FarAgent> | null {
    return this.agents.get(id) ?? null;
  }

  all(): Readonly<FarAgent>[] {
    return [...this.agents.values()];
  }

  /** (x, z)'ye `r` içindeki uzak NPC'ler. */
  near(x: number, z: number, r: number): Readonly<FarAgent>[] {
    const out: FarAgent[] = [];
    for (const a of this.agents.values()) if (Math.hypot(a.x - x, a.z - z) <= r) out.push(a);
    return out;
  }

  /** Yakın kademeye geçiş: NPC'yi uzak simülasyondan çıkarır (durumu döner). */
  take(id: number): FarAgent | null {
    const a = this.agents.get(id);
    if (!a) return null;
    this.agents.delete(id);
    return a;
  }

  /** Yakın kademeden dönüş: NPC uzak simülasyona (güncel konum/can/teçhizatla) geri girer. Ölüyse girmez. */
  restore(agent: FarAgent): void {
    if (!this.match.isAlive(agent.id)) return;
    this.agents.set(agent.id, {
      ...agent,
      target: null,
      spot: -1,
      dwell: 0,
      zonePhase: -1,
      stuck: 0,
      escape: null,
    });
  }

  /**
   * Oyun saatiyle ilerletir: `t` (maç saniyesi) gelene kadar sabit adımlar atar. Bu güncellemede olan elenmeleri döner.
   */
  update(t: number): Elimination[] {
    const step = BATTLE_ROYALE.far.step;
    const out: Elimination[] = [];
    while (this.time + step <= t) {
      this.time += step;
      out.push(...this.stepOnce(step, this.time));
    }
    return out;
  }

  /**
   * Hızlı sonuçlandırma (oyuncu öldükten sonra): kazanan kalana ya da `maxSeconds` dolana kadar adım atar. Yakın
   * kademedeki NPC'ler önce `restore` ile geri verilmelidir.
   */
  runToEnd(maxSeconds: number): Elimination[] {
    const limit = this.time + maxSeconds;
    const out: Elimination[] = [];
    const step = BATTLE_ROYALE.far.step;
    while (this.match.aliveCount > 1 && this.time < limit) {
      this.time += step;
      out.push(...this.stepOnce(step, this.time));
    }
    return out;
  }

  private stepOnce(dt: number, t: number): Elimination[] {
    const out: Elimination[] = [];
    const zone = zoneAt(this.zone.plan, t);
    const order = [...this.agents.values()].sort((a, b) => a.id - b.id);
    for (const a of order) {
      if (!this.match.isAlive(a.id)) {
        this.agents.delete(a.id);
        continue;
      }
      a.sinceHurt += dt;
      a.cooldown = Math.max(0, a.cooldown - dt);
      // Bölge hasarı.
      const damage = zoneDamageAt(zone, this.zone.area.contains(a.x, a.z), a.x, a.z) * dt;
      if (damage > 0) {
        a.health -= damage;
        a.sinceHurt = 0;
        if (a.health <= 0) {
          const e = this.match.eliminate(a.id, null, 'zone', null, t);
          if (e) {
            out.push(e);
            this.drop(a);
            this.agents.delete(a.id);
            continue;
          }
          a.health = 1; // son kalan (kazanan) elenmez
        }
      }
      // İyileşme (sağlık eşyalarının soyut karşılığı).
      const f = BATTLE_ROYALE.far;
      if (a.sinceHurt >= f.calmSeconds && a.gear >= f.healGear && a.health < 100) {
        a.health = Math.min(100, a.health + f.healPerSec * dt);
      }
      this.think(a, zone, t);
      this.move(a, dt, zone);
    }
    out.push(...this.encounters(dt, t));
    return out;
  }

  /** Aşamanın güvenli dairesine akış alanı (önbellekli). */
  private flowFor(zone: ReturnType<typeof zoneAt>): FlowField {
    let flow = this.flows.get(zone.phase);
    if (!flow) {
      this.grid ??= new WalkGrid(
        this.zone.area.bounds,
        BATTLE_ROYALE.far.flowCell,
        (x, z) => this.world.walkable(x, z),
        (x, z) => this.zone.area.contains(x, z),
      );
      flow = new FlowField(this.grid, zone.next ?? zone.circle);
      this.flows.set(zone.phase, flow);
    }
    return flow;
  }

  /** Niyet ve hedef seçimi. */
  private think(a: FarAgent, zone: ReturnType<typeof zoneAt>, t: number): void {
    const f = BATTLE_ROYALE.far;
    const safe: Circle = zone.next ?? zone.circle;
    const straight = distanceToSafety(safe, a.x, a.z);
    // Yürüme uzaklığı (akış alanı); ulaşılamıyorsa düz uzaklık.
    const walked = straight > 0 ? this.flowFor(zone).distanceAt(a.x, a.z) : 0;
    const distance = Number.isFinite(walked) ? Math.max(walked, straight) : straight;
    let remaining = 0;
    if (zone.stage === 'wait') {
      const phase = this.zone.plan.phases[zone.phase]!;
      remaining = zone.stageEnds - t + (phase.end - phase.shrinkStart);
    } else if (zone.stage === 'shrink') remaining = zone.stageEnds - t;
    const outsideNow = !insideCircle(zone.circle, a.x, a.z);
    const late = distance / f.zoneSpeed > remaining * f.zoneMargin;
    // Seçili alanın dışı (komşu il, kıyı) her zaman hasar verir: hemen geri döner.
    const outsideArea = !this.zone.area.contains(a.x, a.z);
    if (
      (distance > 0 || outsideArea) &&
      (outsideNow || outsideArea || late || zone.stage === 'closed')
    ) {
      if (a.intent !== 'zone' || a.zonePhase !== zone.phase || a.target === null) {
        a.intent = 'zone';
        a.zonePhase = zone.phase;
        a.target = this.pointIn({ x: safe.x, z: safe.z, r: safe.r * 0.7 });
        a.spot = -1;
        a.dwell = 0;
      }
      return;
    }
    if (a.intent === 'zone') {
      a.intent = 'loot';
      a.target = null;
    }
    if (a.dwell > 0 || a.target !== null) return;
    // Yeni ganimet yeri: güvenli dairedeki, yakın zamanda gidilmemiş en yakın birkaç yerden zenginliğe göre biri.
    const spots = this.world.lootSpots;
    const candidates: Array<{ index: number; d: number }> = [];
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!;
      if (a.visited.includes(i) || !insideCircle({ ...safe, r: safe.r * 0.9 }, s.x, s.z)) continue;
      if (!this.zone.area.contains(s.x, s.z)) continue;
      const d = Math.hypot(s.x - a.x, s.z - a.z);
      if (d <= f.lootSearchRadius) candidates.push({ index: i, d });
    }
    candidates.sort((p, q) => p.d - q.d);
    const pool = candidates.slice(0, f.lootChoices);
    if (pool.length === 0) {
      a.spot = -1;
      a.target = this.pointIn({ x: safe.x, z: safe.z, r: safe.r * 0.8 });
      return;
    }
    let total = 0;
    for (const c of pool) total += spots[c.index]!.richness;
    let roll = this.rng.next() * total;
    let chosen = pool[pool.length - 1]!.index;
    for (const c of pool) {
      roll -= spots[c.index]!.richness;
      if (roll <= 0) {
        chosen = c.index;
        break;
      }
    }
    const s = spots[chosen]!;
    a.spot = chosen;
    a.visited.push(chosen);
    if (a.visited.length > 3) a.visited.shift();
    a.target = this.pointIn({ x: s.x, z: s.z, r: s.radius });
  }

  /**
   * Bütün aşamaların akış alanlarını (ve kaba yürüme ızgarasını) önceden kurar: maç başında yükleme ekranında çağrılır
   * ki aşama değişiminde kare takılmasın.
   */
  prepare(): void {
    const plan = this.zone.plan;
    for (const phase of plan.phases) this.flowFor(zoneAt(plan, phase.start));
  }

  /**
   * Yakın kademe (BR.3) için rehberlik: oyuncunun yakınında tam yapay zekâyla yaşayan yarışmacının soyut kaydını
   * (`take` ile alınmış; konumu/canı çağıran günceller) uzak NPC'lerle aynı kurallarla düşündürür. Dönüş: yürüme hedefi
   * ve hızı, ya da null (ganimet yerinde bekliyor — teçhizat artar — ya da hedefi yok).
   */
  guide(a: FarAgent, dt: number, t: number): { x: number; z: number; speed: number } | null {
    const zone = zoneAt(this.zone.plan, t);
    this.think(a, zone, t);
    return this.steering(a, dt, zone);
  }

  /** Yakın kademe: ilerleyemeyen yarışmacıya kaçış noktası seçtirir (`unstick`). */
  nudge(a: FarAgent): void {
    this.unstick(a);
  }

  /** Hedefe doğru bir sonraki ara nokta ve hız; ganimet yerinde bekliyorsa (teçhizat artar) ya da hedef yoksa null. */
  private steering(
    a: FarAgent,
    dt: number,
    zone: ReturnType<typeof zoneAt>,
  ): { x: number; z: number; speed: number } | null {
    const f = BATTLE_ROYALE.far;
    if (a.dwell > 0) {
      a.dwell -= dt;
      const spot = this.world.lootSpots[a.spot];
      if (spot) a.gear += f.lootRate * spot.richness * dt * (1 - a.gear);
      return null;
    }
    const target = a.target;
    if (!target) return null;
    if (Math.hypot(target.x - a.x, target.z - a.z) <= ARRIVE) {
      a.target = null;
      if (a.intent === 'loot' && a.spot >= 0) a.dwell = this.rng.range(f.dwell[0], f.dwell[1]);
      return null;
    }
    if (a.escape && Math.hypot(a.escape.x - a.x, a.escape.z - a.z) <= ARRIVE) a.escape = null;
    // Önce kaçış noktası; bölgeye giderken akış alanının ara noktası (daireye varınca ya da ızgara dışında hedef).
    const steer =
      a.escape ?? ((a.intent === 'zone' && this.flowFor(zone).nextWaypoint(a.x, a.z)) || target);
    return { x: steer.x, z: steer.z, speed: a.intent === 'zone' ? f.zoneSpeed : f.lootSpeed };
  }

  private move(a: FarAgent, dt: number, zone: ReturnType<typeof zoneAt>): void {
    const f = BATTLE_ROYALE.far;
    const steer = this.steering(a, dt, zone);
    if (!steer) return;
    const dx = steer.x - a.x;
    const dz = steer.z - a.z;
    const stepLength = Math.min(Math.max(Math.hypot(dx, dz), 0.01), steer.speed * dt);
    const heading = Math.atan2(dz, dx);
    for (const offset of [0, ...f.detourDeg]) {
      const h = heading + (offset * Math.PI) / 180;
      const x = a.x + Math.cos(h) * stepLength;
      const z = a.z + Math.sin(h) * stepLength;
      if (this.world.walkable(x, z)) {
        a.x = x;
        a.z = z;
        a.stuck = offset === 0 ? 0 : a.stuck + 0.25;
        if (a.stuck >= f.stuckSteps) this.unstick(a);
        return;
      }
    }
    a.stuck++;
    if (a.stuck >= f.stuckSteps) this.unstick(a);
  }

  /**
   * Takılan NPC: yakında rastgele yürünebilir bir kaçış noktasına yönelir (bulunamazsa ganimet hedefini bırakır); sonra
   * asıl hedefine/akış alanına döner.
   */
  private unstick(a: FarAgent): void {
    const f = BATTLE_ROYALE.far;
    a.stuck = 0;
    a.escape = null;
    for (let i = 0; i < TARGET_TRIES; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(f.escapeRadius[0], f.escapeRadius[1]);
      const x = a.x + Math.cos(angle) * r;
      const z = a.z + Math.sin(angle) * r;
      if (this.world.walkable(x, z)) {
        a.escape = { x, z };
        return;
      }
    }
    if (a.intent === 'loot') {
      a.target = null;
      a.spot = -1;
    }
  }

  /** Daire içinde alanda ve yürünebilir rastgele nokta (bulunamazsa merkez). */
  private pointIn(circle: Circle): { x: number; z: number } {
    for (let i = 0; i < TARGET_TRIES; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const r = Math.sqrt(this.rng.next()) * circle.r;
      const x = circle.x + Math.cos(angle) * r;
      const z = circle.z + Math.sin(angle) * r;
      if (this.zone.area.contains(x, z) && this.world.walkable(x, z)) return { x, z };
    }
    return { x: circle.x, z: circle.z };
  }

  /** Karşılaşmalar: menzil içindeki çiftler (ızgara ile) olasılıkla çatışır; menzil teçhizatla uzar. */
  private encounters(dt: number, t: number): Elimination[] {
    const f = BATTLE_ROYALE.far;
    const cell = f.engageRadius + f.engageReachPerGear;
    const grid = new Map<number, FarAgent[]>();
    const key = (cx: number, cz: number): number => cx * 65_537 + cz;
    const order = [...this.agents.values()].sort((a, b) => a.id - b.id);
    for (const a of order) {
      const k = key(Math.floor(a.x / cell), Math.floor(a.z / cell));
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(a);
    }
    const out: Elimination[] = [];
    if (t < f.graceSeconds) return out;
    for (const a of order) {
      if (!this.agents.has(a.id) || a.cooldown > 0) continue;
      const cx = Math.floor(a.x / cell);
      const cz = Math.floor(a.z / cell);
      let rival: FarAgent | null = null;
      let best = Infinity;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const b of grid.get(key(cx + dx, cz + dz)) ?? []) {
            if (b.id <= a.id || b.cooldown > 0 || !this.agents.has(b.id)) continue;
            const d = Math.hypot(b.x - a.x, b.z - a.z);
            const reach = f.engageRadius + f.engageReachPerGear * Math.max(a.gear, b.gear);
            if (d <= reach && d < best) {
              best = d;
              rival = b;
            }
          }
        }
      }
      if (!rival) continue;
      const armed = Math.min(1, Math.max(a.gear, rival.gear) / f.armedGear);
      const rate = f.engageRate * (f.unarmedEngage + (1 - f.unarmedEngage) * armed);
      if (this.rng.next() >= 1 - Math.exp(-rate * dt)) continue;
      const e = this.fight(a, rival, t);
      if (e) out.push(e);
    }
    return out;
  }

  private fight(a: FarAgent, b: FarAgent, t: number): Elimination | null {
    const f = BATTLE_ROYALE.far;
    const aWins = this.rng.next() < winChance(a, b);
    const winner = aWins ? a : b;
    const loser = aWins ? b : a;
    const sw = fightStrength(winner);
    const sl = fightStrength(loser);
    const relative = Math.min(2, sw + sl > 0 ? (2 * sl) / (sw + sl) : 1);
    const hurt = (who: FarAgent, scale: number): void => {
      who.health = Math.max(
        1,
        who.health - this.rng.range(f.fightDamage[0], f.fightDamage[1]) * scale,
      );
      who.sinceHurt = 0;
      who.cooldown = f.cooldown;
    };
    if (this.rng.next() >= f.killChance) {
      // Kimse ölmeden ayrılırlar.
      hurt(winner, relative * 0.5);
      hurt(loser, 1);
      return null;
    }
    const e = this.match.eliminate(loser.id, winner.id, 'kill', weaponForGear(winner.gear), t);
    if (!e) return null;
    hurt(winner, relative);
    winner.gear = Math.max(winner.gear, loser.gear * f.lootTransfer);
    this.drop(loser);
    this.agents.delete(loser.id);
    return e;
  }

  private drop(a: FarAgent): void {
    this.drops.push({ victim: a.id, x: a.x, z: a.z, gear: a.gear });
  }
}
