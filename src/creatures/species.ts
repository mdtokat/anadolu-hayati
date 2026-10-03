import type { LandCoverClass } from '../data/landcover';
import { absoluteCreatureId } from '../world/chunkKeys';
import { CREATURE_KINDS, type CreatureId, type CreatureKind } from './kinds';

/**
 * Tür tablosu (5.1, saf veri). Sayılar `docs/faz-5-paralel-plan.md` §3.5'ten başlar; ekoloji **yaklaşıktır**
 * (oyun dengesi için, bilimsel dağılım değil) ve 5.5'te ölçümle ayarlanır. Süreler gerçek saniye, uzaklıklar
 * oyun metresidir.
 */

/** Davranış ailesi: durum makinesinin hangi geçiş kümesini kullanacağı (`ai.ts`). */
export type Behavior =
  /** Kaçak otobur: fark eder, uyarı verir, kaçar; kendini savunmaz. */
  | 'skittish'
  /** Savunmacı: dokunulmazsa kaçınır; yakınlaşılırsa/vurulursa kovalar ve saldırır. */
  | 'defensive'
  /** Avcı: aç/zayıf hedefe sinsi yaklaşıp kovalar; yaralanınca kaçar. */
  | 'hunter';

/** Yamuk üyelik köşeleri `[a, b, c, d]`: a→b 0→1, b→c 1, c→d 1→0. */
export type Trapezoid = readonly [number, number, number, number];

export interface SpeciesDef {
  kind: CreatureKind;
  /** Oyuncuya gösterilen ad. */
  label: string;
  behavior: Behavior;
  /** Yırtıcı mı: otoburlar yakındaki yırtıcıdan kaçar. */
  predator: boolean;

  maxHealth: number;
  /** Ham saldırı hasarı (savunma öncesi); 0 = saldırmaz. */
  attackDamage: number;
  /** Saldırı menzili (oyun m, hedef merkezine). */
  attackRange: number;
  /** Saldırı hazırlığı (sn): bu sürenin sonunda vuruş gelir. */
  attackWindup: number;
  /** Vuruştan sonra toparlanma (sn). */
  attackRecover: number;
  /** Bir saldırı bittikten sonra yenisine kadar bekleme (sn). */
  attackCooldown: number;

  /** Yürüme / koşma hızı (oyun m/sn). */
  walkSpeed: number;
  runSpeed: number;
  /** Dönüş hızı (rad/sn). */
  turnRate: number;
  /** Vuruş hacmi: yatay yarıçap ve boy (oyun m). */
  radius: number;
  height: number;
  /** En dik çıkabildiği/dolaşabildiği eğim (oyun uzayı, derece). Oyuncu sınırını (60°) aşmaz. */
  maxSlopeDeg: number;

  perception: {
    /** Gündüz görüş mesafesi ve bakış konisinin yarı açısı (derece). */
    sightRange: number;
    sightHalfAngleDeg: number;
    /** Gece görüş çarpanı (1 = gündüz kadar). */
    nightSightFactor: number;
    /** Koşan oyuncuyu duyma mesafesi (yürüyen/dinlenen `CREATURES.noise` ile küçülür). */
    hearRange: number;
  };

  /** Etkinlik (doğma/kalma) ağırlığı 0–1: gündüz, alacakaranlık, gece. */
  activity: { day: number; dusk: number; night: number };

  /** Grup boyutu (aralık, uçlar dahil) ve sürü gibi hareket ediyor mu (grup çevresinde dolaşır). */
  group: readonly [number, number];

  /** Yanan ateşin bu yarıçapında (oyun m) canlı girmez/kaçar; 0 = çekinmez. */
  fireAvoidRadius: number;

  /** Davranış parametreleri (aile dışı alanlar 0'dır). */
  alertSeconds: number;
  /** Kaçak/savunmacı: tehdit bu uzaklıktan yakınsa doğrudan kaçar (skittish). */
  fleeTriggerDist: number;
  fleeSeconds: number;
  /** Kaçışın bittiği güvenli uzaklık (tehdide). */
  safeDist: number;
  /** Savunmacı: oyuncu bu uzaklığa girince kovalar. */
  aggroDist: number;
  /** Avcı: fark edince sinsi yaklaşmaya başlama üst uzaklığı. */
  stalkRange: number;
  /** Avcı: sinsi yaklaşma bu uzaklığa inince saldırıya geçer. */
  chargeDist: number;
  /** Avcı: hedefin zayıflığı (0–1, `CreatureContext.player.weakness`) bu değeri aşarsa gündüz de sinsi yaklaşır. */
  weaknessThreshold: number;
  /** Avcı/savunmacı: karanlıkta (0–1) bu değerin üstünde sinsi yaklaşır/saldırgan olur. */
  darknessThreshold: number;
  /** Kovalama en çok bu süre (sn) sürer; oyuncu bu uzaklığın ötesine çıkarsa bırakır. */
  chaseSeconds: number;
  loseDist: number;
  /** Sağlık oranı (0–1) bunun altına inince kaçar. */
  woundedFraction: number;
  /** Dolaşma yarıçapı (doğduğu noktadan, oyun m). */
  wanderRadius: number;

