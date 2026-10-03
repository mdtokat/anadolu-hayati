# Faz 12.C — Güney grubu raporu: Ankara (kuzey şeridi), Kırıkkale

Bu belge 12.C oturumunun çıktısıdır ([faz-12-paralel-plan.md](faz-12-paralel-plan.md) §4.1, §4.4). Ölçümler **yerel dünyada** alındı:
`cekirdek` + `guney` grupları (11 hedef il), `python build_world.py` → `build_settlements.py` → `npm run bake`. Bu dünya **birleşik
Faz 12 dünyası değildir** (batı ve doğu grupları yok; yol omurgası ve yerleşim düzeni küreseldir): bulgular 12.9'da yeniden doğrulanır.
`public/data/**` bu PR'a girmez.

## 1. Kapsam kararı ve bir bulgu

Kullanıcı kararı: **Ankara'nın yalnız kuzey şeridi** (Çankırı sınırından Ankara merkezine; Kızılcahamam, Çamlıdere, Çubuk, Kalecik, Beypazarı,
Nallıhan, Ayaş, Güdül ve merkez ilçeler). Kırıkkale tam.

`tools/groups/guney.yaml` `clip_bbox: {Ankara: [30.84, 39.70, 33.89, 40.75]}` yazıldı, ama **ızgara kapsamı tek dikdörtgendir** ve Kırıkkale
39,33°K'ye indiği için türetilen sınır kutusu kırpmadan bağımsızdır (ölçüldü):

| Kapsam | Türetilen kutu (lon0, lat0, lon1, lat1) |
|---|---|
| çekirdek | 29,84 / 40,05 / 35,54 / 42,22 |
| çekirdek + Kırıkkale | 29,84 / **39,33** / 35,54 / 42,22 |
| çekirdek + Ankara (kırpmalı) + Kırıkkale | 29,84 / **39,33** / 35,54 / 42,22 (aynı) |
| çekirdek + Ankara (kırpmasız) + Kırıkkale | 29,84 / 38,60 / 35,54 / 42,22 |

Sonuç: Ankara'nın 39,33°K'nin kuzeyi dikdörtgenin içinde kalır ve haritaya girer; yalnız **güney ucu** (Şereflikoçhisar, Evren, Haymana güneyi,
Gölbaşı güneyi) dışarıda kalır. Ankara ızgara içi alanı **19 509 km²** (gerçek ≈ 25 000), yani plandaki "yalnız kuzey şeridi" fiilen "Ankara'nın
%78'i"dir; Polatlı, Haymana, Balâ da hedef ilçe olarak yerleşim alır. Gerçekten dar bir şerit istenirse iki yol var (ikisi de 12.0b/12.9 kapsamında,
bu PR'a girmez): (a) Kırıkkale'yi de kırpmak (`clip_bbox`), (b) `build_settlements.py` seçimini il çokgeni kırpmasına bağlamak. Kırpma satırı yine de
yaml'da durur (Kırıkkale çıkarılırsa kuzey şeridini garanti eder).

## 2. Yerel dünya (12.9 için)

| | Değer |
|---|---|
| `extent` | `col0 −1152, row0 −384, 4699 × 3148` (mevcut 4699 × 2346; **yalnız güneye** 802 satır uzar: batı/doğu/kuzey aynı) |
| `elevation.max` | **2600 m (değişmedi)** → eski karolar yeniden nicemlenmez |
| Karo | 70 (mevcut 50; yeni karolar ty = 4, 5; tx −3…6) |
| Eski alan farkı | örtü birebir aynı; yükseklik ≤ 2 nicem (≈ 0,08 m gerçek) yalnız 6 batı karosunda (tx −3/−2 × ty 1…3; DEM pencere etkisi, `PINNED_WINDOWS` konusu); ty = 3 satırı yalnız yeni uzayan kısımda değişir |
| Bake | 72 dosya, 35,6 MB, hazırlık 22 sn (dere yatakları + yerleşim + tüneller), toplam ~26 sn |
| `settlements.json` | 3,05 MB (mevcut 2,22 MB), `features.json` 3,36 MB ham (mevcut 2,55) / 1,23 MB gzip (sınır 3,5 MB → **%96**) |
| Yerleşim | 1 150 (11 il, 115 ilçe, 1 024 köy; mevcut 915), 50 simge yapı, ~6 713 yapı |
| Komşu iller (`inRegion=false`) | Amasya, Bilecik, Eskişehir, Kocaeli, Kütahya, Kırşehir, Nevşehir, Samsun, Tokat, Yozgat, Çorum, İstanbul |
| `qa_world.py` dikiş sürekliliği (güney) | dikiş ort 12,3 m / p99 51,3 m; iç ort 13,1 / p99 55,8 (dikiş iç dokuyla aynı: sorun yok) |
| Su | 6 706 akarsu çizgisi, 1 896 durgun su çokgeni, 78 kaynak |

