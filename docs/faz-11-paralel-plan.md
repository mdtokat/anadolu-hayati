# Faz 11 — Paralel Çalışma Planı: İnşa II, Tarım, Silahlar, Eşkıya ve Drone

Bu belge Faz 11'in **birden çok oturumda aynı anda** yürütülmesi için hazırlandı (kullanıcı talimatı: "Farklı maddeleri farklı oturumlarda başlatıp paralel yürüteceğim"). Yöntem Faz 5'teki gibidir (bkz. [faz-5-paralel-plan.md](faz-5-paralel-plan.md)): önce **tek bir küçük iskele (11.0)** birleşir; sonra akışlar birbirini beklemeden, iskelede sabitlenmiş kimlikler, config blokları, olay bölümleri, kayıt alanları ve arayüzler üzerinden çalışır.

> **Kullanıma başlamadan önce:** `CLAUDE.md` ("Mevcut Durum", "Mimari Kurallar", "Çalışma Kuralları") ve `ROADMAP.md` Faz 11 bölümünü oku. Kullanıcı seni bu belgeye işaret ederek başlattıysa **plan onaylanmıştır** (CLAUDE.md "Plan, sonra kod" kuralı); plandan sapmak gerekirse uygulamadan önce kullanıcıya sor. Yalnızca kendi akışının işini yap (§2.2 dosya sahipliği).

**Kullanıcı talimatı (özet):** inşaat için farklı yapılar; çatı konan yerin üstüne bir şey konamasın; kat çıkılacaksa yan duvar bulunan kısımların üstüne tekrar taban konabilsin; merdiven ve merdivenin üstündeki tabanın merdivene göre şekil alması; belli menzilde uçurulan, yukarıdan izleme yapan drone; çit yapımı; ekme biçme; şehirlerde yankesiciler; ormanda (yankesici/eşkıya) kampları ve farklı etkinlikler; farklı silahlar, keskin nişancı tüfeği dahil; silahlar hem üretilsin hem ganimetten çıksın.

