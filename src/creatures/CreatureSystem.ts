import { CREATURES } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRandom, seedFrom, type Random } from '../utils/random';
import {
  createBrain,
  forceWander,
  stepCreature,
  type Brain,
  type Senses,
  type ThreatSense,
} from './ai';
import type {
  CreatureContext,
  CreatureId,
  CreatureKind,
  CreatureState,
  CreatureStats,
  CreatureTerrain,
  CreatureView,
} from './kinds';
import { darknessOf, nearestFire, perceivePlayer } from './perception';
import {
  activityWeight,
  candidatesForCell,
  cellKey,
  cellOf,
  cellsNear,
  epochOf,
  isHiddenFrom,
  makeSpawnGrid,
  passable,
  spawnPointOk,
  type Candidate,
  type SpawnGrid,
} from './spawn';
import {
  MAX_CREATURES_PER_CELL,
  SPECIES,
  creatureId,
  decodeCreatureId,
  type SpeciesDef,
} from './species';

/** Bir canlının simülasyon kaydı: beyin + hareket/takılma/çizim durumu. */
interface Entry {
  id: CreatureId;
  cell: number;
  /** Zaman penceresi eşiği (aday `u`'su). */
  u: number;
  brain: Brain;
  rng: Random;
  y: number;
  hitFlash: number;
  deadSeconds: number;
  /** Geri tepme hızı (oyun m/sn). */
  kbx: number;
  kbz: number;
  /** Engel karşısında yön sapması: kalan süre (sn) ve sabit yaw. */
  steerTime: number;
  steerYaw: number;
  /** Takılma denetimi: pencere süresi ve başlangıç konumu; engele çarpma sayacı. */
  stuckClock: number;
  stuckX: number;
  stuckZ: number;
  /** Pencere içinde başlangıç noktasından en uzak olunan mesafe (gidip gelen canlı takılı sayılmaz). */
  stuckReach: number;
  blocks: number;
  /** Hiçbir yöne çıkamayınca artar (sıkışma). */
  trapped: number;
  freeTime: number;
  waterClock: number;
  /** AI LOD: son adımdan beri biriken süre. */
  aiAccum: number;
  view: CreatureView;
}

const MOVING_STATES: ReadonlySet<CreatureState> = new Set(['wander', 'flee', 'stalk', 'chase']);
/** Otoburlar yakındaki yırtıcıyı, görüş mesafelerinin bu oranı içinde fark eder. */
const PREDATOR_AWARENESS = 0.6;
/** Göl içi sorgusunun mesafesi (oyun m): çokgen içi 0 sayılır, bu yüzden küçük bir değer yeter. */
const IN_WATER = 0.001;
/** Engelde denenen sapma açıları (rad, küçükten büyüğe) ve ileriye bakış mesafesi (oyun m). */
const STEER_OFFSETS = [0.5, 1.0, 1.5, 2.0, 2.6, 3.14];
/** Yol taraması: adım, en uzak bakış ve seçilebilecek en kısa yol (oyun m). */
/** Kayarak ilerlenen mesafe, istenen adımın bu oranından azsa hareket engellenmiş sayılır. */
const SLIDE_MIN_GAIN = 0.3;
const STEER_STEP = 0.25;
const STEER_LOOK = 6;
const STEER_MIN_RUN = 1.5;
/** Sıkışma kurtarma: kaç art arda çıkışsızlıktan sonra, hangi adım/yarıçap/yönle aranır. */
const TRAPPED_LIMIT = 2;
const RESCUE_STEP = 4;
const RESCUE_RADIUS = 120;
const RESCUE_DIRECTIONS = 12;
const RESCUE_SLOPE_MARGIN_DEG = 6;

/**
 * Canlıların simülasyonu (saf mantık): doğma/akış, araziye oturmuş kinematik hareket (Rapier yok; `y =
 * heightAt`), takılma çözümü, AI LOD, hasar ve leş. Çizim ve oyuncu saldırısı `CreatureView` ve olaylar
 * üzerinden bağlanır (docs/faz-5-paralel-plan.md §3).
 */
