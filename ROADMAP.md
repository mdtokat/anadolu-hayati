# ROADMAP — Faz Planı

Her faz ayrı bir branch'te geliştirilir ve kabul kriterlerinin tamamı sağlandığında main'e birleştirilir. Kriterler işaretlenerek ilerleme takip edilir.

İlk bölge: **Zonguldak – Bartın – Karabük** (`zonguldak-bartin-karabuk`)
Yaklaşık sınır kutusu: enlem 40.8°–41.9° K, boylam 31.1°–33.4° D
Gerçek boyut ~195 × 120 km → oyunda (1:50) yaklaşık **3,9 × 2,4 km**

---

## Faz 0 — Kurulum
**Branch:** `faz-0-kurulum`
**Amaç:** Boş ama sağlam bir iskelet. Tarayıcıda açılan, GitHub Pages'te yayınlanan bir 3D sahne.

Görevler:
- [x] Vite + TypeScript (strict) projesi, CLAUDE.md'deki klasör yapısı
- [x] Three.js kurulumu; basit bir sahne (zemin düzlemi, ışık, gökyüzü rengi, dönen bir küp)
- [x] `src/config.ts` iskeleti (ölçek sabitleri dahil)
- [x] `core/` altında Game sınıfı ve sabit zaman adımlı oyun döngüsü
- [x] Geliştirme modunda FPS sayacı
- [x] ESLint + Prettier + Vitest kurulumu, en az bir örnek test
- [x] `.gitignore` (node_modules, dist, tools/raw, Python ortamları)
- [x] GitHub Actions: her push/PR'da lint + typecheck + test + build
- [x] GitHub Actions: main'e push'ta GitHub Pages'e yayın (vite `base` ayarı dahil)
- [x] README.md (proje tanımı, çalıştırma komutları, veri atıfları bölümü)

Kabul kriterleri:
- [x] `npm run dev` ile sahne açılıyor
- [x] Tüm kontrol komutları hatasız geçiyor
- [x] GitHub Pages linkinde sahne görünüyor

---

## Faz 1 — Oynanabilir Prototip
**Branch:** `faz-1-prototip`
**Amaç:** Düz bir dünyada iyi hissettiren karakter kontrolü.

Görevler:
- [x] Rapier fizik entegrasyonu (`physics/` sarmalayıcısı, WASM başlatma)
- [x] Input sistemi (klavye + fare, pointer lock)
- [x] Karakter kontrolcüsü: yürüme (WASD), koşma (Shift), zıplama (Space), eğim limiti
- [x] Birinci şahıs kamera; `V` ile üçüncü şahıs geçişi
- [x] Test ortamı: engebeli prosedürel zemin + birkaç engel
- [x] Basit HUD iskeleti (HTML overlay)
- [x] Duraklatma menüsü (Esc)

