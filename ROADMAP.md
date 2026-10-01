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
**Branch:** `faz-7-0-iskele`, `faz-7-a-veri`, `faz-7-b-calisma` _(iki hesapta paralel yürütülür: bkz. [docs/faz-7-paralel-plan.md](docs/faz-7-paralel-plan.md))_
**Amaç:** Haritayı batıya ve güneye büyüt: Düzce ve Bolu (Abant, Yedigöller) tam kapsansın, Zonguldak–Bartın–Karabük ile aralarında kesinti olmadan yürünsün. Mimari: **tek koordinat sistemi + diskte 512×512'lik karolar + açılışta belleğe birleştirme** (akış Faz 7 dışı); EPSG:32636 sabit.

Görevler (numaralar alt görev sırasıdır; **Hesap A = Veri ve karolar**, **Hesap B = Çalışma zamanı ve oyun**):
- [x] **7.0** İskele: sözleşme sabitleri (`WORLD`), `RegionMeta.gridOrigin`, mutlak kimlik fonksiyonları (`world/chunkKeys.ts`), kafes matematiği (`world/lattice.ts`), manifest tipleri (`data/worldTypes.ts`) _(testli: `tests/chunkKeys`, `lattice`, `region`)_
- [ ] **7.1** _(A)_ Karo biçimi ve yükleyici: `world.json` manifesti, `loadWorld`, `tools/worldlib.py`
- [ ] **7.2** _(A)_ Eski bölgeyi karola (bit-eşdeğer, golden test) — B için kritik bağımlılık
- [ ] **7.3** _(A)_ Hattı kafes/karo düzenine taşı (`world.yaml`, `build_world.py`, dünya-geneli nicemleme)
- [ ] **7.4** _(A)_ Düzce–Bolu verisini üret + kalite denetimi (sınır sürekliliği, göller, il kapsamı)
- [x] **7.5** _(B)_ Izgara çapası ve mutlak kimlikler (merkezli-orijin varsayımı kalkar; nesne/canlı yerleşimi birebir korunur) _(testli: `tests/latticeGolden` (eski bölge scatter/doğma golden + geniş dünyada değişmezlik), `latticeGrid` (asimetrik ızgara, negatif chunk, `seedFrom` kilidi))_
- [ ] **7.6** _(B)_ Dünyayı manifestten yükle; gerçek-bölge testlerini yeni yükleyiciye taşı
- [ ] **7.7** _(B)_ Kayıt v2 ve göç (Faz 6 kayıtları yeni dünyada yüklenir, kimlikler aynı nesneyi gösterir)
- [ ] **7.8** _(B)_ Performans ve bellek (288 chunk, su meshi; draw call < 300)
- [ ] **7.9** _(B)_ İçerik: Düzce–Bolu ışınlanma noktaları, kesintisiz yürüme, ekoloji/denge ölçümü
- [ ] **7.10** Birleştirme: eski bölge verisi/yükleyici temizliği, uçtan uca doğrulama, birleşik performans tablosu
- [ ] **7.11** Kapanış: ROADMAP, `CLAUDE.md` "Mevcut Durum", README

Kabul kriterleri:
- [ ] Oyuncu Zonguldak'tan Düzce'ye ve Bolu'ya kesintisiz yürüyebiliyor (karo/eski-yeni alan sınırında boşluk, sıçrama, takılma yok)
- [ ] Düzce ve Bolu gerçek il sınırlarıyla var; "Düzce'ye hoş geldiniz" bildirimi çıkıyor; Abant Gölü ve Yedigöller'de göl var ve içilebiliyor
- [ ] Heightmap karo dosyalarına bölünmüş (her dosya ≤ 1 MB); eski alan karolardan bit-eşdeğer yüklenir (7.2), yeni alanla ≤ 1 nicem içinde (7.4)
- [ ] Faz 6 (v1) kayıtları yeni dünyada yüklenir; tükenen ağaçlar ve öldürülen canlı beklemeleri aynı yerde
- [ ] Performans bütçesi: kare başı draw call < 300 (başsız ölçüm, en kötü konumlar); açılış hazırlığı ölçülmüş _(gerçek FPS elle GPU'lu masaüstünde)_
- [ ] Veri hattı tek komutla yeniden üretilebilir; Python ve TS testleri geçer

---

## Faz 8+ — Genişleme
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

- Zonguldak kömür madenleri: yeraltı keşif alanları (karanlık, grizu tehlikesi, havalandırma)
- Mevsimler ve kar
- Hava olayları (yağmur, sis, fırtına)
- Safranbolu gibi tarihi yerleşimlerde terk edilmiş yapılar ve ganimet
- Tekne ile kıyı boyunca seyahat
- Hikâye / görev sistemi
- Ayrı ekipman slotu (giyilebilir zırh), silah bozulması, kanama/kırık gibi yaralanma türleri _(Faz 5'te giysi yalnızca envanterde bulunarak savunma verir)_
- Tuzak ve olta ile av; su kabı doldurma ve kaynatma
- Hasar vinyetinde saldıran yönü göstergesi; hayvan sesleri (ses altyapısı Faz 6'da geldi: `audio/`; hayvan sesleri henüz yok)
- Hayvan ekolojisi: gerçek dağılım verisi, yavru/üreme, sürü formasyonu, mevsimsel göç, daha çok tür (tilki, geyik, sırtlan…)
- Ağaç ve kaya collider'ı (oyuncu ve hayvan şimdilik içlerinden geçer), hayvanların engel/ağaç arkasında görüş hattı
- Hayvan tuzağı/oltası, kurutulmuş et (yiyecek bozulması), deri işleme
- Ses: adım sesleri (zemine göre), kamp ateşi çıtırtısı, yağmur/fırtına, su kenarı ve nehir sesi, iç/dış mekân yankısı, ses kanalları için ayrı kaydırıcılar (müzik/efekt/ortam)
- Kayıt: canlıları ve leşleri kaydetme, kaydı dosya olarak dışa/içe aktarma, bulut kaydı, kayıt küçük resmi (ekran görüntüsü), yuva adlandırma
- Ayarlar: tuş atama, görüş alanı (FOV), gölge/anti-aliasing seçenekleri, sürüş mesafesi kaydırıcısı; ilk açılışta GPU'ya göre otomatik kalite
