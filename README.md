# Anadolu Hayatı

Türkiye'nin **ölçekli gerçek coğrafi verisi** üzerinde geçen, tarayıcıda çalışan 3D bir hayatta kalma oyunu. Harita kademeli olarak büyür: ilk bölge **Zonguldak – Bartın – Karabük**, ardından komşu iller eklenir.

> Proje geliştirme aşamasındadır. **Faz 0 — Kurulum** tamamlandı; **Faz 1 — Oynanabilir Prototip** kodu hazır: engebeli bir test arazisinde Rapier fiziğiyle yürüyebildiğin, koşup zıplayabildiğin birinci/üçüncü şahıs prototip. Faz planı için [ROADMAP.md](ROADMAP.md), proje kuralları için [CLAUDE.md](CLAUDE.md) dosyalarına bakın.

**Canlı sürüm:** https://mdtokat.github.io/anadolu-hayati/

## Kontroller

| Tuş | Eylem |
| --- | --- |
| Tıkla / **Başla** | Oyunu başlat, fareyi yakala |
| W A S D (veya ok tuşları) | Yürü |
| Shift | Koş |
| Boşluk | Zıpla |
| Fare | Etrafa bak |
| V | Birinci / üçüncü şahıs kamera |
| B | İl sınırı çizgilerini aç/kapa |
| Esc | Duraklat (menüyü aç) |

Gerçek bölgede 60°'den dik yamaçlara tırmanılamaz. Geliştirme modunda (`npm run dev`) 1–5 tuşları Zonguldak, Safranbolu, Amasra, Filyos ve Yenice'ye ışınlar. `?world=test` adresi Faz 1'in test arenasını açar (30°/60° rampalar, 0,3 / 0,6 / 1,0 / 2,0 m'lik hareket parkuru).

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

Oyunun okuduğu işlenmiş bölge verisi (`public/data/regions/`) depoda hazırdır; yeniden üretmek istersen Python 3.11+ gerekir:

```bash
cd tools
pip install -r requirements.txt
python fetch_dem.py                 # Copernicus GLO-30 karoları → tools/raw/dem/ (~216 MB, commit edilmez)
python fetch_boundaries.py          # geoBoundaries TUR ADM1 → tools/raw/boundaries/
python build_region.py              # → public/data/regions/zonguldak-bartin-karabuk/
python -m pytest tests              # Python birim testleri
```

Bölge tanımı `tools/regions.yaml`'dadır. Koordinat ve veri formatı sözleşmesi için [CLAUDE.md](CLAUDE.md)'ye bakın.

## Yayın

`main` dalına yapılan her push, GitHub Actions ile GitHub Pages'e yayınlanır (`.github/workflows/pages.yml`). Depoda **Settings → Pages → Source: GitHub Actions** seçili olmalıdır. Vite `base` ayarı `/anadolu-hayati/` olarak `vite.config.ts` içinde tanımlıdır.

## Veri Kaynakları ve Atıflar

Oyun aşağıdaki açık verileri kullanır. Atıflar oyunun içinde (duraklatma menüsü) de gösterilir.

| Veri         | Kaynak                                                                                | Lisans / Atıf                                |
| ------------ | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| Yükseklik    | [Copernicus GLO-30 DEM](https://registry.opendata.aws/copernicus-dem/) (AWS Open Data) | Copernicus lisansı — atıf zorunlu            |
| İl sınırları | [geoBoundaries](https://www.geoboundaries.org/) (TUR, ADM1)                           | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Akarsu, göl (tatlı su) | [OpenStreetMap](https://www.openstreetmap.org/copyright), [Overture Maps](https://overturemaps.org/) `base/water` dağıtımı üzerinden | [ODbL](https://opendatacommons.org/licenses/odbl/) — © OpenStreetMap katkıcıları |
| Orman, yol (Faz 4) | [OpenStreetMap](https://www.openstreetmap.org/copyright) | [ODbL](https://opendatacommons.org/licenses/odbl/) — © OpenStreetMap katkıcıları |

Yükseklik verisi: _Contains modified Copernicus DEM GLO-30 data (© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; all rights reserved)._
