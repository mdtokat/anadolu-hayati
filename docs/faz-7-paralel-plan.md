# Faz 7 — Paralel Çalışma Planı: Düzce – Bolu genişlemesi (Hesap A: Veri ve karolar · Hesap B: Çalışma zamanı ve oyun)

Bu belge, Faz 7'nin **iki ayrı hesapta (iki oturum) aynı anda** yürütülmesi için hazırlandı. Yöntem Faz 4 ([faz-4-paralel-plan.md](faz-4-paralel-plan.md)) ve Faz 5'tekiyle ([faz-5-paralel-plan.md](faz-5-paralel-plan.md)) aynıdır: önce **küçük bir iskele (7.0)** birleşir, sonra iki hesap birbirinin dosyasına dokunmadan, iskelede sabitlenen **sözleşme** üzerinden çalışır.

> **Durum: Faz 7 tamamlandı (7.0–7.11).** Bu belge tarihsel kayıttır: 7.10'da eski bölge verisi/yükleyicisi/hattı (`public/data/regions/`, `loadRegion`, `build_region.py`, `regions.yaml`, `tile_legacy.py`, `--verify-legacy`) kaldırıldı; metindeki "7.10'a kadar durur" ifadeleri bu nedenle geçmiştir. Güncel durum için `CLAUDE.md` "Mevcut Durum" ve [faz-7-b-olcumler.md](faz-7-b-olcumler.md).

> **Kullanıma başlamadan önce:** `CLAUDE.md` ("Mevcut Durum", "Mimari Kurallar", "Koordinat Sistemi", "Bölge Veri Formatı", "Çalışma Kuralları") ve `ROADMAP.md`'deki Faz 7 bölümünü oku. Kullanıcı seni bu belgeye işaret ederek başlattıysa bu plan onaylanmıştır (CLAUDE.md "Plan, sonra kod" kuralı); plandan sapmak gerekirse uygulamadan önce kullanıcıya sor.

## 0. Özet

| | İş | Hesap | Branch |
|---|---|---|---|
| **7.0** | İskele: sözleşme sabitleri (`WORLD`), tipler (`worldTypes.ts`), kafes matematiği (`lattice.ts`), mutlak kimlikler (`chunkKeys.ts`), `RegionMeta.gridOrigin`, belgeler — **tamamlandı** (bu plan ile aynı PR) | plan sahibi | `faz-7-0-iskele` |
| **7.1–7.4** | **Veri ve karolar:** karo biçimi + yükleyici, eski bölgeyi karola, hattı yeni düzene taşı, Düzce–Bolu verisini üret + QA | **A** | `faz-7-a-veri` |
| **7.5–7.9** | **Çalışma zamanı ve oyun:** ızgara çapası + mutlak kimlikler, manifestten yükleme, kayıt v2 göçü, performans/bellek, Düzce–Bolu içeriği | **B** | `faz-7-b-calisma` |
| **7.10** | Birleştirme: eski bölge verisi/yükleyici temizliği, uçtan uca doğrulama, birleşik performans tablosu | kalan hesap | `faz-7-entegrasyon` |
| **7.11** | Kapanış: ROADMAP, `CLAUDE.md` "Mevcut Durum", README | kalan hesap | (7.10 ile aynı) |

**Kesim mantığı:** A diskteki **veriyi** (Python hattı, karo dosyaları, manifest, TS yükleme katmanı `src/data/`) yapar; B o veriyi **tüketen her şeyi** (dünya, arazi, nesne/canlı kimlikleri, kayıt, oyun içeriği, performans) yapar. Çakışma yüzeyi küçüktür: ikisi de yalnızca §3'teki sözleşmeyi bilir. Yük kabaca dengelidir (A ≈ 4 büyük adım, B ≈ 5 büyük adım; A'nın ağ/indirme beklemesi var, B'nin refaktör riski var).

## 1. Başlangıç noktası ve temel kararlar

### 1.1 Durum
- `main` = Faz 0–6. Gerçek bölge: **1588 × 1176 örnek** (100 m hücre = 2 oyun m; 3,2 × 2,4 km oyun), `public/data/regions/zonguldak-bartin-karabuk/` (≈ 5,9 MB). İl sınırı dosyasında Bolu/Düzce/Kastamonu/Çankırı **komşu (yürünebilir, `inRegion=false`)** olarak zaten vardır ama harita bu illerin yalnızca kenarını kapsar.
- Faz 7'nin hedefi: **Düzce ve Bolu'yu tam kapsayan, Zonguldak–Bartın–Karabük ile aralarında kesinti olmadan yürünen** tek dünya. Hedef iller (`inRegion=true`) 5'e çıkar. Abant Gölü ve Yedigöller bu genişlemenin vitrinidir.

### 1.2 Seçilen mimari: **tek koordinat sistemi + diskte karolar + açılışta belleğe birleştirme**
ROADMAP'in teknik gereksinimleri üç maddeydi (çoklu bölge + kesintisiz geçiş, heightmap'in karolara bölünmesi, UTM zone değişimi). Üçü şöyle çözülür:

| Seçenek | Karar |
|---|---|
| (a) Bölge-bölge ayrı yükleme + sınırda geçiş | **Hayır.** Çift koordinat sistemi, sınırda collider/mesh/kimlik süreksizliği, kayıtta "hangi bölge" karmaşası. Aynı UTM zone'unda gereksiz. |
| (b) Tek büyük monolitik heightmap | **Hayır.** Dosya sınırı (20 MB) bugün aşılmaz ama sonraki fazlarda aşılır; her genişlemede tüm dosya yeniden üretilir ve kimlikler kayar. |
| (c) **Tek dünya, sabit kafes, diskte 512×512'lik karolar, açılışta tek diziye birleştirme** | **Evet.** Kesintisizlik yapıdan gelir (tek koordinat sistemi); yeni alan = yeni karo dosyaları (eskiler değişmez); çalışma zamanı mevcut dizi-tabanlı kodu korur (yalnızca merkezli-orijin varsayımı kalkar). **Akış (karoları oyuncuya göre yükleme) Faz 7 kapsamı dışındadır**; biçim buna hazırdır (§1.5). |

