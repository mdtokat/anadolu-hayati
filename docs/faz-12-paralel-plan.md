# Faz 12 — Paralel Çalışma Planı: Çevre İllerin Eklenmesi (Batı, Doğu, Güney)

Bu belge, harita genişletmesinin **üç oturumda aynı anda** yürütülmesi için hazırlandı (kullanıcı talimatı: "3 farklı oturumda aynı anda çalıştırıp diğer illerden de ekleyeceğim"; plan sunuldu ve **kullanıcı tarafından onaylandı**). Yöntem [faz-11-paralel-plan.md](faz-11-paralel-plan.md) ve [faz-7-paralel-plan.md](faz-7-paralel-plan.md) ile aynıdır: önce **küçük bir iskele** birleşir, sonra akışlar dosya sahipliğine uyarak paralel çalışır, en sonda **tek bir entegrasyon oturumu** dünya verisini bir kez üretir.

> **Durum (12.9 sonrası):** 12.0a, 12.0b, 12.A, 12.B, 12.C ve 12.9 tamamlandı; birleşik ölçüm [faz-12-olcumler.md](faz-12-olcumler.md), `CLAUDE.md` "Faz 12 çevre iller ve karo akışı". Aşağıdaki plan tarihsel kayıttır.

> **Kullanıma başlamadan önce:** `CLAUDE.md` ("Mevcut Durum", "Bölge Veri Formatı", "Çalışma Kuralları"), `ROADMAP.md` "Genişleme" bölümü ve bu belgenin §2 (kurallar) ile kendi akışının bölümünü oku. Kullanıcı seni bu belgeye işaret ederek başlattıysa **plan onaylanmıştır** (CLAUDE.md "Plan, sonra kod"). Plandan sapmak gerekirse uygulamadan önce kullanıcıya sor. Yalnızca kendi akışının işini yap.

