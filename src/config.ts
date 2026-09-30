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

/** Sahne ayarları (Faz 1 test ortamı sisi; gökyüzü ve ışıklar için bkz. SKY). */
export const SCENE = {
  /** Sis: başlangıç ve bitiş mesafesi (oyun metresi). */
  fogNear: 60,
  fogFar: 220,
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
    /** İl sınırı çizgilerini aç/kapa. */
    toggleBorders: ['KeyB'],
    /** Etkileşim (basılı tutulur): toplama, ateşe yakıt atma, tatlı su içme. */
    interact: ['KeyE'],
    /** Envanter ve üretim panelini aç/kapa. */
    toggleInventory: ['KeyI', 'Tab'],
    /** Hızlı yemek: tokluğu en çok artıran yiyeceği ye. */
    eat: ['KeyF'],
    /** Yerleştirme hayaleti: kamp ateşi / sundurma (aynı tuş iptal eder); sol tık yerleştirir. */
    placeCampfire: ['KeyC'],
    placeShelter: ['KeyG'],
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
  /**
   * LOD geçiş uzaklıkları (oyun m, oyuncudan chunk'a): LOD0→1, LOD1→2, LOD2→3. Gerçek bölgede tüm chunk'ların
   * üçgen toplamı [200, 550, 1300] ile en çok ~605 bin, bu değerlerle ~365 bin (culling öncesi).
   */
  lodDistances: [130, 350, 900],
  /** LOD geçişinde titremeyi (flapping) önleyen oransal histerezis. */
  lodHysteresis: 0.15,
  /** LOD başına etek derinliği (oyun m): farklı LOD'lu komşular arasındaki çatlakları kapatır. */
  skirtDepth: [1, 2, 4, 8],
  /** Bu uzaklıktan (oyun m) yakın chunk'lar yüklenir. Bölge ~4 km olduğundan hemen hepsi. */
  viewDistance: 4000,
  /** Karede kurulan en fazla chunk (mesh/collider) sayısı: kare süresi sıçramasın. */
  maxBuildsPerFrame: 2,
  /** Fizik: bu uzaklıktaki (oyun m) chunk'lar için Rapier heightfield collider'ı vardır. */
  physicsRadius: 160,
  /** Collider'lar `physicsRadius × bu` uzaklıktan sonra kaldırılır (histerezis). */
  physicsRemoveFactor: 1.6,
  /** Karede kurulan en fazla collider sayısı (yakınlaşırken; ışınlanmada hepsi senkron kurulur). */
  maxColliderBuildsPerFrame: 1,
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
 * Arazi örtüsü sınıfı (landcover.bin) varsa o sınıfın rengi, rakım/eğim rengini ezer; sınıfsız yerler
 * (deniz, veri yok) rakıma bağlı prosedürel renkte kalır.
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
  /** Arazi örtüsü sınıfı renkleri (landcover.bin; bkz. data/landcover.ts). */
  cover: {
    forest: 0x2a4d27,
    shrub: 0x6b7a3a,
    grass: 0x6fa043,
    crop: 0xb5a45a,
    barren: 0x9a8f7c,
    urban: 0x8d8b86,
    snow: 0xf2f4f7,
    wetland: 0x4f6b4a,
  },
  /**
   * Ormanlık/çalılık yerde kaya rengine geçişin zayıflama oranı (0..1). Gerçek yamaçlar oyunda ×3,3
   * dikleştiğinden dağlık ormanlar aksi halde gri kayaya dönerdi.
   */
  rockCoverDamp: 0.65,
  /** Renk gürültüsü: dünya birimi başına frekans ve genlik (0..1). */
  noiseFrequency: 0.045,
  noiseStrength: 0.22,
  /** Gürültünün sönmeye başladığı uzaklık (oyun m): uzakta titreşim (aliasing) olmasın. */
  noiseFadeDistance: 900,
} as const;

/**
 * Seed'li nesne yerleşimi (ağaç, kaya, çalı, yenebilir bitki; Faz 4.3). Mantık `world/scatter.ts`,
 * çizim `world/PropLayer.ts`. Uzunluklar oyun metresi (gerçek boyut: oyuncu 1,8 m), yoğunluklar
 * "nesne / 100 m² oyun alanı", rakımlar gerçek metre, eğimler oyun uzayı (dikey ölçek uygulanmış) derecesidir.
 */
