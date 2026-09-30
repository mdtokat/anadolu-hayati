import { SURVIVAL } from '../config';

export type Activity = 'rest' | 'walk' | 'run';

/** Ölüm nedeni: ölüm anındaki en büyük hasar kaynağı. */
export type DeathCause = 'dehydration' | 'starvation' | 'hypothermia' | 'hyperthermia';

export interface VitalsState {
  /** Can, tokluk (açlığın tersi), su (susuzluğun tersi), enerji (yorgunluğun tersi): 0–100. */
  health: number;
  satiety: number;
  hydration: number;
  energy: number;
  /** Vücut ısısı (°C). */
  bodyTemp: number;
  /** Enerji tükendi: koşma/zıplama kapalı, `exhaustedRecoverAt` seviyesine çıkana kadar. */
  exhausted: boolean;
}

export interface VitalsInput {
  activity: Activity;
  /** Ortam sıcaklığı (°C). */
  ambientC: number;
  /** Tatlı su içiyor mu? */
  drinking?: boolean;
}

/** Bu adımda her kaynaktan alınan hasar (can puanı). */
export interface DamageBreakdown {
  dehydration: number;
  starvation: number;
  hypothermia: number;
  hyperthermia: number;
}

export interface VitalsStep {
  state: VitalsState;
  damage: DamageBreakdown;
  dead: boolean;
  /** `dead` ise ölüm nedeni. */
  cause: DeathCause | null;
}

const MAX = SURVIVAL.maxValue;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Tam dolu, sağlıklı başlangıç durumu. */
export function initialVitals(): VitalsState {
  return {
    health: MAX,
    satiety: MAX,
    hydration: MAX,
    energy: MAX,
    bodyTemp: SURVIVAL.bodyTempNormalC,
    exhausted: false,
  };
}

/**
 * Vücut ısısının yöneldiği denge değeri (°C): normal ısı, soğukta ortam sıcaklığıyla orantılı düşer,
 * sıcakta yükselir; aktivite ısı ekler. (Giysi ve barınak yok: Faz 4.)
 */
export function bodyTempEquilibrium(ambientC: number, activity: Activity): number {
  let equilibrium = SURVIVAL.bodyTempNormalC + SURVIVAL.activityHeatC[activity];
  if (ambientC < SURVIVAL.comfortAmbientC) {
    equilibrium -= (SURVIVAL.comfortAmbientC - ambientC) * SURVIVAL.coldSlope;
  } else if (ambientC > SURVIVAL.hotAmbientC) {
    equilibrium += (ambientC - SURVIVAL.hotAmbientC) * SURVIVAL.hotSlope;
  }
  return equilibrium;
}

/** Hasar dökümünden ölüm nedeni: en büyük katkı. */
export function causeOfDeath(damage: DamageBreakdown): DeathCause {
  const entries = Object.entries(damage) as Array<[DeathCause, number]>;
  return entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

/**
 * Göstergeleri `dt` saniye ilerletir (saf; girdi durumu değişmez). Süreye göre doğrusal tüketim,
 * vücut ısısı için kapalı formlu üstel yaklaşma (adım boyundan bağımsız).
 */
export function stepVitals(state: VitalsState, input: VitalsInput, dt: number): VitalsStep {
  const { activity, ambientC } = input;

  // Susuzluk ve açlık: aktiviteyle ve (susuzluk için) sıcakla hızlanır.
  const activityFactor = SURVIVAL.activityDrain[activity];
  const heat = Math.max(0, ambientC - SURVIVAL.hotThirstAboveC) * SURVIVAL.hotThirstPerDegree;
  const hydrationDrain =
    (MAX / (SURVIVAL.hydrationEmptyMinutes * 60)) * activityFactor * (1 + heat);
  const satietyDrain = (MAX / (SURVIVAL.satietyEmptyMinutes * 60)) * activityFactor;

  let hydration = state.hydration - hydrationDrain * dt;
  if (input.drinking) hydration += SURVIVAL.drinkPerSecond * dt + hydrationDrain * dt; // içerken tüketim yok sayılır
  hydration = clamp(hydration, 0, MAX);
  const satiety = clamp(state.satiety - satietyDrain * dt, 0, MAX);

  // Enerji: koşarak biter, yürürken yavaş, dinlenirken hızlı dolar.
  let energy = state.energy;
  if (activity === 'run' && !state.exhausted) energy -= (MAX / SURVIVAL.runEmptySeconds) * dt;
  else if (activity === 'walk') energy += (MAX / SURVIVAL.walkRefillSeconds) * dt;
  else if (activity === 'rest') energy += (MAX / SURVIVAL.restRefillSeconds) * dt;
  energy = clamp(energy, 0, MAX);
  let exhausted = state.exhausted;
  if (energy <= 0) exhausted = true;
  else if (exhausted && energy >= SURVIVAL.exhaustedRecoverAt) exhausted = false;

  // Vücut ısısı: dengeye üstel yaklaşma.
  const equilibrium = bodyTempEquilibrium(ambientC, activity);
  const bodyTemp =
    equilibrium + (state.bodyTemp - equilibrium) * Math.exp(-dt / SURVIVAL.bodyTempTauSeconds);

  // Hasar kaynakları (bu adımın sonundaki değerlere göre).
  const damage: DamageBreakdown = {
    dehydration: hydration <= 0 ? SURVIVAL.dehydrationDamagePerSecond * dt : 0,
    starvation: satiety <= 0 ? SURVIVAL.starvationDamagePerSecond * dt : 0,
    hypothermia:
      bodyTemp < SURVIVAL.hypothermiaBelowC
        ? (SURVIVAL.hypothermiaBelowC - bodyTemp) * SURVIVAL.hypothermiaDamagePerDegree * dt
        : 0,
    hyperthermia:
      bodyTemp > SURVIVAL.hyperthermiaAboveC
        ? (bodyTemp - SURVIVAL.hyperthermiaAboveC) * SURVIVAL.hyperthermiaDamagePerDegree * dt
        : 0,
  };
  const totalDamage =
    damage.dehydration + damage.starvation + damage.hypothermia + damage.hyperthermia;

  // Can: hasar varsa düşer; her şey iyiyse yavaşça yenilenir.
  let health = state.health - totalDamage;
  const [minTemp, maxTemp] = SURVIVAL.healthRegenBodyTempC;
  const canRegen =
    totalDamage === 0 &&
    satiety >= SURVIVAL.healthRegenMinLevel &&
    hydration >= SURVIVAL.healthRegenMinLevel &&
    bodyTemp >= minTemp &&
    bodyTemp <= maxTemp;
  if (canRegen) health += SURVIVAL.healthRegenPerSecond * dt;
  health = clamp(health, 0, MAX);

  const dead = health <= 0;
  return {
    state: { health, satiety, hydration, energy, bodyTemp, exhausted },
    damage,
    dead,
    cause: dead ? causeOfDeath(damage) : null,
  };
}

/** Yemek/içecek: tokluk ve suyu artırır (Faz 4'te toplama/pişirme kullanacak). */
export function applyConsumable(
  state: VitalsState,
  effect: { satiety?: number; hydration?: number },
): VitalsState {
  return {
    ...state,
    satiety: clamp(state.satiety + (effect.satiety ?? 0), 0, MAX),
    hydration: clamp(state.hydration + (effect.hydration ?? 0), 0, MAX),
  };
}

/** Koşma ve zıplama açık mı? (Enerji tükenince kapanır.) */
export function canSprint(state: VitalsState): boolean {
  return !state.exhausted;
}
