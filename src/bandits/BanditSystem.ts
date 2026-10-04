import { BANDITS, DRONE, GANGS, RANGED } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { rayBox, type SolidQuery } from '../combat/ballistics';
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
  type BanditState,
  type BanditView,
  type BanditWeapon,
} from './kinds';
import { rollBanditLoot, rollCampChest } from './loot';
import {
  gangFactionsPresent,
  gangHours,
  gangMemberId,
  gangPresent,
  gangRoster,
  gangSpot,
  type GangFaction,
  type GangSite,
} from './gangs';
import { banditName, gangName } from './names';
import { campStyle, gangStyle, type BanditStyle } from './styles';
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
  /** Faz 11 (F): uçan drone (yoksa null); alçak uçarsa görenler ateş eder. */
  drone?: { x: number; y: number; z: number } | null;
  /** Mermiyi ve görüşü kesen katılar (bina duvarları, oyuncu yapıları); yoksa yalnızca arazi keser. */
  solids?: SolidQuery;
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
  /** Faz 11 (F): drone'a iki atış arası bekleme (sn). */
  droneCooldown: number;
  /** Sokak çetesi üyesi: yer sırası ve çete (0/1); kamp eşkıyasında null. */
  gang: { site: number; faction: GangFaction } | null;
  /** Bu adımda çatıştığı rakip çete üyesi (yoksa null: hedef oyuncu). */
  fight: number | null;
  /** Sokak çetesi: oyuncuyu hedef aldığı bildirildi mi (görüşten çıkınca sıfırlanır)? */
  playerNoticed: boolean;
  /** Battle Royale yarışmacısının maç kimliği (yarışmacı değilse null): herkes herkese rakiptir. */
  contestant: number | null;
  /** Yarışmacının sakin hâldeki hedefi (`travel`); yoksa yerinde durur. */
  travel: { x: number; z: number; speed: number } | null;
  /** Nişan hatası çarpanı (Battle Royale zorluğu; 1 = eşkıya). */
  aimScale: number;
}

/** Battle Royale yarışmacısını doğurma bilgisi. */
export interface ContestantSpawn {
  contestant: number;
  name: string;
  x: number;
  z: number;
  yaw: number;
  weapon: BanditWeapon;
  health: number;
  maxHealth: number;
  /** Nişan hatası çarpanı (zorluk). */
  aimScale: number;
}

/** Yarışmacının anlık durumu (kademe geçişi, bölge hasarı için). */
export interface ContestantState {
  contestant: number;
  x: number;
  z: number;
  health: number;
  weapon: BanditWeapon;
  state: BanditState;
}

/** Bir kampın oturumluk hafızası: ölen/kaçan üyeler (kayda girmez; temizlenen kamp girer). */
interface CampMemory {
  gone: Map<number, { x: number; z: number; yaw: number; dead: boolean; searched: boolean }>;
}

/** Faz 11 (F): drone'u izleyebilen durumlar (uyanık, oyuncuyla çatışmada olmayan). */
const DRONE_WATCH_STATES: ReadonlySet<string> = new Set([
  'sit',
  'guard',
  'patrol',
  'hunt',
  'wood',
  'ambush',
  'alert',
]);