export class CreatureSystem {
  private readonly records = new Map<CreatureId, Entry>();
  private viewList: CreatureView[] = [];
  private viewsDirty = false;
  private time = 0;
  private spawnClock = Infinity;
  private tick = 0;
  private grid: SpawnGrid | null = null;
  private gridTerrain: CreatureTerrain | null = null;
  private readonly candidateCache = new Map<string, Candidate[]>();
  /** Öldürülen canlının hücresi → yeniden doğmaya izin verilen zaman (sistem saati, gerçek sn). */
  private readonly killedUntil = new Map<number, number>();

  constructor(private readonly events?: EventBus<GameEvents>) {}

  /** Sabit adım (dt sn). */
  update(dt: number, context: CreatureContext): void {
    this.time += dt;
    this.tick++;
    const terrain = context.terrain;
    if (!terrain) {
      if (this.records.size > 0) this.clearAll();
      return;
    }
    if (terrain !== this.gridTerrain) {
      this.gridTerrain = terrain;
      this.grid = makeSpawnGrid(terrain.bounds);
      this.candidateCache.clear();
      this.clearAll();
    }

    this.spawnClock += dt;
    if (this.spawnClock >= CREATURES.spawnIntervalSeconds) {
      this.spawnClock = 0;
      this.despawnPass(context);
      this.spawnPass(context, terrain);
    }

    const darkness = darknessOf(context.sunAltitudeDeg);
    const predators: Entry[] = [];
    for (const rec of this.records.values()) {
      if (rec.brain.state !== 'dead' && SPECIES[rec.brain.kind].predator) predators.push(rec);
    }

    for (const rec of this.records.values()) {
      this.updateRecord(rec, dt, context, terrain, darkness, predators);
    }
    this.syncViews();
  }

  /** Etkin canlılar (leşler dahil). */
  views(): ReadonlyArray<CreatureView> {
    if (this.viewsDirty) this.rebuildViewList();
    return this.viewList;
  }

  /** (x, z)'ye `radius` içindeki etkin canlılar, yakından uzağa. */
  near(x: number, z: number, radius: number): CreatureView[] {
    const found: Array<{ view: CreatureView; d2: number }> = [];
    for (const view of this.views()) {
      const d2 = (view.x - x) ** 2 + (view.z - z) ** 2;
      if (d2 <= radius * radius) found.push({ view, d2 });
    }
    found.sort((a, b) => a.d2 - b.d2);
    return found.map((f) => f.view);
  }

  /**
   * Canlıya hasar verir. `from`: vuranın konumu (geri tepme ve kaçış/saldırı yönü). Canlı değilse ya da
   * yoksa null; hasar ≤ 0 ise hiçbir şey olmaz.
   */
  damage(
    id: CreatureId,
    amount: number,
    from: { x: number; z: number },
  ): { killed: boolean } | null {
    const rec = this.records.get(id);
    if (!rec || rec.brain.state === 'dead') return null;
    if (!(amount > 0)) return { killed: false };

    const brain = rec.brain;
    brain.health = Math.max(0, brain.health - amount);
    rec.hitFlash = 1;
    brain.alarm = CREATURES.provokedSeconds;

    const dx = brain.x - from.x;
    const dz = brain.z - from.z;
    const length = Math.hypot(dx, dz) || 1;
    rec.kbx = (dx / length) * CREATURES.knockbackSpeed;
    rec.kbz = (dz / length) * CREATURES.knockbackSpeed;

    const killed = brain.health <= 0;
    this.events?.emit('creature:damaged', { id, kind: brain.kind, amount, killed });
    if (killed) {
      brain.state = 'dead';
      brain.speed = 0;
      brain.attackPhase = 0;
      rec.deadSeconds = 0;
      this.killedUntil.set(rec.cell, this.time + CREATURES.respawnCooldownSeconds);
      this.events?.emit('creature:died', {
        id,
        kind: brain.kind,
        x: brain.x,
        y: rec.y,
        z: brain.z,
      });
    }
    this.syncViews();
    return { killed };
  }

