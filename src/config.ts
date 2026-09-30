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
    /** İl sınırı çizgilerini aç/kapa. */
    toggleBorders: ['KeyB'],
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