Veri bütçesi (`npm run build:check`, yerel): dünya verisi toplamı **97,5 MB** (sınır 55; eski `tiles/*.bin` 53 MB + bake 35 MB: karo akışlı yayında eski
karolar inmez, dağıtımdan çıkarma 12.9'un kararı), en büyük dosya `features.json` 3,44 MB (sınır 3,58, %96), tahmini ilk yükleme **4,6 sn** (akışlı,
9 karo; sınır 10), `index.js` 257,8 kB gzip (sınır 270, %95). Bütçeyi bu oturum değiştirmedi.

## 3. Bulunan sorunlar

1. **"… Belediyesi" yinelemesi — düzeltildi, ayrı PR:** Overture'da Kırıkkale, Bahşılı, Karakeçili iç içe iki `locality` kaydıyla gelir (üstte
   "Kırıkkale Belediyesi", sınıfı `city`/`town`); `settlement_rank` ikisini de seçtiğinden aynı yer iki kez (ikincisi binasız, il rütbeli) çıkıyordu.
   Çekirdek veri etkilenmez. [PR #61](https://github.com/mdtokat/anadolu-hayati/pull/61) (`fix(settlements)`); **bu PR'ın yerel dünyası düzeltme
   uygulanarak üretildi**, #61 birleşmeden `build_settlements.py` yeniden çalıştırılırsa kopyalar geri gelir (`tests/guneySettlements` bunu denetler).
2. **`SettlementMap` kurulumu 18 sn** (`tests/settlementMap` "deterministik ve hızlı" < 10 sn testi yerel dünyada başarısız; çekirdekte ~7 sn).
   12.0a sonrası oyun bu hesabı bake'ten yükler (açılışta değil), yani oyuncuya yansımaz; ama bake 22 sn ve test sınırı 10 sn. Sınır/test 12.9'a (bütçe sahibi).
3. **Draw call:** en kötü **337** (Anıtkabir, Ankara; bütçe < 300), bkz. §6. 12.9 ölçümü birleşik dünyada tekrarlamalı; ilk hamle Ankara merkezinde
   uzak yapı gruplama/LOD ya da `SETTLEMENT_LAYOUT.maxBuildings.ilce`.
4. **Ankara il merkezinde simge yapı sıkışması:** düzen sırası ilçe → il olduğundan Ankara il merkezi yalnız 41 parsel alır (Altındağ, Çankaya, Keçiören,
   Yenimahalle, Mamak, Sincan komşu merkezler); beş simge adayından bazıları 60 m içinde parsel bulamaz. Hacı Bayram Veli Camii Altındağ'a bağlandı, Kocatepe
   ve Anıtkabir Ankara'ya; Arslanhane Camii yerleşemediği için çıkarıldı. Büyük camiler (`mosque_grand`) mahalle camisi ölçüsüne düşer (algoritma
   davranışı, kıyı kasabalarındaki gibi). Ankara metrosu toplam ~280 yapıdır (il 41 + Altındağ, Çankaya, Keçiören, Yenimahalle, Mamak, Sincan, Etimesgut ≈ 240).