export const SCATTER = {
  /** Dünya tohumu: aynı tohum aynı nesneleri (ve aynı `PropId`'leri) verir. */
  seed: 4303,
  /**
   * Aday noktaların jitter'lı ızgara aralığı (oyun m). Chunk kenarını (256 m) tam bölmeli; her aday hücre
   * en çok bir nesne verir, dolayısıyla chunk başına en çok (256 / aralık)² = 4096 nesne (kimlik sınırı 65536).
   */
  candidateSpacing: 4,
  /** Nesneler oyuncuya bu uzaklığa (oyun m) kadar çizilir; chunk'lar bu yarıçap içindeyse etkindir. */
  drawRadius: 700,
  /** Bu uzaklıktan (oyun m) yakınlar tam geometriyle, ötesi (`farLod` olan türler) ucuz geometriyle çizilir. */
  nearRadius: 140,
  /** Etkin chunk kümesi bu kadar (oyun m) hareketle yeniden hesaplanır/örnek tamponları yenilenir. */
  refreshDistance: 24,
  /** Karede hesaplanabilecek en fazla chunk (`scatterChunk`): takılma olmasın. */
  maxChunkBuildsPerFrame: 2,
  /** Hesaplanmış chunk sonuçlarının LRU önbellek kapasitesi. */
  chunkCacheSize: 64,
  /** Bu gerçek rakımın (m) altında (deniz/kıyı) nesne yok. */
  minElevation: 3,
  /** Tatlı suya bu uzaklıktan (oyun m) yakın yere ağaç/çalı dikilmez (kıyıda kaya/taş serbest). */
  waterClearance: 5,
  /** Ağaç sınırı: bu gerçek rakımın (m) üstünde ağaç yok. */
  treeLineElevation: 1700,
  /**
   * Rakım eşiklerine eklenen yavaş gürültü: yapraklı/iğne yapraklı geçişi düz bir çizgi değil, yamalı olsun.
   * `wavelength` oyun m, `amplitude` gerçek m.
   */
  elevationJitter: { wavelength: 90, amplitude: 160 },
  /**
   * Tür başına ayarlar. `height`: taban geometrinin gerçek boyu (oyun m; ölçek 1'de); `scale`: rastgele ölçek
   * aralığı (çarpan); `maxSlopeDeg`: bu oyun eğiminden dik yere konmaz; `elevation`: [a, b, c, d] gerçek m
   * yamuğu — yoğunluk a→b arasında 0→1, b→c arasında 1, c→d arasında 1→0; `waterClearance`: tatlı suya en
   * az uzaklık (oyun m); `maxInstances`: örnek tamponu kapasitesi (her kademe için); `maxDistance`: bu
   * uzaklıktan (oyun m) sonra çizilmez; `farLod`: `nearRadius`'tan uzakta ucuz geometriyle çizilir mi.
   */
  kinds: {
    tree_broadleaf: {
      height: 17,
      scale: [0.75, 1.3],
      maxSlopeDeg: 55,
      elevation: [0, 0, 600, 1100],
      waterClearance: 5,
      maxInstances: 14000,
      maxDistance: 700,
      farLod: true,
    },
    tree_conifer: {
      height: 22,
      scale: [0.75, 1.3],
      maxSlopeDeg: 55,
      elevation: [200, 900, 1700, 1750],
      waterClearance: 5,
      maxInstances: 14000,
      maxDistance: 700,
      farLod: true,
    },
    bush: {
      height: 1.2,
      scale: [0.7, 1.4],
      maxSlopeDeg: 58,
      elevation: [0, 0, 1700, 1900],
      waterClearance: 3,
      maxInstances: 20000,
      maxDistance: 300,
      farLod: true,
    },
    rock: {
      height: 1.4,
      scale: [0.4, 1.8],
      maxSlopeDeg: 90,
      elevation: [0, 0, 5000, 5000],
      waterClearance: 1.5,
      maxInstances: 8000,
      maxDistance: 450,
      farLod: true,
    },
    berry_bush: {
      height: 1.1,
      scale: [0.8, 1.25],
      maxSlopeDeg: 55,
      elevation: [0, 0, 1000, 1300],
      waterClearance: 3,
      maxInstances: 4000,
      maxDistance: 140,
      farLod: false,
    },
    hazel: {
      height: 3.5,
      scale: [0.8, 1.3],
      maxSlopeDeg: 50,
      elevation: [0, 0, 600, 900],
      waterClearance: 4,
      maxInstances: 4000,
      maxDistance: 300,
      farLod: true,
    },
    chestnut: {
      height: 16,
      scale: [0.8, 1.25],
      maxSlopeDeg: 50,
      elevation: [150, 250, 850, 950],
      waterClearance: 5,
      maxInstances: 2000,
      maxDistance: 700,
      farLod: true,
    },
    mushroom: {
      height: 0.25,
      scale: [0.7, 1.4],
      maxSlopeDeg: 40,
      elevation: [0, 0, 1500, 1700],
      waterClearance: 2,
      maxInstances: 4000,
      maxDistance: 90,
      farLod: false,
    },
    stick: {
      height: 0.3,
      scale: [0.7, 1.4],
      maxSlopeDeg: 50,
      elevation: [0, 0, 1900, 2000],
      waterClearance: 1.5,
      maxInstances: 6000,
      maxDistance: 90,
      farLod: false,
    },
    stone: {
      height: 0.3,
      scale: [0.6, 1.5],
      maxSlopeDeg: 70,
      elevation: [0, 0, 5000, 5000],
      waterClearance: 1.5,
      maxInstances: 6000,
      maxDistance: 120,
      farLod: false,
    },
  },
  /** Nesne renkleri (0xRRGGBB; vertex rengi, örnek başına ton farkı `instanceColor` ile); yüzey başı ton oynaması. */
  colors: {
    trunk: 0x5b4330,
    broadleaf: 0x3f6d2c,
    conifer: 0x25492c,
    chestnut: 0x4f7d2b,
    bush: 0x486b30,
    berryLeaf: 0x3e5f2f,
    berry: 0x401f55,
    hazel: 0x6a8a30,
    rock: 0x7d786f,
    stone: 0x8a857b,
    mushroomStem: 0xe9e0c9,
    mushroomCap: 0xb3512e,
    stick: 0x6a4e34,
    faceShade: 0.07,
  },
  /**
   * Arazi örtüsü sınıfı → tür yoğunlukları (nesne / 100 m² oyun alanı; rakım yamuğu ile çarpılır).
   * Tabloda olmayan sınıflarda (urban, snow, none) nesne yoktur. Bir sınıfın toplam yoğunluğu
   * `100 / candidateSpacing²` değerini aşmamalı (aday başına en çok bir nesne; testle doğrulanır).
   */
  density: {
    forest: {
      tree_broadleaf: 1.0,
      tree_conifer: 1.0,
      chestnut: 0.04,
      bush: 0.45,
      berry_bush: 0.06,
      mushroom: 0.12,
      stick: 0.25,
      stone: 0.12,
      rock: 0.03,
    },
    shrub: {
      bush: 1.0,
      berry_bush: 0.15,
      hazel: 0.25,
      tree_broadleaf: 0.1,
      tree_conifer: 0.05,
      rock: 0.05,
      stick: 0.15,
      stone: 0.1,
    },
    grass: { bush: 0.12, rock: 0.04, stone: 0.12 },
    crop: { hazel: 0.12, stick: 0.05 },
    barren: { rock: 0.9, stone: 0.6 },
    wetland: { bush: 0.15 },
  },
} as const;

