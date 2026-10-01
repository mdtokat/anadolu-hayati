# Anadolu Hayatı

Türkiye'nin **ölçekli gerçek coğrafi verisi** üzerinde geçen, tarayıcıda çalışan 3D bir hayatta kalma oyunu. Harita kademeli olarak büyür: ilk bölge **Zonguldak – Bartın – Karabük**, ardından komşu iller eklenir.

> Proje geliştirme aşamasındadır. **Faz 0–8** kodu tamamlandı (açık kalan elle doğrulamalar için [docs/faz-8-elle-dogrulama.md](docs/faz-8-elle-dogrulama.md) ve [CLAUDE.md](CLAUDE.md) "Mevcut Durum"). Harita genişletmesi şimdilik durduruldu; **pilot il Zonguldak**'tır: yeni oyun ve ölüm sonrası yeniden doğma Zonguldak'ta olur, ilçe/yer adları (Kozlu, Kilimli, Karadeniz Ereğli, Alaplı, Çaycuma, Devrek, Gökçebey, Filyos vadisi…) yaklaşınca bildirilir, ilk dakikalarda kısa ipuçları (Ayarlar'dan kapatılabilir) yol gösterir. Gerçek Zonguldak–Bartın–Karabük–Düzce–Bolu arazisinde (Abant Gölü ve Yedigöller dahil) kesintisiz yürürsün; gece-gündüz döngüsü, rakıma bağlı soğuk, susuzluk/açlık/yorgunluk, nehirden su içme, ölüm ve yeniden doğma var. Arazi örtüsüne göre ormanlar, çalılar ve kayalar yerleşir; dal, taş, yemiş ve mantar toplayıp taş balta, taş mızrak, deri yelek, kamp ateşi ve sundurma üretirsin. Ormanlarda karaca, yaban domuzu, kurt ve boz ayı dolaşır: karaca kaçar, domuz ve ayı dokunulunca saldırır, kurtlar geceleri sürü hâlinde avlanır; ateşin başında hayvanlardan korunursun. Avladığın hayvanı keser, ateşte pişirir ve yersin (çiğ et riskli). Hayvanların dağılımı ve davranışı **yaklaşıktır** (oyun dengesi için; bilimsel dağılım haritası değildir). Oyunu birden fazla yuvaya kaydedip yükleyebilir (otomatik kayıt dahil), grafik kalitesini, fare hassasiyetini ve sesi ayarlayabilirsin; il sınırlarını geçince bildirim çıkar, rüzgâr, deniz, orman ve gece sesleri konumuna göre değişir (hepsi kodla sentezlenir). Faz planı için [ROADMAP.md](ROADMAP.md), proje kuralları için [CLAUDE.md](CLAUDE.md) dosyalarına bakın.

**Canlı sürüm:** https://mdtokat.github.io/anadolu-hayati/

## Kontroller

| Tuş | Eylem |
| --- | --- |
| Ana menü | **Devam** (son kayıt), **Yeni Oyun**, **Yükle**, **Ayarlar**, **Krediler**; oyuna girince fare yakalanır |
| W A S D (veya ok tuşları) | Yürü |
| Shift | Koş |
| Boşluk | Zıpla |
| E (basılı tut) | Öncelik sırasıyla: bakılan nesneyi topla (dal, taş, yemiş, mantar; baltayla ağaç kes) › bakılan leşi kes › yanık ateşin yanında çiğ eti pişir › ateşe yakıt at › tatlı su kenarında su iç (susuzluğun yoksa boş su kabını doldurur) |
| Sol tık | Bakılan canlıya saldır (yumruk, taş balta, taş mızrak); yerleştirme hayaleti açıkken kurar |
| I veya Tab | Envanter ve üretim paneli (oyun donar): seçili eşyayı ye, dolu su kabından iç ya da at |
| F | Hızlı yemek (tokluğu en çok artıran yiyecek) |
| C / G | Kamp ateşi / sundurma yerleştirme hayaleti (aynı tuş iptal eder); sol tık kurar |
| Fare | Etrafa bak |
| V | Birinci / üçüncü şahıs kamera |
| B | İl sınırı çizgilerini aç/kapa |
| Esc | Duraklat: **Devam Et**, **Kaydet**, **Yükle**, **Ayarlar** (grafik kalitesi, fare hassasiyeti, ses, ipuçları), **Krediler**, **Ana Menüye Dön** |

Oyun her 2 dakikada ve sekme gizlenirken **otomatik kayıt** yuvasına kaydeder; kayıtlar tarayıcıda (IndexedDB) tutulur ve sürümlüdür. Ayarlar tarayıcıda (`localStorage`) saklanır.

Gerçek bölgede 60°'den dik yamaçlara tırmanılamaz. Geliştirme modunda (`npm run dev`) 1–9 ve 0 tuşları on noktaya ışınlar (Zonguldak, Safranbolu, Amasra, Filyos, Yenice, Düzce, Bolu, Abant Gölü, Yedigöller, Akçakoca); **Shift + 1–9, 0** Zonguldak'ın on yerine ışınlar (Zonguldak merkez, Kozlu, Kilimli, Çatalağzı, Karadeniz Ereğli, Alaplı, Çaycuma, Filyos vadisi, Devrek, Gökçebey). `?world=test` adresi Faz 1'in test arenasını açar (30°/60° rampalar, 0,3 / 0,6 / 1,0 / 2,0 m'lik hareket parkuru).

