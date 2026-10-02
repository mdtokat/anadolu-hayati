import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { ambientTemperature } from './climate';
import { CLOCK, SURVIVAL } from '../config';
import { applyEdible } from '../items/consume';
import type { CreatureKind } from '../creatures/kinds';
import type { EdibleEffect, ItemId } from '../items/itemDefs';
import type { SurvivalSave } from '../save/saveGame';
import { GameClock, type ClockOptions } from './clock';
import {
  type ShelterKind,
  initialVitals,
  stepVitals,
  type Activity,
  type DeathCause,
  type VitalsState,
} from './vitals';

/** Her sabit adımda dünyadan/oyuncudan gelen bilgi. */
export interface SurvivalContext {
  activity: Activity;
  /** Gerçek rakım (metre); deniz altı için negatif olabilir (iklim 0'a sıkıştırır). */
  elevationM: number;
  /** Tatlı su içiyor mu? (Kaynağa yakınlık ve `E` basılı olması Game'de denetlenir.) */
  drinking: boolean;
  /** Yakındaki ateşlerin vücut ısısı denge değerine eklediği ısı (°C); yoksa 0. */
  warmthC?: number;
  /** Barınak altında mı? Yoksa `false`. */
  sheltered?: boolean;
  /** Barınağın türü (Faz 9; kulübe daha iyi korur). */
  shelter?: ShelterKind | null;
}

/** Dışarıdan gelen hasarın kaynağı (`applyDamage`); her kaynağın bir ölüm nedeni vardır. */
export type DamageSource = 'creature' | 'shot';

const DAMAGE_DEATH_CAUSE: Readonly<Record<DamageSource, DeathCause>> = {
  creature: 'mauled',
  shot: 'shot',
};

export interface DeathInfo {
  cause: DeathCause;
  /** Bu yaşamda hayatta kalınan gerçek süre (sn). */
  survivedSeconds: number;
  /** Ölümün olduğu oyun günü (0'dan). */
  day: number;
}

/**
 * Hayatta kalma çatısı (saf mantık): oyun saati + iklim + yaşamsal göstergeler + olaylar.
 * Ölünce güncellemeler durur; `respawn()` göstergeleri tam doldurur (saat kesintisiz devam eder).
 */
export class SurvivalSystem {
  readonly clock: GameClock;

  private vitals: VitalsState = initialVitals();
  private ambient = 0;
  private aliveSeconds = 0;
  private deaths = 0;
  private death: DeathInfo | null = null;
  private drinkingNow = false;
  private drinkStartHydration = 0;

  constructor(
    private readonly events?: EventBus<GameEvents>,
    clockOptions: ClockOptions = {},
  ) {
    this.clock = new GameClock(clockOptions, events);
    this.ambient = this.ambientAt(0);
  }

  get state(): Readonly<VitalsState> {
    return this.vitals;
  }

  /** Şu anki ortam sıcaklığı (°C) — son `update`teki rakımla. */
  get ambientC(): number {
    return this.ambient;
  }

  get alive(): boolean {
    return this.death === null;
  }

  get deathInfo(): DeathInfo | null {
    return this.death;
  }

  /** Toplam ölüm sayısı (yeniden doğma noktası seçimi için tohum indeksi). */
  get deathCount(): number {
    return this.deaths;
  }

  get drinking(): boolean {
    return this.drinkingNow;
  }

  /** Sabit adım (dt sn): saati, iklimi ve göstergeleri ilerletir. Ölüyken işlem yapmaz. */
  update(dt: number, context: SurvivalContext): void {
    if (this.death) return;

    this.clock.advance(dt);
    this.ambient = this.ambientAt(context.elevationM);
    this.aliveSeconds += dt;
    this.trackDrinking(context.drinking && this.canKeepDrinking());

    const step = stepVitals(
      this.vitals,
      {
        activity: context.activity,
        ambientC: this.ambient,
        drinking: this.drinkingNow,
        warmthC: context.warmthC,
        sheltered: context.sheltered,
        shelter: context.shelter,
      },
      dt,
    );
    this.vitals = step.state;

    if (step.dead && step.cause) this.die(step.cause);
  }

