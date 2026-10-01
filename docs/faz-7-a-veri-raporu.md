# Faz 7 · Hesap A — Veri raporu (7.1–7.4)

Bu belge A'nın teslim notudur: B'nin ve 7.10'u yapacak hesabın bilmesi gerekenler + `tools/qa_world.py` çıktısı.

## B için notlar (sözleşmeden farklar ve gözlemler)

- **Dünya verisi hazır:** `public/data/world/bati-karadeniz/` — `extent = {col0 −640, row0 0, cols 2228, rows 1962}` (4,37 M örnek), 24 karo, `elevation.max = 2400` (en yüksek nokta ≈ 2368 m, (−589, 1813) civarı, Bolu), `gridOrigin = {−2867, −1175}`, 20 MB toplam (karolar 18 MiB; `features.json` 1,1 MB; `provinces.geojson` 0,1 MB). Overture `2026-09-23.1` (eski ve yeni alan aynı).
- **Eski alan ≤ 1 nicem:** eski bölge (Faz 6) ile yeni dünyanın eski alanı yükseklikte en çok 3,35 cm (1 nicem = 3,66 cm) farklıdır; **arazi örtüsü 0 / 1 867 488 hücre farklı** (birebir aynı). `PINNED_WINDOWS` (aşağıda) olmasaydı fark ~5 m olurdu.
- **Plandan sapma — GDAL pencere bağımlılığı:** plan, aynı DEM'in aynı hücrelere alan ortalamasıyla örneklenince "özdeş" çıkacağını varsayıyordu. GDAL `reproject` dönüşümü yaklaşıktır (hata eşiği 0,125 piksel) ve hata hedef pencerenin boyutuna/konumuna bağlıdır; eski alan yeni (büyük) pencerede yeniden örneklenince dik yamaçlarda en çok 5,2 m (ortalama 0,01 m, hücrelerin %2,4'ü > 1 m) farklı çıktı. Çözüm: `build_world.py` `PINNED_WINDOWS` — eski alan eskiyle **aynı pencerede** (`0, 0, 1588, 1176`) örneklenip dünya dizisine yerleştirilir (eski kafes yeni kodla bit-eşdeğer yeniden üretilir: `tests` + `--verify-legacy`). Dikiş (sütun −1|0, satır 1175|1176) farkı iç gradyandan büyük değil (aşağıdaki tablo). Faz 8+ genişlemelerinde pencere listesi büyür; böylece eski karolar değişmez.
- **Yedigöller** OSM'de `lake` değil `pond`'dur (Seringöl, Deringöl, Büyükgöl, Kurugöl, Nazlıgöl, Sazlıgöl; (−790, 865) civarı). Abant Gölü `lake` ((−1593, 1600), rakım ≈ 1400 m). Plandaki "yakınında `lake`" beklentisi bu yüzden "durgun su çokgeni" olarak sınanır (`tests/worldData.test.ts`); içilebilirlik B'nin `FRESH_WATER` mantığına bağlıdır (`pond` zaten durgun su sayılır).
- **Komşu iller (otomatik, ≥ 1 km² kesişim):** Ankara, Bilecik, Eskişehir, Kastamonu, Sakarya, Çankırı. Kocaeli ızgarayla hiç kesişmedi (plan "Eskişehir/Kocaeli kenarda küçük parçalar" demişti; Eskişehir ≈ 204 km², Bilecik ≈ 117 km² kesişiyor). Sliver eşiği `tools/world.yaml` → `neighbor_min_area_km2`.
- **Hedef il sayısı 5:** Zonguldak, Bartın, Karabük, Düzce, Bolu (`inRegion = true`); eski `provinces.geojson`'daki Bolu/Düzce artık hedef. Test beklentileri (il listesi vb.) B'nin 7.9'unda güncellenir.
- **Örtü:** karada (yükseklik > 0) `none` oranı %0,17; 128×128 blokların hiçbirinde şerit yok. `grass` yalnızca ~810 hücre (WorldCover'da çayır az; Faz 4 verisiyle tutarlı).
- **`RegionMeta.landcover.file`** karo düzeninde `'tiles/*.cover.bin'` yer tutucusudur (tek dosya yok); B bu alanı okumamalı, yalnızca `classes`'ı kullanmalı.
- **`loadWorld` sha doğrulaması** `crypto.subtle` varsa yapılır (https/localhost); güvenli olmayan bağlamda atlanır, bayt sayısı denetimi her zaman yapılır.
- **Test yardımcıları (A, yeni dosyalar):** `tests/helpers/fsFetch.ts` (`publicFsFetch`: `public/` altından `fetch` benzeri; `loadWorld` ile gerçek veriyi Node'da yükler), `tests/helpers/worldFixture.ts` (sentetik karo dünyası). B'nin `loadRealWorld()` yardımcısı `publicFsFetch` + `loadWorld(WORLD.id, '/', …)` ile yazılabilir (modül düzeyinde önbellekle).
- **Eski veri:** `public/data/regions/…`, `loadRegion`, `regions.yaml`, `build_region.py` yerinde (7.10'da kalkar). `tools/tile_legacy.py` daha geniş dünyanın üzerine yazmaz (`--force`).

## `qa_world.py` çıktısı — bati-karadeniz

extent: 2228×1962 (col0 -640, row0 0), 24 karo, yükseklik 0–2400 m, Overture 2026-09-23.1, built 2026-10-01

### Karo tablosu

| karo | yükseklik (KB) | örtü (KB) | kara % | min m | max m |
|---|---|---|---|---|---|
| -2_0 | 512 | 256 | 0 | 0 | 0 |
| -1_0 | 512 | 256 | 0 | 0 | 0 |
| 0_0 | 512 | 256 | 4 | 0 | 546 |
| 1_0 | 512 | 256 | 52 | 0 | 925 |
| 2_0 | 512 | 256 | 96 | 0 | 1425 |
| 3_0 | 512 | 256 | 100 | 60 | 1396 |
| -2_1 | 512 | 256 | 47 | 0 | 465 |
| -1_1 | 512 | 256 | 35 | 0 | 1163 |
| 0_1 | 512 | 256 | 84 | 0 | 1627 |
| 1_1 | 512 | 256 | 100 | 19 | 1995 |
| 2_1 | 512 | 256 | 100 | 198 | 1760 |
| 3_1 | 512 | 256 | 100 | 487 | 1778 |
| -2_2 | 512 | 256 | 100 | 12 | 1567 |
| -1_2 | 512 | 256 | 100 | 32 | 1829 |
| 0_2 | 512 | 256 | 100 | 240 | 2368 |
| 1_2 | 512 | 256 | 100 | 445 | 2279 |
| 2_2 | 512 | 256 | 100 | 722 | 2067 |
| 3_2 | 512 | 256 | 100 | 788 | 1893 |
| -2_3 | 512 | 256 | 100 | 390 | 1367 |
| -1_3 | 512 | 256 | 100 | 221 | 1736 |
| 0_3 | 512 | 256 | 100 | 429 | 2129 |
| 1_3 | 512 | 256 | 100 | 495 | 2081 |
| 2_3 | 512 | 256 | 100 | 802 | 1898 |
| 3_3 | 512 | 256 | 100 | 997 | 1894 |

### Arazi örtüsü

| sınıf | hücre | % |
|---|---|---|
| none | 967547 | 22.1 |
| forest | 2079622 | 47.6 |
| shrub | 839301 | 19.2 |
| grass | 810 | 0.0 |
| crop | 292737 | 6.7 |
| barren | 151016 | 3.5 |
| urban | 39651 | 0.9 |
| wetland | 652 | 0.0 |

### İl kapsamı

| il | hedef | hücre | kara % |
|---|---|---|---|
| Ankara | komşu | 768944 | 100 |
| Bartın | evet | 238006 | 100 |
| Bilecik | komşu | 11664 | 100 |
| Bolu | evet | 820469 | 100 |
| Düzce | evet | 260960 | 100 |
| Eskişehir | komşu | 20378 | 100 |
| Karabük | evet | 418017 | 100 |
| Kastamonu | komşu | 142922 | 100 |
| Sakarya | komşu | 224213 | 100 |
| Zonguldak | evet | 317446 | 100 |
| Çankırı | komşu | 184588 | 100 |

### Eski/yeni alan sınır sürekliliği (komşu örnek farkı, metre)

| dikiş | dikiş ort | dikiş p99 | iç ort | iç p99 |
|---|---|---|---|---|
| west | 4.49 | 34.62 | 5.47 | 49.26 |
| south | 12.31 | 51.30 | 13.14 | 55.81 |

### Su

- 2338 akarsu çizgisi; batı dikişini geçen 2, güney dikişini geçen 10
- 637 durgun su çokgeni, 50 kaynak

