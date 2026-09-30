# Faz 4 — Paralel Çalışma Planı: 4.3 (Nesne Yerleşimi) ve 4.4 (Eşyalar ve Envanter)

Bu belge, Faz 4'ün **4.3** ve **4.4** alt görevlerinin iki ayrı oturumda (farklı hesaplarda) **aynı anda** yürütülmesi için hazırlandı. İki görev bilerek birbirinden bağımsız kesildi: 4.3 dünyayı (Three.js + arazi verisi), 4.4 saf oyun mantığını (Three.js'siz) ilgilendirir. Birleşim noktaları **§2 Oturumlar arası sözleşme**'de sabitlenmiştir.

> **Kullanıma başlamadan önce:** `CLAUDE.md` ("Mevcut Durum", "Mimari Kurallar", "Koordinat Sistemi", "Çalışma Kuralları") ve `ROADMAP.md`'deki Faz 4 bölümünü oku. Kullanıcı seni bu belgeye işaret ederek başlattıysa bu plan onaylanmıştır (CLAUDE.md "Plan, sonra kod" kuralı); plandan sapmak gerekirse uygulamadan önce kullanıcıya sor.

## 0. Başlangıç noktası

- `main` = Faz 3 + Faz 4.1 (arazi örtüsü veri hattı, `landcover.bin`) + Faz 4.2 (arazi örtüsüne göre zemin rengi). İkisi de birleşti.
- Hazır olanlar, bu görevlerin dayanağı:
  - `src/world/LandCoverMap.ts`: `classAt(x, z)` / `valueAt(x, z)`; sınıflar `none, forest, shrub, grass, crop, barren, urban, snow, wetland` (`src/data/landcover.ts`). Bölgede orman ≈ %61, çalı ≈ %12, tarım ≈ %2,6, yerleşim ≈ %0,6; kalanı deniz/sınıfsız. Sınıf çözünürlüğü 100 m hücre (oyunda 2 m).
  - `RegionHeightSource` (`heightAt`, `elevationAt` = gerçek rakım m, `slopeDegAt` = oyun uzayı eğimi, `sample`, `bounds`, `cell`), `FreshWaterIndex.nearest(x, z, maxDistance)`, chunk ızgarası (`world/chunks.ts`: `makeChunkGrid`, `sampleX/Z`, `chunkKey`, 128×128 hücre = 256×256 oyun m).
  - `utils/random.ts`: seed'li `createRandom(seed)` (mulberry32).
  - `survival/vitals.ts`: `applyConsumable(state, {satiety?, hydration?})` (yemek etkisinin hazır tek noktası).
  - Yürünebilirlik: `REGION_PLAYER.maxSlopeDeg = 60`; deniz hücreleri gerçek rakım ≤ ~1 m (`SPAWN_SEARCH.minElevation`).
- Bölgenin yerleşim kaynağı Overture/ESA'dır (OSM değil); "yerleşim" = `urban` sınıfıdır (bkz. ROADMAP notu).

## 1. Paralel çalışma kuralları

### 1.1 Branch ve PR
- 4.3: `faz-4-3-nesne-yerlesimi`, 4.4: `faz-4-4-envanter` (her ikisi de güncel `main`'den açılır; oturum kendi atanmış branch'ini dayatıyorsa o kullanılır — kural aynı: **her görev kendi branch'i ve kendi PR'ı**).
- Conventional Commits; bir alt adım = bir anlamlı commit. PR'ı kullanıcı isterse aç (kendiliğinden açma/birleştirme).
- Her PR birleşmeden önce `npm run lint`, `typecheck`, `npm test`, `npm run build`, `npm run format:check` hatasız geçmeli.

### 1.2 Dosya sahipliği (çakışmayı önleyen sınır)