  /**
   * Dışarıdan gelen hasarı (savunma uygulanmış) canı düşürür, `player:damaged` yayınlar; can 0'a inerse
   * kaynağın ölüm nedeniyle öldürür. Ölüyse ya da `amount` ≤ 0 ise hiçbir şey yapmaz. Gerçekte düşen canı
   * döner (kalan candan fazlası sayılmaz).
   */
  applyDamage(amount: number, source: DamageSource, sourceKind?: CreatureKind): number {
    if (this.death || !(amount > 0)) return 0;
    const dealt = Math.min(amount, this.vitals.health);
    this.vitals = { ...this.vitals, health: this.vitals.health - dealt };
    this.events?.emit('player:damaged', { amount: dealt, cause: source, sourceKind });
    if (this.vitals.health <= 0) this.die(DAMAGE_DEATH_CAUSE[source]);
    return dealt;
  }

  private die(cause: DeathCause): void {
    this.finishDrinking();
    this.death = { cause, survivedSeconds: this.aliveSeconds, day: this.clock.day };
    this.events?.emit('player:died', { ...this.death });
  }

  /** Tüm göstergeleri doldurup yeniden doğurur; saat ve gün sayısı korunur. */
  respawn(): void {
    if (!this.death) return;
    this.deaths += 1;
    this.death = null;
    this.vitals = initialVitals();
    this.aliveSeconds = 0;
    this.drinkingNow = false;
    this.events?.emit('player:respawned', { deaths: this.deaths });
  }

  /**
   * Yenen/içilen bir şeyin etkisini uygular. Ölüyse hiçbir şey yapmaz ve `false` döner (çağıran,
   * eşyayı envanterden düşmeden önce `alive`/dönüş değerini denetlemelidir). `item` verilirse
   * gerçekte artan değerlerle `player:ate` yayınlanır.
   */
  consume(effect: EdibleEffect, item?: ItemId): boolean {
    if (this.death) return false;
    const before = this.vitals;
    this.vitals = applyEdible(before, effect);
    if (item !== undefined) {
      this.events?.emit('player:ate', {
        item,
        satiety: this.vitals.satiety - before.satiety,
        hydration: this.vitals.hydration - before.hydration,
      });
    }
    return true;
  }

  /** Enerji harcar (saldırı gibi eylemler; 0'ın altına inmez). Bitkinlik bir sonraki adımda `stepVitals`'ta işlenir. */
  spendEnergy(amount: number): void {
    if (this.death || !(amount > 0)) return;
    this.vitals = { ...this.vitals, energy: Math.max(this.vitals.energy - amount, 0) };
  }

  /** Kayıt görüntüsü: göstergeler, bu yaşamın süresi, ölüm sayısı ve oyun saati. Ölüyken kaydedilmez. */
  toSave(): SurvivalSave {
    return {
      vitals: { ...this.vitals },
      aliveSeconds: this.aliveSeconds,
      deaths: this.deaths,
      clockHour: this.clock.hour,
      clockDay: this.clock.day,
    };
  }

  /**
   * Kaydı yükler: oyuncu canlı olur (ölüm durumu kayda girmez), içme oturumu sıfırlanır, olay yayınlanmaz.
   * Ortam sıcaklığı bir sonraki `update`te yeni rakımla hesaplanır.
   */
  loadSave(save: SurvivalSave): void {
    this.vitals = { ...save.vitals };
    this.aliveSeconds = save.aliveSeconds;
    this.deaths = save.deaths;
    this.death = null;
    this.drinkingNow = false;
    this.clock.restore(save.clockHour, save.clockDay);
  }

  /** Geliştirici kısayolu: seviyeleri doğrudan ayarlar (test/hata ayıklama). */
  setVitals(patch: Partial<VitalsState>): void {
    this.vitals = { ...this.vitals, ...patch };
  }

  private ambientAt(elevationM: number): number {
    return ambientTemperature({ hour: this.clock.hour, dayOfYear: CLOCK.dayOfYear, elevationM });
  }

  /** Başlamak için asgari eksiklik gerekir; başladıktan sonra su dolana kadar sürer. */
  private canKeepDrinking(): boolean {
    const missing = SURVIVAL.maxValue - this.vitals.hydration;
    return this.drinkingNow ? missing > 0 : missing >= SURVIVAL.drinkMinDeficit;
  }

  /** İçme oturumu başlangıç/bitişini izler; bitince `player:drank` yayınlar. */
  private trackDrinking(wantsToDrink: boolean): void {
    if (wantsToDrink && !this.drinkingNow) {
      this.drinkingNow = true;
      this.drinkStartHydration = this.vitals.hydration;
    } else if (!wantsToDrink && this.drinkingNow) {
      this.finishDrinking();
    }
  }

  private finishDrinking(): void {
    if (!this.drinkingNow) return;
    this.drinkingNow = false;
    const amount = this.vitals.hydration - this.drinkStartHydration;
    if (amount > 0) this.events?.emit('player:drank', { amount });
  }
}