/** Eşkıya kimliği: kamp · 8 + sıra (serbest eşkıyalar ve yarışmacılar büyük ayrı aralıklarda). */
const MEMBERS_PER_CAMP = 8;
const FREE_ID_BASE = 2 ** 40;
/** Battle Royale yarışmacısının eşkıya kimliği = taban + maç kimliği. */
export const CONTESTANT_ID_BASE = 2 ** 41;
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
  /** Oturumda ilk gözlenen oyun zamanı (çete ısınma payı bundan sayılır). */
  private startNow: number | null = null;
  /** Bugün sokakta temizlenen/dağılan çeteler (yer sırası → gün) ve çatışma bildirilenler (`yer:gün`). */
  private readonly gangDone = new Map<number, number>();
  private readonly gangClashed = new Set<string>();
  /** Üstü kısmen aranmış cesetlerin kalan ganimeti (eşkıya kimliği → liste; ganimet panelinden alınan düşer). */
  private readonly corpseLeft = new Map<number, ItemStack[]>();
  /** Görünüm çeşidi önbelleği (kimlik:silah:rol → çeşit). */
  private readonly styles = new Map<string, BanditStyle>();
  /** Bu adımın katıları (görüş hattı); `update` doldurur. */
  private solids: SolidQuery | null = null;
  /** Battle Royale ateşkesi: yarışmacılar kimseyi (oyuncu dahil) hedef almaz. */
  private truce = false;
  /** Kamplar, sokak çeteleri ve serbest eşkıyalar (Battle Royale maçında kapalı; yarışmacılar etkilenmez). */
  private wildEnabled = true;
  /** Battle Royale: ölü yarışmacının üstündeki ganimet (maç kimliği, silah); verilmezse eşkıya ganimeti. */
  private contestantLootFn: ((contestant: number, weapon: BanditWeapon) => ItemStack[]) | null =
    null;

  constructor(
    private readonly events: EventBus<GameEvents>,
    readonly camps: readonly Camp[],
    private readonly world: BanditWorld,
    private readonly seed: number = BANDITS.seed,
    /** Şehirlerdeki sokak çetesi yerleri (`bandits/gangs.ts`); verilmezse çete yok. */
    private readonly gangSites: readonly GangSite[] = [],
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
    this.startNow = null;
    this.gangDone.clear();
    this.gangClashed.clear();
    this.corpseLeft.clear();
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
      faction: m.gang?.faction ?? -1,
      style: this.styleOf(m),
      ...(m.contestant !== null ? { contestant: m.contestant } : {}),
    }));
  }

  /** Üyenin görünüm çeşidi (kimlik/silah/rolden deterministik; önbellekli). */
  private styleOf(m: Member): BanditStyle {
    const key = `${m.id}:${m.brain.weapon}:${m.brain.role}:${m.gang ? 1 : 0}`;
    let style = this.styles.get(key);
    if (!style) {
      style = m.gang
        ? gangStyle(m.id, m.brain.weapon, m.brain.role)
        : campStyle(m.id, m.brain.weapon, m.brain.role);
      this.styles.set(key, style);
    }
    return style;
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
    const source = from as Partial<HitSource>;
    this.events.emit('bandit:damaged', {
      id,
      amount,
      killed,
      ...(source.by ? { by: source.by } : {}),
      ...(source.attacker !== undefined ? { attacker: source.attacker } : {}),
      ...(source.weapon ? { weapon: source.weapon } : {}),
    });
    // Kamp arkadaşları duyar (yakın dövüş sessizdir, ama vurulan bağırır).
    this.hearNoise(m.brain.x, m.brain.z, HURT_CALL_RADIUS);
    this.checkCleared(m.camp);
    if (killed) this.checkGangDone(m.gang);
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
    return this.rollLoot(m);
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

  /**
   * Ganimet paneli için ölü eşkıyanın kalan ganimeti (değiştirilebilir liste; ilk açılışta zarlanır, sonra aynı liste).
   * Ölü değilse ya da üstü tamamen arandıysa null.
   */
  corpseLoot(id: number): ItemStack[] | null {
    const m = this.members.get(id);
    if (!m || m.brain.state !== 'dead' || m.searched) return null;
    let list = this.corpseLeft.get(id);
    if (!list) {
      list = this.rollLoot(m);
      this.corpseLeft.set(id, list);
    }
    return list;
  }

  /**
   * Ganimet panelinden bir şey alındıktan (ya da panel açıldıktan) sonra: liste boşaldıysa ceset aranmış sayılır.
   * `taken` alınanlar (bildirim için `bandit:searched`; hiçbir şey alınmadıysa ve ceset boş değilse olay yok).
   */
  commitCorpse(id: number, taken: readonly ItemStack[]): void {
    const m = this.members.get(id);
    if (!m || m.searched) return;
    const list = this.corpseLeft.get(id) ?? [];
    const emptied = list.length === 0;
    if (emptied) {
      m.searched = true;
      this.corpseLeft.delete(id);
      if (m.camp) {
        const mem = this.memory.get(m.camp.id)?.gone.get(m.index);
        if (mem) mem.searched = true;
      }
    }
    if (taken.length > 0 || emptied) this.events.emit('bandit:searched', { id, items: [...taken] });
  }

  /** Ganimet paneli için kamp sandığının değiştirilebilir listesi. */
  chestLoot(campId: number): ItemStack[] {
    return this.chest(campId);
  }

  /** Ganimet panelinden sandıktan `taken` alındı (bildirim). */
  commitChest(campId: number, taken: readonly ItemStack[]): void {
    if (taken.length === 0) return;
    this.events.emit('camp:looted', {
      camp: campId,
      items: [...taken],
      left: this.chest(campId).length,
    });
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
      droneCooldown: 0,
      gang: null,
      fight: null,
      playerNoticed: false,
      contestant: null,
      travel: null,
      aimScale: 1,
    });
    return id;
  }

  // ── Battle Royale yarışmacıları ──

  /** Yarışmacıyı (oyuncuya yakın kademeye geçen NPC) doğurur; aynı kimlikli varsa yenisiyle değişir. */
  spawnContestant(spec: ContestantSpawn): number {
    const id = CONTESTANT_ID_BASE + spec.contestant;
    const brain = createBrain(spec.x, spec.z, spec.yaw, spec.weapon, 'member', 'travel');
    brain.maxHealth = spec.maxHealth;
    brain.health = Math.min(spec.health, spec.maxHealth);
    brain.noSurrender = true;
    this.members.set(id, {
      id,
      camp: null,
      index: 0,
      name: spec.name,
      brain,
      rng: createRandom(seedFrom(this.seed, spec.contestant, 7)),
      y: this.world.heightAt(spec.x, spec.z),
      speed: 0,
      stride: 0,
      hitFlash: 0,
      searched: false,
      noise: null,
      freeActivity: 'travel',
      droneCooldown: 0,
      gang: null,
      fight: null,
      playerNoticed: false,
      contestant: spec.contestant,
      travel: null,
      aimScale: spec.aimScale,
    });
    return id;
  }

  private contestantMember(contestant: number): Member | null {
    const m = this.members.get(CONTESTANT_ID_BASE + contestant);
    return m && m.contestant === contestant ? m : null;
  }

  /** Yarışmacının durumu (yoksa null; ölüyse `state: 'dead'`). */
  contestantState(contestant: number): ContestantState | null {
    const m = this.contestantMember(contestant);
    if (!m) return null;
    const b = m.brain;
    return { contestant, x: b.x, z: b.z, health: b.health, weapon: b.weapon, state: b.state };
  }

  /** Yarışmacıları (canlı ya da ölü) listeler. */
  contestants(): ContestantState[] {
    const out: ContestantState[] = [];
    for (const m of this.members.values()) {
      if (m.contestant === null) continue;
      const b = m.brain;
      out.push({
        contestant: m.contestant,
        x: b.x,
        z: b.z,
        health: b.health,
        weapon: b.weapon,
        state: b.state,
      });
    }
    return out;
  }

  /** Yarışmacının sakin hâldeki hedefi (null: yerinde durur). */
  setContestantGoal(
    contestant: number,
    goal: { x: number; z: number; speed: number } | null,
  ): void {
    const m = this.contestantMember(contestant);
    if (m) m.travel = goal;
  }

  /** Battle Royale: ölü yarışmacının ganimet kaynağı (null: eşkıya ganimeti). */
  setContestantLoot(fn: ((contestant: number, weapon: BanditWeapon) => ItemStack[]) | null): void {
    this.contestantLootFn = fn;
  }

  /** Üyenin ölünce üstünden çıkan ganimet (deterministik). */
  private rollLoot(m: Member): ItemStack[] {
    if (m.contestant !== null && this.contestantLootFn)
      return this.contestantLootFn(m.contestant, m.brain.weapon);
    return rollBanditLoot(m.id, m.brain.weapon, this.seed);
  }

  /**
   * Battle Royale: kampları, sokak çetelerini ve serbest eşkıyaları açar/kapatır (kapatınca mevcutlar kalkar, yenisi
   * canlanmaz); yarışmacılar etkilenmez.
   */
  setWildEnabled(on: boolean): void {
    this.wildEnabled = on;
    if (on) return;
    for (const m of [...this.members.values()])
      if (m.contestant === null) this.members.delete(m.id);
  }

  /** Battle Royale ateşkesi (maç başı): açıkken yarışmacılar kimseye saldırmaz, yalnız yürür. */
  setContestantTruce(on: boolean): void {
    this.truce = on;
  }

  /** Yarışmacının silahını değiştirir (ganimetle yükselme). */
  setContestantWeapon(contestant: number, weapon: BanditWeapon): void {
    const m = this.contestantMember(contestant);
    if (m && m.brain.state !== 'dead') m.brain.weapon = weapon;
  }

  /**
   * Yarışmacıyı dünyadan kaldırır (uzak kademeye dönüş ya da cesedin kalkması); son durumunu döner. Yoksa null.
   */
  removeContestant(contestant: number): ContestantState | null {
    const state = this.contestantState(contestant);
    if (state) this.members.delete(CONTESTANT_ID_BASE + contestant);
    return state;
  }

  /**
   * Çevresel hasar (Battle Royale bölgesi): saldırgan yoktur — yarışmacı kimseyi aramaz, kaçmaz. Öldüyse true,
   * yarışmacı yoksa/ölüyse null. Olay `bandit:damaged` (`by: 'other'`).
   */
  drainContestant(contestant: number, amount: number): boolean | null {
    const m = this.contestantMember(contestant);
    if (!m || m.brain.state === 'dead' || !(amount > 0)) return null;
    m.brain.health = Math.max(0, m.brain.health - amount);
    const killed = m.brain.health <= 0;
    if (killed) {
      m.brain.state = 'dead';
      m.brain.stateTime = 0;
      m.speed = 0;
    }
    this.events.emit('bandit:damaged', { id: m.id, amount, killed, by: 'other' });
    return killed;
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
    this.startNow ??= ctx.now;
    this.solids = ctx.solids ?? null;
    this.reoccupy(ctx.now);
    this.sinceActivation += dt;
    if (this.sinceActivation >= ACTIVATION_SECONDS && this.wildEnabled) {
      this.sinceActivation = 0;
      this.activate(ctx.player);
      this.activateGangs(ctx);
    }
    for (const m of [...this.members.values()]) this.updateMember(m, dt, ctx);
  }

  private updateMember(m: Member, dt: number, ctx: BanditContext): void {
    m.hitFlash = Math.max(0, m.hitFlash - dt * 4);
    if (m.brain.state === 'dead') return;
    const senses = this.sensesFor(m, ctx);
    m.noise = null;
    const struckBefore = m.brain.struck;
    const result = stepBandit(m.brain, senses, dt, m.rng);
    m.brain = result.next;
    if (result.next.struck && !struckBefore && result.next.state === 'attack') {
      this.events.emit('bandit:swung', {
        id: m.id,
        weapon: result.next.weapon,
        x: result.next.x,
        y: m.y,
        z: result.next.z,
        yaw: result.next.yaw,
      });
    }
    for (const action of result.actions) this.act(m, action, ctx);
    this.watchDrone(m, dt, ctx);
    this.move(m, result.intent, dt, ctx.obstacles ?? NO_OBSTACLES);
    // Bağışlanıp kaçan eşkıya süre dolunca ya da uzaklaşınca kaybolur.
    if (m.brain.state === 'flee') {
      const far =
        Math.hypot(m.brain.x - ctx.player.x, m.brain.z - ctx.player.z) > BANDITS.activeRadius;
      if (m.brain.stateTime >= BANDITS.fleeSeconds || far) {
        this.members.delete(m.id);
        this.checkGangDone(m.gang);
      }
    }
  }

  private sensesFor(m: Member, ctx: BanditContext): BanditSenses {
    const b = m.brain;
    const sleeping = b.state === 'sleep';
    let player = perceivePlayer(
      { x: b.x, z: b.z, yaw: b.yaw, eyeY: m.y + BANDITS.eyeHeight },
      ctx.player,
      ctx.darkness,
      sleeping,
      (from, to) => this.lineOfSight(from, to),
    );
    // Sokak çetesi: görüş hattındaki en yakın rakip, oyuncudan yakınsa (ya da oyuncu görünmüyorsa) hedeftir; yapay
    // zekâ rakibi "oyuncu" yerine koyar, vuruş ve atış `act`/`shoot` içinde ona yönlenir.
    m.fight = null;
    if (m.contestant !== null && this.truce) player = null;
    if ((m.gang || (m.contestant !== null && !this.truce)) && !sleeping) {
      const rival = this.nearestRival(m);
      if (rival && (!player?.visible || rival.dist < player.dist)) {
        player = { x: rival.x, z: rival.z, dist: rival.dist, visible: true, heard: true };
        m.fight = rival.id;
        const site = m.gang ? this.gangSites[m.gang.site] : undefined;
        const key = `${m.gang?.site}:${Math.floor(ctx.now / SECONDS_PER_DAY)}`;
        if (site && !this.gangClashed.has(key)) {
          this.gangClashed.add(key);
          this.events.emit('gang:clash', { site: site.name });
        }
      }
    }
    if (m.gang || m.contestant !== null) {
      // Çete/yarışmacı oyuncuyu hedef aldığında bir kez uyarır (rakiple çatışma bildirim üretmez).
      const targetsPlayer = player?.visible === true && m.fight === null;
      if (targetsPlayer && !m.playerNoticed) {
        this.events.emit('bandit:noticed', {
          id: m.id,
          name: m.name,
          ...(m.gang ? { gang: true } : { contestant: true }),
        });
      }
      m.playerNoticed = targetsPlayer;
    }
    if (m.contestant !== null) {
      // Yarışmacı: sakin hâlde verilen hedefe yürür/koşar (hedef yoksa yerinde durur).
      const goal = m.travel;
      const home = goal ? { x: goal.x, z: goal.z, yaw: b.yaw } : { x: b.x, z: b.z, yaw: b.yaw };
      return {
        player,
        noise: m.noise,
        activity: 'travel',
        home,
        camp: home,
        prey: null,
        ...(goal ? { travelSpeed: goal.speed } : {}),
      };
    }
    const camp = m.camp;
    const layout = camp ? this.layoutOf(camp.id) : null;
    const activity = camp
      ? scheduledActivity(b.role, m.index, camp.id, ctx.hour, camp.ambush !== null)
      : m.freeActivity;
    const gangSite = m.gang ? this.gangSites[m.gang.site] : undefined;
    const center = camp
      ? { x: camp.x, z: camp.z }
      : gangSite && m.gang
        ? (gangSpot(gangSite, m.gang.faction) ?? gangSite.a)
        : { x: b.x, z: b.z };
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

  /**
   * Faz 11 (F): alçak uçan drone'u gören (uyanık, oyuncuyla çatışmada olmayan) tüfekli/tabancalı eşkıya ona ateş eder;
   * kılıçlılar yalnızca bakınır (sesi araştırır gibi).
   */
  private watchDrone(m: Member, dt: number, ctx: BanditContext): void {
    m.droneCooldown = Math.max(0, m.droneCooldown - dt);
    const drone = ctx.drone;
    const b = m.brain;
    if (!drone || !DRONE_WATCH_STATES.has(b.state)) return;
    if (drone.y - this.world.heightAt(drone.x, drone.z) > DRONE.shootableAltitude) return;
    const eye = { x: b.x, y: m.y + BANDITS.eyeHeight, z: b.z };
    const night = 1 + (BANDITS.nightSightFactor - 1) * Math.min(Math.max(ctx.darkness, 0), 1);
    if (Math.hypot(drone.x - b.x, drone.z - b.z, drone.y - eye.y) > BANDITS.sightRange * night)
      return;
    if (!this.lineOfSight(eye, drone)) return;
    if (isMeleeWeapon(b.weapon)) {
      if (b.state !== 'alert') m.noise = { x: drone.x, z: drone.z };
      return;
    }
    if (m.droneCooldown > 0) return;
    m.droneCooldown = DRONE.banditShotInterval;
    this.shootAt(m, drone.x, drone.y, drone.z, ctx, {
      x: b.x,
      y: m.y,
      z: b.z,
      by: 'bandit',
      weapon: b.weapon,
      attacker: m.id,
    });
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
    if (rayTerrain(from, dir, length, (x, z) => this.world.heightAt(x, z)) !== null) return false;
    // Bina duvarları ve oyuncu yapıları da görüşü keser (pencere delikleri açık).
    if (this.solids) {
      const boxes = this.solids.boxesNear((from.x + to.x) / 2, (from.z + to.z) / 2, length / 2 + 2);
      for (const box of boxes) {
        const t = rayBox(from, dir, box, length);
        if (t !== null && t < length - 0.05) return false;
      }
    }
    return true;
  }

  /**
   * `m`nin görüş hattındaki en yakın rakibi: sokak çetesinde aynı yerdeki başka çetenin üyesi, Battle Royale'de başka
   * herhangi bir yarışmacı (canlı ve savaşabilir).
   */
  private nearestRival(m: Member): { id: number; x: number; z: number; dist: number } | null {
    const b = m.brain;
    const eye = { x: b.x, y: m.y + BANDITS.eyeHeight, z: b.z };
    const sight = m.contestant !== null ? BANDITS.sightRange : GANGS.rivalSight;
    let best: { id: number; x: number; z: number; dist: number } | null = null;
    for (const o of this.members.values()) {
      if (o === m || !isRival(m, o)) continue;
      const s = o.brain.state;
      if (s === 'dead' || s === 'surrender' || s === 'flee') continue;
      const dist = Math.hypot(o.brain.x - b.x, o.brain.z - b.z);
      if (dist > sight || (best && dist >= best.dist)) continue;
      if (!this.lineOfSight(eye, { x: o.brain.x, y: o.y + 1.2, z: o.brain.z })) continue;
      best = { id: o.id, x: o.brain.x, z: o.brain.z, dist };
    }
    return best;
  }

  private act(m: Member, action: BanditAction, ctx: BanditContext): void {
    const b = m.brain;
    const from: HitSource = {
      x: b.x,
      y: m.y,
      z: b.z,
      by: 'bandit',
      weapon: b.weapon,
      attacker: m.id,
    };
    switch (action.type) {
      case 'noticed':
        // Sokak çetesinin/yarışmacının bildirimi `sensesFor`'dadır (rakibi fark etmek oyuncuya tehlike değildir).
        if (!m.gang && m.contestant === null)
          this.events.emit('bandit:noticed', { id: m.id, name: m.name });
        break;
      case 'surrender':
        this.events.emit('bandit:surrendered', { id: m.id, name: m.name });
        break;
      case 'strike':
        if (m.fight !== null) this.damage(m.fight, action.damage, from);
        else ctx.targets.applyHit('player', action.damage, from);
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
    const rival = m.fight !== null ? this.members.get(m.fight) : undefined;
    const targetY = rival
      ? rival.y + 1.2
      : action.target === 'player'
        ? ctx.player.y + 1.2
        : this.world.heightAt(action.x, action.z) + 0.6;
    this.shootAt(m, action.x, targetY, action.z, ctx, from);
  }

  /** (x, y, z) noktasına nişan hatasıyla atış (eşkıyalar hariç her hedefi vurabilir); gürültü yayılır. */
  private shootAt(
    m: Member,
    tx: number,
    targetY: number,
    tz: number,
    ctx: BanditContext,
    from: HitSource,
  ): void {
    const b = m.brain;
    if (isMeleeWeapon(b.weapon)) return;
    const weapon = b.weapon;
    const spec = RANGED.weapons[weapon];
    const origin = { x: b.x, y: m.y + 1.5, z: b.z };
    const dx = tx - origin.x;
    const dz = tz - origin.z;
    const horizontal = Math.hypot(dx, dz);
    const baseYaw = Math.atan2(dz, dx);
    const basePitch = Math.atan2(targetY - origin.y, horizontal);
    const errorDeg =
      BANDITS.ranged[weapon].aimErrorDeg * m.aimScale * (m.speed > 0.2 ? 2 : 1) + spec.spreadDeg;
    // Atanın kendisi ve diğer eşkıyalar vurulmaz: hedefler eşkıyasız süzülür. Sokak çetesi yalnızca kendi çetesini
    // korur (rakip çete üyeleri vurulabilir); Battle Royale yarışmacısı herkesi vurabilir (kendisi hariç).
    const targets = {
      targetsNear: (x: number, z: number, r: number) =>
        ctx.targets.targetsNear(x, z, r).filter((t) => {
          if (t.kind !== 'bandit') return true;
          const other = this.members.get(Number(t.id.slice(BANDIT_TARGET_PREFIX.length)));
          return other !== undefined && other !== m && isRival(m, other);
        }),
    };
    const shots: Array<{ path?: Array<{ x: number; y: number; z: number }>; time?: number }> = [];
    let aim = { x: Math.cos(baseYaw), y: Math.sin(basePitch), z: Math.sin(baseYaw) };
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
        solids: ctx.solids,
      });
      if (shot.hit) ctx.targets.applyHit(shot.hit.id, spec.damage * BANDITS.damageScale, from);
      shots.push({ path: shot.path, time: shot.time });
      if (i === 0) aim = dir;
    }
    this.events.emit('bandit:fired', {
      id: m.id,
      weapon,
      x: origin.x,
      y: origin.y,
      z: origin.z,
      dx: aim.x,
      dy: aim.y,
      dz: aim.z,
      shots,
    });
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
      if (m.camp || m.gang || m.contestant !== null) continue;
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
        droneCooldown: 0,
        gang: null,
        fight: null,
        playerNoticed: false,
        contestant: null,
        travel: null,
        aimScale: 1,
      });
    }
  }

  /**
   * Şehir merkezlerindeki sokak çeteleri: oyuncu merkeze `GANGS.activeRadius` yaklaşınca, saat/gün uygunsa ve çeteler
   * bugün dağılmadıysa iki rakip çete caddede canlanır (oyuncunun gözü önünde değil); uzaklaşınca kalkarlar.
   */
  private activateGangs(ctx: BanditContext): void {
    if (this.gangSites.length === 0) return;
    const day = Math.floor(ctx.now / SECONDS_PER_DAY);
    const grace = (this.startNow ?? ctx.now) + GANGS.graceSeconds;
    this.gangSites.forEach((site, index) => {
      const d = Math.hypot(site.x - ctx.player.x, site.z - ctx.player.z);
      const present = [...this.members.values()].some((m) => m.gang?.site === index);
      if (present) {
        if (d > GANGS.activeRadius + GANGS.despawnMargin) {
          let anyDead = false;
          for (const m of [...this.members.values()]) {
            if (m.gang?.site !== index) continue;
            if (m.brain.state === 'dead') anyDead = true;
            this.members.delete(m.id);
          }
          if (anyDead) this.gangDone.set(index, day);
        }
        return;
      }
      if (d > GANGS.activeRadius || ctx.now < grace) return;
      if (!gangHours(ctx.hour) || !gangPresent(site, day) || this.gangDone.get(index) === day)
        return;
      const far = (p: { x: number; z: number }) =>
        Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z) >= GANGS.minSpawnDistance;
      const factions = gangFactionsPresent(site, day);
      if (!factions.every((f) => far(gangSpot(site, f)!))) return;
      this.spawnGang(site, index, day, factions);
    });
  }

  private spawnGang(
    site: GangSite,
    siteIndex: number,
    day: number,
    factions: readonly GangFaction[],
  ): void {
    for (const faction of factions) {
      const roster = gangRoster(site, day, faction);
      // Bakış: bir sonraki çetenin tarafı; tek çete merkeze (caddenin ortasına) bakar.
      const other = factions.find((f) => f !== faction);
      const toward = (other !== undefined ? gangSpot(site, other) : null) ?? site;
      roster.forEach((member, index) => {
        const id = gangMemberId(siteIndex, faction, index);
        const rng = createRandom(seedFrom(this.seed, id % 2 ** 31, day));
        const activity: BanditActivity = member.role === 'leader' ? 'sit' : 'patrol';
        const yaw = Math.atan2(-(toward.x - member.x), -(toward.z - member.z));
        this.members.set(id, {
          id,
          camp: null,
          index,
          name: gangName(rng, member.role),
          brain: createBrain(member.x, member.z, yaw, member.weapon, member.role, activity),
          rng,
          y: this.world.heightAt(member.x, member.z),
          speed: 0,
          stride: 0,
          hitFlash: 0,
          searched: false,
          noise: null,
          freeActivity: activity,
          droneCooldown: 0,
          gang: { site: siteIndex, faction },
          fight: null,
          playerNoticed: false,
          contestant: null,
          travel: null,
          aimScale: 1,
        });
      });
    }
  }

  /** Çetenin bütün üyeleri ölünce ya da dağılınca o gün o yerde çete yeniden çıkmaz. */
  private checkGangDone(gang: { site: number } | null): void {
    if (!gang) return;
    for (const m of this.members.values()) {
      if (m.gang?.site === gang.site && m.brain.state !== 'dead') return;
    }
    this.gangDone.set(gang.site, Math.floor(this.lastNow / SECONDS_PER_DAY));
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

/** `o`, `m`nin rakibi mi? Sokak çetesi: aynı yerde başka çete; yarışmacı: başka yarışmacı. */
function isRival(m: Member, o: Member): boolean {
  if (m.contestant !== null) return o.contestant !== null && o.contestant !== m.contestant;
  return (
    m.gang !== null &&
    o.gang !== null &&
    o.gang.site === m.gang.site &&
    o.gang.faction !== m.gang.faction
  );
}

/** `items` envantere hep birlikte sığar mı (deneme kopyasında)? */
export function fitsAll(inventory: Inventory, items: readonly ItemStack[]): boolean {
  const trial = inventory.clone();
  return items.every((s) => trial.add(s.id, s.count) === 0);
}

function turnToward(from: number, to: number, maxStep: number): number {
  let delta = to - from;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}