  /**
   * Belirli bir noktada canlı doğurur (test, dev demosu ve denge ölçümleri için; normal akış `spawnPass`'tir).
   * Kimlik hücrenin en yüksek dizinlerinden verilir (aday kimlikleriyle çakışmaz); hücre dolduysa ya da arazi yoksa
   * null. Doğan canlı normal canlı gibi simüle edilir ve uzaklaşınca kaldırılır.
   */
  spawnAt(kind: CreatureKind, x: number, z: number, yaw = 0): CreatureId | null {
    const grid = this.grid;
    const terrain = this.gridTerrain;
    if (!grid || !terrain) return null;
    const cell = cellOf(grid, x, z);
    if (!cell) return null;
    const key = cellKey(grid, cell.cx, cell.cy);
    for (let index = MAX_CREATURES_PER_CELL - 1; index >= MAX_CREATURES_PER_CELL / 2; index--) {
      const id = creatureId(key, index);
      if (this.records.has(id)) continue;
      this.spawn({ id, kind, x, z, yaw, u: 0, cell: key, epoch: epochOf(this.time) }, terrain);
      this.syncViews();
      return id;
    }
    return null;
  }

  /** Kesilen leşi kaldırır; leş yoksa/canlıysa false. */
  removeCarcass(id: CreatureId): boolean {
    const rec = this.records.get(id);
    if (!rec || rec.brain.state !== 'dead') return false;
    this.records.delete(id);
    this.viewsDirty = true;
    return true;
  }

  get stats(): CreatureStats {
    let carcasses = 0;
    for (const rec of this.records.values()) if (rec.brain.state === 'dead') carcasses++;
    return { active: this.records.size, carcasses };
  }

  /**
   * Yeniden doğma bekleyen hücreler (kalan gerçek sn): Faz 6 kaydı için serileştirilebilir tek yapı.
   * Sürümlü kayıt formatı Faz 6'dadır.
   */
  killedSnapshot(): Array<{ cell: number; remainingSeconds: number }> {
    const out: Array<{ cell: number; remainingSeconds: number }> = [];
    for (const [cell, until] of this.killedUntil) {
      if (until > this.time) out.push({ cell, remainingSeconds: until - this.time });
    }
    return out;
  }

  /** `killedSnapshot` ile alınan bekleme listesini yükler. */
  restoreKilled(snapshot: ReadonlyArray<{ cell: number; remainingSeconds: number }>): void {
    this.killedUntil.clear();
    for (const { cell, remainingSeconds } of snapshot) {
      this.killedUntil.set(cell, this.time + remainingSeconds);
    }
  }

  dispose(): void {
    this.clearAll();
    this.candidateCache.clear();
    this.killedUntil.clear();
    this.grid = null;
    this.gridTerrain = null;
  }

  // ── Akış ──────────────────────────────────────────────────────────────

  private clearAll(): void {
    this.records.clear();
    this.viewList = [];
    this.viewsDirty = false;
  }

  private candidates(
    grid: SpawnGrid,
    terrain: CreatureTerrain,
    cx: number,
    cy: number,
    epoch: number,
  ) {
    const key = `${cx},${cy},${epoch}`;
    const cached = this.candidateCache.get(key);
    if (cached) {
      // LRU: en son kullanılanı sona al.
      this.candidateCache.delete(key);
      this.candidateCache.set(key, cached);
      return cached;
    }
    const made = candidatesForCell({ grid, terrain, cx, cy, epoch });
    this.candidateCache.set(key, made);
    if (this.candidateCache.size > CREATURES.candidateCacheSize) {
      const oldest = this.candidateCache.keys().next().value;
      if (oldest !== undefined) this.candidateCache.delete(oldest);
    }
    return made;
  }

