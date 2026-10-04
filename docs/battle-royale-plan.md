# Battle Royale Modu — Plan (onaylandı)

> Kullanıcı talimatı: "Oyuna battle royale modu getirelim. Şu an sadece NPC'lerle oynansın. Harita kapsamı ister tüm
> harita ister il il olacak şekilde, oyuncu sayısını kullanıcı seçsin. Bunu planla, onayladığımda uygulayacağız."
>
> **Onay (kullanıcı):** "Onaylıyorum, önerilen varsayılanlarla BR.1'den başla. Tüm harita, 1 veya birden fazla il
> seçilebilsin. 1'den fazla il seçilirken birbiri ile sınır bağlantısı olacak şekilde seçilsin." §8'deki kararların hepsi
> önerilen varsayılandır; yalnız §8-6 değişti: alan tüm harita ya da **sınır komşuluğuyla bağlı** bir ya da birden çok il.
> Alt görevler (BR.1 … BR.7) sırayla, her biri ayrı commit olarak uygulanır; ilerleme §9'da.

## 1. Özet

- Ana menüye yeni giriş: **"Son Kalan (Battle Royale)"**. Hayatta kalma oyunundan ayrı, kayda girmeyen bir **maç**tır.
- Maç kurulumu (kullanıcı seçer):
  - **Alan:** *Tüm harita* (16 hedef il) ya da *bir veya birden çok il* (Zonguldak, Bartın, Karabük, Düzce, Bolu,
    Kastamonu, Çankırı, Sinop, Sakarya, Kocaeli, Bilecik, Samsun, Çorum, Amasya, Ankara, Kırıkkale). Birden çok il
    seçilirken seçim **sınır komşuluğuyla bağlı** olmalıdır: ilk ilden sonra yalnız seçime komşu iller eklenebilir,
    seçimi ikiye bölecek il çıkarılamaz. Komşuluk il çokgenlerinden türetilir (ortak sınır ≥ 5 oyun m ≈ 250 gerçek m;
    köşe teması sayılmaz).
  - **Oyuncu sayısı:** 2–100 (oyuncu dahil; geri kalanı NPC). Varsayılan: il 24, tüm harita 64.
  - **Maç süresi:** Kısa / Orta / Uzun (bölge daralma takvimini ölçekler).
  - **NPC zorluğu:** Kolay / Normal / Zor (isabet, tepki süresi, cesaret).
  - Ek seçenekler: vahşi hayvanlar (açık/kapalı), saat (sabit gündüz / gerçek akış).
- Herkes alanın içinde rastgele, birbirinden uzak noktalarda **eli boş** başlar; silah, mermi, zırh ve sağlık eşyası
  binalardaki kaplardan, ganimet sandıklarından ve ölülerin üstünden toplanır.
- **Güvenli bölge** aşamalarla daralır; dışında kalan (oyuncu ve NPC) giderek artan hasar alır. Son kalan kazanır.
- Oyuncu ölünce maç biter (yeniden doğma yok): sonuç ekranı sırayı, öldürme sayısını ve süreyi gösterir.

## 2. Mevcut koddan yararlanılanlar

| İhtiyaç | Var olan | Not |
|---|---|---|
| NPC dövüş yapay zekâsı | `bandits/ai.ts` `stepBandit` (siper, geri çekilme, yakın/uzak saldırı), `BanditSystem` (algı, görüş hattı, atış `fireShot`, `bandit:fired/swung` efektleri) | Sokak çetelerinin **rakip hedefleme** (`nearestRival`, `Member.fight`) mantığı herkesin herkese rakip olduğu duruma genellenir |
| NPC çizimi | `world/BanditLayer.ts`, `bandits/styles.ts` | Yarışmacılara ayrı görünüm çeşitleri |
| Silahlar, mermi, isabet | `combat/RangedSystem`, `combat/ranged.ts`, `TargetProvider` (`bandit:<id>`) | Değişmez |
| Ganimet paneli | `ui/LootPanel.ts`, `BanditSystem.corpseLoot/commitCorpse`, `BuildingSearch.onLoot` | Ölü yarışmacı ve bina kapları aynı panelle |
| Başlangıç noktası arama | `survival/cityStart.ts`, `RegionWorld.safePointAt/clearOfBuildings` | Alan içinde çoklu, aralıklı nokta |
| İl çokgenleri | `provinces.geojson`, `world/provinces.ts` `provinceAt`, `world/pilot.ts` `isInProvince` | Alan sınırı ve kıyı tamponu |
| Uzak arazi | `RegionHeightSource` genel bakış (her 8. örnek, hep bellekte), `LandCoverMap` | Uzaktaki NPC'ler karo yüklenmeden de hareket eder |
| Karo bekleme | `RegionWorld.isReadyAt`, "Harita yükleniyor…" akışı | Maç başlangıcında aynı yol |