/**
 * Canlı simülasyonu (Faz 5, Hesap A'nın bloğu). Tür tablosu (sağlık, hız, algı…) `creatures/species.ts`'tedir
 * (5.1). Buradaki değerler iskelet başlangıcıdır; 5.5'te ölçümle ayarlanır.
 */
export const CREATURES = {
  /** Dünya tohumu: aynı tohum aynı canlıları (ve aynı `CreatureId`'leri) verir. */
  seed: 5107,
  /** Aynı anda etkin (yaşayan + leş) en çok canlı: CPU ve çizim bütçesi. */
  maxActive: 40,
  /** Canlılar oyuncuya bu uzaklığa (oyun m) kadar simüle edilir. */
  simRadius: 250,
  /** Bu uzaklığın (oyun m) ötesindeki canlılar kaldırılır (simRadius'tan büyük: sınırda gidip gelmesin). */
  despawnRadius: 300,
  /** Oyuncuya bu uzaklıktan (oyun m) yakın yerde canlı doğmaz. */
  minSpawnDistance: 90,
  /** Leş bu süre (gerçek sn) sonra kendiliğinden kaybolur. */
  carcassSeconds: 300,
  /** Öldürülen canlının hücresinde yeniden doğması için beklenecek süre (gerçek sn). */
  respawnCooldownSeconds: 600,
} as const;

/** Gerçek bölgedeki oyuncu ayarları: dikleşen (×3,3) gerçek yamaçlar için daha yüksek eğim sınırı. */
export const REGION_PLAYER = {
  /**
   * Oyun eğimi sınırı (derece). VERTICAL_SCALE = 15 ve HORIZONTAL_SCALE = 50 iken gerçek eğimler 3,3 kat
   * dikleşir; 100 m ızgarada bölgenin ~%93'ü 60°'nin altındadır (45° ile yalnızca ~%64).
   */
  maxSlopeDeg: 60,
} as const;

/** Harita kenarındaki görünmez duvarlar. */
export const REGION_BOUNDS = {
  /** Duvar kalınlığı (oyun m). */
  wallThickness: 10,
  /** Duvarın en alt ve en üst y'si (oyun m): tüm arazi yüksekliğini kaplar. */
  wallBottom: -200,
  wallTop: 600,
} as const;

/** Güvenli doğma noktası araması. */
export const SPAWN_SEARCH = {
  /** Sınırın altında bırakılan pay (derece): kenarda doğan oyuncu hemen kaymasın. */
  slopeMarginDeg: 8,
  /** Gerçek rakım (m) bu değerin altındaki noktalar (deniz/kıyı çizgisi) doğma için uygun değildir. */
  minElevation: 1,
  /** Aday noktanın çevresinde de eğim denetlenir: bu yarıçapta (oyun m). */
  probeRadius: 4,
  /** En fazla arama yarıçapı (oyun m). */
  maxRadius: 800,
} as const;