  /** Oyuncu çevresindeki hücrelerde uygun adayları (yakından uzağa) `maxActive`'e kadar doğurur. */
  private spawnPass(context: CreatureContext, terrain: CreatureTerrain): void {
    const grid = this.grid;
    if (!grid || !context.player.alive) return;
    for (const [cell, until] of this.killedUntil)
      if (until <= this.time) this.killedUntil.delete(cell);
    if (this.records.size >= CREATURES.maxActive) return;

    const player = context.player;
    const epoch = epochOf(this.time);
    const structures = context.structures ?? context.fires;
    const weights = new Map<string, number>();
    const pool: Array<{ candidate: Candidate; dist: number }> = [];
    let newCells = 0;

    for (const { cx, cy } of cellsNear(grid, player.x, player.z, CREATURES.simRadius)) {
      const key = cellKey(grid, cx, cy);
      if ((this.killedUntil.get(key) ?? 0) > this.time) continue;
      if (!this.candidateCache.has(`${cx},${cy},${epoch}`)) {
        // Yeni hücrenin adaylarını üretmek pahalıdır: denetim başına sınırlı sayıda.
        if (newCells >= CREATURES.maxNewCellsPerPass) continue;
        newCells++;
      }
      for (const candidate of this.candidates(grid, terrain, cx, cy, epoch)) {
        if (this.records.has(candidate.id)) continue;
        let weight = weights.get(candidate.kind);
        if (weight === undefined) {
          weight = activityWeight(SPECIES[candidate.kind], context.sunAltitudeDeg);
          weights.set(candidate.kind, weight);
        }
        if (candidate.u >= weight) continue;
        if (!spawnPointOk(candidate, player, structures)) continue;
        pool.push({ candidate, dist: Math.hypot(candidate.x - player.x, candidate.z - player.z) });
      }
    }
    pool.sort((a, b) => a.dist - b.dist);
    for (const { candidate } of pool) {
      if (this.records.size >= CREATURES.maxActive) break;
      this.spawn(candidate, terrain);
    }
  }

  private spawn(candidate: Candidate, terrain: CreatureTerrain): void {
    const rng = createRandom(seedFrom(CREATURES.seed, candidate.id));
    const brain = createBrain(candidate.kind, candidate.x, candidate.z, candidate.yaw, rng);
    const species = SPECIES[candidate.kind];
    const y = terrain.heightAt(candidate.x, candidate.z);
    const rec: Entry = {
      id: candidate.id,
      cell: decodeCreatureId(candidate.id).cellKey,
      u: candidate.u,
      brain,
      rng,
      y,
      hitFlash: 0,
      deadSeconds: 0,
      kbx: 0,
      kbz: 0,
      steerTime: 0,
      steerYaw: 0,
      stuckClock: 0,
      stuckX: candidate.x,
      stuckZ: candidate.z,
      stuckReach: 0,
      blocks: 0,
      trapped: 0,
      freeTime: 0,
      waterClock: 0,
      aiAccum: 0,
      view: {
        id: candidate.id,
        kind: candidate.kind,
        x: candidate.x,
        y,
        z: candidate.z,
        yaw: candidate.yaw,
        speed: 0,
        state: 'idle',
        attackPhase: 0,
        hitFlash: 0,
        health: brain.health,
        maxHealth: brain.maxHealth,
        radius: species.radius,
        height: species.height,
        dead: false,
        deadSeconds: 0,
      },
    };
    this.records.set(rec.id, rec);
    this.viewsDirty = true;
  }

  /** Uzaktaki, süresi dolan ya da zaman penceresi dışında görünmeyen canlıları/leşleri kaldırır. */
  private despawnPass(context: CreatureContext): void {
    const player = context.player;
    for (const rec of [...this.records.values()]) {
      const b = rec.brain;
      const dist = Math.hypot(b.x - player.x, b.z - player.z);
      let remove = dist > CREATURES.despawnRadius;
      if (!remove && b.state === 'dead') remove = rec.deadSeconds >= CREATURES.carcassSeconds;
      if (
        !remove &&
        b.state !== 'dead' &&
        (b.state === 'idle' || b.state === 'wander' || b.state === 'graze')
      ) {
        const weight = activityWeight(SPECIES[b.kind], context.sunAltitudeDeg);
        // Pencere dışına çıkan canlı, oyuncu görmüyorsa sessizce kaldırılır (oyuncu görüş dışındayken).
        if (rec.u >= weight + CREATURES.despawnHysteresis && dist >= CREATURES.minSpawnDistance) {
          remove = isHiddenFrom(b, player);
        }
      }
      if (remove) {
        this.records.delete(rec.id);
        this.viewsDirty = true;
      }
    }
  }

  // ── Adım ──────────────────────────────────────────────────────────────

