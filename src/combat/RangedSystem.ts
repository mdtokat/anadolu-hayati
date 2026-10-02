import { RANGED } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Inventory } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import type { WeaponId, WeaponState } from '../items/weaponState';
import type { SurvivalSystem } from '../survival/SurvivalSystem';
import { isRangedWeapon, loadRounds, reloadCheck, reserveAmmo } from './ammo';
import { damageAt, type SolidQuery, type Vec3Like } from './ballistics';
import { fireVolley, type ShotResult } from './ranged';
import { PLAYER_TARGET_ID, type TargetProvider } from './targets';

/**
 * Oyuncunun menzilli silahları (Faz 11.5, saf; Three.js'siz): nişan (yumuşak geçiş), dürbün salınımı ve nefes tutma,
 * atış (şarjör, atış arası, saçılma, tepme), doldurma (süreli, atomik) ve isabetlerin uçuş süresi kadar gecikmeli
 * işlenmesi. Atış gürültüsü `noise:made` ile yayınlanır (canlılar kaçar, eşkıyalar duyar). Eldeki eşya kısayoldan
 * okunur; elde menzilli silah yoksa hiçbir şey yapmaz (sol tık yakın dövüşe kalır).
 */

/** Her sabit adımdaki girdi. */
export interface RangedInput {
  /** Elde (kısayolda seçili) eşya. */
  held: ItemId | null;
  /** Sağ tık basılı mı? */
  aiming: boolean;
  /** Nefes tutma (`Shift`, nişandayken)? */
  steady: boolean;
  /** Yürüyor mu (yatay hareket niyeti)? */
  moving: boolean;
  /** Koşuyor ya da havada mı? */
  running: boolean;
}

/** Atış anındaki göz/namlu konumu ve bakış (yaw 0 = −Z, pozitif sola; pitch pozitif yukarı). */
export interface AimPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Atışın dünyadan istedikleri. */
export interface RangedWorld {
  heightAt(x: number, z: number): number;
  targets: TargetProvider;
  solids?: SolidQuery;
}

export type FireStatus =
  'fired' | 'no_weapon' | 'reloading' | 'cooldown' | 'empty' | 'exhausted' | 'dead';

export interface FireResult {
  status: FireStatus;
  weapon: WeaponId | null;
  /** Tanelerin uçuşları (atış yoksa boş). */
  shots: ShotResult[];
  /** Bakışa uygulanacak tepme (radyan, yukarı). */
  recoil: number;
  /** Boş şarjörle tetiğe basınca doldurma kendiliğinden başladı mı? */
  reloadStarted: boolean;
}

export type ReloadStatus = 'started' | 'full' | 'no_ammo' | 'no_weapon' | 'busy';

/** HUD için silah durumu. */
export interface RangedHudState {
  weapon: WeaponId;
  loaded: number;
  capacity: number;
  reserve: number;
  /** Doldurma ilerlemesi (0–1) ya da null. */
  reload: number | null;
  /** Nişan geçişi (0 = kalçadan, 1 = tam nişan). */
  aim: number;
  /** Dürbün görüntüsü açık mı (dürbünlü silah tam nişanda)? */
  scoped: boolean;
  /** Kalan nefes (0–1) ve nefes tükendi mi? */
  breath: number;
  breathExhausted: boolean;
  /** Şu anki saçılma (derece; nişangâh açıklığı). */
  spreadDeg: number;
}

interface PendingHit {
  at: number;
  id: string;
  damage: number;
  from: Vec3Like;
  weapon: WeaponId;
  targets: TargetProvider;
}

const DEG = Math.PI / 180;
/** Nişan bu orandan sonra "nişanda" sayılır (saçılma, dürbün). */
const AIMED_AT = 0.6;