**Onaylanan kararlar (plan sunumunda varsayılan olarak kabul edildi):**
1. "Yan kesici" yorumu: **şehirlerde cep hırsızı yankesiciler**, **ormanda silahlı eşkıya kampları**.
2. Faz 10'un "yalnızca barışçıl insanlar" kararı **genişler**: eşkıya ayrı bir gruptur, Ayarlar'dan kapatılabilir (`Settings.bandits`, varsayılan açık); Faz 10 insanları barışçıl kalır; **camide eşkıya saldırmaz** (kutsal alan kuralının uzantısı).
3. Ateşli silahlar **demirci ocağında** hurda metal / demir külçe / barutla üretilir; **keskin nişancı tüfeği dürbün ister, dürbün yalnızca ganimetten** çıkar. Her silah hem üretilebilir hem ganimetten çıkabilir.
4. Kapsam dışı (bilinçli): silahlı/bomba atan drone, silah aşınması, araçlar, eşkıyaların yapı inşa etmesi, mevsime bağlı ekim, yeni çalışma zamanı bağımlılığı, harita genişlemesi.
5. `index.js` gzip bütçesi Faz 11 için **175 → 230 kB** yükseltilir (11.0'da, gerekçe commit mesajında: altı akışın eklediği saf mantık + geometri).

## 0. Özet

| | İş | Akış | Bağımlılık |
|---|---|---|---|
| **11.0** | **İskele:** tüm yeni eşya/yapı kimlikleri, eşya tanımları, yer tutucu simgeler, ganimet satırları, config blokları, olay bölümleri, kayıt v5 alanları, ayar, tuş atamaları, ortak arayüzler (`HitTarget`, `fireShot`, `ObstacleQuery`, görüş odağı), boş `Game` kancaları, bütçe | **önce, tek oturum** | — |
| **11.1** | Modüler inşa II: çatı en üstte, üst kat tabanı, merdiven + şekil alan taban, giriş basamağı, direk, korkuluk, yarım duvar, beşik çatı + alın duvarı | **A** | 11.0 |
| **11.2 + 11.3** | Tek parça yapılar (demirci ocağı, taş fırın, el değirmeni, kurutma rafı, döşek, güneş paneli) + çit (ahşap, taş, çit kapısı) + canlı/eşkıya engel sorgusu | **B** | 11.0 |
| **11.4** | Ekme biçme: çapa, tarla, tohum, sulama, büyüme, orak, değirmen/fırın zinciri, domuz baskını | **C** | 11.0 (fırın/değirmen istasyonu B'de çizilir; C kimlikle çalışır) |
| **11.5** | Silahlar: balistik, nişan/dürbün, doldurma, ateşli/ilkel/yakın silahlar, mühimmat, atış sesi, HUD | **D** | 11.0 |
| **11.6 + 11.7** | Eşkıya kampları (orman) + yankesiciler (şehir) | **E** | 11.0 (menzilli saldırı `fireShot` sözleşmesiyle; D birleşince gerçek balistiğe geçer, kod değişmeden) |
| **11.8** | Drone: üretim, uçuş, kamera, menzil, pil, işaretleme, güneş paneli şarjı, düşürülme | **F** | 11.0 (güneş paneli yapısı B'de çizilir; F şarjı kimlikle okur) |
| **11.9** | Kapanış: birleşik ölçüm (draw call, açılış, bütçe), `CLAUDE.md` "Mevcut Durum", README, elle doğrulama kılavuzu bölüm 17, ROADMAP | **son oturum** | hepsi |

Akışlar A–F aynı anda yürüyebilir. Her akış kendi branch'inde/PR'ında çalışır; main'e birleşme sırası serbesttir (§2.4).

## 1. Başlangıç noktası

- `main` = Faz 0–10 + 10.10–10.13 (yol ağı omurgası dahil). Açık elle doğrulama maddeleri beklenmeden başlanır.
- Hazır dayanaklar: modüler parçalar (`placement/pieces.ts`: `PieceIndex`, `resolvePiece`, yuva modeli, `STOREY`), `pieceShelter.ts`, `structureShapes.ts` (`solidBoxes`, `PIECE_SHAPE`), `structureGeometry.ts`, `world/StructureColliders.ts`, `StructureSet` (`version`, `toggleDoor`, `storageOf`), istasyonlar (`placement/stations.ts`, `recipes.ts` `STATION_KINDS`), savaş (`combat/melee.ts` `activeWeapon`, `COMBAT.weapons`, `SurvivalSystem.applyDamage`), canlılar (`creatures/`: kinematik hareket, `CreatureContext.player.sanctuary`), insanlar (`people/`: `PeopleSystem`, `dialog.ts`, `ui/DialogPanel`), ganimet (`settlements/loot.ts` `BUILDING_LOOT`, `settlements/search.ts`), kısayol (`items/hotbar.ts`), kayıt v4 (`save/saveGame.ts` `MIGRATIONS`), ayarlar (`settings/settings.ts`), kamera (`player/PlayerCamera.ts`), ses (`audio/`), test modu.
- **Yeni veri indirilmez**, `tools/` ve dünya verisi değişmez.

## 2. Paralel çalışma kuralları

### 2.1 Branch ve PR
- 11.0 → `main` birleşmeden **A–F başlamaz** (kimlikler ve kancalar ona bağlı). Bekleyen oturum yalnızca bu belgeyi ve ilgili kodu okur.
- Her akış güncel `main`'den kendi branch'ini açar (oturum bir branch dayatıyorsa o kullanılır). Her akış = bir PR. Conventional Commits; bir alt adım = bir commit.
- Her PR'dan önce `npm run check` hatasız (format:check, lint, typecheck, test, build, build:check).
- Birleşmeden önce güncel `main` branch'e **merge** edilir (başkasının dalında rebase/force-push yok); çakışma §2.3 kurallarıyla çözülür, iki tarafın eklemeleri de tutulur.

### 2.2 Dosya sahipliği

| Alan | Sahibi | Diğerleri |
|---|---|---|
| `src/placement/pieces.ts`, `pieceShelter.ts`, `structureFocus.ts` | **A** | dokunma (B'nin taban üstü kurulum kuralı mevcut `floorTopAt` ile çalışır) |
| `src/placement/structureShapes.ts`, `world/structureGeometry.ts`, `world/StructureColliders.ts` | A ve B **yalnızca kendi bölüm başlıkları altında** (11.0 açar: `// ── 11.1 (A) ──`, `// ── 11.2/11.3 (B) ──`) | dokunma |
| `src/placement/stations.ts`, `placeRules.ts`, yeni `placement/fences.ts`, `placement/beds.ts` | **B** | dokunma |
| Yeni `src/placement/obstacles.ts` (engel sorgusu, `ObstacleQuery` uygulaması) | **B** | C/E/F yalnızca arayüzü çağırır |
| `src/creatures/**` | **B** yalnızca hareketteki engel denetimi; **C** yalnızca `ai.ts`/`species.ts`'te tarla baskını hedefi | iki akış aynı fonksiyonu değiştirmez; çakışırsa ikisi de tutulur |
| Yeni `src/farming/**`, `world/CropLayer.ts` | **C** | dokunma |
| `src/combat/**` (yeni `ballistics.ts`, `ranged.ts`, `ammo.ts`), `items/equipment.ts`, `player/PlayerCamera.ts` (FOV/dürbün), `audio/` atış sesi, `ui/` nişangâh + mermi sayacı | **D** | `combat/targets.ts` ve `fireShot` imzası 11.0'da sabittir; E yalnızca çağırır |
| Yeni `src/bandits/**`, `world/BanditLayer.ts`, `world/campGeometry.ts` | **E** | dokunma |
| `src/people/**` | **E** yalnızca yolcu uyarı satırı ("ormanda eşkıya var") | dokunma |
| Yeni `src/drone/**`, `world/DroneLayer.ts`, `world/ChunkManager.ts` + `PropLayer.ts` görüş odağı | **F** | dokunma |
| `src/settlements/loot.ts` | 11.0 tüm yeni satırları ekler; akışlar **yalnızca kendi eşyalarının** oranlarını ayarlar | — |
| `src/items/itemDefs.ts`, `recipes.ts`, `ui/icons.ts` | 11.0 tüm kimlikleri ve yer tutucuları ekler; akışlar **yalnızca kendi eşyalarının** satırlarını/tariflerini/simgelerini değiştirir | yeni kimlik gerekirse ilgili listenin **kendi akış başlığının altına** eklenir |
| `src/config.ts` | her akış yalnızca 11.0'ın açtığı **kendi bloğu** (§3.3) | — |
| `src/core/events.ts` | her akış yalnızca kendi bölüm başlığının altı | — |
| `src/core/Game.ts` | her akış yalnızca kendi `setupX()` / `updateX(dt)` yöntemlerinin gövdesi (11.0 boş kancaları ve çağrı yerlerini açar); başka satıra dokunmak gerekirse küçük ve kendi başlıklı bir değişiklik | — |
| `src/core/Input.ts`, `inputMapping.ts` | 11.0 tüm yeni eylemleri ekler; D (nişan/doldurma), F (drone) yalnızca kendi eylemlerinin davranışı | — |
| `src/save/**` | 11.0 v5 şemasını ve göçünü yazar; akışlar yalnızca kendi alanlarını dolduran `toSave/loadSave`'i yazar | şema değişikliği §2.4 |
| `src/ui/GameMenu.ts` `CONTROL_GROUPS`, `hints/hints.ts` | her akış yalnızca kendi satırları (sona ekler) | — |
| `tests/` | her akış kendi dosyaları (`pieces2*`, `stairs*`; `fence*`, `stations2*`; `farm*`, `crop*`; `ballistic*`, `ranged*`, `weapon*`; `bandit*`, `pickpocket*`; `drone*`) | ortak test dosyalarına yalnızca ekleme |
| `ROADMAP.md` | her akış yalnızca kendi Faz 11 satırları | — |
| `CLAUDE.md` "Mevcut Durum" | akışlar **dokunmaz**; her akış PR açıklamasına `CLAUDE.md` için önerilen paragrafı yazar; 11.9 toplar | — |
| `docs/faz-8-elle-dogrulama.md` | 11.9 bölüm 17'yi yazar; akışlar PR açıklamasında elle denenecek maddeleri listeler | — |

Bu sınırın dışına dokunman gerekirse önce kullanıcıya sor; değişikliği ayrı, küçük bir commit yap.

### 2.3 Çakışmayı önleyen mekanizmalar (iskelenin işi)
- **Liste sonuna ekleme bölümleri:** `ITEM_IDS`, `STRUCTURE_KINDS`, `RECIPE_IDS`, `STATION_KINDS` 11.0'da tüm Faz 11 kimliklerini akış başlıklı yorumlarla alır (§3.1). Kimlik listeleri yalnızca sona eklenir; sıra kayıtta kullanılmaz ama değiştirilmez.
- **Config blokları önceden açılır** (§3.3): her akış yalnızca kendi bloğunun içini doldurur.
- **Olay bölümleri:** `events.ts`'te `// ── Faz 11: A ── … // ── Faz 11: F ──` başlıkları.
- **`Game.ts` kancaları:** `setupBuilding2/updateBuilding2` (A gerekmezse boş kalır), `setupStations/updateStations` (B), `setupFarming/updateFarming` (C), `setupRanged/updateRanged` (D), `setupBandits/updateBandits` (E), `setupDrone/updateDrone` (F); çağrı yerleri 11.0'da sabit.
- **Ortak arayüzler 11.0'da yazılır ve testlenir** (§3.4); sahibi akış uygulamayı değiştirir, imzayı değiştirmez. İmza değişmesi gerekirse önce kullanıcıya sor.

### 2.4 Kayıt sürümü
- 11.0 `SAVE_FORMAT_VERSION` = **5** yapar ve `migrateV4toV5` ile tüm Faz 11 alanlarını boş değerleriyle ekler (§3.5). Akışlar bu alanları doldurur; **şema v5 içinde sabittir**.
- Bir akış v5'te öngörülmeyen bir alana ihtiyaç duyarsa: alanı **isteğe bağlı** (yoksa varsayılan) ekler ve `parseSave` hoşgörülü okur; bu, sürüm artırmaz. Zorunlu/yapısal bir değişiklik gerekiyorsa sürümü artırır ve göç ekler; aynı anda iki akış artırırsa **main'e sonra birleşen** branch, birleştirirken numarasını bir artırır ve göç zincirini düzeltir.
- Yapı kayıt sürümü 1 kalır; yapıya eklenen alanlar (çit kapısı `open`, tarla durumu değil — tarla ayrı alanda) yalnızca eklemelidir.

### 2.5 Ortam notları
- Başsız Chromium doğrulamasında fare kilidi: `CLAUDE.md` "Menüler" notu (`document.exitPointerLock()`).
- Dev araçları: her akış kendi dev tuşunu `config.ts` `DEV` bölümüne değil **kendi bloğuna** yazar; tuş çakışmasını §3.6 tablosu önler.
- Bütçe: 11.0 sınırı 230 kB yapar; bir akış tek başına 15 kB'tan fazla eklerse PR açıklamasında ölçümü yazar.

## 3. Sözleşme (11.0 koda döker)

### 3.1 Kimlikler

**Eşyalar (`ITEM_IDS` sonuna, akış başlıklarıyla):**

| Akış | Kimlikler |
|---|---|
| 11.0 ortak malzeme | `scrap_metal` (hurda metal), `iron_ingot` (demir külçe), `charcoal` (odun kömürü), `sulfur` (kükürt), `gunpowder` (barut), `electronic_parts` (elektronik parça), `battery` (pil), `propeller` (pervane), `scope` (dürbün; yalnızca ganimet) |
| A | `stairs`, `entry_step`, `pillar`, `railing`, `half_wall`, `gable_roof`, `gable_wall` (üst kat tabanı mevcut `foundation` eşyasıdır) |
| B | `forge`, `stone_oven`, `hand_mill`, `drying_rack`, `bedroll`, `solar_panel`, `wood_fence`, `stone_fence`, `fence_gate`, `dried_meat` |
| C | `hoe`, `sickle`, `wheat_seed`, `corn_seed`, `potato`, `wheat`, `corn`, `flour`, `corn_flour`, `bread`, `corn_bread`, `baked_potato` (fasulye tohumu mevcut `dry_beans`) |
| D | `club`, `iron_dagger`, `pala`, `slingshot`, `bow`, `arrow`, `shotgun`, `pistol`, `rifle`, `sniper_rifle`, `shotgun_shell`, `pistol_ammo`, `rifle_ammo` (sapan mermisi mevcut `stone`) |
| F | `drone` |

**Yapılar (`STRUCTURE_KINDS` sonuna):** A: `stairs`, `entry_step`, `pillar`, `railing`, `half_wall`, `gable_roof`, `gable_wall`; B: `forge`, `stone_oven`, `hand_mill`, `drying_rack`, `bedroll`, `solar_panel`, `wood_fence`, `stone_fence`, `fence_gate`; C: `farm_plot` (çapayla açılır, eşyası yok); F: `drone` (yere inmiş drone, `E` ile alınır).

**İstasyonlar (`STATION_KINDS` sonuna):** `forge`, `stone_oven`, `hand_mill`, `drying_rack`.

### 3.2 Eşya tanımları ve ganimet (11.0 başlangıç değerleri; sahibi akış ayarlar)
- Her eşyanın adı, kategorisi (`material | food | tool | placeable`), ağırlığı, yığını 11.0'da girilir; yiyecek etkileri C/B'de, silah sayıları D'de kesinleşir.
- `ui/icons.ts` `ITEM_ICONS`'a her yeni eşya için **yer tutucu** simge (kategori renginde basit şekil); sahibi akış gerçeğini çizer.
- `BUILDING_LOOT` başlangıç satırları: hurda metal (fabrika, maden kuyusu, dükkân, apartman), kükürt (maden), barut (köy evi nadir, hükümet konağı), elektronik parça / pil / pervane (dükkân, apartman, fabrika), tohumluk buğday/mısır/patates (köy evi, serender), av tüfeği + saçma fişeği (köy evi nadir), tabanca + mermi (apartman, konak nadir), piyade tüfeği + mermi (hükümet konağı nadir), pala (konak, kale), dürbün (hükümet konağı çok nadir, kale nadir). Eşkıya ganimeti E'nin tablosudur (`bandits/loot.ts`).

### 3.3 Config blokları (`config.ts`, 11.0 boş-ama-tipli açar)
- A: `PIECES` içine yeni alt alanlar yerine ayrı blok **`PIECES_II`** (merdiven ölçüsü/eğimi, korkuluk, direk, beşik çatı, üst kat çıkıntı sınırı).
- B: `STATIONS` içine yeni istasyonların erişimi (yalnızca B), **`FENCES`**, **`BEDS`**, **`SOLAR`**.
- C: **`FARMING`** (tarla ölçüsü, uygun örtü/eğim, ekin süreleri, sulama, kuruma, verim, domuz baskını).
- D: `COMBAT.weapons`'a yeni yakın silahlar (yalnızca D) + **`RANGED`** (silah başına mermi hızı, düşüş, saçılma, şarjör, doldurma süresi, menzil, dürbün FOV, nefes tutma), **`AMMO`**.
- E: **`BANDITS`** (kamp sayısı/yerleşimi, kamp boyu, etkinlik saatleri, algı, silah dağılımı, teslim olma, yeniden dolma süresi), **`PICKPOCKETS`**.
- F: **`DRONE`** (hız, menzil, en yüksek irtifa, pil süresi, şarj hızı, işaret sayısı, düşürülme olasılığı).

### 3.4 Ortak arayüzler
- **`combat/targets.ts`:** `HitTarget { id: string; kind: 'creature' | 'bandit' | 'drone'; x; y; z; radius; height; }` ve `TargetProvider { targetsNear(x, z, r): HitTarget[]; applyHit(id, damage, from): void }`. Canlılar 11.0'da sağlayıcı olarak bağlanır; E eşkıyaları, F drone'u ekler.
- **`combat/ranged.ts` `fireShot(origin, dir, weapon, ctx): ShotResult`** (`ShotResult { hit: HitTarget | null; point; distance; terrain: boolean }`). 11.0'da anında isabetli (hitscan) basit uygulama: arazi `heightAt` ile ışın yürütme + hedef silindirleri. D, mermi uçuşu/düşüşü/saçılma ve yapı isabetiyle değiştirir; **imza aynı kalır**. E hem oyuncuya hem hayvana bu fonksiyonla ateş eder (`origin` eşkıya); oyuncu için hedef sağlayıcısı 11.0'da `player` hedefi döner.
- **Gürültü olayı:** `noise:made { x, z, radius, source }` (atış, kırılan kapı); canlılar (11.0'da kaçış tepkisi bağlanır), eşkıyalar (E) dinler.
- **`placement/obstacles.ts` `ObstacleQuery { blocked(x0, z0, x1, z1, radius): boolean }`:** 11.0'da her zaman `false`; B oyuncu duvarları/çitleri/kapalı kapıları + yerleşim ayak izleriyle uygular. Canlılar (B bağlar), insanlar, eşkıyalar (E) ve domuz baskını (C) kullanır.
- **Görüş odağı:** `GameWorld.setViewFocus(p: {x, z} | null)` — 11.0'da yöntem var, etkisiz; F, `ChunkManager` LOD'unu ve `PropLayer` çizim merkezini odağa taşır (collider'lar oyuncuda kalır).
- **Silah durumu:** `items/weaponState.ts` `WeaponState` (silah türü başına şarjördeki mermi; `Record<WeaponId, number>`); D doldurur/boşaltır, kayda girer.

### 3.5 Kayıt v5 alanları (11.0, hepsi boş varsayılanla)
```ts
farm: { plots: Array<{ id: number; x: number; z: number; crop: CropId | null; plantedAt: number; wateredAt: number; stage: number; dead: boolean }> };       // C
weapons: { loaded: Partial<Record<WeaponId, number>> };                                                                                                    // D
bandits: { cleared: Array<{ camp: number; at: number }>; chests: Array<{ camp: number; items: ItemStack[] }>; stolen: ItemStack[] };                  // E
drone: { state: 'stowed' | 'landed'; x: number; y: number; z: number; battery: number; marks: Array<{ x: number; z: number; label: string }> };      // F
```
Zaman alanları oyun saatinin mutlak saniyesidir (`GameClock`). Çit, yeni yapılar ve merdiven `StructureSet` kaydına mevcut biçimde girer.

### 3.6 Tuşlar (11.0 `INPUT.bindings`'e ekler)

| Eylem | Tuş | Akış | Not |
|---|---|---|---|
| `aim` | Sağ tık | D | Nişan / dürbün yakınlaştırma |
| `reload` | `R` | D | Elde silah varken; yerleştirme hayaleti açıkken `R` yine döndürür (bağlam önceliği `inputMapping`) |
| `steady` | `Shift` (nişan alırken) | D | Nefes tutma; nişan dışında koşma |
| `droneView` | `Q` | F | Oyuncu ↔ drone görüşü |
| `droneHome` | `H` | F | Eve dön ve in |
| — | WASD, Space/`Z`, sol tık | F | Drone görüşündeyken drone'u yönetir, sol tık işaretler |

Dev tuşları (yalnızca dev modu): D `J` silah + mühimmat, C `Y` tohum + çapa + orak, E `U` önüne eşkıya / yakın kampa ışınla, B/A `O` (mevcut) tüm yeni yapı eşyalarını da verir, F `M` drone + pil.

## 4. 11.0 — İskele (önce, tek oturum)

Adımlar (her biri commit):
1. Kimlikler + eşya tanımları + yer tutucu simgeler + `RECIPE_IDS`/`STATION_KINDS` iskelesi (tarifler boş liste olmaz: her akışın tarifi 11.0'da **yer tutucu malzeme** ile girilir ki üretim paneli bozulmasın; sahibi akış kesinleştirir).
2. Config blokları, olay bölümleri, `INPUT.bindings` + `Input` eylemleri (davranışsız), `Settings.bandits` (hoşgörülü okuma, ayar sürümü değişmez) ve Ayarlar paneli satırı.
3. Ortak arayüzler (§3.4) + testleri; canlıların `TargetProvider`'ı; `noise:made` ile canlı kaçışı.
4. Kayıt v5 + `migrateV4toV5` + testleri (v1–v4 kayıtlar yüklenir).
5. `Game.ts` kancaları, ganimet satırları, bütçe 175 → 230 kB (`scripts/buildBudget.ts`), ROADMAP 11.0 işareti.

Kabul: `npm run check` geçer; oyun Faz 10 davranışını değiştirmez (yeni eşyalar dev tuşuyla görülür, işlevsiz yer tutucu); eski kayıtlar yüklenir.

## 5. Akışlar

### A — 11.1 Modüler inşa II
1. **Çatı en üst parçadır:** `roof` (ve beşik çatı) hücresinin üstüne hiçbir parça/yapı konamaz (duvar, taban, merdiven, ateş, sandık; `resolveWall` çatıyı plaka saymaz). Eski kayıtlardaki çatı üstü duvarlar olduğu gibi yüklenir.
2. **Üst kat tabanı:** `foundation` eşyası, bakış bir alt katın duvarlarının üst seviyesindeyse, altındaki hücre kenarlarından en az birinde duvar (ya da köşesinde direk) bulunan hücreye `y = duvar.y + STOREY` ile oturur; komşu üst tabana bitişik 1 hücre çıkıntı (balkon) serbest. Üstte tabanın eteği çizilmez (geometri `y`'den değil yapının desteğinden anlar: zemine değmiyorsa eteksiz). Duvar sınıfı yalnızca **taban** plakalarına kurulur.
3. **Merdiven:** 1 × 2 hücre, bir kat (`STOREY`) çıkar, `R` 4 yön; bir taban üstüne; collider eğik rampa (cami merdiveni kalıbı) + görsel basamaklar. **Üstündeki taban merdivene göre şekil alır:** merdivenin iki hücresi üzerindeki üst kat tabanı **merdiven boşluklu** varyanta döner (delik + boşluğun çıkış dışındaki kenarlarına korkuluk; collider deliksiz kısım); taban sonradan konsa da önceden konsa da (`PieceIndex` sürümüyle yenilenir). Merdiven hücresinin üstüne çatı konamaz.
4. **Giriş basamağı** (zeminden tabana; 1 hücre, tabanın kenarına dışarıdan), **direk** (hücre köşesi; üst kat tabanını taşır), **korkuluk** (plaka kenarı; balkon/merdiven), **yarım duvar** (1,1 m; duvar yuvası).
5. **Beşik çatı + alın duvarı:** iki hücre genişliğinde eğimli çatı parçası (sırt yönü `R`), uçlarına üçgen alın duvarı; en üst parça.
6. Barınak (`pieceShelter`): beşik çatı çatı sayılır; merdiven boşluğu üst kattaki odayı açık saymaz (alt kata bağlı tek oda); yarım duvar açıklıktır. Odak (`structureFocus`) yeni parçaları seçer.

Kabul (test): çatı üstüne kurulum reddedilir; duvar üstüne üst kat tabanı kurulur, duvarsız hücreye kurulmaz; merdiven altından üste yürüme testi (Rapier) geçer; merdiven üstündeki taban boşluklu ve korkuluklu; giriş basamağıyla 1 m yüksek tabana zıplamadan çıkılır; iki katlı kapalı ev `hut` barınağı verir.

### B — 11.2 Tek parça yapılar + 11.3 Çit
1. **Demirci ocağı + örs** (istasyon): odun kömürü (kütük → ocakta), demir külçe (hurda metal + kömür), D'nin metal tariflerinin istasyonu.
2. **Taş fırın** (istasyon; C'nin ekmekleri), **el değirmeni** (istasyon; un), **kurutma rafı** (çiğ et → `dried_meat` belli sürede; bozulmaz yiyecek), **döşek** (üstünde dinlenirken barınak etkisinin üstünde enerji/can; `BEDS`), **güneş paneli** (gündüz şarj gücü üretir; F okur: `SOLAR`, `solarChargeAt(structures, x, z, sunAltitude)` saf fonksiyonu B'de).
3. **Çit:** ahşap çit, kuru taş duvar, çit kapısı (açılır/kapanır; `toggleDoor` kalıbı). 2 m ızgara kenarına oturur ama **her parça iki ucundaki zemine göre eğimlenir** (zemin izleyen); malzeme sürdükçe art arda kurulur; Rapier collider'ı.
4. **Engel sorgusu** (`ObstacleQuery`): oyuncu duvarları, çitler, kapalı kapılar (+ yerleşim ayak izleri) için 2B segment dizini; canlıların kinematik hareketi bunu sınar (bugün duvardan geçiyorlar — bilinen sınırlama kalkar), insanlar da kullanır.

Kabul (test): istasyon tarifleri yalnızca yakında çalışır; çit zemin eğimini izler; kapalı çitle çevrili alana canlı girmez, kapı açıkken girer; kurutma ve şarj süreleri doğru.

### C — 11.4 Ekme biçme
1. **Tarla açma:** çapa eldeyken sol tık (ya da `E` basılı) 2 m hücrede `farm_plot` açar: örtü çayır/tarım/çalı, eğim ≤ 20°, yol/yapı/su dışında.
2. **Ekim:** tohum eldeyken boş tarlaya sol tık; buğday 3, mısır 4, fasulye 2,5, patates 3 oyun günü (`FARMING`).
3. **Büyüme** (saf `farming/crops.ts`, oyun saatiyle): 4 evre; su kabıyla sulama (`E`), susuz tarla yarı hız, 2 gün susuz kuruma; görsel `CropLayer` (örnekli, evre başına ölçek).
4. **Biçme:** olgun ekinde `E` basılı (elle yavaş, **orak** eldeyken hızlı + fazla verim); hasattan tohum geri gelir; `E` zincirinde yeri: toplama › leş › **hasat/sulama** › pişirme › yakıt › arama › su.
5. **İşleme:** buğday → değirmen → un → taş fırın → ekmek; mısır → mısır unu → mısır ekmeği; patates ateşte közlenir.
6. **Domuz baskını:** gece olgun tarlanın 60 m yakınındaki yaban domuzu tarlaya yönelir, ekini yer (`ObstacleQuery` çitle engellenir).

Kabul (test): ekim-büyüme-hasat zinciri oyun saatiyle; kuruma; orak verimi; işleme zinciri atomik; çitli tarlaya domuz giremez (B birleşmeden önce sözleşme sahte engelle testlenir).

### D — 11.5 Silahlar
1. **Balistik** (`combat/ballistics.ts`, saf): sabit adımlı mermi (hız, yerçekimi düşüşü, saçılma, saçma tanesi); arazi `heightAt` ışın yürütme, hedef silindirleri, yapı/bina isabeti (yakında Rapier, uzakta ayak izi kutuları). `fireShot` gerçek uygulaması.
2. **Nişan ve dürbün:** sağ tık nişan (FOV daralır, hassasiyet ölçeklenir), keskin nişancıda dürbün görüntüsü + salınım, `Shift` nefes tutma (enerji); nişangâh silaha göre.
3. **Doldurma ve mühimmat:** `R`, şarjör (`WeaponState`), envanterden mermi; HUD mermi sayacı.
4. **Silahlar** (hem tarif hem ganimet): yakın — sopa (tezgâhsız), demir kama, pala (demirci); ilkel menzilli — sapan (taş atar), yay + ok (tezgâh); ateşli — av tüfeği, tabanca, piyade tüfeği (demirci: külçe + hurda + barut), **keskin nişancı tüfeği** (demirci: piyade tüfeği + **dürbün**); mühimmat demircide (barut + hurda; barut = kömür + kükürt).
5. **Ses ve gürültü:** Web Audio atış sesi (silah türüne göre), `noise:made` (canlılar kaçar, eşkıyalar duyar).
6. Denge: canlılara karşı silah başına öldürme süresi tablosu (bot testleri `tests/balanceEncounters` kalıbıyla); uzak mesafede düşüş testleri.

Kabul (test): balistik düşüş/menzil; isabet sınırları (arazinin arkasındaki hedef vurulmaz); şarjör/doldurma; tarifler ve ganimetten çıkma; atış canlıyı kaçırır.

### E — 11.6 Eşkıya kampları + 11.7 Yankesiciler
1. **Kamp yerleri** (saf, seed'li): ~15–20 kamp, orman örtüsü, yerleşimlere ≥ 400 m, yola 100–400 m, eğim uygun, yürünebilir; `campId` kalıcı.
2. **Kamp görseli** (`world/campGeometry.ts`): çadırlar, ateş (ışık havuzuna katılır), ganimet sandığı, kütük oturaklar, nöbet yeri; collider'lar.
3. **Eşkıya yapay zekâsı** (`bandits/ai.ts`, tablo güdümlü, testli): ateş başında oturma, gece uyuma (sessiz baskın fırsatı), nöbet, devriye, avlanma (karaca vurur), odun toplama, **yol pususu** (yol kenarında saklanır, oyuncu yaklaşınca saldırır); savaşta yakın/menzilli (`fireShot`), siper ve geri çekilme; algı görüş hattı (arazi + yapı) + `noise:made`.
4. **Teslim olma:** ağır yaralı eşkıya "Aman ağam, canımı bağışla" der (`DialogPanel`): bırakılırsa silahını atıp kaçar; öldürülürse üstü aranır (`bandits/loot.ts`). Reis keskin nişancı/av tüfeği taşır.
5. **Kamp temizleme:** temizlenen kamp kayda girer; `BANDITS.reoccupyDays` sonra yeniden dolabilir; sandık içeriği kayıtlı.
6. **Yankesiciler** (şehir, `PICKPOCKETS`): il/ilçe merkezlerinde nadir; selam verip yaklaşır ("Biri çok yaklaştı" ipucu), envanterden bir eşya çalıp kaçar; yakalanır/vurulursa eşya geri gelir; kaçarsa eşya en yakın kampın sandığına düşer.
7. Kurallar: camide saldırı yok; barışçıl insanlara dokunmazlar; Ayarlar'da kapalıysa hiç oluşmazlar; yolcular konuşmada eşkıya uyarısı yapar.

Kabul (test): kamp yerleri deterministik ve kurallara uygun; durum makinesi geçişleri; pusu tetiklenmesi; teslim olma; hırsızlık ve geri alma atomik; kapalı ayarda sıfır eşkıya; camide hasar yok.

### F — 11.8 Drone
1. **Üretim:** tezgâhta elektronik parça + pil + pervane + hurda metal.
2. **Uçuş** (`drone/flight.ts`, saf): kısayolda seçili + sol tık kalkış; WASD yatay, Space/`Z` dikey, irtifa sınırı (yerden ~120 m), arazi/yapı çarpışmasında durur; rüzgâr yok.
3. **Kamera:** drone görüşü (eğik/tepeden, tekerlekle yakınlaştırma), `Q` geçiş; oyuncunun bedeni savunmasız kalır (hasarda bildirim + otomatik geçiş seçeneği); `setViewFocus` ile LOD/nesne çizimi drone'da.
4. **Menzil ve pil:** ~300 oyun m; sınıra yaklaştıkça görüntü karlanır (HUD), aşınca kendiliğinden geri döner; pil ~4 gerçek dk, bitince düşer → `drone` yapısı olarak yerde kalır, `E` ile alınır; güneş paneli (B'nin `solarChargeAt`'i) ya da yeni pil ile şarj; test modunda pil bitmez.
5. **İşaretleme:** drone görüşünde sol tık hayvan/eşkıya/kamp/yapıyı işaretler; işaretler pusulada ve HUD'da kalır (en çok `DRONE.maxMarks`), kayda girer.
6. **Düşürülme:** eşkıyalar alçak uçan drone'u görürse ateş eder (`HitTarget` kind `drone`).

Kabul (test): menzil/pil/geri dönüş saf testleri; düşme ve geri alma; işaretlerin kaydı; görüş odağı değişince LOD merkezinin kayması (başsız ölçüm).

## 6. 11.9 — Kapanış (son oturum)
- Birleşik başsız ölçüm: en kötü draw call (Safranbolu + kamp + tarla + drone görüşü), üçgen, açılış süresi, bundle boyutu → `docs/faz-11-olcumler.md`.
- `CLAUDE.md` "Mevcut Durum" (akışların PR açıklamalarındaki önerilerden), README (kontroller, yeni özellikler), elle doğrulama kılavuzu **bölüm 17** (her akışın elle denenecek maddeleri), ROADMAP kabul kriterleri.

## 7. Riskler
- **`Game.ts` ve `config.ts` çakışmaları:** kancalar ve bloklar 11.0'da açılır; yine de birleşmede iki tarafın eklemeleri tutulur.
- **Kayıt sürümü yarışı:** §2.4.
- **Performans:** kamp + eşkıya + ekin + drone birlikte draw call ekler; her akış kendi katmanını örnekli (instanced) çizer, ışık sayısı sabit kalır (kamp ateşi mevcut 3 ışık havuzuna girer).
- **Denge:** ateşli silahlar hayatta kalmayı kolaylaştırabilir; mühimmat kıt tutulur, ganimet oranları elle doğrulanır.
- **Kültürel hassasiyet:** eşkıya diyalogları argo/küfür içermez; camide şiddet yok.

## 8. Başlatma komutları (kopyala-yapıştır)

- **11.0:** "`docs/faz-11-paralel-plan.md` §3–§4'e göre Faz 11 iskelesini (11.0) uygula; plan onaylı. Bitince PR aç."
- **A:** "`docs/faz-11-paralel-plan.md` Akış A'yı (11.1 Modüler inşa II) uygula; plan onaylı, 11.0 main'de. Yalnızca §2.2'deki A dosyalarına dokun. Bitince PR aç."
- **B:** "… Akış B'yi (11.2 tek parça yapılar + 11.3 çit + engel sorgusu) uygula …"
- **C:** "… Akış C'yi (11.4 ekme biçme) uygula …"
- **D:** "… Akış D'yi (11.5 silahlar ve balistik) uygula …"
- **E:** "… Akış E'yi (11.6 eşkıya kampları + 11.7 yankesiciler) uygula …"
- **F:** "… Akış F'yi (11.8 drone) uygula …"
- **11.9:** "`docs/faz-11-paralel-plan.md` §6'ya göre Faz 11 kapanışını yap; A–F main'de."
