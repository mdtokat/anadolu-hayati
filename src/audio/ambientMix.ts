import { AMBIENT } from '../config';
import type { LandCoverClass } from '../data/landcover';

/** Ortam seslerinin katman seviyeleri (0–1). */
export interface AmbientLevels {
  /** Rüzgâr: rakımla artar, sık ormanda boğulur, sundurma altında azalır. */
  wind: number;
  /** Deniz dalgaları: kıyıya yakınlıkla. */
  sea: number;
  /** Yaprak hışırtısı: orman/çalı üstünde. */
  leaves: number;
  /** Kuş ötüşü: gündüz, bitki örtülü yerde. */
  birds: number;
  /** Gece sesleri (cırcır böceği, baykuş): gece, çok yüksek olmayan yerde. */
  night: number;
}

/** Seviyeleri belirleyen durum. */
export interface AmbientInput {
  /** Gerçek rakım (m). */
  elevationM: number;
  /** En yakın denize uzaklık (oyun m); denizdeyse 0. */
  seaDistance: number;
  /** Bulunulan yerin arazi örtüsü sınıfı. */
  cover: LandCoverClass;
  /** Güneşin ufuk üstündeki yüksekliği (derece). */
  sunAltitudeDeg: number;
  /** Sundurma altında mı? */
  sheltered: boolean;
}

export const SILENT: Readonly<AmbientLevels> = {
  wind: 0,
  sea: 0,
  leaves: 0,
  birds: 0,
  night: 0,
};

/** Arazi örtüsüne göre yaprak hışırtısı ağırlığı. */
const LEAVES_WEIGHT: Readonly<Record<LandCoverClass, number>> = {
  none: 0,
  forest: 1,
  shrub: 0.6,
  grass: 0.15,
  crop: 0.2,
  barren: 0,
  urban: 0.1,
  snow: 0,
  wetland: 0.3,
};

/** Arazi örtüsüne göre kuş çeşitliliği ağırlığı. */
const BIRD_WEIGHT: Readonly<Record<LandCoverClass, number>> = {
  none: 0,
  forest: 1,
  shrub: 0.7,
  grass: 0.4,
  crop: 0.4,
  barren: 0.05,
  urban: 0.3,
  snow: 0,
  wetland: 0.6,
};

/** Gece böcekleri için uygunluk (çıplak kaya/kar/deniz değil). */
const INSECT_WEIGHT: Readonly<Record<LandCoverClass, number>> = {
  none: 0.2,
  forest: 1,
  shrub: 1,
  grass: 1,
  crop: 0.9,
  barren: 0.2,
  urban: 0.4,
  snow: 0,
  wetland: 1,
};

/** 0 → 1 yumuşak geçiş (`edge0` ≤ x ≤ `edge1`; ters aralıkta da çalışır). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

/** Gündüz derecesi (0 gece … 1 gündüz) güneş yüksekliğinden. */
export function daylight(sunAltitudeDeg: number): number {
  return smoothstep(AMBIENT.daySunStartDeg, AMBIENT.dayFullSunDeg, sunAltitudeDeg);
}

/** Gece derecesi (0 gündüz … 1 gece) güneş yüksekliğinden. */
export function nightness(sunAltitudeDeg: number): number {
  return smoothstep(AMBIENT.nightSunStartDeg, AMBIENT.nightFullSunDeg, sunAltitudeDeg);
}

/**
 * Konum ve zamandan ortam ses seviyeleri (saf mantık, Web Audio'dan bağımsız; testli). Katmanlar birbirinden
 * bağımsız değişir; karışımı ve ana ses seviyesini `AmbientAudio` uygular.
 */
export function ambientMix(input: Readonly<AmbientInput>): AmbientLevels {
  const { elevationM, seaDistance, cover, sunAltitudeDeg, sheltered } = input;

  // Rüzgâr: rakımla artar; sık ormanda boğulur, sundurma altında azalır.
  const height = clamp01(Math.max(elevationM, 0) / AMBIENT.windFullElevationM);
  let wind = AMBIENT.windBase + (1 - AMBIENT.windBase) * height;
  if (cover === 'forest') wind *= AMBIENT.windForestMuffle;
  if (sheltered) wind *= AMBIENT.windShelterMuffle;

  // Deniz: yakınlıkla yumuşakça artar (kıyıdan uzaklaştıkça tamamen kesilir).
  const sea = 1 - smoothstep(AMBIENT.seaNearDistance, AMBIENT.seaFarDistance, seaDistance);

  // Yaprak: kaynağı orman/çalı; rüzgâr arttıkça daha belirgin.
  const leaves = LEAVES_WEIGHT[cover] * (0.5 + 0.5 * clamp01(wind / 0.6));

  // Kuşlar: gündüz, bitki örtülü ve çok yüksek olmayan yerde.
  const bird =
    BIRD_WEIGHT[cover] * daylight(sunAltitudeDeg) * (1 - smoothstep(1400, 2000, elevationM));

  // Gece sesleri: geceleyin, böcek yaşayabilecek yerde ve rakım sınırının altında.
  const insect =
    INSECT_WEIGHT[cover] *
    nightness(sunAltitudeDeg) *
    (1 - smoothstep(AMBIENT.insectMaxElevationM * 0.7, AMBIENT.insectMaxElevationM, elevationM));

  // Denizin içindeki oyuncu karasal sesleri (yaprak, kuş, böcek) duymaz.
  const onLand = seaDistance <= 0 ? 0 : 1;

  return {
    wind: clamp01(wind),
    sea: clamp01(sea),
    leaves: clamp01(leaves) * onLand,
    birds: clamp01(bird) * onLand,
    night: clamp01(insect) * onLand,
  };
}

/**
 * Bir zamanlayıcı adımında (`dtSeconds`) kuş ötmesi ve baykuş ötmesi olasılığı (0–1). Kuş sıklığı kuş
 * seviyesiyle, baykuş sıklığı gece seviyesiyle orantılıdır; baykuş ağırlıklı olarak ormanlık yerde öter.
 */
export function eventChances(
  levels: Readonly<AmbientLevels>,
  dtSeconds: number,
): { bird: number; owl: number } {
  const bird = levels.birds * AMBIENT.birdPerSecondAtFull * dtSeconds;
  const owlHabitat = levels.leaves > 0.3 ? 1 : 0.2;
  const owl = levels.night * owlHabitat * AMBIENT.owlPerSecondAtFull * dtSeconds;
  return { bird: clamp01(bird), owl: clamp01(owl) };
}