5. **Kırıkkale'de bina hücresi olmayan merkez yok**, Türkeli (Sinop) çekirdekten bilinen tek istisna. Cami sığmayan merkez yok (`no_mosque_towns: []`).
6. **`provinceBaseline` / `provinceEcology` yeni illeri kapsamaz** (12.9'un testleri, sabit 5 il): grubun kendi kopyaları `tests/guneyBaseline`,
   `tests/guneyEcology` (veri yoksa atlanır).

## 4. Yerleşimler (yerel dünya)

| | Ankara | Kırıkkale |
|---|---|---|
| Yerleşim (il / ilçe / köy) | 1 / 23 / 159 (183 toplam) | 1 / 8 / 43 (52) |
| Yapı: il merkezi | 41 | 113 |
| Yapı: ilçeler (toplam) | 604 (Polatlı 52, Sincan 48, Çubuk 43, Çankaya 40, Elmadağ 37 …) | 102 (Bahşılı 20, Karakeçili 16, Keskin 15 …) |
| Yapı: köyler (toplam) | 676 | 190 |
| Cami olan yerleşim | 91 | 24 |
| Satıcı | il 4, ilçe 3 (hepsinde) | il 4, ilçe 3 |

Yol ağı (tüm yerel dünya): 2 131 çıkış çizgisi (39 125 veri çizgisinden), `unlinked` 0, 57 bileşen bağlantısı, 70 patika, 632 köy girişi, 4 303 ikiz şerit
çökertildi. `tests/overlapAudit` (köprü/yol/dere/dağ iç içe geçmesi) ve `tests/settlementMap` (yapı çakışması, akarsu, yamaç) 70 karolu dünyada **geçti**.

Stiller: Altındağ ve Beypazarı `osmanli`, Kırıkkale ve Sincan `sanayi`, kalan merkezler `kasaba`.

### Simge yapılar (8)
Konumlar Overture Places'ten; Places'te yanlış yerde olan Kocatepe Camii bilinen koordinatlarla (39,9186°K 32,8611°D) yazıldı. Hepsi yerleşti
(`tests/guneySettlements`): Ankara Kalesi, Hacı Bayram Veli Camii (Altındağ); Kocatepe Camii, Anıtkabir (Ankara); Gazi Gündüzalp Türbesi (Beypazarı);
Bünyamin Ayaşî Türbesi (Ayaş); Kalecik Kalesi (Kalecik); Kırıkkale Saat Kulesi (Kırıkkale). Kızılcahamam Soğuksu için Places'te güvenilir kayıt yoktu.

## 5. Yer adları (`src/config/places/guney.ts`)
Ankara 10 (merkez, Kızılcahamam, Çamlıdere, Çubuk, Kalecik, Akyurt, Ayaş, Güdül, Beypazarı, Nallıhan), Kırıkkale 9 (merkez, Yahşihan, Keskin Göleti,
Delice, Sulakyurt, Bahşılı, Balışeyh, Çelebi, Karakeçili). `tests/pilotPlaces` yerel dünyada **109/109** geçti (her yer kendi ilinde, karada,
yürünebilir, ≤ 60 oyun m'de tatlı su). Düzeltmeler: Keskin merkezinde 60 m içinde su yok (en yakın gölet 130 m) → "Keskin Göleti"; Karakeçili ilk
koordinatı yanlıştı (Overture: 39,5932°K 33,378°D).

`BANDITS.campCount` katkısı **10**: sınırsız kamp aramasında Ankara'da 10 uygun orman yeri bulundu (orman %10,7: Kızılcahamam–Çamlıdere–Nallıhan), Kırıkkale'de 0
(orman %0,8). Birleşik dünyada kamp seçimi yine rastgele sırayla yapılır; 12.9 toplamı doğrulamalı.

## 6. Ölçümler (başsız yazılımsal WebGL; gerçek GPU değil)

13 konum yerine 10 konum × 8 yön (45°), çizim açık, geliştirme sunucusunda, akışlı dünya (`npm run bake` çıktısı):

| Konum | En kötü draw call (yön) | Üçgen (o yönde) | Ortalama draw call | JS yığını (MB) |
|---|---:|---:|---:|---:|
| Ankara merkez (Kızılay) | 278 (0°) | 582 bin | 152 | 221 |
| Ankara Kalesi | 281 (0°) | 648 bin | 179 | 230 |
| **Anıtkabir** | **337 (0°)** | 744 bin | 184 | 237 |
| Kızılcahamam | 184 (0°) | 473 bin | 151 | 252 |
| Beypazarı | 268 (315°) | 674 bin | 133 | 256 |
| Çubuk | 244 (45°) | 777 bin | 155 | 265 |
| Kalecik | 226 (90°) | 1,00 M | 133 | 273 |
| Nallıhan | 253 (270°) | 989 bin | 136 | 271 |
| Kırıkkale merkez | 279 (45°) | 1,13 M | 138 | 267 |
| Delice | 220 (45°) | 1,06 M | 125 | 269 |

Sayfa açılışı (menüye hazır) 8,9 sn, hata yok. JS yığını ~220 → 273 MB (karo tavanı 25 karo; dünya boyutundan bağımsız beklenir). Üçgen sayısı çekirdeğe göre
yüksek (~1,1 M): açık bozkırda uzak arazi chunk'ları ve yoğun görüş mesafesi; 12.9 birleşik ölçümde bakmalı. `CHUNK.viewDistance`/LOD eşikleri ilk hamle.

## 7. Ekoloji ve denge turu (ayar yapılmadı; `tests/guneyBaseline`, `tests/guneyEcology`, 12 başlangıç × 10 dk)

| | Ankara (ızgara içi) | Kırıkkale |
|---|---|---|
| Alan / kara | 19 509 / 19 509 km² | 4 767 / 4 767 km² |
| Rakım ort / medyan / p90 / en yüksek | 1 060 / 1 039 / 1 431 / 2 067 m | 948 / 944 / 1 177 / 1 736 m |
| Rakım payı ≥ 1000 m | %56,8 | %38,1 |
| Eğim ≤ 30° / ≤ 45° / ≤ 60° | %81,3 / %96,1 / %99,8 | %92,8 / %99,5 / %100 |
| Örtü: orman / çalı / tarım / çıplak / kent | %10,7 / %35,7 / %33,1 / %15,9 / %4,1 | %0,8 / %39,9 / %49,7 / %7,9 / %1,4 |
| Akarsu | nehir 1 327 km, dere 665 km; Sakarya 154, Ankara Çayı 143, Kirmir 134, Kızılırmak 54 km | nehir 185, dere 174 km; Kızılırmak 120, Delice Çayı 53 km |
| Göl/baraj | 587 çokgen, 144 km² (Sarıyar 64,9, Gökçekaya 19,3, Çamlıdere 13,7, Mogan 5,7 km²) | 38 çokgen, 17,5 km² (Kapulukaya 13,2) |
| Su erişimi: medyan / p90 | 38 / 113 oyun m; ≤ 60 m %67,9, ≤ 240 m %99,9 | 51 / 128 oyun m; ≤ 60 m %57,3, ≤ 240 m %100 |
| Yenebilir bitki medyan uzaklık | 29 m (≤ 60 m %80,3) | 22 m (≤ 60 m %91,7) |
| Dal/çalı medyan uzaklık | 9 m | 8 m |
| Gece (18–06, ateşsiz) medyan rakımda en düşük can (yatarak / yürüyerek) | 76 / 88 (6,6 °C) | 81 / 93 (7,3 °C) |
| Gece p90 rakımda | 49 / 65 (1 413 m, 4,2 °C) | 67 / 81 (1 168 m) |
| Gece en yüksek yürünebilir | 5 / 24 (1 939 m, 0,8 °C) | 26 / 44 (1 696 m) |
| Canlı: orman 50–1400 m gündüz (karaca/domuz/kurt/ayı, karşılaşma/dk) | 0,78 / 0,18 / 0,05 / 0,08 | 0,80 / 0,28 / 0,06 / 0 |
| Canlı: aynı, gece | 0,19 / 0,41 / 0,35 / 0,01 | 0,47 / 0,71 / 0,08 / 0,01 |
| Canlı: orman ≥ 1400 m gündüz, ayı | 0,06 (12 başlangıç) | 0 (2 başlangıç) |
| `CreatureSystem` adımı | 0,018 ms | 0,020 ms |

Gözlemler (ayar yapılmadı): her iki il de **yüksek platodur** (rakımların %57 / %38'i ≥ 1000 m): medyan rakımda ateşsiz gece can ≈ 76–81'e, Ankara'nın
en yüksek yürünebilir yerlerinde (Kızılcahamam–Çamlıdere dağları) ≈ 5'e iner (Bolu ile benzer). Bozkır nedeniyle ağaç seyrek (orman %10,7 / %0,8), ama çalı
bol olduğundan dal/yakıt ≤ 9 m'de, yenebilir bitki ≤ 60 m'de %80+; su her yerden ≤ 1 dk. Kırıkkale'de orman yok denecek kadar azdır: canlı yoğunluğu
ölçümü ormanlık başlangıç bulamayınca yüksek ormanda ayı ölçülemedi, ve kamp yeri yoktur. Av çoğunlukla çalılıkta; gerçek oyunda "yiyecek kıtlığı" hissi elle
değerlendirilmeli.

## 8. Testler
- `tests/guneySettlements.test.ts` (yeni): tek il merkezi (Belediyesi kopyası yok), ilçe/köy sayıları, yapı ve cami, satıcılar, simge yapılar, `unlinked = 0`.
  `GUNEY_REPORT=1` §4 sayılarını yazdırır.
- `tests/guneyBaseline.test.ts`, `tests/guneyEcology.test.ts` (yeni): §7 tabloları (`PROVINCE_REPORT=1`, `PROVINCE_ONLY=Ankara`).
- Üçü de yeni illerin verisi yoksa (12.9 öncesi commit'li dünya) yalnızca "grup dosyası iller tanımlar" testini çalıştırır.
- Yerel dünyada çalıştırıldı: `pilotPlaces` 109/109, `guney*` hepsi, `settlementMap` (10 sn süre testi hariç hepsi), `overlapAudit`.
  Yerel dünyada kırılması beklenen **12.9'un testleri** (boyut/sayı sabitleri: `region`, `scalePerf`, `worldData`, `buildReport`…) çalıştırılmadı.

## 9. Elle denenecekler (12.9 sonrası, gerçek GPU)
- Ankara'da başlangıç/ışınlanma (Shift + 1–9, 0 → Ankara yerleri), "Ankara'ya hoş geldiniz" / "Kırıkkale'ye hoş geldiniz" bildirimi, yer adı bildirimleri.
- Anıtkabir, Ankara Kalesi, Kocatepe Camii çevresinin görünümü; Ankara merkezinde FPS (en kötü draw call 337).
- Kızılcahamam–Çamlıdere ormanında gece soğuğu ve ayı tehdidi; Ankara/Kırıkkale bozkırında yiyecek hissi ve eşkıya kampı (Ankara'da 10).
- Beypazarı tarihî dokusu, Sarıyar/Çamlıdere baraj göllerinin çevresi.

## 10. CLAUDE.md / ROADMAP için önerilen paragraf (12.9 birleştirir)
> **Güney grubu (Faz 12.C): Ankara ve Kırıkkale.** `tools/groups/guney.yaml` (iller, üsluplar, 8 simge yapı), `src/config/places/guney.ts` (Ankara 10, Kırıkkale 9 yer;
> `campCount` 10). Izgara kapsamı tek dikdörtgen olduğundan Ankara'nın 39,33°K kuzeyi tamamen girer (%78; `clip_bbox` Kırıkkale yüzünden etkisizdir). Yerel dünya: 4699 × 3148,
> 70 karo, `elevation.max` 2600 (değişmedi), 1 150 yerleşim (Ankara 183, Kırıkkale 52). Bulgular: Overture "… Belediyesi" yinelemesi (düzeltildi, PR #61), `SettlementMap`
> 18 sn, en kötü 337 draw call (Anıtkabir), Ankara il merkezinde parsel sıkışıklığı. Ayrıntı: [docs/faz-12-guney-rapor.md](docs/faz-12-guney-rapor.md).
