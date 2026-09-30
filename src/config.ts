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

/** Sahne ayarları (Faz 1 test ortamı). */
export const SCENE = {
  /** Gökyüzü ve sis rengi. */
  skyColor: 0x87ceeb,
  /** Sis: başlangıç ve bitiş mesafesi (oyun metresi). */
  fogNear: 60,
  fogFar: 220,
  /** Güneş ışığı yoğunluğu, yönü (konum, hedef orijindedir) ve ortam ışığı yoğunluğu. */
  sunIntensity: 2.2,
  sunPosition: [60, 100, 40],
  ambientIntensity: 0.6,
} as const;

/** Kamera ayarları. */
export const CAMERA = {
  /** Dikey görüş açısı (derece). */
  fov: 70,
  near: 0.1,
  far: 5000,
  /** Bakışta yukarı/aşağı sınırı (derece); 90'a çok yakın değerler kamerayı ters çevirir. */
  maxPitchDeg: 89,
  /** Üçüncü şahıs: kameranın oyuncudan uzaklığı (oyun metresi). */
  thirdPersonDistance: 4,
  /** Üçüncü şahıs: kameranın baktığı nokta (ayak tabanından yükseklik, omuz hizası). */
  thirdPersonPivotHeight: 1.5,
  /** Üçüncü şahıs: kameranın zeminden asgari yüksekliği (yerin altına girmesin). */
  thirdPersonGroundClearance: 0.3,
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
  /** Oyuncunun doğduğu X/Z noktası (düz alanın merkezi). */
  spawn: { x: 0, z: 0 },
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
  /**
   * Tek bir fare olayında kabul edilen en büyük hareket (piksel). Bazı tarayıcılar pointer lock
   * alındığı anda tek seferlik dev bir delta gönderir; bu sınır kamerayı sıçratmasını önler.
   */
  maxMouseDeltaPerEvent: 250,
} as const;

/** Test ortamındaki engeller: elle yerleştirilmiş parkur + seed'li kayalar. */
export const OBSTACLES = {
  seed: 20240607,
  /** Seed'li kaya (kutu) sayısı. */
  rockCount: 60,
  /** Kaya boyut aralıkları (oyun metresi). */
  rockMinSize: 1.5,
  rockMaxSize: 5,
  rockMinHeight: 1,
  rockMaxHeight: 4,
  /** Kayaların yere gömülme payı (oyun metresi): havada asılı görünmesinler. */
  rockSink: 0.3,
  /** Kayalar doğma yarıçapı + bu paydan öteye yerleşir (parkur ve rampalar boş kalsın). */
  rockClearMargin: 4,
  /** Kayaların arazi kenarından uzaklığı (oyun metresi). */
  rockEdgeMargin: 10,
  rockColor: 0x8a8378,
  courseColor: 0xb5651d,
  /**
   * Hareket parkuru (düz alanda, doğma noktasının +Z tarafında). `h` blok yüksekliği:
   * 0,3 = otomatik basamak; 0,6 ve 1,0 = zıplayarak çıkılır; 2,0 = aşılamaz duvar.
   */
  course: [
    { x: -20, z: 22, w: 4, h: 0.3, d: 6 },
    { x: -12, z: 22, w: 4, h: 0.6, d: 6 },
    { x: -4, z: 22, w: 4, h: 1.0, d: 6 },
    { x: 4, z: 22, w: 4, h: 2.0, d: 6 },
  ],
} as const;

/** Oyuncu modeli (üçüncü şahıs görünümünde çizilen kapsül). */
export const PLAYER_MODEL = {
  bodyColor: 0x2f6fdf,
  /** Bakış yönünü gösteren küçük "burun" bloğunun rengi. */
  noseColor: 0xffd23f,
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

/** Arazi chunk sistemi ve LOD ayarları (Faz 2). */
export const CHUNK = {
  /** Bir chunk'ın kenarındaki hücre sayısı (chunk = 129×129 köşe, komşularla kenar paylaşır). */
  cells: 128,
  /** LOD başına örnek atlama: LOD0 = her örnek, LOD1 = her 2., … (köşe sayısı: 129, 65, 33, 17). */
  lodStrides: [1, 2, 4, 8],
  /** LOD geçiş uzaklıkları (oyun m, oyuncudan chunk'a): LOD0→1, LOD1→2, LOD2→3. */
  lodDistances: [200, 550, 1300],
  /** LOD geçişinde titremeyi (flapping) önleyen oransal histerezis. */
  lodHysteresis: 0.15,
  /** LOD başına etek derinliği (oyun m): farklı LOD'lu komşular arasındaki çatlakları kapatır. */
  skirtDepth: [1, 2, 4, 8],
  /** Bu uzaklıktan (oyun m) yakın chunk'lar yüklenir. Bölge ~4 km olduğundan hemen hepsi. */
  viewDistance: 4000,
  /** Karede kurulan en fazla chunk (mesh/collider) sayısı: kare süresi sıçramasın. */
  maxBuildsPerFrame: 2,
} as const;

/** Gerçek bölge sahnesinin ortam ayarları (bölge ~4 km; Faz 1 test sahnesinden geniş sis). */
export const REGION_SCENE = {
  /** Sis: başlangıç ve bitiş mesafesi (oyun m). Uzak LOD'ların "pop"unu da gizler. */
  fogNear: 400,
  fogFar: 3800,
} as const;

/**
 * Gerçek arazi renklendirmesi (fragment shader). Rakımlar gerçek metre, eğim eşikleri oyun uzayındaki
 * (dikey ölçek uygulanmış) eğimdir; oyuncu eğim limitiyle aynı ölçekte.
 * Orman poligonları Faz 4'te (OSM) gelecek; şimdilik rakıma bağlı koyu bir "orman zemini" tonu var.
 */
export const TERRAIN_LOOK = {
  /** Bu rakımın (m) altında, düz yerlerde kum/çakıl. */
  sandMaxElevation: 6,
  /** Kumdan çime geçiş şeridi (m). */
  sandBlend: 8,
  /** Çimden orman zeminine geçiş: [başlangıç, tam] rakım (m). */
  forestFrom: [120, 450],
  /** Orman zemininden yüksek çayıra/kayalığa geçiş: [başlangıç, tam] rakım (m). */
  alpineFrom: [1300, 1750],
  /** Kaya rengine geçiş: [başlangıç, tam] oyun eğimi (derece). */
  rockSlopeDeg: [45, 62],
  sandColor: 0xc2b280,
  grassColor: 0x5a8f3c,
  forestColor: 0x2f5a2b,
  alpineColor: 0x8a8a5c,
  rockColor: 0x6f675d,
  /** Renk gürültüsü: dünya birimi başına frekans ve genlik (0..1). */
  noiseFrequency: 0.045,
  noiseStrength: 0.22,
  /** Gürültünün sönmeye başladığı uzaklık (oyun m): uzakta titreşim (aliasing) olmasın. */
  noiseFadeDistance: 900,
} as const;