/**
 * Geliştirici ışınlanma noktaları (dev modunda 1–5 tuşları). İlki oyunun başlangıç noktasıdır.
 * Konumlar enlem/boylam; en yakın yürünebilir nokta otomatik bulunur.
 */
export const TELEPORTS = [
  { name: 'Zonguldak merkez', lat: 41.4564, lon: 31.7987 },
  { name: 'Safranbolu', lat: 41.2517, lon: 32.6939 },
  { name: 'Amasra', lat: 41.7494, lon: 32.3853 },
  { name: 'Filyos vadisi', lat: 41.5667, lon: 32.0333 },
  { name: 'Yenice', lat: 41.2028, lon: 32.3358 },
] as const;

/**
 * Deniz tabanı: heightmap'te deniz 0 m'ye kırpılı olduğundan (sözleşme), oyunda deniz hücreleri
 * kıyıdan uzaklığa göre çalışma zamanında çukurlaştırılır. Böylece su yüzeyi zeminle çakışıp
 * titremez (z-fighting) ve kıyıdan açığa doğru gerçekçi bir derinleşme olur.
 */
export const SEABED = {
  /** Kıyıdan açığa doğru taban eğimi (derece). */
  slopeDeg: 12,
  /** En büyük derinlik (oyun m; gerçekte × VERTICAL_SCALE). */
  maxDepth: 4,
} as const;

/** Deniz yüzeyi (Karadeniz) ayarları. */
export const WATER = {
  /** Su yüzeyi yüksekliği (oyun m): 0'ın hemen üstü; kıyı çizgisinde zemin ile çakışıp titremesin. */
  level: 0.02,
  /** Düzlemin bölge kenarlarından taşan payı (oyun m): ufka kadar deniz. */
  margin: 9000,
  color: 0x1d5f7a,
  opacity: 0.78,
  roughness: 0.22,
  /** Dalga desenleri: dünya birimi başına frekans, animasyon hızı ve normal bozulma şiddeti. */
  waveFrequency: 0.09,
  waveSpeed: 0.55,
  waveStrength: 0.22,
} as const;

/** İl sınırı çizgileri: yere yapışık ince çizgi (WebGL'de çizgi kalınlığı 1 pikseldir). */
export const BORDERS = {
  /** Çizgi köşeleri arası en büyük aralık (oyun m): arazi yüksekliğini izlesin diye sık örneklenir. */
  spacing: 20,
  /** Çizginin zeminden yüksekliği (oyun m): zeminin içine gömülmesin. */
  lift: 0.6,
  /** Hedef illerin ve komşu illerin çizgi renkleri. */
  regionColor: 0xffd23f,
  neighborColor: 0x8fb4d6,
  /** Başlangıçta görünür mü? */
  visibleByDefault: true,
} as const;

/**
 * Gün-gece döngüsü ve güneş geometrisi. Güneş konumu, bölgenin enlemi ve yılın günü için gerçek
 * astronomik formülle hesaplanır (yerel güneş saati: boylam/saat dilimi düzeltmesi yok).
 */
export const CLOCK = {
  /** Bir oyun gününün (24 oyun saati) gerçek süresi (saniye): 24 dk → 1 oyun saati = 1 gerçek dk. */
  dayLengthSeconds: 24 * 60,
  /** Oyunun başladığı gün saati (0–24). */
  startHour: 9,
  /** Yılın günü (1–365); 265 = 22 Eylül (ekinoks: gündüz ≈ gece ≈ 12 sa). Mevsim ileride eklenecek. */
  dayOfYear: 265,
  /** Bölgenin enlemi (derece K); Zonguldak–Bartın–Karabük ≈ 41,5°. */
  latitudeDeg: 41.5,
  /** Güneş bu yüksekliğin (derece) altına inince "gece" sayılır (−6° = sivil alacakaranlığın sonu). */
  nightSunAltitudeDeg: -6,
} as const;

/**
 * İklim modeli sabitleri: yaklaşık Batı Karadeniz kıyısı değerleri (Zonguldak civarı için mantıklı büyüklük
 * mertebesinde seçilmiş, doğrulanmış iklim normali DEĞİLDİR). Mevsim ve rakım etkisi ayarlanabilir.
 */
export const CLIMATE = {
  /** Deniz seviyesinde yıllık ortalama sıcaklık (°C). */
  annualMeanC: 13.5,
  /** Yıllık salınımın genliği (°C): en sıcak ay ortalaması = ortalama + genlik. */
  annualAmplitudeC: 8.5,
  /** Yılın en sıcak günü (24 Temmuz). */
  warmestDayOfYear: 205,
  /** Günlük salınımın genliği (°C): en sıcak ile en soğuk saat farkının yarısı. */
  dailyAmplitudeC: 4.5,
  /** Günün en sıcak saati (yerel güneş saati). */
  warmestHour: 15,
  /** Rakımla soğuma (°C / 1000 gerçek metre). Standart atmosfer ≈ 6,5. */
  lapseRateCPerKm: 6.5,
} as const;

