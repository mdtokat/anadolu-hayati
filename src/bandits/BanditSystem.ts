import { BANDITS, RANGED } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { fireShot, rayTerrain } from '../combat/ranged';
import type { HitSource, HitTarget, TargetProvider } from '../combat/targets';
import { Inventory, type ItemStack } from '../items/Inventory';
import type { ObstacleQuery } from '../placement/obstacles';
import { NO_OBSTACLES } from '../placement/obstacles';
import type { BanditsSave } from '../save/saveGame';
import { createRandom, seedFrom, type Random } from '../utils/random';
import {
  createBrain,
  scheduledActivity,
  stepBandit,
  type BanditAction,
  type BanditBrain,
  type BanditIntent,
  type BanditSenses,
} from './ai';
import { campLayout, pickWeighted, type Camp, type CampLayout } from './camps';
import {
  isMeleeWeapon,
  type BanditActivity,
  type BanditRole,
  type BanditView,
  type BanditWeapon,
} from './kinds';
import { rollBanditLoot, rollCampChest } from './loot';
import { banditName } from './names';
import { perceivePlayer, type BanditPlayer } from './perception';

/**
 * Eşkıyalar (Faz 11, 11.6; saf mantık, kinematik — Rapier'siz): kamplar yakına gelince canlanır, saatlerine göre kamp
 * hayatı sürer (ateş başı, uyku, nöbet, devriye, av, odun, yol pususu), oyuncuyu görünce/duyunca saldırır (yakın
 * hamle ya da `fireShot` ile atış), siper alır, geri çekilir, ağır yaralıyken teslim olur. Temizlenen kamp kayda girer
 * ve `reoccupyDays` sonra yeniden dolar; kamp sandığının içeriği kayıtlıdır. Hedef sağlayıcısıdır (`bandit:<id>`).
 */

/** Eşkıyaların dünyadan istediği (RegionWorld karşılar; testte sahte). */
export interface BanditWorld {
  heightAt(x: number, z: number): number;
  slopeDegAt(x: number, z: number): number;
  isSea(x: number, z: number): boolean;
}

/** Her sabit adımda Game'den gelen durum. */
export interface BanditContext {
  player: BanditPlayer;
  /** Oyun saati (0–24) ve karanlık (0 gündüz – 1 gece). */
  hour: number;
  darkness: number;
  /** Oyun saatinin mutlak saniyesi (`(gün · 24 + saat) · 3600`). */
  now: number;
  /** İsabetlerin uygulandığı hedefler (oyuncu, canlılar; eşkıyaların kendisi hariç tutulur). */
  targets: TargetProvider;
  /** Avlanabilecek karacalar (hedef kimliğiyle). */
  prey(x: number, z: number, r: number): ReadonlyArray<{ id: string; x: number; z: number }>;
  obstacles?: ObstacleQuery;
}

/** Bir eşkıyanın simülasyon kaydı. */
interface Member {
  id: number;
  camp: Camp | null;
  index: number;
  name: string;
  brain: BanditBrain;
  rng: Random;
  y: number;
  speed: number;
  stride: number;
  hitFlash: number;
  searched: boolean;
  /** Bu adımda duyulan gürültü. */
  noise: { x: number; z: number } | null;
  /** Kampsız (dev/test) eşkıyanın sabit etkinliği. */
  freeActivity: BanditActivity;
}

/** Bir kampın oturumluk hafızası: ölen/kaçan üyeler (kayda girmez; temizlenen kamp girer). */
interface CampMemory {
  gone: Map<number, { x: number; z: number; yaw: number; dead: boolean; searched: boolean }>;
}

