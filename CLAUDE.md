# CLAUDE.md — Proje Rehberi

Bu dosya Claude Code'un her oturumda ilk okuması gereken dosyadır. Projenin amacını, mimarisini, kurallarını ve mevcut durumunu tanımlar.

## Proje Özeti

Türkiye'nin **ölçekli gerçek coğrafi verisi** üzerinde geçen, tarayıcıda çalışan 3D bir hayatta kalma oyunu. Harita kademeli olarak büyür: ilk bölge **Zonguldak – Bartın – Karabük**, ardından komşu iller eklenir.

- **Dil:** Kullanıcıyla iletişim Türkçe. Kod tanımlayıcıları (değişken, fonksiyon, dosya adları) İngilizce. Kod yorumları Türkçe olabilir.
- **Hedef platform:** Masaüstü tarayıcı (Chrome, Firefox, Edge). Mobil şimdilik kapsam dışı.
- **Yayın:** GitHub Pages (GitHub Actions ile otomatik).

## Mevcut Durum

> Her faz bitiminde bu bölüm güncellenmelidir.

- **Aktif faz:** Faz 2 — Gerçek Arazi (kod ve birim testler tamam; iki kabul kriteri elle doğrulama bekliyor: 60 FPS ve "Yenice ormanları" görsel tanınırlığı; ayrıca Faz 1'in "eğimlerde doğal his" ve 60 FPS kriterleri gerçek GPU'lu masaüstünde)
- **Tamamlanan fazlar:** Faz 0 — Kurulum; Faz 1 — Oynanabilir Prototip (main'e birleşti, iki kriter açık: yukarıya bak)
- **Bilinen sorunlar / notlar:**
  - **Bölge verisi commit'li** (`public/data/regions/zonguldak-bartin-karabuk/`, ~3,7 MB). Yeniden üretmek için `tools/` komutlarını çalıştır (bkz. Komutlar). Testler (`tests/region*.test.ts` vb.) bu gerçek dosyalara bağlıdır.
  - **Eğim ölçeği:** Yatay 1:50, dikey 1:15 olduğundan gerçek yamaçlar oyunda ×3,3 dikleşir; 100 m ızgarada kara alanının yalnızca ~%64'ü 45°'nin altındadır (60° ile ~%93). Bu yüzden gerçek bölgede `REGION_PLAYER.maxSlopeDeg = 60` (Faz 1 arenasında 45°). Dik yamaçta yatay hız cos²θ ile düşer (55°'de ≈ 2,3 m/s); yeni bir hız modeli yazılmadı, "his" elle doğrulanmalı. `VERTICAL_SCALE` yalnızca `config.ts`'dedir, veri gerçek metredir.
  - **Deniz:** Heightmap'te deniz 0 m'dir (sözleşme). Oyunda `RegionHeightSource` deniz hücrelerini kıyıdan uzaklığa göre çalışma zamanında çukurlaştırır (`SEABED`); dolayısıyla deniz altında `elevationAt` negatiftir, HUD rakımı 0'a sıkıştırır. Su düzlemi `WATER.level = 0,02` yüksekliğindedir. Yüzme/boğulma yok (Faz 3).
  - **Orman örtüsü yok:** Zemin renklendirmesi rakım ve eğime bağlı prosedürel bir karışımdır; orman poligonları OSM ile Faz 4'te gelecek. Copernicus GLO-30 bir yüzey modelidir (DSM); ağaç yükseklikleri araziye karışmıştır.
  - **Chunk/LOD:** 128×128 hücrelik chunk'lar (bölgede 13×10), LOD0–3, dört kenarda etek. LOD mesafeleri `CHUNK.lodDistances = [130, 350, 900]`; en kötü durumda 95 draw call, ~411 bin üçgen ölçüldü (headless yazılımsal WebGL; gerçek FPS ölçülmedi). Performans sorunu olursa önce bu eşikleri ve `RENDER.maxPixelRatio`'yu ayarla. Collider'lar yalnızca oyuncuya 160 m içindeki chunk'lar için vardır.
  - **İl sınırı çizgisi** araziye LOD0 yüksekliğinden yapıştırılır; uzak (kaba) LOD'larda yer yer arazinin altında kalabilir.
  - **Dev araçları** (üretimde yok): `window.__game`, 1–5 tuşlarıyla ışınlanma (`TELEPORTS`), FPS ve debug HUD'u. `?world=test` Faz 1 test arenasını açar (karakter kontrolü regresyonu için).
  - TypeScript **6.0.3'e sabit**: `typescript-eslint` 8.71 `typescript <6.1.0` istiyor; 7.x'e geçiş `typescript-eslint` uyumu gelene kadar ertelendi.
  - Prettier yalnızca kod/config dosyalarını biçimlendirir; `*.md` belgeleri elle yazılır (`.prettierignore`).
  - Rapier WASM'ı base64 gömülü olduğu için `rapier` chunk'ı ~4,3 MB ham / ~1,7 MB gzip. Yükleme bütçesini (< 10 sn) izle; gerekirse WASM'ı ayrı dosya olarak sunmayı değerlendir.
  - Karakter: Rapier yamaçta yatay mesafeyi cos²θ kısaltıyor; `Player` çarpışma sonrası hızı yalnızca havadayken veya tırmanılamaz yüzeye çarpınca geri yazar (aksi halde oyuncu yamaca "yapışıyordu"). Bu davranışı değiştirirken `tests/player.test.ts` yamaç testlerine bak.
  - Esc tarayıcıda pointer lock'u kendisi bırakır; duraklatma `pointerlockchange` olayına bağlı. Chrome, Esc'ten hemen sonra kilidi geri vermeyebilir (menüde ipucu gösterilir).
  - Dev modunda `window.__game` hata ayıklama kancası vardır (üretimde yok); headless doğrulamada kullanıldı.
  - Faz 1 arazisi prosedürel test arazisidir (`ProceduralHeightSource`); Faz 2'de gerçek yükseklik verisi aynı `HeightSource` arayüzüne takılacak.
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
  "horizontalScale": 50,
  "sources": ["Copernicus GLO-30 DEM", "geoBoundaries", "OpenStreetMap"],
  "built": "YYYY-MM-DD"
}
```
`horizontalScale` verinin üretildiği yatay ölçeği yazar; oyun yüklerken `config.ts`'deki `HORIZONTAL_SCALE` ile karşılaştırır ve uyuşmazsa hata verir (ölçek değişip veri eski kalırsa sessizce yanlış çalışmasın). Dikey ölçek veriye işlenmez: yükseklikler gerçek metredir, `VERTICAL_SCALE` yalnızca oyunda uygulanır.

**`heightmap.bin`** — Ham `Uint16Array`, little-endian, satır satır (kuzeyden güneye, batıdan doğuya). Değer → metre dönüşümü: `elevation = elevationMin + (v / 65535) * (elevationMax − elevationMin)`. Denizin altı 0'a kırpılır.
**Örneklerin konumu:** Her değer raster **piksel merkezindeki** yüksekliktir; oyunda heightfield köşesi olarak kullanılır. Sütun `c`, satır `r` için oyun konumu `x = (c − (gridWidth − 1) / 2) · cellSizeReal / HORIZONTAL_SCALE`, `z = (r − (gridHeight − 1) / 2) · cellSizeReal / HORIZONTAL_SCALE` (satır 0 kuzeyde, dolayısıyla z negatif). Izgara orijin merkezlidir. 30 m'lik kaynak 100 m'ye **alan ortalamasıyla** örneklenir (tepe yükseklikleri hafif düşer); Copernicus GLO-30 bir yüzey modelidir (DSM), ağaç/bina yüksekliğini içerir.
> Not: 16-bit PNG kullanılmaz; tarayıcı canvas'ı 16-bit görüntüleri 8-bit'e düşürür.

**`provinces.geojson`** — İl sınırları, koordinatları **oyun dünyası X/Z** cinsinden (önceden dönüştürülmüş, 2 ondalık, sadeleştirilmiş), `properties.name` alanı il adı. Ek alanlar: `iso` (TR-67 gibi) ve `inRegion` (bölgenin hedef ili mi `true`, oyuncunun yürüyebildiği komşu il mi `false`). Komşu iller HUD'da adlarının görünmesi içindir.

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

Veri hattı (Faz 2+; Python 3.11+):
```bash
cd tools
pip install -r requirements.txt
python fetch_dem.py zonguldak-bartin-karabuk     # Copernicus GLO-30 karoları → tools/raw/dem/ (~216 MB)
python fetch_boundaries.py                       # geoBoundaries TUR ADM1 → tools/raw/boundaries/
python build_region.py zonguldak-bartin-karabuk  # → public/data/regions/<id>/ (commit edilir)
python -m pytest tests                           # Python birim testleri
```
Bölge tanımları `tools/regions.yaml`'dadır. geoBoundaries dosyaları Git LFS'tedir: `raw.githubusercontent.com` yalnızca işaretçi verir, `fetch_boundaries.py` gerçek dosyayı `media.githubusercontent.com`'dan alır.

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