**Kullanıcı kararı (CLAUDE.md'deki "harita genişletmesi durduruldu" notunun yerine geçer):** harita genişletmesi yeniden açıldı; çevre iller Faz 12'de eklenir. Bu karar yalnızca bu belgedeki iller için geçerlidir.

## 0. Özet

| | İş | Oturum | Bağımlılık |
|---|---|---|---|
| **12.0a** | **Karo akışı** (oyuncuya göre karo yükleme/boşaltma, bellek tavanı) ve açılışta toplu hesapların (yerleşim düzeni, yol ağı) veri hattına alınması — **kendi tasarım planını önce sunar**, onay sonrası kodlar (§3.1) | tek oturum | — |
| **12.0b** | **Veri iskelesi:** il listelerinin testlerden çıkarılması, grup yaml parçaları, grup yer adı dosyaları, `fetch_*` `--bbox` bayrağı, `world.yaml` bbox'ının parçalardan türetilmesi (§3.2) | tek oturum (12.0a ile paralel olabilir) | — |
| **12.A** | Batı grubu: Kocaeli, Bilecik — içerik ve doğrulama | A | 12.0a + 12.0b `main`'de |
| **12.B** | Doğu grubu: Samsun, Çorum, Amasya — içerik ve doğrulama | B | 12.0a + 12.0b `main`'de |
| **12.C** | Güney grubu: Ankara (önce kuzeyi), Kırıkkale — içerik ve doğrulama | C | 12.0a + 12.0b `main`'de |
| **12.9** | **Entegrasyon:** üç PR'ın birleşimi, dünya verisinin **tek seferde** üretimi, golden/bütçe/ölçüm, belgeler (§5) | tek oturum, **son** | A + B + C |

İstanbul **kapsam dışıdır**: batı ucu EPSG:32636'nın güvenli sınırının (~28,5°D) dışında kalır ve bina yoğunluğu çok yüksektir. Eskişehir, Tokat, Yozgat da bu fazda yoktur (sonraki genişleme).

## 1. Başlangıç noktası ve neden böyle bölündü

- `main` = Sinop–Sakarya dahil (9 hedef il, 4699 × 2346 örnek, 50 karo, 915 yerleşim). Ölçülen sınırlar: ilk yükleme tahmini 17,2/20 sn, en kötü 281/300 draw call, JS yığını ~490 MB, veri 44,4/55 MB.
- Üç grup dünyayı kabaca **2–2,5 katına** çıkarır (tahmin; ölçülmedi). ROADMAP zaten "Ankara için karo akışı önce gerekir" der. Bu yüzden 12.0a önce gelir.
- **Dünya verisi bölünemez.** `world.json`, `features.json`, `settlements.json`, `provinces.geojson` tek parça dosyalardır; kafes `extent`'i, karolar ve `elevation.max` küreseldir (en yüksek nokta artarsa tüm karolar yeniden nicemlenir); yol omurgası (`roadNetwork.ts`: merkezler arası en küçük kapsayan ağaç) ve yerleşim düzeni sırası (ilçe → il → köy, `FootprintRegistry` tüm yerleşimler arası) **tüm dünyaya bağlıdır**. Bu yüzden:
  - bir oturumun kendi dünyasında ölçtüğü sonuç, birleşik dünyanın sonucu **değildir** (yalnızca sorunları erken bulmak içindir);
  - **hiçbir oturum `public/data/**` commit etmez**; yalnızca 12.9 üretir ve commit eder.
- Önceki genişlemelerde çakışan yerler (12.0b bunları ortadan kaldırır): `world.yaml`/`settlements.yaml`'daki tek satırlık `provinces` listeleri ve `bbox`, 6 testteki il listeleri (`pilotPlaces`, `provinceNotice`, `provinceNoticeRegion`, `region`, `settlementMap`, `worldData`), `config.ts` `OTHER_PROVINCE_PLACES`/`BANDITS.campCount`, `scripts/buildBudget.ts` sınırları, `PINNED_WINDOWS`.
- Gruplar farklı yönlere uzanır (batı / doğu / güney), bu yüzden yeni kafes parçaları örtüşmez (yalnızca köşe karoları ortaktır; 12.9 çözer).
- `tools/raw/` commit edilmez ve oturum kapanınca silinir: **her oturum kendi ham verisini indirir**, 12.9 hepsini bir kez daha indirir (bkz. §6 risk 6).

## 2. Paralel çalışma kuralları

### 2.1 Branch ve PR
- 12.0a ve 12.0b `main`'e birleşmeden **A, B, C başlamaz** (bekleyen oturum yalnızca bu belgeyi ve ilgili kodu okur). 12.0a ile 12.0b birbirinden bağımsızdır, paralel yürüyebilir.
- Her akış güncel `main`'den kendi branch'ini açar (oturum bir branch dayatıyorsa o). Akış = bir PR. Conventional Commits; bir alt adım = bir commit.
- Her PR'dan önce `npm run check` ve `python -m pytest tools/tests -q` hatasız. Not: A/B/C'nin kendi yerel dünyası `public/data/**`'ı değiştirir; **o değişiklikler PR'a girmez** (`git checkout -- public/data` ya da `git add` ile elle seçerek). `npm run check`'in veri testleri yerel dünyaya göre geçmelidir, ama PR'daki hâliyle (commit'li eski veriyle) de geçmelidir (testler il listesini veriden okur, §3.2).
- Birleşmeden önce güncel `main` branch'e **merge** edilir (rebase/force-push yok); çakışmada iki tarafın eklemeleri de tutulur.

### 2.2 Dosya sahipliği

| Alan | Sahibi | Diğerleri |
|---|---|---|
| Karo akışı: `src/data/world.ts`, `world/RegionWorld.ts`, `world/ChunkManager.ts`, `core/Game.ts` yükleme akışı, `scripts/` bütçe/derleme denetimi | **12.0a** | dokunma |
| Yerleşim/yol hesaplarının veri hattına alınması: `settlements/SettlementMap.ts`, `tools/build_settlements.py` çıktı biçimi | **12.0a** | dokunma |
| `tools/world.yaml`, `tools/settlements.yaml` yapısı, `tools/groups/*.yaml` biçimi, `fetch_*.py` bayrakları, `build_world.py`/`build_settlements.py` yaml okuması | **12.0b** (biçim), sonra her grup **yalnızca kendi** `tools/groups/<grup>.yaml` dosyası | dokunma |
| `src/config.ts` `OTHER_PROVINCE_PLACES`, `BANDITS.campCount` | 12.0b yer adlarını `src/config/places/<grup>.ts` dosyalarına taşır; her grup **yalnızca kendi** dosyası | dokunma |
| `tests/` il listesi içeren testler | **12.0b** (veriden okur hâle getirir) | A/B/C dokunmaz; grup ek testleri `tests/<grup>*.test.ts` |
| Ortak algoritma düzeltmesi (örn. `townNetwork.ts`, `layout.ts`, `roadNetwork.ts`, `roadRouting.ts`) | **kim bulursa, ayrı küçük PR** (`fix(settlements): …`), hemen `main`'e; diğerleri `main`'i merge eder | grup PR'ına karıştırma |
| `public/data/**` | **yalnızca 12.9** | A/B/C **asla** |
| `scripts/buildBudget.ts` sınırları, `tests/buildReport.test.ts`, `tests/scalePerf.test.ts`, `latticeGolden`, `provinceBaseline` sayıları | **12.9** | dokunma |
| `docs/faz-12-<grup>-rapor.md` | ilgili grup | — |
| `CLAUDE.md` "Mevcut Durum", `ROADMAP.md`, `README.md`, `docs/faz-8-elle-dogrulama.md` | **12.9** | akışlar PR açıklamasına önerilen paragrafı yazar |

Bu sınırın dışına dokunman gerekirse önce kullanıcıya sor.

## 3. Aşama 0 — Önce birleşenler

### 3.1 12.0a — Karo akışı (kendi planını sunar)

Bu iş büyük bir mimari değişikliktir ve bu belge ayrıntısını **vermez**: oturumun ilk işi **kısa bir tasarım planı** yazıp kullanıcıdan onay almaktır. Plan en az şunları yanıtlamalıdır:
- Hangi karolar, hangi mesafede yüklenir/boşaltılır; bellek tavanı ve hedef (≥ 2,5× dünya için JS yığını, ilk yükleme ≤ 10 sn hedefine dönüş).
- Açılışta bütün dünya üzerinde çalışan hesaplar (ROADMAP: yerleşim düzeni ~4–5 sn, Ankara tek başına ~15 sn tahmini; `SettlementMap`, yol ağı, yumuşatma, zemin düzeltme, dere yatakları, su ayıklama) **veri hattında önceden hesaplanıp karo başına dosyalara** mı konacak, yoksa karo yüklenince yerelde mi hesaplanacak. Bu karar 12.9'daki veri üretimini ve A/B/C'nin yerel doğrulamasını etkiler.
- Karo başına `features`/`settlements` dosyaları (`features.json` 2,55 MB, sınır 3,5 MB; ROADMAP "Karo başına özellik dosyaları").
- Nesne/canlı kimlikleri (mutlak kafes anahtarları) ve **kayıt uyumluluğu** (v8 kayıtlar yüklenmeye devam eder).
- Yürüme/yerleşim testlerinin (`tests/helpers/walker.ts`, `settlementMap`) akışlı dünyada nasıl çalışacağı.
- Kabul: gerçek dünyada mevcut davranış korunur (golden'lar aynı), draw call ve bellek ölçümü, `npm run check` yeşil.

**Yedek karar:** kullanıcı karo akışını ertelemeyi seçerse 12.0a yapılmaz; yerine bütçeler bilinçli yükseltilir (12.9'da), ama bu belgede önerilmez (yükleme 40 sn üstü, ~1 GB bellek riski).

### 3.2 12.0b — Veri iskelesi (sözleşme)

1. **İl listeleri veriden okunur.** Altı testteki sabit il dizileri kalkar; beklenen il kümesi `world.json`/`provinces.geojson` (`inRegion=true`) ve `tools/groups/*.yaml`'dan türetilir; testler "her hedef ilin ... olduğunu" **döngüyle** doğrular. Sonuç: yeni il eklemek test dosyalarını değiştirmez. Tek tek il adı gerektiren testler (örn. "Sakarya'ya hoş geldiniz") ilgili grubun dosyasına taşınır.
2. **Grup yaml parçaları** `tools/groups/<grup>.yaml` (grup adları: `bati`, `dogu`, `guney`, ve mevcut illeri tutan `cekirdek`):
   ```yaml
   provinces: [Kocaeli, Bilecik]        # geoBoundaries shapeName, Türkçe karakterlerle
   styles: { Gebze: sanayi }            # settlements.yaml `styles`
   display_names: {}
   landmarks: []                         # settlements.yaml `landmarks` biçimi (kind, name, x/z ya da lat/lon, s)
   ```
   `build_world.py`, `build_settlements.py`, `fetch_*.py` bu parçaları **birleştirir** (`world.yaml` ve `settlements.yaml` yalnızca ortak ayarları taşır: `neighbors`, `cell_size`, `margin_m`, `village_fraction`, `radius_m` …). `bbox` hedef illerin birleşiminden `margin_m` payla **türetilir** (elle `bbox` yazılmaz; üst sınır kutusu `world.yaml`'da kalır ve türetilen kutu içinde olduğu doğrulanır).
3. **Yer adları** `src/config/places/<grup>.ts` (`cekirdek.ts` mevcut `PILOT.places` dışındaki tüm illeri alır); `config.ts` bunları birleştirip `OTHER_PROVINCE_PLACES`'i kurar. Kurallar eskisi gibi (`tests/pilotPlaces`: her yer kendi ilinde, karada, yürünebilir, ≤ 60 oyun m'de tatlı su; il başına ≤ 10).
4. **`fetch_*.py --groups bati,dogu`** (varsayılan hepsi): yalnızca verilen grupların bbox'ı için indirir; ham dosya zaten varsa atlanır. Kendi yerel dünyasını kuran oturumun taban + kendi grubunu indirmesi için. Mevcut `cekirdek` verisi de `--groups cekirdek` ile indirilebilir.
5. **`BANDITS.campCount`** il sayısına göre türetilir (`illerin kara alanı × yoğunluk`; şimdiki 96 aynı çıkmalı) ya da grup başına bir katkı alanı olur; sabit sayı elle değiştirilmez.
6. **`PINNED_WINDOWS`** biçimi değişmez; 12.9 yeni pencereyi ekler. 12.0b yalnızca testinin (`tools/tests/test_build_world.py`) il listesini verilerden okuması için gereken değişiklikleri yapar.
7. Kabul: mevcut dünya verisi **bayt bayt aynı** yeniden üretilir (`build_world.py` + `build_settlements.py` çıktıları `git diff` boş; `built` tarihi hariç), `npm run check` ve `pytest` yeşil, bir "boş" il grubu (`provinces: []`) eklenebilir ve hiçbir test kırılmaz.

## 4. Aşama 1 — Üç paralel oturum (A, B, C)

### 4.1 Ortak iş akışı (her grup)
1. Güncel `main`'den branch aç; `tools/groups/<grup>.yaml`'a **yalnızca kendi illerini** yaz.
2. Yerel dünyayı kur (commit edilmeyecek): `cd tools && python fetch_dem.py … --groups cekirdek,<grup>` (ve `fetch_boundaries`, `fetch_water`, `fetch_landcover`, `fetch_settlements`), `python build_world.py`, `python build_settlements.py`, `python qa_world.py`. Ham veri indirmeleri uzundur (settlements ~15 dk); arka planda çalıştır.
3. **Doğrula ve düzelt** (tüm iller için):
   - `qa_world.py`: kapsama, dikiş sürekliliği, örtü dağılımı; il sınırı komşu şeritleri.
   - Yerleşimler: il/ilçe/köy sayıları, bina yoğunluğu; **bina hücresi olmayan ilçeler** (Sinop'ta Türkeli gibi) ve **cami sığmayan** kıyı/sıkışık ilçeler listelenir; testteki istisna listeleri (`settlementMap.test.ts`) grup dosyasında/testte **kendi bölümüne** eklenir.
   - Yol ağı: tek bileşen, kopuk sokak öbekleri, köprü/dere çakışmaları (`overlapAudit`), tünel sayısı. Çıkan algoritma hataları **ayrı küçük PR** (§2.2).
   - Başsız ölçüm: en kötü draw call konumları (`TELEPORTS`/yer adı noktalarından 13 konum × 8 yön, `npm run perf` / `tests/scalePerf`), gerçek GPU'da değil.
4. **Yer adları** `src/config/places/<grup>.ts`: il başına ≤ 10 yer (ilçe merkezleri ve belirgin yerler, gerçek enlem/boylam, her biri kendi ilinde ve yürünebilir). `tests/pilotPlaces` ile doğrula.
5. **Simge yapılar** `tools/groups/<grup>.yaml` `landmarks` altında (Overture Places konumları; yalnızca konumundan emin olunanlar; `LANDMARK_KINDS`). Tarihî kentlere `osmanli` stili.
6. **Ekoloji/denge turu** (`PROVINCE_ONLY=<il> PROVINCE_REPORT=1`, `tests/provinceBaseline`, `provinceEcology`): su ≤ 1 dk yürüyüş, yüksek rakımda gece soğuğu, orman/yiyecek yoğunluğu; ayar yapılmaz, bulgular rapora yazılır (Faz 8 geleneği).
7. **Çıktı:** PR (yalnızca kaynak/test/yaml/rapor; **`public/data/**` yok**) + `docs/faz-12-<grup>-rapor.md` (ölçüm tablosu, bulunan sorunlar, kalan riskler, yerel dünyanın `world.json` `extent`/`elevation.max` değerleri) + PR açıklamasında elle denenecek maddeler ve CLAUDE.md/ROADMAP için önerilen paragraf.

### 4.2 Grup A — Batı: Kocaeli, Bilecik
- Bölge: batıya uzanır (28,5°D sınırına dikkat; Kocaeli batıda İstanbul'a yaklaşır). Kıyı: İzmit Körfezi ve Karadeniz (Kandıra, Kefken). Sanayi ağırlıklı (Gebze, Dilovası, İzmit, Gölcük): `sanayi` stili ve **fabrika/liman** yoğunluğu; yerleşim yapı sayısı yüksek çıkabilir.
- Özel dikkat: Sakarya ile sınırdaki kıyı/sıkışık ilçeler, Sapanca–İzmit koridorunda yol ağı, körfez içi deniz hücreleri (DEM `.sea` işareti), Bilecik'in Söğüt/Osmaneli tarihî dokusu (`osmanli`).
- Simge yapı adayları: Bilecik Şeyh Edebali Türbesi, Söğüt Ertuğrul Gazi Türbesi, İzmit Saat Kulesi, Gebze Çoban Mustafa Paşa Külliyesi (konumları Places'ten doğrulanır).

### 4.3 Grup B — Doğu: Samsun, Çorum, Amasya
- Bölge: doğuya uzanır; EPSG:32636'nın doğu sınırı (36°D) içindedir. Samsun kıyı ve Bafra/Çarşamba deltası (geniş düz, tarım, sulak alan); Çorum/Amasya iç, daha kuru.
- Özel dikkat: delta ovasında **dere/akarsu yoğunluğu** ve su ayıklama (`waterThinning`), düz arazide yol rotası/köprü sayısı, Kızılırmak/Yeşilırmak büyük nehirleri, Amasya vadisi dikliği (kaya mezarları), Samsun merkezinin bina yoğunluğu (il alt/üst sınırı testleri).
- Simge yapı adayları: Amasya Yalıboyu Evleri/Kral Kaya Mezarları, Hazeranlar Konağı, Çorum Ulu Camii, Hattuşa çevresi, Samsun Bandırma Vapuru Müzesi, Bafra Ulu Camii (konumlar Places'ten doğrulanır).

### 4.4 Grup C — Güney: Ankara (önce kuzeyi), Kırıkkale
- Bölge: güneye uzanır; Ankara'nın tamamı 38,6°K'ye iner. **Önce kuzey kısmı** (Çankırı sınırından Ankara merkezine kadar, Kızılcahamam, Çubuk, Kalecik, Beypazarı, Nallıhan, Ayaş, Güdül); tam il kapsamı ayrı karar (yüksek bina yoğunluğu: Ankara merkez Overture bina sayısı bu hattın şimdiye kadarki en büyüğü olacak).
- Bu grup `tools/groups/guney.yaml`'da kapsamı **bir il sınırı kutusuyla sınırlandırma** gerektirebilir (`bbox_max` ya da il çokgenini ızgaraya kırpma); 12.0b iskelesinde bu alan öngörülür, kapsam 12.C'nin ilk kararıdır (kullanıcıya sorulur: yalnız kuzey şeridi mi, tüm il mi).
- Özel dikkat: Ankara merkezinin yerleşim düzeni süresi ve yapı sayısı (il alt sınırı/üst sınırı testleri), step/bozkır örtüsü (`landcover` dağılım testi %42 sınırı), yüksek rakımda gece soğuğu (> 900 m medyan), Kızılırmak/Sakarya/Ankara Çayı geçişleri, Kızılcahamam–Soğuksu ormanları, Beypazarı `osmanli` dokusu, AOÇ/Anıtkabir gibi büyük simgeler (`monument`, `mosque_grand`).
- Simge yapı adayları: Ankara Kalesi, Hacı Bayram Camii, Kocatepe Camii, Beypazarı Tarihî Dokusu, Kızılcahamam Soğuksu (konumlar Places'ten doğrulanır).

## 5. Aşama 2 — 12.9 Entegrasyon (tek oturum, son)

Girdi: A, B, C PR'ları `main`'de birleşmiştir (ya da entegrasyon oturumu onları sırayla birleştirir).
1. `tools/groups/*.yaml` birleşimi; türetilen bbox ve `extent`'in dört yönde büyümesi (`cx0/cy0` negatifleşir; kafes kimlikleri korunur, `chunkKeys.ts` aralığı yeter mi kontrol edilir).
2. **`PINNED_WINDOWS`'a mevcut dünyayı (4699 × 2346, bbox 29,80–35,55°D / 40,00–42,30°K) dördüncü pencere olarak ekle**: mevcut karolar bit-eşdeğer kalmalı (≤ 1 nicem, örtü birebir).
3. Tüm ham veriyi bir kez indir (`fetch_*`, ~25 dk), `build_world.py` → `build_settlements.py` → `qa_world.py`; `public/data/**` **tek commit**.
4. `elevation.max` değiştiyse tüm karolar yeniden nicemlenir: `SCATTER_GOLDEN`, `latticeGolden`, `provinceBaseline` sayıları yeniden kaydedilir ve farklar belgelenir (Faz 7.10 / Kastamonu geleneği: eşik nesneleri).
5. Yerleşim düzeni/yol ağı tüm dünyada yeniden hesaplanır → **bina kimlikleri kayabilir**; kayıttaki "aranmış yapı" listeleri başka yapıyı gösterebilir (önceden kabul edilmiş sınır); belgelenir.
6. `scripts/buildBudget.ts` sınırları ölçüme göre (12.0a sonrası **10 sn hedefi geri getirilir**, bkz. CLAUDE.md "Performans Bütçesi"); `tests/buildReport.test.ts`, `scalePerf`, `region` boyut testleri.
7. Başsız ölçüm: draw call (< 300, hedef ≤ 250), üçgen, JS yığını, açılış süresi; en kötü konumlar belgelenir.
8. `ROADMAP.md` "Genişleme" bölümü, `CLAUDE.md` "Mevcut Durum" (donma notu kaldırılır, yeni illerin paragrafı; A/B/C PR açıklamalarındaki önerilenler birleştirilir), `README.md` (il listesi, atıf), `docs/faz-8-elle-dogrulama.md` yeni bölüm, `docs/faz-12-olcumler.md`.
9. Kabul: `npm run check` ve `pytest` yeşil, `build:check` karolar bayt+sha doğru, bekleyen elle doğrulama listesi (gerçek GPU'da FPS/yükleme, her yeni ilde başlangıç/ışınlanma/yer adı, Ankara bozkırı gece soğuğu, Samsun deltası) yazılı.

## 6. Riskler

1. **Karo akışı beklenenden büyük çıkar** (en olası): 12.0a'nın tasarım planı bunu erken gösterir; gerekirse kapsam daraltılır (örn. önce yalnız A + B, C sonraya) — karar kullanıcının.
2. **Yerel ölçüm ≠ birleşik sonuç**: yol omurgası ve yerleşim düzeni küreseldir; A/B/C'nin bulgusu 12.9'da yeniden doğrulanır. Bu belgenin iş bölümünde 12.9 bunun için ayrı tutulmuştur.
3. **Ortak algoritma hataları** (Sinop–Sakarya'da `townNetwork.ts`'te çıktı): tek PR kuralı (§2.2); iki grup aynı hatayı bulursa ilk bulan düzeltir, diğeri `main`'i merge eder.
4. **Kafes anahtarı aralığı** (`CHUNK_KEY_BIAS` = 32768): yeni genişleme bu aralığın içinde kalır; 12.9 doğrular.
5. **`index.js` / veri bütçeleri**: her grubun kendi ölçümü raporunda; sınır yükseltmek yalnızca 12.9'da ve gerekçeyle.
6. **Ham veri tekrarı**: her oturum ve 12.9 ham veriyi bağımsız indirir (`tools/raw/` oturumlar arası paylaşılmaz). `--groups` bayrağı (12.0b) indirmeyi küçültür. Ağ/disk sorunu olursa `read_documentation` ile ortam notlarına bak.
7. **Overture sürümü**: tüm gruplar `overtureRelease: 2026-09-23.1`'i kullanır (tek sürüm); bir oturum sürümü değiştirmez.
8. **Ankara boyutu**: C grubunun ilk kararı kapsamdır (§4.4); tam il kapsamı ek bütçe/süre ister.

## 7. Oturum başlatma metinleri (kopyala-yapıştır)

**12.0a:** "`docs/faz-12-paralel-plan.md` §3.1 — 12.0a Karo akışı. Önce kısa tasarım planını sun ve onay al, sonra uygula."

**12.0b:** "`docs/faz-12-paralel-plan.md` §3.2 — 12.0b Veri iskelesi. Planı onaylanmıştır; uygula. Mevcut dünya verisi bayt bayt aynı kalmalı."

**12.A / 12.B / 12.C** (12.0a ve 12.0b `main`'e birleştikten sonra): "`docs/faz-12-paralel-plan.md` §4 — Grup <A: Batı | B: Doğu | C: Güney>. Planı onaylanmıştır; yalnızca kendi grubunun dosyalarına dokun, `public/data/**` commit etme."

**12.9** (A, B, C bitince): "`docs/faz-12-paralel-plan.md` §5 — Entegrasyon. A/B/C PR'larını birleştir, dünya verisini tek seferde üret, bütçeleri ve belgeleri güncelle."