/** Eşkıya kimliği: kamp · 8 + sıra (serbest eşkıyalar büyük ayrı aralıkta). */
const MEMBERS_PER_CAMP = 8;
const FREE_ID_BASE = 2 ** 40;
const TURN_RATE = 6;
/** Etkinleşme denetimi aralığı (sn). */
const ACTIVATION_SECONDS = 0.5;
/** Vurulan eşkıyanın çevresine (kamp arkadaşlarına) duyurduğu yarıçap (oyun m). */
const HURT_CALL_RADIUS = 30;
/** Gövde: hedef silindiri. */
export const BANDIT_RADIUS = 0.38;
export const BANDIT_HEIGHT = 1.8;
const SECONDS_PER_DAY = 86_400;
export const BANDIT_TARGET_PREFIX = 'bandit:';

export class BanditSystem implements TargetProvider {
  private readonly members = new Map<number, Member>();
  private readonly memory = new Map<number, CampMemory>();
  private readonly layouts = new Map<number, CampLayout>();
  /** Temizlenen kamplar → temizlendiği an (mutlak oyun sn). */
  private readonly cleared = new Map<number, number>();
  /** Kamp sandıkları (ilk erişimde zarla dolar). */
  private readonly chests = new Map<number, ItemStack[]>();
  /** Kamp sandığının dönemi (yeniden dolunca artar). */
  private readonly epochs = new Map<number, number>();
  private readonly campById = new Map<number, Camp>();
  private sinceActivation = Infinity;
  private nextFreeId = FREE_ID_BASE;
  private enabledFlag = true;
  private lastNow = 0;

  constructor(
    private readonly events: EventBus<GameEvents>,
    readonly camps: readonly Camp[],
    private readonly world: BanditWorld,
    private readonly seed: number = BANDITS.seed,
  ) {
    for (const camp of camps) this.campById.set(camp.id, camp);
  }

  get enabled(): boolean {
    return this.enabledFlag;
  }

  /** Ayar (`Settings.bandits`): kapatılınca bütün eşkıyalar kalkar ve yenisi doğmaz. */
  setEnabled(on: boolean): void {
    this.enabledFlag = on;
    if (!on) this.members.clear();
  }

  /** Canlı eşkıyaları ve oturum hafızasını siler (yükleme/yeni oyun); kayıtlı durum (`loadSave`) ayrıca gelir. */
  clear(): void {
    this.members.clear();
    this.memory.clear();
    this.sinceActivation = Infinity;
  }

  layoutOf(campId: number): CampLayout | null {
    const camp = this.campById.get(campId);
    if (!camp) return null;
    let layout = this.layouts.get(campId);
    if (!layout) {
      layout = campLayout(camp);
      this.layouts.set(campId, layout);
    }
    return layout;
  }

  isCleared(campId: number): boolean {
    return this.cleared.has(campId);
  }

  /** (x, z)'ye en yakın kamp (`filter` uyanlardan); yoksa null. */
  nearestCamp(x: number, z: number, filter: (camp: Camp) => boolean = () => true): Camp | null {
    let best: Camp | null = null;
    let bestD = Infinity;
    for (const camp of this.camps) {
      if (!filter(camp)) continue;
      const d = Math.hypot(camp.x - x, camp.z - z);
      if (d < bestD) {
        best = camp;
        bestD = d;
      }
    }
    return best;
  }

  /** Şu an dünyadaki eşkıyalar (çizim, etkileşim). */
  views(): BanditView[] {
    return [...this.members.values()].map((m) => ({
      id: m.id,
      camp: m.camp?.id ?? -1,
      name: m.name,
      role: m.brain.role,
      weapon: m.brain.weapon,
      x: m.brain.x,
      y: m.y,
      z: m.brain.z,
      yaw: m.brain.yaw,
      speed: m.speed,
      state: m.brain.state,
      health: m.brain.health,
      maxHealth: m.brain.maxHealth,
      stride: m.stride,
      hitFlash: m.hitFlash,
      searched: m.searched,
    }));
  }

  get(id: number): BanditView | null {
    return this.views().find((v) => v.id === id) ?? null;
  }

  /** Gürültü (`noise:made`): yarıçap içindeki eşkıyalar duyar (uyuyan uyanır). */
  hearNoise(x: number, z: number, radius: number): void {
    for (const m of this.members.values()) {
      if (Math.hypot(m.brain.x - x, m.brain.z - z) <= radius) m.noise = { x, z };
    }
  }

