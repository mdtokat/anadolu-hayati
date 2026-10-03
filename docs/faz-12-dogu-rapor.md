# Faz 12.B — Doğu grubu raporu: Samsun, Çorum, Amasya

Bu belge 12.B oturumunun çıktısıdır ([faz-12-paralel-plan.md](faz-12-paralel-plan.md) §4.1, §4.3). Ölçümler **yerel dünyada** alındı:
`cekirdek` + `dogu` grupları (12 hedef il; `world.yaml` `groups` yerelde geçici olarak `[cekirdek, dogu]` yapıldı, commit'e girmedi),
`python build_world.py` → `build_settlements.py` → `npm run bake`. Bu dünya **birleşik Faz 12 dünyası değildir** (batı ve güney grupları
yok; yol omurgası ve yerleşim düzeni küreseldir): bulgular 12.9'da yeniden doğrulanır. `public/data/**` bu PR'a girmez.

## 1. Kapsam ve bir bulgu (EPSG:32636 sınırı)

Üç il de tam kapsandı (`clip_bbox` kullanılmadı). Plan §4.3 "doğu sınırı (36°D) içindedir" der; gerçek il sınırları: **Samsun 37,17°D,
Amasya 36,51°D** (Çorum 35,53°D). Bu yüzden `world.yaml` `bbox_max` 12.0b'de orta meridyen (33°D) çevresinde simetrik ±4,5°'ye
(28,5–37,5°D; ölçek sapması ≤ %0,2) genişletildi ([PR #59](https://github.com/mdtokat/anadolu-hayati/pull/59)); türetilen kutu bunun içinde kalır.

| Kapsam | Türetilen kutu (lon0, lat0, lon1, lat1) |
|---|---|
| çekirdek | 29,84 / 40,05 / 35,54 / 42,22 |
| çekirdek + doğu | 29,84 / **39,85** / **37,26** / 42,22 |
| çekirdek + güney (12.C) + doğu | 29,84 / 39,30 / 37,26 / 42,22 |

## 2. Yerel dünya (12.9 için)

| | Değer |
|---|---|
| `extent` | `col0 −1152, row0 −384, 6125 × 2536` (mevcut 4699 × 2346; **doğuya** 1 426 sütun, güneye 190 satır uzar; batı/kuzey aynı) |
| `elevation.max` | **2600 m (değişmedi)** → eski karolar yeniden nicemlenmez |
| Karo | 78 (mevcut 50) |
| Komşu iller (`inRegion=false`) | Ankara, Bilecik, Eskişehir, Kocaeli, Kırıkkale, Ordu, Sivas, Tokat, Yozgat, İstanbul |
| Bake | 80 dosya, 35,9 MB, hazırlık ~15 sn (dere yatakları + yerleşim + tüneller), toplam ~18 sn |
| `settlements.json` | 3,24 MB (mevcut 2,22 MB); `features.json` **3,65 MB** ham (mevcut 2,55; sınır 3,58 MB → **%102, aşıldı**) |
| Yerleşim | 1 391 (12 il, 120 ilçe, 1 259 köy; mevcut 915), 61 simge yapı, 7 521 yapı |
| Yol | 37 326 veri çizgisi → 2 521 çıkış çizgisi, 322 anayol bağlantısı, 70 patika, 806 köy girişi, 3 584 ikiz şerit çökertildi |

`npm run build:check` (yerel): dünya verisi toplamı 104,4 MB (eski `tiles/*.bin` 59 MB + bake 35 MB; sınır 55; dağıtımdan çıkarma 12.9'un kararı), en büyük
dosya `features.json` 3,65 MB (**sınır 3,58 aşıldı**; Altınkaya, Derbent, Boyabat, Obruk baraj gölleri ve Kızılırmak/Yeşilırmak büyük su çokgenleri),
tahmini ilk yükleme 4,6 sn (akışlı, 9 karo; sınır 10), `index.js` 258,3 kB gzip (sınır 270, %96). Bütçeyi bu oturum değiştirmedi.

## 3. Bulunan sorunlar

1. **Yerleşim kimliği çakışması — düzeltildi (ayrı commit):** `stable_id` Overture kimliğinin 20 bitlik CRC'sidir; 12 illik dünyada iki köy aynı kimliği aldı
   (Selahiye/Sakarya ↔ Çanakçı/Samsun, `131923`) ve `build_settlements.py` "yerleşim kimliği çakışması" ile durdu. Beklenen çakışma sayısı yerleşim sayısı arttıkça
   büyür (≈ n²/2M: 2 500 yerleşimde ~3). `assign_unique_ids`: çakışmada **sonraki il** (grup sırası; çekirdek önce) ve aynı ilde Overture kimliği büyük olan kimliğine
   `#n` eklenerek yeniden karmalanır; çakışmayan kimlik değişmez. **Doğrulama:** yalnızca çekirdek grubuyla yeniden üretim commit'li veriyle bayt bayt aynı
   (`git diff -- public` boş, `settlements.json` sha256 aynı); `tools/tests/test_settlements.py` yeni test. Bu, plan §2.2'ye göre **ayrı küçük PR** olmalıdır
   (bkz. PR açıklaması); diğer grupların dünyaları da bu çakışmayla karşılaşır.
2. **Samsun il merkezi yalnız 13 yapı, İlkadım ilçesi 3 yapı:** düzen sırası ilçe → il olduğundan metropol çekirdeği Atakum (27), Canik (16), Tekkeköy (15), İlkadım
   (3) ilçeleriyle bölüşülür (Ankara'da 41 ile aynı davranış, 12.C raporu §3.4). İlkadım'da satıcı yeri yoktur (`placeVendors`: 3 yapı); `tests/doguSettlements` satıcı
   denetimini ≥ 5 yapılı merkezlere uygular. Samsun Büyük Cami, il merkezinde parsel bulamadığı için simge yapı listesinden çıkarıldı.
   `tests/settlementMap` "il merkezi ≥ 20 yapı" eşiği Samsun'da **13 ile başarısız** olur (12.9'un testi; eşik gevşetilmeli ya da büyük şehirlerde ilçe → il sırası gözden geçirilmeli).
3. **Amasya'da simge yapı sıkışması:** II. Bayezid Camii ve Gökmedrese Camii il merkezinde parsel bulamadı (çıkarıldı); İskilip Kalesi de İskilip'te yerleşemedi (çıkarıldı).
   Yerleşen: Amasya Kalesi, Amasya Saat Kulesi, Kral Kaya Mezarları. Yalıboyu Evleri ve Hazeranlar Konağı için uygun simge türü yoktur (`LANDMARK_KINDS`); Bandırma Vapuru
   Müzesi Overture Places'te yoktur. Hattuşa Places'te yok: bilinen koordinatla (40,0164°K 34,6161°D; UNESCO alanının içi) Boğazkale'ye `monument` olarak yazıldı, yerleşti.
4. **Bağlanamayan köy:** Eynegazi (Samsun, 41,45°K 35,73°D; Altınkaya Barajı çevresi) için yol rotası bulunamadı (`unlinked = 1`; çekirdek ve güney 0). Köy yolsuz kalır.
   `tests/doguSettlements` `unlinked ≤ 1` der.
5. **12.9'un testleri yerel dünyada başarısız (beklenen):** `overlapAudit` köprüsüz dere kesişimi 11 (eşik ≤ 8) ve kavşak dışı köprü çakışması 4 (eşik ≤ 3);
   `settlementMap` il ≥ 20 (Samsun 13) ve düzen süresi < 10 sn (ölçülen 12–22 sn; oyun bake'ten yükler, yani oyuncuya yansımaz). Boyut/sayı sabitli testler (`region`, `scalePerf`,
   `worldData`, `buildReport`…) çalıştırılmadı. `overlapAudit` ve `settlementMap` dışındaki yerleşim/yürüme/eşkıya testleri geçti.
6. **`build_world.py`/`build_settlements.py` `--groups` bayrağı yok:** yalnızca `fetch_*` alır (12.0b). Ana dalda Güney grubu da dolu olduğundan yerel doğu dünyası için `world.yaml`
   `groups` geçici olarak elle `[cekirdek, dogu]` yapıldı. Küçük bir iyileştirme olarak build betiklerine de `--groups` eklenebilir (12.0b alanı).
7. **Overture Places gürültüsü:** "Samsun" yakınında "Ünye Kalesi", "rize kalesi", "Alaçam Cumhuriyet Meydanı" gibi yanlış konumlu kayıtlar vardır; simge yapı konumları bu yüzden tek tek
   adla ve ilçe merkezine yakınlıkla doğrulandı.

## 4. Yerleşimler (yerel dünya)

| | Samsun | Çorum | Amasya |
|---|---|---|---|
| Yerleşim (il / ilçe / köy) | 1 / 17 / 213 (231 toplam) | 1 / 13 / 146 (160) | 1 / 6 / 78 (85) |
| Yapı: il merkezi | 13 | 144 | 50 |
| Yapı: ilçeler (toplam) | 315 (Bafra 41, Çarşamba 32, Atakum 27, Terme 26 …) | 185 (Alaca 37, Sungurlu 25, Osmancık 23 …) | 125 (Merzifon 38, Suluova 38, Gümüşhacıköy 23 …) |
| Yapı: köyler (toplam) | 849 | 568 | 295 |
| Cami olan yerleşim | 78 | 74 | 38 |
| Satıcı | il 4, ilçe 3 (İlkadım hariç) | il 4, ilçe 3 | il 4, ilçe 3 |

Üsluplar: Amasya, Merzifon, Osmancık, İskilip, Vezirköprü `osmanli`; kalan merkezler `kasaba`. Cami sığmayan merkez yok (`no_mosque_towns: []`; en küçük İlkadım'da bile cami var).

### Simge yapılar (20; hepsi yerleşti, `tests/doguSettlements`)
Amasya Kalesi, Amasya Saat Kulesi, Kral Kaya Mezarları (Amasya); Samsun Saat Kulesi; Bafra Büyük Cami, Bafra Belediye Hamamı; Köprülü Mehmet Paşa Camii (Vezirköprü); Ladik Saat Kulesi;
Havza Atatürk Evi; Ulu Cami, Çorum Kalesi, Çorum Saat Kulesi (Çorum); Kara Mustafa Paşa Camii, Merzifon Bedesteni (Merzifon); Koca Mehmet Paşa Camii, Kandiber Kalesi (Osmancık);
İskilip Ulu Camii; Sungurlu ve Alaca Saat Kuleleri; Hattuşa (Boğazkale). Konumlar Overture Places'ten (yaklaşık; en yakın boş parsele oturur).

## 5. Yer adları (`src/config/places/dogu.ts`)
Samsun 10, Çorum 10, Amasya 8. `tests/pilotPlaces` yerel dünyada **118/118** geçti (her yer kendi ilinde, karada, yürünebilir, ≤ 60 oyun m'de tatlı su). Düzeltmeler: Merzifon merkezinde 60 m
içinde su yok (77 m; en yakın baraj) → "Merzifon Barajı"; Gümüşhacıköy merkezi 67 m → koordinat ~450 m kaydırıldı.

`BANDITS.campCount` katkısı **13**: sınırsız kamp aramasında Samsun'da 6, Çorum'da 4, Amasya'da 3 uygun orman yeri bulundu (toplam 147 kamp yerinin 103'ü komşu illerde: Tokat 21, Ankara 30, Bilecik 14,
Kocaeli 13 …; kamplar il kısıtlamasız konur). Birleşik dünyada kamp seçimi yine rastgele sırayla yapılır; 12.9 toplamı doğrulamalı.

## 6. Ölçümler (başsız yazılımsal WebGL; gerçek GPU değil)

10 konum × 8 yön (45°), çizim açık, geliştirme sunucusunda, akışlı dünya (`npm run bake` çıktısı); her konumda ışınlanıp 9 sn beklendi:

| Konum | En kötü draw call (yön) | Üçgen (o yönde) | Ortalama draw call | JS yığını (MB) |
|---|---:|---:|---:|---:|
| Samsun merkez | 107 (90°) | 305 bin | 73 | 209 |
| Bafra | 96 (225°) | 402 bin | 81 | 233 |
| Çarşamba | 113 (45°) | 716 bin | 86 | 265 |
| Amasya merkez | 164 (315°) | 990 bin | 92 | 289 |
| Merzifon | 180 (315°) | 959 bin | 100 | 291 |
| **Çorum merkez** | **239 (315°)** | 1,34 M | 114 | 305 |
| Alaca | 193 (315°) | 1,22 M | 96 | 312 |
| Sungurlu | 171 (315°) | 1,07 M | 90 | 300 |
| Osmancık | 142 (225°) | 1,03 M | 102 | 318 |
| Hattuşa | 187 (315°) | 1,24 M | 98 | 313 |

Sayfa açılışı (menüye hazır) 7,6 sn, hata yok. En kötü 239 draw call (bütçe < 300, hedef ≤ 250: aşılmadı); üçgen sayısı iç bölgede ~1,0–1,3 M (açık bozkırda uzak arazi chunk'ları; 12.C ile aynı eğilim).
Samsun kıyısı düşüktür (deniz görünümü). JS yığını ~210 → 318 MB. 12.9 birleşik ölçümü tekrarlamalı.

## 7. Ekoloji ve denge turu (ayar yapılmadı; `tests/doguBaseline`, `tests/doguEcology`, 6 başlangıç × 10 dk)

| | Samsun | Çorum | Amasya |
|---|---|---|---|
| Alan / kara | 9 657 / 9 552 km² (kıyı 606 km) | 12 525 / 12 525 km² | 5 635 / 5 635 km² |
| Rakım ort / medyan / p90 / en yüksek | 530 / 564 / 989 / 1 974 m | 985 / 980 / 1 373 / 2 091 m | 871 / 821 / 1 363 / 2 053 m |
| Rakım payı ≥ 1000 m | %9,4 | %47,5 | %33,0 |
| Eğim ≤ 30° / ≤ 45° / ≤ 60° | %60,3 / %84,5 / %99,3 | %72,0 / %93,3 / %99,6 | %60,5 / %87,3 / %99,1 |
| Örtü: orman / çalı / tarım / çıplak / kent | %56,4 / %17,2 / %20,4 / %2,2 / %1,7 | %18,9 / %33,5 / %35,2 / %10,9 / %0,9 | %26,4 / %34,6 / %28,9 / %8,5 / %1,4 |
| Akarsu | nehir 622 km, dere 867 km; Kızılırmak 117, Yeşilırmak 89 km | nehir 400, dere 762 km; Kızılırmak 210, Çorum Çayı 86 km | nehir 277, dere 250 km; Yeşilırmak 131, Çekerek 53 km |
| Göl/baraj | 124 çokgen, 169 km² (Altınkaya 95, Derbent 15) | 136 çokgen, 114 km² (Boyabat 55, Obruk 34) | 85 çokgen, 15 km² (Yedikır 5,7) |
| Su erişimi: medyan / p90 | 25 / 64 oyun m; ≤ 60 m %88,9, ≤ 240 m %100 | 39 / 94; ≤ 60 m %71,6, ≤ 240 m %100 | 39 / 95; ≤ 60 m %70,6 |
| Yenebilir bitki medyan uzaklık | 15 m (≤ 60 m %95,1) | 20 m (%93,1) | 16 m (%98,5) |
| Dal/çalı medyan uzaklık | 8 m | 8 m | 7 m |
| Gece (18–06, ateşsiz) medyan rakımda en düşük can (yatarak / yürüyerek) | 99 / 100 (9,9 °C) | 79 / 91 (7,0 °C) | 89 / 98 (8,2 °C) |
| Gece p90 rakımda | 78 / 90 | 55 / 71 (1 328 m) | 55 / 71 (1 331 m) |
| Gece en yüksek yürünebilir | 10 / 29 (1 881 m) | **ölür (12. dk)** / 15 (2 035 m) | 8 / 27 (1 897 m) |
| Canlı: orman 50–1400 m gündüz (karaca/domuz/kurt/ayı, karşılaşma/dk) | 0,93 / 0,07 / 0,08 / 0,13 | 1,20 / 0,63 / 0,02 / 0,05 | 1,08 / 0,27 / 0,12 / 0 |
| Canlı: aynı, gece | 0,28 / 0,43 / 0,45 / 0,08 | 0,27 / 0,58 / 0,07 / 0,02 | 0,23 / 0,35 / 0,32 / 0,03 |
| Canlı: orman ≥ 1400 m gündüz, ayı | 0,05 | 0,10 | 0,08 |
| `CreatureSystem` adımı | 0,012 ms | 0,014 ms | 0,012 ms |

Gözlemler (ayar yapılmadı): **Samsun kıyıdır** (medyan rakım 564 m; gece soğuğu medyanda zararsız, p99 rakımda (1 480 m) can 44'e iner; Zonguldak'a benzer). **Çorum ve Amasya yüksek platodur** (rakımın %47 / %33'ü ≥ 1000 m):
medyan rakımda ateşsiz gece can ≈ 79–89'a, en yüksek yürünebilir yerlerde (Çorum 2 035 m) tek gecede ölüme iner (Bolu/Ankara ile benzer). Çorum'da orman %18,9 (iğne yapraklı baskın: yapraklı 0,1/km²),
yakıt (dal/çalı ≤ 8 m) ve yenebilir bitki (≤ 60 m'de %93+) yine de bol; su her yerden ≤ 1 dk. Av çoğunlukla çalılıkta; Amasya'da gündüz ayı karşılaşması ölçülemedi (ormanlık 50–1400 m'de 0), gece kurt
sürüsü (0,32/dk) belirgin. Gerçek oyunda "yiyecek kıtlığı" ve Çorum yaylasında gece soğuğu elle değerlendirilmeli.

## 8. Testler
- `tests/doguSettlements.test.ts` (yeni): il merkezi/ilçe/köy sayıları, yapı ve cami, satıcılar, simge yapılar, yol ağı (`unlinked ≤ 1`). `DOGU_REPORT=1` §4 sayılarını yazdırır.
- `tests/doguBaseline.test.ts`, `tests/doguEcology.test.ts` (yeni): §7 tabloları (`PROVINCE_REPORT=1`, `PROVINCE_ONLY=Samsun`).
- Üçü de yeni illerin verisi yoksa (12.9 öncesi commit'li dünya) yalnızca "grup dosyası iller tanımlar" testini çalıştırır.
- `tools/tests/test_settlements.py`: `assign_unique_ids` testi (kimlik çakışması düzeltmesi).
- Yerel dünyada çalıştırıldı: `pilotPlaces` 118/118, `dogu*` hepsi, `banditCamps`, `settlementMap` (il ≥ 20 ve < 10 sn testi hariç), `overlapAudit` (yukarıdaki iki eşik hariç).

## 9. Elle denenecekler (12.9 sonrası, gerçek GPU)
- Samsun, Çorum, Amasya'da başlangıç/ışınlanma (Shift + 1–9, 0 → doğu yerleri), "Samsun'a hoş geldiniz" / "Çorum'a hoş geldiniz" / "Amasya'ya hoş geldiniz" bildirimi, yer adı bildirimleri.
- Samsun kıyısı ve Bafra/Çarşamba deltası (düz arazi, yoğun dere/tarım, köprüler), Samsun metrosunda yapı seyrekliği (il 13 yapı).
- Amasya Yeşilırmak vadisi (Kral Kaya Mezarları, kale), Merzifon çarşısı, Osmancık/İskilip tarihî dokusu, Hattuşa (Boğazkale).
- Çorum yaylasında gece soğuğu (≥ 1 400 m), Çorum merkezinde FPS (en kötü 239 draw call); Altınkaya/Boyabat baraj göllerinin çevresi; eşkıya kampları (Samsun 6, Çorum 4, Amasya 3).

## 10. CLAUDE.md / ROADMAP için önerilen paragraf (12.9 birleştirir)
> **Doğu grubu (Faz 12.B): Samsun, Çorum, Amasya.** `tools/groups/dogu.yaml` (iller, 5 `osmanli` üslup, 20 simge yapı), `src/config/places/dogu.ts` (Samsun 10, Çorum 10, Amasya 8 yer; `campCount` 13). Yerel dünya:
> 6125 × 2536, 78 karo, `elevation.max` 2600 (değişmedi), 1 391 yerleşim (Samsun 231, Çorum 160, Amasya 85), 7 521 yapı. EPSG:32636 sınırı: Samsun 37,17°D'ye uzandığı için `bbox_max` ±4,5°'ye genişletildi (PR #59).
> Bulgular: 20 bitlik yerleşim kimliği çakışması (`assign_unique_ids` ile düzeltildi), Samsun il merkezi 13 yapı (İlkadım 3), Eynegazi yolsuz, `features.json` 3,65 MB (sınır 3,58 aşıldı), en kötü 239 draw call (Çorum merkez). Ayrıntı: [docs/faz-12-dogu-rapor.md](docs/faz-12-dogu-rapor.md).