| Alan | 4.3 | 4.4 |
|---|---|---|
| `src/world/scatter*.ts`, `propKinds.ts`, `propGeometry.ts`, `PropLayer.ts`, `propIndex.ts` | **sahibi** | dokunma |
| `src/world/RegionWorld.ts` | **tek düzenleyen** (PropLayer'ı bağlar) | dokunma |
| `src/items/**` | dokunma | **sahibi** |
| `src/survival/SurvivalSystem.ts`, `src/core/events.ts` | dokunma | **tek düzenleyen** (yalnızca §4'teki ekleme) |
| `src/utils/random.ts` | yalnızca **ekleme** (`seedFrom`, §3.2) | dokunma |
| `src/config.ts` | yalnızca `SCATTER` bloğu (§1.3) | yalnızca `INVENTORY` ve `FOOD` blokları (§1.3) |
| `tests/` | `scatter*.test.ts`, `propLayer*.test.ts`, `seedFrom` testi | `items*.test.ts`, `inventory*.test.ts`, `consume*.test.ts` |
| `ROADMAP.md` | yalnızca kendi görev satırlarını işaretler | yalnızca kendi görev satırlarını işaretler |
| `CLAUDE.md` "Mevcut Durum" | **dokunma** (4.10'da toplu güncellenir) | **dokunma** |

Başka alana dokunman gerekirse (ör. ortak bir yardımcıdaki hata) önce kullanıcıya sor; değişikliği ayrı, küçük bir commit/PR yap.

### 1.3 `config.ts` için çakışmasız yerleşim
İki oturum da `config.ts`'e yeni bloklar ekler. Git'in ekleme-ekleme çakışması çıkmasın diye **farklı bağlama noktaları**:
- **4.3** `SCATTER` bloğunu `TERRAIN_LOOK` bloğunun **hemen altına** ekler (arazi görünümüyle ilgili).
- **4.4** `INVENTORY` ve `FOOD` bloklarını dosyanın **en sonuna** (`SURVIVAL_HUD`'un altına) ekler.
- Her blok açıklamalı (Türkçe) ve `as const` olur (CLAUDE.md "Sihirli sayı yok").
- Sonra birleşen oturum `main`'i kendi branch'ine birleştirir (`git merge origin/main`); çakışma çıkarsa **her iki bloğu da tutar**.

### 1.4 Birleşme sırası ve belgeler
- Sıra serbest; biri `main`'e girince diğeri `main`'i branch'ine birleştirip testleri yeniden çalıştırır.
- Sürüm notları, ölçümler ve sapmalar **PR açıklamasına** yazılır. `CLAUDE.md` "Mevcut Durum" ve Faz 4 kabul kriterleri **4.10**'da (ayrı görev) toplu güncellenir; bu iki görevde yalnızca ROADMAP'teki kendi satırlarını işaretle.
- ROADMAP satırını işaretlerken metni gerçeğe uydur (ör. "OSM orman poligonları" yerine "arazi örtüsü sınıfına göre").

### 1.5 Ortam notları
- Yeni oturumda `npm ci` (ve yalnızca gerekirse `pip install -r tools/requirements.txt`). **Bu iki görev için ham veri indirmeye gerek yoktur**: gerçek bölge verisi `public/data/regions/` altında commit'lidir; testler bunu kullanır (`tests/helpers/realRegion.ts`).
- Yeni bağımlılık **ekleme** (gerekirse gerekçesiyle kullanıcıya sor).

---

## 2. Oturumlar arası sözleşme (sabit; iki taraf da aynen uygular)

İki görev birbirini **import etmez**. Aşağıdaki adlar ve tipler, sonradan birleştirecek olan 4.6'nın (toplama etkileşimi) ikisini de doğrudan bağlayabilmesi için sabittir. Değişmesi gerekirse bu belge ayrı bir küçük PR ile güncellenir.

### 2.1 `PropKind` (4.3 tanımlar: `src/world/propKinds.ts`)

```ts
export const PROP_KINDS = [
  'tree_broadleaf', // yapraklı (kayın, gürgen, meşe)
  'tree_conifer',   // iğne yapraklı (karaçam, göknar)
  'bush',           // genel çalı
  'rock',           // kaya
  'berry_bush',     // böğürtlen/yaban mersini çalısı (yenebilir)
  'hazel',          // fındık ağaççığı (yenebilir)
  'chestnut',       // kestane ağacı (yenebilir)
  'mushroom',       // yenebilir mantar (küçük)
  'stick',          // yerde dal (küçük)
  'stone',          // yerde taş (küçük)
] as const;
export type PropKind = (typeof PROP_KINDS)[number];
```

### 2.2 `ItemId` (4.4 tanımlar: `src/items/itemDefs.ts`)

```ts
export const ITEM_IDS = [
  // malzeme
  'stick', 'stone', 'log', 'bark', 'tinder',
  // yiyecek
  'hazelnut', 'chestnut', 'blackberry', 'mushroom_edible',
  // aletler (4.5'te üretilir; kimlikler şimdiden tanımlı)
  'stone_axe', 'water_container_empty', 'water_container_full',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];
```

### 2.3 Hangi nesne neyi verir (4.6'da uygulanır; burada yalnızca bağlamayı netleştirir)

| `PropKind` | Elle | Baltayla (`stone_axe`) |
|---|---|---|
| `tree_broadleaf`, `tree_conifer` | `stick` | `log` (+ `bark`) — ağaç o oturum boyunca yok olur |
| `bush` | `stick`, `tinder` | — |
| `rock` | `stone` | — |
| `berry_bush` | `blackberry` | — |
| `hazel` | `hazelnut` | — |
| `chestnut` | `chestnut` | `log` |
| `mushroom` | `mushroom_edible` | — |
| `stick` / `stone` (yerde) | `stick` / `stone` (nesne toplanınca kaybolur) | — |

Bu tablo **4.3'ün (hangi nesneler var) ve 4.4'ün (hangi eşyalar var) birbirini karşıladığını** garanti eder: tablodaki her eşya kimliği `ITEM_IDS`'te, her nesne türü `PROP_KINDS`'te vardır. 4.6 bu eşlemeyi `interaction/` altında kodlar (ikisine de bağımlı olduğu için ancak iki görev birleştikten sonra yazılabilir).

### 2.4 Stabil nesne kimliği ve sorgu API'si (4.3 sağlar; 4.6 tüketir)

```ts
/** Bir nesnenin oturumlar ve yeniden yüklemeler boyunca sabit kimliği: aynı seed → aynı kimlik. */
export type PropId = number; // propId(chunkKey, index) = chunkKey * 65536 + index  (index < 65536)

export interface PropRef {
  id: PropId;
  kind: PropKind;
  x: number; y: number; z: number; // oyun koordinatı (y = zemin)
  scale: number;
}

// PropLayer (RegionWorld üzerinden erişilir)
propsNear(x: number, z: number, radius: number): PropRef[]; // yalnızca yüklü chunk'lar
setPropDepleted(id: PropId, depleted: boolean): void;       // görseli gizler/geri getirir (durumu tutan 4.6'dır)
```

---

## 3. Görev 4.3 — Seed'li nesne yerleşimi (ağaç, kaya, çalı, yenebilir bitki)

**Amaç:** Arazi örtüsüne göre deterministik ve performanslı bir "yaşayan dünya": oyuncu çevresinde orman, çalılık, kaya ve toplanabilir bitkiler. (Etkileşim 4.6'dadır; bu görevde nesneler yalnızca görünür ve sorgulanabilir.)

### 3.1 Saf mantık: `src/world/scatter.ts` (Three.js'siz)

`scatterChunk(input): ChunkProps`
- **Girdi:** `{ cx, cy, grid: ChunkGrid, seed, cover: LandCoverMap, height: {heightAt, elevationAt, slopeDegAt}, isWater: (x, z) => boolean }`.
- **Çıktı:** tür başına struct-of-arrays (`Float32Array`: x, y, z, yaw, scale) + `index` sırası. Bellek/GC dostu; Three.js'e geçerken doğrudan matrise çevrilir.
- **Aday noktalar:** chunk içinde jitter'lı ızgara (her aday hücresi kendi alt-seed'iyle). Yoğunluk, sınıf başına `SCATTER` tablosunda (nesne/100 m² oyun alanı). Chunk sınırına düşen nesne yalnızca **bir** chunk'a aittir (konuma göre): komşu chunk'larda çift nesne ya da boşluk olmaz.
- **Sınıf → tür tablosu (öneri; `SCATTER`'de ayarlanır):**
  - `forest`: `tree_broadleaf` (gerçek rakım < ~900 m) / `tree_conifer` (> ~700 m, arada karışık; geçiş gürültüyle), az miktarda `chestnut` (200–900 m), `bush`, `berry_bush` (orman kenarı/aralık), `mushroom`, `stick`, `stone`, az `rock`.
  - `shrub`: `bush` (yoğun), `berry_bush`, `hazel` (< ~600 m), az `tree_*`, `rock`, `stick`.
  - `grass`: seyrek `bush`, `rock`, `stone`.
  - `crop`: seyrek `hazel` (Karadeniz fındığı), `stick`; ağaç yok.
  - `barren`: yoğun `rock`, `stone`; bitki yok.
  - `wetland`: seyrek `bush`. `urban`, `snow`, `none`: hiçbir şey.
- **Eleme kuralları:** gerçek rakım ≤ `SCATTER.minElevation` (deniz/kıyı); oyun eğimi > tür başına sınır (ağaç < `maxSlopeDeg`'den biraz düşük; kaya serbest); tatlı suya `SCATTER.waterClearance` (oyun m) içinde ağaç/çalı yok (`isWater` = `FreshWaterIndex.nearest(x, z, clearance) !== null`); ağaç sınırı üstünde (gerçek rakım > ~1700 m) `tree_*` yok.
- **Ölçek:** boyutlar oyun metresi ve **gerçek boyut** (oyuncu 1,8 m; yapraklı ağaç ≈ 12–22 m, iğne yapraklı ≈ 16–28 m, çalı ≈ 0,8–1,6 m, kaya ≈ 0,4–2,5 m). Kaydırma: ±%15–25 rastgele ölçek, rastgele `yaw`.
- **Determinizm:** sonuç yalnızca `(seed, cx, cy)` ve sabit veriye bağlıdır; yükleme sırasından, LOD'dan, oyuncu konumundan bağımsız. Chunk alt-seed'i: `seedFrom(SCATTER.seed, cx, cy)`.

### 3.2 Yardımcılar
- `src/utils/random.ts`'e **ekleme**: `seedFrom(...ints: number[]): number` (32-bit karma; `createRandom`'a verilir). Testli, mevcut API değişmez.
- `src/world/propIndex.ts` (saf): yüklü chunk'lardaki nesneler için `near(x, z, radius)` sorgusu ve `propId`/`decodePropId`. İndeks chunk başına ızgara/sıralama ile çalışır.

### 3.3 Görsel katman: `PropLayer` (Three.js)
- **Geometri (doku yok):** `world/propGeometry.ts` her tür için düşük poligonlu prosedürel `BufferGeometry` üretir (gövde silindiri + 1–3 koni/ikosfer taç; çalı = basık ikosfer; kaya = deforme ikosaedron; küçük nesneler tek koni/küre), renk **vertex renginde**. Materyal `MeshStandardMaterial` (vertexColors, ışık ve sis çalışır). Örnek başına ton farkı için `instanceColor`.
- **Çizim:** her tür için bir (veya LOD'lu iki) `InstancedMesh`. Etkin chunk kümesi değişince örnek tamponları önbellekteki chunk sonuçlarından yeniden doldurulur; her kümenin `boundingSphere`'i güncellenir (frustum culling).
- **Akış:** oyuncuya `SCATTER.drawRadius` içindeki chunk'lar etkin; hesaplama/yeniden kurma **karede en fazla `SCATTER.maxChunkBuildsPerFrame`** chunk (ChunkManager'daki gibi bütçe), hesaplanan chunk'lar sınırlı LRU önbellekte. Işınlanmada (`prepare`) hepsi senkron kurulur.
- **Sis/pop-in:** `REGION_SCENE.fogNear = 400` olduğundan yakın yarıçapta nesne "belirmesi" gözle görünebilir. Sırasıyla dene: (1) iki kademe — yakında tam geometri, uzakta (≈150–600 m) daha basit/ucuz geometri; (2) ölçek 0→1 kısa giriş animasyonu; (3) `fogNear`'ı gerekiyorsa ayarla (ayrı commit, gerekçesiyle).
- **Çarpışma yok:** nesneler fizik collider'ı içermez; oyuncu içlerinden yürür (plan kararı, ilk sürüm). Collider istenirse ayrı bir görev.
- **Bellek/kaynak temizliği:** kaldırılan/yeniden kurulan her `InstancedMesh`/geometry/materyal `dispose()` edilir; `RegionWorld.dispose()` `PropLayer.dispose()`'u çağırır.
- **API:** §2.4'teki `propsNear` ve `setPropDepleted` (gizleme: örnek matrisini sıfır ölçeğe çekip tamponu işaretleme). `RegionWorld` bunları dışarı açar; `GameWorld` arayüzüne **isteğe bağlı** `propsNear?` ve `setPropDepleted?` eklenir (mevcut isteğe bağlı yöntemler gibi).
- **Dev göstergesi:** `window.__game` üzerinden erişilen istatistik (etkin chunk, örnek sayısı, tür başına), debug HUD'a bir satır.

### 3.3.1 `config.ts` → `SCATTER` (öneri; ölçümle ayarlanır)
`seed`, `drawRadius`, `maxChunkBuildsPerFrame`, `chunkCacheSize`, `minElevation`, `waterClearance`, sınıf başına tür yoğunlukları, tür başına ölçek aralığı/eğim sınırı/rakım aralığı, `maxInstancesPerKind` (tampon kapasitesi ve üst sınır), renkler.

### 3.4 Alt adımlar (her biri bir commit)
1. `seedFrom` + testi; `propKinds.ts` (§2.1); `SCATTER` iskeleti.
2. `scatter.ts` + `propIndex.ts` (saf) + testler.
3. `propGeometry.ts` (+ testler: köşe/üçgen sayısı bütçeleri, renk dizisi uzunluğu).
4. `PropLayer` + `RegionWorld` bağlantısı + `dispose` temizliği + dev göstergesi.
5. Ölçüm ve ayar: çizim yarıçapı, yoğunluklar, pop-in çözümü; ROADMAP satırları.

### 3.5 Kabul ölçütleri (testle kanıtlanacaklar)
- **Determinizm:** aynı `(seed, cx, cy)` → bit bit aynı çıktı; chunk'ların hesaplanma sırası sonucu değiştirmez.
- **Dikiş:** komşu chunk sınırında çift veya kayıp nesne yok (konum → chunk sahipliği tek).
- **Kurallar:** gerçek bölgede (gerçek `landcover`, yükseklik, su) üretilen tüm nesneler için: deniz/kıyı yok, tatlı su tamponunda ağaç/çalı yok, eğim sınırı aşılmaz, `urban/snow/none` üzerinde nesne yok, tür–sınıf tablosuna uyulur, her `y` = `heightAt`.
- **Yoğunluk:** ormanlık bir chunk'ta ağaç yoğunluğu `SCATTER` hedefinin ±%15'inde; tarım/çıplak/yerleşimde ağaç yok.
- **Orman örtüşmesi:** ağaçların ≥ %99'u `forest` veya `shrub`/`crop`(yalnızca izin verilen türler) hücresine düşer; `forest` hücrelerinin ≥ %90'ında en az bir ağaç (ROADMAP "Ormanlar gerçek orman alanlarıyla örtüşüyor" kriterinin sayısal karşılığı).
- **Kimlik:** `propId` ↔ `decodePropId` gidiş-dönüş; aynı kimlik yeniden yüklemede aynı nesneyi gösterir.
- **Sorgu:** `propsNear` yarıçap dışını dışlar, kenar değerleri doğru.
- **Kaynak:** `PropLayer.dispose()` sonrası tüm geometri/materyal `dispose` edilmiş (three'nin `dispose` olayıyla sayılır); örnek sayısı `maxInstancesPerKind`'ı aşmaz.
- **Hız:** gerçek bölgede tek chunk `scatterChunk` süresi gevşek bir üst sınırın altında (örn. < 50 ms; CI gürültüsüne karşı cömert).
- **Görsel/performans (kanıt PR açıklamasında):** headless ölçümle (bkz. Ek) en kötü durumda draw call ve üçgen sayısı; hedef: mevcut 98 draw call / ~538 bin üçgene **≤ +20 draw call ve ≤ +300 bin üçgen**; aşılırsa yarıçap/yoğunluk/LOD ile düşür ve ölçümü yaz. Orman ve çalılık, kıyı ve yerleşim çevresi için ekran görüntüleri; gerçek FPS elle doğrulanacak (headless yazılımsal WebGL FPS ölçmez).

### 3.6 4.3 kapsam dışı
Toplama/etkileşim (4.6), collider, hayvanlar, ağaç sallanması/animasyon, gölge, mevsim renkleri, ses.

---

## 4. Görev 4.4 — Eşyalar ve envanter (saf mantık)

**Amaç:** Three.js'e bağımlı olmayan, tam testli eşya tanımları ve envanter; yemek yemenin hayatta kalma sistemine bağlanması. Arayüz (4.7), tarifler (4.5) ve toplama (4.6) bunun üzerine kurulur.

### 4.1 Eşya tanımları: `src/items/itemDefs.ts`
- `ITEM_IDS` / `ItemId` (§2.2) ve `ITEMS: Record<ItemId, ItemDef>`:
  ```ts
  interface ItemDef {
    id: ItemId;
    name: string;          // Türkçe görünen ad
    weightG: number;       // gram (tam sayı: kayan nokta hatası olmasın)
    stackMax: number;      // bir slottaki en fazla adet (aletler 1)
    category: 'material' | 'food' | 'tool';
    edible?: { satiety?: number; hydration?: number; health?: number };
  }
  ```
- **Başlangıç değerleri (öneri, ayarlanabilir):** `stick` 300 g/×20, `stone` 500 g/×10, `log` 3000 g/×3, `bark` 100 g/×30, `tinder` 30 g/×30; `hazelnut` 30 g/×30 (tokluk +4), `chestnut` 50 g/×20 (+6), `blackberry` 20 g/×30 (+3, su +2), `mushroom_edible` 50 g/×10 (+5); `stone_axe` 1500 g/×1; `water_container_empty` 300 g/×1, `water_container_full` 1300 g/×1. (Tokluk 30 dk'da boşalır: ≈ 3,3/dk; bu değerler bir avuç fındığın dakikalar kazandırdığı bir dengeyi hedefler, "his" elle doğrulanır.)
- **Ayrım:** eşya içeriği (kimlik, ad, ağırlık, etki) `items/itemDefs.ts`'te veri tablosudur; genel ayarlar `config.ts`'te: `INVENTORY = { slots: 20, maxWeightG: 25_000 }` ve `FOOD = { eatMinDeficit }` (tok olan yemek yiyemez; `SURVIVAL.drinkMinDeficit` gibi). Bu ayrım `CLAUDE.md` "Sihirli sayı yok" kuralının eşya tablosu için yorumudur; PR açıklamasında belirt.

### 4.2 `Inventory` sınıfı: `src/items/Inventory.ts`
```ts
interface ItemStack { id: ItemId; count: number }

class Inventory {
  constructor(options?: { slots?: number; maxWeightG?: number });
  readonly slotCount: number;
  get slots(): ReadonlyArray<ItemStack | null>;
  get totalWeightG(): number;
  get version(): number;                 // her değişimde artar (UI "kirli" denetimi)
  count(id: ItemId): number;
  has(id: ItemId, n?: number): boolean;
  capacityFor(id: ItemId): number;       // bu eşyadan kaç adet daha sığar (slot + ağırlık)
  add(id: ItemId, n: number): number;    // sığmayan (artan) miktarı döndürür; kısmi ekleme yapar
  remove(id: ItemId, n: number): boolean; // yetmezse hiçbir şey çıkarmaz (atomik)
  removeFromSlot(index: number, n: number): ItemStack | null;
  moveSlot(from: number, to: number): void;  // aynı eşya ise birleştirir, değilse takas
  canAfford(costs: ReadonlyArray<ItemStack>): boolean;  // 4.5 (crafting) için
  take(costs: ReadonlyArray<ItemStack>): boolean;       // atomik
  toJSON(): InventorySave;
  static fromJSON(data: unknown, options?): Inventory;  // doğrular; bozuk veride hata fırlatır
}
interface InventorySave { version: 1; slots: Array<ItemStack | null> }
```
- Kurallar: aynı eşyalar `stackMax`'a kadar mevcut slotlarda birleşir, taşan yeni slota açılır; ağırlık sınırı aşılınca ekleme kısmi yapılır; sıra deterministik (ilk uygun slot). `add`/`remove` negatif veya tam olmayan sayıda `RangeError`.
- **Kayıt formatı sürümlüdür** (`version: 1`): Faz 6 kayıt sistemine hazırlık. `fromJSON` bilinmeyen `id`, sınır aşan adet, slot sayısı uyuşmazlığı gibi bozuklukları reddeder.
- Sınıf EventBus'a bağlı **değildir** (saf); olayları (`item:collected` vb.) 4.6'daki etkileşim katmanı yayınlar.

### 4.3 Yemek yeme: `src/items/consume.ts` + küçük sistem ekleri
- `consume.ts` (saf): `edibleEffect(id)`; `canEat(state, id)` (tokluk eksiği `FOOD.eatMinDeficit`'ten büyük mü; yenebilir mi); `eat(inventory, slotIndex | id, vitals): { vitals, eaten: ItemId } | null` (başarılıysa 1 adet düşer, `applyConsumable` ile göstergeleri artırır, 100'e kırpar; sağlık etkisi varsa uygular).
- `SurvivalSystem.consume(effect: {satiety?, hydration?, health?}, item?: ItemId)`: ölüyse no-op; `applyConsumable` ile durumu günceller ve `player:ate` olayını yayınlar.
- `core/events.ts`: `'player:ate': { item: ItemId; satiety: number; hydration: number }` (yük tipi `items/`'tan yalnızca **tip** import eder).
- `consume.ts` ve `SurvivalSystem` `Game`'e bağlanmaz: arayüz/tuş (4.7) ve gerçek eşya kaynağı (4.6) henüz yok; bağlama sonraki görevdedir.

### 4.4 Alt adımlar (her biri bir commit)
1. `itemDefs.ts` (tablo + `ITEM_IDS`) + `INVENTORY`/`FOOD` config blokları + tablo testleri.
2. `Inventory` (ekle/çıkar/birleştir/ağırlık/atomik maliyet) + testler.
3. Seri hale getirme (`toJSON`/`fromJSON`, sürüm, doğrulama) + testler.
4. `consume.ts` + `SurvivalSystem.consume` + `player:ate` + testler.
5. ROADMAP satırları; PR açıklaması.

### 4.5 Kabul ölçütleri (testle kanıtlanacaklar)
- **Tablo bütünlüğü:** `ITEM_IDS`'teki her kimliğin tanımı var; ağırlık > 0 tam sayı, `stackMax` ≥ 1 tam sayı, yenebilir etkiler 0–100 aralığında, ad boş değil; alet `stackMax = 1`.
- **Envanter davranışı:** birleştirme/taşma, dolu slotlarda kısmi ekleme, ağırlık sınırında kısmi ekleme (ve `capacityFor` ile tutarlılık), `remove` yetmeyince hiçbir şeyi değiştirmez (atomik), `take`/`canAfford` tutarlı, `moveSlot` birleştirir/takas eder, sınır dışı indekslerde hata.
- **Değişmezler (seed'li rastgele işlem dizisiyle, `utils/random.ts`):** her adımda `totalWeightG ≤ maxWeightG`; her slot `1 ≤ count ≤ stackMax`; eşya korunumu (eklenen − çıkarılan = mevcut); `version` yalnızca gerçek değişimde artar.
- **Kayıt:** `fromJSON(toJSON(x))` birebir aynı durum; bozuk/bilinmeyen sürüm/kimlik/adet reddedilir.
- **Yemek:** tokluk/su artar ve 100'e kırpılır; tokken (eşik altı eksik) yenmez ve adet düşmez; envanterde yoksa `null`; ölü oyuncu yiyemez; `player:ate` doğru yükle bir kez yayınlanır.
- `npm run lint`, `typecheck`, `test`, `build` hatasız; **yeni bağımlılık yok**.

### 4.6 4.4 kapsam dışı
Arayüz/panel/tuşlar (4.7), tarifler ve üretim (4.5), yerde/dünyada eşya nesneleri (4.3/4.6), ateş/barınak (4.8–4.9), bozulma/çürüme, pişirme (Faz 5), kayıt dosyasının yazılması (Faz 6; yalnızca serileştirme hazırlığı).

---

## 5. İki görev bittikten sonra (özet; bu oturumların işi değil)

| Sonraki | Bağımlılık | Not |
|---|---|---|
| 4.5 Crafting (saf mantık) | 4.4 | Tarifler `Inventory.canAfford/take` üzerinden; ürün kimlikleri 4.4'te hazır |
| 4.6 Toplama etkileşimi | 4.3 + 4.4 | §2.3 tablosu; `propsNear` ile odak seçimi; `E` basılı tutma, `SurvivalSystem`/su içme ile öncelik; `item:collected` olayı |
| 4.7 Arayüz | 4.4 (+4.5) | Envanter/üretim paneli, yemek yeme tuşu, HUD ipuçları |
| 4.8 Yerleştirme | 4.5 | Ateş/barınak hayaleti, yakıt süresi, `PointLight` |
| 4.9 Hayatta kalma etkileri | 4.8 | `SurvivalContext`'e `warmthC`, `sheltered` |
| 4.10 Kapanış | hepsi | ROADMAP, `CLAUDE.md` "Mevcut Durum", README |

---

## Ek — Başsız (headless) görsel/performans doğrulama tarifi

Bu ortamda gerçek GPU yok; yazılımsal WebGL ile **şekil ve sayım** doğrulanır, FPS ölçülmez.
1. `npx vite --port 5173` (arka planda). Geliştirme modunda `window.__game` vardır (`world`, `player`, `playerCamera`, `renderer`, `teleportToLatLon(lat, lon)`).
2. Playwright bu ortamda global kuruludur: `require('/opt/node22/lib/node_modules/playwright')`; Chromium: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; başlatma argümanları `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --no-sandbox`. Duraklatma menüsü ekranı örter: `.pause-menu { display: none !important }` stili ekle.
3. Yer seviyesi: `teleportToLatLon(...)`, `playerCamera.yaw/pitch` ayarla, ~6 sn bekle, `page.screenshot`. Kuş bakışı: aynı sahneyi `game.playerCamera.camera.clone()` ile yüksekte bir kameradan `game.renderer.render(game.world.scene, cam)` ile çizip `renderer.domElement.toDataURL()` al (aynı `evaluate` içinde).
4. Sayım: `renderer.info.render.calls` / `.triangles` (bir kare sonrası). Önemli noktalar: Yenice (41.20, 32.34; yoğun orman), Zonguldak (41.46, 31.80), Amasra (41.75, 32.39; kıyı), Safranbolu (41.25, 32.69; yerleşim), Filyos vadisi (41.57, 32.03).
5. İş bitince dev sunucuyu kapat.
