import type { ShelterKind } from '../survival/vitals';
import { SURVIVAL, SURVIVAL_HUD } from '../config';
import type { DeathCause, VitalsState } from '../survival/vitals';

export type GaugeLevel = 'ok' | 'low' | 'critical';
export type BodyTempLevel = 'ok' | 'cold' | 'hot' | 'critical';

/** Bir göstergenin (0–100) uyarı düzeyi. */
export function gaugeLevel(value: number): GaugeLevel {
  if (value < SURVIVAL_HUD.criticalBelow) return 'critical';
  if (value < SURVIVAL_HUD.lowBelow) return 'low';
  return 'ok';
}

/** Vücut ısısının düzeyi: ölümcül eşiklerin ötesi kritik, HUD eşiklerinin ötesi soğuk/sıcak. */
export function bodyTempLevel(bodyTempC: number): BodyTempLevel {
  if (bodyTempC < SURVIVAL.hypothermiaBelowC || bodyTempC > SURVIVAL.hyperthermiaAboveC)
    return 'critical';
  if (bodyTempC < SURVIVAL_HUD.coldBelowC) return 'cold';
  if (bodyTempC > SURVIVAL_HUD.hotAboveC) return 'hot';
  return 'ok';
}

/** Bir ondalık basamak, Türkçe ondalık ayracıyla (36,8 °C). */
export function formatTemperature(celsius: number): string {
  const rounded = Math.round(celsius * 10) / 10;
  return `${(Object.is(rounded, -0) ? 0 : rounded).toFixed(1).replace('.', ',')} °C`;
}

/** Gösterge dolgu oranı (0–1). */
export function gaugeFraction(value: number): number {
  return Math.min(Math.max(value / SURVIVAL.maxValue, 0), 1);
}

/** Vücut ısısı için kısa durum yazısı; sorun yoksa boş. */
export function bodyTempLabel(bodyTempC: number): string {
  switch (bodyTempLevel(bodyTempC)) {
    case 'critical':
      return bodyTempC < SURVIVAL.hypothermiaBelowC ? 'Donuyorsun!' : 'Aşırı ısındın!';
    case 'cold':
      return 'Üşüyorsun';
    case 'hot':
      return 'Sıcaklıyorsun';
    default:
      return '';
  }
}

/**
 * Ateş ısısı ve barınak için kısa durum yazısı ("Ateş başında · Barınakta"; kulübede "Kulübede"); etki yoksa boş.
 */
/** Barınak türünün HUD adı. */
export function shelterLabel(shelter: ShelterKind | null): string {
  if (shelter === 'hut') return 'Kulübede';
  if (shelter === 'mosque') return 'Camide';
  if (shelter === 'building') return 'Bina içinde';
  return 'Barınakta';
}

export function exposureLabel(
  warmthC: number,
  sheltered: boolean,
  shelter: ShelterKind | null = null,
): string {
  const parts: string[] = [];
  if (warmthC > 0) parts.push('Ateş başında');
  if (sheltered) parts.push(shelterLabel(shelter));
  return parts.join(' · ');
}

/** Ekranın ortasında gösterilecek uyarılar (en acil olan önce). */
export function warnings(state: VitalsState): string[] {
  const list: string[] = [];
  if (state.hydration < SURVIVAL_HUD.criticalBelow) list.push('Susuzluktan ölüyorsun!');
  else if (state.hydration < SURVIVAL_HUD.lowBelow) list.push('Susadın');
  if (state.satiety < SURVIVAL_HUD.criticalBelow) list.push('Açlıktan ölüyorsun!');
  else if (state.satiety < SURVIVAL_HUD.lowBelow) list.push('Acıktın');
  const temp = bodyTempLabel(state.bodyTemp);
  if (temp) list.push(temp);
  if (state.exhausted) list.push('Bitkinsin: koşamaz ve zıplayamazsın');
  return list;
}

const DEATH_TEXT: Record<DeathCause, string> = {
  dehydration: 'Susuzluktan öldün.',
  starvation: 'Açlıktan öldün.',
  hypothermia: 'Donarak öldün.',
  hyperthermia: 'Sıcak çarpmasından öldün.',
  mauled: 'Hayvan saldırısında öldün.',
  shot: 'Vurularak öldün.',
};

export function deathCauseText(cause: DeathCause): string {
  return DEATH_TEXT[cause];
}

/** Gerçek süreyi "12 dk 05 sn" ya da "45 sn" biçiminde yazar. */
export function formatSurvivedTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${minutes} dk ${String(rest).padStart(2, '0')} sn` : `${rest} sn`;
}

/** Oyun günü numarası 0'dan başlar; oyuncuya 1'den gösterilir. */
export function formatDay(day: number): string {
  return `${day + 1}. gün`;
}
