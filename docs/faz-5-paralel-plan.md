# Faz 5 — Paralel Çalışma Planı: Canlılar (Hesap A: Beyin · Hesap B: Beden ve Oyuncu)

Bu belge, Faz 5'in **iki ayrı hesapta (iki oturum) aynı anda** yürütülmesi için hazırlandı. Faz 4'teki (bkz. [faz-4-paralel-plan.md](faz-4-paralel-plan.md)) yöntem burada da geçerli; fark: Faz 5'in parçaları birbirine Faz 4'tekinden daha sıkı bağlı (oyuncu hayvana vurur, hayvan oyuncuya vurur, leş eşya verir). Bu yüzden önce **tek bir küçük iskele (5.0)** birleşir, sonra iki hesap birbirini import etmeden, yalnızca iskelede sabitlenmiş sözleşme üzerinden konuşur.

> **Kullanıma başlamadan önce:** `CLAUDE.md` ("Mevcut Durum", "Mimari Kurallar", "Koordinat Sistemi", "Çalışma Kuralları") ve `ROADMAP.md`'deki Faz 5 bölümünü oku. Kullanıcı seni bu belgeye işaret ederek başlattıysa bu plan onaylanmıştır (CLAUDE.md "Plan, sonra kod" kuralı); plandan sapmak gerekirse uygulamadan önce kullanıcıya sor.

## 0. Özet

| | İş | Hesap | Branch |
|---|---|---|---|
| **5.0** | İskele: sözleşme tipleri, olaylar, config iskeleti, eşya kimlikleri, boş `CreatureSystem`/`CombatSystem` + `Game` bağlantıları, yer tutucu kutu çizimi | bu oturum (plan sahibi) | `faz-5-0-iskele` |
| **5.1–5.5** | **Beyin:** tür tablosu, durum makinesi AI, doğma kuralları, hareket/akış, ölçüm | **A** | `faz-5-a-beyin` |
| **5.6–5.11** | **Beden ve oyuncu:** hasar/savunma, oyuncu saldırısı, eşya/tarif, leş kesme + pişirme, canlı görseli, arayüz | **B** | `faz-5-b-beden` |
| **5.12** | Birleştirme: gerçek canlılarla av zinciri, denge, birleşik performans ölçümü | kalan hesap | `faz-5-entegrasyon` |
| **5.13** | Kapanış: ROADMAP, `CLAUDE.md` "Mevcut Durum", README | kalan hesap | (5.12 ile aynı) |

Kesim mantığı: **A simülasyonu** (saf mantık + dünya verisi), **B oyuncunun gördüğü ve yaptığı her şeyi** (çizim, saldırı, av, pişirme, arayüz) yapar. A'nın işi Three.js'siz saf mantık ağırlıklıdır; B'nin işi görsel/arayüz ağırlıklıdır — çakışma yüzeyi bu yüzden küçüktür. Yük kabaca dengelidir (A ≈ 13, B ≈ 15 "küçük commit").

## 1. Başlangıç noktası