/**
 * Hayatta kalma göstergeleri (saf mantık; gerçek saniye üzerinden işler, gün uzunluğundan bağımsız).
 * Değerler 0–100 arası "seviye"dir (100 = dolu). Varsayılanlar: hareketsiz bir oyuncu ~20 dk'da ölür
 * (susuzluk 12 dk'da biter, ardından can ~8 dk'da tükenir). Hepsi ayarlanabilir.
 */
export const SURVIVAL = {
  maxValue: 100,

  /** Hareketsizken susuzluk/açlık seviyesinin tamamen bitmesi için gereken süre (dakika). */
  hydrationEmptyMinutes: 12,
  satietyEmptyMinutes: 30,
  /** Aktiviteye göre susuzluk/açlık tüketim çarpanı. */
  activityDrain: { rest: 1, walk: 1.6, run: 3 },
  /** Ortam bu sıcaklığın (°C) üstüne çıkınca her derece için susuzluk bu oranda hızlanır. */
  hotThirstAboveC: 28,
  hotThirstPerDegree: 0.05,

  /** Enerji (yorgunluğun tersi; stamina benzeri): koşarak bitme, dinlenirken ve yürürken dolma süreleri (sn). */
  runEmptySeconds: 90,
  restRefillSeconds: 40,
  walkRefillSeconds: 120,
  /** Enerji 0'a inince koşma/zıplama kapanır; enerji bu seviyeye çıkınca yeniden açılır. */
  exhaustedRecoverAt: 25,

  /** Can: tüm göstergeler iyiyken saniyede yenilenme ve bunun için gereken asgari tokluk/susuzluk seviyesi. */
  healthRegenPerSecond: 0.15,
  healthRegenMinLevel: 50,
  /** Hasar (can/saniye): susuzluk ve açlık seviyesi 0 iken. */
  dehydrationDamagePerSecond: 0.2,
  starvationDamagePerSecond: 0.1,

  /** Vücut ısısı. */
  bodyTempNormalC: 37,
  /** Bu ortam sıcaklığının (°C) altında denge ısısı düşer; her derece için düşüş (°C). */
  comfortAmbientC: 18,
  coldSlope: 0.35,
  /** Bu ortam sıcaklığının üstünde denge ısısı yükselir; her derece için artış (°C). */
  hotAmbientC: 28,
  hotSlope: 0.25,
  /** Aktivitenin denge ısısına eklediği ısı (°C). */
  activityHeatC: { rest: 0, walk: 0.5, run: 1.5 },
  /** Vücut ısısının dengeye yaklaşma zaman sabiti (sn). */
  bodyTempTauSeconds: 300,
  /** Bu ısının altı hipotermi, üstü hipertermi hasarı verir; her derece için hasar (can/sn). */
  hypothermiaBelowC: 35,
  hypothermiaDamagePerDegree: 0.1,
  hyperthermiaAboveC: 39,
  hyperthermiaDamagePerDegree: 0.25,
  /** Can yenilenmesi için vücut ısısının olması gereken aralık (°C). */
  healthRegenBodyTempC: [36, 38.5],

  /** Tatlı su içerken susuzluk seviyesinin saniyedeki artışı. */
  drinkPerSecond: 8,
  /** İçme oturumunun başlaması için su seviyesinin tamdan en az bu kadar düşük olması gerekir (anlamsız mikro oturumlar olmasın). */
  drinkMinDeficit: 1,
} as const;

/** Ölüm sonrası yeniden doğma noktası seçimi. */
export const RESPAWN = {
  /** Rastgele tohumu; ölüm sırası (n) ile birleşir: aynı seed aynı ölümde aynı noktayı verir. */
  seed: 90210,
  /** Bir noktayı bulmak için en çok kaç aday denenir. */
  attempts: 400,
  /** Güvenli noktaya kaydırma bu kadardan (oyun m) fazlaysa aday reddedilir (il dışına taşmasın). */
  maxDrift: 40,
} as const;

/**
 * Tatlı su etkileşimi ve gösterimi. Dünya yatayda 1:50 ölçekli olduğundan gerçek bir nehir (5–30 m)
 * oyunda 0,1–0,6 m genişliğinde kalır; görünür ve içilebilir olması için genişlikler oyun için abartılır.
 */
export const FRESH_WATER = {
  /** Su kaynağına (çizgi/kıyı/kaynak noktası) bu uzaklıktan (oyun m) yakın oyuncu içebilir; çokgenin içi 0 sayılır. */
  reachDistance: 3.5,
  /** Çizim genişlikleri (oyun m): tür başına akarsu şeridi genişliği. */
  lineWidth: { river: 3, stream: 1.2, canal: 1.5 },
  /** Uzamsal ızgara hücre boyu (oyun m); sorgu yarıçapından küçük olmamalı. */
  indexCellSize: 40,
  /** Su rengi (nehir şeridi ve göl yüzeyi). */
  color: 0x3b8fb3,
  opacity: 0.85,
  /** Akarsu şeridinin zeminden yüksekliği (oyun m); göller için yüzey yüksekliği kıyıdan alınır. */
  lift: 0.12,
} as const;