  private updateRecord(
    rec: Entry,
    dt: number,
    context: CreatureContext,
    terrain: CreatureTerrain,
    darkness: number,
    predators: ReadonlyArray<Entry>,
  ): void {
    rec.hitFlash = Math.max(0, rec.hitFlash - CREATURES.hitFlashDecay * dt);
    const brain = rec.brain;

    if (brain.state === 'dead') {
      rec.deadSeconds += dt;
      return;
    }

    // Geri tepme: zemin uygunsa kaydır, hızı sönümle.
    if (rec.kbx !== 0 || rec.kbz !== 0) {
      const species = SPECIES[brain.kind];
      const nx = brain.x + rec.kbx * dt;
      const nz = brain.z + rec.kbz * dt;
      if (passable(species, terrain, nx, nz)) {
        brain.x = nx;
        brain.z = nz;
      } else {
        rec.kbx = 0;
        rec.kbz = 0;
      }
      const decay = Math.max(0, 1 - CREATURES.knockbackDecay * dt);
      rec.kbx *= decay;
      rec.kbz *= decay;
      if (Math.hypot(rec.kbx, rec.kbz) < 0.05) {
        rec.kbx = 0;
        rec.kbz = 0;
      }
    }
    rec.y = terrain.heightAt(brain.x, brain.z);

    // AI LOD: uzaktaki canlı her `farAiEvery`. adımda, biriken süreyle güncellenir.
    const playerDist = Math.hypot(brain.x - context.player.x, brain.z - context.player.z);
    rec.aiAccum += dt;
    if (playerDist > CREATURES.lodNearRadius && (this.tick + rec.id) % CREATURES.farAiEvery !== 0) {
      return;
    }
    const stepDt = rec.aiAccum;
    rec.aiAccum = 0;

    const senses = this.sensesFor(rec, context, darkness, predators);
    const result = stepCreature(brain, senses, stepDt, rec.rng);
    rec.brain = result.next;
    for (const event of result.events) {
      if (event.type === 'noticed') {
        this.events?.emit('creature:noticed', {
          id: rec.id,
          kind: rec.brain.kind,
          state: event.state,
        });
      } else {
        this.events?.emit('creature:attacked', {
          id: rec.id,
          kind: rec.brain.kind,
          damage: event.damage,
          x: rec.brain.x,
          z: rec.brain.z,
        });
      }
    }

    // Yaralı kaçan canlı yavaşlar (sağlık oranına göre): avcı yetişip işini bitirebilir.
    let slow = 1;
    if (rec.brain.state === 'flee' && rec.brain.health < rec.brain.maxHealth) {
      const fraction = rec.brain.health / rec.brain.maxHealth;
      slow = CREATURES.woundedSpeedFloor + (1 - CREATURES.woundedSpeedFloor) * fraction;
      rec.brain.speed *= slow;
    }
    this.move(rec, stepDt, result.intent.speed * slow, terrain);
    this.watchStuck(rec, stepDt, terrain);
  }

  private sensesFor(
    rec: Entry,
    context: CreatureContext,
    darkness: number,
    predators: ReadonlyArray<Entry>,
  ): Senses {
    const brain = rec.brain;
    const species = SPECIES[brain.kind];
    const player = context.player.alive
      ? perceivePlayer(species, brain, context.player, darkness)
      : null;
    if (player && brain.alarm > 0) player.noticed = true; // vuran oyuncunun yerini bilir

    let threat: ThreatSense | null = null;
    if (species.behavior === 'skittish') {
      if (player?.noticed) threat = { x: context.player.x, z: context.player.z, dist: player.dist };
      const awareness = species.perception.sightRange * PREDATOR_AWARENESS;
      for (const predator of predators) {
        const d = Math.hypot(predator.brain.x - brain.x, predator.brain.z - brain.z);
        if (d <= awareness && (threat === null || d < threat.dist)) {
          threat = { x: predator.brain.x, z: predator.brain.z, dist: d };
        }
      }
    }

    return {
      player,
      threat,
      fire: nearestFire(brain.x, brain.z, context.fires, species.fireAvoidRadius),
      darkness,
    };
  }

