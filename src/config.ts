/**
 * Tüm ayarlanabilir sabitler burada durur (CLAUDE.md: "Sihirli sayı yok").
 * Koordinat/ölçek değerleri veri hattı (tools/) ile oyun arasındaki sözleşmedir;
 * değiştirirsen her iki tarafı da güncelle.
 */

import { mergePlaces, PLACE_GROUPS, totalCampCount, type PlaceDef } from './config/places';

export type { PlaceDef };

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
  /** Ayak arazi yüzeyinin bu kadar (oyun m) altındaysa oyuncu tüneldedir: üçüncü şahıs kamera yakına gelir. */
  undergroundDepth: 1.5,
  undergroundDistance: 2.4,
  /** Girilebilir bir yapının (konut, cami, han) içindeyken üçüncü şahıs kamera uzaklığı ve tavan payı (oyun m). */
  indoorDistance: 1.3,
  indoorCeilingClearance: 0.25,
} as const;

/** Render ayarları. */
export const RENDER = {
  /** Yüksek DPI ekranlarda piksel oranı üst sınırı (performans için). */
  maxPixelRatio: 2,
  /**
   * Yüklemede gölgelendirici ön derlemesi için en çok bekleme (ms). Derleme bu süreyi aşarsa oyun yine açılır; kalan
   * programlar ilk kullanımda derlenir.
   */
  precompileTimeoutMs: 8000,
} as const;

/**
 * Performans göstergesi (`ui/PerfOverlay.ts`, `core/perfStats.ts`; `F3` ya da Ayarlar → "Performans göstergesi";
 * üretimde de çalışır): son `windowFrames` karenin istatistiği, `spikeMs`'ten uzun kare "takılma" sayılır ve o karenin
 * en uzun `spikeSections` bölümü saklanır; `listSections` bölüm listelenir; görünüm `refreshMs`'te bir yenilenir.
 */
export const PERF_OVERLAY = {
  windowFrames: 240,
  spikeMs: 50,
  spikeSections: 4,
  listSections: 6,
  refreshMs: 250,
  /** Grafikte üst çizgi (ms): bunun üstü kırpılır. */
  graphMaxMs: 66,
} as const;

/**
 * Uyarlanır çözünürlük (`core/resolution.ts`; Ayarlar → "Otomatik çözünürlük", varsayılan açık). Kare süresinin pencere
 * medyanı `1000 / targetFps · downRatio`'yu aşarsa çizim ölçeği bir kademe düşer (`scales`), `upRatio` altında
 * `upHoldSeconds` kalırsa bir kademe yükseltme denenir; deneme `probeSeconds` içinde yavaşlarsa o kademenin beklemesi
 * katlanır (en çok `maxUpHoldSeconds`). Piksel oranı = min(cihaz, kalite ön ayarı) × ölçek, en az `minPixelRatio`.
 * Hedef 50 FPS: 60 Hz ekranda dikey eşitlemeyle 60 FPS (16,7 ms) "rahat" sayılır, 30 FPS'e düşmek (33 ms) düşürür.
 */
export const ADAPTIVE_RESOLUTION = {
  targetFps: 50,
  downRatio: 1.15,
  upRatio: 0.9,
  scales: [1, 0.85, 0.7, 0.6, 0.5],
  minPixelRatio: 0.5,
  windowSeconds: 1.5,
  cooldownSeconds: 2,
  upHoldSeconds: 6,
  maxUpHoldSeconds: 120,
  probeSeconds: 6,
  /** Bundan uzun kareler (sekme arka planda, duraklama sonrası) bu değere kırpılır (ms). */
  maxSampleMs: 250,
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
    /** Uçuşta (test modu) aşağı in; Space yukarı çıkar, Shift hızlandırır. */
    descend: ['KeyZ'],
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
    /** Yerleştirme hayaletini 90° döndür (Faz 9). */
    rotatePlacement: ['KeyR'],
    /** Bakılan yapıyı sök (basılı tutulur; Faz 9). */
    dismantle: ['KeyX'],
    /**
     * Hızlı erişim (kısayol) çubuğu: dizideki sıra slot sırasıdır (`Digit1` → 1. slot). Fare tekerleği seçimi
     * kaydırır. Dev modunda Shift + rakam ve `T` + rakam ışınlanmaya ayrılmıştır (kısayol seçmez).
     */
    hotbar: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'],
    // ── Faz 11 (11.0; davranışı sahibi akış yazar) ──
    /** D: nişan (sağ fare tuşu; `Input` fare tuşunu bu sözde koda çevirir). */
    aim: ['MouseRight'],
    /** D: doldurma. Yerleştirme hayaleti açıkken aynı tuş hayaleti döndürür (`resolveContextAction`). */
    reload: ['KeyR'],
    /** D: nişan alırken nefes tutma (nişan dışında koşu). */
    steady: ['ShiftLeft', 'ShiftRight'],
    /** F: oyuncu ↔ drone görüşü; drone'u eve döndürüp indir. */
    droneView: ['KeyQ'],
    droneHome: ['KeyH'],
    /** Performans göstergesini aç/kapa (`PERF_OVERLAY`; ayar olarak saklanır). */
    togglePerformance: ['F3'],
    /** Battle Royale haritası (yalnız maçta). */
    toggleMap: ['KeyM'],
  },
  /** Fare hassasiyeti: piksel başına radyan. */
  mouseSensitivity: 0.0022,
  /**
   * Tek bir fare olayında kabul edilen en büyük hareket (piksel). Bazı tarayıcılar pointer lock
   * alındığı anda tek seferlik dev bir delta gönderir; bu sınır kamerayı sıçratmasını önler.
   */
  maxMouseDeltaPerEvent: 250,
  /** Test modunda Space'e bu süre (ms) içinde iki kez basmak uçuşu açar/kapatır. */
  flightDoubleTapMs: 300,
  /** Fare tekerleğiyle kısayol kaydırmada iki adım arası en kısa süre (ms): dokunmatik yüzeyin olay yağmuru seçimi uçurmasın. */
  hotbarWheelCooldownMs: 90,
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
  /**
   * Karede kurulan en fazla chunk mesh'i (üst sınır; asıl sınır `STREAMING.frameBudgetMs` zaman bütçesidir, ilk mesh
   * her durumda kurulur).
   */
  maxBuildsPerFrame: 3,
  /** Fizik: bu uzaklıktaki (oyun m) chunk'lar için Rapier heightfield collider'ı vardır. */
  physicsRadius: 160,
  /** Collider'lar `physicsRadius × bu` uzaklıktan sonra kaldırılır (histerezis). */
  physicsRemoveFactor: 1.6,
  /**
   * Karede kurulan en fazla collider sayısı (yakınlaşırken; ışınlanmada hepsi senkron kurulur). Üst sınırdır; ilki her
   * durumda, ikincisi `STREAMING.frameBudgetMs` süresi kaldıysa kurulur.
   */
  maxColliderBuildsPerFrame: 2,
  /**
   * Tünel ağzı delikli chunk'ın collider'ı bu kadar hücrelik kare bloklara bölünür: yalnızca delik içeren bloklar
   * üçgen ağıdır (trimesh), gerisi heightfield. Tek parça 128×128 trimesh kurulumu ~70 ms sürüyordu (takılma);
   * 16 hücrelik blokta ~1 ms. Chunk hücre sayısını (128) tam bölmeli.
   */
  holeBlockCells: 16,
} as const;

/**
 * Akışlı işlerin kare başına ortak zaman bütçesi (`core/FrameBudget.ts`): arazi collider'ı ve mesh'i, nesne dağılımı,
 * katman yenilemeleri (yapılar, köprüler, camlar) karede toplam bu kadar (ms) sürebilir; kritik ilk iş (oyuncunun
 * altındaki collider, en yakın mesh) bütçe tükense de yapılır, dönemsel yenilemeler bir sonraki kareye ertelenir.
 */