  // ── Hedef sağlayıcısı ──

  targetsNear(x: number, z: number, r: number): HitTarget[] {
    const out: HitTarget[] = [];
    for (const m of this.members.values()) {
      if (m.brain.state === 'dead') continue;
      if (Math.hypot(m.brain.x - x, m.brain.z - z) > r + BANDIT_RADIUS) continue;
      out.push({
        id: `${BANDIT_TARGET_PREFIX}${m.id}`,
        kind: 'bandit',
        x: m.brain.x,
        y: m.y,
        z: m.brain.z,
        radius: BANDIT_RADIUS,
        height: m.brain.state === 'surrender' ? BANDIT_HEIGHT * 0.9 : BANDIT_HEIGHT,
      });
    }
    return out;
  }

  applyHit(id: string, damage: number, from: HitSource): void {
    if (!id.startsWith(BANDIT_TARGET_PREFIX)) return;
    this.damage(Number(id.slice(BANDIT_TARGET_PREFIX.length)), damage, from);
  }

  /** Eşkıyaya hasar verir; öldüyse true, eşkıya yoksa/ölüyse null. */
  damage(id: number, amount: number, from: { x: number; z: number }): boolean | null {
    const m = this.members.get(id);
    if (!m || m.brain.state === 'dead' || !(amount > 0)) return null;
    m.brain.health = Math.max(0, m.brain.health - amount);
    m.brain.sinceHurt = 0;
    m.brain.lastSeen = { x: from.x, z: from.z };
    m.hitFlash = 1;
    const killed = m.brain.health <= 0;
    if (killed) {
      m.brain.state = 'dead';
      m.brain.stateTime = 0;
      m.speed = 0;
      this.remember(m, true);
    }
    this.events.emit('bandit:damaged', { id, amount, killed });
    // Kamp arkadaşları duyar (yakın dövüş sessizdir, ama vurulan bağırır).
    this.hearNoise(m.brain.x, m.brain.z, HURT_CALL_RADIUS);
    this.checkCleared(m.camp);
    return killed;
  }

  // ── Teslim, bağışlama, üst arama, sandık ──

  /** Teslim olan eşkıyayı bağışlar: silahını bırakır (döner) ve kaçar; teslim olmamışsa null. */
  spare(id: number): BanditWeapon | null {
    const m = this.members.get(id);
    if (!m || m.brain.state !== 'surrender') return null;
    m.brain.state = 'flee';
    m.brain.stateTime = 0;
    this.remember(m, false);
    this.events.emit('bandit:spared', { id, weapon: m.brain.weapon });
    this.checkCleared(m.camp);
    return m.brain.weapon;
  }

  /** Ölü eşkıyanın ganimeti (deterministik); aranmışsa boş. */
  lootOf(id: number): ItemStack[] {
    const m = this.members.get(id);
    if (!m || m.brain.state !== 'dead' || m.searched) return [];
    return rollBanditLoot(id, m.brain.weapon, this.seed);
  }

  /**
   * Ölü eşkıyanın üstünü arar: ganimet envantere atomik eklenir (hepsi sığmazsa hiçbiri). Sonuç: `ok`, `full`, `empty`
   * (aranmış) ya da `none` (yok).
   */
  search(id: number, inventory: Inventory): 'ok' | 'full' | 'empty' | 'none' {
    const m = this.members.get(id);
    if (!m || m.brain.state !== 'dead') return 'none';
    if (m.searched) return 'empty';
    const items = this.lootOf(id);
    if (!fitsAll(inventory, items)) return 'full';
    for (const s of items) inventory.add(s.id, s.count);
    m.searched = true;
    if (m.camp) {
      const mem = this.memory.get(m.camp.id)?.gone.get(m.index);
      if (mem) mem.searched = true;
    }
    this.events.emit('bandit:searched', { id, items });
    return 'ok';
  }

