import type { Scene } from 'three';
import type { Vec3 } from '../player/movement';
import type { HeightSource } from './HeightSource';

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
  /** HUD için konum bilgisi; bu dünya desteklemiyorsa tanımsız. */
  locationInfo?(x: number, z: number, feetY: number): LocationInfo;
  /** İl sınırı çizgilerini aç/kapa (destekleyen dünyalarda). */
  toggleBorders?(): void;
  dispose(): void;
}
