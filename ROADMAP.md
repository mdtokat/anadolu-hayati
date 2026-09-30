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
- [ ] **4.4** Eşya tanımları ve envanter sistemi (ağırlık/slot limiti; saf mantık) + yemek yeme
- [ ] **4.5** Crafting mantığı: taş balta, ateş, basit barınak, su kabı tarifleri
- [ ] **4.6** Toplama etkileşimi (bakılan nesneye `E`)
- [ ] **4.7** Envanter ve üretim arayüzü
- [ ] **4.8** Yerleştirme: ateş ve barınak kurma
- [ ] **4.9** Ateşin sıcaklık etkisi, barınağın uyku/yorgunluk etkisi
- [ ] **4.10** Kapanış: ROADMAP, `CLAUDE.md` "Mevcut Durum", README

Kabul kriterleri:
- [ ] Ormanlar gerçek orman alanlarıyla örtüşüyor _(4.3; arazi örtüsü sınıflarına göre sayısal testle)_
- [ ] Oyuncu sıfırdan ateş ve barınak kurabiliyor
- [ ] Envanter ve crafting mantığı için birim testler var

---

## Faz 5 — Canlılar
**Branch:** `faz-5-canlilar`

Görevler:
- [ ] Bölgeye özgü hayvanlar: boz ayı, kurt, yaban domuzu, karaca
- [ ] Basit durum makinesi yapay zekâsı (dolaşma, kaçma, saldırma)
- [ ] Biyoma ve gece/gündüze göre doğma kuralları
- [ ] Avlanma ve et pişirme
- [ ] Hasar ve savunma

Kabul kriterleri:
- [ ] Hayvanlar araziye takılmadan hareket ediyor
- [ ] Görüş mesafesindeki hayvan sayısı performansı düşürmüyor
- [ ] Yapay zekâ durum geçişleri için birim testler var

---

## Faz 6 — Kayıt ve Cilalama
**Branch:** `faz-6-kayit`

Görevler:
- [ ] Kaydet / yükle (IndexedDB; birden fazla kayıt yuvası)
- [ ] Ana menü, ayarlar (grafik kalitesi, fare hassasiyeti, ses)
- [ ] Krediler ekranı (veri atıfları dahil)
- [ ] İl sınırı geçişlerinde bildirim ("Bartın'a hoş geldiniz")
- [ ] Ortam sesleri (rüzgâr, deniz, orman, gece)

Kabul kriterleri:
- [ ] Kaydedilip yüklenen oyun birebir aynı durumda açılıyor
- [ ] Kayıt formatı sürümlü (ileriki fazlarda geriye uyumluluk için)

---

## Faz 7+ — Genişleme
Her genişleme ayrı bir faz olarak planlanır. Olası sıra (komşuluğa göre):

1. **Düzce – Bolu** (batıya ve güneye; Abant, Yedigöller)
2. **Kastamonu – Çankırı** (doğuya; Ilgaz)
3. **Sakarya – Kocaeli – Ankara** …

Genişleme için teknik gereksinimler:
- [ ] Çoklu bölge desteği ve bölgeler arası kesintisiz geçiş
- [ ] Heightmap'in diskte chunk dosyalarına bölünmesi (tek dosya yerine)
- [ ] Doğuya ilerlerken UTM zone değişimi için çözüm (bölge başına zone veya tek Lambert projeksiyonu)

---

## Fikir Havuzu
Kapsam dışı ama ileride değerlendirilebilecek fikirler:

- Zonguldak kömür madenleri: yeraltı keşif alanları (karanlık, grizu tehlikesi, havalandırma)
- Mevsimler ve kar
- Hava olayları (yağmur, sis, fırtına)
- Safranbolu gibi tarihi yerleşimlerde terk edilmiş yapılar ve ganimet
- Tekne ile kıyı boyunca seyahat
- Hikâye / görev sistemi