export class RangedSystem {
  private time = 0;
  private cooldownLeft = 0;
  private reloadState: { weapon: WeaponId; left: number; total: number } | null = null;
  private aim = 0;
  /** Önceki sabit adımın nişan oranı ve adımın süresi: çizimde adımlar arası aradeğerleme (`aimFractionAt`, `swayAt`). */
  private prevAim = 0;
  private lastDt = 1 / 60;
  private breathLeft: number = RANGED.steadySeconds;
  private breathOut = false;
  private steadyActive = false;
  private input: RangedInput = {
    held: null,
    aiming: false,
    steady: false,
    moving: false,
    running: false,
  };
  private readonly pending: PendingHit[] = [];
  /** Son görülen şarjör kaydı sürümü: kayıt yüklenince geçici durum sıfırlanır. */
  private weaponsRevision = -1;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
    private readonly weapons: Pick<
      WeaponState,
      'loaded' | 'capacity' | 'set' | 'consume' | 'revision'
    >,
    private readonly survival: Pick<SurvivalSystem, 'alive' | 'state' | 'spendEnergy'>,
    private readonly random: () => number = Math.random,
  ) {}

  /** Eldeki menzilli silah (envanterde değilse null). */
  weaponOf(held: ItemId | null): WeaponId | null {
    return isRangedWeapon(held) && this.inventory.has(held) ? held : null;
  }

  /** Şu an elde tutulan menzilli silah. */
  get weapon(): WeaponId | null {
    return this.weaponOf(this.input.held);
  }

  /** Nişan geçişi (0–1). */
  get aimFraction(): number {
    return this.aim;
  }

  /** Dürbün görüntüsü açık mı? */
  get scoped(): boolean {
    const w = this.weapon;
    return w !== null && RANGED.weapons[w].scope && this.aim >= AIMED_AT;
  }

  /** Nefes tutuluyor mu (salınım azalmış)? */
  get steadying(): boolean {
    return this.steadyActive;
  }

  get reloading(): { weapon: WeaponId; progress: number } | null {
    const r = this.reloadState;
    return r ? { weapon: r.weapon, progress: 1 - r.left / r.total } : null;
  }

  /** Bekleyen (uçuştaki) isabet sayısı. */
  get pendingHits(): number {
    return this.pending.length;
  }

  /** Nişan oranının iki sabit adım arasındaki değeri (`alpha` 0..1; çizim her karede 60 Hz adımına bağlı kalmasın). */
  aimFractionAt(alpha: number): number {
    const t = Math.min(Math.max(alpha, 0), 1);
    return this.prevAim + (this.aim - this.prevAim) * t;
  }

  /**
   * Dürbün salınımı (radyan): bakışa eklenen yaw/pitch kayması. Yalnızca dürbünlü silah nişandayken; nefes tutunca
   * azalır, nefes tükenince artar.
   */
  get sway(): { yaw: number; pitch: number } {
    return this.swayAt(1);
  }

  /**
   * `sway`'in iki sabit adım arasındaki değeri: yüksek yakınlaştırmada (dürbün 12°) 60 Hz'lik basamaklı salınım ekranda
   * titreme olarak görünür; çizim bu aradeğerle her karede akıcı kalır.
   */
  swayAt(alpha: number): { yaw: number; pitch: number } {
    if (!this.scoped) return { yaw: 0, pitch: 0 };
    const s = RANGED.sway;
    const k = this.steadyActive
      ? RANGED.steadySwayScale
      : this.breathOut
        ? RANGED.exhaustedSwayScale
        : 1;
    const t = Math.min(Math.max(alpha, 0), 1);
    const time = this.time - this.lastDt * (1 - t);
    const a = s.amplitude * k * this.aimFractionAt(t);
    return {
      yaw: a * Math.sin(2 * Math.PI * s.freqX * time),
      pitch: a * Math.sin(2 * Math.PI * s.freqY * time + 0.7),
    };
  }

  /** Nişan ve hareket durumuna göre saçılma çarpanı. */
  spreadScale(weapon: WeaponId, input: RangedInput = this.input): number {
    const s = RANGED.spreadScale;
    let k = 1;
    if (input.aiming && this.aim >= AIMED_AT)
      k *= RANGED.weapons[weapon].scope ? s.scoped : s.aimed;
    if (input.running) k *= s.running;
    else if (input.moving) k *= s.moving;
    return k;
  }

  /** HUD durumu; elde menzilli silah yoksa null. */
  hudState(): RangedHudState | null {
    const weapon = this.weapon;
    if (!weapon) return null;
    const reload = this.reloadState?.weapon === weapon ? this.reloading!.progress : null;
    return {
      weapon,
      loaded: this.weapons.loaded(weapon),
      capacity: this.weapons.capacity(weapon),
      reserve: reserveAmmo(this.inventory, weapon),
      reload,
      aim: this.aim,
      scoped: this.scoped,
      breath: this.breathLeft / RANGED.steadySeconds,
      breathExhausted: this.breathOut,
      spreadDeg: RANGED.weapons[weapon].spreadDeg * this.spreadScale(weapon),
    };
  }

  /** Sabit adım (dt sn): nişan, nefes, doldurma, atış arası ve uçuştaki isabetler. */
  update(dt: number, input: RangedInput): void {
    if (this.weapons.revision !== this.weaponsRevision) {
      this.weaponsRevision = this.weapons.revision;
      this.reset();
    }
    this.time += dt;
    this.lastDt = dt;
    this.prevAim = this.aim;
    this.input = input;
    this.cooldownLeft = Math.max(this.cooldownLeft - dt, 0);
    const weapon = this.weapon;
    const alive = this.survival.alive;

    // Nişan geçişi (silah yoksa ya da ölüyken söner).
    const wanted = alive && weapon !== null && input.aiming ? 1 : 0;
    const step = RANGED.aimSpeed * dt;
    // Hedefe varınca yerinde kalır: eşitlikte de azaltmak tam nişanda her adım 1 ↔ 0,85 salınıp görüş açısını titretirdi.
    if (wanted > this.aim) this.aim = Math.min(this.aim + step, wanted);
    else if (wanted < this.aim) this.aim = Math.max(this.aim - step, wanted);

    // Nefes tutma: dürbün nişanında Shift; enerji harcar, süre bitince bir süre tutulamaz.
    const canSteady =
      this.scoped &&
      input.steady &&
      !this.breathOut &&
      this.breathLeft > 0 &&
      this.survival.state.energy > 0;
    this.steadyActive = canSteady;
    if (canSteady) {
      this.breathLeft = Math.max(this.breathLeft - dt, 0);
      this.survival.spendEnergy(RANGED.steadyEnergyPerSecond * dt);
      if (this.breathLeft <= 0) this.breathOut = true;
    } else {
      const recover = (RANGED.steadySeconds / RANGED.breathRecoverSeconds) * dt;
      this.breathLeft = Math.min(this.breathLeft + recover, RANGED.steadySeconds);
      if (this.breathLeft >= RANGED.steadySeconds) this.breathOut = false;
    }

    // Doldurma: silah değişirse iptal; süre dolunca envanterden şarjöre (atomik).
    const r = this.reloadState;
    if (r) {
      if (!alive || weapon !== r.weapon) {
        this.reloadState = null;
      } else {
        r.left -= dt;
        if (r.left <= 0) {
          this.reloadState = null;
          const rounds = loadRounds(this.weapons, this.inventory, r.weapon);
          if (rounds > 0) this.events.emit('weapon:reloaded', { weapon: r.weapon, rounds });
        }
      }
    }

    // Uçuştaki isabetler: varış anında hedefe işlenir.
    if (this.pending.length > 0) {
      for (let i = 0; i < this.pending.length;) {
        const hit = this.pending[i]!;
        if (hit.at > this.time) {
          i++;
          continue;
        }
        this.pending.splice(i, 1);
        hit.targets.applyHit(hit.id, hit.damage, {
          ...hit.from,
          by: 'player',
          weapon: hit.weapon,
        });
      }
    }
  }

  /** `R`: eldeki silahı doldurmaya başlar. */
  reload(): ReloadStatus {
    const weapon = this.weapon;
    if (!weapon || !this.survival.alive) return 'no_weapon';
    if (this.reloadState) return 'busy';
    const check = reloadCheck(this.weapons, this.inventory, weapon);
    if (check !== 'ok') return check;
    const total = RANGED.weapons[weapon].reloadSeconds;
    this.reloadState = { weapon, left: total, total };
    return 'started';
  }

  /** Sol tık: eldeki silahla `pose` yönünde (dürbün salınımı dahil) ateş eder. */
  fire(pose: AimPose, world: RangedWorld): FireResult {
    const weapon = this.weapon;
    const result = (status: FireStatus, reloadStarted = false): FireResult => ({
      status,
      weapon,
      shots: [],
      recoil: 0,
      reloadStarted,
    });
    if (!this.survival.alive) return result('dead');
    if (!weapon) return result('no_weapon');
    if (this.reloadState) return result('reloading');
    if (this.cooldownLeft > 0) return result('cooldown');
    const stats = RANGED.weapons[weapon];
    if (this.weapons.loaded(weapon) <= 0) {
      if (this.reload() === 'started') return result('empty', true);
      this.events.emit('weapon:empty', { weapon });
      return result('empty');
    }
    if (stats.energyCost > 0) {
      const { energy, exhausted } = this.survival.state;
      if (exhausted || energy < RANGED.minEnergyPrimitive) return result('exhausted');
    }

    this.weapons.consume(weapon);
    if (stats.energyCost > 0) this.survival.spendEnergy(stats.energyCost);
    this.cooldownLeft = stats.cooldownSeconds;

    const sway = this.sway;
    const yaw = pose.yaw + sway.yaw;
    const pitch = pose.pitch + sway.pitch;
    const cos = Math.cos(pitch);
    const dir = { x: -Math.sin(yaw) * cos, y: Math.sin(pitch), z: -Math.cos(yaw) * cos };
    const origin = { x: pose.x, y: pose.y, z: pose.z };
    const shots = fireVolley(origin, dir, weapon, {
      heightAt: world.heightAt,
      targets: world.targets,
      ignore: PLAYER_TARGET_ID,
      solids: world.solids,
      random: this.random,
      spreadScale: this.spreadScale(weapon),
      sighted: true,
    });

    // Aynı hedefe isabet eden taneler tek isabette toplanır (hasar sistemi dokunulmazlığı tane yutmasın).
    const byTarget = new Map<string, { damage: number; time: number }>();
    for (const shot of shots) {
      if (!shot.hit) continue;
      const damage = damageAt(stats.damage, shot.distance, stats.range);
      const prev = byTarget.get(shot.hit.id);
      byTarget.set(shot.hit.id, {
        damage: (prev?.damage ?? 0) + damage,
        time: Math.min(prev?.time ?? Infinity, shot.time ?? 0),
      });
    }
    for (const [id, hit] of byTarget) {
      this.pending.push({
        at: this.time + Math.min(hit.time, RANGED.maxHitDelaySeconds),
        id,
        damage: hit.damage,
        from: origin,
        weapon,
        targets: world.targets,
      });
    }

    this.events.emit('weapon:fired', { weapon, ...origin, hits: byTarget.size });
    this.events.emit('noise:made', {
      x: pose.x,
      z: pose.z,
      radius: RANGED.noiseRadius[weapon],
      source: 'player',
    });
    // Yay ve sapan tek atımlık: mühimmat varsa kendiliğinden yeniden gerilir.
    if (stats.magazine === 1 && this.weapons.loaded(weapon) === 0) this.reload();
    const aimed = this.aim >= AIMED_AT ? 0.7 : 1;
    return {
      status: 'fired',
      weapon,
      shots,
      recoil: stats.recoilDeg * DEG * aimed,
      reloadStarted: false,
    };
  }

  /** Yükleme/yeniden doğma: geçici durum (doldurma, uçuştaki isabetler, nişan) sıfırlanır; şarjör kalır. */
  reset(): void {
    this.reloadState = null;
    this.pending.length = 0;
    this.cooldownLeft = 0;
    this.aim = 0;
    this.prevAim = 0;
    this.breathLeft = RANGED.steadySeconds;
    this.breathOut = false;
    this.steadyActive = false;
  }
}

/**
 * Nişan geçişinde kamera (saf): görüş açısı normalden silahın `aimFovDeg`'ine, fare hassasiyeti de görüş açısıyla
 * orantılı (× `RANGED.aimSensitivity`) iner; geçişin yarısından sonra görüntü göz hizasına alınır.
 */
export function aimCamera(
  weapon: WeaponId | null,
  aim: number,
  baseFovDeg: number,
): { fovDeg: number; sensitivity: number; firstPerson: boolean } {
  if (!weapon || aim <= 0) return { fovDeg: baseFovDeg, sensitivity: 1, firstPerson: false };
  const a = Math.min(aim, 1);
  const target = RANGED.weapons[weapon].aimFovDeg;
  const fovDeg = baseFovDeg + (target - baseFovDeg) * a;
  const zoomed = (target / baseFovDeg) * RANGED.aimSensitivity;
  return { fovDeg, sensitivity: 1 + (zoomed - 1) * a, firstPerson: a >= 0.5 };
}
