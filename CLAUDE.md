# CLAUDE.md — Proje Rehberi

Bu dosya Claude Code'un her oturumda ilk okuması gereken dosyadır. Projenin amacını, mimarisini, kurallarını ve mevcut durumunu tanımlar.

## Proje Özeti

Türkiye'nin **ölçekli gerçek coğrafi verisi** üzerinde geçen, tarayıcıda çalışan 3D bir hayatta kalma oyunu. Harita kademeli olarak büyür: ilk bölge **Zonguldak – Bartın – Karabük**, ardından komşu iller eklenir.

- **Dil:** Kullanıcıyla iletişim Türkçe. Kod tanımlayıcıları (değişken, fonksiyon, dosya adları) İngilizce. Kod yorumları Türkçe olabilir.
- **Hedef platform:** Masaüstü tarayıcı (Chrome, Firefox, Edge). Mobil şimdilik kapsam dışı.
- **Yayın:** GitHub Pages (GitHub Actions ile otomatik).

## Mevcut Durum

> Her faz bitiminde bu bölüm güncellenmelidir.

- **Aktif faz:** Faz 1 — Oynanabilir Prototip (henüz başlanmadı; branch: `faz-1-prototip`)
- **Tamamlanan fazlar:** Faz 0 — Kurulum (PR #1 ile main'e birleşti; Pages yayını doğrulandı: https://mdtokat.github.io/anadolu-hayati/)
- **Bilinen sorunlar / notlar:**
  - TypeScript **6.0.3'e sabit**: `typescript-eslint` 8.71 `typescript <6.1.0` istiyor; 7.x'e geçiş `typescript-eslint` uyumu gelene kadar ertelendi.
  - Prettier yalnızca kod/config dosyalarını biçimlendirir; `*.md` belgeleri elle yazılır (`.prettierignore`).
  - `vite preview` de üretim `base` değerini (`/anadolu-hayati/`) kullanır; yerelde önizleme adresi `http://localhost:4173/anadolu-hayati/`.

## Teknoloji Yığını

| Alan | Seçim |
|---|---|
| Dil | TypeScript (strict mode) |
| Build | Vite |
| 3D | Three.js |
| Fizik | Rapier (`@dimforge/rapier3d-compat`) — Faz 1'de eklenecek |
| Test | Vitest |
| Kod kalitesi | ESLint + Prettier |
| Veri hattı | Python 3.11+ (`tools/` klasörü) — rasterio, geopandas, numpy, pyproj, shapely |
| CI/CD | GitHub Actions → GitHub Pages |

Yeni bir bağımlılık eklemeden önce gerekçesini belirt ve kullanıcıya sor.

## Klasör Yapısı

```
/
├─ CLAUDE.md                # Bu dosya
├─ ROADMAP.md               # Faz planı ve kabul kriterleri
├─ README.md                # Oyuncuya/geliştiriciye kısa tanıtım + veri atıfları
├─ index.html
├─ package.json / tsconfig.json / vite.config.ts
├─ src/
│  ├─ main.ts               # Giriş noktası; sadece Game'i başlatır
│  ├─ config.ts             # Tüm ayarlanabilir sabitler (ölçek, performans vb.)
│  ├─ core/                 # Game loop, zaman, EventBus, input
│  ├─ world/                # Arazi, chunk'lar, su, gökyüzü, il sınırları
│  ├─ player/               # Karakter kontrolü, kamera
│  ├─ physics/              # Rapier sarmalayıcısı
│  ├─ survival/             # Açlık, susuzluk, sağlık, sıcaklık (saf mantık)
│  ├─ items/                # Envanter, crafting (Faz 4+)
│  ├─ creatures/            # Hayvanlar ve yapay zekâ (Faz 5+)
│  ├─ ui/                   # HUD ve menüler (HTML/CSS overlay)
│  ├─ data/                 # Bölge verisi yükleyicileri
│  └─ utils/                # Matematik, seeded random vb.
├─ public/data/regions/     # İşlenmiş bölge verisi (oyunun okuduğu dosyalar)
├─ tools/                   # Python veri işleme scriptleri
│  ├─ requirements.txt
│  ├─ raw/                  # Ham indirilen veri — .gitignore'da, ASLA commit edilmez
│  └─ ...
├─ tests/                   # Vitest testleri
└─ .github/workflows/       # CI ve Pages yayını
```

## Mimari Kurallar

1. **Mantık ile görüntü ayrı.** Hayatta kalma istatistikleri, crafting kuralları, envanter gibi oyun mantığı Three.js'e bağımlı olmayan saf TypeScript fonksiyonları/sınıfları olarak yazılır ve Vitest ile test edilir. Görsel katman bu mantığı sadece okur.
2. **Sistemler EventBus ile konuşur.** Sistemler birbirini doğrudan import edip çağırmak yerine olay yayınlar/dinler (örn. `player:ate`, `time:nightStarted`).
3. **Sabit zaman adımı.** Fizik ve oyun mantığı sabit 60 Hz adımda güncellenir; render ise `requestAnimationFrame` ile serbest çalışır.
4. **Sihirli sayı yok.** Ayarlanabilir her değer `src/config.ts` içinde, açıklamasıyla birlikte durur.
5. **Deterministik rastgelelik.** Ağaç, kaya, hayvan yerleşimi gibi prosedürel içerik seed'li rastgele sayı üreteciyle (`utils/random.ts`) üretilir; aynı seed aynı dünyayı verir.
6. **Kaynak temizliği.** Kaldırılan her mesh için geometry/material/texture `dispose()` edilir (chunk sisteminde kritik).

## Koordinat Sistemi ve Ölçek

Bu bölüm veri hattı (`tools/`) ile oyun (`src/`) arasındaki **sözleşmedir**. Değiştirilmesi gerekirse her iki tarafı da güncelle.

- **Projeksiyon:** Tüm coğrafi veri UTM Zone 36N'ye (**EPSG:32636**) dönüştürülür. (İleride doğu illerine geçildiğinde bölge bazında ele alınacak.)
- **Yatay ölçek:** `HORIZONTAL_SCALE = 50` → 1 oyun metresi = 50 gerçek metre.
- **Dikey ölçek:** `VERTICAL_SCALE = 15` → 1 oyun metresi = 15 gerçek metre. Yataydan daha az sıkıştırılır ki dağlar oyuncu ölçeğinde etkileyici görünsün. Değer `config.ts`'den ayarlanabilir olmalı.
- **Eksenler (Three.js, Y yukarı):** +X = doğu, −Z = kuzey, +Y = yukarı.
- **Orijin:** Bölgenin `meta.json` içindeki `originUtm` noktası (bölge sınır kutusunun merkezi) oyun dünyasında (0, 0, 0)'dır.
  - `x = (easting − originE) / HORIZONTAL_SCALE`
  - `z = −(northing − originN) / HORIZONTAL_SCALE`
  - `y = elevation / VERTICAL_SCALE`
- **Deniz seviyesi:** Oyunda y = 0.
- **Oyuncu boyu:** ~1,8 oyun metresi (gerçek boyut; dünya ölçeklidir, oyuncu değil).

## Bölge Veri Formatı

Her bölge `public/data/regions/<bolge-id>/` altında şu dosyalardan oluşur. İlk bölgenin id'si: `zonguldak-bartin-karabuk`.

**`meta.json`**
```json
{
  "id": "zonguldak-bartin-karabuk",
  "name": "Zonguldak – Bartın – Karabük",
  "crs": "EPSG:32636",
  "originUtm": [0, 0],
  "gridWidth": 0,
  "gridHeight": 0,
  "cellSizeReal": 100,
  "elevationMin": 0,
  "elevationMax": 0,
  "elevationEncoding": "uint16",
  "sources": ["Copernicus GLO-30 DEM", "geoBoundaries", "OpenStreetMap"]
}
```

**`heightmap.bin`** — Ham `Uint16Array`, little-endian, satır satır (kuzeyden güneye, batıdan doğuya). Değer → metre dönüşümü: `elevation = elevationMin + (v / 65535) * (elevationMax − elevationMin)`. Denizin altı 0'a kırpılır.
> Not: 16-bit PNG kullanılmaz; tarayıcı canvas'ı 16-bit görüntüleri 8-bit'e düşürür.

**`provinces.geojson`** — İl sınırları, koordinatları **oyun dünyası X/Z** cinsinden (önceden dönüştürülmüş), `properties.name` alanı il adı.

**`features.json`** (Faz 4+) — OSM kaynaklı orman poligonları, nehirler, yerleşimler; yine oyun koordinatlarında.

Tek bir dosya 20 MB'ı geçmemeli. Geçerse chunk'lara bölünmeli.

## Veri Kaynakları ve Lisanslar

| Veri | Kaynak | Lisans / Atıf |
|---|---|---|
| Yükseklik | Copernicus GLO-30 DEM (AWS Open Data: `copernicus-dem-30m`) | Copernicus lisansı — atıf zorunlu |
| İl sınırları | geoBoundaries (TUR, ADM1) | CC BY 4.0 — atıf zorunlu |
| Orman, nehir, yol | OpenStreetMap (Geofabrik Türkiye extract) | ODbL — atıf zorunlu |

Tüm atıflar README.md'de ve oyunun içinde (ana menü / krediler) gösterilmelidir.

## Komutlar

```bash
npm run dev         # Geliştirme sunucusu
npm run build       # Üretim derlemesi
npm run preview     # Derlemeyi yerelde önizle
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run format      # Prettier (biçimlendir); format:check yalnızca denetler
```

Veri hattı (Faz 2+):
```bash
cd tools
pip install -r requirements.txt
python build_region.py zonguldak-bartin-karabuk
```

## Çalışma Kuralları (Claude Code için)

1. **Önce oku:** Göreve başlamadan önce `ROADMAP.md`'deki aktif fazı ve bu dosyadaki "Mevcut Durum"u kontrol et.
2. **Plan, sonra kod:** Birden fazla dosyaya dokunan işlerde önce kısa bir plan sun, onay al.
3. **Küçük adımlar:** Bir görev = bir anlamlı commit. Çok büyük değişiklikleri alt görevlere böl.
4. **Bitirmeden önce doğrula:** Her görevin sonunda `npm run lint`, `npm run typecheck`, `npm test` ve `npm run build` hatasız geçmeli.
5. **Commit mesajları:** Conventional Commits formatında (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`).
6. **Branch:** Her faz kendi branch'inde (`faz-0-kurulum`, `faz-1-prototip` …). Main'e PR ile birleşir.
7. **Kapsam dışına çıkma:** Aktif fazda olmayan özellikleri ekleme. Fikir varsa ROADMAP.md'deki "Fikir Havuzu"na not düş.
8. **Faz sonu:** ROADMAP.md'de kabul kriterlerini işaretle, bu dosyadaki "Mevcut Durum"u güncelle.
9. **Büyük dosya yok:** `tools/raw/` ve 20 MB üstü dosyalar commit edilmez.

## Performans Bütçesi

- Orta seviye dizüstü bilgisayarda (entegre GPU) **≥ 60 FPS** hedef, **≥ 30 FPS** alt sınır.
- Kare başına draw call < 300.
- İlk yükleme (ilk bölge) < 10 saniye.
- Geliştirme modunda ekranda FPS sayacı (stats) görünür olmalı.