  /** Kamp sandığının içeriği (salt okunur kopya). */
  chestOf(campId: number): ItemStack[] {
    return this.chest(campId).map((s) => ({ ...s }));
  }

  /** Sandıktan sığan her şeyi envantere alır; alınanları döner (sığmayan sandıkta kalır). */
  takeFromChest(campId: number, inventory: Inventory): ItemStack[] {
    const chest = this.chest(campId);
    const taken: ItemStack[] = [];
    const left: ItemStack[] = [];
    for (const stack of chest) {
      const rest = inventory.add(stack.id, stack.count);
      if (rest < stack.count) taken.push({ id: stack.id, count: stack.count - rest });
      if (rest > 0) left.push({ id: stack.id, count: rest });
    }
    this.chests.set(campId, left);
    this.events.emit('camp:looted', { camp: campId, items: taken, left: left.length });
    return taken;
  }

  /** Eşyaları (x, z)'ye en yakın kampın sandığına koyar (yankesici kaçınca); kamp yoksa null. */
  depositToNearestChest(items: readonly ItemStack[], x: number, z: number): number | null {
    const camp = this.nearestCamp(x, z, (c) => !this.cleared.has(c.id)) ?? this.nearestCamp(x, z);
    if (!camp) return null;
    const chest = this.chest(camp.id);
    for (const s of items) {
      const same = chest.find((c) => c.id === s.id);
      if (same) same.count += s.count;
      else chest.push({ ...s });
    }
    return camp.id;
  }

  /** Dev/test: (x, z)'de kampsız (serbest) bir eşkıya doğurur. */
  spawnAt(x: number, z: number, weapon: BanditWeapon, activity: BanditActivity = 'patrol'): number {
    const id = this.nextFreeId++;
    const rng = createRandom(seedFrom(this.seed, id % 2 ** 31));
    const yaw = rng.next() * Math.PI * 2;
    this.members.set(id, {
      id,
      camp: null,
      index: 0,
      name: banditName(rng, 'member'),
      brain: createBrain(x, z, yaw, weapon, 'member', activity),
      rng,
      y: this.world.heightAt(x, z),
      speed: 0,
      stride: 0,
      hitFlash: 0,
      searched: false,
      noise: null,
      freeActivity: activity,
    });
    return id;
  }

  // ── Kayıt ──

  toSave(): Omit<BanditsSave, 'stolen'> {
    return {
      cleared: [...this.cleared]
        .map(([camp, at]) => ({ camp, at }))
        .sort((a, b) => a.camp - b.camp),
      chests: [...this.chests]
        .map(([camp, items]) => ({ camp, items: items.map((s) => ({ ...s })) }))
        .sort((a, b) => a.camp - b.camp),
    };
  }

  /** Kayıttan yükler: canlı eşkıyalar ve oturum hafızası silinir; temizlenen kamplar boş kalır. */
  loadSave(save: Pick<BanditsSave, 'cleared' | 'chests'>): void {
    this.clear();
    this.cleared.clear();
    this.chests.clear();
    this.epochs.clear();
    for (const { camp, at } of save.cleared) this.cleared.set(camp, at);
    for (const { camp, items } of save.chests)
      this.chests.set(
        camp,
        items.map((s) => ({ ...s })),
      );
  }

  // ── Sabit adım ──

  update(dt: number, ctx: BanditContext): void {
    this.lastNow = ctx.now;
    if (!this.enabledFlag) return;
    this.reoccupy(ctx.now);
    this.sinceActivation += dt;
    if (this.sinceActivation >= ACTIVATION_SECONDS) {
      this.sinceActivation = 0;
      this.activate(ctx.player);
    }
    for (const m of [...this.members.values()]) this.updateMember(m, dt, ctx);
  }