  /**
   * Kuş: kaçarken bu yüksekliğe (oyun m, zeminden) havalanır, kaçış bitince konar; 0 = uçmaz. Görünüm ve vuruş
   * hacmi yüksekliği izler (`CreatureView.y`).
   */
  flightHeight?: number;

  habitat: {
    /** Arazi örtüsü sınıfı → uygunluk (0–1); listede olmayan sınıfta doğmaz. */
    cover: Partial<Record<LandCoverClass, number>>;
    /** Gerçek rakım (m) uygunluğu. */
    elevation: Trapezoid;
    /** 65 536 m²'lik hücrede uygun yerde beklenen grup sayısı. */
    density: number;
  };
}

/** Tür tablosu. Yeni tür yalnızca `CREATURE_KINDS`'in sonuna eklenir. */
export const SPECIES: Readonly<Record<CreatureKind, SpeciesDef>> = {
  roe_deer: {
    kind: 'roe_deer',
    label: 'Karaca',
    behavior: 'skittish',
    predator: false,
    maxHealth: 40,
    attackDamage: 0,
    attackRange: 0,
    attackWindup: 0,
    attackRecover: 0,
    attackCooldown: 0,
    walkSpeed: 1.5,
    runSpeed: 9,
    turnRate: 4,
    radius: 0.4,
    height: 0.85,
    maxSlopeDeg: 50,
    perception: { sightRange: 70, sightHalfAngleDeg: 120, nightSightFactor: 0.5, hearRange: 40 },
    activity: { day: 1, dusk: 1, night: 0.35 },
    group: [1, 3],
    fireAvoidRadius: 6,
    alertSeconds: 3.5,
    fleeTriggerDist: 2,
    fleeSeconds: 6,
    safeDist: 90,
    aggroDist: 0,
    stalkRange: 0,
    chargeDist: 0,
    weaknessThreshold: 0,
    darknessThreshold: 0,
    chaseSeconds: 0,
    loseDist: 0,
    woundedFraction: 0,
    wanderRadius: 45,
    habitat: {
      // Orman kenarı/çalı/çayır/tarım; yoğun ormanın içi biraz daha az.
      cover: { forest: 0.7, shrub: 1, grass: 1, crop: 0.9 },
      elevation: [2, 15, 1500, 1700],
      density: 1.2,
    },
  },
  wild_boar: {
    kind: 'wild_boar',
    label: 'Yaban domuzu',
    behavior: 'defensive',
    predator: false,
    maxHealth: 90,
    attackDamage: 18,
    attackRange: 1.8,
    attackWindup: 0.5,
    attackRecover: 0.5,
    attackCooldown: 1,
    walkSpeed: 1.4,
    runSpeed: 7,
    turnRate: 3,
    radius: 0.45,
    height: 0.9,
    maxSlopeDeg: 40,
    perception: { sightRange: 60, sightHalfAngleDeg: 70, nightSightFactor: 0.5, hearRange: 70 },
    activity: { day: 0.6, dusk: 1, night: 1 },
    // Kullanıcı talimatı: domuz sayısı azaltıldı (grup 2–5 → 1–3, yoğunluk 1,2 → 0,8: ~%60 az).
    group: [1, 3],
    fireAvoidRadius: 6,
    alertSeconds: 4,
    fleeTriggerDist: 0,
    fleeSeconds: 6,
    safeDist: 60,
    aggroDist: 9,
    stalkRange: 0,
    chargeDist: 0,
    weaknessThreshold: 0,
    darknessThreshold: 0,
    chaseSeconds: 10,
    loseDist: 50,
    woundedFraction: 0,
    wanderRadius: 40,
    habitat: {
      // Orman, çalı ve tarım (fındık bahçeleri).
      cover: { forest: 1, shrub: 0.7, crop: 1 },
      elevation: [2, 15, 1400, 1500],
      density: 0.8,
    },
  },
  wolf: {
    kind: 'wolf',
    label: 'Kurt',
    behavior: 'hunter',
    predator: true,
    maxHealth: 70,
    attackDamage: 12,
    attackRange: 1.6,
    attackWindup: 0.35,
    attackRecover: 0.45,
    attackCooldown: 1.2,
    walkSpeed: 2,
    runSpeed: 9,
    turnRate: 4,
    radius: 0.35,
    height: 0.8,
    maxSlopeDeg: 50,
    perception: { sightRange: 140, sightHalfAngleDeg: 90, nightSightFactor: 0.9, hearRange: 130 },
    activity: { day: 0.1, dusk: 1, night: 1 },
    group: [2, 4],
    fireAvoidRadius: 25,
    alertSeconds: 4,
    fleeTriggerDist: 0,
    fleeSeconds: 10,
    safeDist: 70,
    aggroDist: 0,
    stalkRange: 70,
    chargeDist: 18,
    weaknessThreshold: 0.35,
    darknessThreshold: 0.5,
    chaseSeconds: 14,
    loseDist: 90,
    woundedFraction: 0.15,
    wanderRadius: 80,
    habitat: {
      cover: { forest: 1, shrub: 0.5 },
      elevation: [200, 300, 1900, 2100],
      density: 0.35,
    },
  },
  brown_bear: {
    kind: 'brown_bear',
    label: 'Boz ayı',
    behavior: 'defensive',
    predator: true,
    maxHealth: 250,
    attackDamage: 40,
    attackRange: 2.2,
    attackWindup: 0.7,
    attackRecover: 0.8,
    attackCooldown: 1.6,
    walkSpeed: 1.6,
    runSpeed: 8,
    turnRate: 2.5,
    radius: 0.6,
    height: 1.3,
    maxSlopeDeg: 45,
    perception: { sightRange: 100, sightHalfAngleDeg: 80, nightSightFactor: 0.6, hearRange: 90 },
    activity: { day: 1, dusk: 1, night: 0.4 },
    group: [1, 1],
    fireAvoidRadius: 8,
    alertSeconds: 5,
    fleeTriggerDist: 0,
    fleeSeconds: 10,
    safeDist: 80,
    aggroDist: 18,
    stalkRange: 0,
    chargeDist: 0,
    weaknessThreshold: 0,
    darknessThreshold: 0,
    chaseSeconds: 12,
    loseDist: 70,
    woundedFraction: 0.12,
    wanderRadius: 100,
    habitat: {
      // Yalnız yüksek orman; çok seyrek.
      cover: { forest: 1 },
      elevation: [500, 650, 1800, 2100],
      // Arazi yumuşatmasıyla yaşam alanı genişledi (eğim): 0,8 → 0,55 (karşılaşma sıklığı korunur).
      density: 0.55,
    },
  },
  red_deer: {
    kind: 'red_deer',
    label: 'Kızıl geyik',
    behavior: 'skittish',
    predator: false,
    maxHealth: 120,
    attackDamage: 0,
    attackRange: 0,
    attackWindup: 0,
    attackRecover: 0,
    attackCooldown: 0,
    walkSpeed: 1.6,
    runSpeed: 10,
    turnRate: 3.5,
    radius: 0.6,
    height: 1.4,
    maxSlopeDeg: 45,
    perception: { sightRange: 90, sightHalfAngleDeg: 120, nightSightFactor: 0.55, hearRange: 60 },
    activity: { day: 0.8, dusk: 1, night: 0.5 },
    group: [1, 4],
    fireAvoidRadius: 8,
    alertSeconds: 3,
    fleeTriggerDist: 3,
    fleeSeconds: 8,
    safeDist: 110,
    aggroDist: 0,
    stalkRange: 0,
    chargeDist: 0,
    weaknessThreshold: 0,
    darknessThreshold: 0,
    chaseSeconds: 0,
    loseDist: 0,
    woundedFraction: 0,
    wanderRadius: 70,
    habitat: {
      // Yüksek, geniş ormanlar (Yedigöller, Köroğlu): ormanın içi ve kenarındaki açıklıklar.
      cover: { forest: 1, shrub: 0.6, grass: 0.5 },
      elevation: [300, 600, 1700, 1900],
      density: 0.3,
    },
  },
  red_fox: {
    kind: 'red_fox',
    label: 'Tilki',
    behavior: 'skittish',
    predator: false,
    maxHealth: 25,
    attackDamage: 0,
    attackRange: 0,
    attackWindup: 0,
    attackRecover: 0,
    attackCooldown: 0,
    walkSpeed: 1.8,
    runSpeed: 10,
    turnRate: 5,
    radius: 0.25,
    height: 0.45,
    maxSlopeDeg: 50,
    perception: { sightRange: 60, sightHalfAngleDeg: 100, nightSightFactor: 0.9, hearRange: 70 },
    activity: { day: 0.4, dusk: 1, night: 1 },
    group: [1, 1],
    fireAvoidRadius: 10,
    alertSeconds: 2.5,
    fleeTriggerDist: 4,
    fleeSeconds: 7,
    safeDist: 70,
    aggroDist: 0,
    stalkRange: 0,
    chargeDist: 0,
    weaknessThreshold: 0,
    darknessThreshold: 0,
    chaseSeconds: 0,
    loseDist: 0,
    woundedFraction: 0,
    wanderRadius: 60,
    habitat: {
      // Her yerde: orman kenarı, çalılık, tarla.
      cover: { forest: 0.8, shrub: 1, grass: 0.8, crop: 0.8 },
      elevation: [2, 12, 1600, 1900],
      density: 0.3,
    },
  },
  hare: {
    kind: 'hare',
    label: 'Yabani tavşan',
    behavior: 'skittish',
    predator: false,
    maxHealth: 12,
    attackDamage: 0,
    attackRange: 0,
    attackWindup: 0,
    attackRecover: 0,
    attackCooldown: 0,
    walkSpeed: 1.2,
    runSpeed: 11,
    turnRate: 6,
    radius: 0.2,
    height: 0.35,
    maxSlopeDeg: 50,
    perception: { sightRange: 45, sightHalfAngleDeg: 150, nightSightFactor: 0.6, hearRange: 35 },
    activity: { day: 0.5, dusk: 1, night: 0.8 },
    group: [1, 2],
    fireAvoidRadius: 6,
    alertSeconds: 2,
    fleeTriggerDist: 3,
    fleeSeconds: 5,
    safeDist: 60,
    aggroDist: 0,
    stalkRange: 0,
    chargeDist: 0,
    weaknessThreshold: 0,
    darknessThreshold: 0,
    chaseSeconds: 0,
    loseDist: 0,
    woundedFraction: 0,
    wanderRadius: 35,
    habitat: {
      cover: { grass: 1, crop: 1, shrub: 0.8, forest: 0.3 },
      elevation: [2, 8, 1700, 2000],
      density: 0.7,
    },
  },
  pheasant: {
    kind: 'pheasant',
    label: 'Sülün',
    behavior: 'skittish',
    predator: false,
    maxHealth: 8,
    attackDamage: 0,
    attackRange: 0,
    attackWindup: 0,
    attackRecover: 0,
    attackCooldown: 0,
    walkSpeed: 0.9,
    runSpeed: 9,
    turnRate: 6,
    radius: 0.25,
    height: 0.5,
    maxSlopeDeg: 50,
    perception: { sightRange: 40, sightHalfAngleDeg: 150, nightSightFactor: 0.3, hearRange: 30 },
    activity: { day: 1, dusk: 0.7, night: 0.1 },
    group: [1, 3],
    fireAvoidRadius: 6,
    alertSeconds: 1.5,
    fleeTriggerDist: 5,
    fleeSeconds: 5,
    safeDist: 80,
    aggroDist: 0,
    stalkRange: 0,
    chargeDist: 0,
    weaknessThreshold: 0,
    darknessThreshold: 0,
    chaseSeconds: 0,
    loseDist: 0,
    woundedFraction: 0,
    wanderRadius: 30,
    flightHeight: 7,
    habitat: {
      // Karadeniz sülünü: kıyı ovası, çalılık, fındık bahçesi, sulak kenarı.
      cover: { shrub: 1, crop: 0.9, grass: 0.7, forest: 0.4, wetland: 0.8 },
      elevation: [2, 6, 900, 1200],
      density: 0.5,
    },
  },
};

/** Türün tablosu. */
export function speciesOf(kind: CreatureKind): SpeciesDef {
  return SPECIES[kind];
}

/** Bir hücrede en çok bu kadar canlı (kimlik alanı 8 bit). */
export const MAX_CREATURES_PER_CELL = 256;

/**
 * `creatureId(cellKey, index) = cellKey * 256 + index` (< 2⁴⁰); hücre anahtarı mutlak chunk anahtarıdır
 * (`chunkKeys.absoluteCreatureId`). Aynı tohum → aynı kimlik.
 */
export function creatureId(cellKey: number, index: number): CreatureId {
  return absoluteCreatureId(cellKey, index);
}

export function decodeCreatureId(id: CreatureId): { cellKey: number; index: number } {
  return {
    cellKey: Math.floor(id / MAX_CREATURES_PER_CELL),
    index: id % MAX_CREATURES_PER_CELL,
  };
}

/** Tablo, tür listesindeki her türü içeriyor mu? (Yeni tür eklenip tablo unutulursa testte yakalanır.) */
export function speciesTableComplete(): boolean {
  return CREATURE_KINDS.every((kind) => SPECIES[kind]?.kind === kind);
}