/**
 * Gökyüzü ve gün ışığı (güneş yüksekliğine bağlı). Yükseklikler derece; renkler 0xRRGGBB.
 * Gündüz/gece geçişi güneş yüksekliğine göre yumuşak yapılır; alacakaranlıkta ufuk turuncuya çalar.
 */
export const SKY = {
  /** Gökyüzü tepe rengi: gündüz ve gece. */
  zenithDay: 0x3d7fd0,
  zenithNight: 0x02040d,
  /** Ufuk (ve sis) rengi: gündüz, gece ve alacakaranlık (gün doğumu/batımı). */
  horizonDay: 0xa9d0ee,
  horizonNight: 0x0a1020,
  horizonTwilight: 0xf0894a,
  /** Gündüz faktörü: güneş bu yükseklikte (derece) 0'dan, bunda 1'e çıkar. */
  dayFactorFrom: -8,
  dayFactorTo: 15,
  /** Alacakaranlık vurgusu: güneş ufuk çizgisinden bu kadar (derece) uzaklaştıkça sönümlenir. */
  twilightWidth: 9,
  /** Alacakaranlık renginin en fazla ne kadarının ufuk rengine karışacağı (0–1). */
  twilightMix: 0.75,
  /** Doğrudan güneş ışığı yoğunluğu (öğlen) ve rengi; ufka yaklaştıkça sıcak tona geçer. */
  sunIntensity: 2.2,
  sunColorHigh: 0xfff4e0,
  sunColorLow: 0xffa860,
  /** Güneşin ışığının açıldığı ve tam olduğu yükseklik (derece). */
  sunLightFrom: -2,
  sunLightTo: 12,
  /** Sıcak renge geçiş: güneş bu yüksekliğin (derece) altında turuncuya döner. */
  sunWarmBelow: 25,
  /** Ay ışığı yoğunluğu (dolunay, tepede) ve rengi. */
  moonIntensity: 0.75,
  moonColor: 0x9db8ff,
  /** Ortam ışığı: gündüz ve gece yoğunluğu/rengi. Gece tamamen kararmasın (en az görüş). */
  ambientDay: 0.6,
  ambientNight: 0.42,
  ambientColorDay: 0xffffff,
  ambientColorNight: 0x6478b8,
  /** Yıldızlar: güneş bu yüksekliğin altında belirmeye başlar ve daha altında tam görünür. */
  starsFadeStart: -3,
  starsFadeEnd: -12,
  /** Güneş ve ay diskinin görünür açısal yarıçapı (derece; gerçekte ~0,27°, oyunda abartılı). */
  sunDiscRadiusDeg: 1.6,
  moonDiscRadiusDeg: 1.3,
  /** Gök kubbesinin yarıçapı (oyun m); kamera uzak düzleminin (CAMERA.far) içinde kalmalı. */
  domeRadius: 4000,
  /** Işık yönü uzaklığı (oyun m); yalnızca yön önemlidir. */
  lightDistance: 100,
} as const;

/** Hayatta kalma HUD'u: gösterge uyarı eşikleri. */
export const SURVIVAL_HUD = {
  /** Gösterge bu seviyenin altına inince "düşük" (sarı) uyarısı. */
  lowBelow: 35,
  /** Gösterge bu seviyenin altına inince "kritik" (kırmızı, yanıp söner). */
  criticalBelow: 15,
  /** Vücut ısısı uyarıları: bu eşiklerin dışında "soğuk/sıcak" (°C); ölümcül eşikler SURVIVAL'da. */
  coldBelowC: 36,
  hotAboveC: 38.2,
  /** HUD'un yenilenme aralığı (ms). */
  refreshIntervalMs: 100,
} as const;

/** Envanter sınırları (Faz 4.4). Eşya içerikleri (ağırlık, yığın, etki) `items/itemDefs.ts` tablosundadır. */
export const INVENTORY = {
  /** Slot sayısı. */
  slots: 20,
  /** Taşınabilecek toplam ağırlık (gram; tam sayı, kayan nokta hatası olmasın). */
  maxWeightG: 25_000,
} as const;

/** Yemek yeme kuralları (Faz 4.4). */
export const FOOD = {
  /** Yemek için tokluğun 100'den en az bu kadar düşük olması gerekir (tok olan yemek yiyemez). */
  eatMinDeficit: 5,
} as const;