Kabul kriterleri:
- [ ] Karakter eğimlerde doğal hareket ediyor, dik yamaçlara tırmanamıyor _(otomatik testler geçiyor: 40°'ye kadar tırmanır, 50°+ engel; "doğal his" masaüstünde elle onaylanacak)_
- [ ] 60 FPS korunuyor _(gerçek GPU'lu masaüstünde elle ölçülecek)_
- [x] Input ve karakter hız hesapları için birim testler var

---

## Faz 2 — Gerçek Arazi
**Branch:** `faz-2-gercek-arazi`
**Amaç:** Üç ilin gerçek yükseklik verisiyle yürünebilir arazisi.

Veri hattı (`tools/`):
- [x] `requirements.txt` ve kurulum talimatı
- [x] `fetch_dem.py`: Copernicus GLO-30 karolarını indirir (bu bölge için N40–N41 × E031–E033, 6 karo)
- [x] `fetch_boundaries.py`: geoBoundaries TUR ADM1 indirir, üç ili süzer
- [x] `build_region.py`: karoları birleştirir → EPSG:32636'ya dönüştürür → 100 m ızgaraya örnekler → denizi 0'a kırpar → `heightmap.bin` + `meta.json` + `provinces.geojson` üretir
- [x] Bölge tanımları bir config dosyasında (`tools/regions.yaml`: id, il listesi, sınır kutusu)

Oyun tarafı:
- [x] `data/` altında bölge yükleyici (meta + heightmap)
- [x] Chunk sistemi: arazi 128×128 hücrelik parçalara bölünür, oyuncuya yakın olanlar yüklenir
- [x] Basit LOD (uzak chunk'lar daha düşük çözünürlükte)
- [x] Rapier heightfield collider'ları (sadece yakın chunk'lar)
- [x] Rakım ve eğime göre doku karışımı (kum, çim, orman zemini, kaya)
- [x] Deniz düzlemi (Karadeniz) ve basit su shader'ı
- [x] İl sınırlarının yerde ince çizgi olarak gösterimi (açılıp kapanabilir)
- [x] HUD: bulunulan il adı ve gerçek rakım (m)
- [x] Geliştirici kısayolu: harita üzerinde belirli bir noktaya ışınlanma (örn. Zonguldak merkez, Safranbolu, Amasra)

Kabul kriterleri:
- [x] Oyuncu üç il boyunca kesintisiz yürüyebiliyor _(otomatik: gerçek heightmap + Rapier ile Zonguldak → Amasra (Bartın) → Safranbolu (Karabük) rotaları fizikle yürünüyor)_
- [ ] Amasra kıyısı, Filyos vadisi ve Yenice ormanları bölgesi tanınabilir biçimde görünüyor _(Amasra kıyısı ve Yenice dağları ekran görüntülerinde tanınabilir; Filyos vadisi ayrıca elle incelenmeli; orman örtüsü yalnızca rakıma bağlı bir renk tonu, orman poligonları Faz 4'te OSM ile gelecek — görsel onay bekliyor)_
- [x] Koordinat dönüşümü (gerçek ↔ oyun) için birim testler var
- [x] Heightmap okuma ve chunk indeksleme için birim testler var
- [ ] 60 FPS hedefi korunuyor _(gerçek GPU'lu masaüstünde elle ölçülecek; en kötü durumda 95 draw call, ~411 bin üçgen)_

---

## Faz 3 — Hayatta Kalma Çekirdeği
**Branch:** `faz-3-hayatta-kalma`
**Amaç:** Oyunu oyun yapan temel baskı mekanikleri.

Görevler:
- [x] `survival/` altında saf mantık: sağlık, açlık, susuzluk, yorgunluk
- [x] Gece-gündüz döngüsü (ayarlanabilir gün uzunluğu), güneş/ay ışığı, gökyüzü renk geçişleri
- [x] Sıcaklık modeli: saat + rakım (+ ileride mevsim) → vücut ısısına etki _(mevsim sinüsü de var; başlangıç günü sabit)_
- [x] Tatlı su kaynağından (nehir, göl) su içme _(veri: Overture `base/water` → `features.json`; içmek için `E` basılı tut)_
- [x] Ölüm ve yeniden doğma (bölge içinde rastgele güvenli nokta)
- [x] HUD göstergeleri

Kabul kriterleri:
- [x] Hiçbir şey yapmayan oyuncu makul sürede (ayarlanabilir) ölüyor _(varsayılan ~20 dk, susuzluktan; `SURVIVAL.hydrationEmptyMinutes`)_
- [x] Yüksek rakımda gece belirgin biçimde daha tehlikeli _(simülasyon: 500 m'de bir gece can ~98, 1000 m ~39, ≥1500 m ölümcül)_
- [x] Tüm istatistik hesapları için birim testler var

---

## Faz 4 — Toplama ve Üretim
**Branch:** `faz-4-toplama-uretim` _(alt görevler ayrı branch/PR'larla `main`'e girer; 4.3 ve 4.4 paralel yürütülür: bkz. [docs/faz-4-paralel-plan.md](docs/faz-4-paralel-plan.md))_
**Amaç:** Dünyayla etkileşim ve ilerleme hissi.

Görevler (numaralar alt görev sırasıdır):
- [x] **4.1** Veri hattı: orman/yerleşim arazi örtüsü → `landcover.bin` _(OSM Overpass bu ortamdan erişilemediğinden kaynak Overture `base/land_cover` = ESA WorldCover 2021; "yerleşim" = `urban` sınıfı)_
- [x] **4.2** Zemin renklendirmesi arazi örtüsü sınıfına göre (orman, çalı, çayır, tarım, çıplak, yerleşim…)
- [x] **4.3** Arazi örtüsüne göre seed'li ağaç yerleştirme (instanced mesh) _(`world/scatter.ts`, `PropLayer`; chunk başına deterministik, LRU önbellekli, iki geometri kademeli)_
- [x] **4.3** Kaya, çalı, yenebilir bitki yerleştirme (sınıfa/rakıma göre) _(böğürtlen, fındık, kestane, mantar, yerde dal/taş; toplama etkileşimi 4.6'da)_
- [x] **4.4** Eşya tanımları ve envanter sistemi (ağırlık/slot limiti; saf mantık) + yemek yeme _(`src/items/`: `itemDefs`, `Inventory`, `consume`; `SurvivalSystem.consume` + `player:ate`; oyuna ve arayüze bağlama 4.6–4.7'de)_
- [x] **4.5** Crafting mantığı: taş balta, ateş, basit barınak, su kabı tarifleri _(`src/items/recipes.ts`, `craft.ts`; ateş ve barınak `campfire`/`lean_to` eşyası olarak üretilir, yerleştirme 4.8'de; arayüz 4.7'de)_
- [x] **4.6** Toplama etkileşimi (bakılan nesneye `E`) _(`interaction/`: odak seçimi, `GatherSystem`, verim tablosu; `E` basılı tutma, atomik envanter ekleme, `item:collected`; balta ile ağaç kesme)_
- [x] **4.7** Envanter ve üretim arayüzü _(`I`/`Tab` paneli: slot ızgarası, taşıma, "Ye", tarif listesi ve "Üret"; `F` hızlı yemek; panel açıkken oyun donar)_
- [x] **4.8** Yerleştirme: ateş ve barınak kurma _(`placement/`: `PlacementController`, `StructureSet`, yerleştirme kuralları, ateş yakıtı ve `FireTender`; `world/StructureLayer`: alev, `PointLight` havuzu, hayalet; `C`/`G` hayalet (ateş/sundurma), sol tık kur, `E` ile ateşe dal/kütük; ısı ve uyku etkileri 4.9'da, envanter paneli 4.7'de)_
- [x] **4.9** Ateşin sıcaklık etkisi, barınağın uyku/yorgunluk etkisi _(`placement/exposure.ts`: ayak konumundaki ateş ısısı (`warmthC`, doğrusal düşen, en çok +6 °C) ve sundurma altı (`sheltered`); `SurvivalContext` ve `stepVitals` bunları kullanır: ateş vücut ısısı dengesini yükseltir (ama normal ısıyı aşırtmaz), barınak soğuk etkisini ×0,55'e indirir, dinlenirken enerji ×2,5 ve can ×1,5 daha hızlı dolar; HUD'da "Ateş başında · Barınakta"; açık uyku mekaniği yok, dinlenme = hareketsizlik; sabitler `SHELTER_EFFECTS`)_
- [x] **4.10** Kapanış: ROADMAP, `CLAUDE.md` "Mevcut Durum", README _(Faz 4 kabul kriterleri, bilinen sorunlar, klasör yapısı, kontroller)_

Kabul kriterleri:
- [x] Ormanlar gerçek orman alanlarıyla örtüşüyor _(arazi örtüsü sınıflarına göre: `tests/scatterRegion.test.ts`, uygun orman bloklarının ≥ %90'ında ağaç var; ağaç yalnızca orman/çalı ve tarımda fındık sınıfına düşer; görsel tanınırlık elle doğrulanmalı)_
- [ ] Oyuncu sıfırdan ateş ve barınak kurabiliyor _(zincir kodda tamam ve birim testli: topla → üret → `C`/`G` ile kur → ateşe yakıt at; oyunda elle doğrulanmadı, ısı ve barınak etkisi 4.9'da eklendi)_
- [x] Envanter ve crafting mantığı için birim testler var _(`inventory`, `itemDefs`, `consume`, `eatItem`, `recipes`, `craft`, `inventoryView` testleri)_

---

## Faz 5 — Canlılar
**Branch:** `faz-5-canlilar` _(alt görevler ayrı branch/PR'larla `main`'e girer; iki hesapta paralel yürütülür: bkz. [docs/faz-5-paralel-plan.md](docs/faz-5-paralel-plan.md))_
**Amaç:** Dünyayı yaşayan, tehlikeli ve beslenilebilir yap: hayvanlar, av, pişirme, hasar.

Görevler (numaralar alt görev sırasıdır; **Hesap A = Beyin**, **Hesap B = Beden ve oyuncu**):
- [x] **5.0** İskele: sözleşme tipleri (`creatures/kinds.ts`), olaylar, config blokları, yeni eşya kimlikleri, boş `CreatureSystem`/`CombatSystem` ve `Game` bağlantıları, yer tutucu çizim
- [x] **5.1** _(A)_ Bölgeye özgü hayvanlar: tür tablosu (boz ayı, kurt, yaban domuzu, karaca), kimlikler, `CREATURES` config
- [x] **5.2** _(A)_ Basit durum makinesi yapay zekâsı (dolaşma, otlama, fark etme, kaçma, sinsi yaklaşma, kovalama, saldırma); algı (görüş, duyma, ateş)
- [x] **5.3** _(A)_ Biyoma (arazi örtüsü + rakım + eğim) ve gece/gündüze göre doğma kuralları, deterministik yerleşim, akış
- [x] **5.4** _(A)_ `CreatureSystem`: araziye oturmuş hareket, takılma çözümü, AI LOD, hasar alma ve leş
- [x] **5.5** _(A)_ Ölçüm ve ayar: araziye takılmama simülasyonu, CPU bütçesi, doğma yoğunluğu
- [x] **5.6** _(B)_ Hasar ve savunma: `applyDamage`, ölüm nedeni "hayvan saldırısı", savunma, dokunulmazlık süresi
- [x] **5.7** _(B)_ Oyuncu saldırısı: silahlar (yumruk, taş balta, taş mızrak), isabet testi, bekleme/enerji, sol tık
- [x] **5.8** _(B)_ Eşya/tarif/yük: çiğ ve pişmiş et, deri, kemik, taş mızrak, deri yelek; yük tablosu
- [x] **5.9** _(B)_ Avlanma ve et pişirme: leş kesme (`E` basılı), ateşte pişirme, `E` öncelik sırası
- [x] **5.10** _(B)_ Canlı görseli: `CreatureLayer` (parçalı instanced model, yürüme/saldırı/ölü animasyonu), dev demosu
- [x] **5.11** _(B)_ Arayüz: hasar tepkisi, vuruş işareti, ipuçları, ölüm ekranı, kontroller
- [x] **5.12** Birleştirme: gerçek canlılarla av zinciri, denge, birleşik performans ölçümü (Faz 4 sonrası taban ölçüm dahil)
- [x] **5.13** Kapanış: ROADMAP, `CLAUDE.md` "Mevcut Durum", README

Kabul kriterleri:
- [x] Hayvanlar araziye takılmadan hareket ediyor _(5.5: gerçek bölgede simülasyon testi: `tests/creatureRegion.test.ts`)_
- [x] Görüş mesafesindeki hayvan sayısı performansı düşürmüyor _(5.12: 40 canlıyla en kötü +2 draw call, +9,3 bin üçgen (bütçe ≤ +20 / ≤ +60 bin); gerçek FPS elle GPU'lu masaüstünde doğrulanacak)_
- [x] Yapay zekâ durum geçişleri için birim testler var _(5.2: `tests/ai.test.ts`, tablodaki her geçiş)_
- [x] Oyuncu hayvan avlayıp eti pişirip yiyebiliyor ve hayvan saldırısıyla ölebiliyor _(5.12: `tests/integrationHunt.test.ts` gerçek bölgede uçtan uca; oyunda elle his/denge doğrulaması bekliyor)_

---

## Faz 6 — Kayıt ve Cilalama
**Branch:** `faz-6-kayit` _(oturumda dayatılan dal adıyla geliştirildi; alt görevler PR'larla `main`'e girdi)_
**Amaç:** Oyunu kalıcı ve eksiksiz hissettir: kaydet/yükle, menüler, ayarlar, krediler, il geçişi bildirimi ve ortam sesleri.

Görevler:
- [x] **6.1** Kayıt formatı: sürümlü `SaveGame` v1 şeması, doğrulama (`parseSave`), sürüm göçü (`MIGRATIONS`), `SaveError`
- [x] **6.2** Durum yakalama/yükleme: oyuncu, hayatta kalma ve saat, envanter, yapılar, tükenen nesneler, canlı bekleme listesi (`captureSave`/`applySave`, `Game.createSave/loadSave`)
- [x] **6.3** Kaydet / yükle: IndexedDB (`SaveStore`), otomatik + 5 elle yuva, otomatik kayıt (120 sn ve sekme gizlenirken)
- [x] **6.4** Ayarlar: grafik kalitesi (düşük/orta/yüksek), fare hassasiyeti, ses seviyesi (`SettingsStore`, `localStorage`)
- [x] **6.5** Ana menü ve duraklatma menüsü: Devam / Yeni Oyun / Yükle / Kaydet / Ayarlar / Ana Menüye Dön, yuva seçici
- [x] **6.6** Krediler ekranı (veri atıfları, yazılım lisansları; README ile tutarlılık testli)
- [x] **6.7** İl sınırı geçişlerinde bildirim ("Bartın'a hoş geldiniz")
- [x] **6.8** Ortam sesleri: rüzgâr, deniz, orman (yaprak, kuş), gece (cırcır, baykuş); Web Audio ile kodla sentezlenir
- [x] **6.9** Kapanış: ROADMAP, `CLAUDE.md` "Mevcut Durum", README

Kabul kriterleri:
- [x] Kaydedilip yüklenen oyun birebir aynı durumda açılıyor _(`tests/gameState.test.ts`, `tests/newGame.test.ts`: kaydet → yükle → yeniden kaydet birebir eşit, JSON gidiş-dönüşü dahil; gerçek bölgede başsız tarayıcıda yenileme sonrası da doğrulandı. "Birebir" kalıcı durum içindir: canlılar ve leşler kayda girmez, yükleme onları temizler ve akış yeniden doğurur; bilinçli)_
- [x] Kayıt formatı sürümlü (ileriki fazlarda geriye uyumluluk için) _(`SAVE_FORMAT_VERSION` + `MIGRATIONS` zinciri; eski sürüm adım adım yükseltilir, daha yeni sürüm anlaşılır hatayla reddedilir: `tests/saveGame.test.ts`)_

Elle doğrulanacak (bu ortamda gerçek GPU ve ses çıkışı yok):
- [ ] Ortam seslerinin gerçek hoparlörde dinlenmesi: doğallık (rüzgâr, deniz, kuş, baykuş) ve katmanlar arası denge (`AMBIENT`, `audio/ambientGraph.ts` içindeki `MIX`)
- [ ] Kalite ön ayarlarının (Düşük/Orta/Yüksek) gerçek GPU'lu masaüstünde FPS etkisi ve görsel kabul edilebilirliği (`QUALITY_PRESETS`)
- [ ] Menü ve yuva akışının gerçek fare kilidiyle Chrome/Firefox/Edge'de denenmesi (Esc → menü → Kaydet/Yükle → devam)

---

## Faz 7 — Genişleme: Düzce – Bolu (Batı Karadeniz)
**Branch:** `faz-7-0-iskele`, `faz-7-a-veri`, `faz-7-b-calisma`, `faz-7-entegrasyon` _(iki hesapta paralel yürütülür: bkz. [docs/faz-7-paralel-plan.md](docs/faz-7-paralel-plan.md))_
**Amaç:** Haritayı batıya ve güneye büyüt: Düzce ve Bolu (Abant, Yedigöller) tam kapsansın, Zonguldak–Bartın–Karabük ile aralarında kesinti olmadan yürünsün. Mimari: **tek koordinat sistemi + diskte 512×512'lik karolar + açılışta belleğe birleştirme** (akış Faz 7 dışı); EPSG:32636 sabit.

Görevler (numaralar alt görev sırasıdır; **Hesap A = Veri ve karolar**, **Hesap B = Çalışma zamanı ve oyun**):
- [x] **7.0** İskele: sözleşme sabitleri (`WORLD`), `RegionMeta.gridOrigin`, mutlak kimlik fonksiyonları (`world/chunkKeys.ts`), kafes matematiği (`world/lattice.ts`), manifest tipleri (`data/worldTypes.ts`) _(testli: `tests/chunkKeys`, `lattice`, `region`)_
- [x] **7.1** _(A)_ Karo biçimi ve yükleyici: `world.json` manifesti, `loadWorld`, `tools/worldlib.py`
- [x] **7.2** _(A)_ Eski bölgeyi karola (bit-eşdeğer, golden test) — B için kritik bağımlılık
- [x] **7.3** _(A)_ Hattı kafes/karo düzenine taşı (`world.yaml`, `build_world.py`, dünya-geneli nicemleme)
- [x] **7.4** _(A)_ Düzce–Bolu verisini üret + kalite denetimi (sınır sürekliliği, göller, il kapsamı)
- [x] **7.5** _(B)_ Izgara çapası ve mutlak kimlikler (merkezli-orijin varsayımı kalkar; nesne/canlı yerleşimi birebir korunur) _(testli: `tests/latticeGolden` (eski bölge scatter/doğma golden + geniş dünyada değişmezlik), `latticeGrid` (asimetrik ızgara, negatif chunk, `seedFrom` kilidi))_
- [x] **7.6** _(B)_ Dünyayı manifestten yükle; gerçek-bölge testlerini yeni yükleyiciye taşı _(`Game` → `loadWorld(WORLD.id)`; `tests/helpers/realRegion` `loadRealWorld` (modül önbellekli), `loadRealRegion` takma ad — gerçek veriyi yükleyen 26 test dosyası düzenlenmeden geçti; başsızda yeni oyun, yürüme, kaydet/yükle ve v1 kayıt yükleme denendi)_
- [x] **7.7** _(B)_ Kayıt v2 ve göç (Faz 6 kayıtları yeni dünyada yüklenir, kimlikler aynı nesneyi gösterir) _(testli: `tests/saveMigration` — Faz 6 koduyla üretilmiş gerçek v1 kayıt `tests/fixtures/save-v1.json`; başsız tarayıcıda v1 kayıt gerçek Faz 7 dünyasında yüklendi, kesilen ağaç gizli)_
- [x] **7.8** _(B)_ Performans ve bellek (288 chunk, su meshi; draw call < 300) _(gerçek dünyada başsız ölçüm: en kötü 176 draw call (Köroğlu) / ~538 bin üçgen; CPU açılış hazırlığı ~0,6 sn + karo birleştirme ~0,1 sn; bellek dizileri ≈ 79 MB; azaltma gerekmedi — [docs/faz-7-b-olcumler.md](docs/faz-7-b-olcumler.md), `tests/scalePerf`. Gerçek FPS elle GPU'lu masaüstünde)_
- [x] **7.9** _(B)_ İçerik: Düzce–Bolu ışınlanma noktaları, kesintisiz yürüme, ekoloji/denge ölçümü _(testli: `tests/duzceBolu` — 10 ışınlanma noktası (1–9, 0) doğru ilde, Abant/Yedigöller kıyısında içilebilir su, dikişte sıçrama yok, Zonguldak → Düzce ve → Bolu fizikli yürüyüş; `creatureDensity` Düzce–Bolu ormanı (yoğunluk eski bölgeye benzer, `CREATURES` ayarlanmadı); eğim: dünya karasının %95,4'ü ≤ 60°; gerçek-veri test beklentileri güncellendi)_
- [x] **7.10** Birleştirme: eski bölge verisi/yükleyici temizliği, uçtan uca doğrulama, birleşik performans tablosu _(kalktı: `public/data/regions/`, `loadRegion`, `tools/build_region.py`, `regions.yaml`, `tile_legacy.py`, `--verify-legacy`, `compare_with_legacy`, `worldLegacyGolden` testi; ortak yardımcılar `build_world.py`'ye taşındı, `fetch_*` yalnızca `world.yaml` okur. Faz 6 alanına bağlı testler `loadLegacyRegion()` ile dünyanın (0, 0) penceresini kullanır; `latticeGolden` nesne özetleri bu pencereden yeniden kaydedildi (2 nesne farkı, ≤ 1 nicem). Başsız uçtan uca (Chromium, yazılımsal WebGL): açılışta eski veri istenmiyor, Faz 6 v1 kaydı yüklenip v2'ye çevrildi, Zonguldak → Düzce ışınlanıp "Düzce'ye hoş geldiniz" göründü, konsol/ağ hatası yok; birleşik performans tablosu [docs/faz-7-b-olcumler.md](docs/faz-7-b-olcumler.md) başında)_
- [x] **7.11** Kapanış: ROADMAP, `CLAUDE.md` "Mevcut Durum", README, plan belgesine "tamamlandı" notu

Kabul kriterleri:
- [x] Oyuncu Zonguldak'tan Düzce'ye ve Bolu'ya kesintisiz yürüyebiliyor (karo/eski-yeni alan sınırında boşluk, sıçrama, takılma yok) _(otomatik: `tests/duzceBolu` fizikli yürüyüş + dikişte sıçrama yok; gerçek fareyle yürüme hissi elle)_
- [x] Düzce ve Bolu gerçek il sınırlarıyla var; "Düzce'ye hoş geldiniz" bildirimi çıkıyor; Abant Gölü ve Yedigöller'de göl var ve içilebiliyor _(`tests/duzceBolu`, `provinceNoticeRegion`; bildirim başsız tarayıcıda 7.10'da görüldü)_
- [x] Heightmap karo dosyalarına bölünmüş (her dosya ≤ 1 MB); eski alan karolardan bit-eşdeğer yüklenir (7.2), yeni alanla ≤ 1 nicem içinde (7.4) _(yükseklik karoları 512 KB, örtü 256 KB; bit-eşdeğerlik/≤ 1 nicem 7.2/7.4'te eski veriyle doğrulandı, eski veri 7.10'da kalktığından artık yeniden karşılaştırılamaz: karolar manifestteki sha256 ile kilitli. `features.json` ≈ 1,1 MB, bu kriterin kapsamı dışında; büyürse karo başına bölünür — Faz 8+)_
- [x] Faz 6 (v1) kayıtları yeni dünyada yüklenir; tükenen ağaçlar ve öldürülen canlı beklemeleri aynı yerde _(`tests/saveMigration`, gerçek v1 kayıt `tests/fixtures/save-v1.json`; başsız tarayıcıda 7.10'da yeniden denendi)_
- [x] Performans bütçesi: kare başı draw call < 300 (başsız ölçüm, en kötü konumlar); açılış hazırlığı ölçülmüş _(en kötü 176 draw call / ~538 bin üçgen; açılış hazırlığı ~0,6 sn; gerçek FPS elle GPU'lu masaüstünde ölçülecek — açık)_
- [x] Veri hattı tek komutla yeniden üretilebilir; Python ve TS testleri geçer _(`python build_world.py` (ham veri `fetch_*` ile iner); Python 98, Vitest 1343 test geçiyor; gerçek ham veriyle yeniden üretim 7.10'da yeniden çalıştırılmadı (~800 MB indirme), hat sentetik uçtan uca testli)_

---

## Faz 8 — Pilot İl: Zonguldak
**Branch:** `faz-8-pilot-zonguldak` _(alt görevler ayrı branch/PR'larla `main`'e girer)_
**Karar:** Kullanıcı talimatıyla **harita genişletmesi durduruldu** (aşağıdaki "Genişleme" bölümü bekliyor); mevcut haritada **Zonguldak pilot il** seçildi. Bu faz yeni il/karo eklemeden, oyunu **tek bir il üzerinde derinleştirir ve cilalar**. Diğer iller (Bartın, Karabük, Düzce, Bolu) haritada ve oynanabilir kalır; yeni çalışma onlara özel yapılmaz, ama bozulmamalıdır (mevcut testler geçmeye devam eder). _(Sonradan, kullanıcı talimatıyla 8.9: yer adları, yer bildirimi ve ekoloji ölçümü diğer illere de yayıldı; yeniden doğma/başlangıç yine yalnızca Zonguldak'ta.)_
**Amaç:** Zonguldak'ı "bitmiş hissettiren" bir oyun alanı yap: oyuncu burada başlar, öğrenir, hayatta kalır ve ilin farklı yüzlerini (kıyı, vadi, orman, yayla) tanır. Bölgeyle ilgili ölçülmemiş denge ve elle doğrulama borçları kapanır.

**Kapsam dışı (bu faz boyunca):** kömür/maden teması (kullanıcı kararı; fikir Fikir Havuzu'nda kalır), zorunlu öğretici/görev sistemi, yeni il/karo eklemek, `tools/world.yaml` / `build_world.py` ile dünyayı büyütmek, karo akışı, yeni UTM bölgesi, yeni çalışma zamanı bağımlılığı (gerekirse önce sorulur). Veri hattı yalnızca **mevcut** dünya verisini daha iyi kullanmak için (ör. ilçe/yer adı listesi, örtü iyileştirme) dokunulabilir; harita sınırı/kafes/karo kümesi değişmez.

Görevler (numaralar alt görev sırasıdır; her biri bir anlamlı commit/PR):
- [x] **8.0** Zonguldak ölçüm tabanı: il sınırı içinde kara alanı, arazi örtüsü dağılımı, rakım/eğim dağılımı, tatlı su (nehir/göl), kıyı uzunluğu, canlı doğma yoğunluğu, draw call/üçgen/bellek; çıktı `docs/faz-8-zonguldak-olcumler.md` ve (gerekirse) `tests/provinceBaseline` (eski adı zonguldakBaseline) _(sonraki görevlerin "önce/sonra" karşılaştırması bu tabana göredir; değişiklik yok, yalnızca ölçüm)_ _(tamam: `tests/zonguldakBaseline.test.ts` + `tests/helpers/creatureWalk.ts`, rapor [docs/faz-8-zonguldak-olcumler.md](docs/faz-8-zonguldak-olcumler.md); en kötü Zonguldak içi 98 draw call / ~591 bin üçgen; **bulgu:** il çokgeni kıyıdan içeride, kıyı şeridinde `provinceAt` null — 8.1 "Zonguldak içi" tanımında dikkate alınmalı)_
- [x] **8.1** Pilot il çerçevesi: yeni oyun başlangıcı ve **yeniden doğma yalnızca Zonguldak içinde** (kullanıcı kararı: ölünce hangi ilde olunursa olunsun oyuncu Zonguldak'ta güvenli bir noktaya doğar; `RESPAWN` Zonguldak il sınırıyla sınırlanır, n. ölüm için deterministik-rastgele seçim korunur); `config.ts` altında `PILOT` bloğu (pilot il adı, başlangıç noktası) _(kayıt şeması değişmez; mevcut v2 kayıtlar yüklenir; il dışına çıkmak ve bildirim akışı aynen çalışır)_ _(tamam: `PILOT` (`config.ts`), `world/pilot.ts` `isInPilotProvince` (kıyı şeridi: en yakın il pilot ve çokgene ≤ 8 oyun m), `distanceToProvince` (`world/provinces.ts`), `pickRespawnPoint` yalnızca pilot ilde; başlangıç `PILOT.start`; testli: `tests/pilot`, `tests/respawn`)_
- [x] **8.2** Zonguldak yer adları ve ışınlanma: ilçe merkezleri ve belirgin yerler (ör. Zonguldak merkez, Kozlu, Kilimli, Karadeniz Ereğli, Çaycuma, Devrek, Gökçebey, Alaplı, Filyos vadisi) `TELEPORTS`/yer adı tablosuna eklenir _(koordinatlar gerçek enlem/boylamdan; her nokta Zonguldak içinde, yürünebilir ve yakında içilebilir su/yakıt konumunda testli, `tests/duzceBolu` benzeri)_ _(tamam: `PILOT.places` — 10 yer, dev modunda Shift + 1–9, 0; ilçe merkezleri Zonguldak, Kozlu, Kilimli, Çatalağzı, Karadeniz Ereğli, Alaplı, Çaycuma, Devrek, Gökçebey ve Filyos vadisi; testli: `tests/pilotPlaces`; başsız tarayıcıda Shift+5 → Karadeniz Ereğli, Shift'siz 5 → Yenice doğrulandı)_
- [x] **8.3** Yer adı bildirimi: il altı (ilçe/yer) geçişinde HUD bildirimi, `ProvinceTracker` mantığına benzer saf mantık _(ilçe sınırı yerine nokta + yarıçap tabanlı; yeni veri/bağımlılık gerekmez)_ _(tamam: `world/placeNotice.ts` `PlaceTracker`, `PLACE_NOTICE`, `RegionWorld.placeCenters`, `Game` bağlantısı; il bildirimiyle üst üste binmez; testli: `tests/placeNotice`; başsız tarayıcıda açılışta bildirim yok, Shift+5 ışınlanmasından ~2 sn sonra "Karadeniz Ereğli" göründü)_
- [x] **8.4** Zonguldak ekoloji ve denge turu: kıyı, vadi, orman ve yayla bölgeleri için canlı yoğunluğu, kurt/ayı tehdidi, gece soğuğu, yiyecek/su/yakıt bulunabilirliği ölçülür; sorunlar `CREATURES`, `SCATTER`, `CLIMATE` ayarlarıyla düzeltilir _(`tests/balanceEncounters`, `creatureDensity`, `vitals` yeniden çalıştırılır; değerler ayarlanırsa golden/denge testleri güncellenir)_ _(tamam: `tests/zonguldakEcology.test.ts`, rapor [docs/faz-8-zonguldak-olcumler.md](docs/faz-8-zonguldak-olcumler.md) "8.4": canlılar diğer illerle aynı aralıkta (av ≈ 0,63/dk, ayı ≈ 20 dk, gece kurt ≈ 9 dk), su ≤ 1 dk yürüyüş, gece soğuğu yalnızca ≥ 600 m'de hasarlı; **hiçbir ayar değişmedi**. Açık tasarım kararı: yiyecek neredeyse kıtlık yaratmıyor (yenebilir bitki medyan 12 m), bkz. rapor)_
- [x] **8.5** İlk dakikalar için ipucu akışı: Zonguldak başlangıcında oyuncuya ihtiyaç sırasıyla (su → yiyecek → ateş → barınak → av) kısa HUD ipuçları, kontrol özeti _(**yalnızca ipucu**: zorunlu adım, kilit veya görev zinciri yok; saf mantık + `Hud`; her ipucu bir kez gösterilir, ayarlardan kapatılabilir)_ _(tamam: `src/hints/hints.ts` `HintTracker` + kalıcı "görüldü" listesi, `HINTS`, `Settings.hints` ve Ayarlar'da açma/kapama, `Game.updateHints`; testli: `tests/hints`, `tests/settings`; başsız tarayıcıda kontrol özeti oyuna girişten ~4 sn sonra, su ipucu susuzlukta göründü, Yeni Oyun görülenleri sildi)_
- [x] **8.6** Performans ve görsel cila: Zonguldak içinde en kötü konumlarda (merkez kıyısı, Filyos vadisi, yüksek orman) draw call/üçgen ölçümü; bütçe < 300 draw call korunur; sorun çıkarsa `SCATTER`/LOD eşikleri ve su meshi bölme _(8.0 tabanıyla karşılaştırılır)_ _(tamam: ölçüm 8.0 ile birebir aynı — en kötü 98 draw call / ~591 bin üçgen, azaltma gerekmedi; görsel cila: başlangıç bakışı kuzeydeki yamaç duvarından batıdaki açık deniz manzarasına çevrildi (`PILOT.start.yawDeg = 90`, `createNewGameSave(…, yaw)`); testli: `tests/pilot`; rapor "8.6")_
- [x] **8.7** Elle doğrulama borçlarının pilot ilde toplanması: aşağıdaki liste için kısa bir "elle test kılavuzu" (`docs/faz-8-elle-dogrulama.md`) hazırlanır; sonuçlar kullanıcıdan alınıp işaretlenir _(kılavuz hazır: [docs/faz-8-elle-dogrulama.md](docs/faz-8-elle-dogrulama.md) — 9 bölüm: performans/FPS tablosu, arazi ve orman hissi, ateş+barınak zinciri, av ve denge, yeniden doğma/yer adları, ipuçları, sesler, menü/kayıt, genel; sonuçlar kullanıcıdan bekleniyor)_
- [x] **8.8** Kapanış: ROADMAP, `CLAUDE.md` "Mevcut Durum", README _(tamam: ROADMAP, `CLAUDE.md` "Mevcut Durum", README güncellendi; açık kalan yalnızca elle doğrulama sonuçları)_
- [x] **8.9** Diğer illere yayılım (kullanıcı talimatı: "Zonguldak'ta uygulananları diğer illere de uygula"): Bartın, Karabük, Düzce ve Bolu için yer adları + ışınlanma (`OTHER_PROVINCE_PLACES`, 8–10 yer/il), yer adı bildirimi (tüm iller), ölçüm tabanı + ekoloji turu (`tests/provinceBaseline`, `tests/provinceEcology`, rapor `docs/faz-8-iller-olcumler.md`), elle doğrulama kılavuzuna bölüm 10 _(**yeniden doğma/başlangıç Zonguldak'ta kalır** (kullanıcı kararı); ipuçları zaten il bağımsız; harita/veri değişmedi, hiçbir denge ayarı değişmedi)_ _(tamam: `isInProvince` (genel), `PROVINCE_PLACES`, `RegionWorld.placeCenters` tüm iller, Shift ışınlanması bulunulan ile göre; testli: `tests/pilotPlaces` (5 il × yerler: ilinde, karada, yürünebilir, ≤ 60 m'de su), `tests/placeNotice`, `tests/provinceBaseline`, `tests/provinceEcology`; **bulgu:** Karabük ve Bolu yüksek, medyan rakımda gece soğuğu can kaybettirir (rapor), ayarlanmadı — elle doğrulanacak)_

Kabul kriterleri:
- [x] Yeni oyun ve yeniden doğma Zonguldak içinde başlıyor; il dışına çıkmak hâlâ mümkün ve bildirim doğru çalışıyor _(testli)_ _(kapanışta doğrulandı: `tests/pilot`, `tests/respawn`: 200 ölümde yalnızca pilot il; il dışına yürümek ve il bildirimi `provinceNoticeRegion` ile değişmedi)_
- [x] En az 8 Zonguldak yer adı/ışınlanma noktası var; hepsi doğru ilde, yürünebilir ve yakınında su var _(testli)_ _(kapanışta doğrulandı: 10 yer, `tests/pilotPlaces`)_
- [x] Zonguldak ölçüm raporu var ve 8.4/8.6 sonrası "önce/sonra" karşılaştırması raporda yer alıyor _(`docs/faz-8-zonguldak-olcumler.md`)_ _(kapanışta doğrulandı: 8.6'da önce/sonra: birebir aynı)_
- [x] Denge: hiçbir şey yapmayan oyuncu ölür, ateş + barınak + av zinciri Zonguldak'ta uygulanabilir; kıyıda ve yüksek ormanda gece davranışı beklenen aralıkta _(`vitals`, `balanceEncounters`, `creatureDensity` testleri geçer)_ _(kapanışta doğrulandı: 8.4 ölçümü: ayar değişmedi; `vitals`, `balanceEncounters`, `creatureDensity` geçer)_
- [x] Performans bütçesi korunur: draw call < 300, Zonguldak'ta en kötü konum tabana göre ≤ +%10 draw call _(başsız ölçüm; gerçek FPS elle)_ _(kapanışta doğrulandı: en kötü 98 = taban (8.6); gerçek FPS elle)_
- [x] Mevcut v1/v2 kayıtlar yüklenir; `SAVE_FORMAT_VERSION` yalnızca şema değişirse artırılır ve göç adımı eklenir _(kapanışta doğrulandı: `tests/saveMigration`, `saveGame`; `SAVE_FORMAT_VERSION` değişmedi)_
- [x] Lint, typecheck, Vitest ve build hatasız; Python testleri etkilenmez (dünya verisi değişmez, `world.json` sha256'ları aynı) _(kapanışta doğrulandı: 1394 test; `public/` ve `tools/` Faz 8 boyunca değişmedi (git diff boş), CI `check` + `tools` yeşil)_
- [x] Elle doğrulama kılavuzu hazır (sonuçlar kullanıcı tarafından işaretlenir) _(`docs/faz-8-elle-dogrulama.md`)_

Elle doğrulanacak (gerçek GPU'lu masaüstü ve hoparlör gerekir; Zonguldak çevresinde toplanır):
- [ ] 60 FPS (en kötü konumlar: Zonguldak merkez kıyısı, Filyos vadisi; tüm dünya görüşteyken)
- [ ] Zonguldak ormanlarında ve yüksek kesimlerinde (Filyos vadisi, Devrek–Alaplı çevresi) oyun hissi, orman/ağaç görsel tanınırlığı _(Faz 2/4)_
- [ ] "Sıfırdan ateş ve barınak kurma" zinciri _(Faz 4)_; avlanma, kurt/ayı tehdidi, çiğ et riski, ateşin caydırıcılığı _(Faz 5)_
- [ ] Ortam sesleri (deniz, rüzgâr, kuş, baykuş) gerçek hoparlörde; kalite ön ayarlarının FPS etkisi; menü/yuva akışı gerçek fare kilidiyle _(Faz 6)_

---

## Faz 9 — İnşa ve Ekipman
**Branch:** `ccr-dffb10e3-vdy7p4` _(kullanıcı talimatı: "İnşa sistemini geliştir. Bina, sandık, ekipman vb. yapımlar ekle. Ekipmanlara hızlı erişim slotları ekle.")_
**Amaç:** Yerleştirme sistemini genel bir inşa sistemine çevirmek (yeni yapılar, döndürme, sökme, katı duvarlar), yeni ekipmanlar eklemek ve alet/silah/yapı/yiyeceklere kısayol çubuğuyla hızlı erişim sağlamak. Harita/veri değişmez (genişleme hâlâ durdurulmuş); pilot il kararı aynen sürer.

**Kapsam dışı:** ayrı giysi/zırh slotu (giysiler hâlâ envanterde bulunarak etki eder), alet/silah aşınması, modüler (duvar/zemin parça parça) inşa, kapı açma/kapama, yapı hasarı, hayvanların duvarları algılaması, sandıktaki malzemeyle doğrudan üretim, yeni çalışma zamanı bağımlılığı.

Görevler:
- [x] **9.1** Yeni yapılar: **Çalışma Tezgâhı** (üretim istasyonu), **Sandık** (16 slot / 60 kg ayrı depo; `E` ile açılır, tıkla-taşı paneli), **Ahşap Kulübe** (kapılı dört duvar + beşik çatı; sundurmadan iyi barınak: soğuk ×0,3, dinlenme ×3 enerji / ×2 can) _(`STRUCTURE_KINDS` sona eklendi; `PLACEMENT.kinds`, `STORAGE`, `SHELTER_EFFECTS.hut`; geometri `structureGeometry.ts`, ölçüler `placement/structureShapes.ts`)_
- [x] **9.2** İnşa sistemi: hayaleti `R` ile 90° döndürme; büyük yapının oyuncudan ileriye konması (`aimDistance`/`maxReach` tür başına) ve ayak izi engebesi denetimi (`maxRelief`: kulübe duvarlarının altında boşluk kalmasın); bakılan yapıyı `X` basılı tutarak **sökme** (yapı eşya olarak geri gelir, kamp ateşinden 4 taş; dolu sandık sökülmez); katı yapılara Rapier collider'ı (`world/StructureColliders.ts`: sandık, tezgâh, kulübe duvarları; ateş ve sundurma eskisi gibi geçilir) _(testli: `tests/buildSystem`, `tests/structureColliders` — kulübe duvarı oyuncuyu durdurur, kapıdan girilir; `tests/placementController`, `tests/placeRulesRegion`: kara alanının ≈ %21'i kulübeye, ≈ %52–62'si sandık/tezgâha uygun)_
- [x] **9.3** İstasyonlu üretim: tarifin `station` alanı (`STATIONS.workbench.reach` = 4 m); sandık, kulübe ve kürk pelerin tezgâhın yanında üretilir; envanter panelinde "Yakında: Çalışma Tezgâhı" ve istasyon çipi _(`placement/stations.ts`, `craftStatus(…, context)`, `missing_station`)_
- [x] **9.4** Ekipman: **Kemik Bıçak** (hızlı ama zayıf silah, leşi en hızlı keser: 2 sn), **Meşale** (elde tutulunca oyuncunun çevresini aydınlatır; tek sabit `PointLight`), **Kürk Pelerin** (envanterde: +2,5 °C ısı, %10 savunma; `EQUIPMENT.clothingWarmthC`) _(`items/equipment.ts`, `COMBAT.weapons.bone_knife`, `LOOT.butcherSecondsKnife`)_
- [x] **9.5** Hızlı erişim (kısayol) çubuğu: 8 slot (`1`–`8`, fare tekerleği), slotlar envanterdeki eşyaya **bağlantıdır** (adet envanterden okunur); envanter panelinde "Kısayol: 1…8" ile bağlanır, üretilen alet/yapı ilk boş slota kendiliğinden bağlanır. Basınca: silah/alet elde tutulur (saldırı eldeki silahla; el boşsa eskisi gibi en iyi silah), yapı elde tutulur ve hayaleti açılır, yiyecek/dolu su kabı bir tane tüketilir; aynı tuş eli boşaltır. HUD'da alt ortada çubuk ve "Elde: …" _(`items/hotbar.ts`, `ui/hotbarView.ts`, `Hud.setHotbar`; testli: `tests/hotbar`, `tests/hotbarInput`, `tests/hotbarView`, `tests/equipment`)_
- [x] **9.6** Kayıt v3: kısayol çubuğu ve sandık içerikleri kaydedilir; v2 (ve v1) kayıtlar göçle yüklenir (boş kısayol) _(`SAVE_FORMAT_VERSION` = 3, `migrateV2toV3`; yapı kayıt biçimi yalnızca eklemeli: sandıkta `storage`)_
- [x] **9.7** Dev tuşları: değiştiricisiz rakamlar artık kısayol çubuğunundur; `TELEPORTS` ışınlanması `T` + `1`–`9`, `0`'a taşındı (`Shift` + rakam aynen), `O` inşa eşyaları verir _(elle doğrulama kılavuzu güncellendi)_
- [x] **9.8** Belgeler: ROADMAP, `CLAUDE.md` "Mevcut Durum", README, elle doğrulama kılavuzu bölüm 11

Kabul kriterleri:
- [x] Tezgâh, sandık ve kulübe üretilip kurulabiliyor, döndürülebiliyor ve sökülebiliyor; sandık içeriği kayda giriyor _(testli; başsız Chromium'da kuruldu, sandık açılıp eşya taşındı, kulübe içinde "Kulübede", `X` ile söküldü)_
- [x] Kulübe duvarları oyuncuyu durduruyor, kapıdan giriliyor; kulübe sundurmadan iyi koruyor _(testli: `tests/structureColliders`, `tests/equipment`)_
- [x] Kısayol çubuğu: 8 slot, tuş/tekerlek seçimi, elde silahla saldırı, yapı hayaleti, yiyecek tüketme; kayıtta korunuyor _(testli)_
- [x] Eski kayıtlar (v1, v2) yükleniyor; `SAVE_FORMAT_VERSION` 3 ve göç adımı var _(`tests/saveGame`, `tests/saveMigration`)_
- [x] Lint, typecheck, Vitest ve build hatasız; dünya verisi ve `tools/` değişmedi

Elle doğrulanacak (bkz. [docs/faz-8-elle-dogrulama.md](docs/faz-8-elle-dogrulama.md) bölüm 11):
- [ ] Kısayol çubuğu ve silah seçiminin oyun hissi (tekerlek hızı, el boşken en iyi silah kuralı)
- [ ] Kulübe: kapı genişliği, yamaçta duvar/çatı görünümü, düz yer bulma zorluğu, gece koruması
- [ ] Meşale ışığının yeterliliği ve FPS etkisi; kürk pelerinin yüksek illerde etkisi
- [ ] Malzeme miktarları (tezgâh, sandık, kulübe, pelerin) ve dengesi

---

## Faz 10 — Yerleşimler, Yollar ve İnsanlar (Türk-İslam kültürü)
**Branch:** `ccr-3b803091-tjs9y1` _(kullanıcı talimatı: "Haritalarda şehir merkezleri, ilçe merkezleri; illerin gerçek yapılanması; birbirine bağlayan yollar; terk edilmiş hava; çok nadir başka insanlar; yapılar şehrin gerçek yapısındaki gibi; her şey Türk ve İslam kültürüne göre." Plan onaylandı: domuz/kurt/ayı eti yok, yalnızca barışçıl insanlar, köylerin ~%20'si, ezan sesi yok, önce Zonguldak ama tüm hedef iller.)_
**Amaç:** Gerçek idari yapıya (5 il merkezi, 30 ilçe merkezi, seçilmiş köyler) ve gerçek bina yoğunluğuna göre terk edilmiş kasabalar; şehirlerarası gerçek yollar; Türk-İslam mimarisi (kıbleye dönük kubbeli camiler, kalem minareler, ahşap köy camileri, Osmanlı konakları, çeşmeler, şahideli mezarlıklar, han, hamam, türbe; Zonguldak maden kuyuları, Karabük fabrikası); yağmalanmamış kilerlerde Türk erzakı; nadir, barışçıl yolcular; helal/haram, namaz vakitleri ve Hicrî takvim. Harita genişlemez (il/karo eklenmez); mevcut dünyaya katman eklenir.

**Kapsam dışı:** binaların iç mekânları (cami ve han dışında), ezan sesi (bilinçli: sentezlenmiş ezan saygısız olur), düşman insanlar/eşkıya, araç sürme, karo akışı, hayvanların yapıları algılaması, yeni çalışma zamanı bağımlılığı.

Görevler:
- [x] **10.0** Veri hattı: `tools/fetch_settlements.py` (Overture yollar, idari birimler, yerler, bina noktaları; HTTP Range), `tools/build_settlements.py` + `tools/settlements.yaml` (rütbe, üslup, elle seçilmiş simge yapılar) → `settlements.json` (887 KB, world.json'da bayt + sha256) _(Python testleri: `tools/tests/test_settlements.py`)_
- [x] **10.1** Yükleyici (`parseSettlements`, isteğe bağlı), yol şeritleri (`RoadMesh`, 1 km gruplar; 10.11'de arazi kaplamasına taşındı; kent içinde il yolları kesilip sokak ızgarası çizilir), yapı/yol üstündeki ağaç-kayaların gizlenmesi (nesne kimlikleri değişmez)
- [x] **10.2** Yerleşim düzeni (`settlements/layout.ts`, saf, seed'li): ayak izi büyütmesi, parsel ızgarası, yamaca gömülü konutlar (kapı vadiye), kıbleye dönük camiler taş set üstünde, simge yapılar gerçek konumlarına yakın, üsluba göre konut karışımı (kasaba, maden, sanayi, Osmanlı, köy)
- [x] **10.3** Yapılar: 21 arketip (`settlements/kinds.ts`, `world/buildingGeometry.ts`), örnekli çizim + uzak kademe (`SettlementLayer`), taş temel ve kapı merdivenleri, hükümet konağında Türk bayrağı, Rapier collider'ları (`SettlementColliders`)
- [x] **10.4** Terk edilmişlik: yıkık (çatısız, yıkıntılı) varyantlar, kararmış/tahtalanmış pencereler, inik kepenkler, solgun tonlar
- [x] **10.5** Arama ve ganimet: kapıda `E` basılı (3 sn), yapı türüne göre deterministik Türk kileri (bulgur, tarhana, kuru fasulye, Rize çayı, pekmez, leblebi, kuru kayısı, peksimet; bakır tencere, yün battaniye, madenci lambası); bakır tencereyle tarhana çorbası, bulgur pilavı, kuru fasulye, demli çay; kayıt v4 (aranmış yapılar)
- [x] **10.6** Cami ve han içi kapalı barınak; camide canlılar oyuncuyu algılamaz (kutsal alan); çeşmelerden su içilir; cami, türbe, mezarlık aranmaz
- [x] **10.7** İnsanlar (`src/people/`): yolcu, çoban, oduncu, köylü teyze, derviş; ~20 dk'da bir; "Selamün aleyküm"; konuşma paneli (yol/su tarifi, hikâye, takas, dervişin hediyesi, "Allah'a emanet ol")
- [x] **10.8** Kültür: helal/haram (yalnızca karaca eti; yaban domuzu kesilmez; kurt/ayıdan deri ve kemik), "Bismillah" kesim ipucu, namaz vakitleri (Diyanet açıları) ve vakit bildirimi, Miladî + Hicrî tarih, pusulada kıble, Selçuklu yıldızı bordürü, yerleşim/kişi ipuçları
- [x] **10.9** Ölçüm ve belgeler: [docs/faz-10-yerlesim-olcumler.md](docs/faz-10-yerlesim-olcumler.md), `CLAUDE.md`, README, elle doğrulama kılavuzu bölüm 12
- [x] **10.10** Faz 10 sonrası ek talimat (kullanıcı): **modüler inşa** (taban, duvar, kapılı/pencereli duvar, kapı, çatı ayrı üretilir, sahada ızgaraya monte edilir; çok katlı; açılıp kapanan kapı; kapalı oda = kulübe etkisi), **test modu** (Ayarlar'dan aç/kapa: uçma, sınırsız malzeme; geçici) ve **şehir merkezi başlangıcı** (yeni oyun ve yeniden doğma 5 il + 30 ilçe merkezinden rastgele; pilot il kısıtı bu seçimde kalktı). Ayrıntı `CLAUDE.md` "Faz 10 sonrası"; elle doğrulama kılavuzu bölüm 13
- [x] **10.11** Grafik düzenlemesi (kullanıcı talimatı: "sular, yollar, dağlar, ağaçlar, taşlar, yapılar üst üste, iç içe karmakarışık"): yollar, akarsular, kıyı bantları ve il sınırları arazi shader'ında uzaklık alanı dokusundan boyanır (`world/terrainOverlay.ts`; havada kalan/gömülen şerit mesh'leri kalktı, kıyı boyunca il sınırı yok); yol verisi yumuşatılır ve akarsuya paralel kesimler sudan ayrılır (`settlements/roadRouting.ts`); yapılar görsel ayak izi (saçak, merdiven) ile tüm yerleşimler arasında çakışmaz, akarsuya/yola oturmaz, sokaklar yapıların içinden geçmez (`settlements/footprints.ts`); ağaçlar taç yarıçapına göre yapı/yoldan elenir; kaya/kent renkleri asfaltla karışmayacak biçimde ayrıldı. Ayrıntı `CLAUDE.md` "Grafik düzenlemesi"; elle doğrulama kılavuzu bölüm 14
- [x] **10.12** Yol ağı, zemin düzeltme ve köprüler (kullanıcı talimatı: yollar zemine uydurulsun, dalgasız/keskin köşesiz, dere geçişlerinde köprü, kopuk yol olmasın, yoğunluğa göre ana/tali/patika, kent çevresinde "yalnız yol" yerleri giderilsin): yollar Gauss süzgeciyle yumuşatılır (`settlements/roadRouting.ts`); çıkmaz yollar budanır, kırsal tali yol patikaya iner, kopuk parçalar A* ile bağlanır (`roadNetwork.ts`, `routeFinder.ts`); boyuna profil + eğim sınırı + kazı/dolgu (`roadProfile.ts`) araziye işlenir (`world/roadGrading.ts`); dere ve vadi geçişlerinde köprü/viyadük (`world/roadStructureGeometry.ts`, `RoadStructureLayer`, `RoadStructureColliders`); kent sokakları yalnız yapılı bloklara ve bağlı (`townNetwork.ts`); dik yamaçta yapı terasları (`world/buildingPads.ts`). Tünel yapılamadı (arazide delik yok; derin yarma). Ayrıntı `CLAUDE.md` "Yol ağı ve zemin düzeltmesi", ölçümler [docs/faz-10-yol-agi-olcumler.md](docs/faz-10-yol-agi-olcumler.md); elle doğrulama kılavuzu bölüm 15

- [x] **10.13** Yol ağı omurgası, köprü türleri, tüneller ve dere yatakları (kullanıcı talimatı: büyük ve arka arkaya tepeli köprüler, gereksiz göbek/ayrım, başı-sonu bağlantısız ve parça parça yollar, yan duran akarsular düzeltilsin; 3-4 yol tipi; 2-3 köprü tipi; dağların altından tüneller; yol sayısı aşırı olmasın, bağlantılı olsun): yol ağı veri yollarından seçilen seyrek, tek parça bir omurgadır (il/ilçe arası en kısa yollar anayol, köyler ağa en kısa yoldan köy yolu, dik bağlantılar ve köy arası kestirmeler dağ patikası; çift şeritli yolun öbür yönü, kavşak kolları ve kısa halkalar atılır; `settlements/roadNetwork.ts`); kent içinde kapılardan ve girişlerden köke en kısa sokaklar (`townNetwork.ts`); dört yol tipi ayrı boyanır (anayol orta şeritli, köy yolu yamalı asfalt, patika toprak, kent sokağı parke + kaldırım; `world/terrainOverlay.ts` yol dokusu); köprüler yalnız dere kesişiminde, kısa, düz güverteli, yakınlar birleşik; türler beton kiriş, viyadük, taş kemer, ahşap (`roadProfile.ts`, `world/roadStructureGeometry.ts`); menderesli dereyi tekrar tekrar kesen yol derenin bir yakasına alınır; tüneller (ağızda arazi deliği + trimesh collider, tüp, lambalar, cephe; `world/roadTunnels.ts`); dere yatakları oyulur ve yol dolgusundan korunur (`world/streamCarving.ts`). Ayrıntı `CLAUDE.md` "Yol ağı omurgası", ölçümler [docs/faz-10-yol-kopru-tunel-olcumler.md](docs/faz-10-yol-kopru-tunel-olcumler.md); elle doğrulama kılavuzu bölüm 16

Kabul kriterleri:
- [x] 5 il ve 30 ilçe merkezi gerçek konumlarında, gerçek bina yoğunluğuna göre kuruluyor; köyler seyrek; harita evle dolmuyor (1 410 yapı; 10.11 sonrası çakışmasız ~1 510) _(testli: `tests/settlementMap`)_
- [x] Her il/ilçe merkezinde cami var (ayak izi denizde kalan Amasra/Kurucaşile hariç); camiler kıbleye dönük; oyuncu merdivenden harime girebiliyor _(testli: `tests/settlementMap`, `tests/settlementWalk`)_
- [x] Yollar şehirleri ve ilçeleri bağlıyor; yolda ağaç yok _(testli)_
- [x] Arama/ganimet atomik ve kalıcı; kayıt v4 ve v3 göçü _(testli: `tests/buildingSearch`, `tests/saveGame`)_
- [x] İnsanlar nadir, barışçıl, selam veriyor, konuşma ve takas çalışıyor _(testli: `tests/people`; başsız Chromium'da panel denendi)_
- [x] Draw call < 300 (en kötü 240), ilk yükleme < 10 sn (8,6 sn) _(başsız ölçüm)_
- [x] Lint, typecheck, Vitest, build ve build:check hatasız

Elle doğrulanacak (bkz. [docs/faz-8-elle-dogrulama.md](docs/faz-8-elle-dogrulama.md) bölüm 12; yol ağı için bölüm 15):
- [ ] Kasabaların gerçek şehre benzerliği (Safranbolu çarşısı, Zonguldak yamaçları, Bolu merkezi) ve "terk edilmiş" hissi
- [ ] Yolların görünümü (renk, genişlik, yamaçta yüzme/gömülme) ve kent sokakları; dört yol tipinin ayırt edilmesi, köprü türleri, tünel ağızları (bölüm 16)
- [ ] Ganimet dengesi (yiyecek kıtlığı helal kuralıyla dengelendi mi?), arama süresi
- [ ] İnsanların sıklığı ve konuşmaların doğallığı; takas oranları
- [ ] Gerçek GPU'da FPS (özellikle Safranbolu, Düzce, Karabük)

---

## Faz 11 — İnşa II, Tarım, Silahlar, Eşkıya ve Drone
**Plan:** [docs/faz-11-paralel-plan.md](docs/faz-11-paralel-plan.md) _(kullanıcı talimatı: "inşaat için farklı yapılar; çatı konan yerin üstüne bir şey konamasın, kat çıkılacaksa yan duvarların üstüne tekrar taban; merdiven ve merdivene göre şekil alan taban; menzilli, yukarıdan izleyen drone; çit; ekme biçme; şehirlerde yankesiciler, ormanda kamplar ve farklı etkinlikler; farklı silahlar, sniper dahil; silahlar üretilsin ve ganimetten çıksın." Plan onaylandı; akışlar ayrı oturumlarda paralel yürür.)_
**Amaç:** Modüler inşayı katlı yapılara ve yeni parçalara genişletmek; yeni istasyonlar ve çitle tarımı (ekim, sulama, biçme, değirmen/fırın zinciri) eklemek; balistikli ilkel/ateşli silahları ve keskin nişancı tüfeğini hem üretim hem ganimetle getirmek; ormanda etkinlikleri olan eşkıya kampları ve şehirlerde yankesiciler; menzilli ve pilli gözlem drone'u. Harita/veri değişmez.

**Kapsam dışı:** silahlı/bomba atan drone, silah aşınması, araçlar, eşkıyaların yapı inşa etmesi, mevsime bağlı ekim, yeni çalışma zamanı bağımlılığı, harita genişlemesi.

Görevler (akış harfleri plan belgesindeki oturumlardır):
- [x] **11.0** İskele: tüm yeni eşya/yapı kimlikleri, yer tutucu simgeler ve tarifler, ganimet satırları, config blokları, olay bölümleri, tuşlar, `Settings.bandits`, ortak arayüzler (`HitTarget`, `fireShot`, `ObstacleQuery`, görüş odağı), kayıt v5 + `migrateV4toV5`, `Game` kancaları, bütçe 175 → 230 kB _(önce, tek oturum; `farm_plot` yalnızca ad taşıyan eşya kimliği de aldı, `HitTarget.kind`'e `player` eklendi, ölüm nedeni "vurularak")_
- [ ] **11.1 (A)** Modüler inşa II: çatı en üst parça (üstüne hiçbir şey konamaz); duvarlı hücrelerin üstüne üst kat tabanı (balkon çıkıntısı 1 hücre); merdiven (1 × 2 hücre, bir kat) ve üstündeki tabanın merdiven boşluklu + korkuluklu şekil alması; giriş basamağı, direk, korkuluk, yarım duvar, beşik çatı + alın duvarı; barınak/odak güncellemesi
- [ ] **11.2 (B)** Tek parça yapılar: demirci ocağı + örs, taş fırın, el değirmeni, kurutma rafı (kuru et), döşek, güneş paneli
- [ ] **11.3 (B)** Çit: ahşap çit, kuru taş duvar, çit kapısı (zemini izler); canlılar ve insanlar oyuncu duvarlarından/çitlerden geçmez (`ObstacleQuery`)
- [ ] **11.4 (C)** Ekme biçme: çapa ile tarla, tohumlar (buğday, mısır, fasulye, patates), sulama, büyüme evreleri, orakla biçme, buğday → un → ekmek / mısır → mısır ekmeği, yaban domuzu tarla baskını
- [x] **11.5 (D)** Silahlar: balistik (mermi düşüşü, saçılma), sağ tık nişan, dürbün + nefes tutma, `R` doldurma, şarjör; sopa, demir kama, pala, sapan, yay + ok, av tüfeği, tabanca, piyade tüfeği, **keskin nişancı tüfeği** (dürbün yalnız ganimetten); mühimmat; atış sesi ve gürültü _(mermi yolu sabit adımlı, arazi + oyuncu yapıları + binalar durdurur; isabet uçuş süresi kadar gecikir; nişangâh sıfırlı; saçma taneleri tek isabette toplanır; keskin nişancı tarifi piyade tüfeği yerine ondan pahalı metal + dürbün ister (tarif girdileri yalnızca malzeme kuralı); atış gürültüsü kışkırtılmış yırtıcıyı da kaçırır (11.0 canlı tepkisi), bu yüzden bot karşılaşmalarında ateşli silahla hasar alınmıyor — elle denge değerlendirmesine bırakıldı)_
- [x] **11.6 (E)** Eşkıya kampları (orman): seed'li kamplar, çadır/ateş/sandık; etkinlikler (ateş başı, uyku, nöbet, devriye, avlanma, odun, yol pususu); yakın/menzilli savaş, teslim olma, üst arama, kamp temizleme; camide saldırı yok; Ayarlar'dan kapatılabilir _(gerçek dünyada 15 kamp; kamp yeri kuralı ölçümle gevşetildi: eğim 32°, köylere 120 m, yola 80–400 m)_
- [x] **11.7 (E)** Yankesiciler (şehir): yaklaşıp eşya çalar ve kaçar; yakalanınca eşya geri gelir, kaçarsa kamp sandığına düşer
- [ ] **11.8 (F)** Drone: üretim, uçuş (WASD, Space/`Z`), `Q` görüş geçişi, `H` eve dönüş, ~300 m menzil, pil ve güneş paneli şarjı, işaretleme (pusulada), düşme/geri alma, eşkıyalarca vurulma
- [ ] **11.9** Kapanış: birleşik ölçüm ([docs/faz-11-olcumler.md](docs/faz-11-olcumler.md)), `CLAUDE.md` "Mevcut Durum", README, elle doğrulama kılavuzu bölüm 17

Kabul kriterleri:
- [ ] Çatının üstüne kurulum reddediliyor; duvarlı hücrenin üstüne üst kat tabanı kuruluyor; merdivenden üst kata yürünüyor ve üstteki taban merdiven boşluğu + korkuluk alıyor _(testli)_
- [ ] Yeni istasyonlar tarifleri yalnızca yakında açıyor; çitli alana hayvan giremiyor _(testli)_
- [ ] Ekim → büyüme → hasat → işleme zinciri oyun saatiyle çalışıyor; kayda giriyor _(testli)_
- [x] Her silah üretilebiliyor ve ganimetten çıkabiliyor; keskin nişancı tüfeği dürbün istiyor; balistik testleri geçiyor _(testli)_
- [ ] Eşkıya kampları deterministik, etkinlikleri ve teslim olma çalışıyor; camide saldırı yok; ayar kapalıyken eşkıya yok _(testli)_
- [ ] Drone menzil/pil sınırına uyuyor, işaretler kayda giriyor _(testli)_
- [ ] Kayıt v5; v1–v4 kayıtlar yükleniyor _(testli)_
- [ ] Draw call < 300, ilk yükleme < 10 sn _(başsız ölçüm)_
- [ ] Lint, typecheck, Vitest, build ve build:check hatasız

Elle doğrulanacak (kılavuz bölüm 17, 11.9'da yazılır):
- [ ] Merdiven/üst kat/beşik çatının görünümü ve yürüme hissi
- [ ] Tarım süreleri ve domuz baskınının dengesi
- [ ] Silah hissi (nişan, dürbün, geri tepme, ses), mühimmat kıtlığı
- [ ] Eşkıya zorluğu, pusu sıklığı, yankesici sıklığı
- [ ] Drone kontrolü, menzil ve gerçek GPU'da FPS (yüksekten bakış)

---

## Genişleme (DURDURULDU — kullanıcı talimatıyla)
> Harita genişletmesi, kullanıcı açıkça söyleyene kadar yapılmaz. Aşağıdaki liste yalnızca ileride dönülecek planın kaydıdır; bu bölümden iş alınmaz.

Her genişleme ayrı bir faz olarak planlanır. Olası sıra (komşuluğa göre):

1. **Kastamonu – Çankırı** (doğuya; Ilgaz) — alan ~+%60: **karo akışı** (oyuncuya göre yükleme/boşaltma) bu fazdan önce gerekli olabilir
2. **Sakarya – Kocaeli – Ankara** … (EPSG:32636 batıda ~28,5°D'ye kadar yeter; ötesi için ayrı karar)

Genişleme için teknik gereksinimler:
- [x] Çoklu bölge desteği ve bölgeler arası kesintisiz geçiş _(Faz 7'de tek koordinat sistemi + karolarla çözülür; ayrı "bölge geçişi" gerekmez)_
- [x] Heightmap'in diskte karo dosyalarına bölünmesi _(Faz 7)_
- [x] UTM zone değişimi _(Faz 7'de gerekmedi: Düzce–Bolu 30°D'nin doğusunda; EPSG:32636 batıda ~28,5°D'ye, doğuda 36°D'ye kadar yeter)_
- [ ] Karo akışı (oyuncuya göre karo yükleme/boşaltma; bellek tavanı)
- [ ] Karo başına özellik dosyaları (su/örtü vektörleri) — `features.json` büyüdüğünde

---

## Fikir Havuzu
Kapsam dışı ama ileride değerlendirilebilecek fikirler:

- Faz 10 sonrası yerleşimler: binaların iç mekânları (ev, han odaları), terk edilmiş araçlar (yolda paslı otomobiller), sarmaşık/ot bürümüş duvarlar, kasaba ortam sesleri (kepenk, kapı gıcırtısı), daha çok elle seçilmiş simge yapı (Ereğli, Düzce Konuralp, Mudurnu çarşısı), köprüler, Ramazan/bayram gibi takvim olayları, cami içinde mihrap/minber ayrıntısı, kişilerin cemaatle camiye gitmesi (vakit girince)

- Zonguldak kömür madenleri: yeraltı keşif alanları (karanlık, grizu tehlikesi, havalandırma)
- Mevsimler ve kar
- Hava olayları (yağmur, sis, fırtına)
- Tekne ile kıyı boyunca seyahat
- Hikâye / görev sistemi
- Ayrı ekipman slotu (giyilebilir zırh), silah bozulması, kanama/kırık gibi yaralanma türleri _(Faz 5'te giysi yalnızca envanterde bulunarak savunma verir; Faz 9'da silah/alet seçimi için kısayol çubuğu geldi, giysi slotu hâlâ yok)_
- İnşa (Faz 9 sonrası; modüler parçalar ve açılıp kapanan kapı 10.10'da geldi): merdiven/rampa ve eğimli (beşik) çatı, balkon/korkuluk, çatı altı üçgen alın duvarı, parça ağırlıkları/destek çökmesi (desteği sökülen parça şimdi havada kalır), yapı hasarı/onarımı, hayvanların duvarları algılaması (şimdi içinden geçerler), sandıktaki malzemeyle doğrudan üretim, meşalenin yanma süresi ve kurtları uzak tutması
- Tuzak ve olta ile av; suyu kaynatma (su kabı doldurma/içme bakım turunda eklendi)
- Hasar vinyetinde saldıran yönü göstergesi; hayvan sesleri (ses altyapısı Faz 6'da geldi: `audio/`; hayvan sesleri henüz yok)
- Hayvan ekolojisi: gerçek dağılım verisi, yavru/üreme, sürü formasyonu, mevsimsel göç, daha çok tür (tilki, geyik, sırtlan…)
- Ağaç ve kaya collider'ı (oyuncu ve hayvan şimdilik içlerinden geçer), hayvanların engel/ağaç arkasında görüş hattı
- Hayvan tuzağı/oltası, kurutulmuş et (yiyecek bozulması), deri işleme
- Ses: adım sesleri (zemine göre), kamp ateşi çıtırtısı, yağmur/fırtına, su kenarı ve nehir sesi, iç/dış mekân yankısı, ses kanalları için ayrı kaydırıcılar (müzik/efekt/ortam)
- Kayıt: canlıları ve leşleri kaydetme, kaydı dosya olarak dışa/içe aktarma, bulut kaydı, kayıt küçük resmi (ekran görüntüsü), yuva adlandırma
- Ayarlar: tuş atama, görüş alanı (FOV), gölge/anti-aliasing seçenekleri, sürüş mesafesi kaydırıcısı; ilk açılışta GPU'ya göre otomatik kalite
