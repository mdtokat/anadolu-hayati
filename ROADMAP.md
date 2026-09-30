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
- [ ] GitHub Pages linkinde sahne görünüyor

---

## Faz 1 — Oynanabilir Prototip
**Branch:** `faz-1-prototip`
**Amaç:** Düz bir dünyada iyi hissettiren karakter kontrolü.

Görevler:
- [ ] Rapier fizik entegrasyonu (`physics/` sarmalayıcısı, WASM başlatma)
- [ ] Input sistemi (klavye + fare, pointer lock)
- [ ] Karakter kontrolcüsü: yürüme (WASD), koşma (Shift), zıplama (Space), eğim limiti
- [ ] Birinci şahıs kamera; `V` ile üçüncü şahıs geçişi
- [ ] Test ortamı: engebeli prosedürel zemin + birkaç engel
- [ ] Basit HUD iskeleti (HTML overlay)
- [ ] Duraklatma menüsü (Esc)

Kabul kriterleri:
- [ ] Karakter eğimlerde doğal hareket ediyor, dik yamaçlara tırmanamıyor
- [ ] 60 FPS korunuyor
- [ ] Input ve karakter hız hesapları için birim testler var

---

## Faz 2 — Gerçek Arazi
**Branch:** `faz-2-gercek-arazi`
**Amaç:** Üç ilin gerçek yükseklik verisiyle yürünebilir arazisi.

Veri hattı (`tools/`):
- [ ] `requirements.txt` ve kurulum talimatı
- [ ] `fetch_dem.py`: Copernicus GLO-30 karolarını indirir (bu bölge için N40–N41 × E031–E033, 6 karo)
- [ ] `fetch_boundaries.py`: geoBoundaries TUR ADM1 indirir, üç ili süzer
- [ ] `build_region.py`: karoları birleştirir → EPSG:32636'ya dönüştürür → 100 m ızgaraya örnekler → denizi 0'a kırpar → `heightmap.bin` + `meta.json` + `provinces.geojson` üretir
- [ ] Bölge tanımları bir config dosyasında (`tools/regions.yaml`: id, il listesi, sınır kutusu)

Oyun tarafı:
- [ ] `data/` altında bölge yükleyici (meta + heightmap)
- [ ] Chunk sistemi: arazi 128×128 hücrelik parçalara bölünür, oyuncuya yakın olanlar yüklenir
- [ ] Basit LOD (uzak chunk'lar daha düşük çözünürlükte)
- [ ] Rapier heightfield collider'ları (sadece yakın chunk'lar)
- [ ] Rakım ve eğime göre doku karışımı (kum, çim, orman zemini, kaya)
- [ ] Deniz düzlemi (Karadeniz) ve basit su shader'ı
- [ ] İl sınırlarının yerde ince çizgi olarak gösterimi (açılıp kapanabilir)
- [ ] HUD: bulunulan il adı ve gerçek rakım (m)
- [ ] Geliştirici kısayolu: harita üzerinde belirli bir noktaya ışınlanma (örn. Zonguldak merkez, Safranbolu, Amasra)

Kabul kriterleri:
- [ ] Oyuncu üç il boyunca kesintisiz yürüyebiliyor
- [ ] Amasra kıyısı, Filyos vadisi ve Yenice ormanları bölgesi tanınabilir biçimde görünüyor
- [ ] Koordinat dönüşümü (gerçek ↔ oyun) için birim testler var
- [ ] Heightmap okuma ve chunk indeksleme için birim testler var
- [ ] 60 FPS hedefi korunuyor

---

## Faz 3 — Hayatta Kalma Çekirdeği
**Branch:** `faz-3-hayatta-kalma`
**Amaç:** Oyunu oyun yapan temel baskı mekanikleri.

Görevler:
- [ ] `survival/` altında saf mantık: sağlık, açlık, susuzluk, yorgunluk
- [ ] Gece-gündüz döngüsü (ayarlanabilir gün uzunluğu), güneş/ay ışığı, gökyüzü renk geçişleri
- [ ] Sıcaklık modeli: saat + rakım (+ ileride mevsim) → vücut ısısına etki
- [ ] Tatlı su kaynağından (nehir, göl) su içme
- [ ] Ölüm ve yeniden doğma (bölge içinde rastgele güvenli nokta)
- [ ] HUD göstergeleri

Kabul kriterleri:
- [ ] Hiçbir şey yapmayan oyuncu makul sürede (ayarlanabilir) ölüyor
- [ ] Yüksek rakımda gece belirgin biçimde daha tehlikeli
- [ ] Tüm istatistik hesapları için birim testler var

---

## Faz 4 — Toplama ve Üretim
**Branch:** `faz-4-toplama-uretim`
**Amaç:** Dünyayla etkileşim ve ilerleme hissi.

Görevler:
- [ ] Veri hattı: OSM'den orman, nehir, göl, yerleşim verisi → `features.json`
- [ ] OSM orman poligonlarına göre seed'li ağaç yerleştirme (instanced mesh)
- [ ] Kaya, çalı, yenebilir bitki yerleştirme (biyoma göre)
- [ ] Toplama etkileşimi (bakılan nesneye `E`)
- [ ] Envanter sistemi (ağırlık/slot limiti)
- [ ] Crafting: taş balta, ateş, basit barınak, su kabı
- [ ] Ateşin sıcaklık etkisi, barınağın uyku/yorgunluk etkisi

Kabul kriterleri:
- [ ] Ormanlar gerçek orman alanlarıyla örtüşüyor
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
