# Faz 12 — 12.0a Karo akışı: tasarım, ölçümler, devir notları

Bu belge 12.0a'nın çıktısıdır ([faz-12-paralel-plan.md](faz-12-paralel-plan.md) §3.1). Tasarım planı kullanıcı tarafından onaylandı;
sapmalar §6'da. Ölçümler başsız Chromium + yazılımsal WebGL (SwiftShader), geliştirme sunucusunda (`vite`, küçültülmemiş kod)
alındı; **gerçek GPU'lu masaüstünde ölçülmedi** (aşağıdaki "Elle doğrulanacaklar").

## 1. Ne değişti (özet)

| Alan | Önce | Şimdi |
|---|---|---|
| Arazi verisi | tüm dünya tek yoğun dizi (yükseklik, taban yükseklik, kilit, deniz mesafesi: ~400 MB) | **512'lik sayfalar** (= dünya karosu); oyuncuya `loadRadius` 1400 m içindekiler yüklü, ötesi her 8. örnekten **genel bakış** (`world/terrainPages.ts`, `RegionHeightSource`) |
| Açılış hesabı | dere yatakları, yol ağı/profili, yapı düzeni, teras, tünel delikleri her açılışta (~7–15 sn) | veri hattında **bir kez** (`npm run bake`); oyun hazır haritayı kurar (`SettlementMap(baked)` ~20 ms) |
| Kaplama dokuları | tüm dünya için 2 m'lik 4 doku (~176 MB) | karo yüklenince **karo başına** raster + materyal (`world/terrainTiles.ts`); LOD3 ve yüklenmemiş karolar tek **genel bakış** materyali (16 m) |
| Yükleme | tüm karolar açılışta (50 karo, ~39 MB) | küresel dosyalar + oyuncunun çevresi; karolar yaklaştıkça akar (`world/TileStreamer.ts`, kare bütçeli, ≈ 1 ms'lik dilimler) |
| Işınlanma/doğma/kayıt | anında | karolar hazır olana kadar oyun donar ("Harita yükleniyor…"), sonra yaklaşık nokta gerçek zemine oturur (`Game.worldReady`) |

Eski tam bellek yolu **olduğu gibi duruyor**: `stream.json` yoksa (depodaki veri 12.9'a kadar böyle) oyun, testler ve `?world=test` eskisi
gibi çalışır. Akışlı veri yalnızca `npm run bake` çıktısı varsa kullanılır.

## 2. Mimari

### 2.1 Sayfalı arazi (`RegionHeightSource`)
- Sayfa = 512 × 512 örnek, kafese hizalı dünyada tam olarak dünya karosu (`pageGridOf`). Yoğun kip (`new`, `fromRegion`) tüm sayfaları
  kurar ve eski davranışla **bire bir aynıdır** (mevcut tüm testler değişmeden geçer). Akış kipi (`RegionHeightSource.streamed`) yalnız
  genel bakış dizisiyle (her 8. örnek, **düzeltilmiş** yükseklik) kurulur; `loadTile/unloadTile/patchTile` sayfaları getirir/götürür.
- Yumuşatma (Gauss, σ = 1,3) ve deniz tabanı karo penceresinde (çekirdek + **12 örnek pay**) hesaplanır ve tüm dizi üzerinde
  hesaplananla **bit-bit aynıdır** (`tests/terrainPages.test.ts`, `tests/worldBake.test.ts`: 50 karonun hepsi).
- Yol/dere/teras düzeltmesi karoya **yama** olarak gelir (sayfa içi indeks + Float32 yükseklik); doğal yükseklik (`natural()`,
  nesne dağılımı) korunur. Yüklü olmayan sayfada örnekler genel bakıştan aradeğerlenir (LOD3 köşeleriyle bire bir aynı).
- `distanceToSea` akış kipinde genel bakış üzerinden hesaplanır (≤ 1 genel bakış hücresi ≈ 16 m sapma; ortam sesi için yeterli).

### 2.2 Bake (`scripts/bakeWorld.ts`, `src/data/worldBake.ts`)
`npm run bake [dünya-id] [--public <klasör>]`: `loadWorld` + **oyunun kendi kodu** (`world/worldPrep.ts` `prepareDenseWorld`: yoğun
`RegionWorld` yolu da aynı işlevi çağırır) çalışır, sonuç `public/data/world/<id>/stream.json` + `stream/` altına yazılır. Python'a dokunulmadı:
sıra `build_world.py` → `build_settlements.py` → `npm run bake` (dünya verisi değişince bake yeniden çalıştırılır; `stream.json` içindeki
`world.json` sha256'sı eskimiş bake'i `build:check` ve yükleyici yakalar).

| Dosya | İçerik |
|---|---|
| `stream.json` | manifest: dünya sha'sı, `halo`, dosya listesi (bayt + sha256) |
| `stream/overview.bin` | her 8. örnek yükseklik (Float32) + örtü (uint8) + göl yüzeyi yükseklikleri |
| `stream/settlements.bin` | `SettlementMap.toBaked()` (yapılar, yol ağı/planı, sokaklar, merdivenler, ayak izleri) + tünel delik hücreleri |
| `stream/t_<tx>_<ty>.bin` | karo penceresi (ham yükseklik + örtü, 12 örnek paylı), düzeltme yamaları |

Kapsayıcı: JSON iskelet + hizalı ikili gövde (`data/bakedBlob.ts`), **gzip'li** (`CompressionStream`; Pages `.bin` dosyalarını sıkıştırmaz,
veri hattı kendisi sıkıştırır: 47,8 → 24,8 MB). Mevcut dünya: 52 dosya, 24,8 MB (karo ortalama 0,45 MB, `settlements.bin` 1,7 MB,
`overview.bin` 0,48 MB), bake 12–15 sn.

### 2.3 Karo yaşam döngüsü (`world/TileStreamer.ts`, `RegionWorld`)
- Odak: oyuncu ve (drone varsa) görüş odağı. `STREAMING.tiles`: `loadRadius` 1400 m, `unloadRadius` 1900 m (histerezis), `maxResident` 25
  (bellek tavanı), `maxFetches` 4, `readyRadius` 220 m (oyuncunun çevresi hazır olmadan oyun ilerlemez).
- Karo durumları `fetching → staged → ready`; etkinleştirme dilimlidir (yükseklik/deniz tabanı/yumuşatma ≈ 45 dilim, örtü + yama, kaplama
  rasteri, materyal) ve `FrameBudget`'a bağlıdır (ilk dilim her karede, gerisi süre kaldıkça). Yükleme ekranındayken bütçe 14 ms'dir.
- `ChunkManager`: karosu hazır olmayan chunk en kaba LOD'a (genel bakışla bire bir aynı örnekler → çatlak yok) ve genel bakış materyaline
  düşer; LOD3 her zaman genel bakış materyalini kullanır. `ChunkColliders` karosu yüklü olmayan chunk'a collider kurmaz; `PropLayer` hazır
  olmayan chunk'ın nesnelerini hesaplamaz (yanlış sonuç önbelleğe girmesin). LOD0–2 (≤ 900 m) hep yüklü karodadır.
- Kimlikler: nesne/canlı/chunk kimlikleri zaten mutlak kafes anahtarıdır; bina kimlikleri bake'te aynı kod ve veriyle üretildiğinden bugünküyle
  aynıdır (test: `tests/worldBake.test.ts` yapı yapıya eşit). **Kayıt formatı değişmedi** (v8; göç gerekmedi): kayıt yüklenince oyuncunun karosu
  hazır olana kadar oyun bekler.

### 2.4 Işınlanma / yeni oyun / yeniden doğma
`teleportToLatLon`, `cityStart`, `respawnPoint` yaklaşık (genel bakıştan bulunmuş) nokta verir; `Game.settlePending` karolar gelince noktayı gerçek
zemine göre yeniden oturtur (`RegionWorld.settlePoint`). `placeCenters()` (yer adı bildirimi) açılışta genel bakışa göre hesaplanır:
yer merkezleri ≈ 16 m'ye kadar kayabilir (bildirim yarıçapı 40 m).

## 3. Ölçümler

### 3.1 Öncesi (yoğun yol, depodaki gerçek dünya; Node + vitest)
| Adım | Süre |
|---|---|
| `loadWorld` (diskten, 50 karo) | 0,33 sn |
| `RegionHeightSource` + dere yatakları + `SettlementMap` + yol düzeltmesi/teras | 9,1 sn (`SettlementMap` 7,2 sn) |
| `RegionWorld` kurulumu (yerleşimsiz) | 3,3 sn |
| Bellek (Node `arrayBuffers`) | ~383 MB |

### 3.2 Tarayıcıda yoğun ve akışlı (aynı dünya, aynı makine, `npm run dev`; 12 konum: Zonguldak, Safranbolu, Bolu, Düzce, Kastamonu, Tosya, Sinop, Boyabat, Sakarya, Çankırı, Ilgaz, İnebolu)
| | Yoğun (eski yol) | Akışlı |
|---|---:|---:|
| Oyun hazır (sayfa açılışı → menü) | 13,7 sn | **5,3 sn** |
| JS yığını, başlangıç (`gc()` sonrası) | 499 MB | **205 MB** |
| JS yığını, 12 konumlu tur sonrası en yüksek | 565 MB | **300 MB** (tavan: `maxResident` 25 karo, dünya boyutundan bağımsız) |
| En kötü draw call (görüş yönüne bağlı) | 301 | 291 (Safranbolu) |
| Üçgen (en çok) | ~1,0 M (Düzce) | ~0,6 M |
| Derleme denetimi: tahmini ilk yükleme (20 Mbit/s) | 17,2 sn (sınır 20) | **4,0 sn** (9 karo; sınır 10) |

Draw call ve üçgen sayıları yönteme göre oynar (aynı konumda yön/saat farkı); akış draw call sayısını artırmaz (chunk sayısı aynı), karo başına
materyaller aynı programı paylaşır.

### 3.3 Takılma (`npm run perf`, çizim kapalı, 90 sn)
Karo akışı bölümü: dilim ortalaması 0,7 ms, soğuk (ilk JIT) en kötü dilimler ~10 ms. Önce (dilimsiz) tek karo etkinleştirmesi 40–90 ms'ydi;
yükseklik/yumuşatma, kaplama rasteri (öğe ve köşe sayısıyla) ve materyal dilimlere bölündü (`terrainFromRawSteps`, `smoothLandSteps`,
`seaDistanceToLandSteps`, `buildTerrainOverlaySteps`, `RegionHeightSource.loadTileSteps`; hepsi tek parça hâliyle bire bir aynı sonuç).
Karo başına maliyet: CPU ~6–7 MB, GPU ~4,6 MB (4 doku, 536²). Işınlanmada 14 karo ≈ 5 sn (çizim kapalı); gerçek GPU'da çizim sürerken kare
başına en az 1 dilim ilerlediğinden süre kare hızına bağlıdır.

## 4. Test stratejisi (hepsi `npm test`'te)
- `tests/terrainPages.test.ts`: pencere → sayfa bit-bit aynı (kıyı/kenar/iç karolar), genel bakış, yama, boşaltma, deniz mesafesi.
- `tests/worldBake.test.ts`: kapsayıcı gidiş-dönüş (+gzip), manifest/sha, genel bakış, **tüm karolar** pencere + yamayla yoğun (düzeltilmiş) kaynağa
  eşit, baked `SettlementMap` hesaplananla eşit (yapı yapıya, yol/plan/merdiven, sorgular, tünel delikleri).
- `tests/worldStream.test.ts`: `loadWorldStream` (yok → null, bozuk karo sha ile reddedilir), `RegionWorld` akış kipi (preload sonrası zemin ve nesne
  kimlikleri yoğun dünyayla aynı, collider kurulu; uzağa ışınlanınca eski karolar boşalır, tavan aşılmaz).
- `tests/tileStreamer.test.ts`: yaşam döngüsü mantığı (yarıçap, histerezis, eşzamanlı indirme, hata/yeniden deneme, dilimli etkinleştirme) ve
  `ChunkManager` akış kipi (en kaba LOD + materyal seçimi).
- `tests/streamBudget.test.ts`: derleme bütçesi karo akışını tanır (açılışta inen veri, sınır seçimi).
- Yürüme/yerleşim testleri (`tests/helpers/walker.ts`, `settlementMap`) değişmedi: yoğun kip "hepsi yüklü" gibi davranır.
Bake gerektiren testler bake'i bellekte yapar (~15 sn, dosya başına bir kez); `public/data/**`'a yazmaz.

## 5. Devir: 12.9'a / A, B, C oturumlarına
- **Yerel dünya kurmak (A/B/C):** `build_world.py` + `build_settlements.py` sonrası `npm run bake`. Bake çıktısı `public/data/**` altındadır ve
  commit edilmez (`git add` ile elle seçin ya da `.git/info/exclude`'a `public/data/world/*/stream.json` ve `.../stream/` ekleyin).
  `stream.json` olmayan yerel dünya eski tam bellek yolunu kullanır (büyük dünyada bellek/açılış sorunu: bake'i unutmayın).
- **12.9:** `npm run bake` çıktısı da commit edilir. `build:check` `stream.json`'ı doğrular (eskimiş bake, bayt, sha). Beklenen bütçe kararları:
  `data.totalKB` (eski karolar + akış karoları birlikte: şimdi 69 MB; 2,5× dünyada ~170 MB; eski `tiles/*.bin` yalnızca yoğun yol ve testler için
  duruyor, akışlı yayında hiç inmez — dağıtımdan çıkarma ayrı karar), `data.maxFileKB`, `load.maxSeconds` (akışlı dünyada otomatik `stream.maxSeconds` = 10),
  `index.js` (257 kB gzip; sınır 270, uyarı bölgesinde — bu iş ~+20 kB ekledi). `scripts/buildBudget.ts` mevcut sınırlarına dokunulmadı; yalnız `stream`
  anahtarı eklendi.
- Dünya büyüyünce ölçeklenen küresel dosyalar: `settlements.bin` (1,7 MB → ~4 MB), `overview.bin` (0,48 → ~1,2 MB), `features.json` (2,5 MB, gzip'li iner),
  açılış CPU'su: `landBorderSegments` ~190 ms, genel bakış kaplaması ~130 ms (×2,5), `FreshWaterIndex` ve göl üçgenlemesi (ölçülmedi).
- Önerilen CLAUDE.md "Mevcut Durum" paragrafı: aşağıda §7.

## 6. Onaylanan plandan sapmalar
1. **`features.json` karo başına bölünmedi.** Plan "karo başına features" diyordu; ölçüm: küresel su vektörü gzip'li ~0,7 MB iner ve açılış tahminini
   (4,0 sn) tehdit etmiyor; bölmek `FreshWaterIndex`/göl mesh'i/dere ayıklamasını karo yaşam döngüsüne bağlamayı gerektirirdi. 12.9'da (2,5× dünya) ölçülüp
   gerekirse ayrı iş olarak yapılır.
2. **Bake dosyaları gzip'li** (planda yoktu): `.bin` dosyalarını Pages sıkıştırmaz; veri hattı sıkıştırarak aktarımı ~2× küçülttü (tarayıcıda
   `DecompressionStream`).
3. **Dosya sahipliği** (kullanıcı onayıyla genişletildi): `src/world/*` (yükseklik kaynağı, ChunkManager/Colliders, PropLayer, LandCoverMap, kaplama,
   materyal, su meshi), `src/data/*`, `src/settlements/{SettlementMap,footprints,bakedMap}.ts`, `src/config.ts` `STREAMING`, `scripts/*`, yeni testler.
   `tools/**` (Python), `tools/groups`, 12.0b'nin testlerine ve `public/data/**`'a dokunulmadı.

## 7. Bilinen sınırlar ve elle doğrulanacaklar
- Gerçek GPU'da ölçülmedi: FPS, kaplama dokularının GPU yüklemesi (karo başına 4 × 1,15 MB; karo materyali ilk çizildiği karede yüklenir), mipmap dikişleri
  (karo kenarlarında kaplama dokusu kendi penceresiyle sonlanır; halo 12 örnek, ama uzak mip'lerde hafif renk farkı olabilir).
- LOD3 (> 900 m) kaplaması 16 m'lik genel bakış dokusundan çizilir (yol/su kenarı uzaktan hafif yumuşar). Başsız ekran görüntüleriyle yoğun yola çok yakın
  görünüyor (Zonguldak, Ilgaz, Sinop), gerçek ekranda değerlendirilmeli.
- Karo kenarında, komşu karo henüz hazır değilken LOD0–2 chunk'ın normali birkaç kare genel bakış örnekleriyle hesaplanır (yalnız ışınlanma/ilk yükleme).
- Işınlanmada eski karoların materyali, chunk'lar genel bakışa dönmeden boşalabilir (bir iki kare, doku yeniden yüklenir; görsel sorun yok).
- `maxResident` aşılırsa (çok geniş görüş odağı) en uzak karolar boşaltılır; drone görüşünde oyuncu ve drone odağı birlikte tutulur (kullanılan tavan 25 karo).
- Kayıtlı oyunu yüklerken karolar inene kadar "Harita yükleniyor…" görülür (yavaş bağlantıda saniyelerce).

## 8. Önerilen CLAUDE.md / ROADMAP paragrafı (12.9 birleştirir)
> **Karo akışı (Faz 12, 12.0a):** dünya artık 512'lik karolar hâlinde oyuncuya yaklaştıkça yüklenir (`world/TileStreamer.ts`, `STREAMING.tiles`: yükleme 1400 m,
> boşaltma 1900 m, en çok 25 karo); uzak arazi hep bellekte duran genel bakıştan (her 8. örnek) çizilir. Açılışta hesaplanan her şey (dere yatakları, yol ağı/planı,
> yapı düzeni, terasları, tünel delikleri) veri hattında `npm run bake` ile bir kez hesaplanır (`stream.json`, `stream/`; `world.json` değişince yeniden bake). `stream.json`
> yoksa eski tam bellek yolu çalışır. Ölçüm (başsız): açılış 13,7 → 5,3 sn, JS yığını ~560 → ~300 MB (dünya boyutundan bağımsız), tahmini ilk yükleme 17,2 → 4,0 sn.
> Ayrıntı: [docs/faz-12-karo-akisi-olcumler.md](docs/faz-12-karo-akisi-olcumler.md). Yeni akışlı sistem karo hazır olmayan yerde çalışmamalı (`isReadyAt`, `chunkReady`).
