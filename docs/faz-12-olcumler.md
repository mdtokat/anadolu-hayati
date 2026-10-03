# Faz 12 — 12.9 Entegrasyon ölçümleri

Bu belge 12.9 oturumunun çıktısıdır ([faz-12-paralel-plan.md](faz-12-paralel-plan.md) §5). Girdi: üç grubun PR'ları `main`'de
([12.A batı #63](faz-12-bati-rapor.md), [12.B doğu #64](faz-12-dogu-rapor.md), [12.C güney #62](faz-12-guney-rapor.md)) ve 12.0a karo akışı
([faz-12-karo-akisi-olcumler.md](faz-12-karo-akisi-olcumler.md)). Ölçümler başsız Chromium + yazılımsal WebGL (SwiftShader), geliştirme sunucusunda
alındı; **gerçek GPU'lu masaüstünde ölçülmedi** (bkz. §8).

## 1. Birleşik dünya

`tools/world.yaml` `groups: [cekirdek, bati, dogu, guney]` → 16 hedef il; sınır kutusu iller + 2 km paydan türetildi: **29,22–37,26°D / 39,30–42,22°K**
(`bbox_max` içinde). Veri tek seferde üretildi: `fetch_*` (tüm gruplar) → `build_world.py` → `build_settlements.py` → `qa_world.py` → `npm run bake`.

| | Faz 12 öncesi (Sinop–Sakarya) | Birleşik Faz 12 dünyası |
|---|---|---|
| Hedef il | 9 | **16** (+ Kocaeli, Bilecik, Samsun, Çorum, Amasya, Ankara, Kırıkkale) |
| Komşu il (`inRegion=false`) | 11 | 11 (Bursa, Eskişehir, Kütahya, Kırşehir, Nevşehir, Ordu, Sivas, Tokat, Yalova, Yozgat, İstanbul) |
| `extent` (`col0, row0, cols × rows`) | −1152, −384, 4699 × 2346 | **−1664, −384, 6637 × 3148** (batıya 512, güneye 802 örnek; 20,9 M örnek, ×1,9) |
| Oyun boyutu | 9,40 × 4,69 km | **13,27 × 6,29 km** |
| Karo | 50 | **98** (tx −4…9, ty −1…5) |
| Chunk kafesi | 37 × 19 (`cx0 −9`) | **52 × 25** (`cx0 −13, cy0 −3`) |
| `elevation.max` | 2600 m | **2600 m (değişmedi)** → hiçbir karo yeniden nicemlenmedi |
| Yerleşim | 915 | **1 759** (16 il, 170 ilçe, 1 573 köy), 81 simge yapı, ~10 240 yapı |
| Yol çizgisi (veri → çıkış) | — | 56 363 → 3 189 (463 anayol bağlantısı, 70 patika, 958 köy girişi, 6 600 ikiz şerit çökertildi) |
| Tünel / köprü | — | 48 / 998 |
| `settlements.json` / `features.json` | 2,2 / 2,5 MB | 4,6 / 4,9 MB (gzip 1,75 MB) |
| Bake (`stream.json` + `stream/`) | 52 dosya, 24,8 MB | **100 dosya, 49,4 MB**; hazırlık 34 sn, toplam ~40 sn (deterministik: iki çalıştırma bayt bayt aynı) |

### 1.1 Eski alan değişmedi (`PINNED_WINDOWS` dördüncü pencere)
`build_world.py` `PINNED_WINDOWS`'a `Extent(−1152, −384, 4699, 2346)` ve o dünyanın kutusu `(29,80, 40,00, 35,55, 42,30)` eklendi. Ölçüm (eski ve yeni
`tiles/*.bin`, eski alan penceresinde): **100 karo dosyasından 70'i bayt bayt aynı; kalan 30'unda eski alan içinde 0 hücre farkı** (yükseklik ve örtü); farklar
yalnızca dünyanın uzayan kenarlarındadır. (Pencere yokken, 12.A/12.C'nin ölçtüğü gibi 6–34 karoda ≤ 42 nicem fark çıkıyordu.) Bu yüzden
`SCATTER_GOLDEN`, `latticeGolden`, doğma adayı golden'ları **yeniden kaydedilmedi**: aynı kaldı. `latticeGolden`'da yalnızca kafes boyutu değişti.

## 2. Test ve sabit değişiklikleri
Tam test takımı yeni dünyada: önce 35 başarısız (22 dosya), şimdi hepsi yeşil. Sınıflama:

| Sınıf | Test | Önce → şimdi | Gerekçe |
|---|---|---|---|
| Boyut/golden | `latticeGolden`, `creatureRegion`, `scalePerf`, `terrainPages`, `worldData`, `region` | 37×19 → 52×25, extent, karo aralığı, 98 karo, 13,27 × 6,29 km, bellek 22 → 42 MB | dünya büyüdü |
| Bellek (yoğun yol) | `scalePerf` | yükseklik 80 MB, dokular 159 MB, toplam 379 MB; süre 8,7 sn | oyun karo akışlıdır; bu yol testler/`stream.json`'suz yerel dünya içindir |
| Zaman aşımı | `heightSourceGraded`, `pilot`, `propCollision`, `regionWorld` (5), `placeRulesRegion` | 5/30 sn → genel `testTimeout` 30 sn (`vitest.config.ts`), `placeRulesRegion` 120 sn | gerçek dünya kurulumu 10–15 sn; CI #60 de aynı yüzden kırılmıştı |
| Ölçek eşiği | `overlapAudit` | köprüsüz dere kesişimi 8 → 16 (ölçülen 15; 4'ü kent sokağı), kavşak dışı köprü çakışması 3 → 6 (5) | dünya ~2,3× büyük; çekirdekte 4 ve 3'tü |
| Ölçek eşiği | `roadNetworkReal` | köprü sayısı < 600 → < 1 400 (998) | 9 867 akarsu çizgisi |
| Ölçek eşiği | `waterThinning` | dere < 1 800 → < 3 500 (2 951); nehir 903 → 1 690 | |
| Ölçek eşiği | `landcover` | orman > %33 → > %25 (%28,5) | Ankara/Kırıkkale/Çorum bozkırı |
| Ölçek eşiği | `worldData` | `none` blok oranı 0,25 → 0,6 | İznik Gölü ve Sarıyar Baraj Gölü (göl yüzeyi `none` sayılır) |
| Ölçek eşiği | `banditCamps` | kamp yakınlığı ≥ %55 → ≥ %45 (%50,5) | 16 il, 186 merkez; `campCount` toplamı 125 |
| Ölçek eşiği | `settlementMap` | il ≥ 20 yapı → ≥ 12 (Samsun 13); yerleşim hesabı < 10 sn → < 60 sn (27–35 sn) | ilçeler çekirdeği önce alır (düzen sırası ilçe → il); oyun hesabı bake'ten yükler |
| Bilinen sınır | `roadNetworkReal`, `batiSettlements`, `guneySettlements` | `unlinked` 0 → ≤ 1 | Eynegazi (Samsun, Altınkaya Barajı kıyısı) için rota yok (12.B §3.4) |
| Sayısal tolerans | `waterGeometry`, `scatterRegion` | ters üçgen eşiği −0,05; eğim + 1e-3; sınıf uyuşmazlığı < 1e-4 | 69 377 göl üçgeninden 2'si −0,005 m²; ~100 binde 2 nesne örtü hücresi kenarında |

**Gerçek bir kusur bulundu ve düzeltildi:** `settlements/roadProfile.ts` — ağızlar dışarı genişletilince komşu tünel adayları çakışabiliyor, ikinci aday önceki
aralığın bittiği yerden başlayan 6 m'lik bir kalıntı üretiyor ve tünelin ortasında gereksiz bir ağız çıkıyordu (2 yolda; `settlementWalk` en kısa tüneli
yürüyemiyordu). Çakışan/bitişik adaylar artık tek tünel (50 → 48 tünel). Çekirdekte çakışma yoktu: onun çıktısı değişmedi.

## 3. Derleme bütçesi (`npm run build:check`, yerel `dist`)

| Ölçüt | Değer | Sınır (önce → şimdi) |
|---|---:|---|
| `index.js` gzip / ham | 258,6 kB / 768,0 kB | 270 / 850 (değişmedi; %96 / %90 uyarı) |
| `rapier.js`, `three.js`, açılış JS+CSS | 1,64 MB, 141 kB, 2,05 MB | değişmedi |
| dünya verisi toplamı (ham) | 136,5 MB | 55 → **160 MB** |
| en büyük dosya (`features.json`) | 4,90 MB | 3,5 → **5,5 MB** |
| tahmini ilk yükleme @ 20 Mbit/s (karo akışı, 9 karo) | **5,6 sn** | 10 sn (**20 → 10 sn'ye döndü**; `load.maxSeconds` yalnız akışsız yayın için) |

Toplamın 74 MB'ı eski `tiles/*.bin`'dir (karo akışlı yayında hiç inmez; yoğun yol ve testler için durur): dağıtımdan çıkarılırsa toplam ~62 MB olur (ayrı karar).
`features.json` gzip'li 1,75 MB iner ve açılışta tek seferde okunur; karo başına bölme (ROADMAP) bu dosyayı bütçeden çıkarır.

## 4. Başsız ölçüm (16 konum × 8 yön, kararlı durum)
Yöntem: konuma ışınla, çizim kapalıyken karolar yüklenene kadar bekle (yazılımsal WebGL'de çizim açıkken dilimler çok yavaş ilerler: ilk denemede 25 sn sonra bile
karoların yarısı hazır değildi ve draw call'lar %40 düşük çıktı), çizimi aç, 8 yönde 45° adımlarla `renderer.info`.

| Konum | En kötü draw call (yön) | Üçgen | Ortalama draw call | JS yığını (MB) |
|---|---:|---:|---:|---:|
| **Anıtkabir (Ankara)** | **343 (0°)** | 783 bin | 235 | 324 |
| Safranbolu | 325 (135°) | 665 bin | 259 | 354 |
| İnebolu | 319 (135°) | 527 bin | 197 | 341 |
| İzmit | 317 (270°) | 690 bin | 211 | 327 |
| Zonguldak merkez | 317 (135°) | 581 bin | 231 | 355 |
| Çorum | 316 (315°) | 625 bin | 238 | 369 |
| Kırıkkale merkez | 310 (315°) | 715 bin | 231 | 348 |
| Körfez (Kocaeli) | 309 (270°) | 704 bin | 162 | 327 |
| Boyabat | 308 (135°) | 605 bin | 234 | 353 |
| Amasya | 308 (90°) | 593 bin | 238 | 362 |
| Ilgaz zirvesi | 281 (180°) | 531 bin | 248 | 352 |
| Tosya | 276 (135°) | 533 bin | 237 | 362 |
| Bilecik | 215 (270°) | 497 bin | 142 | 347 |
| Bafra deltası | 203 (180°) | 438 bin | 149 | 323 |
| Samsun merkez | 172 (90°) | 458 bin | 148 | 313 |
| Sapanca / Sakarya | 140 (315°) | 523 bin | 120 | 327 |

Sayfa açılışı (menüye hazır) 11,8 sn (yazılımsal WebGL, geliştirme sunucusu; 12.0a ölçümünde 5,3 sn, A/B/C yerel dünyalarında 7,7–8,9 sn), hata yok. JS yığını ~310–370 MB (karo tavanı 25; 12.0a'da 220–300 MB: bake'in `settlements.bin`'i
3,5 MB, genel bakış 0,9 MB ve daha çok yapı). Karolar 9–15 adet yüklü.

**Bütçe aşımı:** 16 konumun 11'inde draw call 300'ün üstünde, en kötüsü 343 (hedef ≤ 250). 12.0a'nın çekirdek ölçümünde en kötü 291 idi. Anıtkabir'de döküm (görünür mesh):
`terrain-chunks` 579, `people` 85 (Ankara merkezinde 140 m içinde çok sayıda satıcı: komşu ilçe merkezlerinin 3–4'er satıcısı), `settlements` 59, `props` 16.
**Deneme (ayar değişmedi; elle karar gerekir):** `CHUNK.viewDistance` 4000 → 3000 m iken en kötü draw call 343 → 219 (Anıtkabir), 325 → 223 (Safranbolu), 317 → 252 (İzmit),
316 → 211 (Çorum); 2400 m'de 204 / 172 / 204 / 184. Sis (`fogFar` 3800) mesafeyle birlikte çekilmezse arazi sisin bitişinden önce kesilir (pop-in). Diğer adaylar: tamamı deniz
chunk'ları birleştirmek; Ankara merkezinde satıcı çizim sınırı (`PeopleLayer`); `SETTLEMENT_LAYOUT`.

## 5. Bulgular ve kalan riskler
1. **Draw call > 300** (yukarıda): gerçek GPU'da frustum/üçgen maliyeti farklıdır; karar elle ölçümden sonra (`viewDistance` 3000 önerilir).
2. **`features.json` 4,9 MB / `settlements.json` 4,6 MB küresel dosyalar** her açılışta iner (gzip ~1,75 + ~1,2 MB): dünya büyürse karo başına bölünmeli (12.0a §6.1).
3. **Samsun il merkezi 13, Ankara 41 yapı:** büyükşehirlerde ilçe çekirdekleri il merkezini daraltır (düzen sırası ilçe → il); satıcı/simge yapı sıkışması (Ankara'da Arslanhane,
   Samsun'da Büyük Cami, Amasya'da iki cami çıkarıldı). Düzen sırası ya da büyükşehir için ayrı kural ayrı iş.
4. **Eynegazi (Samsun) yolsuz:** Altınkaya Barajı çevresinde A* rota yok; köy yolsuz kalır (`unlinked = 1`).
5. **Bina kimlikleri kayabilir:** yerleşim düzeni küresel olduğundan eski dünyadaki yapı kimlikleri (`yerleşim · 1024 + sıra`) değişir; kayıttaki "aranmış yapı" listeleri başka yapıyı gösterebilir
   (daha önce kabul edilmiş sınır). Yerleşim kimliği (20 bit CRC) çakışmaları 12.B'nin düzeltmesiyle deterministik çözülür.
6. **Köprüsüz dere kesişimi 15, kavşak dışı köprü çakışması 5:** kent sokaklarının dereyi köprüyle geçmesi ayrı küçük iş (12.A §2.2).
7. **Eşkıya kampı:** toplam `campCount` 125 (96 + 6 + 13 + 10); kamplar komşu illerde de (Çorum, Eskişehir …) çıkabilir; kent merkezlerinin %50,5'ine kısa yürüyüşte kamp düşer (önce %55+).
8. **`SettlementMap` 27–35 sn:** yalnızca bake'te (oyun açılışında ~20 ms); bake hazırlığı 34 sn.

## 6. Elle doğrulanacaklar
[docs/faz-8-elle-dogrulama.md](faz-8-elle-dogrulama.md) bölüm 21.

## 7. Üretim komutları (yeniden üretmek için)
```bash
cd tools
python fetch_boundaries.py
python fetch_dem.py bati-karadeniz && python fetch_water.py bati-karadeniz && python fetch_landcover.py bati-karadeniz
python fetch_settlements.py bati-karadeniz        # ~4,9 M bina noktası, 1,1 GB; ~25 dk
python build_world.py && python build_settlements.py && python qa_world.py
cd .. && npm run bake
```
`build_settlements.py` yerleşim kimliği çakışmasını (20 bit CRC) deterministik çözer; sıra değişmez.

## 8. Not
Bu belgedeki draw call/yığın/açılış sayıları SwiftShader'dandır ve gerçek oyun bilgisayarını temsil etmez; yalnızca önce/sonra karşılaştırması içindir.