  /** Kinematik hareket: yaw yönünde, arazi kuralları içinde; engelde kayar ya da yön sapar. */
  private move(rec: Entry, dt: number, desiredSpeed: number, terrain: CreatureTerrain): void {
    const brain = rec.brain;
    const species = SPECIES[brain.kind];

    if (rec.steerTime > 0 && MOVING_STATES.has(brain.state)) {
      rec.steerTime -= dt;
      brain.yaw = rec.steerYaw;
      brain.speed = desiredSpeed;
    }

    if (brain.speed > 0) {
      const step = brain.speed * dt;
      const dirX = -Math.sin(brain.yaw);
      const dirZ = -Math.cos(brain.yaw);
      const nx = brain.x + dirX * step;
      const nz = brain.z + dirZ * step;

      // Göl içi (pahalı): belirli aralıkla ve ileriye bakarak.
      let water = false;
      rec.waterClock -= dt;
      if (rec.waterClock <= 0) {
        rec.waterClock = CREATURES.waterCheckSeconds;
        water = terrain.waterNear(
          brain.x + dirX * CREATURES.waterLookAhead,
          brain.z + dirZ * CREATURES.waterLookAhead,
          IN_WATER,
        );
      }

      let moved = false;
      const fromX = brain.x;
      const fromZ = brain.z;
      if (!water) {
        if (passable(species, terrain, nx, nz)) {
          brain.x = nx;
          brain.z = nz;
          moved = true;
        } else if (passable(species, terrain, nx, brain.z)) {
          brain.x = nx;
          moved = true;
        } else if (passable(species, terrain, brain.x, nz)) {
          brain.z = nz;
          moved = true;
        }
      }
      // Duvar boyunca neredeyse hiç ilerletmeyen kayma (hedefe dik yüzey) engel sayılır.
      if (moved && Math.hypot(brain.x - fromX, brain.z - fromZ) < step * SLIDE_MIN_GAIN)
        moved = false;
      if (moved) {
        rec.freeTime += dt;
        if (rec.freeTime >= 2) rec.blocks = 0;
      } else {
        this.blocked(rec, terrain);
      }
    }
    rec.y = terrain.heightAt(brain.x, brain.z);
  }

  /**
   * Engele çarpınca yönü sapar: sapma açıları (küçükten büyüğe, rastgele taraf önce) denenir, ileride geçilebilir
   * ilk yön seçilir. Hiç yön yoksa canlı bir cepte sıkışmıştır: yakındaki uygun bir noktaya taşınır.
   * Art arda çarparsa yeni dolaşma hedefi seçer.
   */
  private blocked(rec: Entry, terrain: CreatureTerrain): void {
    const brain = rec.brain;
    const species = SPECIES[brain.kind];
    brain.speed = 0;
    rec.freeTime = 0;
    rec.blocks++;
    if (rec.blocks >= 3) {
      rec.blocks = 0;
      rec.steerTime = 0;
      forceWander(brain, rec.rng);
    }

    // Her sapma yönünde kesintisiz geçilebilir yol uzunluğuna bak; en uzun olanı seç (eşitlikte küçük sapma).
    const side = rec.rng.next() < 0.5 ? -1 : 1;
    let chosen: number | null = null;
    let bestRun = STEER_MIN_RUN;
    for (const offset of STEER_OFFSETS) {
      for (const sign of [side, -side]) {
        const yaw = brain.yaw + sign * offset;
        const run = this.freeRun(species, terrain, brain.x, brain.z, yaw);
        if (run > bestRun + 1e-6) {
          bestRun = run;
          chosen = yaw;
        }
      }
    }
    if (chosen === null) {
      rec.trapped++;
      if (rec.trapped >= TRAPPED_LIMIT) this.rescue(rec, terrain);
      return;
    }
    rec.trapped = 0;
    if (brain.state === 'wander') {
      // Dolaşırken hedefi serbest yöne kaydır: AI yönü engele geri çekmesin.
      const distance = rec.rng.range(10, 30);
      brain.target = {
        x: brain.x - Math.sin(chosen) * distance,
        z: brain.z - Math.cos(chosen) * distance,
      };
    }
    rec.steerYaw = chosen;
    rec.steerTime = CREATURES.steerSeconds;
    brain.yaw = chosen;
  }

  /** (x, z)'den `yaw` yönünde kesintisiz geçilebilir yolun uzunluğu (oyun m, en çok STEER_LOOK). */
  private freeRun(
    species: SpeciesDef,
    terrain: CreatureTerrain,
    x: number,
    z: number,
    yaw: number,
  ): number {
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    let run = 0;
    for (let d = STEER_STEP; d <= STEER_LOOK; d += STEER_STEP) {
      if (!passable(species, terrain, x + dx * d, z + dz * d)) break;
      run = d;
    }
    // Göl içi: yalnızca uzak uçta (pahalı); suya çıkan yol kısaltılır.
    while (run > 0 && terrain.waterNear(x + dx * run, z + dz * run, IN_WATER)) run -= STEER_STEP;
    return run;
  }

