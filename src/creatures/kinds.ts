import type { LandCoverClass } from '../data/landcover';
import type { Activity } from '../survival/vitals';

/**
 * Faz 5 sözleşmesi (docs/faz-5-paralel-plan.md §3): simülasyon (`CreatureSystem`) ile oyuncu tarafı
 * (çizim, saldırı, av) yalnızca bu tipler ve `core/events.ts` üzerinden konuşur; birbirinin dosyasını
 * import etmez. Değişiklik gerekirse plan belgesi de güncellenir.
 */

/** Canlı türleri (yalnızca sona eklenir). */
export const CREATURE_KINDS = ['roe_deer', 'wild_boar', 'wolf', 'brown_bear'] as const;
export type CreatureKind = (typeof CREATURE_KINDS)[number];

/** Oturumlar arası sabit kimlik: `creatureId(cellKey, index) = cellKey * 256 + index` (aynı tohum → aynı kimlik). */
export type CreatureId = number;

/** Yapay zekâ durumları (yalnızca sona eklenir). `dead` uç durumdur (leş). */
export const CREATURE_STATES = [
  'idle',
  'wander',
  'graze',
  'alert',
  'flee',
  'stalk',
  'chase',
  'attack',
  'dead',
] as const;
export type CreatureState = (typeof CREATURE_STATES)[number];

/** Bir canlının bir andaki görünümü: simülasyon üretir, çizim ve oyuncu tarafı (saldırı, kesme) tüketir. */
export interface CreatureView {
  id: CreatureId;
  kind: CreatureKind;
  /** Oyun koordinatı; y = ayak/zemin. */
  x: number;
  y: number;
  z: number;
  /** Bakış yönü; `Player` ile aynı yaw sözleşmesi (0 = −Z, pozitif sola döner). */
  yaw: number;
  /** Yatay hız (oyun m/sn): yürüme/koşma animasyonu buradan sürülür. */
  speed: number;
  state: CreatureState;
  /** Saldırı hamlesi ilerlemesi (0–1); `attack` dışında 0. */
  attackPhase: number;
  /** Vurulma parlaması (0–1); simülasyon ayarlar, zamanla söner. */
  hitFlash: number;
  health: number;
  maxHealth: number;
  /** Vuruş hacmi: yatay yarıçap ve boy (oyun m). */
  radius: number;
  height: number;
  /** Leş mi (`state === 'dead'`)? */
  dead: boolean;
  /** Öleli beri geçen gerçek saniye (leş solma/çürüme için); canlıda 0. */
  deadSeconds: number;
}

/** Canlıların arazi sorguları; `RegionWorld` sağlar (5.4'te A genişletir). */
export interface CreatureTerrain {
  heightAt(x: number, z: number): number;
  /** Oyun uzayı eğimi (derece). */
  slopeDegAt(x: number, z: number): number;
  /** Gerçek rakım (m). */
  elevationAt(x: number, z: number): number;
  coverAt(x: number, z: number): LandCoverClass;
  /** Deniz (ya da harita dışı) mı? */
  isSea(x: number, z: number): boolean;
  /** (x, z)'ye `maxDistance` içinde tatlı su var mı? */
  waterNear(x: number, z: number, maxDistance: number): boolean;
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** `CreatureSystem.update` her sabit adımda dünyadan/oyuncudan bunu alır (`Game.creatureContext()` üretir). */
export interface CreatureContext {
  player: {
    x: number;
    y: number;
    z: number;
    activity: Activity;
    alive: boolean;
    /** Bakış yönü (yaw); verilirse oyuncunun görüş konisinde canlı doğmaz. */
    yaw?: number;
    /** Zayıflık 0–1 (1 = çok aç/susuz/yaralı): avcılar zayıf hedefi gündüz de izler. Verilmezse 0. */
    weakness?: number;
    /** Faz 10: oyuncu caminin içinde (kutsal, güvenli alan): canlılar onu algılamaz, izlemez, saldırmaz. */
    sanctuary?: boolean;
  };
  hour: number;
  sunAltitudeDeg: number;
  isNight: boolean;
  /** Yanan ateşlerin konumları (yırtıcılar çekinir). */
  fires: ReadonlyArray<{ x: number; z: number }>;
  /** Tüm yapıların (ateş, sundurma) konumları: çevrelerinde canlı doğmaz. Verilmezse `fires` kullanılır. */
  structures?: ReadonlyArray<{ x: number; z: number }>;
  /** Arazi sorguları; destekleyen dünya yoksa (test arenası) null ve canlı oluşmaz. */
  terrain: CreatureTerrain | null;
}

/** Dev HUD satırı ve testler için anlık sayımlar. */
export interface CreatureStats {
  /** Etkin (yaşayan + leş) canlı sayısı. */
  active: number;
  /** Bunlardan leş olanlar. */
  carcasses: number;
}