  private updateMember(m: Member, dt: number, ctx: BanditContext): void {
    m.hitFlash = Math.max(0, m.hitFlash - dt * 4);
    if (m.brain.state === 'dead') return;
    const senses = this.sensesFor(m, ctx);
    m.noise = null;
    const result = stepBandit(m.brain, senses, dt, m.rng);
    m.brain = result.next;
    for (const action of result.actions) this.act(m, action, ctx);
    this.move(m, result.intent, dt, ctx.obstacles ?? NO_OBSTACLES);
    // Bağışlanıp kaçan eşkıya süre dolunca ya da uzaklaşınca kaybolur.
    if (m.brain.state === 'flee') {
      const far =
        Math.hypot(m.brain.x - ctx.player.x, m.brain.z - ctx.player.z) > BANDITS.activeRadius;
      if (m.brain.stateTime >= BANDITS.fleeSeconds || far) this.members.delete(m.id);
    }
  }

  private sensesFor(m: Member, ctx: BanditContext): BanditSenses {
    const b = m.brain;
    const sleeping = b.state === 'sleep';
    const player = perceivePlayer(
      { x: b.x, z: b.z, yaw: b.yaw, eyeY: m.y + BANDITS.eyeHeight },
      ctx.player,
      ctx.darkness,
      sleeping,
      (from, to) => this.lineOfSight(from, to),
    );
    const camp = m.camp;
    const layout = camp ? this.layoutOf(camp.id) : null;
    const activity = camp
      ? scheduledActivity(b.role, m.index, camp.id, ctx.hour, camp.ambush !== null)
      : m.freeActivity;
    const center = camp ? { x: camp.x, z: camp.z } : { x: b.x, z: b.z };
    let home = { x: b.x, z: b.z, yaw: b.yaw };
    if (layout && camp) {
      if (activity === 'guard') home = layout.post;
      else if (activity === 'ambush' && camp.ambush) home = { ...camp.ambush, yaw: camp.yaw };
      else if (activity === 'sleep') {
        const tent = layout.tents[m.index % layout.tents.length]!;
        home = { x: tent.x, z: tent.z, yaw: tent.yaw };
      } else home = layout.seats[m.index % layout.seats.length]!;
    }
    let prey: BanditSenses['prey'] = null;
    if (b.state === 'hunt' && !isMeleeWeapon(b.weapon)) {
      let best = Infinity;
      for (const p of ctx.prey(b.x, b.z, BANDITS.huntRange)) {
        const dist = Math.hypot(p.x - b.x, p.z - b.z);
        if (dist < best) {
          best = dist;
          prey = { ...p, dist };
        }
      }
    }
    return { player, noise: m.noise, activity, home, camp: center, prey };
  }

  /** Arazi görüş hattı (`rayTerrain`): gözden hedefe arazi araya girmiyor mu? */
  private lineOfSight(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return true;
    const dir = { x: dx / length, y: dy / length, z: dz / length };
    return rayTerrain(from, dir, length, (x, z) => this.world.heightAt(x, z)) === null;
  }

  private act(m: Member, action: BanditAction, ctx: BanditContext): void {
    const b = m.brain;
    const from: HitSource = { x: b.x, y: m.y, z: b.z, by: 'bandit', weapon: b.weapon };
    switch (action.type) {
      case 'noticed':
        this.events.emit('bandit:noticed', { id: m.id, name: m.name });
        break;
      case 'surrender':
        this.events.emit('bandit:surrendered', { id: m.id, name: m.name });
        break;
      case 'strike':
        ctx.targets.applyHit('player', action.damage, from);
        break;
      case 'shoot':
        this.shoot(m, action, ctx, from);
        break;
    }
  }