  /** Noktanın çevresinde (3 m) en az 5/8 yön geçilebilir mi (cep değil)? */
  private roomy(species: SpeciesDef, terrain: CreatureTerrain, x: number, z: number): boolean {
    let open = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (passable(species, terrain, x + Math.cos(a) * 3, z + Math.sin(a) * 3)) open++;
    }
    return open >= 5;
  }

  /** Sıkışmış canlıyı yakındaki, eğimi sınırın rahat altında bir noktaya taşır. */
  private rescue(rec: Entry, terrain: CreatureTerrain): void {
    const brain = rec.brain;
    const species = SPECIES[brain.kind];
    rec.trapped = 0;
    for (let radius = RESCUE_STEP; radius <= RESCUE_RADIUS; radius += RESCUE_STEP) {
      for (let i = 0; i < RESCUE_DIRECTIONS; i++) {
        const angle = (i / RESCUE_DIRECTIONS) * Math.PI * 2 + rec.rng.range(0, 0.4);
        const x = brain.x + Math.cos(angle) * radius;
        const z = brain.z + Math.sin(angle) * radius;
        if (
          passable(species, terrain, x, z) &&
          terrain.slopeDegAt(x, z) <= species.maxSlopeDeg - RESCUE_SLOPE_MARGIN_DEG &&
          !terrain.waterNear(x, z, 1) &&
          this.roomy(species, terrain, x, z)
        ) {
          brain.x = x;
          brain.z = z;
          rec.y = terrain.heightAt(x, z);
          rec.steerTime = 0;
          rec.stuckClock = 0;
          rec.stuckX = x;
          rec.stuckZ = z;
          forceWander(brain, rec.rng);
          return;
        }
      }
    }
    // Uygun nokta bulunamadı: en azından yeni bir hedef ver.
    forceWander(brain, rec.rng);
  }

  /** Hareket ederken `stuckSeconds` içinde yer değiştirmeyen canlıya yeni hedef verir. */
  private watchStuck(rec: Entry, dt: number, terrain: CreatureTerrain): void {
    const brain = rec.brain;
    if (!MOVING_STATES.has(brain.state)) {
      this.resetStuckWindow(rec);
      return;
    }
    rec.stuckClock += dt;
    rec.stuckReach = Math.max(
      rec.stuckReach,
      Math.hypot(brain.x - rec.stuckX, brain.z - rec.stuckZ),
    );
    if (rec.stuckClock < CREATURES.stuckSeconds) return;

    if (rec.stuckReach < CREATURES.stuckMinDistance) {
      rec.steerTime = 0;
      rec.blocks = 0;
      // Yerinde kalan canlı yakındaki uygun bir noktaya taşınır (nadir; bir cepte sıkışmıştır).
      this.rescue(rec, terrain);
    }
    this.resetStuckWindow(rec);
  }

  private resetStuckWindow(rec: Entry): void {
    rec.stuckClock = 0;
    rec.stuckReach = 0;
    rec.stuckX = rec.brain.x;
    rec.stuckZ = rec.brain.z;
  }

  // ── Görünümler ────────────────────────────────────────────────────────

  private rebuildViewList(): void {
    this.viewList = [...this.records.values()].map((rec) => rec.view);
    this.viewsDirty = false;
  }

  private syncViews(): void {
    if (this.viewsDirty) this.rebuildViewList();
    for (const rec of this.records.values()) {
      const b = rec.brain;
      const v = rec.view;
      v.x = b.x;
      v.y = rec.y;
      v.z = b.z;
      v.yaw = b.yaw;
      v.speed = b.speed;
      v.state = b.state;
      v.attackPhase = b.attackPhase;
      v.hitFlash = rec.hitFlash;
      v.health = b.health;
      v.maxHealth = b.maxHealth;
      v.dead = b.state === 'dead';
      v.deadSeconds = v.dead ? rec.deadSeconds : 0;
    }
  }
}
