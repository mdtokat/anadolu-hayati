/**
 * Tüm ayarlanabilir sabitler burada durur (CLAUDE.md: "Sihirli sayı yok").
 * Koordinat/ölçek değerleri veri hattı (tools/) ile oyun arasındaki sözleşmedir;
 * değiştirirsen her iki tarafı da güncelle.
 */

/** Yatay ölçek: 1 oyun metresi = 50 gerçek metre. */
export const HORIZONTAL_SCALE = 50;

/** Dikey ölçek: 1 oyun metresi = 15 gerçek metre (dağlar etkileyici görünsün diye yataydan az sıkıştırılır). */
export const VERTICAL_SCALE = 15;

/** Bölge verisinin projeksiyonu (UTM Zone 36N). */
export const REGION_CRS = 'EPSG:32636';

/** Oyuncu boyu (oyun metresi; dünya ölçeklidir, oyuncu değil). */
export const PLAYER_HEIGHT = 1.8;

/** Oyun mantığı ve fizik için sabit zaman adımı sıklığı (Hz). */
export const FIXED_UPDATE_HZ = 60;

/** Sabit adım süresi (saniye). */
export const FIXED_STEP = 1 / FIXED_UPDATE_HZ;

/**
 * Bir karede işlenecek en uzun gerçek süre (saniye). Sekme arka plandan dönünce
 * veya takılma olunca "ölüm sarmalı"nı (spiral of death) önler.
 */
export const MAX_FRAME_TIME = 0.25;

/** Sahne ayarları (Faz 0 test sahnesi). */
export const SCENE = {
  /** Gökyüzü ve sis rengi. */
  skyColor: 0x87ceeb,
  /** Zemin düzleminin kenar uzunluğu (oyun metresi). */
  groundSize: 200,
  groundColor: 0x4a7c3a,
  /** Sis: başlangıç ve bitiş mesafesi (oyun metresi). */
  fogNear: 40,
  fogFar: 160,
  /** Dönen küpün kenarı (oyun metresi) ve dönüş hızı (radyan/saniye). */
  cubeSize: 2,
  cubeColor: 0xd9822b,
  cubeSpinSpeed: 1,
  /** Küpün zeminden yüksekliği (merkezi, oyun metresi). */
  cubeHeight: 2,
} as const;

/** Kamera ayarları. */
export const CAMERA = {
  /** Dikey görüş açısı (derece). */
  fov: 70,
  near: 0.1,
  far: 500,
  /** Faz 0'da sabit bir bakış noktası; Faz 1'de oyuncu kamerası bunu değiştirir. */
  position: [6, 4, 8],
  lookAt: [0, 1.5, 0],
} as const;

/** Render ayarları. */
export const RENDER = {
  /** Yüksek DPI ekranlarda piksel oranı üst sınırı (performans için). */
  maxPixelRatio: 2,
} as const;

/** Geliştirici araçları (yalnızca dev modunda görünür). */
export const DEBUG = {
  /** FPS sayacının ortalama aldığı pencere (saniye). */
  fpsSampleSeconds: 0.5,
} as const;