/** Toplama etkileşimi (Faz 4.6): bakılan nesneye `E`. Verim tablosu `interaction/gatherRules.ts`'tedir. */
export const INTERACT = {
  /** Nesneye en fazla bu yatay uzaklıkta (oyun m) etkileşilir. */
  reach: 3.5,
  /** Bakış yönü ile nesne arasındaki en büyük yatay açı (derece). */
  viewConeDeg: 40,
  /**
   * Bakış eğimi (pitch) ile nesneye olan yükselti açısı arasındaki en büyük fark (derece). Gerçek yamaçlar
   * oyunda ×3,3 dikleştiğinden nesne sık sık oyuncunun çok altında/üstündedir; dikey tolerans geniştir.
   */
  viewPitchDeg: 65,
  /** Bu uzaklıktan (oyun m) yakın nesnelerde dikey açı aranmaz (yere bakmadan da alınır). */
  closeRange: 1.5,
  /** Nesnenin hedef noktası: zeminden nesne boyunun bu oranı, en çok `maxTargetHeight` (oyun m). */
  targetHeightFraction: 0.5,
  maxTargetHeight: 1.6,
  /** Toplanınca ekranda gösterilen bildirimin süresi (ms). */
  toastMs: 2000,
} as const;

/** Yapı yerleştirme (Faz 4.8): hayalet konumu ve geçerlilik kuralları. */
export const PLACEMENT = {
  /** Hayalet, oyuncunun bakış yönünde bu yatay uzaklığa (oyun m) konur. */
  aimDistance: 2.5,
  /** Oyuncu ile hedef arasındaki en büyük yatay uzaklık (oyun m). */
  maxReach: 4,
  /** Eğim, hedef çevresinde bu adımla (oyun m) örneklenen yüksekliklerden hesaplanır. */
  slopeSampleStep: 0.75,
  /** Yapı türüne göre: en dik yamaç (derece, oyun uzayı), kaplama yarıçapı (oyun m). */
  kinds: {
    campfire: { maxSlopeDeg: 45, radius: 0.9 },
    lean_to: { maxSlopeDeg: 40, radius: 2 },
  },
  /** İki yapının merkezleri arasındaki en az uzaklık: yarıçapların toplamı + bu pay (oyun m). */
  spacingMargin: 0.3,
} as const;

/** Kamp ateşi yakıtı (Faz 4.8). Süreler gerçek saniyedir (24 gerçek dk = 1 oyun günü). */
export const FIRE = {
  /** Yeni kurulan ateşin yanma süresi (sn): ≈ 10 oyun saati. */
  burnSeconds: 600,
  /** Yakıt deposunun üst sınırı (sn); fazlası boşa gider. */
  maxFuelSeconds: 1200,
  /** Ateşe atılan eşyanın eklediği yanma süresi (sn). */
  fuel: { stick: 90, log: 300 },
  /** Ateşe yakıt atmak için en fazla yatay uzaklık (oyun m). */
  refuelReach: 3,
  /** Ateşe bir yakıt atmak için `E`'nin basılı tutulacağı süre (sn). */
  refuelSeconds: 0.8,
} as const;

/**
 * Yapıların hayatta kalma etkileri (Faz 4.9). Isı ve barınak, vücut ısısı denge değerine (`SURVIVAL`) ve
 * enerji dolumuna etki eder; yapılar `placement/exposure.ts` ile oyuncunun konumuna göre okunur.
 */
export const SHELTER_EFFECTS = {
  /** Yanık kamp ateşinin ısıtması: merkezde `maxC`, `coreRadius` içinde tam, `radius`'ta sıfır (oyun m; doğrusal). */
  fireWarmth: {
    /** Tek ateşin vücut ısısı denge değerine eklediği en çok ısı (°C). */
    maxC: 6,
    coreRadius: 1.5,
    radius: 6,
    /** Birden çok ateşin toplam ısıtması bu değeri aşmaz (°C). */
    maxTotalC: 8,
  },
  /**
   * Sundurma (lean_to) altındaki korunma: sundurmanın yerel dikdörtgeni (yarım genişlik / arka / ön, oyun m;
   * geometrideki direklerin biraz içi). Yapıya göre yatay konum; zemin farkı `verticalReach`'i aşamazsa geçerli.
   */
  shelter: {
    halfWidth: 1.4,
    back: -1.1,
    front: 0.8,
    /** Etkiler için yapı ile ayak arasındaki en büyük yükseklik farkı (oyun m). */
    verticalReach: 2.5,
    /** Soğukta denge ısısındaki düşüşün çarpanı (rüzgâr kesilir, toprak/yaprak yalıtır): <1 daha az üşür. */
    coldFactor: 0.55,
    /** Dinlenirken (hareketsiz) enerji dolumu çarpanı: barınakta daha hızlı uyku/dinlenme. */
    restRefillFactor: 2.5,
    /** Dinlenirken can yenilenme çarpanı. */
    restHealthFactor: 1.5,
  },
} as const;

