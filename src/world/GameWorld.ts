import type { Scene } from 'three';
import type { CreatureTerrain } from '../creatures/kinds';
import type { LandCoverClass } from '../data/landcover';
import type { Vec3 } from '../player/movement';
import type { SkyPosition } from '../survival/astronomy';
import type { WaterHit } from './waterIndex';
import type { HeightSource } from './HeightSource';
import type { PropLayerStats } from './PropLayer';
import type { PropId, PropRef } from './propKinds';

/** Dünyaya çalışma zamanında uygulanan kalite değerleri (`QUALITY_PRESETS`'in dünyayı ilgilendiren kısmı). */
export interface WorldQuality {
  /** Nesnelerin (ağaç, kaya…) çizim yarıçapı (oyun m). */
  propDrawRadius: number;
  /** Arazi LOD geçiş uzaklıklarının çarpanı. */
  lodScale: number;
}

/** Ortam sesleri için bir noktanın özellikleri (yalnızca gerçek bölgede). */
export interface AmbientSample {
  /** Arazi örtüsü sınıfı (veri yoksa `none`). */
  cover: LandCoverClass;
  /** En yakın denize uzaklık (oyun m); denizdeyse 0. */
  seaDistance: number;
}

/** Konum hakkında HUD'da gösterilecek bilgi (yalnızca gerçek bölgede vardır). */
export interface LocationInfo {
  /** Bulunulan il; harita dışı/deniz ise null. */
  province: string | null;
  /** İl, bölgenin hedef illerinden biri mi (false = yürünebilir komşu il)? */
  inRegion: boolean;
  /** Gerçek rakım (m). */
  elevation: number;
}

/** Game'in oynadığı dünya: Faz 1 test arenası ya da gerçek bölge. */
export interface GameWorld {
  readonly scene: Scene;
  /** Yükseklik kaynağı (kamera zemin payı vb.). */
  readonly terrain: HeightSource;
  /** Oyuncunun doğma konumu (ayak tabanı). */
  readonly spawn: Vec3;
  /** Bu dünyada tırmanılabilir en dik yamaç (derece). */
  readonly maxSlopeDeg: number;
  /**
   * Her render karesinde çağrılır: odak (oyuncu) çevresindeki chunk/collider akışını günceller.
   * `timeSeconds`: animasyonlar (deniz dalgaları) için sürekli artan zaman.
   */
  update(focusX: number, focusZ: number, timeSeconds: number): void;
  /** Işınlanma/doğma öncesi: (x, z) çevresinin fizik ve görsel varlıklarını senkron hazırlar. */
  prepare(x: number, z: number): void;
  /** Güneşin konumuna göre gökyüzü/ışık görünümünü günceller (destekleyen dünyalarda). */
  setSun?(sun: SkyPosition): void;
  /** (x, z) noktasına erişim mesafesindeki en yakın tatlı su (nehir, göl, kaynak); yoksa null. */
  freshWaterNear?(x: number, z: number): WaterHit | null;
  /** n. ölümden sonra yeniden doğma noktası (ayak tabanı); dünya desteklemiyorsa tanımsız. */
  respawnPoint?(deathIndex: number): Vec3 | null;
  /** HUD için konum bilgisi; bu dünya desteklemiyorsa tanımsız. */
  locationInfo?(x: number, z: number, feetY: number): LocationInfo;
  /** (x, z)'ye `radius` içindeki yüklü nesneler (ağaç, kaya, bitki…), yakından uzağa; destekleyen dünyalarda. */
  propsNear?(x: number, z: number, radius: number): PropRef[];
  /** Nesneyi gizler/geri getirir (toplanan/kesilen nesne); destekleyen dünyalarda. */
  setPropDepleted?(id: PropId, depleted: boolean): void;
  /** Dev göstergesi: nesne katmanı sayımları (yoksa null ya da tanımsız). */
  readonly propStats?: PropLayerStats | null;
  /** Canlıların arazi sorguları (Faz 5); desteklemeyen dünyalarda (test arenası) tanımsız, canlı oluşmaz. */
  readonly creatureTerrain?: CreatureTerrain;
  /** (x, z)'nin ortam sesi özellikleri (örtü sınıfı, denize uzaklık); desteklemeyen dünyalarda tanımsız. */
  ambientAt?(x: number, z: number): AmbientSample;
  /** Grafik kalitesini çalışma zamanında uygular (destekleyen dünyalarda): arazi LOD çarpanı, nesne çizim yarıçapı. */
  setQuality?(quality: WorldQuality): void;
  /** İl sınırı çizgilerini aç/kapa (destekleyen dünyalarda). */
  toggleBorders?(): void;
  dispose(): void;
}