  /** Atış: nişan hatasıyla (hareket ederken iki kat) `fireShot`; saçmalı tüfek tane tane. Gürültü yayılır. */
  private shoot(
    m: Member,
    action: Extract<BanditAction, { type: 'shoot' }>,
    ctx: BanditContext,
    from: HitSource,
  ): void {
    const b = m.brain;
    if (isMeleeWeapon(b.weapon)) return;
    const weapon = b.weapon;
    const spec = RANGED.weapons[weapon];
    const origin = { x: b.x, y: m.y + 1.5, z: b.z };
    const targetY =
      action.target === 'player'
        ? ctx.player.y + 1.2
        : this.world.heightAt(action.x, action.z) + 0.6;
    const dx = action.x - origin.x;
    const dz = action.z - origin.z;
    const horizontal = Math.hypot(dx, dz);
    const baseYaw = Math.atan2(dz, dx);
    const basePitch = Math.atan2(targetY - origin.y, horizontal);
    const errorDeg = BANDITS.ranged[weapon].aimErrorDeg * (m.speed > 0.2 ? 2 : 1) + spec.spreadDeg;
    // Atanın kendisi ve diğer eşkıyalar vurulmaz: hedefler eşkıyasız süzülür.
    const targets = {
      targetsNear: (x: number, z: number, r: number) =>
        ctx.targets.targetsNear(x, z, r).filter((t) => t.kind !== 'bandit'),
    };
    for (let i = 0; i < spec.pellets; i++) {
      const yaw = baseYaw + ((m.rng.next() * 2 - 1) * errorDeg * Math.PI) / 180;
      const pitch = basePitch + ((m.rng.next() * 2 - 1) * errorDeg * Math.PI) / 180;
      const dir = {
        x: Math.cos(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: Math.sin(yaw) * Math.cos(pitch),
      };
      const shot = fireShot(origin, dir, weapon, {
        heightAt: (x, z) => this.world.heightAt(x, z),
        targets,
      });
      if (shot.hit) ctx.targets.applyHit(shot.hit.id, spec.damage * BANDITS.damageScale, from);
    }
    this.events.emit('noise:made', {
      x: b.x,
      z: b.z,
      radius: RANGED.noiseRadius[weapon],
      source: 'bandit',
    });
  }

  /** Kinematik yürüyüş: yürünebilir (eğim, deniz, engel) değilse yana sapar, olmazsa durur. */
  private move(m: Member, intent: BanditIntent, dt: number, obstacles: ObstacleQuery): void {
    const b = m.brain;
    const face = intent.speed > 0 ? intent.heading : (intent.face ?? b.yaw);
    b.yaw = turnToward(b.yaw, face, TURN_RATE * dt);
    m.speed = 0;
    if (intent.speed <= 0) return;
    const stepLen = intent.speed * dt;
    for (const offset of [0, 0.6, -0.6, 1.2, -1.2]) {
      const heading = intent.heading + offset;
      const nx = b.x - Math.sin(heading) * stepLen;
      const nz = b.z - Math.cos(heading) * stepLen;
      if (!this.walkable(nx, nz)) continue;
      if (obstacles.blocked(b.x, b.z, nx, nz, BANDIT_RADIUS)) continue;
      b.x = nx;
      b.z = nz;
      m.y = this.world.heightAt(nx, nz);
      m.speed = intent.speed;
      m.stride += stepLen;
      if (offset !== 0) b.yaw = turnToward(b.yaw, heading, TURN_RATE * dt);
      return;
    }
  }

  private walkable(x: number, z: number): boolean {
    return !this.world.isSea(x, z) && this.world.slopeDegAt(x, z) <= 45;
  }

  /** Oyuncuya yakın kampları canlandırır, uzaktakileri kaldırır. */
  private activate(player: { x: number; z: number }): void {
    for (const camp of this.camps) {
      const d = Math.hypot(camp.x - player.x, camp.z - player.z);
      const active = [...this.members.values()].some((m) => m.camp?.id === camp.id);
      if (d <= BANDITS.activeRadius && !active) this.spawnCamp(camp);
      if (d > BANDITS.activeRadius + BANDITS.despawnMargin && active) {
        for (const m of [...this.members.values()])
          if (m.camp?.id === camp.id) this.members.delete(m.id);
      }
    }
    // Serbest (dev) eşkıyalar da çok uzaklaşınca kalkar.
    for (const m of [...this.members.values()]) {
      if (m.camp) continue;
      const d = Math.hypot(m.brain.x - player.x, m.brain.z - player.z);
      if (d > BANDITS.activeRadius + BANDITS.despawnMargin) this.members.delete(m.id);
    }
  }

  private spawnCamp(camp: Camp): void {
    const layout = this.layoutOf(camp.id)!;
    const memory = this.memoryOf(camp.id);
    const random = createRandom(seedFrom(this.seed, camp.id, 3));
    for (let index = 0; index < camp.members; index++) {
      const role: BanditRole = index === 0 ? 'leader' : index === 1 ? 'guard' : 'member';
      const weapon: BanditWeapon =
        role === 'leader' ? camp.leaderWeapon : pickWeighted(random, BANDITS.weapons);
      const name = banditName(random, role);
      const id = camp.id * MEMBERS_PER_CAMP + index;
      const gone = memory.gone.get(index);
      if (gone && !gone.dead) continue; // bağışlanıp kaçan geri gelmez
      if (!gone && this.cleared.has(camp.id)) continue; // temizlenmiş kampta yalnızca cesetler (oturum hafızası)
      const seat = layout.seats[index % layout.seats.length]!;
      const x = gone?.x ?? seat.x;
      const z = gone?.z ?? seat.z;
      const brain = createBrain(x, z, gone?.yaw ?? seat.yaw, weapon, role, 'sit');
      if (gone?.dead) {
        brain.state = 'dead';
        brain.health = 0;
      }
      this.members.set(id, {
        id,
        camp,
        index,
        name,
        brain,
        rng: createRandom(seedFrom(this.seed, camp.id, index, 4)),
        y: this.world.heightAt(x, z),
        speed: 0,
        stride: 0,
        hitFlash: 0,
        searched: gone?.searched ?? false,
        noise: null,
        freeActivity: 'sit',
      });
    }
  }

  private memoryOf(campId: number): CampMemory {
    let memory = this.memory.get(campId);
    if (!memory) {
      memory = { gone: new Map() };
      this.memory.set(campId, memory);
    }
    return memory;
  }

  private remember(m: Member, dead: boolean): void {
    if (!m.camp) return;
    this.memoryOf(m.camp.id).gone.set(m.index, {
      x: m.brain.x,
      z: m.brain.z,
      yaw: m.brain.yaw,
      dead,
      searched: m.searched,
    });
  }

  private checkCleared(camp: Camp | null): void {
    if (!camp || this.cleared.has(camp.id)) return;
    const memory = this.memoryOf(camp.id);
    if (memory.gone.size < camp.members) return;
    this.cleared.set(camp.id, this.lastNow);
    this.events.emit('camp:cleared', { camp: camp.id });
  }

  /** Temizlendikten `reoccupyDays` sonra kamp yeniden dolar: yeni üyeler, yeni sandık. */
  private reoccupy(now: number): void {
    for (const [campId, at] of this.cleared) {
      if (now - at < BANDITS.reoccupyDays * SECONDS_PER_DAY) continue;
      this.cleared.delete(campId);
      this.memory.delete(campId);
      const epoch = Math.floor(now / SECONDS_PER_DAY);
      this.epochs.set(campId, epoch);
      this.chests.set(campId, rollCampChest(campId, epoch, this.seed));
      for (const m of [...this.members.values()])
        if (m.camp?.id === campId) this.members.delete(m.id);
    }
  }

  private chest(campId: number): ItemStack[] {
    let chest = this.chests.get(campId);
    if (!chest) {
      chest = rollCampChest(campId, this.epochs.get(campId) ?? 0, this.seed);
      this.chests.set(campId, chest);
    }
    return chest;
  }
}

/** `items` envantere hep birlikte sığar mı (deneme kopyasında)? */
export function fitsAll(inventory: Inventory, items: readonly ItemStack[]): boolean {
  const trial = Inventory.fromJSON(inventory.toJSON(), {
    slots: inventory.slotCount,
    maxWeightG: inventory.maxWeightG,
  });
  return items.every((s) => trial.add(s.id, s.count) === 0);
}

function turnToward(from: number, to: number, maxStep: number): number {
  let delta = to - from;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}