### 1.3 UTM kararı: **EPSG:32636 sabit kalır** (zone değişimi Faz 7'de gerekmez)
Düzce–Bolu'nun tamamı 30°D'nin doğusundadır (en batı nokta Bolu, 30,565°D), yani UTM 36N içindedir. Merkez meridyen 33°D: en uzak nokta 2,4° uzakta → ölçek sapması ≈ +%0,012 (100 m hücre 100,012 m), kuzey sapması (yakınsama) ≈ 1,6°. Oyun ekseni UTM ızgarasıdır ("kuzey" = −Z); bu sapma oyunda hissedilmez. **Kural:** EPSG:32636 batıda ~28,5°D'ye (ölçek ≤ +%0,14, yakınsama ≤ 3°), doğuda 36°D'ye (ölçek +%0,04, yakınsama 2°) kadar yeter; ötesi için ayrı karar (Faz 8+, bkz. §8). ROADMAP'teki "UTM zone değişimi" maddesi bu gerekçeyle Faz 7'den çıkarılır.

### 1.4 Hesaplanan sayılar (gerçek geoBoundaries sınırlarından; A kesin değerleri üretirken doğrular)
- Hedef 5 ilin UTM kutusu + 2 km pay → eski kafese oturtulunca örnek aralığı **sütun −635…1588, satır 0…1962**. Batı kenarı chunk'a (128 örnek) hizalanır: **sütun −640…1588 (2228 örnek), satır 0…1962 (1962 örnek)** → **4,37 M örnek** (şimdi 1,87 M; ×2,3), oyun alanı ≈ **4,45 × 3,92 km**, **18 × 16 = 288 chunk** (şimdi 13 × 10 = 130).
- Karolar (512×512 örnek): **tx −2…3, ty 0…3 = 24 karo** (eski bölge 12 karo: tx 0…3, ty 0…2).
- Veri boyutu: heightmap ≈ 8,7 MB + arazi örtüsü ≈ 4,4 MB; **her karo ≤ 512 KB (yükseklik) / 256 KB (örtü)**. Toplam bölge verisi ≈ 13–15 MB (bugün 5,9 MB).
- Bellek (açılışta): yükseklik Float32 ≈ 17 MB, deniz mesafesi (tembel) ≈ 17 MB, arazi örtüsü ≈ 4 MB, shader ağırlık dokuları 2 × ≈ 17 MB (GPU). Masaüstü için kabul edilebilir; B ölçer (7.8).
- Önemli noktalar (oyun X/Z, m): Düzce (−1790, 1064), Bolu (−1031, 1310), Abant Gölü (−1587, 1610), Yedigöller (−776, 849), Akçakoca (−1846, 531). Hepsi yeni alanın içinde.
- DEM karoları: N40–N41 × E30–E33 = **8 Copernicus karosu** (~290 MB; bugün 6 karo, 216 MB).
- Yeni komşular (yürünebilir, `inRegion=false`): Kastamonu, Çankırı, **Ankara, Sakarya, Bilecik** ve kenarda küçük parçalarla Eskişehir/Kocaeli (A otomatik seçer, §4 7.3).

### 1.5 Bilerek kapsam dışı
Karo **akışı** (oyuncuya göre yükleme/boşaltma), karo başına özellik dosyası (`features.json` tek dosya kalır, ≈ 0,9 MB), UTM zone değişimi, doğuya (Kastamonu–Çankırı) genişleme, hava/mevsim, yeni canlı türü. Faz 8+ ve Fikir Havuzu'na not edilir.

### 1.6 Koddaki kırılganlıklar (plan bunlara göre kuruldu; B'nin işi)
1. **Merkezli orijin varsayımı** 4 dosyada: `RegionHeightSource` (xAt/zAt/bounds/heightAt/elevationAt…), `LandCoverMap.valueAt`, `world/chunks.ts` (`sampleX/sampleZ/chunkIndexAt`), `TerrainMaterial` (`uCoverGrid` = yarı boyutlar). Alan batıya/güneye büyüyünce orijin ızgara merkezinde olamaz.
2. **Kimlikler ızgara boyutuna bağlı:** `chunkKey = cy·cols + cx`, `PropId = chunkKey·65536 + indeks`, `creatureId = hücre·256 + sıra` ve hücre anahtarı da `cy·cols + cx`. `cols` 13 → 18 olunca eski kayıttaki tükenen ağaç/öldürülen canlı kimlikleri başka nesneleri gösterir. Çözüm: mutlak kimlik + kayıt göçü (§3.4, 7.5, 7.7).
3. **`seedFrom` 32 bit'e keser** (`value | 0`). Yeni kimlikler 2⁴⁰–2⁴⁸ olduğundan yüksek bitler (satır bilgisi) kaybolur: `gather.rollYield` (`seedFrom(SCATTER.seed, propId, …)`) ve `CreatureSystem` (`seedFrom(CREATURES.seed, id)`) tohumları kimliği `(cx, cy, indeks)`'e ayrıştırarak vermelidir (7.5).
4. **İyi haber:** nesne yerleşimi (`scatterChunk`: `seedFrom(seed, cx, cy)`) ve canlı doğma adayları (`seedFrom(seed, cx, cy, dönem)`) **chunk koordinatına** bağlıdır, anahtara değil. Kafesi eski ızgaranın kuzeybatı köşesine çapalarsak eski alandaki ormanlar/kayalar/aday noktalar **birebir aynı** üretilir.
5. **Dünya genişleyince:** 288 chunk ve ×2,2 serbest su üçgeni (`FreshWaterMesh` bölünmüyor) kare başı draw call/üçgen bütçesini (< 300) zorlar; `CHUNK.viewDistance = 4000` m bugün tüm bölgeyi kapsıyor (7.8).
6. **Test yükü:** 20 test dosyası gerçek bölgeyi `loadRealRegion` ile yükler; yeni dünya 2,3× büyüktür ve il listesi (7 → ~12) değişir.

