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
| Esc | Duraklat (menüyü aç) |

Test arazisinde doğma noktasının doğusunda 30° ve 60° rampalar, güneyinde 0,3 / 0,6 / 1,0 / 2,0 m'lik hareket parkuru blokları bulunur; 45°'den dik yamaçlara tırmanılamaz.

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

Veri hattı (Faz 2 ile birlikte gelecek): `tools/` klasörü, Python 3.11+ ve `tools/requirements.txt`.

## Yayın

`main` dalına yapılan her push, GitHub Actions ile GitHub Pages'e yayınlanır (`.github/workflows/pages.yml`). Depoda **Settings → Pages → Source: GitHub Actions** seçili olmalıdır. Vite `base` ayarı `/anadolu-hayati/` olarak `vite.config.ts` içinde tanımlıdır.

## Veri Kaynakları ve Atıflar

Oyun aşağıdaki açık verileri kullanacaktır (veri hattı Faz 2'de eklenir). Atıflar oyunun içinde de gösterilecektir.

| Veri         | Kaynak                                                                                | Lisans / Atıf                                |
| ------------ | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| Yükseklik    | [Copernicus GLO-30 DEM](https://registry.opendata.aws/copernicus-dem/) (AWS Open Data) | Copernicus lisansı — atıf zorunlu            |
| İl sınırları | [geoBoundaries](https://www.geoboundaries.org/) (TUR, ADM1)                           | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Orman, nehir, yol | [OpenStreetMap](https://www.openstreetmap.org/copyright) (Geofabrik Türkiye extract) | [ODbL](https://opendatacommons.org/licenses/odbl/) — © OpenStreetMap katkıcıları |

Yükseklik verisi: _Contains modified Copernicus DEM GLO-30 data (© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; all rights reserved)._