## 3. Mimari

### 3.1 Yeni klasör `src/battleRoyale/` (saf mantık, Three.js'siz, Vitest'li)

| Dosya | Görev |
|---|---|
| `kinds.ts` | Sözleşme: `BrSetup` (alan, sayı, süre, zorluk, seçenekler), `BrArea`, `BrPhase`, `Contestant` görünümü, sonuç |
| `area.ts` | İl komşuluğu (`provinceAdjacency`), bağlı seçim (`isConnectedSelection`, `addableProvinces`, `canRemoveProvince`, `toggleProvince`); alan (`BrArea`): seçili illerin birleşimi 8 m'lik ızgara maskesinde (tarama satırı rasterleme, ilsiz kıyı şeridi `coastBufferM` içindeki en yakın ile), `contains`, rastgele nokta, en küçük çevreleyen daire (dış bükey zarf + Welzl) |
| `zone.ts` | Güvenli bölge takvimi: aşamalar (bekleme → daralma), her yeni dairenin merkezi bir öncekinin içinde ve **karada / alanın içinde** seçilir; `zoneAt(t)` → merkez, yarıçap, sonraki daire, aşama sayacı, saniye başı hasar. Süreler alanın yarıçapına ve "maç süresi" seçimine göre ölçeklenir |
| `spawn.ts` | Başlangıç noktaları: alan içinde N nokta, en küçük aralık (alan / N'den türetilir), deniz/su/bina/dik yamaç dışı; seed'li |
| `match.ts` | `BrMatch`: kalanlar, öldürme listesi (kill feed), sıralama, bitiş koşulu (≤ 1 kalan ya da oyuncu öldü), sonuç |
| `names.ts`, `plan.ts` | Tekrarsız yarışmacı adları; `planMatch(kurulum, tohum, dünya)` → alan + bölge planı + başlangıç noktaları + maç |
| `farSim.ts` | **Soyut (uzak) simülasyon** — §3.3 |
| `loot.ts` | BR ganimet tabloları: bina kapları, ganimet sandıkları, NPC'nin "teçhizat düzeyi"nden silah/mermi/zırh üretimi |
| `crates.ts` | Ganimet sandığı yerleri: yerleşimlerde, köylerde, kamp yerlerinde, yol kenarlarında seed'li; maç başına yeniden zarlanır |
| `brain.ts` | BR davranış katmanı: bölgeye göç, ganimete yönelme, çatışmaya girme/kaçma kararları; `stepBandit`'e hedef/ev noktası verir |

Bütün rastgelelik maç tohumundan (`seedFrom(maçTohumu, …)`) gelir; aynı tohum + aynı kurulum = aynı maç (oyuncunun
eylemleri hariç). Tohum sonuç ekranında gösterilir.

### 3.2 İki kademeli NPC simülasyonu

Tüm harita 13,3 × 6,3 km'dir ve karolar yalnız oyuncunun çevresinde yüklenir; 100 NPC'yi tam fizikle/yapay zekâyla
her yerde koşturmak ne mümkün (arazi, yapı, collider yok) ne de gerekli. Bu yüzden:

- **Yakın kademe (tam simülasyon):** oyuncuya `nearRadius` (≈ 320 m) içindeki ve karosu hazır (`isReadyAt`) NPC'ler.
  `BanditSystem`'e yeni üye türü **yarışmacı** eklenir (kamp/çete gibi; `Member.contestant`). Yarışmacılar için her
  canlı yarışmacı rakiptir (sokak çetesindeki rakip hedefleme genellenir: "taraf = kendi kimliği"); oyuncu da rakiptir.
  Cami/teslim olma/bağışlanma gibi eşkıya diyalogları yarışmacıda kapalıdır (teslim olmaz, kaçabilir). Aynı anda en
  çok `maxNearAgents` (≈ 16; çizim ve atış ışınları için bütçe) — fazlası uzak kademede kalır.
- **Uzak kademe (soyut):** konum, can, teçhizat düzeyi, mermi, öldürme sayısı ve niyet (bölgeye git / ganimet / pusu)
  tutulur. 0,5 sn'de bir adım: genel bakış arazisi üstünde yürüme hızıyla hedefe ilerler (deniz/göl geçmez), yerleşime
  yakınken teçhizat düzeyi zamanla artar, bölge dışında hasar alır. İki uzak NPC `engageRadius` içine girerse
  karşılaşma **istatistiksel** çözülür (teçhizat + can + zorluk + seed'li zar; kaybeden ölür, kazanan can kaybeder,
  ganimet kazanır). Sonuç kill feed'e düşer ("Hasan, Mehmet'i alt etti").
- **Geçiş:** uzak → yakın: oyuncu yaklaşınca soyut durum tam üyeye çevrilir (teçhizat düzeyi → silah + mermi + zırh,
  can aynen). Yakın → uzak: `nearRadius + margin` ötesinde tam üye soyut kayda döner (silahı → teçhizat düzeyi).
  Ölü yarışmacının cesedi yakın kademede kalır ve aranabilir; uzakta ölen soyut NPC'nin ganimeti bir ganimet çantası
  olarak yerinde kalır (oyuncu oraya gidince görünür).
- **Görünmeyerek doğma yok:** geçiş yalnız konumu korur; NPC "ışınlanmaz". Oyuncunun görüş konisinde uzaktan yakına
  geçen NPC zaten oradaydı (soyut kayıtta yürüyordu).

### 3.3 Güvenli bölge

- Aşama tablosu `config.ts` → `BATTLE_ROYALE.zone.phases`: her aşama `{ wait, shrink, radiusFactor, damagePerSec }`.
  Örnek (Orta süre, il ölçeği): 6 aşama, toplam ≈ 22 dk; tüm harita ≈ 45 dk (yürüme 4 m/s, koşu 7 m/s ile en uzak
  noktadan bölgeye yetişilebilir olacak şekilde ölçülür; testle kilitlenir).
- İlk daire: alanın çevreleyen dairesi; alanın dışı (komşu il, deniz) **her zaman** bölge dışı sayılır (il modunda
  sınırı aşan hasar alır).
- Son dairelerin merkezi karada, yürünebilir ve yapı/su içinde olmayan noktada seçilir.
- Görsel: bölge sınırı yarı saydam, aşağıdan yukarı solan bir silindir duvar (tek mesh, tek draw call; arazide
  sınırın izi `terrainOverlay`'e değil shader'a uniform olarak: merkez + yarıçap). Bölge dışındayken ekran kenarında
  mor/kızıl vinyet (var olan hasar vinyeti altyapısı).
- Hasar `SurvivalSystem.applyDamage` ile, ölüm nedeni "Güvenli bölge dışında kaldı".

### 3.4 Ganimet ve eşyalar

- **Bina kapları:** BR maçında `BuildingSearch` BR ganimet tablosunu kullanır (silah, mermi, sağlık, zırh ağırlıklı;
  yiyecek/inşa malzemesi yok). Arama süreleri BR'de kısalır (`BATTLE_ROYALE.searchScale`). "Aranmış" bilgisi maç
  boyunca tutulur, kayda girmez.
- **Ganimet sandıkları:** maç başında yerleşimlere ve yol kenarlarına dağıtılır; bölgenin içine düşenler yoğunlaştırılır.
- **Ölüler:** yakın kademede ölen yarışmacının üstü `LootPanel` ile alınır; uzakta ölenin ganimeti çanta olarak kalır.
- **Yeni eşyalar** (`ITEM_IDS` sonuna; simge `ui/icons.ts`, değer `economy/prices.ts`, elde model gerekmez):
  `bandage` (Sargı Bezi: 3 sn'de +15 can), `first_aid_kit` (İlk Yardım Çantası: 6 sn'de +60 can), `steel_vest`
  (Çelik Yelek: %35 savunma, deri yelekle birleşmez — en iyisi geçerli). Hayatta kalma modunda da bulunabilirler
  (hastane/eczane yok; yalnız bina kaplarında nadir) — **karar §8-5**.
- Silahlar mevcut olanlardır (sapan, yay, tabanca, av tüfeği, piyade tüfeği, keskin nişancı; susturucu; yakın dövüş
  silahları). Yeni silah eklenmez.

### 3.5 Oyun içi mod ayrımı (`Game`)

- `Game.mode: 'survival' | 'battleRoyale'`. BR maçında:
  - **Kayıt kapalı:** `createSave()` null döner → otomatik kayıt ve yuvaya kayıt çalışmaz (BR durumu hayatta kalma
    kaydının üstüne yazılmasın — en önemli kural, testle kilitlenir). Maça girmeden önce açık hayatta kalma oturumu
    `auto` yuvasına yazılır (ana menüye dönüşteki gibi); maçtan çıkınca ana menü "Devam" ile oradan sürülür.
  - **Kapatılanlar:** eşkıya kampları, sokak çeteleri, yankesiciler, gezgin insanlar ve satıcılar (alışveriş, tapu),
    drone, tarım, inşa/yerleştirme (kamp ateşi dahil), dev ışınlanma tuşları (test modu dışında), ipuçları (BR'ye özgü
    3–4 ipucu hariç).
  - **Açık kalanlar:** yerleşimler, bina içleri ve kapları, yollar, hava, (seçilirse) vahşi hayvanlar, silahlar ve
    yakın dövüş, ganimet paneli, envanter/kısayol çubuğu.
  - **Hayatta kalma göstergeleri:** önerilen varsayılan: tokluk/su/vücut ısısı **donuk** (maç 20–45 dk; susuzluk ~20 dk'da
    öldürürdü), sağlık ve enerji (koşu) çalışır — **karar §8-1**.
  - Ölüm → `DeathScreen` yerine `BrResultScreen`; kazanma da aynı ekran.
- Başlatma akışı: kurulum → maç tohumu → alan/bölge/başlangıç noktaları/sandıklar hesaplanır → oyuncunun noktasında
  karolar beklenir ("Harita yükleniyor…") → geri sayım (3 sn, hareket serbest, silah kapalı) → maç.

### 3.6 Arayüz

- `ui/BrSetupPanel.ts`: alan seçimi (Tüm harita ya da il seçimi; küçük haritada il çokgenleri — tıklayarak seç/çıkar,
  yalnız seçime komşu iller tıklanabilir, seçimi bölecek il kilitli — ve aynı liste düğmeleri, genel bakış arazisinden
  gölgeli), oyuncu sayısı (kaydırıcı + sayı kutusu, 2–100), süre, zorluk, seçenekler, "Başlat". Son
  kurulum `localStorage`'da hatırlanır (ayrı anahtar; ayar sürümüne dokunmaz).
- HUD (`ui/BrHud.ts`, var olan tasarım değişkenleriyle): üst ortada pusulanın altında **kalan oyuncu**, **öldürme**,
  **bölge sayacı** ("Bölge daralıyor 1:24" / "Güvenli bölgeye 340 m"); pusulada güvenli bölge merkezinin yönü; sağ
  üstte kill feed (son 5 olay, 6 sn).
- **Harita paneli** (`M`, `ui/BrMapPanel.ts`; oyun donmaz): alan, il sınırları, şimdiki ve sonraki bölge daireleri,
  oyuncunun konumu/yönü, düşen sandıklar (yalnız görülmüşler). Tuval 2D, genel bakış verisinden bir kez boyanır.
- Duraklatma menüsü BR'de: Devam Et / Kontroller / Ayarlar / **Maçtan Çık** (iki adımlı onay). Kaydet/Yükle yok.
- `ui/BrResultScreen.ts`: "Kazandın!" ya da "#7 / 32", öldürme, hayatta kalma süresi, en çok öldüren NPC, maç tohumu;
  "Tekrar Oyna" (aynı kurulum, yeni tohum) / "Kurulum" / "Ana Menü". Oyuncu ölünce kalan maç uzak kademede hızlıca
  sonuçlandırılır (kazananın adı yazılır).
- `ui/controls.ts` `CONTROL_GROUPS`'a BR grubu (`M` harita).

### 3.7 Olaylar (`core/events.ts`, sona eklenir)

`br:started`, `br:phase` (aşama, yeni daire), `br:eliminated` (kurban, öldüren, silah, oyuncu mu), `br:ended`
(sıra, kazanan). HUD, ses ve kill feed bunları dinler; sistemler birbirini doğrudan çağırmaz.

### 3.8 Ayarlar (`config.ts` → `BATTLE_ROYALE`)

Oyuncu sayısı aralığı ve varsayılanları, `nearRadius`/`margin`/`maxNearAgents`, uzak adım aralığı, karşılaşma
yarıçapı ve olasılık ağırlıkları, aşama tablosu ve süre çarpanları (Kısa ×0,7 / Orta ×1 / Uzun ×1,4), zorluk tablosu
(isabet sapması, tepki gecikmesi, geri çekilme eşiği), ganimet tabloları ve yoğunlukları, arama süresi çarpanı,
başlangıç aralığı, bölge hasarı.

## 4. Alt görevler (her biri bir commit, her birinin sonunda `npm run check`)

| # | İş | Başlıca dosyalar |
|---|---|---|
| BR.1 | Saf çekirdek: alan, bölge takvimi, başlangıç noktaları, maç durumu + testler | `battleRoyale/{kinds,area,zone,spawn,match}.ts`, `config.ts` |
| BR.2 | Uzak kademe simülasyonu + testler (determinizm, tek kazanana yakınsama, bölge ölümleri) | `battleRoyale/farSim.ts` |
| BR.3 | Yakın kademe: `BanditSystem`'e yarışmacı üye türü, herkes-herkese rakip hedefleme, BR davranış katmanı, kademe geçişi + testler | `bandits/BanditSystem.ts`, `bandits/ai.ts` (yalnız ekleme), `battleRoyale/brain.ts` |
| BR.4 | Ganimet: BR tabloları, sandıklar, yeni eşyalar (sargı, ilk yardım, çelik yelek), bina kaplarının BR kipi | `battleRoyale/{loot,crates}.ts`, `items/itemDefs.ts`, `ui/icons.ts`, `economy/prices.ts`, `settlements/search.ts` |
| BR.5 | `Game` entegrasyonu: mod durumu, kapatılan sistemler, kayıt yalıtımı, başlatma/bitiş akışı, bölge hasarı | `core/Game.ts`, `core/events.ts`, `battleRoyale/BrSession.ts` (Game'i şişirmemek için oturum sınıfı) |
| BR.6 | Arayüz: menü girişi, kurulum paneli, HUD, harita paneli, bölge duvarı görseli, sonuç ekranı, kontroller | `ui/Br*.ts`, `ui/GameMenu.ts`, `ui/ui.css`, `world/ZoneWall.ts` |
| BR.7 | Ölçüm ve belgeler: başsız tam maç koşusu, `npm run perf` BR senaryosu, elle doğrulama kılavuzu bölüm 27, CLAUDE.md "Mevcut Durum", ROADMAP | `scripts/perfWalk.ts`, `docs/` |

## 5. Testler

- `zone`: her daire bir öncekinin içinde, merkez karada ve alanda; aşama süreleri toplamı seçilen süreye uyar; en uzak
  başlangıç noktasından koşarak bölgeye yetişilebilir (her il + tüm harita, gerçek dünya verisi).
- `spawn`: N nokta (2–100) her ilde ve tüm haritada alanın içinde, karada, yapı dışında, en küçük aralıkla; aynı tohum
  aynı noktalar.
- `farSim`: aynı tohum aynı sonuç; hiç oyuncu müdahalesi olmadan maç süresi içinde tek kazanan kalır; bölge dışındaki
  NPC ölür; öldürme listesi tutarlı (her ölümün bir nedeni var).
- Kademe geçişi: uzak → yakın → uzak dönüşünde can/teçhizat/öldürme korunur; görüş konisinde "doğma" yok.
- Yakın kademe: iki yarışmacı birbirini görünce çatışır; oyuncuya da saldırır; yarışmacı teslim olmaz.
- Kayıt yalıtımı: BR maçı sırasında `createSave()` null; `auto` yuvası maçtan önceki hayatta kalma kaydı olarak kalır.
- Ganimet: BR tablolarının hepsi geçerli eşya; ekonomi kâr döngüsü testi yeni eşyalarla geçer; yeni eşyaların
  simgesi/değeri var (derleme zaten zorlar).
- Uçtan uca (başsız, hızlandırılmış zaman): il ve tüm harita maçı açılır, oyuncu bekler; bölge onu öldürür, sonuç
  ekranı doğru sırayı gösterir.

## 6. Performans

- Yakın kademe en çok 16 yarışmacı: `BanditLayer` çizimi (örnekli) + atış ışınları; mevcut çete çatışmalarıyla aynı
  ölçekte. Uzak kademe 100 NPC × 2 adım/sn, kare zaman bütçesine (`core/FrameBudget`) bağlanır; ölçülen hedef
  < 0,3 ms/kare.
- Bölge duvarı +1 draw call. Kapatılan sistemler (eşkıya, insanlar, satıcılar) birkaç draw call geri kazandırır.
- Tüm haritada oyuncu hızla yer değiştirmez (ışınlanma yok), karo akışı mevcut bütçesinde kalır.
- Gerçek GPU'da FPS elle ölçülecek (kılavuz bölüm 27).

## 7. Kapsam dışı (şimdilik)

- Gerçek çok oyunculu (ağ) — kullanıcı "şimdilik NPC'lerle" dedi; mimari (yarışmacı = kimlik + durum) ileride ağ
  oyuncusunu aynı listeye eklemeye uygun tutulur ama ağ kodu yazılmaz.
- Takımlı mod (ikili/dörtlü), araçlar, uçaktan/paraşütle iniş, izleyici (spectate) kamerası, ikmal uçağı. Fikir
  Havuzu'na not düşülür.

## 8. Onayda netleşecek kararlar (önerilen varsayılan **kalın**)

1. **Hayatta kalma göstergeleri BR'de:** **tokluk/su/ısı donuk, sağlık+enerji çalışır** · hepsi normal · hepsi yavaş.
2. **Başlangıç:** **rastgele dağıtım** · haritadan iniş noktası seçme (ek iş; BR.6'ya eklenir).
3. **Oyuncu sayısı sınırı:** **2–100** (varsayılan il 24, harita 64).
4. **Cami:** hayatta kalma modunda camideki oyuncuya saldırılmaz. BR'de öneri: **camide silah kullanılmaz (oyuncu ve
   NPC), NPC camideki oyuncuyu hedef almaz, ama bölge dışında kalan camide de hasar alır; son iki dairenin merkezi cami
   ayak izine düşmez** · camiler BR'de sıradan yapı gibi.
5. **Yeni sağlık/zırh eşyaları:** **hem BR'de hem (nadir) hayatta kalma modunda** · yalnız BR'de.
6. **Alan seçimi:** ~~tüm harita ya da tek il~~ → **kullanıcı kararı: tüm harita ya da sınır komşuluğuyla bağlı bir veya
   birden çok il.**
7. **Mod adı:** **"Son Kalan (Battle Royale)"** · "Battle Royale" · başka bir ad.

## 9. İlerleme

- [x] **BR.1 — saf çekirdek** (`src/battleRoyale/{kinds,area,zone,spawn,match,names,plan}.ts`, `config.ts` →
  `BATTLE_ROYALE`; testler `tests/brCore` sentetik, `tests/brRegion` gerçek dünya). Ölçüm (100 kişi, tohum 5):
  - İl komşuluğu gerçek sınırlarla uyuşur (31 komşu çifti; ör. Zonguldak: Bartın, Bolu, Düzce, Karabük; Kocaeli:
    Bilecik, Sakarya). 16 il tek bağlı parçadır. Hesap 34 ms.
  - Tüm haritanın alan maskesi 120 ms (45 km² oyun alanı, ilk daire yarıçapı 6,6 km); tek il 4–25 ms.
  - Maç süresi (bölge tamamen kapanana kadar; kısa / orta / uzun): tek il ≈ 17–19 / 24–28 / 33–39 dk (Ankara en
    uzun), tüm harita ≈ 40 / 56 / 79 dk (büyük alanda süreyi sınırın en çok hızı belirler; süre çarpanı bu hızı da ölçekler).
  - 100 kişi en küçük ilde de (Bartın) aralıklı ve karada başlar.
- [x] **BR.2 — uzak kademe simülasyonu** (`battleRoyale/farSim.ts` `FarSim`, `flowField.ts`; `config.ts` →
  `BATTLE_ROYALE.far`; testler `tests/brFarSim` sentetik + akış alanı, `tests/brFarRegion` gerçek dünya).
  - NPC: konum, can, teçhizat (0–1), niyet (ganimet / bölge). Ganimet yerleri yerleşimlerdir (`lootSpotsOf`, zenginlik
    il 1 / ilçe 0,75 / köy 0,4); yerde kalırken teçhizat artar. Bölgeye yetişemeyecekse (yürüme uzaklığı / koşu hızı >
    kalan süre × 0,7), daire dışındaysa ya da seçili alanın dışındaysa bölgeye yönelir.
  - Karşılaşma: menzil 40 m + 110 m × teçhizat (tüfekli uzaktan görür), saniyede %5 olasılık (eli boşken ×0,15),
    ilk 90 sn ateşkes; kazanan güç oranıyla zarlanır (güç = (0,2 + teçhizat) · √(can/100)), %80 ölümle biter, kazanan
    yenilenin teçhizatını alır, yenilenin ganimeti yerde kalır (`drops`).
  - **Akış alanı:** ilk ölçümde tüm haritada NPC'lerin ~%45–60'ı bölgeden ölüyordu: düz çizgide dağ sırtına/kıyıya
    takılıyorlardı. Her bölge aşaması için 24 m'lik kaba yürüme ızgarasında (hücre 5 noktadan örneklenir; alan dışı
    hücre ×6 pahalı) Dijkstra akış alanı; takılan NPC yakında rastgele bir kaçış noktasına yürür. Sonuç: bölge ölümü
    çoğu senaryoda %0–2, en kötü %7.
  - Sınır hızları NPC koşusunun altına çekildi (kısa maçta ÷ 0,7 ile bile ≤ 4,6 m/sn). Bölgenin kapanma süresi
    (kısa / orta / uzun, 100 kişi): tek il ≈ 17–24 / 24–35 / 33–49 dk (büyük iller — Ankara, Bolu, Samsun, Kastamonu —
    uzun; önce 17–19 / 24–28 / 33–39), tüm harita ≈ 52 / 75 / 105 dk (önce 40 / 56 / 79).
  - Ölçüm (tohum 1–2; "yarı" = oyuncuların yarısının elendiği an, "son" = kazananın belli olduğu an):

    | Alan, kişi | Aşama sonlarında kalan | Yarı | Son / bölge kapanışı | Bölge ölümü |
    |---|---|---|---|---|
    | Tüm harita, 100 | 59/32/12/6/3/1 | 32–37 dk | 72–77 / 75–80 dk | 0–7 |
    | Tüm harita, 24 | 24/18/11/9/2/1 | 57–61 dk | 69–77 dk | 0–3 |
    | Ankara, 100 | 35–45/13–17/5–9/3 | 7–10 dk | 30–32 / 33–36 dk | 1 |
    | Zonguldak + Bartın + Karabük, 100 | 29–44/13–16/4–6 | 5–7 dk | 20 / 25–26 dk | 1–2 |
    | Zonguldak, 100 | 17–20/5–6/1–2 | 3,5–4,6 dk | 15–16 / 24 dk | 0 |
    | Zonguldak, 24 | 9–10/4/1–3 | 6,6–6,8 dk | 14–17 / 24 dk | 0 |

    Küçük ilde 100 kişi bilinçli olarak yoğun bir maçtır (yaklaşık 1,2 km²'ye 100 kişi). Maliyet: 100 NPC'de adım
    başına ≤ 0,3 ms (saniyede 2 adım); tüm haritayı baştan sona hızlı sonuçlandırma ~3 sn (BR.5'te kare bütçesine
    dilimlenecek).
  - Yan düzeltme: `vitest.config.ts` `hookTimeout` 30 sn (tam pakette 4 dosyanın `beforeAll`'u 10 sn'yi aşıyordu).
- [x] **BR.3 — yakın kademe** (`battleRoyale/nearTier.ts` `BrNearTier`; `BanditSystem` yarışmacı üye türü; `config.ts`
  → `BATTLE_ROYALE.near`; testler `tests/brNearTier` (düz dünya + `ai.ts` eklemeleri), `tests/brNearRegion` (gerçek
  arazi)).
  - `BanditSystem`: `spawnContestant`/`removeContestant`/`contestantState`/`setContestantGoal`/`setContestantWeapon`/
    `drainContestant` (bölge hasarı: saldırgansız, kimseyi aramaz)/`setContestantTruce`. Yarışmacı için **her yarışmacı
    rakiptir** (sokak çetesinin rakip hedeflemesi `isRival` ile genellendi), atışı yalnız kendini vurmaz, nişan hatası
    zorlukla çarpılır (kolay ×1,7, normal ×1, zor ×0,65), teslim olmaz (`BanditBrain.noSurrender`). Kimlik
    `CONTESTANT_ID_BASE` (2⁴¹) + maç kimliği.
  - `ai.ts` (yalnız ekleme): sakin etkinlik `travel` (`BANDIT_ACTIVITIES` sonuna; `home`'a `travelSpeed` hızla gider),
    `noSurrender`. `HitSource.attacker` ve `bandit:damaged` `by`/`attacker`/`weapon`: öldüren bulunur.
  - Kademe geçişi: oyuncuya 320 m içindeki, karosu hazır uzak NPC'ler (yakından uzağa, en çok 16) yarışmacıya
    dönüşür (teçhizat → silah, can aynen); 380 m (çatışıyorsa 500 m) ötesinde soyut kayda döner (teçhizat silahın
    altına inmez). Sakin yarışmacının hedefini uzak simülasyonla aynı kurallar verir (`FarSim.guide`: ganimet yeri,
    bölge, akış alanı); ganimet yerinde bekleyenin silahı yükselir; 3 sn'de 0,8 m ilerleyemeyen kaçış noktası seçer
    (`FarSim.nudge`). Uzak kademenin 90 sn'lik ateşkesi yakında da geçerlidir. Ceset 420 m'ye kadar kalır.
  - Ölçüm (Zonguldak, 40 kişi, oyuncu il merkezinde dinleniyor, 5 dk): 17 NPC yakına geçti, aynı anda en çok 13,
    17 elenme (4'ü yakında çatışmada), oyuncuya 139 isabet; üç sistem birlikte adım başına ~0,05 ms.
- [x] **BR.4 — ganimet ve yeni eşyalar** (`battleRoyale/loot.ts`, `items/medical.ts`; `config.ts` →
  `BATTLE_ROYALE.loot`, `MEDICAL`, `COMBAT.defense/vests`; testler `tests/brLoot`).
  - Yeni eşyalar (`ITEM_IDS` sonuna; ad, ağırlık, simge, değer, elde model): **Sargı Bezi** (`bandage`; 3 sn, +15 can,
    ancak 75'e kadar), **İlk Yardım Çantası** (`first_aid_kit`; 6 sn, +60 can, 100'e kadar), **Çelik Yelek**
    (`steel_vest`; %35 savunma). Yelekler toplanmaz (deri + çelik = çelik), diğer giysiler eklenir. Sağlık eşyası
    kısayolda "kullan" (`consume`) türüdür; süreli kullanım `MedicalUse` (başlat, ilerlet, bitince bir tane harcanır;
    yarıda kalan harcamaz) — oyuna bağlanması BR.5'te. Hayatta kalma modunda bina tablolarının **sonuna** nadir satırlar
    eklendi (sargı %8–12, ilk yardım %3–6, çelik yelek yalnız hükümet konağında %1,5; önceki satırların zarları
    değişmedi). `itemDefs` testinde "alet yığını 1" kuralına sağlık eşyaları istisna eklendi (tüketilir, yığınlanır).
  - Maç ganimeti `rollBrLoot` (maç tohumu + kalıcı anahtar; deterministik): kapta %40 silah (sopa, kama, pala, sapan,
    yay, tabanca, av tüfeği, piyade tüfeği, nadir keskin nişancı; menzilli silah mühimmatıyla), %35 ek mühimmat, sargı
    %35, ilk yardım %8, deri/çelik yelek %6/%3,5, çantalar, susturucu; yapı türü çarpanı (hükümet konağı ×1,6 …
    serender ×0,5), yıkık ×0,6. `BuildingSearch.lootSource`/`secondsScale` takılabilir: maçta bina kapları bu tabloyu
    zarlar, arama yarı sürede biter.
  - Ganimet sandıkları `planCrates` (her 30 000 oyun m²'ye bir; %60'ı yerleşimlerin yakınında, zenginliğe göre; en az
    18 m arayla): silah kesin, olasılıklar ×1,8. Ölü yarışmacının üstü `contestantLoot` (silahı, teçhizatla artan
    mühimmat, sağlık, yelek; `BanditSystem.setContestantLoot`), uzakta ölenin çantası `dropLoot`. Yerdeki ganimetler
    `BrPickups` (sandık + çanta; içerik ilk açılışta zarlanır, boşalan kalkar).
- [x] **BR.5 — `Game` entegrasyonu** (`battleRoyale/BrSession.ts`, `core/Game.ts`; testler `tests/brSession`).
  - `BrSession` (Three.js'siz): maç planı, uzak/yakın kademe, sandıklar ve çantalar (`BrPickups`), bölge hasarı,
    öldürme kayıtları, aşama bildirimleri, bitiş; olaylar `br:started`, `br:phase`, `br:eliminated`, `br:ended`.
    Oyuncuya son 15 sn içinde isabet eden yarışmacı ölümüne yazılır (`notePlayerHit`; hedef sağlayıcısı `from`'u
    iletir). Oyuncu ölünce yakındakiler uzak kademeye döner ve maç kare başına 30 maç-saniyelik dilimlerle hızla
    sonuçlanır (`finishStep`); oyuncu tek kalırsa kazanır. Akış alanları maç başında önceden kurulur (`FarSim.prepare`).
  - `Game.startBattleRoyale(setup, seed?)`: hayatta kalma durumu bellekte saklanır ve otomatik kayda yazılır, maç
    planlanır, oyuncu eli boş başlangıç noktasına konur (yeni oyunla aynı yükleme yolu). **Maç kayda girmez:**
    `createSave()` maçta null (otomatik kayıt ve yuvaya kayıt çalışmaz). `exitBattleRoyale()` maçtan önceki durumu
    geri yükler; maç sırasında yuva yüklemek ya da yeni oyun da önce maçtan çıkar.
  - Maçta kapalı: kamp eşkıyaları, sokak çeteleri ve serbest eşkıyalar (`BanditSystem.setWildEnabled`; yarışmacılar
    eşkıya ayarından bağımsız), yankesiciler, gezgin insanlar ve satıcılar, tapu, inşa (kısayoldan da), seçilmezse
    vahşi hayvanlar. Tokluk/su/vücut ısısı donuk, sabit gündüz seçiliyse saat donuk (`SurvivalSystem.setFreeze`).
    Bölge hasarı yeni hasar kaynağıdır (`'zone'`, ölüm nedeni "Güvenli bölgenin dışında kaldın").
  - Cami: camide silah kullanılmaz (oyuncu), yarışmacılar camideki oyuncuyu algılamaz (mevcut kutsal alan kuralı), son
    iki dairenin merkezi caminin 15 m yakınına düşmez.
  - Sağlık eşyaları oyunda (her iki kipte): kısayoldan kullanılır, ilerleme halkası; hasar alınca, saldırınca ya da
    elde başka eşya seçilince yarıda kalır (bölge hasarı kesmez).
  - Plandan sapma: 3 sn'lik geri sayım yerine maç başındaki 90 sn'lik ateşkes yeterli görüldü (herkes eli boş).
  - Henüz menüden açılamaz (BR.6); oyun içi doğrulama BR.7'de başsız tarayıcıyla.
- [ ] BR.6 — arayüz
- [ ] BR.7 — ölçüm ve belgeler