## 2. Paralel çalışma kuralları

### 2.1 Branch ve PR
- `faz-7-0-iskele` (plan sahibi) → `main`; **A ve B iskele birleşmeden başlamaz** (sözleşme kodu orada). Beklerken yalnızca bu belgeyi, `CLAUDE.md`'yi ve ilgili mevcut kodu okuyabilirler.
- A: `faz-7-a-veri`, B: `faz-7-b-calisma` (güncel `main`'den). Oturum kendi atanmış branch'ini dayatıyorsa o kullanılır; kural aynı: **her iş kendi branch'i ve PR'ı**. PR'ı kullanıcı isterse açılır.
- Conventional Commits; bir alt adım = bir anlamlı commit. **Küçük ve sık PR:** özellikle 7.2 (A) hemen birleşmeli, B ona bağlı (§6).
- Her PR birleşmeden önce `npm run lint`, `typecheck`, `npm test`, `build`, `format:check` ve (A için) `python -m pytest tools/tests -q` hatasız geçmeli.
- Biri `main`'e girince diğeri `git merge origin/main` ile alır ve testleri yeniden çalıştırır.

### 2.2 Dosya sahipliği

| Alan | A | B |
|---|---|---|
| `tools/**`, `public/data/**` | **sahibi** | dokunma |
| `src/data/**` (`world.ts`, `region.ts`, `landcover.ts`, `worldTypes.ts`) | **sahibi** | salt okunur (tip değişikliği gerekirse A'dan iste/ayrı PR) |
| `tests/world*.test.ts` (veri/manifest/yükleyici/golden), `tools/tests/**` | **sahibi** | dokunma |
| `src/world/**`, `src/physics/**`, `src/creatures/**`, `src/interaction/**` | dokunma | **sahibi** |
| `src/save/**`, `src/core/Game.ts`, `src/ui/**`, `src/audio/**` | dokunma | **sahibi** |
| `src/world/chunkKeys.ts`, `src/world/lattice.ts` | salt okunur | salt okunur (7.0'da yazıldı; B 7.5'te mevcut kimlik/ızgara koduna bağlarken **yalnızca ekleme** yapar, davranışı değiştirmez) |
| `src/config.ts` | yalnızca **`WORLD` bloğu** (7.0 ile kilitlenir; değişiklik ayrı küçük PR) | `TELEPORTS`, `CHUNK`, `SCATTER`, `CREATURES`, `RESPAWN`, `QUALITY_PRESETS`… (`WORLD` hariç) |
| mevcut 20 gerçek-bölge testi + `tests/helpers/realRegion.ts` | dokunma | **sahibi** (7.6'da yeni yükleyiciye taşır, 7.9'da beklentileri günceller) |
| `ROADMAP.md` | yalnızca 7.1–7.4 satırları | yalnızca 7.5–7.9 satırları |
| `CLAUDE.md` | yalnızca "Bölge Veri Formatı" ve "Komutlar → Veri hattı" bölümleri | dokunma (7.11'de toplu) |
| `README.md` | yalnızca "Veri hattı" bölümü | dokunma |

Bu sınırın dışına dokunman gerekirse önce kullanıcıya sor; değişikliği ayrı, küçük bir commit/PR yap.

### 2.3 Çakışmayı önleyen mekanizmalar
- Sözleşme (sabitler, tipler, kimlik fonksiyonları) **iskelede koda dökülür**; iki taraf da onu import eder, kopyalamaz.
- Her taraf kendi test dosyalarını açar; ortak yardımcı gerekiyorsa `tests/helpers/` altında **yeni dosya** açar (var olanı sahibi düzenler).
- **A'nın B'yi beklememesi:** A, B'nin çalışma zamanı kodunu hiç çalıştırmadan yalnızca Python testleri + TS veri testleriyle ilerler. **B'nin A'yı beklememesi:** B, 7.5/7.7/7.8-altyapı için eski bölgeyi kullanır (merkezli → `gridOrigin` ile aynı sonuç) ve büyük dünyayı **sentetik** üretir (§5, 7.8).

### 2.4 Ortam notları
- Yeni oturumda `npm ci`; A ayrıca `pip install -r tools/requirements.txt` (rasterio/geopandas). **Yeni bağımlılık ekleme** (gerekirse gerekçesiyle sor).
- A'nın indirmeleri ağ ister: geoBoundaries (`media.githubusercontent.com`; bu planı hazırlarken doğrulandı), Copernicus DEM (AWS S3), Overture (HTTP Range). Ağ engelliyse A durumu **hemen** bildirir; kullanıcı komutları yerelde çalıştırıp çıktıyı commit edebilir (ham veri `tools/raw/`, commit edilmez).
- Headless doğrulama tarifi: [faz-4-paralel-plan.md](faz-4-paralel-plan.md) Ek'i + `CLAUDE.md` Faz 6 notu (başsız Chromium'da menüye tıklamadan önce `document.exitPointerLock()`). Gerçek GPU/ses yok: draw call/üçgen sayılır, FPS ölçülmez.

---

## 3. Sözleşme (sabit; 7.0 bunu koda döker)

Değişmesi gerekirse bu belge ayrı, küçük bir PR ile güncellenir ve diğer hesap haberdar edilir.

### 3.1 Koordinatlar ve kafes
- Dünya orijini **değişmez**: `originUtm = [434085, 4576261]`, EPSG:32636, `HORIZONTAL_SCALE = 50`, `VERTICAL_SCALE = 15`. Böylece eski kayıttaki oyuncu/yapı konumları aynen geçerlidir.
- **Global örnek kafesi:** tam sayı `(col, row)`; **(0, 0) = eski bölgenin kuzeybatı örneği.** Negatif indeksler batıya/kuzeye uzanır.
  `x(col) = X0 + col · 2`, `z(row) = Z0 + row · 2` (oyun m; piksel merkezi) ile **`X0 = −1587`, `Z0 = −1175`** (`WORLD.lattice`). Eski formül `(c − (W−1)/2) · cell` bunun `W = 1588, H = 1176` özel hâlidir.
- UTM karşılığı: örnek piksel kenarları `E = 354685 + 100·k`, `N = 4635061 − 100·k` (eski ızgaranın sol/üst kenarı). **Yeni karolar bu fazı aynen korur**; aynı DEM aynı hücrelere alan ortalamasıyla örneklendiği için eski alan yeniden üretilince özdeştir.
- **Chunk kafesi:** chunk `(cx, cy)` örnek sütunları `[cx·128, (cx+1)·128]`, satırları `[cy·128, (cy+1)·128]` kapsar; `cx, cy` negatif olabilir. Oyun karşılığı 256 m (= `CREATURES.spawnCellSize`: **canlı doğma hücresi ≡ chunk**, aynı `(cx, cy)`).
- **Karo kafesi:** karo `(tx, ty) = (floor(col/512), floor(row/512))`, 512 örnek = 4 chunk; örnek kümeleri ayrıktır (karo kenarında örnek paylaşılmaz).

### 3.2 Diskteki biçim
```
public/data/world/<dünya-id>/
  world.json                    # manifest (aşağıda)
  tiles/<tx>_<ty>.height.bin    # 512×512 uint16 LE, satır satır (kuzey→güney, batı→doğu); extent dışı kısım 0
  tiles/<tx>_<ty>.cover.bin     # 512×512 uint8 (arazi örtüsü sınıf indeksi); extent dışı 0
  provinces.geojson             # oyun X/Z, bugünkü biçim (iso, inRegion)
  features.json                # bugünkü biçim (version 1; water katmanı), tüm dünya
```
```jsonc
// world.json
{
  "version": 1,
  "id": "bati-karadeniz",
  "name": "Batı Karadeniz",
  "crs": "EPSG:32636",
  "originUtm": [434085, 4576261],
  "horizontalScale": 50,
  "cellSizeReal": 100,
  "lattice": { "anchorX": -1587, "anchorZ": -1175 },     // WORLD.lattice ile aynı olmalı (yükleyici doğrular)
  "tileSize": 512,
  "extent": { "col0": -640, "row0": 0, "cols": 2228, "rows": 1962 },   // gerçek veri dikdörtgeni (örnek)
  "elevation": { "min": 0, "max": 2500, "encoding": "uint16" },        // DÜNYA GENELİ tek aralık
  "tiles": [ { "tx": -2, "ty": 0, "height": "tiles/-2_0.height.bin", "cover": "tiles/-2_0.cover.bin",
               "bytes": 524288, "sha256": "…" } ],                      // extent ile kesişen HER karo listelenir
  "provinces": "provinces.geojson",
  "features": { "file": "features.json", "layers": ["water"] },
  "landcover": { "classes": ["none","forest","shrub","grass","crop","barren","urban","snow","wetland"] },
  "sources": ["Copernicus GLO-30 DEM", "geoBoundaries", "Overture Maps (OpenStreetMap)", "ESA WorldCover 2021 (Overture Maps)"],
  "overtureRelease": "2026-09-23.1",                                   // eski ve yeni alan AYNI sürüm
  "built": "YYYY-MM-DD"
}
```
- **Tek yükseklik aralığı:** `elevation = min + v/65535·(max−min)`; `max` tüm dünyanın en yükseği (yukarı 100'e yuvarlı). Kaynak kural (CLAUDE.md): deniz altı 0'a kırpılır.
- Karo adresi: `${taban}/${dosya}?v=${sha256.slice(0, 8)}` (önbellek tazelenmesi).
- Yükleyici (`loadWorld`) kapsama **dikdörtgen ve boşluksuz** değilse, boyut/sha uyuşmazsa, `lattice`/`horizontalScale` config'le uyuşmazsa `RegionDataError` fırlatır.
- **Ara dönem (7.2 → 7.4):** 7.2'de eski bölge `extent = {0, 0, 1588, 1176}`, `elevation.max = 1996` ile karolanır (**bit-eşdeğer**). 7.4'te yeni alan eklenince `max` yükselir ve eski alan **≤ 1 nicem** farkla yeniden nicemlenir (golden test o sırada toleransa geçer; sahibi A).

### 3.3 Bellek içi (birleştirilmiş) veri: `RegionData` (A üretir, B tüketir)
`loadWorld(id, baseUrl, fetchFn)` bugünkü `RegionData`'yı döndürür; **tek yapısal fark** `RegionMeta.gridOrigin`:
```ts
interface RegionMeta {
  // … mevcut alanlar; gridWidth/gridHeight = birleştirilmiş dizinin boyutu (extent.cols/rows) …
  /** Birleştirilmiş dizinin (0, 0) örneğinin merkez konumu (oyun m): x(c) = gridOrigin.x + c·cell, z(r) = gridOrigin.z + r·cell. */
  gridOrigin: { x: number; z: number };
}
```
- Yeni dünya: `gridOrigin = gridOriginOf(extent)` (`src/world/lattice.ts`; = `{ x: X0 + col0·2, z: Z0 + row0·2 }`, örn. `{ −2867, −1175 }`).
- Eski `meta.json` (merkezli, `gridOrigin` yok): `parseMeta` varsayılanı `{ x: −(W−1)/2·cell, z: −(H−1)/2·cell }` türetir (7.0). B'nin 7.5'i **bu varsayılanla eski veride** çalışır; yeni dünya gelince değişiklik gerekmez.
- `heights` (uint16, dünya geneli aralık), `landcover` (uint8), `provinces`, `features`: bugünkü alanlar, **aynı ızgara ve sıra**.

### 3.4 Kimlikler (mutlak; **7.0'da yazıldı:** `src/world/chunkKeys.ts`, B 7.5'te mevcut `chunkKey/propId/creatureId` yerine bağlar)
Adlar mevcut fonksiyonlarla çakışmasın diye `absolute…` önekini taşır (B, 7.5'te mevcut adları bunlara yönlendirebilir):
```ts
export const CHUNK_KEY_BIAS = 32768;                                    // waterIndex'teki kalıpla aynı
export function absoluteChunkKey(cx: number, cy: number): number;       // (cy + BIAS)·65536 + (cx + BIAS)  (< 2^32); aralık dışı RangeError
export function decodeAbsoluteChunkKey(key: number): { cx: number; cy: number };
export function absolutePropId(chunkKey: number, index: number): number;      // chunkKey·65536 + indeks   (< 2^48, güvenli tam sayı)
export function decodeAbsolutePropId(id: number): { chunkKey: number; index: number };
export function absoluteCreatureId(cellKey: number, index: number): number;    // cellKey·256 + sıra        (< 2^40); hücre anahtarı = absoluteChunkKey(cx, cy)

/** Faz 6 (v1) kayıtlarındaki eski kimlikler: 13 × 10 chunk, anahtar = cy·13 + cx, kafes aynı. Geçersiz/ızgara dışı değer için null. */
export const LEGACY = { chunkCols: 13, chunkRows: 10, spawnCols: 13, spawnRows: 10 } as const;
export function legacyChunkKeyToAbsolute(oldKey: number): number | null;
export function legacyCellKeyToAbsolute(oldKey: number): number | null;
export function legacyPropIdToAbsolute(oldId: number): number | null;
```
Eski `cx = key % 13`, `cy = floor(key / 13)` → yeni anahtar `absoluteChunkKey(cx, cy)`; nesne indeksi **değişmez** (üretim aynı). Bu yüzden kafes çapası eski ızgaranın kuzeybatı köşesidir (§3.1). Testler (`tests/chunkKeys.test.ts`) `LEGACY` sabitlerini gerçek eski ızgarayla (13 × 10) ve eski chunk dikdörtgenlerini kafes formülüyle eşleştirir.

**Kafes matematiği (7.0'da yazıldı, saf):** `src/world/lattice.ts` — `latticeX/latticeZ/latticeCol/latticeRow`, `gridOriginOf(extent)`, `tileOf`, `chunkOf`, `tileRangeOf(extent)`, `LATTICE_CELL`, `CHUNK_CELLS`. Her iki hesap bunları kullanır, kendi kopyasını yazmaz.

### 3.5 Kayıt sözleşmesi (B uygular, 7.7)
`SAVE_FORMAT_VERSION = 2`. `MIGRATIONS[1]`: `regionId` `'zonguldak-bartin-karabuk'` → `WORLD.id`; `world.handDone/axeDone/removed` içindeki kimlikler `legacyPropIdToId`; `creatures.killed[].cell` `legacyCellKeyToKey`. Oyuncu/yapı/envanter/gösterge/saat **aynen** (orijin ve kafes değişmedi).

### 3.6 Config (7.0 ile eklenir; `WORLD` bloğu kilitli)
```ts
export const WORLD = {
  id: 'bati-karadeniz', name: 'Batı Karadeniz',
  basePath: 'data/world',                    // public/ altında (import.meta.env.BASE_URL ile birleşir)
  lattice: { anchorX: -1587, anchorZ: -1175 },
  tileSize: 512,
  legacyRegionId: 'zonguldak-bartin-karabuk',
} as const;
```

---

## 4. Hesap A — Veri ve karolar (7.1–7.4)

### 7.1 Karo biçimi ve yükleyici
- `tools/worldlib.py` (saf, numpy; rasterio yok): kafes/karo matematiği (`tile_of`, `slice_into_tiles`, `assemble`), dünya-geneli nicemleme, manifest üretme/doğrulama, sha256. Python testi **`src/config.ts` `WORLD.lattice` bloğunu okuyup** Python sabitleriyle eşleştirir (HORIZONTAL_SCALE kalıbı).
- `src/data/world.ts`: `parseWorldManifest` (katı doğrulama; tipler `worldTypes.ts`'te hazır), `loadWorld(id, baseUrl, fetchFn)` → `RegionData` (§3.3; `gridOrigin` = `gridOriginOf(extent)`, karo aralığı = `tileRangeOf`). Karoları paralel çeker, `Uint16Array(W×H)`'ye satır satır kopyalar; il/özellik ayrıştırıcılarını `region.ts`'ten paylaşır (A `region.ts`'i düzenleyebilir).
- Testler (`tests/worldManifest.test.ts`, `tests/worldLoad.test.ts`): geçerli/geçersiz manifest; sentetik karolarla birleştirme (negatif karo indeksi, kısmi karo, dikdörtgen dışı, boşluk → hata, boyut/sha/lattice uyuşmazlığı → hata, `gridOrigin` doğru).
- **Bitti:** `loadWorld` sentetik dünyada doğru; Python + TS testleri geçer.

### 7.2 Eski bölgeyi karola (**B için kritik bağımlılık: önce bunu bitir, hemen birleştir**)
- `tools/tile_legacy.py`: `public/data/regions/zonguldak-bartin-karabuk/*` → `public/data/world/bati-karadeniz/` (ağ gerekmez). `extent = {0, 0, 1588, 1176}`, `elevation.max = 1996`, 4 × 3 karo, `provinces.geojson` ve `features.json` aynen kopya. **Eski veri silinmez** (7.10'da kalkar).
- Golden test (`tests/worldLegacyGolden.test.ts`): `loadWorld` çıktısı eski `loadRegion` çıktısıyla **birebir** (yükseklik, arazi örtüsü, il, özellik; `gridOrigin` = eski merkezli orijin).
- **Bitti:** golden test geçer; PR birleşti → **S1** (B'ye haber).

### 7.3 Hattı kafes/karo düzenine taşı
- `tools/world.yaml` (eski `regions.yaml` 7.10'a kadar durur): dünya id/adı, hedef iller `[Zonguldak, Bartın, Karabük, Düzce, Bolu]`, komşular **otomatik** (ızgara + pay ile kesişen tüm iller; açık liste de verilebilir), `bbox [30.30, 40.00, 33.30, 41.95]`, `margin_m 2000`, `cell_size 100`; kafes `WORLD.lattice`'ten.
- `Grid` genelleştirme: orijin-merkezli yerine **kafese çapalı** (`grid_for_lattice`: sınırlar kafese yuvarlanır; batı/kuzey kenar 128'in katına hizalanır, doğu/güney `ceil`). Eski kafes yeniden üretilebilmeli (`left = 354685`, `top = 4635061`).
- `fetch_dem/water/landcover` yeni `bbox` ile (8 DEM karosu); Overture sürümü **`2026-09-23.1` sabit** (eski/yeni alan aynı sürüm). `build_world.py`: DEM'i yeni ızgaraya örnekle → **iki geçişli nicemleme** (önce dünya-geneli `max`, sonra uint16) → karolara kes → manifest/il/özellik/örtü yaz.
- `build_world.py --verify-legacy` (elle, ham veri ister): eski alanı yeniden üretip 7.2 çıktısıyla ≤ 1 nicem içinde karşılaştırır.
- pytest (saf): eski kafesin yeniden üretimi, karo kesme/birleştirme gidiş-dönüşü, dünya-geneli nicemleme, manifest doğrulama, komşu il otomatik seçimi (sentetik çokgenler). `tools/tests/` CI'da (`tools` işi) çalışır.
- **Bitti:** testler geçer; komut dokümante (`CLAUDE.md` "Komutlar", README "Veri hattı").

### 7.4 Yeni alanın verisi + kalite denetimi
- Ham veriyi indir (≈ 290 MB DEM + su/örtü), `build_world.py` ile **tüm dünyayı** üret, `public/data/world/bati-karadeniz/`'e yaz (extent artık `−640…1588 × 0…1962`; eski karolar ≤ 1 nicem farkla yenilenir) ve commit et. Her karo ≤ 1 MB (bütçe 512 KB + 256 KB).
- `tools/qa_world.py` raporu (PR açıklamasına yapıştırılır): karo tablosu (bayt, kara %, yükseklik aralığı), örtü sınıfı histogramı, il kapsamı, **eski/yeni sınır sürekliliği** (sınır çizgisi boyunca komşu örnek farkı iç gradyanı aşmamalı), su çizgilerinin sınırdan geçişi.
- `tests/worldData.test.ts` (A): manifest geçerli/dikdörtgen/boşluksuz; her karo ≤ 1 MB ve sha doğru; il listesi (**Düzce, Bolu `inRegion=true`**; komşular `false`); makul yükseklikler (Düzce kıyısı ~deniz, Abant ≈ 1300 ± 200 m, Köroğlu yöresi ≥ 2000 m); **Abant Gölü** ve **Yedigöller** yakınında `lake` çokgeni; arazi örtüsünde karada `none` şeridi yok; sınır sürekliliği. Golden test (7.2) toleransa çevrilir.
- `CLAUDE.md` "Bölge Veri Formatı" bölümü karo biçimine güncellenir.
- **Bitti:** veri commit'li, testler geçer, QA raporu PR'da → **S2** (B'ye haber).

### A.5 Kabul ölçütleri (testle)
Manifest/karo doğrulaması; birleştirme doğruluğu; eski alanın yeniden üretimi (7.2 bit-eşdeğer, 7.4 ≤ 1 nicem); sınır sürekliliği; Düzce/Bolu/göller veride var; her dosya ≤ 1 MB; Python hattı testli.

### A.6 Kapsam dışı
Çalışma zamanı kodu (`src/world`, `src/creatures`, `src/save`, `Game`), oyun içeriği, kimlik göçü, performans. Karo akışı.

---

## 5. Hesap B — Çalışma zamanı ve oyun (7.5–7.9)

### 7.5 Izgara çapası ve mutlak kimlikler (A'yı beklemeden başlar)
- Merkezli-orijin varsayımını `gridOrigin`'e genelle: `RegionHeightSource`, `LandCoverMap`, `world/chunks.ts` (`ChunkGrid`'e orijin + ilk chunk indeksi; negatif `cx/cy`), `TerrainMaterial` (`uCoverGrid` orijin tabanlı), `ChunkManager/ChunkColliders/PropIndex/PropLayer` anahtarları, `createBoundsWalls`/`Water` (zaten `bounds`), canlı doğma ızgarası (hücre = chunk kafesi, mutlak `cellKey`).
- `chunkKeys.ts` fonksiyonlarını bağla (`propId`, `creatureId`); **`seedFrom` 32-bit sorunu:** `gather.rollYield` ve `CreatureSystem` tohumlarını `(cx, cy, indeks)`'ten türet (kimliği doğrudan verme). `seedFrom`'un negatif/büyük girdiyle davranışını testle kilitle.
- **Regresyon kapısı (önce yaz):** değişiklikten önce eski bölge için ~12 chunk'ın `scatterChunk` çıktısının ve doğma adaylarının **özetini (hash)** kaydeden golden test ekle; refaktör sonrası **aynı** olmalı (ormanlar yerinden oynamaz). Mevcut 20 gerçek-bölge testi **değişmeden** geçmeli.
- Yeni birim testler: asimetrik sentetik ızgara (negatif chunk indeksi) için chunk/yükseklik/örtü/PropIndex/spawn; `decodeChunkKey ∘ chunkKey = id`; eski anahtar ↔ yeni anahtar eşlemesi 130 chunk için eksiksiz ve tekil.
- **Bitti:** eski veride tüm testler + golden geçer.

### 7.6 Dünyayı manifestten yükle (**S1 sonrası**)
- `Game`: `REGION_ID` kalkar, `WORLD.id` + `loadWorld`. `RegionWorld` sınıfının adı değişmez (gürültü yaratma); belgede "dünya" denir.
- `tests/helpers/realRegion.ts`: `loadRealWorld()` (Node `fs` ile karo okur, **modül düzeyinde önbellekli**: 20 test dosyası aynı veriyi yeniden birleştirmesin) ve `loadRealRegion` ona takma ad olur → 20 test dosyası **düzenlenmeden** geçer.
- Dünya yalnızca eski alanı kapsarken (S1) tüm testler değişmeden geçmeli = davranış regresyon kapısı.
- **Bitti:** oyun karo manifestinden açılır; başsız tarayıcıda yürüme/kayıt/yükleme çalışır.

### 7.7 Kayıt v2 ve göç
- §3.5'teki `MIGRATIONS[1]`; `parseSave` v2'yi doğrular (bilinmeyen `regionId` anlaşılır `SaveError`). `createNewGameSave`/`Game.saveTargets` `WORLD.id` kullanır.
- Testler: gerçek v1 kayıt örneği (eski kimliklerle) göç eder; **göç edilen kimlik aynı nesneyi gösterir** (eski ve yeni kafeste aynı chunk için `scatterChunk` konumları eşit); `GatherSystem` göç sonrası tükenen ağacı gizler; öldürülen canlı beklemesi aynı hücrede; v1 kayıt başsız tarayıcıda yeni dünyada yüklenir.
- Mevcut `tests/saveGame.test.ts`, `gameState`, `newGame` düzenlenir (sahibi B).

### 7.8 Performans ve bellek
- **Sentetik büyük dünya** (`tests/helpers/syntheticWorld.ts`, yeni dosya): eski bölgeyi 2×2 çoğaltıp 4,37 M örneklik kafese yayar; böylece gerçek veri gelmeden ölçüm başlar.
- Ölç (başsız yazılımsal WebGL): en kötü konumlarda draw call/üçgen (merkez, köşeler, zirve, kıyı), açılış aşamaları süresi (birleştirme, `RegionHeightSource`, örtü ağırlık dokuları, ilk chunk'lar), bellek tahmini. **Bütçe:** kare başı draw call **< 300** (hedef ≤ 250), açılışta CPU hazırlığı (ağ hariç) başsızda ≤ 3 sn; ölçüm tablosu PR'a.
- Gerekirse sırayla: (1) `FreshWaterMesh`'i chunk başına böl/kırp (`CLAUDE.md`'deki ilk hamle), (2) `CHUNK.viewDistance` ve LOD eşiklerini (+ `QUALITY_PRESETS`) yeniden ayarla, (3) uzak chunk'ları birleştir (2×2 süper-chunk). `QUALITY_PRESETS` "Yüksek" Faz 5 davranışı olarak kalır.
- **S2 sonrası** gerçek veriyle tabloyu tekrarla ve son sayıları yaz.

### 7.9 İçerik: Düzce–Bolu (**S2 sonrası**)
- `TELEPORTS`: **Düzce merkez, Bolu merkez, Abant Gölü, Yedigöller, Akçakoca** eklenir (1–9/0 tuşları; koordinatlar yürünebilir en yakın noktaya oturur, test). Test: her ışınlanma karada ve beklenen ilde ("Düzce" → Düzce); `respawn` testleri 5 hedef ili kapsar.
- **Kesintisiz yürüme testi:** `tests/helpers/pathfinding.ts` ile Zonguldak başlangıcından Düzce ve Bolu ışınlanma noktalarına **yürünebilir yol** vardır (eğim sınırı 60°); eski/yeni alan sınırında `heightAt` sıçraması yok.
- **Ekoloji/denge:** `creatureDensity`, `creatureRegion` (stres), `balanceEncounters`, `integrationHunt` yeni dünyada yeniden çalışır; Bolu/Düzce ormanlarında boz ayı yaşam alanı (yüksek orman) var mı, doğma yoğunluğu aralıkları tutuyor mu? Yalnızca ölçüm gerektiriyorsa `CREATURES` ayarlanır; sonuçlar PR'a.
- Eğim ölçeği yeniden ölç (`REGION_PLAYER.maxSlopeDeg = 60` ile yürünebilir kara %'si; `CLAUDE.md` notunu güncellemek için sayı), `placeRulesRegion` eşikleri yeni arazide tutuyor mu.
- İklim: 2000 m üstü (Köroğlu yöresi) geceleri ölümcül kalır (mevcut model, bilinçli); HUD uyarısı gerekmez. Il bildirimi testlerindeki il listesi güncellenir (`provinceNoticeRegion`).
- Gerçek-veri testlerinin beklentileri (il listesi, ızgara boyutu, sayılar) güncellenir.

### B.1 Kabul ölçütleri (testle)
Eski veride regresyon yok (20 test + scatter/spawn golden); asimetrik ızgara birim testleri; kayıt göçü doğru nesneyi gösterir; yeni dünyada kesintisiz yürünebilir yol; ışınlanmalar doğru ilde; performans bütçesi (draw call < 300) ölçüm tablosuyla; ekoloji ölçümleri aralıkta.

### B.2 Kapsam dışı
Veri hattı ve karo dosyaları (`tools/`, `public/data/`, `src/data/`), karo akışı, yeni canlı türü/eşya, hava/mevsim.

---

## 6. Senkron noktaları ve çizelge

| Nokta | Olay | Kim kimi bekler |
|---|---|---|
| **S0** | 7.0 iskele birleşti | A ve B başlar |
| **S1** | A 7.2 (eski bölge karolu + golden) birleşti | B 7.6'ya başlar (7.5, 7.7, 7.8-altyapı beklemeden sürer) |
| **S2** | A 7.4 (yeni alan verisi) birleşti | B 7.9 ve 7.8 son ölçüm; B kendi PR'larını `main`'le birleştirmiş olmalı |
| **S3** | A ve B tamam | 7.10 ve 7.11 (kalan hesap) |

```
A:  7.1 ──▶ 7.2 ─S1─▶ 7.3 ──────▶ 7.4 ─S2─▶ (bekleme: B'ye destek, hata düzeltme)
B:  7.5 ───────────▶ 7.6(S1 sonrası) ▶ 7.7 ▶ 7.8-altyapı ──▶ [S2 sonrası] 7.9 + 7.8 son ölçüm
```
A, S1 sonrası bile bitirmeye devam eder; B S1'i beklerken 7.5/7.7/7.8-altyapı ile meşguldür → ikisi de boşta kalmaz. **En olası darboğaz 7.2 ve ağ indirmeleri (7.4):** 7.2'yi küçük tutup öne al; ağ engeli varsa kullanıcıyı hemen uyar.

## 7. 7.10 ve 7.11 (iki hesap bittikten sonra; bu oturumların işi değil)
- **7.10 Birleştirme:** eski `public/data/regions/…`, `loadRegion` ve eski hat (`regions.yaml`, `build_region.py`; yerine `world.yaml`/`build_world.py`) temizlenir; CI; uçtan uca headless: Zonguldak → Düzce yürüyüşü, il bildirimi ("Düzce'ye hoş geldiniz"), v1 kayıt yükleme, birleşik performans tablosu.
- **7.11 Kapanış:** ROADMAP kabul kriterleri, `CLAUDE.md` "Mevcut Durum" (karo/kafes/kimlik notları, yeni sayılar: ızgara, chunk, veri boyutu, eğim %, performans), klasör yapısı, README (veri tablosu, `world.yaml`), `docs/` içindeki plan "tamamlandı" notu.

## 8. Riskler ve açık kararlar

| # | Risk / karar | Önlem / öneri |
|---|---|---|
| 1 | **Ağ erişimi** (DEM/Overture/geoBoundaries) A'nın oturumunda kapalı olabilir | A ilk iş erişimi dener; engelliyse kullanıcıya komutları yerelde çalıştırtır; ham veri commit edilmez |
| 2 | **Eski nesneler yerinden oynar** (ormanlar, tükenen ağaçlar) | Kafes çapası + `(cx, cy)` tabanlı tohumlar + 7.5 golden hash testi |
| 3 | **Eski kayıtlar bozulur** | Kayıt v2 göçü + "aynı nesneyi gösterir" testi (7.7) |
| 4 | **Draw call/üçgen/bellek bütçesi** (288 chunk, ×2,2 su) | 7.8 sentetik ölçüm erken; aşağı basamaklı azaltma planı |
| 5 | **Yeniden nicemleme** eski alanı ≤ 1 nicem (≈ 4 cm) oynatır; sınırdaki nesne eşiği nadiren değişebilir | Bilinen/kabul; golden 7.4'te toleransa geçer; nesne kimliği/yerleşimi chunk-koordinat tabanlı olduğundan etkilenmez, yalnızca eğim eşiğindeki birkaç aday |
| 6 | **Overture sürümü** karışırsa su/örtü eski ve yeni alanda uyuşmaz | `overtureRelease` sabit, manifestte yazılı |
| 7 | **Test süresi/bellek** (20 dosya × büyük dünya) | `loadRealWorld` modül-önbellekli; gerekirse `vitest` havuz ayarı (B) |
| 8 | **Karo önbelleği** (Pages) eski karoyu servis eder | `?v=sha8` (§3.2) |
| 9 | **İl listesi büyür** (komşu sliver'lar: Eskişehir/Kocaeli) HUD'da gürültü | `ProvinceTracker` zaten titremeyi eler; sliver çok küçükse A otomatik seçimde alan eşiği (örn. < 1 km²) koyar |
| 10 | **Açık karar — dünya adı:** `bati-karadeniz` / "Batı Karadeniz" önerildi | Onay/itiraz bekleniyor (7.0'dan önce) |
| 11 | **Açık karar — akış:** Faz 7'ye alınmadı | Sonraki genişleme (Kastamonu–Çankırı, ~+%60 alan) öncesi Faz 8 adayı |

## 9. Başlatma komutları (kopyala-yapıştır)

**İskele:** 7.0 yapıldı ve bu planla birlikte `main`'e girer; A ve B yalnızca `main`'de `WORLD` bloğu, `src/world/chunkKeys.ts` ve `src/world/lattice.ts` varsa başlar.

**Hesap A:**
> `docs/faz-7-paralel-plan.md`'yi ve `CLAUDE.md`'yi oku. **Faz 7 A bölümünü yap** (7.1–7.4, Veri ve karolar). 7.0 iskele `main`'de olmalı; değilse dur ve bildir. Önce 7.1 ve **7.2'yi bitirip hemen PR'a hazırla** (B buna bağlı). Dosya sahipliği §2.2. Branch: `faz-7-a-veri`.

**Hesap B:**
> `docs/faz-7-paralel-plan.md`'yi ve `CLAUDE.md`'yi oku. **Faz 7 B bölümünü yap** (7.5–7.9, Çalışma zamanı ve oyun). 7.0 iskele `main`'de olmalı; değilse dur ve bildir. 7.5 ile başla (A'yı beklemez); 7.6 için A'nın 7.2'sinin (S1) `main`'e girmesini bekle, 7.9 için 7.4'ü (S2). Dosya sahipliği §2.2. Branch: `faz-7-b-calisma`.