## Gereksinimler

- Node.js **22.12 veya üzeri** (`.nvmrc` içinde `22`)
- Masaüstü tarayıcı (Chrome, Firefox, Edge) — mobil şimdilik kapsam dışı

## Çalıştırma

```bash
npm install         # bağımlılıkları kur
npm run dev         # geliştirme sunucusu (sol üstte FPS sayacı görünür)
npm run build       # üretim derlemesi (dist/)
npm run preview     # derlemeyi yerelde önizle
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run format      # Prettier ile biçimlendir
```

### Veri hattı (`tools/`)

Oyunun okuduğu işlenmiş dünya verisi (`public/data/world/bati-karadeniz/`: `world.json` manifesti + 512×512'lik karolar) depoda hazırdır; yeniden üretmek istersen Python 3.11+ gerekir:

```bash
cd tools
pip install -r requirements.txt
python fetch_dem.py bati-karadeniz        # Copernicus GLO-30 karoları → tools/raw/dem/ (8 karo, ~290 MB, commit edilmez)
python fetch_boundaries.py                # geoBoundaries TUR ADM1 → tools/raw/boundaries/
python fetch_water.py bati-karadeniz      # Overture su katmanı (HTTP Range, ~185 MB) → tools/raw/water/
python fetch_landcover.py bati-karadeniz  # Overture arazi örtüsü / ESA WorldCover (HTTP Range, ~320 MB) → tools/raw/landcover/
python build_world.py                     # → public/data/world/bati-karadeniz/
python qa_world.py                        # kalite raporu (karo tablosu, il kapsamı, dikiş sürekliliği, su)
python -m pytest tests                    # Python birim testleri
```

Dünya tanımı `tools/world.yaml`'dadır (hedef iller, komşuların otomatik seçimi, sınır kutusu, pay); kafes ve karo boyutu `src/config.ts` → `WORLD` ile `tools/worldlib.py`'de sabittir. Faz 2–6'nın tek-parça bölge biçimi Faz 7 birleştirmesinde (7.10) kaldırıldı. Koordinat ve veri formatı sözleşmesi için [CLAUDE.md](CLAUDE.md)'ye bakın.

## Yayın

`main` dalına yapılan her push, GitHub Actions ile GitHub Pages'e yayınlanır (`.github/workflows/pages.yml`). Depoda **Settings → Pages → Source: GitHub Actions** seçili olmalıdır. Vite `base` ayarı `/anadolu-hayati/` olarak `vite.config.ts` içinde tanımlıdır.

## Veri Kaynakları ve Atıflar

Oyun aşağıdaki açık verileri kullanır. Atıflar oyunun içinde (menü → **Krediler**) de gösterilir.

| Veri         | Kaynak                                                                                | Lisans / Atıf                                |
| ------------ | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| Yükseklik    | [Copernicus GLO-30 DEM](https://registry.opendata.aws/copernicus-dem/) (AWS Open Data) | Copernicus lisansı — atıf zorunlu            |
| İl sınırları | [geoBoundaries](https://www.geoboundaries.org/) (TUR, ADM1)                           | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Akarsu, göl (tatlı su) | [OpenStreetMap](https://www.openstreetmap.org/copyright), [Overture Maps](https://overturemaps.org/) `base/water` dağıtımı üzerinden | [ODbL](https://opendatacommons.org/licenses/odbl/) — © OpenStreetMap katkıcıları |
| Arazi örtüsü (orman, çalı, çayır, tarım, yerleşim) | [ESA WorldCover 2021](https://esa-worldcover.org/), [Overture Maps](https://overturemaps.org/) `base/land_cover` dağıtımı üzerinden | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium |
| Yol (ileri faz) | [OpenStreetMap](https://www.openstreetmap.org/copyright) | [ODbL](https://opendatacommons.org/licenses/odbl/) — © OpenStreetMap katkıcıları |

Yükseklik verisi: _Contains modified Copernicus DEM GLO-30 data (© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; all rights reserved)._

Yazılım: [Three.js](https://github.com/mrdoob/three.js) (MIT) ve [Rapier](https://github.com/dimforge/rapier) (Apache-2.0).
