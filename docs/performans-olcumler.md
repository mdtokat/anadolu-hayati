# Performans çalışması — takılma (kare süresi sıçraması) ölçümleri

Kullanıcı bildirimi: "Oyunda FPS sorunu var, hareket ederken kasıyor." Hem şimdiki takılmaları gidermek hem de
sonraki özelliklerde takılmayı sınırlı tutacak altyapıyı kurmak için yapıldı. Elle doğrulama: kılavuz bölüm 20.

## Ölçüm ortamı ve yöntemi

- Başsız Chromium + yazılımsal WebGL (SwiftShader). Bu ortamda ekran kartı ölçülemez (çizim ~1 FPS); bu yüzden
  işlemci tarafı **çizim kapatılarak** ölçüldü (`npm run perf`, varsayılan). GPU tarafı (yükleme boyutları,
  gölgelendirici derlemesi) kod okuması ve sayımla değerlendirildi; gerçek ekran kartında `F3` göstergesiyle
  ölçülmeli.
- Senaryo: yeni oyun (rastgele il/ilçe merkezi), `W` + `Shift` ile 30–40 sn koşu, 8 sn'de bir yön değişimi.
- `npm run perf` (`scripts/perfWalk.ts`): oyunun kendi bölüm ölçümünü (`core/perfStats.ts`) okur; Playwright depo
  bağımlılığı değildir (`PLAYWRIGHT_MODULE`, `PLAYWRIGHT_CHROMIUM` ortam değişkenleri). Geliştirme sunucusu açık
  olmalı (`npm run dev`).

## Bulunan takılma kaynakları

| Kaynak | Önce | Sonra | Değişiklik |
|---|---|---|---|
| Tünel ağzı delikli chunk'ın collider'ı (tek parça 128×128 trimesh, `FIX_INTERNAL_EDGES`) | 67–86 ms (chunk başına) | ort. 3,1 ms, en kötü 8,5 ms | 16 hücrelik bloklar: yalnız delikli blok trimesh (`CHUNK.holeBlockCells`) |
| Nesne katmanı GPU yüklemesi (her 24 m) | ~11 MB (144 bin kapasitenin tamamı) | dolu kısım (birkaç yüz KB) | `world/instancing.ts` `commitInstances` (güncelleme aralığı) |
| Nesne katmanı doldurma (`PropLayer.fill`) | örnek başına metin anahtarı; bekleyen chunk varken her karede tam doldurma | sayısal dizin, chunk elemesi, 8 adımda bir doldurma | `SCATTER.pendingFillInterval` |
| Tek nesne chunk'ı dağılımı (`scatterChunk`) | ~10 ms tek seferde | 8 satırlık dilimler (~1 ms), kareler arasına yayılır | `ScatterJob`, `SCATTER.rowsPerSlice`; sonuç birebir aynı |
| Yol yapıları (köprü/tünel) yenilemesi (her 30 m) | yeni `BufferGeometry` (GPU tamponu sil/ayır), 5–9 ms | aynı tampon, yapı başına köşe önbelleği | `world/growableGeometry.ts` |
| Cam kırıkları | kırık varken **her karede** yeni geometri | aynı tampon | `GrowableGeometry` |
| Gün doğumu/batımı | güneş/ay ışığı `visible` değişince tüm malzemeler yeniden derleniyordu: oyun sırasında 11 yeni program | 0 | ışıklar hep görünür (yoğunluk 0 katkısız) |
| İlk kez görülen nesne türü | ilk kullanımda gölgelendirici derlemesi | yüklemede 16 program, ~60 ms (başsız) | `Game.precompile` (`compileAsync`) |

Toplam (başsız, çizim kapalı, aynı senaryo): `world.update` en kötü süresi **62,5 ms → 6–11 ms**; yerleşim katmanı
6,6 → 1,6 ms; kuş katmanı 5,8 → 0,6 ms. Ana iş parçacığında 30 ms'yi aşan görev kalmadı.

## Kalıcı altyapı

- **Kare zaman bütçesi** (`core/FrameBudget.ts`, `STREAMING.frameBudgetMs` = 4 ms): akışlı işler (arazi collider'ı,
  arazi mesh'i, nesne dağılımı, yerleşim/köprü/cam yenilemeleri) karede toplam bu süreyi paylaşır. Kritik ilk iş
  (oyuncunun altındaki collider, en yakın mesh, oyuncuya `SCATTER.criticalRadius` içindeki nesne chunk'ları) bütçe
  tükense de yapılır; dönemsel yenilemeler sonraki kareye ertelenir. **Yeni akışlı sistemler bu bütçeye bağlanmalı.**
  Fizikli yürüyüş testleri bütçeyi sınırsız verir (`RegionWorld.frameBudgetMs`), sonuç makine hızına bağlı olmasın.
- **Uyarlanır çözünürlük** (`core/resolution.ts`, `ADAPTIVE_RESOLUTION`; Ayarlar → "Otomatik çözünürlük", varsayılan
  açık): kare süresinin medyanı 50 FPS hedefini sürekli aşarsa piksel oranı kademeli düşer (1 → 0,85 → 0,7 → 0,6 →
  0,5), rahatlayınca geri çıkar. Başsız denemede yavaş çizimde 2 → 1,7 → 1,4 indi.
- **Performans göstergesi** (`F3` ya da Ayarlar; üretimde de): FPS, kare grafiği, en kötü %1, işlemci süresi ve
  bölümleri, draw call/üçgen, çözünürlük, bellek, son takılmanın dökümü. Kullanıcı gerçek ekran kartında ölçüp
  iletebilir.
- **Ölçüm betiği** `npm run perf`: önce/sonra karşılaştırması için Markdown rapor.

## Ölçülüp uygulanmayanlar

- **Nesneleri yön dilimlerine bölmek** (kameranın arkasındakileri çizmemek): nesne üçgenleri toplamın 100–180 bini;
  kameranın arkasındaki üçgenler ekran kartında zaten kırpılır, kalan köşe işleme kazancı ~%2. Dilimler +6…+20 draw
  call ekler (ölçülen en kötü 292, bütçe < 300). Uygulanmadı.
- **Web Worker** (dağılım ve arazi mesh'ini ayrı iş parçacığına taşımak): en büyük kalıcı kazanç olur, ama GitHub
  Pages `SharedArrayBuffer` için gereken başlıkları veremediğinden ~30 MB arazi kopyası gerektirir. Ayrı iş.

## Bilinen kalanlar

- Nesne tamponlarının yeniden doldurulması (`PropLayer.fill`) 24 m'de bir tek parça kalır: yoğun ormanda başsız
  ölçümde ~8 ms. Dilimlemek çift tampon gerektirir.
- Başsız ölçümde bir kez "arayüz" bölümünde 60 ms görüldü, iki tekrarda çıkmadı (tek seferlik; çöp toplama ya da ilk
  kullanım). Gerçek oyunda `F3` göstergesindeki "Son takılma" satırıyla izlenmeli.
- GPU tarafı (yükleme, gölgelendirme, çözünürlük) gerçek ekran kartında ölçülmedi.