- `main` = Faz 0–4 (kod). Faz 4'ün elle-doğrulama maddeleri açık (CLAUDE.md "Mevcut Durum"); Faz 5 bunları beklemeden başlar.
- Hazır dayanaklar:
  - Arazi: `RegionHeightSource` (`heightAt`, `elevationAt` gerçek m, `slopeDegAt` oyun eğimi), `LandCoverMap.classAt`, `FreshWaterIndex.nearest`, chunk ızgarası (`world/chunks.ts`, 256×256 oyun m), `REGION_PLAYER.maxSlopeDeg = 60`. Deniz hücreleri gerçek rakım ≤ ~1 m (`SPAWN_SEARCH.minElevation`).
  - Zaman: `survival.clock` (`hour`, `isNight`, `sun.altitudeDeg`), `SurvivalSystem` (`consume`, `state`, `alive`), `Activity` (`rest|walk|run`, `survival/vitals.ts`).
  - Eşya: `Inventory`, `ITEMS`, `RECIPES`, `craft`, `applyEdible` (negatif `health` destekler).
  - Yapılar: `StructureSet` (yanık ateş: `isLit`, `near`), `FireTender`, `StructureLayer`'ın `Game` içinde `world.scene`'e eklenmesi (aynı kalıp canlı katmanı için kullanılır; `RegionWorld`'e çizim eklenmez).
  - `utils/random.ts`: `createRandom(seed)`, `seedFrom(...)`.
- **Yeni veri indirilmez.** Hayvan dağılımı mevcut katmanlardan (arazi örtüsü, rakım, eğim, su) türetilir. Gerçek bölge verisi commit'lidir; testler `tests/helpers/realRegion.ts` ile kullanır.
- Hayvan ekolojisi **yaklaşıktır** (oyun dengesi için; bilimsel dağılım haritası değil). Bu, `ROADMAP`/README'de belirtilir.

## 2. Paralel çalışma kuralları

### 2.1 Branch ve PR
- `faz-5-0-iskele` (bu oturum) → `main`; **A ve B iskele birleşmeden başlamaz** (kabuk sözleşmesi ona bağlı). İskele küçüktür; birleşmesi beklenirken iki hesap yalnızca bu belgeyi, `CLAUDE.md`'yi ve ilgili mevcut kodu okuyabilir.
- A: `faz-5-a-beyin`, B: `faz-5-b-beden` (güncel `main`'den). Oturum kendi atanmış branch'ini dayatıyorsa o kullanılır; kural aynı: **her iş kendi branch'i ve PR'ı**. PR'ı kullanıcı isterse açılır.
- Conventional Commits; bir alt adım = bir anlamlı commit.
- Her PR birleşmeden önce `npm run lint`, `typecheck`, `npm test`, `npm run build`, `npm run format:check` hatasız geçmeli.

### 2.2 Dosya sahipliği

| Alan | A | B |
|---|---|---|
| `src/creatures/**` (**`kinds.ts` hariç**, bkz. §3) | **sahibi** | dokunma |
| `src/creatures/kinds.ts` (sözleşme tipleri) | yalnızca **ekleme**, B'yi bozmadan | salt okunur |
| `src/world/RegionWorld.ts`, `GameWorld.ts` (yalnızca `CreatureTerrain` erişimi, bkz. 5.4) | **tek düzenleyen** | dokunma |
| `src/combat/**`, `src/items/**`, `src/placement/**` (pişirme), `src/ui/**`, `src/core/Input.ts`, `inputMapping.ts` | dokunma | **sahibi** |
| `src/world/CreatureLayer.ts` + `creatureGeometry.ts` | dokunma | **sahibi** (iskeletteki yer tutucuyu değiştirir) |
| `src/survival/**` | dokunma | **sahibi** (yalnızca hasar ekleri, bkz. 5.6) |
| `src/core/events.ts` | yalnızca kendi bölümü (A bölümü) | yalnızca kendi bölümü (B bölümü) |
| `src/core/Game.ts` | yalnızca `creatureContext()` yöntemi | **ana düzenleyen** (saldırı tıklaması, pişirme/kesme önceliği, ipuçları, hasar tepkisi) |
| `src/config.ts` | yalnızca `CREATURES` bloğunun içi | yalnızca `COMBAT`, `LOOT`, `COOKING` blokları |
| `tests/` | `creature*.test.ts`, `spawn*.test.ts`, `ai*.test.ts`, `perception*.test.ts` | `combat*.test.ts`, `loot*.test.ts`, `cooking*.test.ts`, `carcass*.test.ts`, `damage*.test.ts`, `creatureLayer*.test.ts`, itemDefs/recipes testleri |
| `ROADMAP.md` | yalnızca 5.1–5.5 satırları | yalnızca 5.6–5.11 satırları |
| `CLAUDE.md` "Mevcut Durum" | dokunma | dokunma (5.13'te toplu) |

Bu sınırın dışına dokunman gerekirse önce kullanıcıya sor; değişikliği ayrı, küçük bir commit/PR yap.

### 2.3 Çakışmayı önleyen mekanizmalar (iskelenin işi)
- **Sahip olunan bloklar önceden açılır.** `config.ts`'te `CREATURES` (A), `COMBAT`/`LOOT`/`COOKING` (B) iskelede boş-ama-tipli bloklar olarak eklenir; herkes kendi bloğunun içinde çalışır, ekleme-ekleme çakışması çıkmaz.
- **`events.ts` bölümlere ayrılır:** `// ── Faz 5: Canlılar (A) ──` ve `// ── Faz 5: Oyuncu tarafı (B) ──` başlıkları; herkes yalnızca kendi başlığının altına ekler. **İkinci hesap birleşirken her iki bölümü de tutar.**
- **`Game.ts` bağlantıları iskelede bir kez kurulur:** `creatures` ve `combat` alanları, `update`/`render`/`dispose` çağrıları, `creatureContext()`. A ve B gövdeleri kendi dosyalarında doldurur; `Game.ts`'e dokunma ihtiyacı B'dedir (ana düzenleyen), A'da yalnızca `creatureContext()`.
- **`ItemId` kimlikleri iskelede eklenir** (yalnızca sona eklenir kuralı): `raw_meat`, `cooked_meat`, `hide`, `bone`, `stone_spear`, `hide_vest` (değerler iskelede geçerli ama yer tutucu; B ayarlar). Böylece A'nın hiçbir zaman `items/`'a dokunması gerekmez.
- **Birleşme sırası serbest.** Biri `main`'e girince diğeri `main`'i kendi branch'ine birleştirir (`git merge origin/main`), testleri yeniden çalıştırır. Sürüm notları ve ölçümler **PR açıklamasına** yazılır.

### 2.4 Ortam notları
- Yeni oturumda `npm ci`. Yeni bağımlılık **ekleme** (gerekirse gerekçesiyle kullanıcıya sor). Ses yok (Faz 6); ses gerektiren her şey Fikir Havuzu'na not edilir.
- Headless doğrulama tarifi: [faz-4-paralel-plan.md](faz-4-paralel-plan.md) Ek'i. Bu ortamda gerçek GPU yoktur: draw call/üçgen sayılır, FPS ölçülmez.

---

## 3. Oturumlar arası sözleşme (sabit; iskele bunu koda döker)

İki taraf birbirinin dosyasını import etmez; ikisi de yalnızca `creatures/kinds.ts` ve `core/events.ts`'i (iskeleteki tipleri) bilir. Değişmesi gerekirse bu belge ayrı, küçük bir PR ile güncellenir ve diğer hesap haberdar edilir.

### 3.1 Tür ve kimlik (`src/creatures/kinds.ts`)

```ts
export const CREATURE_KINDS = ['roe_deer', 'wild_boar', 'wolf', 'brown_bear'] as const; // karaca, yaban domuzu, kurt, boz ayı
export type CreatureKind = (typeof CREATURE_KINDS)[number];

/** Oturumlar arası sabit kimlik: creatureId(cellKey, index) = cellKey * 256 + index (aynı tohum → aynı kimlik). */
export type CreatureId = number;

export const CREATURE_STATES = ['idle','wander','graze','alert','flee','stalk','chase','attack','dead'] as const;
export type CreatureState = (typeof CREATURE_STATES)[number];
```
`CREATURE_KINDS` ve `CREATURE_STATES` **yalnızca sona eklenir.**

### 3.2 Görünüm anlık görüntüsü — A üretir, B tüketir

```ts
export interface CreatureView {
  id: CreatureId;
  kind: CreatureKind;
  x: number; y: number; z: number; // oyun koordinatı, y = ayak/zemin
  yaw: number;                     // bakış yönü (Player ile aynı yaw sözleşmesi: 0 = −Z)
  speed: number;                   // yatay hız (oyun m/sn) — B yürüme/koşma animasyonunu buradan sürer
  state: CreatureState;
  attackPhase: number;             // 0–1 saldırı hamlesi ilerlemesi (attack dışında 0)
  hitFlash: number;                // 0–1 vurulma parlaması (A ayarlar, sönümlenir)
  health: number; maxHealth: number;
  radius: number; height: number;  // vuruş hacmi (yatay yarıçap, boy) — B vuruş testini bundan yapar
  dead: boolean;                   // true ise leş (state = 'dead')
  deadSeconds: number;             // öleli beri geçen gerçek sn (leş çürüme/solma için)
}
```
B tür tablosunu (`species.ts`) **asla import etmez**; ihtiyacı olan her şey görünümde gelir.

### 3.3 Sistem arayüzü (`CreatureSystem`; A uygular, iskelede boş, B yalnızca bunu çağırır)

```ts
class CreatureSystem {
  constructor(events: EventBus<GameEvents>);
  update(dt: number, ctx: CreatureContext): void;              // sabit adım
  views(): ReadonlyArray<CreatureView>;                        // etkin canlılar (leşler dahil)
  near(x: number, z: number, radius: number): CreatureView[];  // yakından uzağa
  /** B → A. Canlı değilse/yoksa null. `from`: vuran konumu (kaçış/saldırı yönü ve geri tepme için). */
  damage(id: CreatureId, amount: number, from: { x: number; z: number }): { killed: boolean } | null;
  /** B → A. Kesilen leşi kaldırır; yoksa/canlıysa false. */
  removeCarcass(id: CreatureId): boolean;
  get stats(): CreatureStats;                                  // dev HUD satırı
  dispose(): void;
}

interface CreatureContext {          // Game.creatureContext() üretir (iskelede; A genişletebilir)
  player: { x: number; y: number; z: number; activity: Activity; alive: boolean };
  hour: number; sunAltitudeDeg: number; isNight: boolean;      // survival.clock
  fires: ReadonlyArray<{ x: number; z: number }>;              // yanan ateşler (StructureSet)
  terrain: CreatureTerrain | null;                             // A'nın 5.4'te tanımladığı arazi erişimi
}
```
> **5.4 eki (A, geriye uyumlu):** `CreatureContext.player` isteğe bağlı `yaw` (görüş konisinde doğma yok) ve `weakness` (0–1, avcılar zayıf hedefi gündüz de izler; `Game` `playerWeakness(survival.state)` ile verir) alanları, `CreatureContext.structures?` (tüm yapılar; çevrelerinde 25 m doğma yok) ve `CreatureSystem.killedSnapshot()/restoreKilled()` (Faz 6 kaydı için öldürülen hücre bekleme listesi) eklendi. B'nin bu alanları kullanması gerekmez; `terrain` artık `RegionWorld.creatureTerrain`'den gelir (test arenasında null → canlı yok).

Saldırı, hasar, kesme ve pişirme mantığı **B'de** saf mantık; **A**'ya hiçbir zaman eşya/envanter/oyuncu canı girmez.

### 3.4 Olaylar (`core/events.ts`)

| Olay | Yayınlayan | Yük | Tüketen |
|---|---|---|---|
| `creature:attacked` | A | `{ id, kind, damage, x, z }` (oyuncuya saldırı isabet edince; `damage` savunma öncesi ham) | B (can düşer, ölüm nedeni, ekran tepkisi) |
| `creature:damaged` | A | `{ id, kind, amount, killed }` | B (vuruş işareti) |
| `creature:died` | A | `{ id, kind, x, y, z }` | B (ipucu/istatistik); leş A'da kalır |
| `creature:noticed` | A | `{ id, kind, state }` (canlı oyuncuyu ilk fark edip `alert/stalk/chase`'e geçince) | B (uyarı ipucu, ileride ses) |
| `player:damaged` | B | `{ amount, cause, sourceKind? }` (savunma sonrası) | arayüz |
| `player:attacked` | B | `{ weapon, hitId: CreatureId \| null }` | arayüz/A için bilgilendirme |
| `carcass:butchered` | B | `{ id, kind, items: ItemStack[] }` | arayüz |
| `item:cooked` | B | `{ from, item, count }` | arayüz |

### 3.5 Hangi canlı ne verir / ne yapar (başlangıç; denge elle doğrulanır)

| Tür | Sağlık | Saldırı (ham) | Hız (yürü/koş, m/sn) | Davranış özeti | Yük (B; leş) |
|---|---|---|---|---|---|
| `roe_deer` karaca | 40 | yok | 1,5 / 9 | otlar; oyuncuyu/yırtıcıyı görünce kaçar | `raw_meat` ×3, `hide` ×1 |
| `wild_boar` yaban domuzu | 90 | 18 | 1,4 / 7 | sürü; dokunulmazsa kaçınır, vurulursa/yakınsa atak yapar | `raw_meat` ×4, `hide` ×1, `bone` ×1 |
| `wolf` kurt | 70 | 12 | 2 / 9 | 2–4'lük sürü; gece/alacakaranlık, aç/zayıf hedefe sinsi yaklaşıp kovalar; ateşten çekinir; yaralanınca kaçar | `raw_meat` ×2, `hide` ×1, `bone` ×1 |
| `brown_bear` boz ayı | 250 | 40 | 1,6 / 8 | yalnız, seyrek, yüksek orman; yaklaşılırsa/vurulursa saldırır; ateşe karşı cesaret kırılır | `raw_meat` ×8, `hide` ×2, `bone` ×2 |

Sağlık/saldırı/hız/davranış **A'nın** `species.ts`'inde; yük **B'nin** `LOOT` tablosunda (yalnız `CreatureKind` tipine bağlı). Oyuncu 100 can, silahlar (B): yumruk 4, taş balta 18, taş mızrak 28 → ayı pratikte kaçılacak/ateşle uzak tutulacak bir tehdittir; bu bilinçli bir tasarım kararıdır.

---

## 4. Hesap A — Beyin (5.1–5.5)

**Amaç:** Araziye oturmuş, deterministik, yapay zekâsı test edilmiş canlılar; oyuncu, ateş ve gün/gece ile etkileşen bir simülasyon. Çizim B'dedir; A'nın ürünü `CreatureView[]`'dir.

### A.1 Adımlar (her biri bir commit; sıra önerilir)

**5.1 Tür tablosu ve kimlikler.** `creatures/species.ts`: §3.5'teki değerler, algı (görüş yarıçapı/açı, duyma), gün/gece etkinlik penceresi, grup boyutu, arazi sınırları (en dik eğim), ateşten kaçınma yarıçapı. `creatureId`/`decodeCreatureId`. `CREATURES` config bloğu (sihirli sayı yok). Testler: tablo bütünlüğü (hız/sağlık > 0, pencereler geçerli), kimlik gidiş-dönüşü.

**5.2 Durum makinesi (saf; Kabul kriteri 3).** `creatures/ai.ts` + `perception.ts`:
- `stepCreature(creature, senses, dt, rng) → { next, intent: { heading, speed }, events }`; Three.js ve dünya verisinden bağımsız. Rastgelelik yalnızca verilen `rng` ile (canlı başına seed'li; `seedFrom(id, tick)`).
- Durumlar `CREATURE_STATES`: `idle`/`wander`/`graze` (otobur) → `alert` → `flee`; yırtıcı: `wander` → `stalk` → `chase` → `attack` → (yaralı/ateş) `flee`; `dead` uç durumdur.
- Algı: görüş mesafesi + koni, duyma (oyuncu `run` > `walk` > `rest` gürültüsü; gece görüş azalır), ateş: yanan ateşin `fireAvoidRadius`'unda yırtıcı yaklaşmaz, ayı için yarıçap küçük.
- Saldırı: hazırlık → vuruş (`attackPhase`) → bekleme; menzil tür tablosunda; `creature:attacked` yalnızca vuruş anında ve **bir kez**.
- Kural: geçişler tablo güdümlüdür (hangi durumdan hangisine, hangi koşulla) → tablo testi her geçişi doğrular.

**5.3 Doğma kuralları (saf + gerçek bölge).** `creatures/spawn.ts`:
- "Biyom" = arazi örtüsü sınıfı + gerçek rakım aralığı + eğim + suya/kıyıya uzaklık (başlangıç: karaca orman kenarı/çalı/çayır/tarım 0–1600 m; yaban domuzu orman/çalı/tarım (fındık bahçeleri) 0–1500 m; kurt orman/çalı 300–2000 m; ayı orman 600–2000 m, çok seyrek). Bu tablo **yaklaşıktır**.
- Zaman penceresi: gün/alacakaranlık/gece ağırlıkları (saat + `sunAltitudeDeg`); pencere dışı kalan canlı oyuncu görüş dışındayken sessizce kaldırılır.
- Deterministik yerleşim: chunk hücresi başına aday canlılar `seedFrom(CREATURES.seed, cx, cy, epoch)`; `CreatureId = creatureId(chunkKey, index)`. Sınır hücrelerinde çift/kayıp yok.
- Akış: oyuncuya `CREATURES.simRadius` içindeki hücreler etkin; oyuncudan `minSpawnDistance`'tan yakın, görüş konisi içindeki noktada doğma yok (pop-in olmasın); `maxActive` üst sınırı; öldürülen canlı bir süre (`respawnCooldownSeconds`, gerçek sn) aynı hücrede yeniden doğmaz. Yapıların (ateş/sundurma) 25 m'sinde doğma yok.
- Yoğunluk hedefi (ölçüm + ayar): orman gezen oyuncu ~2–3 dk'da bir karaca/domuz görür; kurt yalnızca gece/şafak ve nadir; ayı ~20 dk'da bir kez. (Elle doğrulanır.)

**5.4 `CreatureSystem`: hareket ve akış.** `creatures/CreatureSystem.ts` iskeledeki boş gövdeyi doldurur:
- Hareket: **Rapier yok**; canlılar yükseklik haritasında kinematik yürür (`y = heightAt`). Yön seçiminde ileride eğim/deniz/derin su kontrolü (`CreatureTerrain`); tür başına en dik eğim sınırı aşılmaz. **Takılma çözümü:** hareket eden durumdayken `stuckSeconds` boyunca yer değiştirmediyse yeni hedef/yön seç. Ağaçların collider'ı yok; canlılar da içlerinden geçer (oyuncuyla aynı kural, bilinçli).
- `CreatureTerrain` (A tanımlar, `RegionWorld` sağlar): `heightAt`, `slopeDegAt`, `elevationAt`, `coverAt`, `isSea`, `waterNear`, `bounds`. `GameWorld`'e **isteğe bağlı** `creatureTerrain?` eklenir; `RegionWorld`'de tek düzenleyen A'dır.
- Güncelleme maliyeti: yakın canlılar her adımda, `lodNearRadius`'tan uzaklar daha seyrek (AI LOD); toplam güncelleme bütçesi sınırlı.
- `damage()` (sağlık düşer, `hitFlash`, geri tepme, AI'ı `flee`/`chase`'e iter, ölünce `creature:died` + leş), `removeCarcass()`, leş süresi (`carcassSeconds`, gerçek sn; sonra yok olur); `views()`, `near()`, `stats`.
- `Game.creatureContext()`: iskelede kurulu; ihtiyaç olursa A genişletir.
- Olaylar §3.4'e göre.

**5.5 Ölçüm ve ayar.** Kanıtlar PR açıklamasında: takılmama/zemine oturma simülasyonu (aşağıda), CPU süresi, yoğunluk ayarı, ROADMAP satırları.

### A.2 Kabul ölçütleri (testle kanıtlanacaklar)
- **AI geçişleri:** durum makinesindeki her geçiş için en az bir test (algı koşulu sağlanınca/bozulunca); saldırı bir kez vurur; ateş yakınında yırtıcı yaklaşmaz; ölü canlı durum değiştirmez; aynı girdi+seed → aynı sonuç.
- **Doğma:** determinizm (`(seed, cx, cy, epoch)` → bit bit aynı); dikiş (çift/kayıp yok); gerçek bölgede her aday kendi türünün arazi örtüsü/rakım/eğim/su kuralına uyar; deniz/kıyı/kar/yerleşim içinde doğma yok; zaman penceresi (gündüz kurt yok/az, gece var); `maxActive` aşılmaz; minimum doğma uzaklığı.
- **Araziye takılmama (ROADMAP kriteri 1):** gerçek bölgede her tür için N canlı × M sanal dakika (60 Hz, headless): hiç canlı zeminin altında/üstünde değil (`|y − heightAt|` ≤ ε), hiçbiri denizde/tür eğim sınırı üstünde değil, hareket eden durumda `stuckSeconds`'tan uzun süre yerinde kalan yok.
- **Olaylar:** `damage()` → ölüm → `creature:died` bir kez; `removeCarcass` yalnızca leşi kaldırır; `creature:attacked` yük doğru.
- **Performans (ROADMAP kriteri 2, A payı):** gerçek arazide `maxActive` canlıyla tek `update` adımı gevşek üst sınırın altında (örn. < 2 ms, CI gürültüsüne cömert); bellek sızıntısı yok (canlı girip çıkınca durum haritası büyümez).
- `lint`, `typecheck`, `test`, `build`, `format:check` hatasız; **yeni bağımlılık yok**.

### A.3 Kapsam dışı
Çizim/model/animasyon (B), oyuncu saldırısı/hasar/yük (B), ses, collider, sürü-formasyon ince ayarı, yavru/üreme, kayıt (Faz 6), yeni veri indirme.

---

## 5. Hesap B — Beden ve oyuncu (5.6–5.11)

**Amaç:** Oyuncunun canlılarla etkileşimi: onları görür, onlardan zarar görür/zarar verir, avlayıp kesip pişirip yer. A henüz birleşmediyse B, `CreatureSystem` arayüzünü taklit eden bir **test çifti** (`tests/helpers/fakeCreatures.ts`) ve geliştirme demosu ile çalışır.

### B.1 Adımlar (her biri bir commit; sıra önerilir)

**5.6 Hasar ve savunma (saf).** `SurvivalSystem.applyDamage(amount, cause, source?)` (ölüyse no-op; savunma sonrası sağlık düşer; `player:damaged`); `DeathCause`'a `'mauled'` (ölüm ekranı metni "Hayvan saldırısı"); savunma: `COMBAT.defense` (giysi/zırh yüzde azaltma, en çok %), hasar sonrası kısa dokunulmazlık (`iframeSeconds`: ayı iki kare üst üste vuramasın). `creature:attacked` dinleyicisi (`combat/`): savunmayı uygular ve `applyDamage` çağırır. Vitals testleri korunur; ölüm nedeni önceliği (hasar sonucu ölüm) test edilir.

**5.7 Oyuncu saldırısı.** `combat/`: silah tablosu (`COMBAT.weapons`: yumruk, `stone_axe`, `stone_spear`: hasar, menzil, bekleme, enerji maliyeti), `resolveMelee(view, creatures, weapon) → hit|miss` (saf: `CreatureView.radius/height` ile yatay koni + menzil, dikey tolerans — `INTERACT` yamaç mantığı gibi gevşek), bekleme ve enerji düşümü (`survival.state.energy`; tükenmişken saldırı yok), `CombatSystem.attack()` → `creatures.damage(...)` → `player:attacked`. Giriş: sol tık artık yerleştirme **yokken** saldırıdır (`placement.aiming` ise onay). `Input`/`inputMapping` eki B'dedir. Ölüyken/envanter açıkken/duraklatılmışken saldırı yok.

**5.8 Eşya, tarif, yük (saf).** `items/itemDefs.ts` yer tutucu değerlerini ayarla (çiğ et: tokluk +8, `health` −6 → risk; pişmiş et: tokluk +30, `health` +4; `hide`, `bone`: malzeme; `stone_spear`: alet; `hide_vest`: savunma giysisi, `COMBAT.defense` bunu okur); `recipes.ts`: `stone_spear` (dal+taş+kav), `hide_vest` (deri+kav; balta gerekir). `LOOT` tablosu (`CreatureKind → ItemStack[]`, §3.5) `combat/loot.ts`; giyilebilir eşya (`hide_vest`) için "kuşan" mantığı **bu fazda envanterde bulunması yeterlidir** (otomatik savunma); ayrı ekipman slotu Fikir Havuzu'ndadır. Testler: tablo bütünlüğü, tarifler, yük ↔ `ITEM_IDS`.

**5.9 Leş kesme ve pişirme.** `combat/carcass.ts` (`CarcassButcher`, `FireTender` ve `GatherSystem` ile aynı kalıp): oyuncuya `INTERACT.reach` içindeki **ölü** `CreatureView`'e bakarken `E` basılı tutulur, `LOOT.butcherSeconds` (balta ile kısa) sonra yük atomik envantere eklenir (yer yoksa kısmi kalır ve ipucu), `creatures.removeCarcass(id)`, `carcass:butchered`. `combat/cooking.ts` (`CookingSystem`): yanık ateşin `FIRE.refuelReach` içinde `raw_meat` varken `E` basılı tutulur → `COOKING.seconds` sonra bir çiğ et → `cooked_meat` (`item:cooked`). **`E` öncelik sırası (Game.update):** toplama > leş kesme > **pişirme** > ateşe yakıt > su içme. Çiğ et + dal/kütük aynı anda varsa ateşe yakıt yerine pişirme öncelikli (yakıt `F`-benzeri ikinci bir tuşa alınmaz; oyuncu eti pişirince sıradaki `E` yakıtı atar); bu kuralı `promptText` açıkça gösterir. Testler: `FireTender`/`GatherSystem` testlerindeki kalıp (süre, atomik ekleme, yer yok, ateş sönünce iptal).

**5.10 Canlı görseli.** `world/CreatureLayer.ts` + `creatureGeometry.ts` (iskeletteki kutu yer tutucuyu değiştirir; `Game` zaten `world.scene`'e ekliyor):
- `CreatureView[]` tüketir (hiçbir sim mantığı yok); aynı arayüzle dev demosu (ör. `?creatures=demo`/dev tuşu: her türden birkaçı oyuncu çevresinde daire çizerek yürür) — A'yı beklemeden görsel doğrulama.
- **Draw call bütçesi için parçalı instanced iskelet önerilir:** her tür için parça başına bir `InstancedMesh` (gövde, baş, ön/arka bacak çiftleri, kuyruk…); parça matrisleri CPU'da yalnızca **etkin** canlılar için (≤ `maxActive`) her karede hesaplanır. Böylece draw call ≈ tür × parça (≈ 16), canlı sayısından bağımsızdır. Yürüme (`speed`'den bacak salınımı), koşma, saldırı hamlesi (`attackPhase`), ölü (yan yatık pose), vurulma parlaması (`hitFlash`: instance rengi), ölçek (gerçek boyut: ayı ≈ 1,2 m omuz, kurt ≈ 0,8 m, karaca ≈ 0,8 m, domuz ≈ 0,9 m).
- Doku yok; vertex rengi (bölgeye uygun: boz ayı, gri-kahve kurt, koyu domuz, kızıl-kahve karaca); düşük poligon; sis/ışık çalışır.
- Kaynak temizliği: geometry/materyal `dispose()`; `Game.dispose()` bağlı.

**5.11 Arayüz.** `ui/`: hasar tepkisi (kısa kırmızı vinyet; yön göstergesi opsiyonel), vuruş işareti (`creature:damaged`), ipuçları (`promptText` kalıbıyla: "E (basılı tut): Kes", "E: Pişir", "Sol tık: Saldır", "Tehlike: kurt" — `creature:noticed`), HUD'da savunma göstergesi (küçük), ölüm ekranı nedeni, menüdeki kontrol ipuçları (saldırı tuşu), README kontroller. Testler: saf biçimlendirme fonksiyonları (`hudFormat`/`promptText` kalıbı).

### B.2 Kabul ölçütleri (testle kanıtlanacaklar)
- **Hasar:** savunma yüzdesi doğru uygulanır; dokunulmazlık süresince tekrar hasar yok; ölü oyuncu hasar almaz; can 0 → `player:died` nedeni `mauled`; `player:damaged` doğru yükle bir kez.
- **Saldırı:** koni/menzil/dikey tolerans sınırları (kenar değerleri); bekleme; enerji düşümü ve tükenmişken saldırı yok; ölü canlıya saldırı isabet etmez; yerleştirme hayaleti varken sol tık saldırı değil onay.
- **Av zinciri (sahte canlı sistemiyle):** vur → öl → `creature:died` → kes → envantere yük → pişir → ye (tokluk/sağlık etkisi) uçtan uca test.
- **Kesme/pişirme:** süre, atomik ekleme, yer yok, ateş sönünce iptal, `E` öncelik sırası.
- **Görsel:** geometri köşe/üçgen bütçesi; `dispose` sonrası tüm kaynaklar temizlenmiş; draw call tür×parça üst sınırını aşmaz; aynı `CreatureView[]` → aynı örnek tamponu (saf kısım).
- **Headless ölçüm (PR açıklaması):** demo ile `maxActive` canlı çizilirken **≤ +20 draw call, ≤ +60 bin üçgen**; tür başına ekran görüntüsü (yakın/uzak, yürüyüş/ölü).
- `lint`, `typecheck`, `test`, `build`, `format:check` hatasız; **yeni bağımlılık yok**.

### B.3 Kapsam dışı
Hayvan AI/doğma/hareket (A), ses, yeni veri, ayrı ekipman slotu/envanter sürükle-bırak zırh, silah bozulması, kanama/kırık, su kabı doldurma/içme ve kaynatma, tuzak/olta, kayıt (Faz 6).

---

## 6. Senkron noktaları

| Nokta | Ne zaman | Ne yapılır |
|---|---|---|
| **S0** | başta | 5.0 iskelesi `main`'e girer; A ve B buradan açılır |
| **S1** | A 5.2 ve B 5.6–5.7 bitince | İki hesap, sayıları (§3.5) ve olay yüklerini karşılıklı gözden geçirir; sapma varsa belge güncellenir |
| **S2** | biri `main`'e girince | Diğeri `main`'i birleştirir; iki `events.ts`/`config.ts` bölümü ve `Game.ts` el ile kontrol edilir |
| **S3** | ikisi de `main`'de | 5.12 |

## 7. 5.12 ve 5.13 (iki görev bittikten sonra; bu iki oturumun işi değil)

**5.12 Birleştirme ve denge**
- Gerçek canlılar + gerçek görsel + gerçek saldırı: "avla → kes → pişir → ye" zinciri oyunda denenir; denge: hasar/can/hız sayıları, çiğ et riski, ateşin caydırıcılığı, doğma yoğunluğu.
- **Birleşik performans ölçümü** (Faz 4 sonrası taban ölçüm **hiç alınmadı**: önce canlılar kapalıyken taban, sonra açıkken `maxActive` ile en kötü durum). Bütçe: taban + ≤ 20 draw call, ≤ 60 bin üçgen; ROADMAP kriteri 2'yi kapatır. Sorun olursa ilk hamle `CREATURES.maxActive`/`simRadius`.
- Tam akış e2e testi (headless): gerçek bölge, gerçek `CreatureSystem`, `CombatSystem`; hayvan saldırısıyla ölüm, av, pişirme.

**5.13 Kapanış:** ROADMAP (kabul kriterleri), `CLAUDE.md` "Mevcut Durum" + klasör yapısı (`combat/`), README kontrolleri ve hayvan ekolojisinin yaklaşık olduğu notu.

## 8. Riskler ve açık kararlar

- **`Game.ts` çakışması** en büyük risk; iskele + "ana düzenleyen B" + `creatureContext()` ile sınırlandı. A, `Game.ts`'te başka bir şeye ihtiyaç duyarsa B'ye/kullanıcıya bildirir.
- **Sol tık anlamı değişiyor** (yerleştirme onayı/saldırı). Faz 4 ipuçları ("Sol tık: kur") korunur; saldırı yalnızca hayalet yokken.
- **`E` tuşu aşırı yüklü** (toplama, kesme, pişirme, yakıt, su). Öncelik sırası 5.9'da sabit; denge elle doğrulanır (gerekirse ikinci tuş 5.12'de).
- **Ağaç/kayaların collider'ı yok** → hayvan ve oyuncu içlerinden geçer. Bilinçli; görsel olarak sorun olursa Faz 5 sonrası.
- **Hayvan ekolojisi yaklaşık**; "gerçek dağılım" iddiası yok.
- **Kayıt (Faz 6):** öldürülen/yenilenen canlı durumu kayda girecek. `CreatureSystem` bu yüzden "öldürülenler" bilgisini tek bir serileştirilebilir yapıda tutar (A; sürümlü kayıt formatı Faz 6'da).
- **Yük dengesi:** 5.10 (görsel) en büyük tek iş; B yetişemezse sıra: 5.6 → 5.8 → 5.7 → 5.9 → 5.11 → 5.10 (yer tutucu kutular zaten çalışır, görsel en sona kalabilir).

## 9. Başlatma komutları (kopyala-yapıştır)

**Hesap A:** "`CLAUDE.md`'yi, `ROADMAP.md`'deki Faz 5'i ve `docs/faz-5-paralel-plan.md`'yi oku. `faz-5-0-iskele` `main`'de. Hesap A (5.1–5.5, Beyin) görevlerini §4'e göre uygula; dosya sahipliği §2.2'ye uy."

**Hesap B:** "`CLAUDE.md`'yi, `ROADMAP.md`'deki Faz 5'i ve `docs/faz-5-paralel-plan.md`'yi oku. `faz-5-0-iskele` `main`'de. Hesap B (5.6–5.11, Beden ve oyuncu) görevlerini §5'e göre uygula; dosya sahipliği §2.2'ye uy."