export const STREAMING = {
  frameBudgetMs: 4,
  /**
   * Dünya karosu akışı (Faz 12; `world/TileStreamer.ts`): tam çözünürlüklü karolar odağa `loadRadius` içinde yüklenir,
   * `unloadRadius` ötesinde boşaltılır (histerezis); LOD0–2 (900 m'ye kadar) bu yarıçapın içindedir, ötesi hep bellekte
   * duran genel bakıştan (her 8. örnek) çizilir. `maxResident`: bellek tavanı (aynı anda en çok bu kadar karo; ışınlanma
   * sonrası eskiler en uzaktan boşaltılır). `maxFetches`: eşzamanlı indirme. `readyRadius`: oyuncunun çevresinde bu
   * yarıçaptaki karolar hazır olmadan oyun ilerlemez (collider yarıçapı 160 m + pay).
   */
  tiles: {
    loadRadius: 1400,
    unloadRadius: 1900,
    maxResident: 25,
    maxFetches: 4,
    readyRadius: 220,
    /** Oyuncunun altındaki karo hazır değilken (yükleme ekranı) kare bütçesi (ms): yükleme hızlansın. */
    loadingBudgetMs: 14,
  },
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
  /**
   * Kaya rengine geçiş: [başlangıç, tam] oyun eğimi (derece). Yürünebilir yamaçlar (≤ 60°) çoğunlukla toprak/bitki
   * renginde kalır; yalnızca uçurumlar kaya olur (asfalt grisiyle karışmasın).
   */
  rockSlopeDeg: [52, 72],
  sandColor: 0xc2b280,
  grassColor: 0x5a8f3c,
  forestColor: 0x2f5a2b,
  alpineColor: 0x8a8a5c,
  rockColor: 0x7d705f,
  /** Arazi örtüsü sınıfı renkleri (landcover.bin; bkz. data/landcover.ts). */
  cover: {
    forest: 0x2a4d27,
    shrub: 0x6b7a3a,
    grass: 0x6fa043,
    crop: 0xb5a45a,
    barren: 0x9a8f7c,
    urban: 0x7c7656,
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
 * Arazi kaplaması (`world/terrainOverlay.ts` + `TerrainMaterial`): yollar, akarsular, kıyı bantları ve il sınırları
 * arazi shader'ında, arazi ızgarasıyla aynı kafesteki uzaklık alanı dokusundan boyanır (her LOD'da zemine oturur).
 * Uzunluklar oyun metresi; renkler 0xRRGGBB.
 */
export const TERRAIN_OVERLAY = {
  /** Kodlama: bayt = 128 + uzaklık · scale (1/16 m çözünürlük, ±7,9 m aralık). */
  scale: 16,
  /**
   * Rasterleme özellik kenarından en çok bu kadar (oyun m) dışarı taşar (açılış süresi). En geniş bant (kıyı,
   * `bankWidth`) + hücre köşegeni (2,83 m) kadar olmalı: daha kısa erişim bandı daraltır.
   */
  rasterReach: 4.6,
  /** Boyanan bir çizginin en dar yarı genişliği: 2 m'lik hücrede daha dar çizgi kopuk görünür. */
  minHalfWidth: 1.1,
  /** İl sınırı kenarları bu uzunlukta parçalanır; parçanın iki yanı `borderProbe` uzaklıkta yoklanır (kıyı elemesi). */
  borderPiece: 15,
  borderProbe: 2,
  /** Asfalt (terk edilmiş: koyu, lekeli) ve aşınmış yaması; banket (yol kenarı çakıl şeridi) genişliği ve rengi. */
  asphalt: 0x3d3e3c,
  asphaltWorn: 0x5b5a55,
  /**
   * Anayolun kenar çizgisi: kenardan içeri uzaklık (oyun m) ve görünürlük (0–1); genişliği köprü/tünel yüzeyindekiyle aynı
   * (`ROAD_STRUCTURES.edgeLineWidth`). Önce 0,35'ti: zemindeki yolda çizgiler köprüdekine göre silik kalıyordu.
   */
  edgeLineInset: 0.35,
  edgeLineStrength: 0.9,
  edgeLine: 0xc9c4b4,
  shoulder: 0x8a7f6c,
  shoulderWidth: 0.7,
  /**
   * Dört yol tipi. Anayol: koyu asfalt (`asphalt`), beyaz kenar çizgileri ve `dashPeriod` (oyun m) dönemli kesik orta
   * şerit (`centerLine`, yarı genişlik `centerLineHalf`). Köy yolu: açık, yamalı, çizgisiz eski asfalt (`village*`).
   * Dağ patikası: kenarı düzensiz (`trailWobble`) toprak (`dirt*`), ortası yer yer otlu (`trailGrass`). Kent sokağı:
   * parke/Arnavut kaldırımı (`cobble*`, taş boyu `cobbleSize`) ve kenarda kaldırım (`sidewalk`, `sidewalkWidth`).
   */
  dashPeriod: 7,
  centerLine: 0xe2dccb,
  centerLineHalf: 0.1,
  villageAsphalt: 0x575550,
  villageWorn: 0x75705f,
  trailWobble: 0.35,
  trailGrass: 0x5f6b3f,
  cobble: 0x8d877b,
  cobbleDark: 0x625d54,
  cobbleSize: 0.55,
  sidewalk: 0xa8a294,
  sidewalkWidth: 0.75,
  /** Dağ patikası (toprak): toprak ve koyu (ıslak/sıkışmış) lekeleri. */
  dirt: 0x846e52,
  dirtDark: 0x66543e,
  /** Akarsu: sığ ve derin renk (kenardan ortaya), yansıma için düşük pürüzlülük, akış dalgası hızı. */
  water: 0x3f8eae,
  waterDeep: 0x23566e,
  waterRoughness: 0.12,
  waterFlowSpeed: 0.35,
  /** Kıyı bandı: su kenarından bu kadar dışarıya ıslak, koyu toprak (çakıl). */
  bank: 0x4f4636,
  bankWidth: 1.6,
  bankStrength: 0.75,
  /** Köprü korkuluğu: yol suyun üstündeyse kenarda taş korkuluk şeridi. */
  parapet: 0x9a9284,
  parapetWidth: 0.4,
  /** İl sınırı: yarı genişlik (oyun m), renk ve görünürlük (0–1); `BORDERS.visibleByDefault` ile açılır. */
  borderHalfWidth: 1.2,
  border: 0xffd23f,
  borderStrength: 0.55,
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
  /**
   * Bekleyen chunk'lar hesaplanırken örnek tamponları bu kadar `update`'te bir yeniden doldurulur (son chunk
   * hesaplanınca hemen): her karede tam doldurma + GPU yüklemesi takılma yapıyordu.
   */
  pendingFillInterval: 8,
  /**
   * Kare bütçesi varken chunk dağılımı bu kadar aday satırlık dilimlerle ilerler (chunk 64 satır; tek chunk ~10 ms
   * sürüyordu, dilim ~1 ms).
   */
  rowsPerSlice: 8,
  /**
   * Odağa bu uzaklıktaki (oyun m) nesne chunk'ları kare bütçesinden bağımsız hemen hesaplanır: oyuncunun yanındaki
   * ağaçlar ve collider'ları (`PROP_SOLIDS.colliderRadius`) gecikmesin. Düşük kalitenin çizim yarıçapından küçük olmalı.
   */
  criticalRadius: 100,
  /** Hesaplanmış chunk sonuçlarının LRU önbellek kapasitesi. */
  chunkCacheSize: 64,
  /**
   * Yapı/yol elemesinde nesnenin görsel yarıçapının (ağaçta taç) kullanılan oranı: taç yapıya/yola bu kadar
   * değebilirse nesne gizlenir (1 = hiç taşmaz; biraz taşan dal doğal görünür).
   */
  blockRadiusFactor: 0.85,
  /**
   * Seyreltme (kullanıcı talimatı: "ağaçlar çok sık"): bu türlerin bu oranı (kimlik karmasıyla, deterministik) gizlenir.
   * Dağılım (ve `PropId`'ler) değişmez; gizlenen nesne görünmez ve toplanamaz (yapı/yol elemesi gibi).
   */
  thinning: { tree_broadleaf: 0.4, tree_conifer: 0.4, chestnut: 0.2 } as Partial<
    Record<string, number>
  >,
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
    /** Çam katlarının ikinci tonu (katlar dönüşümlü), kaya üstü yosun. */
    coniferAlt: 0x2f5531,
    moss: 0x5a6a38,
    faceShade: 0.07,
    /**
     * Dikey gölgeleme (taç ve gövde): nesnenin altı `shadeLow`, tepesi `shadeHigh` çarpanıyla boyanır (kendi gölgesi ve
     * güneş alan tepe; üçgen maliyeti yok).
     */
    shadeLow: 0.68,
    shadeHigh: 1.12,
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

  /** Doğma hücresinin kenarı (oyun m): chunk boyuyla aynı (128 hücre × 2 m) → hücre anahtarı chunk anahtarıdır. */
  spawnCellSize: 256,
  /** Doğma denetiminin aralığı (gerçek sn). */
  spawnIntervalSeconds: 0.5,
  /** Bir hücrede tür başına doğma denemesi; beklenen grup sayısı = tür yoğunluğu × uygunluk. */
  spawnAttemptsPerCell: 8,
  /** Bir "dönem" (gerçek sn): aday canlılar `seedFrom(seed, cx, cy, epoch)` ile dönem başına yeniden çekilir. */
  epochSeconds: 1800,
  /** Hücre başına aday önbelleği (LRU). */
  candidateCacheSize: 48,
  /** Bir doğma denetiminde en çok bu kadar yeni hücrenin adayı üretilir (kare süresi sıçramasın); kalanı sonraki denetime kalır. */
  maxNewCellsPerPass: 1,
  /** Yapıların (ateş, sundurma) bu yarıçapında (oyun m) canlı doğmaz. */
  structureClearance: 25,
  /** Doğma noktası oyuncunun bu yarı açısı (derece) içinde ve `spawnHiddenDistance` ötesinde değilse "görünür" sayılır. */
  spawnViewHalfAngleDeg: 65,
  /** Görüş konisi içinde bu uzaklıktan (oyun m) yakın yerde canlı doğmaz (pop-in görünmesin). */
  spawnHiddenDistance: 240,
  /** Zaman penceresi histerezisi: canlı, doğma eşiğinin bu kadar üstüne çıkınca (görünmüyorsa) sessizce kaldırılır. */
  despawnHysteresis: 0.15,
  /** Tatlı suya bu uzaklıktan (oyun m) yakın yerde canlı doğmaz (göl/nehir içinde doğmasın). */
  spawnWaterClearance: 6,
  /** Gerçek rakım (m) bu değerin altı deniz/kıyı sayılır: canlı girmez. */
  seaElevationMeters: 0.5,
  /** Canlı eğimi merkez + bu uzaklıktaki (oyun m) dört noktanın ortalamasıdır (2 m'lik ızgara gürültüsünü yumuşatır). */
  slopeSmoothRadius: 3,
  /** Grup üyeleri lider çevresinde bu yarıçaptan (oyun m) daha uzağa doğmaz. */
  groupSpread: 6,
  /** Gün doğumu/batımı bandı: güneş yüksekliği (derece) bu aralıkta alacakaranlıktır. */
  twilightAltitudeDeg: [-6, 6],

  /** Yapay zekâ: oyuncuya bu uzaklığın (oyun m) ötesindeki canlılar her `farAiEvery`. adımda güncellenir (AI LOD). */
  lodNearRadius: 120,
  farAiEvery: 4,
  /** Hareket ederken bu süre (sn) içinde `stuckMinDistance`'tan az yer değiştiren canlı takılmış sayılır. */
  stuckSeconds: 4,
  stuckMinDistance: 0.8,
  /** Engel karşısında yön sapması: süre (sn) ve açı aralığı (rad). */
  steerSeconds: 1.2,
  steerAngle: [0.9, 2.2],
  /** Tatlı su (göl içi) denetimi bu aralıkla (sn) yapılır: pahalı sorgu. */
  waterCheckSeconds: 0.25,
  /** Canlı bu kadar yatay adımdan (oyun m) sonra göl içi denetimi için ileriye bakar. */
  waterLookAhead: 1.5,
  /** Vurulunca geri tepme hızı (oyun m/sn) ve sönümü (1/sn). */
  knockbackSpeed: 3,
  knockbackDecay: 6,
  /** Vurulunca "kışkırtılmış" kalma süresi (gerçek sn): oyuncunun yerini bilir, saldırgan/kaçak davranır. */
  provokedSeconds: 10,
  /** Faz 11: yüksek gürültü (`noise:made`, ör. atış) duyan canlı bu süre (gerçek sn) kaynağından kaçar (ateşten kaçar gibi). */
  noiseFleeSeconds: 6,
  /** Vurulma parlamasının sönüm hızı (1/sn). */
  hitFlashDecay: 4,
  /** Oyuncu hareketinin gürültü çarpanı (duyma menzili): dinlenirken neredeyse duyulmaz. */
  noise: { rest: 0.1, walk: 0.5, run: 1 },
  /** Oyuncunun görünürlük çarpanı: yavaş/durgun oyuncu daha geç fark edilir. */
  visibility: { rest: 0.6, walk: 1, run: 1.15 },
  /** Çok yakın (oyuncuya bu uzaklıktan yakın) canlı, bakış yönünden bağımsız oyuncuyu fark eder (oyun m). */
  senseRadius: 6,
  /** Dinlenme/saldırı dışı yavaş dönüş: tür başına `turnRate` (rad/sn) bu çarpanla uyumsuz yönde hızı keser. */
  minAlignedSpeed: 0.25,
  /** Vuruş anında oyuncu saldırı menzilinin bu katı içindeyse isabet eder (oyun m çarpanı). */
  attackReachSlack: 1.25,
  /** Saldırı hazırlığında (windup) canlı hedefe bu oranda koşu hızıyla atılır: koşan oyuncu vuruştan kaçamaz ama aynı hızdaysa uzaklaşabilir. */
  attackLungeSpeedFactor: 0.8,
  /** Yaralı canlının kaçış hızı: sağlık oranı 0'da tam hızın bu kadarı, 1'de tam hız (yaralı hayvan yakalanabilir). */
  woundedSpeedFloor: 0.45,
  /** Kuşların (sülün) havalanma/konma ve vurulunca düşme hızları (oyun m/sn). */
  flight: { climbSpeed: 4, landSpeed: 2.5, fallSpeed: 7 },
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
 * Pilot il (Faz 8): harita genişletmesi durdurulduğundan oyun, mevcut haritada tek bir il üzerinde derinleşir.
 * Yeni oyun başlangıcı ve ölüm sonrası yeniden doğma bu ilin içinde kalır (`world/pilot.ts`); diğer iller
 * haritada ve yürünebilir kalır, yalnızca doğma noktası olmaz.
 */
export const PILOT = {
  /** `provinces.geojson` içindeki il adı. */
  province: 'Zonguldak',
  /** Yeni oyun başlangıcı (enlem/boylam; en yakın yürünebilir nokta otomatik bulunur): Zonguldak merkez. */
  start: {
    lat: 41.4564,
    lon: 31.7987,
    /**
     * Başlangıç bakış yönü (derece; 0 = kuzey, artış kuzeyden batıya: ileri = (−sin yaw, −cos yaw)). Kuzeye
     * bakınca (varsayılan) ilk kare 3 m ötede 17° dikleşen bir yamaç duvarıdır; batıya bakış açık (denizi gören)
     * bir manzaradır (docs/faz-8-zonguldak-olcumler.md "8.6").
     */
    yawDeg: 90,
  },
  /**
   * İl çokgenleri kıyıdan içeride kaldığından kıyı şeridinde hiçbir ile ait olmayan kara hücreleri vardır
   * (Zonguldak'ta ≤ 5,2 oyun m, ölçüm: docs/faz-8-zonguldak-olcumler.md). İlsiz bir kara noktası, en yakın
   * il bu ilse ve çokgene bu kadar (oyun m) yakınsa pilot ilde sayılır.
   */
  coastBufferM: 8,
  /**
   * Pilot ilin bilinen yerleri (ilçe merkezleri ve belirgin yerler; Faz 8.2). Konumlar yaklaşık enlem/boylamdır
   * (en yakın yürünebilir nokta bulunur). Dev modunda Shift + 1–9, 0 tuşları sırayla bu yerlere ışınlar
   * (Shift'siz tuşlar `TELEPORTS`); il altı yer adı bildirimi (8.3) de bu tabloyu kullanır. En çok 10 yer
   * (tuş sayısı); her yer pilot ilde, karada ve yürünebilir olmalıdır (`tests/pilotPlaces`).
   */
  places: [
    { name: 'Zonguldak merkez', lat: 41.4564, lon: 31.7987 },
    { name: 'Kozlu', lat: 41.4467, lon: 31.75 },
    { name: 'Kilimli', lat: 41.51, lon: 31.85 },
    { name: 'Çatalağzı', lat: 41.5167, lon: 31.8667 },
    { name: 'Karadeniz Ereğli', lat: 41.2797, lon: 31.4183 },
    { name: 'Alaplı', lat: 41.1833, lon: 31.3833 },
    { name: 'Çaycuma', lat: 41.4256, lon: 32.075 },
    { name: 'Filyos vadisi', lat: 41.5667, lon: 32.0333 },
    { name: 'Devrek', lat: 41.22, lon: 31.9617 },
    { name: 'Gökçebey', lat: 41.3017, lon: 32.1317 },
  ],
} as const;

/**
 * Haritadaki diğer hedef illerin bilinen yerleri (ilçe merkezleri ve belirgin yerler). Faz 12.0b'den beri il
 * gruplarının dosyalarından (`src/config/places/<grup>.ts`; tools/groups/<grup>.yaml ile aynı gruplar) birleştirilir:
 * yeni il eklemek bu dosyaya dokunmaz. `PILOT.places` ile aynı biçim ve kurallar (en çok 10 yer, her yer kendi ilinde,
 * karada ve yürünebilir: `tests/pilotPlaces`). Yeniden doğma/başlangıç pilot ille sınırlı değildir (`CITY_START`).
 */
export const OTHER_PROVINCE_PLACES = mergePlaces(PLACE_GROUPS);

/** İl adına göre yerler: pilot il (`PILOT.places`) ve diğer hedef iller. Yer adı bildirimi ve Shift ışınlanması bunu kullanır. */
export const PROVINCE_PLACES: Readonly<Record<string, readonly PlaceDef[]>> = {
  [PILOT.province]: PILOT.places,
  ...OTHER_PROVINCE_PLACES,
};

/**
 * Geliştirici ışınlanma noktaları (dev modunda 1–9 ve 0 tuşları, sırayla). İlki oyunun başlangıç noktasıdır.
 * Konumlar enlem/boylam; en yakın yürünebilir nokta otomatik bulunur. `province`: noktanın düştüğü il (test
 * eder). Abant ve Yedigöller noktaları göl kıyısındadır (içine değil): bir iki adımda su içilebilir.
 */
export const TELEPORTS = [
  { name: 'Zonguldak merkez', lat: 41.4564, lon: 31.7987, province: 'Zonguldak' },
  { name: 'Safranbolu', lat: 41.2517, lon: 32.6939, province: 'Karabük' },
  { name: 'Amasra', lat: 41.7494, lon: 32.3853, province: 'Bartın' },
  { name: 'Filyos vadisi', lat: 41.5667, lon: 32.0333, province: 'Zonguldak' },
  { name: 'Yenice', lat: 41.2028, lon: 32.3358, province: 'Karabük' },
  { name: 'Düzce merkez', lat: 40.8438, lon: 31.1565, province: 'Düzce' },
  { name: 'Bolu merkez', lat: 40.7392, lon: 31.6089, province: 'Bolu' },
  { name: 'Abant Gölü', lat: 40.6115, lon: 31.2765, province: 'Bolu' },
  { name: 'Yedigöller', lat: 40.9441, lon: 31.7497, province: 'Bolu' },
  { name: 'Akçakoca', lat: 41.0864, lon: 31.1167, province: 'Düzce' },
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

/**
 * Arazi yumuşatma (`world/terrainSmoothing.ts`; `RegionHeightSource.fromRegion`'da bir kez, kara hücrelerine): 100 m'lik
 * DSM'deki küçük tümsekler (ağaç/bina izleri, kısa sırt dalgaları) dikey ölçekle ×3,3 dikleşip dağları "deve sırtı"
 * gibi sürekli girintili çıkıntılı gösteriyordu. Kara hücreleri (deniz komşuları hesaba katılmadan) Gauss süzgeciyle
 * düzlenir; büyük dağ biçimleri kalır, kısa dalgalar seyrekleşir. Deniz hücreleri ve kıyı çizgisi değişmez. Nesne
 * dağılımı (eğim/rakım elemesi) yumuşatılmamış veriyi okur (`scatterView`): nesne kimlikleri kaymasın.
 */
export const TERRAIN_SMOOTHING = {
  /** Gauss sapması (ızgara hücresi; 1 hücre = 100 gerçek m). 0 = kapalı. */
  sigmaCells: 1.3,
  /** Doğal yükseklikle karışım (0–1): 1 = tamamen yumuşatılmış. */
  strength: 0.85,
} as const;

/** Deniz yüzeyi (Karadeniz) ayarları. */
/**
 * Kıyı biçimlendirme (`world/coastShaping.ts`; arazi sayfası hesabının son adımı, deniz tabanından sonra; kullanıcı
 * talimatı: "Samsun ve Sinop sahil şeridinde deniz kesik kesik görünüyor", Kocaeli körfezi): kara/deniz maskesi
 * `sigmaCells` (hücre) Gauss süzgeciyle yumuşatılır; kıyı yüksekliği su + `relief` · (b − ½) (oyun m). Tek hücrelik
 * deniz/kara benekleri kalkar, alçak kıyı ovası su düzleminin en az `relief`/2 üstündedir (titreme yok), su çizgisi
 * yumuşatılmış maskeyi izler. `shoreBand`: maske bundan büyükse deniz hücresi sığ kıyı yüksekliğine çıkar.
 */
export const COAST_SHAPING = {
  sigmaCells: 1,
  relief: 0.3,
  shoreBand: 0.2,
} as const;

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

/** İl sınırları: arazi kaplamasında boyanan şerit (`TERRAIN_OVERLAY.border*`); `B` tuşu açar/kapatır. */
export const BORDERS = {
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
  /** Takvim yılı (Faz 10): oyun tarihi = bu yılın `dayOfYear`. günü + geçen günler (Miladî ve Hicrî gösterilir). */
  startYear: 2026,
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

/**
 * Dünya verisi ve kafes sözleşmesi (Faz 7; ayrıntı: docs/faz-7-paralel-plan.md §3). **Bu blok kilitlidir:**
 * değişirse veri hattı (`tools/worldlib.py` testi bu bloğu okur), karo dosyaları ve kayıtlardaki kimlikler
 * uyuşmaz; değişiklik ayrı, küçük bir PR ile yapılır.
 *
 * Dünya orijini (`originUtm`) değişmez; global örnek kafesi eski bölgenin kuzeybatı örneğine çapalıdır:
 * örnek `(col, row)` → oyun `x = anchorX + col · hücre`, `z = anchorZ + row · hücre` (piksel merkezi).
 */
export const WORLD = {
  /** Oyunun yüklediği dünya (`public/data/world/<id>/world.json`). */
  id: 'bati-karadeniz',
  name: 'Batı Karadeniz',
  /** `public/` altındaki taban yol (`import.meta.env.BASE_URL` ile birleşir). */
  basePath: 'data/world',
  /** Global kafesin (0, 0) örneğinin merkez konumu (oyun m): eski bölgenin kuzeybatı örneği. */
  lattice: { anchorX: -1587, anchorZ: -1175 },
  /** Diskteki karo kenarı (örnek); 4 chunk. */
  tileSize: 512,
  /** Faz 6 kayıtlarındaki (v1) bölge kimliği: kayıt göçünde yeni dünya kimliğine çevrilir. */
  legacyRegionId: 'zonguldak-bartin-karabuk',
} as const;

/**
 * Ortam sesleri (Faz 6.8): hepsi Web Audio ile kodla sentezlenir (ses dosyası yok). Katman seviyeleri
 * (0–1) `audio/ambientMix.ts`'te konumdan/zamandan türetilir; burada eşikler ve zamanlamalar durur.
 * Ana ses seviyesi kullanıcı ayarındandır (`SETTINGS.volume`).
 */
export const AMBIENT = {
  /** Rüzgârın en düşük seviyesi (deniz seviyesinde, açık arazide hafif esinti). */
  windBase: 0.12,
  /** Rüzgârın tam seviyeye çıktığı gerçek rakım (m). */
  windFullElevationM: 1200,
  /** Sık ormanda rüzgâr sesi bu çarpanla boğulur. */
  windForestMuffle: 0.55,
  /** Sundurma altında rüzgâr bu çarpanla azalır. */
  windShelterMuffle: 0.5,
  /** Denizin tam duyulduğu (≤) ve hiç duyulmadığı (≥) uzaklık (oyun m; 1 oyun m = 50 gerçek m). */
  seaNearDistance: 30,
  seaFarDistance: 350,
  /** Güneş yüksekliğine (derece) göre gündüz/gece geçişi: kuşlar bu aralıkta açılır, gece böcekleri aralığın tersinde. */
  daySunStartDeg: -4,
  dayFullSunDeg: 10,
  /** Gece sesleri güneş bu yüksekliğin (derece) altına inerken açılır; `nightFullSunDeg`'de tam. */
  nightSunStartDeg: 6,
  nightFullSunDeg: -8,
  /** Gece böcek/baykuş sesleri bu rakımın (m) üstünde kesilir (soğuk, açık dağ). */
  insectMaxElevationM: 1500,
  /** Seviye değişiminin yumuşama süresi (sn): ışınlanma/sınır geçişinde ani sıçrama olmasın. */
  rampSeconds: 1.5,
  /** Ana kazanç (kulaklık/hoparlörde ani yüksek ses olmasın diye başlık payı). */
  headroom: 0.5,
  /** Ortam girdisini (konum, saat) yenileme aralığı (ms). */
  updateIntervalMs: 250,
  /** Kuş ötüşü: seviye 1'de saniyede ortalama bu kadar öt; seviyeyle doğrusal azalır. */
  birdPerSecondAtFull: 0.5,
  /** Baykuş: gece sesinin tam olduğu ormanda saniyede ortalama bu kadar. */
  owlPerSecondAtFull: 0.06,
  /** Olay (kuş/baykuş) zamanlayıcı adımı (ms). */
  eventTickMs: 200,
  /** Yağmur sesi barınakta/içeride bu çarpanla boğulur (çatıya vuran yağmur). */
  rainShelterMuffle: 0.5,
} as const;

/** İl sınırı geçişi bildirimi (Faz 6.7): sınırda gidip gelmede bildirim yağmasın. */
export const PROVINCE_NOTICE = {
  /** Yeni ilde bu kadar süre (gerçek sn) kesintisiz kalınca geçiş sayılır (sınır boyunca yürürken titreme elenir). */
  confirmSeconds: 2,
  /** Art arda iki bildirim arasındaki en kısa süre (gerçek sn); araya giren geçişler bildirilmeden işlenir. */
  cooldownSeconds: 15,
  /** Bildirimin ekranda kalma süresi (ms). */
  bannerMs: 4000,
} as const;

/**
 * Pilot il yer adı bildirimi (Faz 8.3): `PILOT.places` merkezlerine yaklaşınca yer adı duyurusu. Merkezler en
 * yakın yürünebilir noktaya oturtulur; yarıçaplar oyun metresidir (1:50 ölçek: 40 m ≈ 2 km gerçek).
 */
export const PLACE_NOTICE = {
  /** Bir yer merkezine bu kadar yakın olunca "yerde" sayılır (en yakın yer kazanır). */
  enterRadiusM: 40,
  /** Yerden çıkış yarıçapı: girişten büyüktür, sınırda gidip gelmede titreme olmasın. */
  exitRadiusM: 55,
  /** Yeni yerde bu kadar süre (gerçek sn) kesintisiz kalınca bildirilir. */
  confirmSeconds: 1.5,
  /** Art arda iki yer bildirimi arasındaki en kısa süre (gerçek sn); araya giren geçişler sessiz işlenir. */
  cooldownSeconds: 20,
  /** Bildirimin ekranda kalma süresi (ms). */
  bannerMs: 3000,
} as const;

/**
 * İlk dakikalar için ipucu akışı (Faz 8.5): oyuncuya ihtiyaç sırasıyla (su → yiyecek → ateş → barınak → av) kısa
 * ipuçları. Yalnızca ipucudur: zorunlu adım, kilit ya da görev yoktur; her ipucu bir kez gösterilir (görülenler
 * `localStorage`'da tutulur, Yeni Oyun sıfırlar) ve ayarlardan kapatılabilir.
 */
export const HINTS = {
  /** Görülen ipuçlarının `localStorage` anahtarı. Değiştirilirse oyuncular ipuçlarını yeniden görür. */
  storageKey: 'anadolu-hayati.hints',
  /** Oyuna girildikten (ilk gözlem) bu kadar sn sonra kontrol özeti gösterilir. */
  controlsDelaySeconds: 4,
  /** Art arda iki ipucu arasındaki en kısa süre (gerçek sn). */
  gapSeconds: 20,
  /** Bir ipucunun ekranda kalma süresi (ms). */
  toastMs: 8000,
  /** Susuzluk/açlık ipuçları, gösterge bu seviyenin altına inince (0–100) çıkar. */
  waterBelow: 65,
  foodBelow: 65,
  /** Vücut ısısı bu değerin altına inince (°C) ya da gece olunca ateş ipucu çıkar. */
  coldBelowC: 36.3,
  /** Güneş bu yüksekliğin (derece) altındaysa "gece" sayılır. */
  nightSunAltitudeDeg: 2,
  /** Yakınında bu kadar (oyun m) av hayvanı (karaca, yaban domuzu) varsa av ipucu çıkar. */
  preyRadiusM: 60,
} as const;

/**
 * Kullanıcı ayarları (Faz 6.4). Ayarlar tarayıcıda (`localStorage`) tutulur; oyun kaydından bağımsızdır.
 * Aralıklar arayüzdeki kaydırıcıları ve yüklenen değerlerin kırpılmasını belirler.
 */
export const SETTINGS = {
  /** `localStorage` anahtarı. Değişirse oyuncuların ayarları sıfırlanır; değiştirme. */
  storageKey: 'anadolu-hayati.settings',
  /** Fare hassasiyeti çarpanı (`INPUT.mouseSensitivity`'e uygulanır; 1 = varsayılan hız). */
  mouseSensitivity: { min: 0.2, max: 3, step: 0.05, default: 1 },
  /** Ana ses seviyesi (0 = sessiz, 1 = tam); ortam sesleri 6.8'de bağlanır. */
  volume: { min: 0, max: 1, step: 0.05, default: 0.7 },
  /** Varsayılan grafik kalitesi (mevcut davranış korunur; zayıf donanım için "Düşük"/"Orta" seçilir). */
  defaultQuality: 'high',
  /** İpuçları (Faz 8.5) varsayılan olarak açıktır. */
  defaultHints: true,
  /** Eşkıyalar ve yankesiciler (Faz 11) varsayılan olarak açıktır; kapalıyken hiç oluşmazlar. */
  defaultBandits: true,
  /** Uyarlanır çözünürlük (`ADAPTIVE_RESOLUTION`) varsayılan olarak açıktır. */
  defaultAdaptiveResolution: true,
  /** Performans göstergesi (`PERF_OVERLAY`, `F3`) varsayılan olarak kapalıdır. */
  defaultPerfOverlay: false,
} as const;

/**
 * Grafik kalitesi ön ayarları. Hepsi çalışma zamanında uygulanır (yeniden başlatma gerekmez):
 * `maxPixelRatio`: yüksek DPI ekranda piksel oranı üst sınırı; `propDrawRadius`: nesnelerin (ağaç, kaya…)
 * çizim yarıçapı (oyun m); `lodScale`: arazi LOD geçiş uzaklıklarının (`CHUNK.lodDistances`) çarpanı (< 1 = daha
 * erken kaba LOD, daha az üçgen). "Yüksek" = Faz 5'in ölçülen davranışı.
 */
export const QUALITY_PRESETS = {
  low: { label: 'Düşük', maxPixelRatio: 1, propDrawRadius: 350, lodScale: 0.6 },
  medium: { label: 'Orta', maxPixelRatio: 1.5, propDrawRadius: 520, lodScale: 0.8 },
  high: {
    label: 'Yüksek',
    maxPixelRatio: RENDER.maxPixelRatio,
    propDrawRadius: SCATTER.drawRadius,
    lodScale: 1,
  },
} as const;

export type QualityLevel = keyof typeof QUALITY_PRESETS;

/** Kayıt sistemi (Faz 6): yuvalar, otomatik kayıt ve IndexedDB depolama adları. */
export const SAVE = {
  /** Elle kayıt yuvası sayısı (`slot-1` … `slot-N`); otomatik kayıt (`auto`) ayrı bir yuvadır. */
  manualSlots: 5,
  /** Otomatik kayıt aralığı (gerçek sn; oyun donukken sayılmaz). Sekme gizlenirken/kapanırken ayrıca kaydedilir. */
  autosaveIntervalSeconds: 120,
  /** IndexedDB veritabanı adı. Değişirse eski kayıtlar görünmez olur; değiştirme. */
  dbName: 'anadolu-hayati',
  /** IndexedDB şema sürümü (nesne deposu yapısı değişirse artırılır; kayıt formatı sürümüyle ilgisi yok). */
  dbVersion: 1,
  /** Kayıtların tutulduğu nesne deposu; anahtar yuva kimliğidir. */
  storeName: 'saves',
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
 * Test modu (kullanıcı talimatı; geçici): Ayarlar'dan açılır, varsayılan kapalıdır. Açıkken oyuncu uçabilir
 * (Space'e çift basınca uçuş açılır/kapanır; Space yukarı, `INPUT.bindings.descend` aşağı, Shift hızlı), üretim
 * malzeme/alet/istasyon istemez ve girdi tüketmez, yapı yerleştirmek eşya harcamaz, toplanan nesneler tükenmez.
 * Hayatta kalma göstergeleri etkilenmez.
 */
export const TEST_MODE = {
  /** Uçuş hızları (oyun m/s): normal, Shift basılıyken, dikey. */
  flight: { speed: 12, fastSpeed: 40, verticalSpeed: 9, acceleration: 60 },
  /** Varsayılan: kapalı. */
  defaultEnabled: false,
} as const;

/**
 * Şehir merkezi başlangıcı (yeni oyun ve yeniden doğma): il ve ilçe merkezlerinden (Faz 10 yerleşimleri) rastgele
 * birinin yakınında, bina dışında yürünebilir bir noktada başlanır. Pilot il sınırı bu seçimde aranmaz
 * (kullanıcı talimatı); yerleşim verisi yoksa eski pilot il doğması kullanılır.
 */
export const CITY_START = {
  /** Başlangıç merkezi olabilecek yerleşim rütbeleri (`il` = il merkezi, `ilce` = ilçe merkezi/belde). */
  ranks: ['il', 'ilce'],
  /** Merkezden en çok bu kadar (yerleşim ayak izi yarıçapının oranı) uzakta başlanır. */
  maxOffsetFraction: 0.35,
  /** Bir merkezde kaç farklı nokta denenir (bina yoğun olabilir); sonra başka merkeze geçilir. */
  attemptsPerCenter: 6,
  /** Kaç merkez denenir. */
  maxCenters: 12,
  /** Yeniden doğma tohumu; ölüm sırasıyla birleşir (aynı seed ve n → aynı merkez). */
  respawnSeed: 424242,
} as const;

/**
 * Tatlı su etkileşimi ve gösterimi. Dünya yatayda 1:50 ölçekli olduğundan gerçek bir nehir (5–30 m)
 * oyunda 0,1–0,6 m genişliğinde kalır; görünür ve içilebilir olması için genişlikler oyun için abartılır.
 */
export const FRESH_WATER = {
  /** Su kaynağına (çizgi/kıyı/kaynak noktası) bu uzaklıktan (oyun m) yakın oyuncu içebilir; çokgenin içi 0 sayılır. */
  reachDistance: 3.5,
  /** Çizim genişlikleri (oyun m): tür başına akarsu genişliği (araziye boyanır; en dar `TERRAIN_OVERLAY.minHalfWidth`). */
  lineWidth: { river: 3, stream: 1.2, canal: 1.5 },
  /** Uzamsal ızgara hücre boyu (oyun m): küçük hücre, kısa sorgularda daha az parça ölçer. */
  indexCellSize: 20,
  /** Yerleşim çeşmesinin musluğuna bu uzaklıktan (oyun m) içilir (Faz 10). */
  fountainReach: 2,
  /** Su rengi (nehir şeridi ve göl yüzeyi). */
  color: 0x3b8fb3,
  opacity: 0.85,
  /** Akarsu şeridinin zeminden yüksekliği (oyun m); göller için yüzey yüksekliği kıyıdan alınır. */
  lift: 0.12,
} as const;

/**
 * Kısa su çizgilerinin ayıklanması (`data/waterThinning.ts`; yüklemede bir kez): veri her kısa dere kolunu ve menfez/köprü
 * altında bölünmüş kısa akarsu parçalarını taşıdığından arazide çok sayıda ince, birkaç hücrelik su parçası (ve
 * üstlerinde köprüler) görünüyordu (kullanıcı talimatları: "akarsu sayısı çok fazla"; "2-3 karelik suları ve
 * üzerindeki köprüleri kaldır, uzun nehirler kalsın"). Dere, nehir ve kanal çizgileri uç noktalarıyla öbeklenir;
 * öbeğin toplam uzunluğu (oyun m) eşikten kısaysa öbek kaldırılır. Göl ve kaynaklar etkilenmez. Kaldırılan çizgiler
 * yalnızca nesne dağılımında hesaba katılmaya devam eder (`RegionFeatures.minorStreams`): nesne kimlikleri kaymasın.
 * Köprüler yol planında kalan su ağından seçildiğinden (`npm run bake`) kaldırılan suyun köprüsü de kalkar.
 */
export const WATER_THINNING = {
  /** Bu toplam uzunluktan (oyun m; 400 = 20 gerçek km) kısa dere öbekleri kaldırılır. */
  minNetworkLength: 400,
  /** Tamamı mevsimlik (kuruyabilen) dere öbekleri için eşik (oyun m). */
  minIntermittentLength: 600,
  /** Nehir ya da kanal içeren öbeklerin eşiği (oyun m; 200 = 10 gerçek km): kısa nehir/kanal parçaları da kalkar. */
  minRiverNetworkLength: 200,
  /**
   * İl/ilçe merkezine ya da yer adına yakın geçen öbek kısa olsa da kalır (içme suyu); ama bundan (oyun m) kısaysa
   * kalkar: kentin içinde kalan birkaç hücrelik kopuk parçalar.
   */
  minAnchoredLength: 80,
  /** Uç noktaları bu uzaklıktan (oyun m) yakın çizgiler bağlı sayılır. */
  joinTolerance: 1.5,
  /** İl/ilçe merkezine ya da oyunun yer adlarına bu uzaklıktan (oyun m) yakın geçen öbek kalır (içme suyu). */
  anchorReach: 60,
} as const;

/**
 * Değişken hava durumu (`survival/weather.ts`, saf; oyun saatinin deterministik fonksiyonu, kayda girmez): açık,
 * bulutlu, yağmurlu. Gökyüzü/ışık/sis (`Environment`), yağmur damlaları (`world/RainLayer.ts`), ortam sesi (yağmur
 * katmanı) ve vücut ısısı (ıslanma) bunu okur.
 */
export const WEATHER = {
  seed: 0x77ea7,
  /** Hava cephesinin değişme aralığı (oyun saati): ~6 saatte bir yeni cephe. */
  periodHours: 6,
  /** Oyun başlangıcında (09:00) havanın açık başlaması için düğüm kayması (oyun saati). */
  startOffsetHours: 3,
  /** Ham bulutluluktan düşülen pay: açık hava biraz daha sık. */
  bias: 0.12,
  /** Bulutluluk bunun altında "açık", `rainAbove` üstünde yağmur. */
  clearBelow: 0.38,
  rainAbove: 0.72,
  /** Yağmur ıslatır: tam sağanakta ortam sıcaklığından düşülen (°C; barınakta yok). */
  rainCoolingC: 5,
  /** Gündüz tam kapalı gökte güneşin kesilmesi (°C). */
  cloudCoolingC: 2,
  /** Görünüm: tam kapalı gökte güneş ışığı çarpanı, gökyüzü griye karışma oranı, gece biraz daha karanlık. */
  look: {
    sunDim: 0.72,
    skyGray: 0.75,
    grayDay: 0x8f979e,
    grayNight: 0x0a0c10,
    ambientBoost: 0.35,
    /** Yağmurda sis yaklaşır (çarpan, tam sağanakta). */
    rainFog: 0.45,
    /** Bulut katmanı: bulut rengi gündüz ve gece. */
    cloudDay: 0xe6e9ec,
    cloudDark: 0x5c636b,
    cloudNight: 0x1a1d22,
  },
  /** Yağmur damlaları: kameranın çevresindeki kutu (oyun m), damla sayısı, düşüş hızı (oyun m/sn), boy. */
  rainDrops: { count: 3200, radius: 24, height: 20, speed: 16, length: 0.9, opacity: 0.55 },
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

/** Arayüz görünümü (pusula, yük göstergesi); renkler ve ölçüler `ui/ui.css` değişkenlerindedir. */
export const HUD_STYLE = {
  /** Pusula şeridinde derece başına piksel (pencere genişliği / bu değer = görünen açı aralığı). */
  compassPxPerDeg: 2.4,
  /** Pusula penceresinin genişliği (px; CSS `.hud-compass` genişliğiyle aynı olmalı). */
  compassWidthPx: 360,
  /** Pusula tiklerinin aralığı (derece; 45'i bölmeli ki ara yönler tike düşsün). */
  compassTickStepDeg: 15,
  /** Pusula kaydırması bu açıdan (derece) küçük değişimlerde yeniden yazılmaz. */
  compassEpsilonDeg: 0.1,
  /** Envanter ağırlığı bu oranın üstünde "ağır" (sarı) görünür. */
  loadHighFraction: 0.85,
} as const;

/** Envanter sınırları (Faz 4.4). Eşya içerikleri (ağırlık, yığın, etki) `items/itemDefs.ts` tablosundadır. */
export const INVENTORY = {
  /** Slot sayısı (çantasız). */
  slots: 20,
  /** Taşınabilecek toplam ağırlık (gram; tam sayı, kayan nokta hatası olmasın; çantasız). */
  maxWeightG: 25_000,
} as const;

/**
 * Sırt çantaları (`items/backpack.ts`, `Inventory`): oyuncu envanterindeki **en büyük** çanta slot ve ağırlık
 * sınırını artırır (çantalar üst üste binmez). Çantadaki eşyalar sığmayacaksa çanta çıkarılamaz/atılamaz.
 */
export const BACKPACKS = {
  backpack_small: { slots: 4, weightG: 8_000 },
  backpack_medium: { slots: 8, weightG: 15_000 },
  backpack_large: { slots: 14, weightG: 25_000 },
} as const;

/** Yemek yeme kuralları (Faz 4.4). */
export const FOOD = {
  /** Yemek için tokluğun 100'den en az bu kadar düşük olması gerekir (tok olan yemek yiyemez). */
  eatMinDeficit: 5,
} as const;

/**
 * Su kabı (`water_container_empty/full`): tatlı su kenarında susuzluk giderildikten sonra `E` basılı tutulmaya
 * devam edilince boş kap dolar; dolu kap envanterden içilir ve boşalır. Kaynatma yok (Fikir Havuzu).
 */
export const WATER_CONTAINER = {
  /** Boş kabın dolma süresi (gerçek sn; `E` basılı). */
  fillSeconds: 2,
  /** Dolu kaptan içince su göstergesine eklenen puan (0–100 ölçeğinde; ~1 L). */
  drinkHydration: 40,
  /** İçmek için suyun 100'den en az bu kadar düşük olması gerekir (kap boşa harcanmasın). */
  drinkMinDeficit: 5,
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
  /** Aynı anda en çok bu kadar bildirim görünür; fazlası gelince en eskisi kalkar (art arda toplama ekranı doldurmasın). */
  maxToasts: 4,
  /** Gece/gündüz geçişi bildiriminin süresi (ms). */
  dayNightToastMs: 4000,
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
    // Faz 9: inşa. Büyük yapı (kulübe) oyuncunun içinde doğmasın diye daha ileriye (`aimDistance`) konur ve
    // erişimi (`maxReach`) buna göre uzundur; tanımsızsa yukarıdaki genel değerler geçerlidir.
    storage_chest: { maxSlopeDeg: 40, radius: 0.6 },
    workbench: { maxSlopeDeg: 35, radius: 0.9 },
    // `maxRelief`: ayak izi çevresindeki (8 nokta, `reliefRadius`) zeminin merkeze göre en büyük yükseklik farkı
    // (oyun m): duvarların zemine gömülü kısmını (`HUT.skirt` = 1 m) aşmasın, duvar altında boşluk kalmasın.
    wooden_hut: {
      maxSlopeDeg: 22,
      radius: 2.9,
      aimDistance: 4.6,
      maxReach: 6.5,
      maxRelief: 0.9,
      reliefRadius: 2,
    },
    // Modüler parçalar (taban, duvar, kapılı/pencereli duvar, kapı, çatı): geçerlilik `placement/pieceRules.ts`'te
    // (ızgara yuvaları, destek, zemin toleransı); buradaki `radius` odak/sökme menzili ve diğer yapılarla aralık içindir.
    foundation: { maxSlopeDeg: 45, radius: 1.45, aimDistance: 3, maxReach: 6 },
    wall: { maxSlopeDeg: 45, radius: 1.1, aimDistance: 3, maxReach: 6 },
    doorway: { maxSlopeDeg: 45, radius: 1.1, aimDistance: 3, maxReach: 6 },
    window_wall: { maxSlopeDeg: 45, radius: 1.1, aimDistance: 3, maxReach: 6 },
    door: { maxSlopeDeg: 45, radius: 1.1, aimDistance: 3, maxReach: 6 },
    roof: { maxSlopeDeg: 45, radius: 1.45, aimDistance: 3, maxReach: 7 },
    // ── Faz 11 (11.0 yer tutucu; sahibi akış kendi satırlarını ayarlar) ──
    // A (11.1): modüler inşa II parçaları; geçerlilik `placement/pieces.ts`'te (ızgara yuvaları, destek). `radius`
    // odak/sökme menzili ve diğer yapılarla aralık içindir (merdiven 1 × 2 hücre, beşik çatı 2 hücre genişliğinde).
    stairs: { maxSlopeDeg: 45, radius: 2, aimDistance: 3.5, maxReach: 6.5 },
    entry_step: { maxSlopeDeg: 45, radius: 1.65, aimDistance: 3, maxReach: 6 },
    pillar: { maxSlopeDeg: 45, radius: 0.4, aimDistance: 3, maxReach: 6 },
    railing: { maxSlopeDeg: 45, radius: 1.1, aimDistance: 3, maxReach: 6 },
    half_wall: { maxSlopeDeg: 45, radius: 1.1, aimDistance: 3, maxReach: 6 },
    gable_roof: { maxSlopeDeg: 45, radius: 2.35, aimDistance: 3.5, maxReach: 7.5 },
    gable_wall: { maxSlopeDeg: 45, radius: 2, aimDistance: 3.5, maxReach: 7.5 },
    // B (11.2/11.3): istasyonlar, döşek, güneş paneli, çitler.
    forge: { maxSlopeDeg: 30, radius: 0.9 },
    stone_oven: { maxSlopeDeg: 30, radius: 1 },
    hand_mill: { maxSlopeDeg: 30, radius: 0.6 },
    drying_rack: { maxSlopeDeg: 35, radius: 0.9 },
    bedroll: { maxSlopeDeg: 25, radius: 1 },
    solar_panel: { maxSlopeDeg: 35, radius: 0.9 },
    // Çitler: geçerlilik `placement/fences.ts`'te (ızgara kenarı, uç yükseklik farkı `FENCES.maxEndRise`); `maxSlopeDeg`
    // kullanılmaz. Yarıçap çitin yarı uzunluğudur (odak/sökme menzili).
    wood_fence: { maxSlopeDeg: 40, radius: 1, aimDistance: 3, maxReach: 6 },
    stone_fence: { maxSlopeDeg: 40, radius: 1, aimDistance: 3, maxReach: 6 },
    fence_gate: { maxSlopeDeg: 40, radius: 1, aimDistance: 3, maxReach: 6 },
    // C (11.4): tarla hücresi (çapayla açılır). F (11.8): yere inmiş drone.
    farm_plot: { maxSlopeDeg: 20, radius: 1 },
    drone: { maxSlopeDeg: 45, radius: 0.4 },
  },
  /** İki yapının merkezleri arasındaki en az uzaklık: yarıçapların toplamı + bu pay (oyun m). */
  spacingMargin: 0.3,
} as const;

/**
 * Modüler yapı parçaları (kullanıcı talimatı): taban, duvar, kapılı duvar, pencereli duvar, kapı ve çatı ayrı ayrı
 * üretilir, sahada küresel bir ızgaraya (hücre `cell`) oturtularak monte edilir; bina şeklini oyuncu belirler.
 * Taban zemine kurulur (kat 0); duvarlar bir plakanın (taban ya da çatı) kenarına, çatı duvarların üstüne oturur;
 * çatı plakası bir üst katın zemini de olur (kat yüksekliği `slab + wallHeight`). Ölçüler oyun metresidir.
 */
export const PIECES = {
  /** Izgara hücresi: plaka kenarı ve duvar uzunluğu. */
  cell: 2,
  /** Taban/çatı plakasının kalınlığı. */
  slab: 0.2,
  /** Duvarın yüksekliği (plakanın üstünden bir üst plakanın altına). */
  wallHeight: 2.4,
  /** Duvar kalınlığı. */
  wallThickness: 0.18,
  /** Tabanın zemine gömülü etek derinliği (yamaçta havada kalmasın). */
  skirt: 1.5,
  /** Kapı boşluğu (kapılı duvar) ve kapı kanadı. */
  doorway: { width: 1.0, height: 2.0 },
  /** Pencere boşluğu: genişlik, denizlik (zeminden) ve yükseklik. */
  window: { width: 1.0, sill: 0.9, height: 0.9 },
  /** Kapı kanadı kalınlığı. */
  doorThickness: 0.08,
  /** Tabanın zemine oturması: en yüksek zemin noktası tabanın üstünden en çok bu kadar yüksekte olabilir (gömülme). */
  maxBury: 0.35,
  /** Zemin tabanın altına en çok bu kadar inebilir (etek kapatır). */
  maxDrop: 1.3,
  /** İlk tabanın zemin yüksekliği: en yüksek örnekten bu kadar aşağıda (plaka yüzü zeminle hizalı kalsın). */
  floorSink: 0.15,
  /** Zeminin üstünde en çok bu yükseğe parça kurulabilir (≈ 4 kat). */
  maxBuildHeight: 12,
  /** Oyuncuya en çok bu yatay uzaklıkta hedeflenir; adaylar bakış noktasına bu yarıçapta aranır. */
  searchRadius: 3.2,
  /** Duvar parçasına oyuncunun bu kadar yakınında (yatay, oyun m) duvar kurulmaz (içine sıkışmasın). */
  playerClearance: 0.55,
  /** Bir odanın "kulübe" sayılması: kapalı oda tarama sınırı (hücre) ve en çok açıklık sayısı (açık kapılı/kapısız boşluk). */
  shelter: { maxCells: 36, maxOpenings: 1 },
} as const;

/** Sandık (Faz 9): yapıya bağlı ayrı envanter; `E` ile açılır. */
export const STORAGE = {
  /** Sandığın slot sayısı. */
  slots: 16,
  /** Sandığın taşıyabileceği en çok ağırlık (gram; tam sayı). */
  maxWeightG: 60_000,
  /** Sandığı açmak için yapının kenarına en çok bu yatay uzaklık (oyun m). */
  reach: 2,
  /** Bakış yönü ile sandık arasındaki en büyük yatay açı (derece); çok yakında aranmaz. */
  viewConeDeg: 45,
} as const;

/** Üretim istasyonları (Faz 9): tarifin `station` alanı, istasyonun bu yarıçapında (oyun m) olmayı ister. */
export const STATIONS = {
  workbench: { reach: 4 },
  // ── Faz 11: B (11.2) yeni istasyonların erişimi (yalnızca B ayarlar) ──
  forge: { reach: 3 },
  stone_oven: { reach: 3 },
  hand_mill: { reach: 3 },
  drying_rack: { reach: 3 },
} as const;

/**
 * Yapı sökme (Faz 9): bakılan yapıya `X` basılı tutulur. Kamp ateşi dışındaki yapılar eşya olarak geri gelir
 * (yeniden kurulabilir); kamp ateşinden yalnızca taşlar döner (yanmış odun/kav kaybolur). Sandık boş olmalıdır.
 */
export const DISMANTLE = {
  /** `X`'in basılı tutulacağı süre (sn). */
  seconds: 1.2,
  /** Yapının kenarına en çok bu yatay uzaklıktan sökülür (oyun m). */
  reach: 2.5,
  /** Bakış konisi (derece, yatay). */
  viewConeDeg: 45,
  /** Kamp ateşinden geri dönen eşyalar. */
  campfireReturns: [{ id: 'stone', count: 4 }],
} as const;

/** Hızlı erişim (kısayol) çubuğu (Faz 9): slot sayısı, kısayol tuşlarının (`INPUT.bindings.hotbar`) sayısıdır. */
export const HOTBAR = {
  slots: INPUT.bindings.hotbar.length,
} as const;

/**
 * Ekipman (Faz 9). Giysiler (deri yelek, kürk pelerin) envanterde bulunarak etki eder (ayrı giysi slotu yok);
 * meşale elde (kısayolda seçili) tutulunca oyuncunun çevresini aydınlatır.
 */
export const EQUIPMENT = {
  /** Giysinin vücut ısısı denge değerine eklediği ısı (°C); ateş gibi normal ısının üstüne çıkarmaz. */
  clothingWarmthC: { fur_cloak: 2.5, wool_blanket: 1.5 },
  /** Giysilerin toplam ısıtma üst sınırı (°C). */
  maxClothingWarmthC: 4,
  /** Elde meşale: ışık rengi, yoğunluğu (candela; decay 2), sönme yarıçapı ve oyuncu ayağından yüksekliği (oyun m). */
  torch: {
    lightColor: 0xffa860,
    intensity: 18,
    distance: 16,
    height: 1.7,
    flicker: 0.12,
    flickerSpeed: 11,
  },
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
  /**
   * Ahşap kulübe (Faz 9): dört duvarlı, kapılı bina; sundurmadan daha iyi korur. Altlık yerel karedir (duvarların
   * iç yüzü); diğer alanlar sundurmadakiyle aynı anlamdadır.
   */
  hut: {
    halfWidth: 1.85,
    back: -1.85,
    front: 1.85,
    verticalReach: 2.5,
    coldFactor: 0.3,
    restRefillFactor: 3,
    restHealthFactor: 2,
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
    // Faz 9: sandık, tezgâh, kulübe.
    plank: 0x8a6440,
    darkPlank: 0x6a4a2e,
    iron: 0x3d3b38,
    wall: 0x7a5634,
    hutRoof: 0x5b4a3a,
    // Modüler parçalar: taban plakası, çatı plakası, pencere camı yerine tahta kepenk.
    slab: 0x8f6c47,
    roofSlab: 0x4f4235,
    shutter: 0x5a3e27,
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
    // Faz 9: hızlı ama zayıf; asıl işi leş kesmektir (`LOOT.butcherSecondsKnife`).
    bone_knife: { damage: 10, reach: 1.6, cooldownSeconds: 0.5, energyCost: 2 },
    // ── Faz 11: D (11.5) yakın silahlar: sopa (tezgâhsız, ilk günün silahı), demir kama (hızlı; leşi bıçak gibi
    // keser), pala (en güçlü yakın silah; leşi balta hızında keser). Menzilli silahlar `RANGED`'dadır.
    club: { damage: 14, reach: 2.2, cooldownSeconds: 0.9, energyCost: 4 },
    iron_dagger: { damage: 17, reach: 1.7, cooldownSeconds: 0.5, energyCost: 2 },
    pala: { damage: 32, reach: 2.4, cooldownSeconds: 0.85, energyCost: 4 },
    // Yeni yakın silahlar: yatağan (hızlı, keskin), savaş baltası (ağır, ağaç da keser), gürz (en ağır, yavaş).
    yatagan: { damage: 27, reach: 2.2, cooldownSeconds: 0.6, energyCost: 3 },
    war_axe: { damage: 38, reach: 2.3, cooldownSeconds: 1.1, energyCost: 5 },
    gurz: { damage: 45, reach: 2.1, cooldownSeconds: 1.35, energyCost: 6 },
  },
  /**
   * Savunma: envanterde bulunan giysinin gelen hasarı azaltma oranı (0–1). Yelekler (`vests`) birbiriyle toplanmaz:
   * yalnız en iyisi sayılır (Battle Royale: çelik yelek).
   */
  defense: { hide_vest: 0.2, fur_cloak: 0.1, steel_vest: 0.35 },
  vests: ['hide_vest', 'steel_vest'] as readonly string[],
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

/** Savaş arayüzü (Faz 5, Hesap B'nin bloğu): hasar vinyeti, vuruş işareti, tehlike uyarısı. */
export const COMBAT_HUD = {
  /** Bu hasar (can puanı) ve üstü vinyeti tam parlaklıkta gösterir; altı orantılı. */
  fullVignetteDamage: 40,
  /** Vinyetin en az parlaklığı (küçük hasar da fark edilsin). */
  minVignette: 0.25,
  /** Vinyetin sönme süresi (ms). */
  vignetteMs: 700,
  /** Vuruş işaretinin görünme süresi (ms). */
  hitMarkerMs: 220,
  /** Aynı türden ardışık "Tehlike" bildirimleri arasındaki en kısa süre (ms). */
  dangerToastCooldownMs: 6000,
  /** "Tehlike" bildirimi gösterilen durumlar (yalnızca sinsi yaklaşma ve kovalama). */
  dangerStates: ['stalk', 'chase'],
  /** Bildirimi tetiklemeyen zararsız türler. */
  harmlessKinds: ['roe_deer', 'red_deer', 'red_fox', 'hare', 'pheasant'],
} as const;

/** Av ürünleri (Faz 5, Hesap B'nin bloğu): leş kesme süreleri. Tür başına yük tablosu `combat/loot.ts`'tedir. */
export const LOOT = {
  /** Elle kesme süresi (sn, `E` basılı tutulur). */
  butcherSeconds: 6,
  /** Taş baltayla kesme süresi (sn). */
  butcherSecondsAxe: 3,
  /** Kemik bıçakla kesme süresi (sn; Faz 9): en hızlı alet. */
  butcherSecondsKnife: 2,
} as const;

/** Et pişirme (Faz 5, Hesap B'nin bloğu). Yanık ateşin yanında `E` basılı tutulur. */
export const COOKING = {
  /** Bir adet çiğ etin pişme süresi (sn). */
  seconds: 8,
} as const;

/**
 * Canlıların görünümü (Faz 5, Hesap B'nin bloğu). Modeller `world/creatureGeometry.ts`'te, gerçek boyutta ve
 * düşük poligonlu kutu parçalardan kurulur (doku yok; renk örnek rengidir). Buradaki değerler poz/animasyon ve
 * renk ayarıdır.
 */
export const CREATURE_LOOK = {
  /** Tür gövde renkleri (parçalar bunun tonlarıdır). */
  colors: {
    roe_deer: 0xb5793f,
    wild_boar: 0x4a3a30,
    wolf: 0x6f6f6a,
    brown_bear: 0x5a3b22,
    red_deer: 0x8a4e2c,
    red_fox: 0xc2622a,
    hare: 0x9a8668,
    pheasant: 0x8f4a22,
  },
  /** Kuş kanadı çırpma genliği (radyan). */
  wingFlap: 0.9,
  /** Vurulma parlamasında karıştırılan renk. */
  hitColor: 0xff3b30,
  /** Leş (yan yatık) karardıkça: renk bu oranda koyulaşır (0–1). */
  deadDarken: 0.3,
  /** Leşin boy çarpanı: leş kesme/bakış hedefi yüksekliği (yan yatan gövde alçaktır). */
  deadHeightFactor: 0.35,
  /** Yürüme/koşma animasyonu. */
  gait: {
    /** Bacak sallanma genliği (radyan) tam hızda. */
    amplitude: 0.55,
    /** Bu yatay hızda (oyun m/sn) genlik tamdır; altında orantılı azalır. */
    fullSpeed: 4,
    /** Adım sırasında gövdenin zıplama payı (oyun m). */
    bob: 0.03,
    /** Kuyruk sallanma genliği (radyan). */
    tailWag: 0.3,
  },
  /** Baş pozları (radyan; pozitif = baş yukarı): otlarken, tetikteyken, saldırırken, leşte. */
  head: { graze: -0.7, alert: 0.2, attack: -0.55, dead: -0.4 },
  /** Saldırı hamlesinde gövdenin öne atılma payı (gövde uzunluğu oranı). */
  lunge: 0.3,
  /** Karelerarası zaman sıçramasını sınırlar: animasyon fazı bu süreden (sn) fazla ilerlemez. */
  maxFrameSeconds: 0.1,
} as const;

/**
 * Gökyüzü kuşları (`world/birdFlocks.ts`, `BirdLayer`; yalnız görsel): hücrelerin bir kısmında daire çizen sürüler.
 * Uzaklıklar oyun m, hızlar oyun m/sn, rakım gerçek m.
 */
export const BIRDS = {
  seed: 0xb1d5,
  /** Sürü hücresi boyu ve hücrede sürü olma olasılığı. */
  cellSize: 450,
  flockChance: 0.4,
  /** Oyuncuya bu uzaklıktaki sürüler çizilir. */
  drawRadius: 800,
  /** En çok çizilen kuş (örnek tamponu). */
  maxBirds: 160,
  /** Gün ışığı (0–1) bunun altındaysa kuş yok. */
  minDaylight: 0.25,
  /** Bu gerçek rakımın (m) altındaki hücrelerde martı (kıyı); karada karga ya da yırtıcı. */
  gullMaxElevation: 40,
  /** Karadaki sürülerin yırtıcı (tek kuş) olma payı. */
  raptorShare: 0.3,
  kinds: {
    crow: {
      count: [5, 10],
      altitude: [14, 30],
      radius: [25, 60],
      speed: [7, 10],
      spread: 8,
      span: 0.9,
      flapHz: 3,
      glide: 0,
      color: 0x1d1d22,
    },
    gull: {
      count: [3, 7],
      altitude: [10, 24],
      radius: [30, 70],
      speed: [6, 9],
      spread: 10,
      span: 1.2,
      flapHz: 1.8,
      glide: 0.4,
      color: 0xeceff0,
    },
    raptor: {
      count: [1, 2],
      altitude: [45, 90],
      radius: [50, 110],
      speed: [6, 8],
      spread: 15,
      span: 1.9,
      flapHz: 1.2,
      glide: 0.85,
      color: 0x5a4330,
    },
  },
} as const;

/**
 * Yerleşimler (Faz 10): il/ilçe merkezleri ve köyler gerçek veriden (`settlements.json`), binalar seed'li düzenle
 * (`settlements/layout.ts`). Ölçek: 1 oyun m = 50 gerçek m, bu yüzden yerleşim ayak izi **bilinçli olarak
 * büyütülür** (`footprintScale`; akarsu genişliklerinin abartılması gibi): aksi hâlde 100 binlik bir il merkezi
 * oyunda ~20 binaya iner. Gerçek konumlar (simge yapılar) aynı ölçekle merkezden uzaklaştırılır.
 */
export const SETTLEMENT_LAYOUT = {
  /** Yerleşim düzeninin tohumu (aynı tohum = aynı kasabalar). */
  seed: 0x5e771e,
  /** Ayak izi büyütme çarpanı (merkez etrafında). */
  footprintScale: { il: 1.8, ilce: 1.6, koy: 1.3 },
  /** Parsel aralığı (oyun m): bir konut + sokak payı. */
  lotPitch: { il: 10, ilce: 9.5, koy: 10.5 },
  /** Il/ilçe: her `blockLots` parselden sonra bir sıra boş kalır (mahalle sokağı). */
  blockLots: 3,
  /** Bir parselin dolu olma olasılığı = min(1, n / fullDensity) (n = 100 m hücredeki gerçek bina sayısı). */
  fullDensity: { il: 3, ilce: 2.5, koy: 2 },
  /** n bu değerin üstündeyse "yoğun doku" (apartman ağırlıklı) sayılır. */
  denseThreshold: 6,
  /** Yerleşim başına en çok bina. */
  maxBuildings: { il: 170, ilce: 90, koy: 10 },
  /** Köy: en az/en çok konut; gerçek bina sayısı / `villageBuildingsPerHouse` kadar. */
  villageHouses: { min: 3, max: 8 },
  villageBuildingsPerHouse: 10,
  /** Yapının altında görünen taş temelin en büyük yüksekliği (oyun m; ön kenar ile en alçak köşe farkı). */
  maxPlinth: 5,
  /**
   * Dik arazide yapı terası (arazi düzlenebiliyorsa): ayak izindeki en yüksek ile en alçak zemin farkı bu kadardan (oyun m)
   * azsa yapı, medyan seviyede düzlenmiş bir terasa oturur; `padMargin` ayak izinin her yana taşan düz payıdır.
   */
  maxPadRange: 9,
  padMargin: 0.8,
  /**
   * Kent sokakları zemine uydurulmadan önce her yapının ayak izi (ve merdiven yeri) bu payla (oyun m) kilitlenir: sokak
   * şevi yapının zeminini değiştirmez.
   */
  streetLockMargin: 0.6,
  /** Girilebilir yapıların terasının (ve kilidinin) ayak izinden taşan payı (oyun m; arazi kafesi 2 m'den geniş). */
  interiorPadMargin: 2.3,
  /** Komşu terasların şevi yüzünden arka kenarı `MAX_BURY`'yi bu kadar (oyun m) aşan yapı atılır. */
  buryTolerance: 2,
  /** Terasın çevresine bağlanan şevin en büyük genişliği (oyun m). */
  padBlend: 7,
  /** Camiler taş set (teras) üstüne oturur: setin en büyük yüksekliği (oyun m). */
  maxTerrace: 6,
  /**
   * Girilebilir yapıların (konut, dükkân, cami, han) zemin katı ayak izinin en yüksek zemininden bu kadar (oyun m)
   * yüksektir: arazi döşemenin içinden çıkmaz (örnekler arası tümsek payı).
   */
  floorLift: 0.15,
  /**
   * Cami sayısı: il merkezinde gerçek cami sayısının `perIl`'de biri (1…`maxIl`), ilçede `perIlce`'de biri
   * (1…`maxIlce`), köyde `villageChance` olasılıkla bir. Camiler arası (tüm yerleşimler) en az `mosqueSpacing`
   * (oyun m) olur; yalnızca il/ilçe merkezinin ilk camisi bu kurala takılmaz.
   */
  mosques: { perIl: 10, maxIl: 3, perIlce: 12, maxIlce: 2, villageChance: 0.45 },
  mosqueSpacing: 70,
  /**
   * Düzenden sonra (komşu teras şevleri) girilebilir yapının odasında arazi döşemenin üstüne çıkıyorsa döşeme o kadar
   * yükseltilir; fark bundan (oyun m) büyükse yapı atılır.
   */
  interiorTolerance: 0.6,
  /** Yamaç eğimi: parselde ±`slopeProbe` (oyun m) arası fark bundan büyükse kapı aşağı (vadiye) bakar. */
  slopeProbe: 3,
  slopeFacingMin: 0.8,
  /** Köşelerden biri bu gerçek rakımın altındaysa (deniz/kıyı) parsel boş kalır. */
  minElevationM: 2,
  /** Yapı kenarı ile yol ekseni arasında, yol yarı genişliğine eklenen pay (oyun m). */
  roadMargin: 1,
  /** Yapılar arasındaki en az boşluk (oyun m; saçak/revak payının dışında). */
  gap: 1.2,
  /** Ayak izi su/yol denetiminin örnek aralığı (oyun m). */
  sampleStep: 3,
  /** Ayak izi (ve sokak) ile akarsu ekseni/göl kıyısı arasındaki en az uzaklık (oyun m; nehir yarı genişliği + pay). */
  waterClearance: 1.9,
  /** Yol parselin yakınından geçiyorsa parsel yoldan bu kadar (parsel aralığı oranı) uzağa kaydırılarak da denenir. */
  roadNudge: [0.25, 0.45],
  /** Merdiven uzunluğu tahmini çarpanı (ucun zemini kapı önünden alçak olabilir; ayırma payı). */
  stairRunPad: 1.35,
  /** Yıkık (çatısız) olma olasılığı (rütbeye göre); terk edilmiş havası. */
  ruinChance: { il: 0.18, ilce: 0.25, koy: 0.35 },
  /** Bir simge yapının gerçek konumuna en çok bu kadar uzak parsele oturabilir (oyun m). */
  landmarkSearchRadius: 60,
  /** Il/ilçe merkezinin ayak izi yarıçapının bu oranı (çekirdek: meydan, cami) yalnızca o merkeze ayrılır. */
  coreReserve: 0.35,
  /** Il/ilçe merkezinde ayak izi yarıçapının bu oranı içindeki il-ilçe ve köy yolları çizilmez (kentin içi sokak ızgarasıdır). */
  innerRoadCut: 0.85,
  /** Kent içinde kesilen yol ucu en yakın sokağa/anayola bu uzaklığa (oyun m) kadar bağlanır. */
  joinReach: 70,
  /** Kaynak bölgenin kıble azimutu için temsilî nokta (enlem, boylam): Batı Karadeniz ortası. */
  qiblaFrom: { lat: 41.1, lon: 31.9 },
} as const;

/** Yerleşim üslubu → konut karışımı (yoğun / seyrek doku; olasılıklar toplamı 1). */
export const SETTLEMENT_STYLES = {
  kasaba: {
    dense: { apartment: 0.7, house: 0.3 },
    sparse: { house: 0.7, konak: 0.15, apartment: 0.15 },
  },
  maden: {
    dense: { apartment: 0.8, lojman: 0.2 },
    sparse: { lojman: 0.45, house: 0.45, apartment: 0.1 },
  },
  sanayi: {
    dense: { apartment: 0.85, lojman: 0.15 },
    sparse: { house: 0.5, lojman: 0.3, apartment: 0.2 },
  },
  osmanli: {
    dense: { konak: 0.55, apartment: 0.35, house: 0.1 },
    sparse: { konak: 0.7, house: 0.3 },
  },
  koy: {
    dense: { house: 0.75, serender: 0.25 },
    sparse: { house: 0.75, serender: 0.25 },
  },
} as const;

/**
 * Kent büyüklüğü (kullanıcı talimatı: "binaları çeşitlendir; büyük illerin küçük illerden farkı olsun — yapı olarak,
 * kat sayısı olarak"; saf mantık `settlements/citySize.ts`). Her il/ilçe merkezine 0 (küçük kasaba) … 1 (metropol)
 * arası bir **kentleşme ölçeği** verilir; düzen (`settlements/layout.ts`) apartman kat sayısını, konut karışımını,
 * çarşı payını, doluluğu, harabeliği ve cephe boyasını bu ölçekle ara değerler (`[küçük, büyük]` çiftleri). Köyler
 * etkilenmez (ölçek 0, düzenleri değişmez).
 */
export const CITY_SIZE = {
  /**
   * İl nüfusu (yaklaşık, TÜİK ADNKS 2023): `settlements.json`'daki nüfus il ve kent nüfusunu karışık taşıdığından
   * ilin büyüklüğü buradan okunur. Tabloda olmayan il küçük sayılır (yeni il eklenirse buraya da eklenmeli;
   * `tests/citySize` denetler).
   */
  provincePopulation: {
    Ankara: 5_803_000,
    Kocaeli: 2_103_000,
    Samsun: 1_378_000,
    Sakarya: 1_101_000,
    Zonguldak: 589_000,
    Çorum: 524_000,
    Düzce: 410_000,
    Kastamonu: 389_000,
    Amasya: 338_000,
    Bolu: 321_000,
    Kırıkkale: 279_000,
    Karabük: 252_000,
    Bartın: 229_000,
    Bilecik: 228_000,
    Sinop: 221_000,
    Çankırı: 200_000,
  } as Readonly<Record<string, number>>,
  /** İl ölçeği: nüfus `smallPop`'ta 0, `largePop`'ta 1 (logaritmik ara değer). */
  smallPop: 200_000,
  largePop: 5_000_000,
  /**
   * İlçe ölçeği = `ilceProvinceWeight` × il ölçeği + (1 − …) × ilçenin kendi ölçeği; kendi ölçeği gerçek bina sayısından
   * (`smallTown` binada 0, `largeTown`'da 1, logaritmik): Keçiören/Gebze kentsel, Ankara'nın kırsal ilçeleri orta.
   */
  ilceProvinceWeight: 0.5,
  smallTown: 1500,
  largeTown: 15000,
  /**
   * Apartman kat sayısı aralığı (zemin dahil) rütbeye göre, `[küçük, büyük]` uçları ölçekle ara değerlenir: küçük il
   * merkezi 3–5, metropol 6–10; küçük ilçe 2–4, büyük ilçe 4–8. Aralık içindeki yer `floorRoll` (zar), merkeze
   * yakınlık `floorCore` ve yoğunluk `floorDensity` ağırlıklarıyla seçilir (kent merkezi yüksek, kenarlar alçak).
   */
  apartmentFloors: {
    il: { min: [3, 6], max: [5, 10] },
    ilce: { min: [2, 4], max: [4, 8] },
  },
  floorRoll: 0.6,
  floorCore: 0.35,
  floorDensity: 0.2,
  /** Konak 3 katlı olma olasılığı (yoksa 2); Osmanlı üslubunda `konakOsmanli` eklenir. */
  konakTall: [0.15, 0.45],
  konakOsmanli: 0.15,
  /** "Yoğun doku" eşiği (100 m hücredeki gerçek bina; `SETTLEMENT_LAYOUT.denseThreshold` yerine). */
  denseThreshold: [8, 3],
  /** Seyrek parselde apartman olasılığı (büyük kentte banliyö de apartmandır). */
  sparseApartment: [0, 0.55],
  /** Yoğun parselde apartman yerine ev (Osmanlı üslubunda konak) olasılığı: küçük kasaba alçak kalır. */
  smallTownHouse: [0.25, 0],
  /**
   * Parsel aralığı çarpanı (`SETTLEMENT_LAYOUT.lotPitch`): 10 m'lik parsele 10 m genişliğindeki apartman komşusuyla
   * yan yana sığmaz; büyük kentte parseller geniştir (apartman bloğu), küçük kasabada sık (evler).
   */
  lotPitchScale: [1, 1.3],
  /** Çekirdekte (merkeze `coreRadius` × yarıçap) dükkân sırası olasılığı. */
  shopShare: [0.5, 0.7],
  coreRadius: [0.28, 0.38],
  /** `SETTLEMENT_LAYOUT.fullDensity`, `maxBuildings` ve `ruinChance` çarpanları: büyük kent dolu ve bakımlı. */
  fullDensityScale: [1.1, 0.7],
  maxBuildingsScale: [1, 1.4],
  ruinScale: [1.25, 0.45],
  /**
   * Büyük kentte apartman sığmayan parsel bu olasılıkla boş kalır (yerine ev kurulmaz): apartman mahalleleri arasında
   * açık alan, gecekondu yerine düzenli doku.
   */
  skipHouseFallback: [0, 0.5],
  /** Kahvehane sayısı (il/ilçe). */
  kahvehane: [2, 3],
  /** Apartmanın boyalı cephe olasılığı (renkler `BUILDING_LOOK.paints`); yoksa çıplak beton. */
  paintChance: [0.15, 0.7],
} as const;

/** Yollar (Faz 10): sınıf başına genişlik (oyun m; gerçek genişlikler abartılı), yumuşatma, ağ düzeni ve zemin düzeltme. */
export const ROADS = {
  /**
   * Dört yol tipi: 0 anayol (şehirler arası; geniş asfalt, şerit çizgili), 1 köy yolu (dar, yıpranmış asfalt),
   * 2 dağ patikası (toprak), 3 kent sokağı (parke/Arnavut kaldırımı, kaldırımlı). Yollar arazi kaplamasında boyanır
   * (renkler `TERRAIN_OVERLAY`). Kentin ana caddesi sokaktır ama `avenueWidth` genişliğindedir.
   */
  width: [6, 3.6, 2.2, 4.4],
  avenueWidth: 6.4,
  /** Yol sorgularının uzamsal ızgara hücresi (oyun m). */
  indexCellSize: 32,
  /**
   * Akarsudan ayırma (`settlements/roadRouting.ts`): akarsuya paralel yol noktaları, yol kenarı ile su kenarı
   * arasında `waterGap` (oyun m) kalana kadar sudan uzağa itilir. `routeStep` sıklaştırma aralığı, `routePasses`
   * yineleme sayısı (yumuşatılmış itme her geçişte kalan çakışmayı biraz daha giderir), `maxWaterShift` geçiş başına en büyük kaydırma (oyun m). Yol doğrultusu ile itme yönü
   * arasındaki açının kosinüsü `crossingCos`'tan büyükse nokta suyu kesiyordur (köprü): itilmez.
   */
  routeStep: 4,
  /**
   * Menderes: yol aynı dereyi aralarında `uncrossGap`'ten (oyun m) kısa mesafe kalacak şekilde iki kez ya da daha çok
   * kesiyorsa, ilk/son kesişimin `uncrossPad` dışındaki kesim A* ile derenin bir yakasından yeniden çizilir.
   */
  uncrossGap: 40,
  uncrossPad: 14,
  routePasses: 6,
  /** Geçiş başına kaydırmaları yumuşatma ([1, 2, 1] / 4 süzgeci) tekrar sayısı. */
  routeSmoothing: 6,
  waterGap: 0.8,
  /** Kaydırılan yolun sonradan sadeleştirme toleransı (oyun m). */
  routeSimplify: 0.25,
  maxWaterShift: 6,
  crossingCos: 0.5,
  /**
   * Yumuşatma (`smoothRoads`): veri yolları 2 m kafese oturtulmuştur (merdiven gibi kırık, dalgalı). Önce bu
   * sapmadan (oyun m) az kırıklar sadeleştirilir, sonra yol `smoothStep` aralıklı noktalara bölünür ve sınıfa göre
   * Gauss süzgeciyle (`smoothSigma`, oyun m) yumuşatılır: keskin köşeler yaklaşık σ yarıçaplı virajlara dönüşür,
   * dalgalanma silinir. Uçlar (kavşaklar) yerinde kalır (σ uca yaklaştıkça sönümlenir).
   */
  smoothTolerance: 2.2,
  smoothStep: 2,
  smoothSigma: [14, 9, 5, 4],
  /** Yumuşatılmış yolun son sadeleştirme toleransı (oyun m). */
  smoothSimplify: 0.2,
  /**
   * Ağ düzeni (`settlements/roadNetwork.ts`): iki uç `nodeSnap` (oyun m) içindeyse aynı kavşaktır; bir uç başka
   * yolun gövdesine `junctionSnap` içindeyse yol orada bölünür (T kavşağı). Hiçbir yola değmeyen (boşta) uç, başka
   * bir yolun gövdesine `gapSnap` içindeyse ona eklenir (verideki küçük kopukluklar).
   */
  nodeSnap: 2.5,
  junctionSnap: 2.2,
  gapSnap: 9,
  /** Dünya kenarına bu kadar (oyun m) yakın uç "harita dışına gider" (çıkmaz sayılmaz). */
  boundsMargin: 16,
  /**
   * Yerleşimin çizgeye bağlanması: merkezden ayak izi yarıçapı + `attachPad` içindeki düğümler bağlanma noktasıdır
   * (merkeze uzaklık × `attachCostFactor` maliyetle; yol merkezden geçmeyi yeğler).
   */
  attachPad: 18,
  attachCostFactor: 0.4,
  /**
   * Kenar maliyeti = uzunluk × sınıf çarpanı × (1 + (eğim / `slopePenaltyDeg`)²). Anayol omurgası veri anayollarını
   * (`trunkClassCost`), köy bağlantıları her yolu (`localClassCost`) kullanır; sıra: veri sınıfı 0, 1, 2.
   */
  slopePenaltyDeg: 32,
  trunkClassCost: [1, 1.6, 2.6, 1.6],
  localClassCost: [1, 1.05, 1.25, 1],
  /**
   * Anayol omurgası: her il/ilçe merkezi en yakın `trunkNeighbors` merkeze en kısa yolla ölçülür; en küçük kapsayan
   * ağaç seçilir, sonra seçili ağda iki merkez arası doğrudan en kısa yolun `trunkDetour` katından uzunsa o yol da
   * eklenir. `trunkMaxCost` arama sınırı (maliyet = ağırlıklı oyun m).
   */
  trunkNeighbors: 5,
  trunkDetour: 1.45,
  trunkMaxCost: 9000,
  /** Dünya kenarındaki anayol uçları bu uzaklıkta (oyun m) kümelenir (çift şeritli yol tek çıkış). */
  exitCluster: 120,
  /**
   * Köy bağlantısı: ağa çizgede en çok `linkMaxCost` maliyetle bağlanır; çizgede yolu olmayan yerleşim en yakın seçili
   * yola (ayak izi + `linkMax` oyun m içinde) A* ile bağlanır.
   */
  linkMaxCost: 4000,
  linkMax: 320,
  /**
   * Tek parça ağ: seçili ağın her bileşeni en ucuz veri yoluyla (en çok `joinMaxCost` maliyet) başka bir bileşene,
   * çizgede bağ yoksa en yakın noktasına (`joinRouteMax` oyun m içinde) A* ile bağlanır; en çok `joinRounds` tur.
   */
  joinMaxCost: 12000,
  joinRouteMax: 700,
  joinRounds: 6,
  /** Köyde ağın en yakın noktası merkezden bu kadar (oyun m) uzaksa merkeze kısa bir giriş yolu eklenir. */
  villageSpurMin: 6,
  /**
   * Dağ patikası: köy bağlantısının ortalama arazi eğimi `trailSlopeDeg`'i aşıyorsa (ya da çoğu veri köy yoluysa ve
   * eğim `trailDirtSlopeDeg`'i aşıyorsa) bağlantı patikadır. Komşu köyler (`trailRadius` içinde) arasında ağ
   * `trailDetour` katından fazla dolaşıyorsa, en çok `trailMaxStretch` kat uzun bir veri yolundan patika eklenir
   * (en çok `trailMax`).
   */
  trailSlopeDeg: 27,
  trailDirtSlopeDeg: 18,
  trailRadius: 650,
  trailDetour: 2.4,
  trailMaxStretch: 1.6,
  trailMax: 70,
  /**
   * Temizlik: bir kenarın uçları arasında, kenarın `loopStretch` katından (en az + `loopPad` m) kısa başka bir yol varsa
   * ve halka çevresi `loopMaxPerimeter`'dan kısaysa (göbek, kavşak kolu, çatal) ya da kenar o yolun her yerinde
   * `twinDistance` içindeyse (çift şeritli yolun ikizi) kenar silinir. Yerleşime varmayan `spurMax`'tan kısa uç silinir.
   */
  /**
   * İkiz şerit: kenarın örneklerinin (`twinSample` m aralıkla) en az `twinShare` oranı başka bir yola `twinDistance`
   * içinde ve ona paralel (`twinAngle` radyan) ise kenar silinir (en az `twinMinLength` m).
   */
  twinSample: 6,
  twinShare: 0.8,
  twinAngle: 0.5,
  twinMinLength: 20,
  loopStretch: 1.35,
  loopPad: 40,
  loopMaxPerimeter: 700,
  twinDistance: 10,
  spurMax: 60,
  /** Rota arama (`settlements/routeFinder.ts`): hücre, pencere payı, düğüm sınırı; dere geçişi ek maliyeti (köprü), eğim ölçeği. */
  routeCell: 4,
  routePad: 70,
  routeMaxNodes: 120000,
  routeBridgeCost: 16,
  routeSlopeScale: 0.3,
  routeSimplifyTolerance: 1.2,
  /**
   * Zemin düzeltme (`settlements/roadProfile.ts`, `world/roadGrading.ts`): yol, zemini yola uydurur. Boyuna profil
   * araziyi `profileSigma` (oyun m) uzunluğunda yumuşatır, en dik eğimi `gradeMax` (yükselti / yatay) ile sınırlar;
   * yol ekseninde zemin en çok `maxCut` (kazı, derin sırtlarda yarma) kadar alçalır, `maxFill` kadar yükselir (dereyi
   * ve derin vadiyi geçen kesim = köprü/viyadük). Enine kesit: `shoulder` düz banket, ardından yamaca `batterCut` / `batterFill`
   * (yükselti / yatay) eğimle yumuşakça bağlanır (en az `minBlend`, en çok `maxBlend` genişlik).
   */
  profileStep: 3,
  profileSigma: [26, 18, 11, 10],
  gradeMax: [0.17, 0.23, 0.34, 0.3],
  maxCut: 10,
  maxFill: [4.5, 4, 3, 2.5],
  shoulder: 1.4,
  batterCut: 1,
  batterFill: 0.65,
  minBlend: 2.6,
  /** Yol gövdesinin dışındaki bir hücrede zeminin doğal yüksekliğinden en çok değişimi (oyun m). */
  maxEdgeChange: 8,
  /** Köprü güvertesinin (yatak) altında zeminin kalacağı en çok yükseklik: yatak − bu değer (oyun m; güverte kalınlığı + boşluk). */
  bridgeClearance: 0.9,
  maxBlend: 11,
  /**
   * Dağ patikası istisnası: patikada (sınıf 2) arazinin eğimi `mountainSlopeDeg`'in üstündeyse zemin düzeltilmez;
   * `mountainSlopeDeg − mountainBlendDeg` altında tam düzeltilir (arası yumuşak geçiş).
   */
  mountainSlopeDeg: 38,
  mountainBlendDeg: 14,
  /** Akarsu çizgisine (yarı genişlik +) bu kadar (oyun m) yakın hücre yol dolgusuyla yükseltilmez. */
  streamGuard: 1.6,
  /** Düzeltme denizden (oyun y) bu kadarın altına inmez ve deniz hücrelerine dokunmaz. */
  minBedHeight: 0.18,
} as const;

/**
 * Yol levhaları (`settlements/roadSigns.ts` yer ve içerik, `world/RoadSignLayer.ts` çizim). Uzunluklar oyun metresi;
 * levhadaki uzaklıklar gerçek kilometredir (yol ağı üzerinden, `HORIZONTAL_SCALE`).
 */
export const ROAD_SIGNS = {
  /**
   * Yön levhası: en az `junctionMinArms` kollu ve en az bir kolu anayol/köy yolu olan kavşaklara (il/ilçe merkezinin
   * kesim dairesinin `townClearance` katı dışında) konur. Birbirine `mergeDistance`'tan yakın kavşaklarda tek levha.
   * Kol yönü kavşaktan yol boyunca `armProbe` ilerideki noktaya bakar; aralarında `armMergeDeg`'den dar açı olan kollar
   * tek koldur. Kol başına en çok `maxLinesPerArm` hedef: o koldan en yakın il merkezleri; ilçe merkezi en yakın ilin
   * `ilceShare` katından yakınsa (ya da kolda il yoksa, `ilceMaxKm` içinde) önce o yazılır. Levha başına en çok `maxPlates`.
   */
  junctionMinArms: 3,
  townClearance: 1.25,
  mergeDistance: 70,
  armProbe: 14,
  armMergeDeg: 22,
  maxLinesPerArm: 2,
  ilceShare: 0.6,
  ilceMaxKm: 90,
  maxPlates: 6,
  /** Direk yol kenarından bu kadar dışarıda (yol yarı genişliğine eklenir). */
  sideOffset: 1.4,
  /**
   * Yerleşim (il/ilçe) giriş levhası: kente varan yol ucundan (kesim dairesi ya da ayak izi + `attachPad`, + `edgeTolerance`)
   * yol boyunca `entranceOutward` dışarıda, gelen sürücünün sağında; birbirine `entranceMerge`'den yakın girişlerde tek levha.
   */
  edgeTolerance: 8,
  entranceOutward: 12,
  entranceMerge: 30,
  /** Çizim: oyuncuya `drawRadius` içindeki en yakın `maxDrawn` levha (levha başına bir yazı dokusu); `refreshDistance`. */
  drawRadius: 240,
  maxDrawn: 10,
  refreshDistance: 12,
  /** Direklerin çarpışma kutuları oyuncuya bu kadar yakın levhalar için kurulur. */
  colliderRadius: 60,
  /**
   * Ölçüler: yön plakası (ok biçimli, mavi zemin beyaz yazı) `plate` genişlik × yükseklik, ok ucu `plateTip`, plakalar
   * arası `plateGap`, en alttaki plakanın alt kenarı `plateBase`; giriş levhası (beyaz zemin siyah yazı) `board`,
   * alt kenarı `boardBase`, iki direği arası `boardPosts`. Direk kalınlığı `post`.
   */
  plate: { width: 2.3, height: 0.42, depth: 0.05 },
  plateTip: 0.32,
  plateGap: 0.08,
  plateBase: 1.7,
  board: { width: 2.8, height: 1.5, depth: 0.06 },
  boardBase: 1.1,
  boardPosts: 2.2,
  post: 0.09,
  /** Renkler (sRGB). */
  colors: {
    post: '#8a8f94',
    plate: '#1c4f9c',
    plateText: '#ffffff',
    board: '#f4f4f0',
    boardText: '#111111',
    exitSlash: '#c8202a',
    back: '#7d8186',
  },
} as const;

/**
 * Akarsu yatağı oyma (`world/streamCarving.ts`): çizgi `step` (oyun m) aralıkla örneklenir; yatak, çizginin iki yanında
 * (yarı genişlik + `lateralReach`) en alçak zemindir, akış yönünde yükselmez, doğal zeminden en çok `maxDepth` iner. Su
 * içinde zemin yatağın `channelDepth` altına, `bankWidth` genişliğinde kıyı bandıyla doğal zemine bağlanır; en çok
 * `minHeight`'a kadar.
 */
export const STREAM_CARVING = {
  step: 2,
  lateralReach: 3,
  maxDepth: 1.8,
  channelDepth: 0.25,
  bankWidth: 3.5,
  /** Oyulan zemin bu yükseklikten (oyun y) aşağı inmez (kıyı ovası denize dönmesin). */
  minHeight: 0.35,
} as const;

/**
 * Yol yapıları (köprü, viyadük, tünel): `settlements/roadProfile.ts` yerlerini seçer, `world/roadStructureGeometry.ts`
 * çizer, `world/RoadStructureColliders.ts` çarpıştırır, `world/roadTunnels.ts` tünel ağızlarında araziyi deler.
 * Uzunluklar oyun metresi.
 */
export const ROAD_STRUCTURES = {
  /**
   * Köprü yalnızca yolun akarsu çizgisini kestiği yerde kurulur. Uzunluk = (su yarı genişliği + `bank` kıyı payı) × 2 /
   * sin(geçiş açısı) (açı en az `minCrossingDeg`), en az `minSpan`. Aralarında `bridgeMergeGap`'ten az zemin kalan
   * köprüler tek köprü olur (arka arkaya köprü yok).
   */
  bank: 1.1,
  minCrossingDeg: 32,
  minSpan: 5,
  bridgeMergeGap: 18,
  /** Güverte zeminden en az bu kadar yüksekte; güverte kalınlığı, korkuluk yüksekliği/kalınlığı. */
  clearance: 0.8,
  deckThickness: 0.55,
  parapetHeight: 0.95,
  parapetThickness: 0.28,
  /** Güverte yolun toplam genişliğine (her yana) eklenen pay: sınıf başına. */
  widthPad: [0.6, 0.45, 0.25, 0.4],
  /** Ayak aralığı (oyun m) ve kalınlığı: güverte zeminden `pierMinHeight`'tan yüksekse ayak konur. */
  pierSpacing: 12,
  pierSize: 0.9,
  pierMinHeight: 2.2,
  /** Yapı çizimi ve collider'ları oyuncuya bu uzaklıktaki (oyun m) yapılar için kurulur. */
  drawRadius: 520,
  colliderRadius: 90,
  refreshDistance: 30,
  /**
   * Viyadük (yalnız anayol): güverte zeminden `viaductFill`'den (oyun m) yüksek dolgu en az `viaductMinLength` sürerse
   * ya da dolgu sınırını `fillSlack` kadar aşarsa köprü kurulur. Diğer yollar vadide araziyi izler.
   */
  viaductFill: 4,
  viaductMinLength: 24,
  fillSlack: 1,
  /**
   * Köprü türü: anayolda beton kiriş, yüksekliği `viaductHeight`'i ve uzunluğu `archMaxLength`'i aşarsa viyadük; köy
   * yolunda `archMaxLength`'e kadar çoğunlukla (`archShare`) taş kemer, değilse beton; patikada `woodenMaxLength`'e
   * kadar ahşap, değilse taş kemer.
   */
  viaductHeight: 6,
  archMaxLength: 24,
  archShare: 0.7,
  woodenMaxLength: 14,
  /**
   * Tünel (anayol, köy yolu): eğim sınırlı profil arazinin `tunnelDepth`'ten derin altından geçiyorsa; ağızlar kazının
   * `portalDepth`'e indiği yerde (tünel boyu en az `tunnelMinLength`; aradaki kısa sığ kesim `tunnelMergeGap`'e kadar
   * tünele katılır). İç yükseklik `tunnelHeight`, yol kenarından duvara `tunnelSidePad`, duvar/tavan kalınlığı
   * `tunnelWall` (ağızdaki arazi deliğinin kenarını örter: hücre köşegeninin yarısından kalın olmalı; tavan üstü
   * `portalDepth`'ten alçak kalmalı); ağız cephesi yoldan `portalWing` taşar, üstü tavanın `portalCrown` üstündedir.
   * Lambalar `lampSpacing` aralıkla.
   */
  tunnelDepth: 11,
  portalDepth: 7,
  tunnelMinLength: 36,
  tunnelMergeGap: 18,
  tunnelHeight: 4.6,
  tunnelSidePad: 1,
  tunnelWall: 1.8,
  portalWing: 2.2,
  portalCrown: 1.6,
  lampSpacing: 12,
  /**
   * Deniz geçişi (kullanıcı talimatı: "Gebze civarındaki Osman Gazi Köprüsü"; körfezi geçen otoyol deniz tabanında
   * kalıyordu): yolun deniz hücrelerindeki (doğal yükseklik < 0) kesimi `seaBridgeMin`'den (oyun m) uzunsa köprüdür;
   * güverte suyun en az `seaClearance` üstündedir. Anayolda `suspensionMinLength`'ten uzun deniz geçişi asma köprüdür
   * (`suspension`: iki kule, ana kablolar, askılar; güverte suyun `suspensionClearance` üstünde — gerçekte 64 m / dikey
   * ölçek 15). Kent içinde de bu geçiş ve iki yanında `seaApproach` kadar yaklaşım anayol kalır (cadde sayılmaz).
   */
  seaBridgeMin: 6,
  seaClearance: 1.6,
  suspensionMinLength: 30,
  suspensionClearance: 4.3,
  seaApproach: 30,
  /**
   * Asma köprü: kulelerin güverteden yüksekliği (gerçekte ~188 m / 15), kule bacağı kalınlığı, ana açıklığın kenar
   * açıklığına oranı (1 550 m / 566 m), kulelerin deniz kesiminin uçlarından içeri payı (deniz kesimi boyuna oranı),
   * kablonun açıklık ortasında güverteden yüksekliği ve kalınlığı, askı aralığı (yol noktası).
   */
  towerHeight: 12.5,
  towerLeg: 0.9,
  sideSpanShare: 0.365,
  towerInset: 0.12,
  cableSag: 1.1,
  cableHalf: 0.09,
  hangerHalf: 0.03,
  /**
   * Köprü güvertesinin ve tünel zemininin üstündeki yol yüzeyi (kullanıcı talimatı: "köprüler gri olmasın, ayakları gri
   * olsun; köprünün üstündeki yol hangi yolsa o renkte olsun; tüneller de"): yol tipinin rengi (`TERRAIN_OVERLAY`:
   * anayol koyu asfalt + kenar çizgileri ve kesik orta şerit, köy yolu açık asfalt, patika toprak, kent sokağı parke +
   * kaldırım). Kalınlık (oyun m) güvertenin üstüne eklenir; çizgiler yüzeyin `markingLift` üstündedir.
   */
  surfaceThickness: 0.04,
  markingLift: 0.012,
  /** Anayol kenar çizgisinin genişliği (oyun m). */
  edgeLineWidth: 0.14,
  /**
   * Köprü yaklaşım plakası: ayaktan önceki bir yol parçası boyunca güverteyle aynı üst yüzde, yolun renginde plaka;
   * yol genişliğine (her yana) eklenen pay (oyun m). Zemindeki boyalı yol ile güverte arasında basamak kalmasın.
   */
  approachPad: 0.15,
  /** Ahşap köprüde toprak yolun güverteye oranı (kalas kenarları görünür kalsın). */
  woodenTrailShare: 0.75,
  /** Renkler 0xRRGGBB (tür başına). */
  colors: {
    parapet: 0x9a9284,
    pier: 0x86827a,
    guardRail: 0xb9bcc0,
    stone: 0x9b8e78,
    stoneDark: 0x7d705c,
    wood: 0x6e5038,
    woodLight: 0x8f6d4b,
    tunnel: 0x2b2926,
    tunnelFloor: 0x3a3a3c,
    portal: 0xa9a49a,
    lamp: 0xffc36b,
    /** Asma köprü kulesi (ayak gibi gri beton) ve çelik kablolar. */
    tower: 0x8c8a86,
    cable: 0x4b5057,
  },
} as const;

/** Yerleşim yapılarının görünümü (Faz 10): renkler 0xRRGGBB, çizim uzaklıkları oyun m. */
export const BUILDING_LOOK = {
  colors: {
    whitewash: 0xd6cfbf,
    plaster: 0xcbbfa6,
    konakWall: 0xe4dccb,
    timber: 0x5b4130,
    stone: 0x9a917f,
    cutStone: 0xcdc6b5,
    darkStone: 0x7c7466,
    roofTile: 0x8c4a33,
    roofTileDark: 0x6c3a29,
    concrete: 0xb3ada2,
    concreteDark: 0x8f8a80,
    window: 0x1b1c20,
    boarded: 0x6a5238,
    door: 0x47321f,
    lead: 0x77828c,
    leadDark: 0x5f6973,
    gold: 0xb29546,
    wood: 0x775638,
    woodLight: 0x9b7a55,
    marble: 0xdfdacf,
    shutter: 0x7f8286,
    awning: 0x7d3b2f,
    cypress: 0x26402b,
    brick: 0x7b4636,
    steel: 0x4c5056,
    rubble: 0x857c6d,
    sign: 0x2f4f6f,
    tank: 0xa7a9ab,
    clockFace: 0xe9e4d6,
    // İç mekân (girilebilir yapılar): pencerenin içten görünen aydınlık camı, sıva, döşeme, kilim/halı, çini.
    windowInner: 0xa9c0cf,
    plasterInner: 0xe6dcc6,
    plank: 0x8a6440,
    plankDark: 0x5e432b,
    kilim: 0x8e2f27,
    kilimAccent: 0xc79a3c,
    cushion: 0x9c3b2c,
    carpet: 0x8b1f24,
    carpetAccent: 0x2f5f74,
    tile: 0x2c8c88,
    tileDark: 0x1d5f69,
    ceiling: 0xd9cfba,
    water: 0x4d8496,
    sill: 0xbcb4a1,
  },
  /**
   * Bu uzaklığa kadar girilebilir yapıların iç mekânı (eşya, sıva, döşeme, içten pencereler) ve pencere kayıtları da
   * çizilir (en yakın kademe; `refreshDistance` kadar gecikebilir, içeride her zaman görünür).
   */
  interiorRadius: 70,
  /** Bu uzaklığa kadar ayrıntılı (yakın) geometri, ötesinde kaba (uzak) geometri çizilir. */
  nearRadius: 260,
  /** Yapıların çizim yarıçapı. */
  drawRadius: 1500,
  /** Oyuncu bu kadar yer değiştirince örnek tamponları yenilenir. */
  refreshDistance: 20,
  /** Örnek başına ton çarpanı aralığı (solgunluk çeşitlemesi). */
  toneRange: [0.82, 1.06],
  /**
   * Apartman cephe boyaları (örnek rengiyle çarpılır; açık pastel: krem, şeftali, açık mavi, sarı, açık yeşil, gül).
   * `Building.paint` 1…n bu listenin sırasıdır (0 = boyasız beton; `CITY_SIZE.paintChance`).
   */
  paints: [0xfff1d6, 0xffd9c2, 0xd6e6f2, 0xfbe7a6, 0xdcebcf, 0xf6d3d0],
  /** Yıkık yapılar bu kadar koyulaşır (is, yosun). */
  ruinDarken: 0.8,
  /** Taş temelin zemin altına inen payı (oyun m). */
  plinthSink: 0.6,
  /** Collider'lar yalnızca oyuncuya bu yarıçaptaki yapılara kurulur. */
  colliderRadius: 140,
} as const;

/**
 * Camide vakit namazı: harimde `E` basılı `seconds` saniye tutulunca sağlık `healthGain` artar (100'ü aşmaz); her
 * vakitte bir kez (`survival/prayer.ts`). Güneş doğuşu–öğle arası vakit değildir.
 */
export const PRAYER = {
  seconds: 6,
  healthGain: 15,
} as const;

/** Yapı arama (Faz 10): kapıda `E` basılı tutulur; her yapı bir kez aranır (kayda girer). */
export const SEARCH = {
  /** Arama süresi (sn). */
  seconds: 3,
  /** Kapı noktasına en çok bu yatay uzaklık (oyun m) ve dikey fark. */
  reach: 2.6,
  verticalReach: 3,
  /** Oyuncunun bakışı ile yapı merkezi arasındaki en büyük yatay açı (derece). */
  viewConeDeg: 70,
  /** Ganimet tohumu (aynı yapı her oyunda aynı ganimeti verir). */
  seed: 0x10071,
  /**
   * Bina içi kaplar (sandık, dolap): arama süresi (sn), kabın ön yüzüne en çok yatay uzaklık ve kat zeminine dikey fark
   * (oyun m), bakış konisi (derece). Yapının ganimet tablosu her ek kap için `containerChanceScale` kadar cömert
   * zarlanır (en çok `containerChanceMax` kat; satır olasılığı ≤ 0,95) ve kaplara dağıtılır; tuz kapı ganimetinden
   * ayrı bir zar dizisi verir.
   */
  containerSeconds: 1.6,
  containerReach: 1.7,
  containerVerticalReach: 1.6,
  containerConeDeg: 55,
  containerChanceScale: 0.35,
  containerChanceMax: 1.8,
  containerSeedSalt: 0x5a7d,
  /** Üst kat kaplarının tohum tuzu (her kat ayrı zarlanır; `rollUpperContainerLoot`). */
  upperFloorSeedSalt: 0x7c3f,
  /** Kapısı aranacak yapıların merkezinin sorgulandığı yarıçap (oyun m; en büyük yapı payıyla). */
  queryRadius: 24,
  /** Yıkık yapıda her ganimet olasılığı bu oranla çarpılır (çatı çökmüş, kiler ıslanmış). */
  ruinedChanceScale: 0.5,
} as const;

/**
 * Diğer insanlar (Faz 10): çok nadir, barışçıl yolcular. Kasabalar terk edilmiştir; kalanlar yollarda ve
 * köylerde dolaşır, selam verir, yol tarif eder, takas yapar. Saldırılamazlar; canlılar da onları hedef almaz.
 */
export const PEOPLE = {
  /** Aynı anda en çok kişi. */
  maxActive: 2,
  /** Doğma denemesi aralığı (gerçek sn) ve olasılığı: yol/yerleşim yakınında ve başka yerde. */
  spawnCheckSeconds: 60,
  spawnChanceNearRoads: 0.05,
  spawnChanceWild: 0.012,
  /** Yol/yerleşim "yakın" sayılma uzaklığı (oyun m). */
  nearRoadDistance: 40,
  /** Oyuncuya doğma uzaklığı (oyun m). */
  spawnMinDistance: 60,
  spawnMaxDistance: 110,
  /** Bu uzaklığı aşan ya da ömrü dolan kişi kaybolur (oyun m, gerçek sn). */
  despawnDistance: 320,
  lifetimeSeconds: 900,
  /** Yürüyüş hızı (oyun m/sn) ve oyuncuyu fark etme/selamlama uzaklıkları. */
  walkSpeed: 1.3,
  noticeDistance: 22,
  greetDistance: 3.2,
  /** Oyuncu bu kadar uzaklaşınca kişi yoluna devam eder. */
  partDistance: 14,
  /** Konuşma için erişim (oyun m) ve bakış konisi (derece). */
  talkReach: 3.5,
  talkConeDeg: 50,
  /** Gezinme hedefi aralığı (oyun m). */
  wanderRadius: 40,
  /** Doğma noktasının en dik yamacı (derece). */
  maxSlopeDeg: 35,
  /** Tohum. */
  seed: 0x9e0b1e,
} as const;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Faz 11 — İnşa II, Tarım, Silahlar, Eşkıya ve Drone (docs/faz-11-paralel-plan.md §3.3). 11.0 her akışın bloğunu
// başlangıç değerleriyle açar; her akış YALNIZCA kendi bloğunun içini değiştirir.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ── Faz 11: A (11.1) ── Modüler inşa II: merdiven, giriş basamağı, direk, korkuluk, yarım duvar, beşik çatı ve alın
 * duvarı; üst kat tabanı. Ölçüler oyun metresidir; ızgara ve kat yüksekliği `PIECES`'ten gelir.
 */
export const PIECES_II = {
  /**
   * Merdiven: ızgara hücresi cinsinden uzunluk (1 × `cells`), bir kat (`STOREY`) çıkar; görsel basamak sayısı ve
   * basamakların yarı genişliği (duvar kalınlığına pay bırakır). Collider eğik rampadır (basamak burunlarından geçer).
   */
  stairs: { cells: 2, steps: 12, halfWidth: 0.86 },
  /**
   * Giriş basamağı: tabanın kenarına dışarıdan; zemine doğru `depth` boyunca `maxRise` kadar iner (eğik rampa
   * collider'ı). Dış ucunda zemin tabanın üst yüzünden `maxRise` + `gapTolerance`'tan aşağıdaysa kurulamaz.
   */
  entryStep: { steps: 4, maxRise: 1.2, depth: 1.6, halfWidth: 0.8, gapTolerance: 0.15 },
  /** Direk kesiti (kare kenarı). */
  pillar: { size: 0.25 },
  /** Korkuluk yüksekliği (plakanın üstünden), görsel kalınlığı ve collider kalınlığı. */
  railing: { height: 1, thickness: 0.08, solidThickness: 0.14 },
  /** Yarım duvar yüksekliği (plakanın üstünden). */
  halfWall: { height: 1.1 },
  /**
   * Beşik çatı: mahyaya dik genişlik (hücre; mahya boyunca 1 hücre), eğim (derece), saçak payı ve kaplama kalınlığı.
   * Mahya yüksekliği `cell · tan(pitchDeg)` (≈ 1,15 m).
   */
  gableRoof: { cells: 2, pitchDeg: 30, overhang: 0.3, thickness: 0.12 },
  /** Üst kat tabanı: alt kat duvarı/direği olmayan hücreye, desteklenen üst tabandan en çok bu kadar hücre çıkıntı (balkon). */
  upperFloor: { overhangCells: 1 },
  /** Merdiven boşluklu taban: deliğin çevresinde kalan kenar şeridi (oyun m). */
  stairwell: { rim: 0.12 },
} as const;

/** ── Faz 11: B (11.3) ── Çitler: ahşap çit, kuru taş duvar, çit kapısı (2 m ızgara kenarı, zemini izler). */
export const FENCES = {
  /** Parça uzunluğu (ızgara kenarı, oyun m). */
  length: 2,
  /** Tür başına yükseklik ve kalınlık (oyun m). */
  wood: { height: 1.1, thickness: 0.1 },
  stone: { height: 0.9, thickness: 0.5 },
  gate: { height: 1.1, thickness: 0.1 },
  /** Bir parçanın iki ucu arasındaki en büyük yükseklik farkı (oyun m); daha dik yere çit konmaz. */
  maxEndRise: 1.6,
  /** Uç yükseklik farkı kayda ve geometriye bu adımla (oyun m) yuvarlanarak girer (geometri önbelleği küçük kalır). */
  riseStep: 0.1,
  /** Parçanın zemine gömülü kısmı (oyun m): kirişin altında ve yamaçta boşluk kalmasın. */
  skirt: 0.5,
  /**
   * Hayalet yuvası seçimi: bakışa dik uzanan kenar tercih edilir (çit bakışın önünden geçer); bu pay (oyun m)
   * tercih edilmeyen yönün kenar uzaklığına eklenir. `R` yalnızca bakışa paralel kenarları aday yapar.
   */
  axisBias: 0.7,
} as const;

/** ── Faz 11: B (11.2) ── Kurutma rafı: çiğ et belli sürede kurutulmuş ete dönüşür (bozulmaz yiyecek). */
export const DRYING = {
  /** Rafın aynı anda kurutabildiği en çok parça. */
  capacity: 4,
  /** Bir partinin kuruma süresi (gerçek sn; 240 sn = 4 oyun saati). */
  seconds: 240,
  /** Her çiğ et parçasından çıkan kurutulmuş et. */
  yieldPerPiece: 1,
  /** Rafa `E` ile erişim: rafın kenarına en çok bu kadar yatay uzaklık (oyun m). */
  reach: 2.5,
} as const;

/**
 * ── Faz 11: B (11.3) ── Engel sorgusu (`placement/obstacles.ts`): oyuncu yapıları canlıların, insanların ve eşkıyaların
 * kinematik yürüyüşünü keser. Yalnızca zemine yakın katı kutular sayılır.
 */
export const STRUCTURE_OBSTACLES = {
  /** Uzamsal ızgara hücresi (oyun m). */
  cell: 8,
  /** Bir kutu, yapının tabanından bu yükseklikten (oyun m) aşağıda başlıyorsa yürüyen gövdeyi keser (lento sayılmaz). */
  maxBottom: 0.6,
  /** Kutunun tepesi en az bu kadar yüksekse engeldir (plakalar ve basamaklar yürünür). */
  minTop: 0.4,
} as const;

/**
 * Katı nesneler (kullanıcı talimatı: "hiçbir nesnenin içinden ne oyuncu ne canlılar geçemesin"): ağaç, kaya ve çalılar
 * silindir collider'dır (yerdeki dal/taş/mantar geçilir). Tür başına `radius` (ölçek 1'de gövde/gövde-taban yarıçapı;
 * taç değil), `height` (collider boyu; ağaçta oyuncunun aşamayacağı kadar yüksek, çalı/kayada görsel boy) ve
 * `scaleHeight` (boy nesne ölçeğiyle büyür mü). Rapier collider'ları oyuncuya `colliderRadius` içindekiler için kurulur
 * (`resyncDistance` hareketle yenilenir); aynı tablo canlı/insan/eşkıya engel sorgusunda da kullanılır.
 */
export const PROP_SOLIDS = {
  colliderRadius: 36,
  resyncDistance: 5,
  /** Yarıçap hiçbir ölçekte bu değerin altına inmez (oyun m). */
  minRadius: 0.25,
  kinds: {
    tree_broadleaf: { radius: 0.75, height: 6, scaleHeight: false },
    tree_conifer: { radius: 0.55, height: 6, scaleHeight: false },
    chestnut: { radius: 0.75, height: 6, scaleHeight: false },
    hazel: { radius: 0.5, height: 3, scaleHeight: false },
    bush: { radius: 0.9, height: 1.1, scaleHeight: true },
    berry_bush: { radius: 0.75, height: 1, scaleHeight: true },
    rock: { radius: 0.95, height: 1.1, scaleHeight: true },
  } as Readonly<
    Record<string, { radius: number; height: number; scaleHeight: boolean } | undefined>
  >,
} as const;

/** ── Faz 11: B (11.2) ── Döşek: üstünde hareketsiz dinlenirken barınak etkisinin üstüne eklenen çarpanlar. */
export const BEDS = {
  /** Döşeğe bu yatay uzaklıkta (oyun m) durulursa üstünde sayılır. */
  reach: 1,
  /** Dinlenirken enerji ve can dolum hızı çarpanları (barınak çarpanıyla çarpılır). */
  energyMultiplier: 1.6,
  healthMultiplier: 1.4,
} as const;

/** ── Faz 11: B (11.2) ── Güneş paneli: gündüz şarj gücü üretir (drone pili F'de okur, `solarChargeAt`). */
export const SOLAR = {
  /** Güneş bu yükseklik açısının (derece) altındayken üretim yok. */
  minSunAltitudeDeg: 5,
  /** Tam güneşte (yükseklik ≥ `fullSunAltitudeDeg`) saniyede eklenen pil oranı (0–1). */
  chargePerSecond: 1 / 300,
  fullSunAltitudeDeg: 45,
  /** Panelin şarj ettiği yarıçap (oyun m). */
  reach: 4,
  /** Aynı noktayı şarj eden panellerin etkili sayısı bu değeri aşmaz (üst üste yığılma sınırı). */
  maxPanels: 3,
} as const;

/** ── Faz 11: C (11.4) ── Ekme biçme: tarla, ekin süreleri, sulama, kuruma, verim, domuz baskını. */
export const FARMING = {
  /** Tarla hücresi kenarı (oyun m; inşa ızgarasıyla aynı). */
  plotSize: 2,
  /** Tarla açılabilen arazi örtüsü sınıfları ve en dik eğim (derece). */
  covers: ['grass', 'crop', 'shrub'],
  maxSlopeDeg: 20,
  /** Ekim → olgunluk süresi (oyun günü); anahtar ekilen eşya. */
  growDays: { wheat_seed: 3, corn_seed: 4, dry_beans: 2.5, potato: 3 },
  /** Büyüme evresi sayısı (son evre olgun). */
  stages: 4,
  /** Sulanmamış tarlanın büyüme hızı çarpanı ve kuruyup ölmesi için susuz geçen süre (oyun günü). */
  dryGrowthFactor: 0.5,
  wiltDays: 2,
  /** Sulamanın etkisi (oyun günü). */
  wateredDays: 1,
  /** Hasat süresi (sn): elle / orakla; orakla verim çarpanı. */
  harvestSeconds: 4,
  harvestSecondsSickle: 1.5,
  sickleYieldFactor: 1.5,
  /** Gece olgun tarlaya yönelen yaban domuzunun algı yarıçapı (oyun m). */
  boarRaidRadius: 60,
} as const;

/**
 * ── Faz 11: D (11.5) ── Menzilli silahlar (balistik `combat/ballistics.ts`, atış `combat/ranged.ts`, durum
 * `combat/RangedSystem.ts`). Silah başına: `speed` mermi çıkış hızı (oyun m/sn), `gravity` yerçekimi çarpanı (ok ve
 * taş ağır düşer), `spreadDeg` kalçadan atışta saçılma koni yarı açısı (derece), `pellets` tane sayısı (saçma),
 * `magazine` şarjör, `reloadSeconds` doldurma, `cooldownSeconds` iki atış arası (sürgü/tetik), `range` merminin
 * en çok gideceği yol (oyun m; ötesinde düşer, iz kaybolur), `damage` tane başına hasar (uzaklıkla azalır:
 * `falloff`), `ammo` mühimmat eşyası, `energyCost` atış başına enerji (yay/sapan germe), `recoilDeg` bakışı yukarı
 * iten tepme, `aimFovDeg` dürbünsüz nişandaki görüş açısı, `scopeZoom` silahın kendi dürbünü (0 = yok; keskin nişancı
 * 4x), `scopeMax` takılabilen en büyük dürbün (0 = takılmaz; `scopes`), `auto` tetik basılı tutulunca seri atış, `zeroMeters`
 * nişangâhın sıfırlandığı uzaklık (bu uzaklıkta nişangâh tam isabet eder; yakında hafif yüksek vurur).
 * Ölçek notu: dünya yatayda 1:50 olduğundan menziller oyun metresidir (200 oyun m = 10 gerçek km); yerçekimi
 * gerçek değerdedir, dolayısıyla ok/taş 30–60 m'de belirgin kavis çizer, tüfek mermisi 200 m'de ~0,4 m düşer.
 */
export const RANGED = {
  weapons: {
    slingshot: {
      speed: 38,
      gravity: 1,
      spreadDeg: 2.2,
      pellets: 1,
      magazine: 1,
      reloadSeconds: 0.7,
      cooldownSeconds: 0.2,
      range: 45,
      damage: 9,
      ammo: 'stone',
      energyCost: 1.5,
      recoilDeg: 0,
      aimFovDeg: 60,
      scopeZoom: 0,
      scopeMax: 0,
      auto: false,
      zeroMeters: 15,
    },
    bow: {
      speed: 62,
      gravity: 1,
      spreadDeg: 1.4,
      pellets: 1,
      magazine: 1,
      reloadSeconds: 0.9,
      cooldownSeconds: 0.2,
      range: 90,
      damage: 32,
      ammo: 'arrow',
      energyCost: 3,
      recoilDeg: 0,
      aimFovDeg: 55,
      scopeZoom: 0,
      scopeMax: 2,
      auto: false,
      zeroMeters: 20,
    },
    shotgun: {
      speed: 300,
      gravity: 1,
      spreadDeg: 4.5,
      pellets: 8,
      magazine: 2,
      reloadSeconds: 2.2,
      cooldownSeconds: 0.45,
      range: 45,
      damage: 10,
      ammo: 'shotgun_shell',
      energyCost: 0,
      recoilDeg: 4.5,
      aimFovDeg: 58,
      scopeZoom: 0,
      scopeMax: 2,
      auto: false,
      zeroMeters: 20,
    },
    pistol: {
      speed: 350,
      gravity: 1,
      spreadDeg: 1.6,
      pellets: 1,
      magazine: 8,
      reloadSeconds: 1.6,
      cooldownSeconds: 0.28,
      range: 80,
      damage: 22,
      ammo: 'pistol_ammo',
      energyCost: 0,
      recoilDeg: 2,
      aimFovDeg: 58,
      scopeZoom: 0,
      scopeMax: 2,
      auto: false,
      zeroMeters: 25,
    },
    rifle: {
      speed: 700,
      gravity: 1,
      spreadDeg: 0.8,
      pellets: 1,
      magazine: 5,
      reloadSeconds: 2.4,
      cooldownSeconds: 0.9,
      range: 260,
      damage: 48,
      ammo: 'rifle_ammo',
      energyCost: 0,
      recoilDeg: 3,
      aimFovDeg: 45,
      scopeZoom: 0,
      scopeMax: 8,
      auto: false,
      zeroMeters: 100,
    },
    sniper_rifle: {
      speed: 850,
      gravity: 1,
      spreadDeg: 1.2,
      pellets: 1,
      magazine: 5,
      reloadSeconds: 2.8,
      cooldownSeconds: 1.4,
      range: 480,
      damage: 85,
      ammo: 'rifle_ammo',
      energyCost: 0,
      recoilDeg: 4,
      aimFovDeg: 12,
      scopeZoom: 4,
      scopeMax: 16,
      auto: false,
      zeroMeters: 200,
    },
    // ── Yeni silahlar (kullanıcı talimatı: "silah çeşitlerini arttır") ──
    revolver: {
      speed: 330,
      gravity: 1,
      spreadDeg: 1.3,
      pellets: 1,
      magazine: 6,
      reloadSeconds: 2.6,
      cooldownSeconds: 0.55,
      range: 90,
      damage: 34,
      ammo: 'pistol_ammo',
      energyCost: 0,
      recoilDeg: 3.5,
      aimFovDeg: 56,
      scopeZoom: 0,
      scopeMax: 2,
      auto: false,
      zeroMeters: 25,
    },
    smg: {
      speed: 340,
      gravity: 1,
      spreadDeg: 2.6,
      pellets: 1,
      magazine: 30,
      reloadSeconds: 2.1,
      cooldownSeconds: 0.085,
      range: 70,
      damage: 14,
      ammo: 'pistol_ammo',
      energyCost: 0,
      recoilDeg: 0.9,
      aimFovDeg: 56,
      scopeZoom: 0,
      scopeMax: 4,
      auto: true,
      zeroMeters: 25,
    },
    assault_rifle: {
      speed: 680,
      gravity: 1,
      spreadDeg: 1.5,
      pellets: 1,
      magazine: 25,
      reloadSeconds: 2.5,
      cooldownSeconds: 0.12,
      range: 230,
      damage: 30,
      ammo: 'rifle_ammo',
      energyCost: 0,
      recoilDeg: 1.4,
      aimFovDeg: 50,
      scopeZoom: 0,
      scopeMax: 8,
      auto: true,
      zeroMeters: 100,
    },
    marksman_rifle: {
      speed: 780,
      gravity: 1,
      spreadDeg: 1,
      pellets: 1,
      magazine: 10,
      reloadSeconds: 2.7,
      cooldownSeconds: 0.45,
      range: 400,
      damage: 58,
      ammo: 'rifle_ammo',
      energyCost: 0,
      recoilDeg: 2.6,
      aimFovDeg: 45,
      scopeZoom: 0,
      scopeMax: 16,
      auto: false,
      zeroMeters: 150,
    },
    lmg: {
      speed: 700,
      gravity: 1,
      spreadDeg: 2.4,
      pellets: 1,
      magazine: 60,
      reloadSeconds: 5,
      cooldownSeconds: 0.1,
      range: 240,
      damage: 28,
      ammo: 'rifle_ammo',
      energyCost: 0,
      recoilDeg: 1.6,
      aimFovDeg: 52,
      scopeZoom: 0,
      scopeMax: 4,
      auto: true,
      zeroMeters: 100,
    },
    crossbow: {
      speed: 95,
      gravity: 1,
      spreadDeg: 0.9,
      pellets: 1,
      magazine: 1,
      reloadSeconds: 2.3,
      cooldownSeconds: 0.2,
      range: 140,
      damage: 55,
      ammo: 'arrow',
      energyCost: 4,
      recoilDeg: 0.6,
      aimFovDeg: 50,
      scopeZoom: 0,
      scopeMax: 4,
      auto: false,
      zeroMeters: 30,
    },
  },
  /**
   * Takılabilir dürbünler (kullanıcı talimatı: 2x, 4x, 8x, 16x). `zoom` büyütme (görüş açısı tan(FOV/2)/zoom),
   * `swayScale` salınım genliği çarpanı (büyük dürbün daha zor tutulur; ekrandaki salınım ayrıca büyütmeyle artar).
   * Silah `scopeMax`'tan büyük dürbün takılmaz. Bulunma olasılığı büyütme arttıkça azalır (ganimet tabloları).
   */
  scopes: {
    scope_2x: { zoom: 2, swayScale: 0.6 },
    scope: { zoom: 4, swayScale: 1 },
    scope_8x: { zoom: 8, swayScale: 1.25 },
    scope_16x: { zoom: 16, swayScale: 1.6 },
  },
  /** Yerçekimi ivmesi (oyun m/sn²; gerçek değer). */
  gravity: 9.81,
  /** Işın yürütme adımı (oyun m): mermi yolunun her parçasında arazi bu aralıkla örneklenir (+ ikiye bölme). */
  stepMeters: 1,
  /** Balistik zaman adımı (sn): yol bu aralıkla doğru parçalarına bölünür (parça içinde kesişim tamdır). */
  simStepSeconds: 1 / 120,
  /** Hasarın uzaklıkla azalması: yolun `start` oranına kadar tam, menzil sonunda `min` katı (doğrusal). */
  falloff: { start: 0.55, min: 0.45 },
  /**
   * Saçılma çarpanları: nişanda (sağ tık), yürürken, koşarken/havadayken. Dürbünlü tüfek kalçadan çok saçılır
   * (`spreadDeg`), nişanda dürbünün salınımı hedeflemeyi zorlaştırır (saçılma neredeyse sıfır).
   */
  spreadScale: { aimed: 0.35, scoped: 0.05, moving: 1.6, running: 2.6 },
  /** Nişana geçiş ve çıkış hızı (sn⁻¹; görüş açısı bu oranla yumuşar). */
  aimSpeed: 9,
  /** Nişanda fare hassasiyeti çarpanı = (nişan FOV / normal FOV) × bu değer (dürbünde ince ayar). */
  aimSensitivity: 0.9,
  /**
   * Dürbün salınımı (radyan genliği ve sn⁻¹ frekansları; Lissajous). Nefes tutunca (`Shift`) genlik
   * `steadySwayScale` katına iner; nefes bitince bir süre (`breathRecoverSeconds`) tutulamaz ve salınım
   * `exhaustedSwayScale` katına çıkar.
   */
  sway: { amplitude: 0.006, freqX: 0.55, freqY: 0.9 },
  steadySwayScale: 0.12,
  exhaustedSwayScale: 1.8,
  /** Nefes tutma (Shift): en uzun süre (sn), saniye başına enerji maliyeti ve tam toparlanma süresi (sn). */
  steadySeconds: 4,
  steadyEnergyPerSecond: 3,
  breathRecoverSeconds: 5,
  /** Tepmenin bakışa uygulanması: tepme bu sürede (sn) eklenir. */
  recoilSeconds: 0.08,
  /** Ateşli silahla bitkinken atış yapılır; yay/sapan için bu enerjinin altında atış yok. */
  minEnergyPrimitive: 1,
  /** Atış gürültüsünün yarıçapı (oyun m; `noise:made`: canlılar kaçar, eşkıyalar duyar). */
  noiseRadius: {
    slingshot: 10,
    bow: 8,
    shotgun: 140,
    pistol: 110,
    rifle: 170,
    sniper_rifle: 200,
    revolver: 125,
    smg: 120,
    assault_rifle: 170,
    marksman_rifle: 185,
    lmg: 190,
    crossbow: 7,
  },
  /**
   * Susturucu (`items/weaponState.ts`): takılabilen silahlar; takılıyken atış gürültüsü (`noiseRadius`) ve sesi
   * kısılır, mermi biraz yavaşlar (hasar hafif düşer).
   */
  suppressor: {
    weapons: ['pistol', 'rifle', 'sniper_rifle', 'smg', 'assault_rifle', 'marksman_rifle'],
    noiseFactor: 0.22,
    damageFactor: 0.92,
    /** Ses: kazanç çarpanı, alçak geçiren süzgeç çarpanı (boğuk "püf"), gümleme yok. */
    soundGain: 0.28,
    lowpassFactor: 0.35,
  },
  /** Atanın tünelde olduğu sayılan derinlik (oyun m): tünel içinden atışta arazi engeli yok sayılır (tavan delik). */
  undergroundDepth: 1.5,
  /** İsabetin hedefe işlenmesi uçuş süresi kadar gecikir; en uzun gecikme (sn). */
  maxHitDelaySeconds: 2,
  /** Görsel izler: aynı anda en çok iz, mermi izi ömrü (sn), ok/taş izinin uzunluğu (oyun m). */
  tracers: {
    max: 48,
    bulletSeconds: 0.09,
    bulletLength: 14,
    projectileLength: 0.9,
    bulletColor: 0xfff2c4,
    arrowColor: 0x8a6a3e,
    stoneColor: 0x9a958a,
  },
  /**
   * Atış sesi (Web Audio, kodla sentez; dosya yok): `gain` tepe seviye (ana ses × `headroom` ile çarpılır),
   * `decay` sönme (sn), `lowpassHz` gürültü süzgeci, `thumpHz` alçak "gümleme" osilatörü (0 = yok), `twangHz`
   * yay/sapan teli (0 = yok). Uzaktaki sesler (eşkıya atışı) `distanceRolloff` (oyun m) ile kısılır.
   */
  sound: {
    headroom: 0.7,
    distanceRolloff: 60,
    profiles: {
      slingshot: { gain: 0.25, decay: 0.08, lowpassHz: 2500, thumpHz: 0, twangHz: 320 },
      bow: { gain: 0.35, decay: 0.18, lowpassHz: 1800, thumpHz: 0, twangHz: 150 },
      shotgun: { gain: 1, decay: 0.55, lowpassHz: 2200, thumpHz: 55, twangHz: 0 },
      pistol: { gain: 0.75, decay: 0.28, lowpassHz: 3800, thumpHz: 85, twangHz: 0 },
      rifle: { gain: 0.95, decay: 0.6, lowpassHz: 3000, thumpHz: 60, twangHz: 0 },
      sniper_rifle: { gain: 1, decay: 0.85, lowpassHz: 2600, thumpHz: 48, twangHz: 0 },
      revolver: { gain: 0.85, decay: 0.35, lowpassHz: 3400, thumpHz: 75, twangHz: 0 },
      smg: { gain: 0.6, decay: 0.18, lowpassHz: 4000, thumpHz: 90, twangHz: 0 },
      assault_rifle: { gain: 0.85, decay: 0.32, lowpassHz: 3200, thumpHz: 65, twangHz: 0 },
      marksman_rifle: { gain: 0.95, decay: 0.65, lowpassHz: 2900, thumpHz: 55, twangHz: 0 },
      lmg: { gain: 0.9, decay: 0.3, lowpassHz: 3000, thumpHz: 58, twangHz: 0 },
      crossbow: { gain: 0.4, decay: 0.15, lowpassHz: 1500, thumpHz: 0, twangHz: 110 },
    },
    /** Boş tetik / doldurma bitti tıkırtısı. */
    click: { gain: 0.2, hz: 1800 },
  },
} as const;

/**
 * Pencere camları (`world/GlassLayer.ts`, `settlements/windows.ts`): girilebilir yapıların camlı pencerelerinden
 * içeriden dışarısı görünür; mermi camdan geçer ve camı kırar (kırık camlar oturumluktur, kayda girmez).
 */
export const GLASS = {
  /** Cam rengi ve saydamlığı (0 görünmez – 1 opak). */
  color: 0xbfdbe6,
  opacity: 0.18,
  /** Kırılan camdan düşen kırık sayısı, ömrü (sn), yerçekimi (oyun m/sn²). */
  shardCount: 14,
  shardSeconds: 2.2,
  gravity: 9.8,
  /** Kırık camın yapısını ararken atış noktasına en çok uzaklık (oyun m; tüfek menzili). */
  searchRadius: 420,
  /** Kırık saçılımı tohumu. */
  shardSeed: 0x61a55,
  /** Cam kırılma sesi: tepe kazancı ve sönme süresi (sn). */
  sound: { gain: 0.45, decay: 0.5 },
} as const;

/**
 * ── Faz 11: D (11.5) ── Mühimmat: ganimette bulunan aralık (min–max; `settlements/loot.ts` satırları okur). Tarif
 * başına üretim adedi tariflerin `output`'undadır (`items/recipes.ts`). Mühimmat kıt tutulur (denge riski: plan §7).
 */
export const AMMO = {
  lootCount: {
    shotgun_shell: [2, 6],
    pistol_ammo: [4, 12],
    rifle_ammo: [3, 8],
    arrow: [3, 8],
  },
} as const;

/**
 * ── Faz 11: E (11.6) ── Eşkıya kampları (ormanda): kamp sayısı/yerleşimi, boyu, etkinlik saatleri, algı, silah
 * dağılımı, teslim olma ve yeniden dolma. Ayarlar'dan kapatılabilir (`Settings.bandits`); camide saldırmazlar.
 * Uzaklıklar oyun metresidir (1 oyun m = 50 gerçek m).
 */
export const BANDITS = {
  /**
   * Dünyadaki en çok kamp sayısı (uygun yer bulunamazsa daha az). Faz 12.0b'den beri il gruplarının katkılarının
   * toplamıdır (`src/config/places/<grup>.ts` `campCount`; çekirdek 9 ilde 96). Elle değiştirilmez.
   */
  campCount: totalCampCount(PLACE_GROUPS),
  /**
   * Kamp yeri kuralları (`bandits/camps.ts`): il/ilçe merkezinin ayak izi kenarına en az `minSettlementDistance`,
   * köyün kenarına en az `minVillageDistance` (341 köy haritayı sık örttüğünden köylere ayrı, kısa uzaklık), en yakın
   * yolun kenarına `roadDistance` aralığı, orman örtüsü, merkezde ve kamp çemberinde en dik eğim `maxSlopeDeg` (oyun
   * eğimi: dikey ölçek gerçek yamacı ×3,3 diktir, 32° ≈ gerçek 10°; 22°'de gerçek dünyada yalnızca 3 kamp çıkıyordu).
   */
  minSettlementDistance: 250,
  minVillageDistance: 120,
  roadDistance: [60, 700],
  maxSlopeDeg: 32,
  /** Aday ızgarası hücresi (her hücrede `campCellTries`² noktalı seed'li ızgara denenir) ve iki kamp arası en az uzaklık. */
  campCell: 120,
  campCellTries: 6,
  campSpacing: 160,
  /** Kampın yarıçapı (oyun m) ve kamp başına eşkıya sayısı aralığı (reis dahil). */
  campRadius: 12,
  members: [3, 5],
  /** Pusu yeri: kamp tarafında yol kenarından bu kadar içeride (oyun m). */
  ambushOffset: 6,
  /** Etkinlikler: uyku saatleri [başlangıç, bitiş) (oyun saati); pusu yalnızca bu saatler arasında kurulur. */
  sleepHours: [23, 5],
  ambushHours: [7, 20],
  /** Etkinlik dönüşümü: üyenin etkinliği bu kadar oyun saatinde bir yeniden seçilir. */
  activityHours: 2,
  /** Hızlar (oyun m/sn): yürüyüş, koşu (oyuncunun koşusundan yavaş: kaçılabilir). */
  walkSpeed: 1.3,
  runSpeed: 4.6,
  /** Devriye ve odun toplama yarıçapları, avlanma menzili (oyun m). */
  patrolRadius: 32,
  woodRadius: 26,
  huntRadius: 70,
  huntRange: 45,
  /** Algı: gündüz görüş, gece görüş çarpanı, duyma (oyun m), görüş konisi (derece), her yönden fark etme yakınlığı. */
  sightRange: 70,
  nightSightFactor: 0.45,
  hearingRange: 30,
  viewConeDeg: 140,
  senseRadius: 5,
  /** Uyurken duyma çarpanı; göz yüksekliği (oyun m; görüş hattı arazi ışınıyla sınanır). */
  sleepHearingFactor: 0.35,
  eyeHeight: 1.6,
  /** Pusudaki eşkıya oyuncu bu kadar yaklaşınca saldırır (oyun m). */
  ambushTrigger: 24,
  /** Uyarı (sesi duyup bakınma) süresi ve görüş kaybından sonra arama süresi (sn). */
  alertSeconds: 12,
  lostSeconds: 6,
  /** Silah dağılımı (olasılık ağırlıkları, üyeler); reis keskin nişancı ya da av tüfeği taşır. */
  weapons: { pala: 3, club: 2, pistol: 2, shotgun: 2, rifle: 1, yatagan: 1, revolver: 1 },
  leaderWeapons: { sniper_rifle: 1, shotgun: 1 },
  /** Yakın dövüş: hasar, menzil (gövde kenarına), hamle süresi ve bekleme (sn). */
  melee: {
    pala: { damage: 12, reach: 1.7, windup: 0.45, cooldown: 1.8 },
    club: { damage: 9, reach: 1.6, windup: 0.5, cooldown: 1.6 },
    yatagan: { damage: 11, reach: 1.7, windup: 0.38, cooldown: 1.4 },
  },
  /**
   * Menzilli: tercih edilen uzaklık, atış aralığı (sn), ek nişan hatası (derece; hareket ederken ×2). Hasar
   * `RANGED.weapons` × `damageScale` (oyuncunun 100 canı var; eşkıya ateşi ölümcül ama anında değil).
   */
  ranged: {
    pistol: { preferred: 18, interval: 1.5, aimErrorDeg: 3 },
    shotgun: { preferred: 10, interval: 2.4, aimErrorDeg: 2.5 },
    rifle: { preferred: 35, interval: 2.6, aimErrorDeg: 1.6 },
    sniper_rifle: { preferred: 55, interval: 3.6, aimErrorDeg: 0.8 },
    revolver: { preferred: 18, interval: 1.7, aimErrorDeg: 2.6 },
    // Seri atışlı: kısa aralıkla tek tek ateşler (nişan hatası büyük; yakın mesafede tehlikeli).
    smg: { preferred: 14, interval: 0.35, aimErrorDeg: 4.2 },
    assault_rifle: { preferred: 30, interval: 0.55, aimErrorDeg: 2.8 },
  },
  damageScale: 0.55,
  /** Can: üye ve reis. */
  health: 80,
  leaderHealth: 120,
  /** Geri çekilme (siper): can bu oranın altına inince bu süre (sn) geri çekilir. */
  retreatHealthFraction: 0.5,
  retreatSeconds: 5,
  /** Teslim olma: can bu oranın altına düşünce (0–1); bağışlanan eşkıya kaçıp kaybolur (sn). */
  surrenderHealthFraction: 0.25,
  fleeSeconds: 20,
  /** Teslim olan / ölü eşkıyayla etkileşim: erişim (oyun m), bakış konisi (derece), üst arama süresi (sn). */
  interactReach: 2.4,
  interactConeDeg: 50,
  searchSeconds: 2.5,
  /** Kamp sandığını boşaltma süresi (sn) ve erişimi (oyun m). */
  chestSeconds: 2,
  chestReach: 2,
  /** Temizlenen kampın yeniden dolması (oyun günü). */
  reoccupyDays: 5,
  /** Etkinleşme: oyuncu bu uzaklıktaki kampın eşkıyalarını canlandırır; bunun `despawnMargin` ötesinde kaldırır. */
  activeRadius: 350,
  despawnMargin: 80,
  /** Kamp çizimi ve collider yarıçapları (oyun m). */
  drawRadius: 420,
  colliderRadius: 90,
  seed: 0xba4d17,
} as const;

/**
 * Sokak çeteleri (kullanıcı talimatı: "şehir merkezinde de başka NPC oyuncular çıksın, çatışma olsun"): il ve ilçe
 * merkezlerinin caddelerinde, eşkıya sisteminin (`BanditSystem`) yapay zekâsını kullanan silahlı iki rakip çete. Oyuncuya
 * yaklaşınca (ve gün/saat uygunsa) canlanırlar; birbirlerini görünce çatışırlar, oyuncuyu görünce ona da saldırırlar.
 * `Settings.bandits` kapalıysa çıkmazlar. Camide saldırmazlar (kutsal alan). Uzaklıklar oyun metresidir.
 */
export const GANGS = {
  /** Çete adayı yerleşim sıraları (il ve ilçe merkezleri). */
  ranks: ['il', 'ilce'] as readonly string[],
  /** Merkezin çevresinde cadde noktası aranan en geniş yarıçap (yerleşim yarıçapının oranı) ve deneme sayısı. */
  searchRadiusFraction: 0.5,
  searchTries: 80,
  /** Cadde noktasında yola en çok bu kadar uzaklık (yol ekseni) ve binalara en az uzaklık (oyun m). */
  streetDistance: 2.5,
  buildingClearance: 1.5,
  /** İki çetenin başlangıç noktaları arası uzaklık aralığı (oyun m): görüş menzilinde ama yakın değil. */
  pairDistance: [22, 40],
  /** Çete üyelerinin başlangıç noktasının çevresine dağılma yarıçapı (oyun m). */
  spread: 3,
  /** Merkez çevresinde oyuncu bu uzaklığa girince canlanırlar; `despawnMargin` ötesinde kalkarlar. */
  activeRadius: 130,
  despawnMargin: 60,
  /** Çeteler oyuncuya bu uzaklıktan yakın başlangıç noktasında canlanmaz (oyuncunun gözü önünde belirmesin). */
  minSpawnDistance: 40,
  /** Oyun başından bu kadar oyun saniyesi çete çıkmaz (şehir merkezinde başlayan oyuncuya ısınma payı). */
  graceSeconds: 15 * 60,
  /** Çetelerin sokakta olduğu saatler [başlangıç, bitiş) ve bir yerleşimde bir gün içinde bulunma olasılığı. */
  hours: [9, 22] as readonly [number, number],
  presenceChance: 0.4,
  /**
   * Çete başına üye sayısı (reis dahil): uç değerler ve ağırlıklar (kullanıcı talimatı: çıkan haydut sayısı hep aynı
   * olmasın; tek-iki kişilik küçük çeteler sık, beş-altı kişilik kalabalık çeteler nadir). Silah dağılımı aşağıda;
   * reis tabanca, av tüfeği ya da piyade tüfeğiyle gelir.
   */
  members: [1, 6] as readonly [number, number],
  memberWeights: { '1': 2, '2': 3, '3': 3, '4': 2, '5': 1, '6': 1 } as Readonly<
    Record<string, number>
  >,
  /**
   * Bir yerde aynı anda bulunan çete sayısı ağırlıkları (hep iki çete değil: çoğu zaman bir ya da iki, ara sıra üç).
   * Çete sayısı gün ve yere göre deterministiktir; en çok `maxGangs`. Tek çete rakipsizdir: oyuncuya tepki verir.
   */
  gangCountWeights: { '1': 4, '2': 4, '3': 2 } as Readonly<Record<string, number>>,
  maxGangs: 3,
  weapons: { pistol: 4, shotgun: 2, pala: 2, club: 2, rifle: 1, smg: 1, revolver: 2, yatagan: 1 },
  leaderWeapons: { pistol: 2, shotgun: 2, rifle: 1, assault_rifle: 1 },
  /** Çeteler arası görüş menzili (oyun m) ve göz yüksekliği: rakip bu mesafede görüş hattındaysa çatışma başlar. */
  rivalSight: 60,
  seed: 0x6a9c5e,
} as const;

/**
 * Savaş efektleri (`world/CombatEffects.ts`; kullanıcı talimatı: "ateş etme ve yakın dövüş efektleri ayırt edilsin, ateş
 * edildiği anlaşılsın"). Ateşli silah: ağız alevi + kıvılcım + duman; yakın dövüş: savurma yayı/saplama çizgisi + darbe
 * kıvılcımı. Boyutlar oyun metresidir; renkler 0xRRGGBB. Hepsi ışıksızdır (ışık sayısı sabit kalır).
 */
export const COMBAT_FX = {
  /** Eşkıya atış/savurma efektlerinin ve seslerinin gösterildiği en uzak mesafe (oyun m). */
  banditRadius: 320,
  /** Parçacık havuzu kapasiteleri (alev/kıvılcım ve duman) ve yay/çizgi havuzu. */
  flashCapacity: 96,
  smokeCapacity: 96,
  arcPool: 6,
  streakPool: 3,
  /** Savurma "vınlaması" sesi (Web Audio): tepe seviye, süzgeç frekansının başı/sonu (Hz) ve süre (sn). */
  swingSound: {
    slash: { gain: 0.3, from: 1000, to: 3200, seconds: 0.17 },
    chop: { gain: 0.3, from: 700, to: 2000, seconds: 0.2 },
    smash: { gain: 0.35, from: 400, to: 1300, seconds: 0.26 },
    thrust: { gain: 0.26, from: 1600, to: 4200, seconds: 0.12 },
    punch: { gain: 0.16, from: 500, to: 1200, seconds: 0.1 },
  },
  /** Ağız alevi ve duman ömrü (sn). */
  flashSeconds: 0.07,
  smokeSeconds: 1.1,
  /** Ateşli silah profilleri: alev boyu, kıvılcım sayısı/hızı, duman sayısı/boyu. */
  muzzle: {
    pistol: { flashSize: 0.55, sparks: 4, sparkSpeed: 7, smoke: 2, smokeSize: 0.55 },
    shotgun: { flashSize: 1.1, sparks: 8, sparkSpeed: 10, smoke: 4, smokeSize: 0.95 },
    rifle: { flashSize: 0.8, sparks: 6, sparkSpeed: 9, smoke: 3, smokeSize: 0.7 },
    sniper_rifle: { flashSize: 1.0, sparks: 6, sparkSpeed: 11, smoke: 4, smokeSize: 0.8 },
    revolver: { flashSize: 0.65, sparks: 5, sparkSpeed: 8, smoke: 3, smokeSize: 0.6 },
    smg: { flashSize: 0.45, sparks: 3, sparkSpeed: 7, smoke: 1, smokeSize: 0.45 },
    assault_rifle: { flashSize: 0.7, sparks: 4, sparkSpeed: 9, smoke: 2, smokeSize: 0.6 },
    marksman_rifle: { flashSize: 0.85, sparks: 6, sparkSpeed: 10, smoke: 3, smokeSize: 0.7 },
    lmg: { flashSize: 0.75, sparks: 5, sparkSpeed: 9, smoke: 2, smokeSize: 0.65 },
  },
  /**
   * Savurma görünümü (biçime göre): saldırganın önüne `distance`, yayın dönüş aralığı `rot0 → rot1` (rad), boyut
   * `scale0 → scale1`, `seconds` ömür, renk/saydamlık, `dark` normal karışım (koyu sopa darbesi), isabet kıvılcımları.
   */
  swing: {
    slash: {
      distance: 1.1,
      color: 0xe8f0ff,
      dark: false,
      opacity: 0.85,
      seconds: 0.22,
      rot0: 0.2,
      rot1: 1.5,
      scale0: 0.45,
      scale1: 0.6,
      sparks: 5,
      sparkColor: 0xffe0a0,
      dust: false,
    },
    chop: {
      distance: 1.1,
      color: 0xdfe6ee,
      dark: false,
      opacity: 0.8,
      seconds: 0.24,
      rot0: 1.0,
      rot1: 2.4,
      scale0: 0.4,
      scale1: 0.55,
      sparks: 4,
      sparkColor: 0xd8d0c0,
      dust: true,
    },
    smash: {
      distance: 1.15,
      color: 0x8a6a48,
      dark: true,
      opacity: 0.7,
      seconds: 0.3,
      rot0: 0.6,
      rot1: 2.2,
      scale0: 0.5,
      scale1: 0.75,
      sparks: 3,
      sparkColor: 0xc8a070,
      dust: true,
    },
    thrust: {
      distance: 1.1,
      color: 0xf0f6ff,
      dark: false,
      opacity: 0.8,
      seconds: 0.18,
      rot0: 0,
      rot1: 0,
      scale0: 0.4,
      scale1: 1.4,
      sparks: 3,
      sparkColor: 0xffe0a0,
      dust: false,
    },
    punch: {
      distance: 0.9,
      color: 0xffffff,
      dark: false,
      opacity: 0.45,
      seconds: 0.12,
      rot0: 0.4,
      rot1: 1.2,
      scale0: 0.2,
      scale1: 0.3,
      sparks: 2,
      sparkColor: 0xffffff,
      dust: true,
    },
  },
} as const;

/**
 * Eldeki eşya görünümü (`player/HeldItem.ts`; kullanıcı talimatı: "ele alınan eşyalar, silahlar elde de görünsün").
 * Birinci şahıs görünümü kameranın sağ altında; üçüncü şahıs modelinde sağ elde. Ölçüler oyun metresidir (kamera
 * uzayı: +x sağ, +y yukarı, −z ileri).
 */
export const HELD_ITEM = {
  /** Birinci şahıs: tutuş noktasının kameraya göre konumu. */
  firstPerson: { x: 0.24, y: -0.23, z: -0.55 },
  /** Yürürken sallanma (genlik oyun m, hız rad/oyun m) ve nişanda (dürbüne bakarken) görünümü gizleme eşiği. */
  bobAmplitude: 0.012,
  bobRate: 5.2,
  hideAimFraction: 0.35,
  /** Savurma ve tepme süreleri (sn). */
  swingSeconds: 0.28,
  recoilSeconds: 0.16,
  /** Tepme: geri çekilme (oyun m) ve yukarı kalkma (rad). */
  recoilBack: 0.06,
  recoilPitch: 0.14,
  /** Üçüncü şahıs: omuz konumu (oyuncu merkezine göre), kol uzunluğu (oyun m). */
  shoulder: { x: 0.42, y: 1.42 },
  armLength: 0.5,
} as const;

/** ── Faz 11: E (11.7) ── Yankesiciler (il/ilçe merkezlerinde): nadir; yaklaşıp bir eşya çalıp kaçar. */
export const PICKPOCKETS = {
  /** Doğma denemesi aralığı (gerçek sn) ve il/ilçe merkezinde olasılığı; doğma uzaklığı (oyun m). */
  spawnCheckSeconds: 25,
  spawnChance: 0.25,
  spawnDistance: [25, 40],
  /** Aynı anda en çok yankesici. */
  maxActive: 1,
  /** Yaklaşma hızı, kaçış hızı (oyuncunun koşusundan, 7, biraz yavaş: yakalanabilir). */
  walkSpeed: 1.5,
  runSpeed: 6.2,
  /** Selam (ve "biri çok yaklaştı" ipucu) uzaklığı; çalma uzaklığı (oyun m) ve oyuncunun yanında kalma süresi (sn). */
  greetDistance: 5,
  stealDistance: 1.4,
  stealSeconds: 1.2,
  /** Yakalama: oyuncu kaçan yankesiciye bu kadar yaklaşırsa eşyayı geri verir (oyun m). */
  catchDistance: 1.6,
  /** Kaçış: bu uzaklık ya da süre (sn) aşılınca eşya en yakın kamp sandığına düşer. */
  escapeDistance: 70,
  escapeSeconds: 45,
  /** Yaklaşırken vazgeçme süresi (sn). */
  giveUpSeconds: 60,
  /** Gövde (hedef silindiri). */
  radius: 0.35,
  height: 1.75,
  seed: 0x9c4e7a,
} as const;

/**
 * ── Faz 11: F (11.8) ── Drone: tezgâhta üretilir, kısayolda seçiliyken sol tıkla kalkar, `Q` ile görüş geçer, `H` ile
 * eve döner. Menzil oyuncuya yataydır; sınıra yaklaştıkça görüntü karlanır, aşınca kendiliğinden geri döner. Pil bitince
 * düşer ve yerde `drone` yapısı olarak kalır (`E` ile alınır). Uzaklıklar oyun metresidir.
 */
export const DRONE = {
  /** Yatay ve dikey hız (oyun m/sn); Shift ile hızlı uçuş çarpanı; hız değişimi (oyun m/sn²). */
  speed: 12,
  climbSpeed: 6,
  fastFactor: 1.8,
  acceleration: 24,
  /** Oyuncudan en uzak menzil (oyun m) ve karlanmanın başladığı oran. */
  range: 300,
  noiseStart: 0.8,
  /** Menzil aşılınca kendiliğinden dönüş, oyuncuya bu oran kadar yaklaşınca denetim geri gelir. */
  returnUntil: 0.85,
  /** Yerden en yüksek irtifa ve zemine en çok yaklaşma (oyun m). */
  maxAltitude: 120,
  minClearance: 0.8,
  /** Kalkış: oyuncunun önüne uzaklık ve yerden yükseklik (oyun m). */
  launchAhead: 1.5,
  launchHeight: 2.5,
  /** Eve dönüşte iniş: oyuncuya bu yatay uzaklıkta alçalır ve alınır (oyun m). */
  landDistance: 2.5,
  /** Tam pille uçuş süresi (gerçek sn); bu oranın altında uyarı; kalkış için en az pil. */
  batterySeconds: 240,
  lowBattery: 0.2,
  minLaunchBattery: 0.08,
  /** Pil bitince düşüş hızı (oyun m/sn). */
  fallSpeed: 9,
  /** Dayanıklılık (eşkıya atışı; hasar `RANGED` silah hasarıdır). */
  health: 30,
  /** Hedef silindiri (oyun m). */
  radius: 0.45,
  height: 0.35,
  /** Drone kamerası: varsayılan eğim (rad, aşağı), eğim sınırları, görüş açısı ve tekerlekle yakınlaştırma aralığı. */
  pitchDefault: -0.6,
  pitchMin: -1.5,
  pitchMax: 0.25,
  fovDeg: 70,
  fovMinDeg: 18,
  fovStepDeg: 6,
  /** İşaretleme: en çok işaret, bakış ışınına en büyük açı (derece), en uzak (oyun m), varolan işareti kaldırma yakınlığı. */
  maxMarks: 8,
  markPickDeg: 3.5,
  markRange: 320,
  markRemoveRadius: 8,
  /** Eşkıyaların drone'u fark edip ateş ettiği en yüksek irtifa (yerden, oyun m) ve iki atış arası (sn). */
  shootableAltitude: 40,
  banditShotInterval: 3,
  /** Drone görüşündeyken oyuncu hasar alırsa görüş kendiliğinden oyuncuya döner. */
  autoReturnOnDamage: true,
  /** Pervane dönüş hızı (rad/sn; çizim). */
  rotorSpeed: 60,
} as const;

/**
 * Alışveriş ve para (Faz 11 sonrası, kullanıcı talimatı: "şehirlerde satıcılar, eşyalar satılabilir, bazıları
 * alınabilir"): para birimi Türk lirası (₺, tam sayı). Eşya değerleri `economy/prices.ts` `ITEM_VALUES` tablosundadır;
 * satıcı eşyayı değerinden satar, geri alırken uzmanlık alanındaki eşyaya `sellRatio`, diğerlerine `offSellRatio`
 * öder. Hiçbir tarif, girdilerinin hepsi satıcılardan alınabiliyorsa satışta kâr getirmez (`tests/economy` denetler).
 */
export const ECONOMY = {
  /** Yeni oyunun (ve v7'den göçen kaydın) cüzdanı (₺). */
  startMoney: 300,
  /** Satıcının uzmanlık alanındaki eşyayı geri alma oranı ve diğer eşyalar için oran (değerin kesri). */
  sellRatio: 0.5,
  offSellRatio: 0.3,
  /** Bir seferde alınabilecek en çok adet (dükkân panelindeki adet kutusu). */
  maxBatch: 50,
  /**
   * Aramada çıkan para (deterministik; kap/yapı kimliğinden): olasılık, en az–en çok tutar (₺, `step`'e yuvarlı).
   * Dükkân/kahvehane kasası `shopScale` kat, yıkık yapı `ruinedScale` kat.
   */
  loot: {
    containerChance: 0.55,
    containerMin: 10,
    containerMax: 90,
    doorChance: 0.65,
    doorMin: 20,
    doorMax: 150,
    shopScale: 2,
    ruinedScale: 0.5,
    step: 5,
    seed: 0x11a7a,
  },
} as const;

/**
 * Satıcılar (esnaf): il ve ilçe merkezlerinde, merkeze en yakın dükkân/kahvehane/han kapısının önünde durur (yoksa
 * en yakın girilebilir konutun). Durağandırlar, kayda girmezler (yerleşim düzeninden deterministik türetilir).
 */
export const VENDORS = {
  /** Rütbeye göre satıcı türleri (sıra: merkeze en yakın dükkândan başlayarak). Köylerde satıcı yok. */
  perRank: {
    il: ['bakkal', 'nalbur', 'yapi_ustasi', 'av_bayii'],
    ilce: ['bakkal', 'nalbur', 'yapi_ustasi'],
  },
  /** Satıcı yerleştirilecek yapı türleri (öncelikli) ve yedek (girilebilir konut). */
  shopKinds: ['shop_row', 'kahvehane', 'han'],
  fallbackKinds: ['house', 'konak', 'lojman', 'apartment'],
  /** Kapının (ya da merdiven ayağının) önünde duruş uzaklığı ve yana kayma denemeleri (oyun m). */
  standOut: 1.3,
  sideSteps: [0, 1.8, -1.8, 3.2, -3.2],
  /** Oyuncu bu uzaklıktayken satıcı ona döner (oyun m). */
  faceDistance: 9,
  /** Bu yarıçap içindeki satıcılar çizilir ve konuşulabilir (oyun m). */
  drawRadius: 140,
  /** Ad seçimi tohumu. */
  seed: 0x5a71c1,
  /** Satıcı kişi kimlikleri bu tabandan başlar (gezgin insanlarla çakışmasın). */
  idBase: 1_000_000,
} as const;

/**
 * Tapu (yapı satın alma): yerleşim yapıları paraya alınabilir; sahip olunan yapının içine eşya/yapı (sandık, tezgâh,
 * döşek…) konur, yanına modüler ek yapılır (ilk taban döşemeyle aynı seviyeye oturur), başkasının yapısına bir şey
 * kurulamaz. Cami, türbe, mezarlık, çeşme, şadırvan, anıt ve hükümet konağı satılık değildir.
 */
export const PROPERTY = {
  /** Temel fiyat (₺; ilçe merkezinde, sağlam yapı). Listede olmayan tür satılık değildir. */
  prices: {
    house: 900,
    konak: 2400,
    apartment: 600,
    lojman: 700,
    serender: 250,
    shop_row: 1400,
    kahvehane: 1200,
    han: 5000,
    hamam: 4000,
    clock_tower: 2500,
    castle: 15000,
    mine_tower: 3000,
    factory: 6000,
  },
  /** Apartmanda kat başına fiyat (temel fiyat × kat sayısı). */
  perFloorKinds: ['apartment'],
  /** Yerleşim rütbesine göre çarpan. */
  rankScale: { il: 1.25, ilce: 1, koy: 0.6 },
  /** Yıkık yapı çarpanı. */
  ruinedScale: 0.35,
  /** Fiyat bu tutara yuvarlanır (₺). */
  round: 50,
  /** Tapu geri satışında ödenen oran. */
  resaleRatio: 0.5,
  /** Tapu ipucu: kapı noktasına en çok yatay uzaklık, dikey fark (oyun m) ve bakış konisi (derece). */
  reach: 2.8,
  verticalReach: 3,
  viewConeDeg: 70,
  /** Sahip olunan yapının ayak izine bu kadar yakın ilk taban, yapının döşemesiyle aynı seviyeye oturur (oyun m). */
  extensionReach: 3,
  /** İç mekâna eşya konurken oyuncunun döşemeyle en çok dikey farkı (oyun m). */
  indoorVerticalReach: 1.5,
} as const;

/**
 * Sağlık eşyaları (Battle Royale ile geldi; hayatta kalma modunda da nadir bulunur; `items/medical.ts`): kısayoldan
 * ya da envanterden kullanılır, `seconds` boyunca sürer (hasar alınca, saldırınca ya da başka eşya seçilince yarıda
 * kalır, eşya harcanmaz), bitince can `heal` artar ama `cap`'i aşmaz (sargı bezi ancak 75'e kadar iyileştirir).
 */
export const MEDICAL = {
  bandage: { heal: 15, seconds: 3, cap: 75 },
  first_aid_kit: { heal: 60, seconds: 6, cap: 100 },
} as const;

/**
 * Battle Royale — "Son Kalan" (kullanıcı talimatı; plan `docs/battle-royale-plan.md`): oyuncu ve NPC'ler seçilen alanda
 * (tüm harita ya da sınır komşuluğuyla bağlı bir ya da birden çok il) eli boş başlar, güvenli bölge aşamalarla daralır,
 * son kalan kazanır. Maç kayda girmez. Saf mantık `src/battleRoyale/`.
 */
/**
 * Mini harita (`ui/Minimap.ts`, saf görünüm `ui/minimapView.ts`; kullanıcı talimatı: "hayatta kalmada üretilerek elde
 * edilsin, Son Kalan'da verilsin; oyuncunun konumu, Son Kalan'da bölge görünsün"). Kuzey yukarıdadır; oyuncu ortada ok.
 * Hayatta kalmada envanterde `map` (Harita) varken görünür; Son Kalan'da her zaman.
 */
export const MINIMAP = {
  /** Ekrandaki çap (CSS px). */
  sizePx: 176,
  /** Ortadan kenara gösterilen uzaklık (oyun m; 220 oyun m = 11 gerçek km). */
  radius: 220,
  /** Arazi taban görüntüsünün kenarı (örnek) ve kapsadığı alanın gösterilen çapa oranı (kaydırma payı). */
  rasterCells: 144,
  rasterSpan: 1.6,
  /** Taban görüntüsü kare başına bu kadar satır örnekler (yeniden çizim takılma yapmasın). */
  rowsPerFrame: 18,
  /** Çizim aralığı (ms; harita her karede değil, saniyede ~12 kez yenilenir). */
  drawIntervalMs: 80,
  /** Yol/su/yapı listelerinin yenilendiği yer değiştirme (oyun m). */
  vectorRefresh: 60,
  /** Gölgelendirme gücü (eğim ışığı) ve rakım parlaklığı (oyun m başına). */
  hillshade: 0.9,
  /** Renkler (0xRRGGBB). Arazi örtüsü renkleri `TERRAIN_LOOK.cover`'dan. */
  colors: {
    sea: 0x245a78,
    seaDeep: 0x173e57,
    bare: 0x8a8f72,
    water: 0x4f9fd0,
    road: 0xe6dcc0,
    trunk: 0xf2c46a,
    street: 0xc9c2b0,
    building: 0x5a4636,
    mosque: 0x2f8a7e,
    zone: 0xffffff,
    next: 0x7fd1ff,
    player: 0xffd25e,
  },
} as const;

export const BATTLE_ROYALE = {
  /** Oyuncu sayısı (oyuncu dahil): aralık ve alan türüne göre varsayılan. */
  players: { min: 2, max: 100, defaultProvinces: 24, defaultWorld: 64 },
  area: {
    /** Alan maskesinin hücresi (oyun m): `contains` ve rastgele nokta seçimi bu ızgarada çalışır. */
    maskCell: 8,
    /** İl çokgenleri kıyıdan içeride kaldığından ilsiz kıyı şeridi bu kadar (oyun m) içindeyse en yakın ile sayılır. */
    coastBufferM: PILOT.coastBufferM,
    /**
     * İl komşuluğu: iki ilin sınırı, köşeleri birbirine `tolerance` (oyun m) yakın kenarlardan en az `minSharedLength`
     * (oyun m; ≈ 250 gerçek m) uzunlukta ortak çizgi taşıyorsa komşudur (köşe teması komşuluk sayılmaz).
     */
    adjacency: { tolerance: 0.5, minSharedLength: 5 },
  },
  zone: {
    /**
     * Güvenli bölge aşamaları (sırayla): `wait` bekleme ve `shrink` daralma süresi (sn; maç süresi çarpanıyla), yeni
     * dairenin yarıçapı bir öncekinin `radiusFactor` katı (son aşama 0: bölge tamamen kapanır), dışarıda saniye başı
     * hasar (can), sınırın en hızlı noktasının en çok hızı (oyun m/sn; yürüme 4, koşu 7; kısa maçta ÷ 0,7 ile bile
     * NPC koşusunu — `far.zoneSpeed` 4,6 — aşmaz). Daralma, sınır bu hızı
     * aşmayacak kadar uzar: büyük alanda (tüm harita) maç kendiliğinden uzar. Ölçülen (100 kişi; kısa / orta / uzun): il ≈ 17–24 /
     * 24–35 / 33–49 dk, tüm harita ≈ 52 / 75 / 105 dk.
     */
    phases: [
      { wait: 120, shrink: 300, radiusFactor: 0.6, damage: 0.4, edgeSpeed: 3.2 },
      { wait: 90, shrink: 180, radiusFactor: 0.55, damage: 0.8, edgeSpeed: 3 },
      { wait: 75, shrink: 150, radiusFactor: 0.5, damage: 1.5, edgeSpeed: 2.5 },
      { wait: 60, shrink: 120, radiusFactor: 0.5, damage: 3, edgeSpeed: 2.2 },
      { wait: 45, shrink: 90, radiusFactor: 0.45, damage: 5, edgeSpeed: 2 },
      { wait: 40, shrink: 75, radiusFactor: 0.4, damage: 8, edgeSpeed: 1.5 },
      { wait: 30, shrink: 60, radiusFactor: 0, damage: 12, edgeSpeed: 1.5 },
    ],
    /** Maç süresi seçimi: aşama sürelerinin çarpanı (sınır hızı bu çarpana bölünür). */
    durationScale: { short: 0.7, medium: 1, long: 1.4 },
    /** Seçili alanın dışında (komşu il, deniz) saniye başı en az hasar (bölge içinde olsa da). */
    outsideAreaDamage: 1,
    /** Yeni daire merkezi için deneme sayısı (karada, alanda, uygun noktada). */
    centerTries: 80,
  },
  spawn: {
    /** Başlangıç noktaları arası hedef uzaklık = `spacingFactor · √(alan / oyuncu)`, [min, max] aralığında (oyun m). */
    spacingFactor: 0.6,
    minSpacing: 25,
    maxSpacing: 600,
    /** Aralık tutmazsa bu kadar denemeden sonra aralık `relax` katına iner. */
    attemptsPerRound: 1500,
    relax: 0.8,
    rounds: 12,
  },
  /**
   * Uzak kademe (soyut) simülasyon (BR.2, `battleRoyale/farSim.ts`): oyuncudan uzaktaki NPC'ler tam yapay zekâ ve
   * fizikle değil, sabit adımlı bir modelle yaşar: ganimet yerlerinde teçhizat toplar, bölgeye göç eder, birbirine
   * rastlayınca karşılaşma zarla çözülür.
   */
  far: {
    /** Sabit adım (sn). */
    step: 0.5,
    /** Yürüme hızı (oyun m/sn): ganimet ararken ve bölgeye koşarken (eşkıya yürüme 1,3, koşu 4,6). */
    lootSpeed: 2.2,
    zoneSpeed: 4.6,
    /** Bir ganimet yerinde kalış süresi aralığı (sn). */
    dwell: [25, 70],
    /** Teçhizat kazanımı: zenginliği 1 olan yerde saniyede (1 − teçhizat)'ın bu oranı. */
    lootRate: 0.006,
    /** Ganimet yeri seçiminde en çok bakılan uzaklık (oyun m; içinden en yakın birkaçı arasından seçilir). */
    lootSearchRadius: 900,
    lootChoices: 4,
    /**
     * Bölgeye göç: hedef daireye varış süresi, kalan sürenin (`stageEnds − t`, beklemedeyse daralma süresi de eklenir)
     * `zoneMargin` katını aşarsa ya da güvenli dairenin dışındaysa NPC bölgeye yönelir.
     */
    zoneMargin: 0.7,
    /**
     * Karşılaşma: `engageRadius + engageReachPerGear · (iki tarafın büyük teçhizatı)` uzaklıktaki (oyun m; tüfekli uzaktan
     * görür/vurur) iki NPC saniyede `engageRate` olasılıkla çatışır; ikisi de eli boşsa (teçhizat 0) olasılık
     * `unarmedEngage` katına iner, teçhizat `armedGear`'a varınca tamdır. Maçın ilk `graceSeconds`'ında kimse
     * çatışmaz (herkes ilk silahını arar).
     */
    engageRadius: 40,
    engageReachPerGear: 110,
    engageRate: 0.05,
    unarmedEngage: 0.15,
    armedGear: 0.5,
    graceSeconds: 90,
    /** Çatışmanın ölümle bitme olasılığı (kalanında iki taraf yaralanıp ayrılır). */
    killChance: 0.8,
    /** Güç = (`gearBase` + teçhizat) · √(can/100); kazanma olasılığı güç^`strengthExponent` oranı. */
    gearBase: 0.2,
    strengthExponent: 2,
    /** Kazananın aldığı hasar aralığı (can), rakibin göreli gücüyle çarpılır (×2 en çok). */
    fightDamage: [10, 40],
    /** Kazanan, yenilenin teçhizatından bu oranı alır (kendi teçhizatından büyükse). */
    lootTransfer: 0.8,
    /** Çatışma sonrası iki tarafın yeniden çatışamadığı süre (sn). */
    cooldown: 20,
    /** İyileşme: son hasardan `calmSeconds` sonra, teçhizatı `healGear` üstündeyse saniyede `healPerSec` can. */
    calmSeconds: 40,
    healGear: 0.25,
    healPerSec: 0.3,
    /**
     * Bölgeye giderken yol: bu hücreli (oyun m) kaba yürüme ızgarasında güvenli daire başına bir akış alanı
     * (`flowField.ts`; dağ sırtına/kıyıya takılmasınlar diye).
     */
    flowCell: 24,
    /** Yürünemeyen yere çarpınca denenen sapma açıları (derece) ve bu kadar adım takılınca yeni hedef. */
    detourDeg: [35, -35, 70, -70, 110, -110],
    stuckSteps: 6,
    /** Takılan NPC'nin yöneldiği rastgele kaçış noktasının uzaklık aralığı (oyun m). */
    escapeRadius: [20, 70],
    /** Ganimet yeri zenginliği yerleşim rütbesine göre (il merkezi en zengin). */
    richness: { il: 1, ilce: 0.75, koy: 0.4 },
    /** Teçhizat düzeyi → silah (eşkıya silahları; eşik altındaki ilk silah). */
    gearWeapons: [
      { below: 0.12, weapon: 'club' },
      { below: 0.22, weapon: 'pala' },
      { below: 0.3, weapon: 'yatagan' },
      { below: 0.4, weapon: 'revolver' },
      { below: 0.5, weapon: 'pistol' },
      { below: 0.6, weapon: 'smg' },
      { below: 0.7, weapon: 'shotgun' },
      { below: 0.82, weapon: 'assault_rifle' },
      { below: 0.92, weapon: 'rifle' },
      { below: Infinity, weapon: 'sniper_rifle' },
    ],
  },
  /**
   * Yakın kademe (BR.3, `battleRoyale/nearTier.ts`): oyuncuya `radius` (oyun m) içindeki ve karosu hazır uzak NPC'ler
   * tam yapay zekâlı yarışmacıya (`BanditSystem`) dönüşür, `radius + margin` ötesinde (çatışmıyorsa; çatışıyorsa
   * `radius + 3 · margin`) soyut kayda döner. Aynı anda en çok `maxAgents` (çizim ve atış ışını bütçesi: yarışmacı başına
   * 5 draw call ölçüldü; en kalabalık şehir sahnesi 185 + 12 · 5 ≈ 245 < 250 hedefi).
   */
  near: {
    radius: 320,
    margin: 60,
    maxAgents: 12,
    /** Hedef yenileme aralığı (sn). */
    guideInterval: 0.5,
    /** Hedefi olan yarışmacı `progressWindow` sn'de `minProgress` m'den az ilerlerse kaçış noktası seçer. */
    progressWindow: 3,
    minProgress: 0.8,
    /** Yarışmacının can üst sınırı (oyuncuyla aynı). */
    maxHealth: 100,
    /** Ceset oyuncudan bu kadar (oyun m) uzaklaşınca kalkar. */
    corpseRadius: 420,
    /** Zorluk: nişan hatası çarpanı (eşkıya = 1). */
    difficulty: {
      easy: { aimScale: 1.7 },
      normal: { aimScale: 1 },
      hard: { aimScale: 0.65 },
    },
  },
  /**
   * Ganimet (BR.4, `battleRoyale/loot.ts`). Maçta bina kapları hayatta kalma tablosu yerine bu tabloyu zarlar (silah,
   * mühimmat, sağlık, zırh, çanta); her kap/sandık maç tohumu ve kimliğiyle deterministiktir.
   */
  loot: {
    /** Kapta silah çıkma olasılığı ve silah ağırlıkları (çıkan menzilli silahın mühimmatı da yanında). */
    weaponChance: 0.4,
    weapons: {
      club: 10,
      iron_dagger: 8,
      pala: 6,
      slingshot: 3,
      bow: 4,
      pistol: 14,
      shotgun: 11,
      rifle: 7,
      sniper_rifle: 2,
      revolver: 8,
      smg: 8,
      assault_rifle: 6,
      marksman_rifle: 3,
      lmg: 2,
      crossbow: 3,
      yatagan: 6,
      war_axe: 4,
      gurz: 3,
    },
    /** Silahla gelen mühimmat çarpanı (`AMMO.lootCount` aralığının katı). */
    weaponAmmoScale: 1.5,
    /** Ayrıca mühimmat çıkma olasılığı ve tür ağırlıkları. */
    ammoChance: 0.35,
    ammo: { pistol_ammo: 4, shotgun_shell: 3, rifle_ammo: 3, arrow: 1 },
    /** Diğer satırlar: olasılık ve adet aralığı. */
    extras: [
      { item: 'bandage', chance: 0.35, min: 1, max: 3 },
      { item: 'first_aid_kit', chance: 0.08, min: 1, max: 1 },
      { item: 'hide_vest', chance: 0.06, min: 1, max: 1 },
      { item: 'steel_vest', chance: 0.035, min: 1, max: 1 },
      { item: 'backpack_small', chance: 0.06, min: 1, max: 1 },
      { item: 'backpack_medium', chance: 0.035, min: 1, max: 1 },
      { item: 'backpack_large', chance: 0.012, min: 1, max: 1 },
      { item: 'suppressor', chance: 0.03, min: 1, max: 1 },
      // Dürbünler: büyütme arttıkça nadir (kullanıcı talimatı: "16x'e doğru bulunabilirlik azalsın").
      { item: 'scope_2x', chance: 0.07, min: 1, max: 1 },
      { item: 'scope', chance: 0.04, min: 1, max: 1 },
      { item: 'scope_8x', chance: 0.018, min: 1, max: 1 },
      { item: 'scope_16x', chance: 0.006, min: 1, max: 1 },
    ],
    /** Yapı türüne göre olasılık çarpanı (listede olmayan 1). */
    kindScale: {
      government: 1.6,
      factory: 1.3,
      mine_tower: 1.2,
      han: 1.2,
      konak: 1.15,
      shop_row: 1.1,
      kahvehane: 0.8,
      hamam: 0.7,
      serender: 0.5,
    },
    /** Yıkık yapı çarpanı. */
    ruinedScale: 0.6,
    /** Ganimet sandıkları: her `crateAreaM2` (oyun m²) alana bir sandık; `crateNearTownShare`'ı yerleşimlerin yakınında. */
    crateAreaM2: 30_000,
    crateNearTownShare: 0.6,
    /** Sandığın olasılık çarpanı (silah kesin). */
    crateScale: 1.8,
    /** Sandıklar arası en küçük uzaklık (oyun m). */
    crateSpacing: 18,
    /** Maçta bina arama süresi çarpanı (kapı 3 sn → 1,5 sn). */
    searchScale: 0.5,
  },
  /** Maç başı geri sayım (sn): hareket serbest, silah kapalı. */
  countdownSeconds: 3,
  /** Öldürme listesinde (kill feed) tutulan son olay sayısı. */
  killFeedSize: 5,
} as const;
