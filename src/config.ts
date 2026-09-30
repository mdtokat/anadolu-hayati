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

/** Fizik ayarları (Rapier). Adım süresi FIXED_STEP'ten gelir. */
export const PHYSICS = {
  /** Yerçekimi ivmesi (oyun m/s²). Oyun metresi gerçek boyutlu kabul edilir. */
  gravity: 9.81,
} as const;

/**
 * Faz 1 test arazisi (prosedürel). Faz 2'de gerçek yükseklik verisi aynı HeightSource
 * arayüzünün arkasına takılacak; bu değerler yalnızca test ortamını etkiler.
 */
export const TERRAIN_TEST = {
  /** Gürültü tohumu: aynı seed aynı araziyi verir. */
  seed: 1071,
  /** Arazi kenar uzunluğu (oyun metresi); orijin merkezdedir. */
  size: 400,
  /** Izgara hücre boyu (oyun metresi). */
  cellSize: 1,
  /** En yüksek tepe yüksekliği (oyun metresi). */
  amplitude: 14,
  /** Gürültü temel frekansı (1/oyun metresi). */
  frequency: 0.012,
  /** fBm oktav sayısı. */
  octaves: 4,
  /** Doğma noktası çevresinde tamamen düz kalan yarıçap (oyun metresi); test rampaları bunun içindedir. */
  spawnFlatRadius: 36,
  /** Düz alandan engebeye geçiş şeridinin genişliği (oyun metresi). */
  spawnBlendWidth: 30,
  /**
   * Elle doğrulama için sabit rampalar (yamaç – plato – yamaç). +X yönünde yükselir;
   * Z ekseninde `z ± width/2` aralığını kaplar. `angleDeg` eğim açısı, `height` plato yüksekliği,
   * `plateau` plato uzunluğu (oyun metresi).
   */
  ramps: [
    { x: 14, z: -8, width: 8, angleDeg: 30, height: 4, plateau: 4 },
    { x: 14, z: 8, width: 8, angleDeg: 60, height: 6, plateau: 4 },
  ],
  /** Rampa kenarlarındaki yumuşatma şeridi (oyun metresi). */
  rampEdgeWidth: 2,
  /** Zemin renkleri: düz yerde çim, dik yerde kaya. */
  grassColor: 0x4a7c3a,
  rockColor: 0x7a746a,
  /** Bu eğimden (normal.y) dik yüzeyler kaya rengine döner. */
  rockNormalY: 0.75,
} as const;

/** Girdi ayarları. Tuşlar `KeyboardEvent.code` değerleridir (klavye düzeninden bağımsız fiziksel tuş). */
export const INPUT = {
  bindings: {
    forward: ['KeyW', 'ArrowUp'],
    backward: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    run: ['ShiftLeft', 'ShiftRight'],
    jump: ['Space'],
    /** Birinci / üçüncü şahıs kamera geçişi. */
    toggleCamera: ['KeyV'],
  },
  /** Fare hassasiyeti: piksel başına radyan. */
  mouseSensitivity: 0.0022,
} as const;

/** Oyuncu hareketi ve kapsül ölçüleri (oyun metresi / saniye). */
export const PLAYER = {
  /** Kapsülün toplam boyu (ayaktan tepeye). */
  height: PLAYER_HEIGHT,
  /** Kapsül yarıçapı. */
  radius: 0.35,
  /** Göz yüksekliği (ayak tabanından). */
  eyeHeight: 1.65,
  /** Yürüme ve koşma hızları. */
  walkSpeed: 4,
  runSpeed: 7,
  /** Zıplama yüksekliği; başlangıç hızı yerçekiminden türetilir. */
  jumpHeight: 1.1,
  /** Yerde hedef hıza ulaşma / durma ivmesi. */
  groundAcceleration: 45,
  /** Havada yön değiştirme ivmesi (yerdekinden düşük: momentum korunur). */
  airAcceleration: 10,
  /** Serbest düşüşte hız üst sınırı. */
  maxFallSpeed: 40,
  /** Bu eğimden (derece) dik yüzeylere tırmanılamaz; oyuncu aşağı kayar. */
  maxSlopeDeg: 45,
  /** Otomatik basamak: bu yüksekliğe kadar engellere adım atar. */
  autostepHeight: 0.4,
  /** Otomatik basamak için gereken asgari basamak genişliği. */
  autostepMinWidth: 0.2,
  /** İnişlerde zemine yapışma mesafesi. */
  snapToGroundDistance: 0.3,
  /** Kontrolcünün çarpışma payı (küçük tampon). */
  controllerOffset: 0.02,
  /** Bu yüksekliğin altına düşerse doğma noktasına döner. */
  fallRespawnY: -30,
} as const;
