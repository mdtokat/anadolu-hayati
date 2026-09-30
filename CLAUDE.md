# CLAUDE.md — Proje Rehberi

Bu dosya Claude Code'un her oturumda ilk okuması gereken dosyadır. Projenin amacını, mimarisini, kurallarını ve mevcut durumunu tanımlar.

## Proje Özeti

Türkiye'nin **ölçekli gerçek coğrafi verisi** üzerinde geçen, tarayıcıda çalışan 3D bir hayatta kalma oyunu. Harita kademeli olarak büyür: ilk bölge **Zonguldak – Bartın – Karabük**, ardından komşu iller eklenir.

- **Dil:** Kullanıcıyla iletişim Türkçe. Kod tanımlayıcıları (değişken, fonksiyon, dosya adları) İngilizce. Kod yorumları Türkçe olabilir.
- **Hedef platform:** Masaüstü tarayıcı (Chrome, Firefox, Edge). Mobil şimdilik kapsam dışı.
- **Yayın:** GitHub Pages (GitHub Actions ile otomatik).

## Mevcut Durum

> Her faz bitiminde bu bölüm güncellenmelidir.

- **Aktif faz:** Faz 3 — Hayatta Kalma Çekirdeği (kod ve birim testler tamam; elle doğrulama bekliyor: gerçek GPU'lu masaüstünde 60 FPS ve oyun hissi/denge — açlık/susuzluk hızları, gece soğuğu; ayrıca Faz 1'in "eğimlerde doğal his" ve 60 FPS ile Faz 2'nin 60 FPS ve "Yenice ormanları" görsel tanınırlığı kriterleri)
- **Tamamlanan fazlar:** Faz 0 — Kurulum; Faz 1 — Oynanabilir Prototip; Faz 2 — Gerçek Arazi (üçü de main'e birleşti; açık kalan elle-doğrulama kriterleri yukarıda)
- **Bilinen sorunlar / notlar:**
  - **Bölge verisi commit'li** (`public/data/regions/zonguldak-bartin-karabuk/`, ~3,7 MB). Yeniden üretmek için `tools/` komutlarını çalıştır (bkz. Komutlar). Testler (`tests/region*.test.ts` vb.) bu gerçek dosyalara bağlıdır.
  - **Eğim ölçeği:** Yatay 1:50, dikey 1:15 olduğundan gerçek yamaçlar oyunda ×3,3 dikleşir; 100 m ızgarada kara alanının yalnızca ~%64'ü 45°'nin altındadır (60° ile ~%93). Bu yüzden gerçek bölgede `REGION_PLAYER.maxSlopeDeg = 60` (Faz 1 arenasında 45°). Dik yamaçta yatay hız cos²θ ile düşer (55°'de ≈ 2,3 m/s); yeni bir hız modeli yazılmadı, "his" elle doğrulanmalı. `VERTICAL_SCALE` yalnızca `config.ts`'dedir, veri gerçek metredir.
  - **Deniz:** Heightmap'te deniz 0 m'dir (sözleşme). Oyunda `RegionHeightSource` deniz hücrelerini kıyıdan uzaklığa göre çalışma zamanında çukurlaştırır (`SEABED`); dolayısıyla deniz altında `elevationAt` negatiftir, HUD rakımı 0'a sıkıştırır. Su düzlemi `WATER.level = 0,02` yüksekliğindedir. Yüzme/boğulma yok (denizde de arazi gibi yürünür; ileri bir faza ertelendi).
  - **Arazi örtüsü (Faz 4):** Zemin rengi `landcover.bin` sınıfından gelir (orman, çalı, çayır, tarım, çıplak, yerleşim, kar, sulak alan; renkler `TERRAIN_LOOK.cover`). Sınıf ağırlıkları iki RGBA dokuda (hücre merkezi, lineer filtre) shader'a verilir; sınıfsız yer (deniz, veri yok) eski rakım/eğim renginde kalır; ormanlık/çalılık yerde kaya rengi `rockCoverDamp` kadar zayıflar (×3,3 dikleşen yamaçlar gri kayaya dönmesin). Sınıflar 100 m hücre çözünürlüğündedir (oyunda 2 m); ESA WorldCover 10 m'dir, ince orman kenarları kaybolur. Copernicus GLO-30 bir yüzey modelidir (DSM); ağaç yükseklikleri araziye karışmıştır. `landcover.bin` yoksa shader eski renkte çalışır.
  - **Chunk/LOD:** 128×128 hücrelik chunk'lar (bölgede 13×10), LOD0–3, dört kenarda etek. LOD mesafeleri `CHUNK.lodDistances = [130, 350, 900]`; Faz 2'de en kötü durumda 95 draw call, ~411 bin üçgen; Faz 3 sonrası (gökyüzü kubbesi + 2 su mesh'i) 98 draw call, ~538 bin üçgen ölçüldü (headless yazılımsal WebGL; gerçek FPS ölçülmedi). Fark, kırpılmayan tatlı su mesh'lerinden gelir (~127 bin üçgen); performans sorunu olursa suyu chunk başına bölmek ilk hamle. Performans sorunu olursa önce bu eşikleri ve `RENDER.maxPixelRatio`'yu ayarla. Collider'lar yalnızca oyuncuya 160 m içindeki chunk'lar için vardır.
  - **İl sınırı çizgisi** araziye LOD0 yüksekliğinden yapıştırılır; uzak (kaba) LOD'larda yer yer arazinin altında kalabilir.
  - **Dev araçları** (üretimde yok): `window.__game` (`survival`, `player`, `world`…), 1–5 tuşlarıyla ışınlanma (`TELEPORTS`), `[` / `]` ile saati ±1 saat sarma, `K` ile canı ve suyu sıfırlama (ölüm ekranı), FPS ve debug HUD'u. `?world=test` Faz 1 test arenasını açar (karakter kontrolü regresyonu için).
  - **Faz 3 hayatta kalma modeli** (saf mantık, `src/survival/`; sabitler `config.ts` → `CLOCK`, `CLIMATE`, `SURVIVAL`, `RESPAWN`): göstergeler 0–100 (sağlık, tokluk, su, enerji) ve vücut ısısı (°C); süreler **gerçek saniye** cinsindendir, oyun günü ise `CLOCK.dayLengthSeconds` (varsayılan 24 gerçek dk = 1 oyun günü; başlangıç 09:00, yılın 265. günü). Ölçülen davranış: hiçbir şey yapmayan oyuncu ~20 dk'da susuzluktan ölür; kıyıda gece 4 saat güvenli; rakım arttıkça gece ölümcüldür (500 m'de yatarak bir gece can ~98, 1000 m ~39, ≥1500 m tek gecede ölümcül; yürümek ısıtır). İklim yaklaşıktır (mevsim + gün içi sinüs − 6,5 °C/km); ayarlanırsa `tests/vitals.test.ts` kabul simülasyonlarını yeniden çalıştır.
  - **Yemek yok:** Tokluk düşer ama doldurmanın yolu Faz 4'te (toplama/pişirme) gelecek; şimdilik yalnızca su içilebilir (tatlı su kenarında `E` basılı tut). Deniz suyu içilmez. HUD'da "Tokluk/Su" adları kullanılır (açlık/susuzluğun tersi).
  - **Tatlı su verisi:** `features.json` yalnızca `water` katmanını taşır (Overture Maps `base/water`, OSM türevi, ODbL). Gerçek nehirler oyunda 0,1–0,6 m genişliğinde kalacağından çizim genişlikleri ve içme mesafesi `FRESH_WATER`'da abartılmıştır (nehir 3 m, dere 1,2 m, kanal 1,5 m; erişim 3,5 m). Su şeritleri/yüzeyleri araziye LOD0 yüksekliğinden yapıştırılır; uzak LOD'larda yer yer arazinin altında kalabilir. `tools/fetch_water.py` HTTP Range ile ~150 MB indirir (~3 dk); ham çıktı `tools/raw/water/` altında, commit edilmez.
  - **Gökyüzü ve ışık:** `world/skyModel.ts` güneş yüksekliğinden renk/yoğunluk üretir (saf, testli); `SkyDome` gradyan, yıldız, güneş/ay diskini çizer; `Environment.setSun` ışıkları ve sisi günceller. Ay güneşin tam karşısındadır (evre yok). Gece bilerek okunaklı tutulur (`SKY.ambientNight`, `SKY.moonIntensity`).
  - **Ölüm ve yeniden doğma:** Ölünce oyun donar, fare kilidi bırakılır, ölüm ekranı (duraklatma menüsünün üstünde) çıkar; "Yeniden Doğ" göstergeleri doldurur, saat kesintisiz sürer, oyuncu hedef illerde deterministik-rastgele (n. ölüm için sabit tohum) güvenli bir noktaya taşınır.
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
├─ docs/                    # Ayrıntılı plan/tasarım belgeleri (ör. faz-4-paralel-plan.md)
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

**`features.json`** — Su ve (Faz 4+) orman/yerleşim gibi haritadaki özellikler; koordinatlar oyun X/Z'sinde (2 ondalık, sadeleştirilmiş, ızgaraya kırpılmış). `meta.json` içindeki `features` listesi hangi katmanların bulunduğunu söyler (Faz 3: `["water"]`); yeni katmanlar aynı dosyaya eklenir.
```json
{ "version": 1,
  "water": {
    "lines":    [{ "kind": "river|stream|canal", "name": "Filyos Çayı", "intermittent": true, "xz": [x0, z0, x1, z1, ...] }],
    "polygons": [{ "kind": "lake|reservoir|pond|water", "name": "…", "rings": [[x0, z0, ...], /* delikler */] }],
    "points":   [{ "kind": "spring", "name": "…", "x": 0, "z": 0 }] } }
```
Deniz dahil değildir (deniz heightmap'in 0 m seviyesidir); yüzme havuzu, atık su, hendek/drenaj elenir. Kaynak: Overture Maps `base/water` (OSM türevi, **ODbL-1.0**); `features.json` da ODbL kapsamındadır ve © OpenStreetMap katkıcıları atfı gerekir.

**`landcover.bin`** (Faz 4) — Arazi örtüsü sınıfları: hücre başına 1 bayt (`Uint8Array`), `heightmap.bin` ile **aynı ızgara ve sıra** (`gridWidth × gridHeight`, satır 0 kuzeyde). Değer, `meta.json` içindeki `landcover.classes` listesinin indeksidir: `["none","forest","shrub","grass","crop","barren","urban","snow","wetland"]` (0 = veri yok / deniz; liste yalnızca sona eklenir; oyun listeyi kendi tablosuyla karşılaştırır, uyuşmazsa hata verir). Kaynak: Overture `base/land_cover` çokgenleri (ESA WorldCover 2021, CC BY 4.0); her 100 m hücre 4×4 alt hücreyle rasterleştirilir, en çok alan kaplayan sınıf kazanır (kaplama < %25 ise `none`). `meta.json`: `"landcover": {"file": "landcover.bin", "classes": [...]}`; dosya yoksa alan da yoktur.

Tek bir dosya 20 MB'ı geçmemeli. Geçerse chunk'lara bölünmeli.

## Veri Kaynakları ve Lisanslar

| Veri | Kaynak | Lisans / Atıf |
|---|---|---|
| Yükseklik | Copernicus GLO-30 DEM (AWS Open Data: `copernicus-dem-30m`) | Copernicus lisansı — atıf zorunlu |
| İl sınırları | geoBoundaries (TUR, ADM1) | CC BY 4.0 — atıf zorunlu |
| Nehir, göl, kaynak | Overture Maps `base/water` (OSM türevi; `tools/fetch_water.py`) | ODbL-1.0 — © OpenStreetMap katkıcıları, atıf zorunlu |
| Arazi örtüsü (orman, çalı, çayır, tarım, yerleşim) | ESA WorldCover 2021, Overture Maps `base/land_cover` dağıtımıyla (`tools/fetch_landcover.py`); Geofabrik/Overpass bu ortamdan erişilemiyor | CC BY 4.0 — © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium |
| Yol (ileri faz) | OSM | ODbL — atıf zorunlu |

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
python fetch_water.py zonguldak-bartin-karabuk   # Overture su katmanı (HTTP Range; ~150 MB indirir, ~3 dk) → tools/raw/water/
python fetch_landcover.py zonguldak-bartin-karabuk # Overture arazi örtüsü / ESA WorldCover (HTTP Range) → tools/raw/landcover/
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
