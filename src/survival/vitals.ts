import { SHELTER_EFFECTS, SURVIVAL } from '../config';

export type Activity = 'rest' | 'walk' | 'run';

/**
 * Ölüm nedeni: ölüm anındaki en büyük hasar kaynağı. `mauled` (hayvan saldırısı) göstergelerden değil,
 * `SurvivalSystem.applyDamage` ile dışarıdan gelen hasardan doğar (`DamageBreakdown`'da yoktur).
 */
export type DeathCause =
  | 'dehydration'
  | 'starvation'
  | 'hypothermia'
  | 'hyperthermia'
  | 'mauled'
  /** Faz 11: vurularak (eşkıya atışı). */
  | 'shot';

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
  /** Yakındaki ateşlerin vücut ısısı denge değerine eklediği ısı (°C); `placement/exposure.ts`'ten. */
  warmthC?: number;
  /** Barınak altında mı? Soğuk etkisi azalır; dinlenirken enerji ve can daha hızlı dolar. */
  sheltered?: boolean;
  /**
   * Barınağın türü (Faz 9): `hut` (ahşap kulübe) `SHELTER_EFFECTS.hut` etkilerini, diğerleri sundurmanınkini
   * (`SHELTER_EFFECTS.shelter`) kullanır. Faz 10: kasaba yapılarının içi (`building`: han; `mosque`: cami)
   * kulübe gibi korur. Yalnızca `sheltered` iken anlamlıdır.
   */
  shelter?: ShelterKind | null;
}

/** Barınak türü: sundurma, kulübe (Faz 9), kasaba yapısı ve cami içi (Faz 10). */
export type ShelterKind = 'lean_to' | 'hut' | 'building' | 'mosque';

/** Kapalı (duvarlı, çatılı) barınak mı? Kulübe, han, cami: `SHELTER_EFFECTS.hut`. */
export function isEnclosedShelter(shelter: ShelterKind | null | undefined): boolean {
  return shelter === 'hut' || shelter === 'building' || shelter === 'mosque';
}

/** Barınak etkileri: kapalı yapı ya da (varsayılan) sundurma. */
function shelterFactors(shelter: VitalsInput['shelter']) {
  return isEnclosedShelter(shelter) ? SHELTER_EFFECTS.hut : SHELTER_EFFECTS.shelter;
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
  cause: keyof DamageBreakdown | null;
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
 * sıcakta yükselir; aktivite ısı ekler. Barınak (`sheltered`) soğuk etkisini `coldFactor` ile azaltır; ateş
 * (`warmthC`) dengeyi yükseltir ama vücudu normal ısı + aktivite ısısının üstüne çıkaramaz (ateş aşırı
 * ısıtmaz; sıcak havada zaten yüksek olan dengeyi değiştirmez).
 */
export function bodyTempEquilibrium(
  ambientC: number,
  activity: Activity,
  warmthC = 0,
  sheltered = false,
  shelter: VitalsInput['shelter'] = null,
): number {
  const comfortable = SURVIVAL.bodyTempNormalC + SURVIVAL.activityHeatC[activity];
  let equilibrium = comfortable;
  if (ambientC < SURVIVAL.comfortAmbientC) {
    const coldFactor = sheltered ? shelterFactors(shelter).coldFactor : 1;
    equilibrium -= (SURVIVAL.comfortAmbientC - ambientC) * SURVIVAL.coldSlope * coldFactor;
  } else if (ambientC > SURVIVAL.hotAmbientC) {
    equilibrium += (ambientC - SURVIVAL.hotAmbientC) * SURVIVAL.hotSlope;
  }
  if (warmthC > 0)
    equilibrium = Math.max(equilibrium, Math.min(equilibrium + warmthC, comfortable));
  return equilibrium;
}

/** Hasar dökümünden ölüm nedeni: en büyük katkı. */
export function causeOfDeath(damage: DamageBreakdown): keyof DamageBreakdown {
  const entries = Object.entries(damage) as Array<[keyof DamageBreakdown, number]>;
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

  // Enerji: koşarak biter, yürürken yavaş, dinlenirken hızlı dolar (barınakta daha hızlı).
  const sheltered = input.sheltered === true;
  const shelterEffects = shelterFactors(input.shelter);
  const restFactor = sheltered ? shelterEffects.restRefillFactor : 1;
  let energy = state.energy;
  if (activity === 'run' && !state.exhausted) energy -= (MAX / SURVIVAL.runEmptySeconds) * dt;
  else if (activity === 'walk') energy += (MAX / SURVIVAL.walkRefillSeconds) * dt;
  else if (activity === 'rest') energy += (MAX / SURVIVAL.restRefillSeconds) * restFactor * dt;
  energy = clamp(energy, 0, MAX);
  let exhausted = state.exhausted;
  if (energy <= 0) exhausted = true;
  else if (exhausted && energy >= SURVIVAL.exhaustedRecoverAt) exhausted = false;

  // Vücut ısısı: dengeye üstel yaklaşma.
  const equilibrium = bodyTempEquilibrium(
    ambientC,
    activity,
    input.warmthC ?? 0,
    sheltered,
    input.shelter,
  );
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
  if (canRegen) {
    const regenFactor = sheltered && activity === 'rest' ? shelterEffects.restHealthFactor : 1;
    health += SURVIVAL.healthRegenPerSecond * regenFactor * dt;
  }
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