/** Yapıların (kamp ateşi, sundurma) görünümü ve ateş ışığı (Faz 4.8). Geometri `world/structureGeometry.ts`'tedir. */
export const STRUCTURE_LOOK = {
  colors: {
    stone: 0x7b7870,
    ash: 0x2a2725,
    /** Zemine gömülen etek: yamaçta görünen kısım toprak tonunda olsun (siyah kutu gibi durmasın). */
    skirt: 0x54493d,
    log: 0x5a3e27,
    pole: 0x6b4b2d,
    roof: 0x4c5a2b,
    leaves: 0x6f5d2c,
    flameOuter: 0xff6a1a,
    flameInner: 0xffb830,
    flameCore: 0xfff0a0,
  },
  /** Yüz başına ton oynaması (düz gölgeli görünüm için). */
  faceShade: 0.06,
  /**
   * Ateş ışığı: en yakın `lightPool` yanık ateşe bir `PointLight` atanır (ışık sayısı sabit: sayı değişince
   * shader yeniden derlenir). `intensity` candela (fiziksel ışık; decay 2), `distance` sönme yarıçapı (oyun m).
   */
  fire: {
    lightColor: 0xff9a4a,
    lightPool: 3,
    intensity: 30,
    distance: 20,
    height: 0.9,
    /** Titreme: yoğunluk ±flicker oranında, flickerSpeed hızında oynar. */
    flicker: 0.18,
    flickerSpeed: 9,
    /** Bu uzaklıktan (oyun m) uzaktaki ateşlere ışık atanmaz. */
    lightRange: 60,
  },
  /** Yerleştirme hayaleti: geçerli/geçersiz renk ve saydamlık. */
  ghost: { validColor: 0x3ddc84, invalidColor: 0xe5484d, opacity: 0.45 },
} as const;

/**
 * Oyuncu savaşı (Faz 5, Hesap B'nin bloğu). Hayvanın saldırı hasarı `creatures/species.ts`'tedir (A); burada
 * oyuncunun silahları ve savunması durur. İskelet başlangıcıdır; 5.6–5.7'de ayarlanır, denge elle doğrulanır.
 */
export const COMBAT = {
  /** Hasar aldıktan sonra bu süre (gerçek sn) yeni hasar alınmaz. */
  iframeSeconds: 0.6,
  /**
   * Silahlar: `damage` hasar, `reach` yatay menzil (oyun m), `cooldownSeconds` iki saldırı arası,
   * `energyCost` saldırı başına enerji düşümü (0–100 ölçeği). Anahtar: `fist` ya da silah eşyasının kimliği.
   */
  weapons: {
    fist: { damage: 4, reach: 1.8, cooldownSeconds: 0.7, energyCost: 2 },
    stone_axe: { damage: 18, reach: 2, cooldownSeconds: 1, energyCost: 4 },
    stone_spear: { damage: 28, reach: 2.8, cooldownSeconds: 1.2, energyCost: 4 },
  },
  /** Savunma: envanterde bulunan giysinin gelen hasarı azaltma oranı (0–1). */
  defense: { hide_vest: 0.2 },
  /**
   * İsabet testi (`combat/melee.ts`; `INTERACT` gibi gevşek, çünkü gerçek yamaçlar ×3,3 dikleşir): yatay
   * koni (canlının açısal genişliği ayrıca eklenir), bakış eğimi ile hedefe yükselti açısı arasındaki en
   * büyük fark, bu uzaklıktan yakında dikey açı aranmaz ve ayak ile canlı arasındaki en büyük zemin farkı.
   */
  aim: {
    coneDeg: 50,
    pitchToleranceDeg: 60,
    closeRange: 1.2,
    maxVerticalGap: 3,
    /** Canlı yarıçapı payı: `creatures.near` aramasına menzile eklenir (en büyük canlı yarıçapından büyük). */
    searchMargin: 1.5,
  },
  /** Giysilerin toplam savunması bu orana kırpılır (hasar asla tamamen sıfırlanmasın). */
  maxDefense: 0.6,
} as const;

/** Av ürünleri (Faz 5, Hesap B'nin bloğu): leş kesme süreleri. Tür başına yük tablosu `combat/loot.ts`'tedir. */
export const LOOT = {
  /** Elle kesme süresi (sn, `E` basılı tutulur). */
  butcherSeconds: 6,
  /** Taş baltayla kesme süresi (sn). */
  butcherSecondsAxe: 3,
} as const;

/** Et pişirme (Faz 5, Hesap B'nin bloğu). Yanık ateşin yanında `E` basılı tutulur. */
export const COOKING = {
  /** Bir adet çiğ etin pişme süresi (sn). */
  seconds: 8,
} as const;

/** Canlıların yer tutucu/geçici görünümü (Faz 5, Hesap B'nin bloğu; 5.10'da gerçek modellerle değişir). */
export const CREATURE_LOOK = {
  colors: {
    roe_deer: 0xb5793f,
    wild_boar: 0x4a3a30,
    wolf: 0x6f6f6a,
    brown_bear: 0x5a3b22,
  },
  /** Vurulma parlamasında karıştırılan renk. */
  hitColor: 0xff3b30,
  /** Leş (yan yatık) yer tutucusunun boy çarpanı. */
  deadHeightFactor: 0.35,
} as const;
