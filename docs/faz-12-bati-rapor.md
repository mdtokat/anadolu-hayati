# Faz 12.A — Batı grubu raporu: Kocaeli, Bilecik

Bu belge 12.A oturumunun çıktısıdır ([faz-12-paralel-plan.md](faz-12-paralel-plan.md) §4.1, §4.2). Ölçümler **yerel dünyada** alındı:
`cekirdek` + `bati` grupları (9 + 2 = 11 hedef il), `python build_world.py` → `build_settlements.py` → `npm run bake`. Bu dünya **birleşik
Faz 12 dünyası değildir** (doğu ve güney grupları yok; yol omurgası ve yerleşim düzeni küreseldir): bulgular 12.9'da yeniden doğrulanır.
`public/data/**` ve `tools/world.yaml`'daki yerel `groups` satırı bu PR'a girmez.

## 1. Yerel dünya (12.9 için)

| | Değer |
|---|---|
| `extent` | `col0 −1664, row0 −384, 5211 × 2812` (mevcut `−1152, −384, 4699 × 2346`; **batıya 512, güneye 466 örnek** uzar) |
| `elevation.max` | **2600 m (değişmedi)** → eski karolar yeniden nicemlenmez |
| Karo | 66 (mevcut 50) |
| Eski alan farkı | örtü birebir aynı; yükseklik farkı yalnız `PINNED_WINDOWS`'ta mevcut dünya penceresi olmadığı için (34 dosya; doğu kenar karolarında en çok ~42 nicem). ty = 3 satırı yeni uzayan kısımdır, değişmesi doğru. **12.9 `PINNED_WINDOWS`'a mevcut dünya penceresini eklemeli** |
| Bake | 68 dosya, 32,9 MB, hazırlık 20 sn (dere yatakları + yerleşim + tüneller), toplam 23 sn |
| `settlements.json` | 2,83 MB (mevcut 2,22 MB); `features.json` **3,54 MB** (sınır 3,58 MB → **%99**) |
| Yerleşim | 1 048 (mevcut 915 + 133), 53 simge yapı, 5 954 yapı |
| Yol ağı (tüm yerel dünya) | 1 910 çıkış çizgisi (34 607 veri çizgisinden), `unlinked` 0, 56 bileşen bağlantısı, 70 patika, 603 köy girişi, 4 785 ikiz şerit çökertildi |

Veri bütçesi (`npm run build:check`): temiz (commit'li) dünyada tüm ölçütler geçer; `index.js` gzip %95 (uyarı, değişmedi). Yerel dünyada `features.json`
sınırın %99'u: **birleşik dünyada sınırı aşar**, sınırı yükseltmek ya da dosyayı karo başına bölmek 12.9'un kararıdır (bütçe sahibi).

## 2. Bulunan sorunlar

1. **`features.json` boyutu:** yalnız bu grupla %99; doğu ve güney eklenince 3,58 MB sınırı kesin aşılır (güney raporu 3,44 MB yazmıştı). 12.9'da karo başına
   bölme (karo akışlı yayına zaten uygun) ya da sınır artışı.
2. **Köprüsüz dere kesişimi 10 > 8** (`tests/overlapAudit` sınırı; çekirdekte 4): 3'ü kent sokağı (sınıf 3, kent içinde dere üstünden geçiş). Algoritma düzeltmesi
   (kent sokaklarının dereyi köprüyle geçmesi) ayrı küçük PR konusudur, bu PR'a girmedi; 12.9 eşiği birleşik dünyada yeniden ölçer.
3. **`SettlementMap` kurulumu 10,4–13,4 sn** (`tests/settlementMap` "deterministik ve hızlı" < 10 sn testi makine yüküne duyarlıdır). Oyuncuya yansımaz (12.0a:
   bake'ten yüklenir), ama bake hazırlığı 20 sn. Sınır 12.9'a.
4. **Draw call:** en kötü **355** (Körfez, 270°; bütçe < 300), bkz. §5. Çoğu uzak arazi chunk'larıdır; ilk hamle `CHUNK.viewDistance`/LOD eşikleri, ardından
   tamamı derin deniz olan chunk'ları birleştirmek ve `SETTLEMENT_LAYOUT` sınırları. 12.9 birleşik ölçümde karar verir.
5. **İzmit ilçe merkezi 9 yapıya sıkışır:** düzen sırası ilçe → il olduğundan il merkezi (Kocaeli, 57 yapı) ve komşu ilçe çekirdekleri (Başiskele, Körfez,
   Derince…) İzmit'e yer bırakmaz. Sanayi bölgesinde yalnız 6 fabrika yapısı vardır (Gebze/Dilovası OSB'leri için gerçek yoğunluğun çok altı; algoritma
   davranışı, ayar yapılmadı).
6. **Orhan Gazi Camii İzmit'e oturmadı** (9 yapı, uygun parsel yok) → simge yapı il merkezi `Kocaeli`'ye bağlandı. Tüm 12 simge yapı yerleşti
   (`tests/batiSettlements` denetler).
7. **Overture Places konumları:** Pazaryeri ve Gölpazarı merkez yer noktaları 60 oyun m içinde tatlı su bulamadı (`tests/pilotPlaces`); koordinatlar en yakın
   akarsuya (52 m) çekildi.
8. **Eşkıya kampı katkısı küçük:** sınırsız kamp aramasında toplam 154 uygun yer (Kocaeli 3, Bilecik 3; komşular Bursa 21, Eskişehir 14, Ankara 30, İstanbul 9 …).
   `campCount` katkısı **6**; birleşik dünyada toplam 12.9'da doğrulanır.
9. **`provinceBaseline` / `provinceEcology` yeni illeri kapsamaz** (12.9'un testleri, sabit 5 il): grubun kendi kopyaları `tests/batiBaseline`,
   `tests/batiEcology` (veri yoksa atlanır).

## 3. Yerleşimler (yerel dünya)

| | Kocaeli | Bilecik |
|---|---|---|
| Yerleşim | 69 (1 il, 12 ilçe, 56 köy) | 64 (1 il, 7 ilçe, 56 köy) |
| Yapı: il merkezi | 57 | 44 |
| Yapı: ilçeler (toplam) | 251 (Gebze 44, Çayırova 34, Kartepe 32, Gölcük 27, Başiskele 19, Körfez 19 …, İzmit 9) | 108 (Bozüyük 36, Söğüt 17, Gölpazarı 15, Pazaryeri 15 …, Yenipazar 5) |
| Yapı: köyler (toplam) | 281 | 222 |
| Cami olan yerleşim | 34 | 31 |

Toplam yerel dünya 5 954 yapı, düzen 7,6 sn. Stiller: Kocaeli körfez kuşağı (İzmit, Gebze, Dilovası, Körfez, Gölcük, Derince, Darıca, Çayırova) `sanayi`;
Bilecik, Söğüt, Osmaneli `osmanli`; kalanı `kasaba`.

### Simge yapılar (12)
Orhan Gazi Camii (il merkezine bağlı), İzmit Saat Kulesi; Gebze: Çoban Mustafa Paşa Camii, Saat Kulesi, Eskihisar Kalesi; Karamürsel Ulu Camii; Bilecik: Şeyh
Edebali Türbesi, Saat Kulesi, Bilecik Kalesi; Söğüt Ertuğrul Gazi Türbesi; Osmaneli Lefke Kalesi; Bozüyük Ulu Camii. Hepsi yerleşti.

## 4. Yer adları (`src/config/places/bati.ts`)
Kocaeli 10 (merkez, Gebze, Gölcük, Karamürsel, Kandıra, Kartepe, Körfez, Dilovası, Derince, Darıca), Bilecik 8 (merkez, Söğüt, Bozüyük, Osmaneli,
Pazaryeri, Gölpazarı, Yenipazar, İnhisar). `tests/pilotPlaces` yerel dünyada **geçti** (her yer kendi ilinde, karada, yürünebilir, ≤ 60 oyun m'de tatlı su).

## 5. Ölçümler (başsız yazılımsal WebGL; gerçek GPU değil)

10 konum × 8 yön (45°), çizim açık, geliştirme sunucusunda, akışlı dünya (`npm run bake` çıktısı):

| Konum | En kötü draw call (yön) | Üçgen (o yönde) | Ortalama draw call | JS yığını (MB) |
|---|---:|---:|---:|---:|
| İzmit | 326 (270°) | 609 bin | 207 | 267 |
| Gebze | 304 (270°) | 570 bin | 179 | 256 |
| Dilovası | 290 (270°) | 492 bin | 167 | 251 |
| **Körfez** | **355 (270°)** | 595 bin | 198 | 257 |
| Gölcük | 315 (315°) | 551 bin | 198 | 256 |
| Karamürsel | 291 (270°) | 552 bin | 174 | 257 |
| Kandıra | 301 (270°) | 556 bin | 193 | 281 |
| Bilecik | 310 (315°) | 719 bin | 171 | 275 |
| Söğüt | 278 (315°) | 672 bin | 158 | 275 |
| Bozüyük | 293 (315°) | 683 bin | 158 | 282 |

Sayfa açılışı (menüye hazır) 7,7 sn, hata yok. En kötü konumlar Körfez'e batıdan (270°) bakışlardır: açık deniz + yoğun körfez kıyısı chunk'ları. Hedef
≤ 250 / bütçe < 300 aşıldı (6 konum); karar 12.9'da birleşik ölçümle.

## 6. Ekoloji ve denge turu (ayar yapılmadı; `tests/batiBaseline`, `tests/batiEcology`)

| | Kocaeli | Bilecik |
|---|---|---|
| Alan / kara | 3 429 / 3 428 km² | 4 161 / 4 161 km² |
| Rakım ort / medyan / p90 / en yüksek | 269 / 215 / 529 / 1 586 m | 735 / 759 / 1 140 / 1 777 m |
| Rakım payı ≥ 1000 m | %2,7 | %20,3 |
| Eğim ≤ 30° / ≤ 45° / ≤ 60° | %80,3 / %94,5 / %99,6 | %70,2 / %93,0 / %99,4 |
| Örtü: orman / çalı / tarım / çıplak / kent | %63,0 / %13,8 / %11,1 / %1,9 / %8,8 | %53,9 / %19,4 / %17,6 / %6,5 / %1,4 |
| Akarsu | nehir 149, dere 175 km; Kocaçay 26 km | nehir 154, dere 166 km; Sakarya 98, Karasu 56 km |
| Göl/baraj | 111 çokgen, 11,2 km² (Namazgah 2,26, Yuvacık 1,53) | 66 çokgen, 7,8 km² (Darıdere 1,75) |
| Su erişimi: medyan / p90 | 32 / 78 oyun m; ≤ 60 m %78,7; ≤ 240 m %100 | 44 / 100 oyun m; ≤ 60 m %65,2; ≤ 240 m %100 |
| Yenebilir bitki medyan / p90 | 12 / 27 m (≤ 60 m %99,3) | 14 / 27 m (≤ 60 m %99,7) |
| Dal/çalı medyan / p90 | 7 / 17 m | 7 / 14 m |
| Gece (18–06, ateşsiz) medyan rakımda en düşük can (yatarak / yürüyerek) | 100 / 100 (206 m, 12 °C) | 91 / 99 (758 m, 8,4 °C) |
| Gece p90 rakımda | 100 / 100 (466 m) | 67 / 81 (1 166 m, 5,8 °C) |
| Gece en yüksek yürünebilir | 42 / 59 (1 496 m, 3,6 °C) | 22 / 40 (1 739 m, 2,1 °C) |
| Canlı: orman 50–1400 m gündüz (karaca/domuz/kurt/ayı, karşılaşma/dk) | 0,57 / 0,23 / 0 / 0,02 | 0,53 / 0,35 / 0 / 0,02 |
| Canlı: aynı, gece | 0,15 / 0,60 / 0,15 / 0 | 0,27 / 0,60 / 0,35 / 0,02 |
| Canlı: orman ≥ 1400 m gündüz, ayı | 0,02 | 0,03 |
| `CreatureSystem` adımı | 0,009 ms | 0,009 ms |

Gözlemler (ayar yapılmadı): Kocaeli alçak ve ormanlıktır (medyanda gece bile can 100; su ve yiyecek bol), oyun için Zonguldak/Düzce'ye benzer. Bilecik orta
yükseklikte (medyan 759 m, %20 ≥ 1000 m): gece soğuğu medyan rakımda hafif hasarlı (can ≈ 91), en yüksek yerlerde (Domaniç/Köroğlu eteği) ≈ 22'ye iner
(Karabük–Bolu aralığı). Her iki ilde su her yerden ≤ 1 dk yürüyüş; yiyecek ve yakıt ≤ 30 m, yani kıtlık yok. Körfez kıyısındaki sanayi dokusunun oyun hissi
elle değerlendirilmeli.

## 7. Testler
- `tests/batiSettlements.test.ts` (yeni): il/ilçe/köy sayıları, yapı ve cami, satıcılar, 12 simge yapının yerleşmesi, `unlinked = 0`. `BATI_REPORT=1` §3 sayılarını yazdırır.
- `tests/batiBaseline.test.ts`, `tests/batiEcology.test.ts` (yeni): §6 tabloları (`PROVINCE_REPORT=1`, `PROVINCE_ONLY=Kocaeli`).
- Üçü de yeni illerin verisi yoksa (12.9 öncesi commit'li dünya) yalnızca "grup dosyası iller tanımlar" testini çalıştırır.
- Yerel dünyada çalıştırıldı: `pilotPlaces` (108 geçti / 19 atlandı: diğer grupların illeri), `bati*`, `provinceNoticeRegion`, `settlementMap` (süre testi yük
  duyarlı), `overlapAudit` (köprüsüz dere 10 > 8, bkz. §2.2). Yerel dünyada kırılması beklenen **12.9'un testleri** (boyut/sayı sabitleri) çalıştırılmadı.

## 8. Elle denenecekler (12.9 sonrası, gerçek GPU)
- Kocaeli'nde başlangıç/ışınlanma (Shift + 1–9, 0), "Kocaeli'ye hoş geldiniz" / "Bilecik'e hoş geldiniz" bildirimi, yer adı bildirimleri.
- Körfez'e (Körfez, Gölcük, İzmit) bakarken FPS (en kötü draw call 355); Gebze–Dilovası sanayi dokusu.
- Söğüt, Bilecik Kalesi ve Şeyh Edebali Türbesi çevresi (Osmanlı üslubu); Sapanca–Kartepe ormanında gece ve ayı.
- Yuvacık/Namazgah baraj göllerinin çevresi, Bilecik'te Sakarya vadisi.

## 9. CLAUDE.md / ROADMAP için önerilen paragraf (12.9 birleştirir)
> **Batı grubu (Faz 12.A): Kocaeli ve Bilecik.** `tools/groups/bati.yaml` (iller, üsluplar, 12 simge yapı), `src/config/places/bati.ts` (Kocaeli 10, Bilecik 8 yer;
> `campCount` 6). Yerel dünya: 5211 × 2812 (batıya 512, güneye 466 örnek), 66 karo, `elevation.max` 2600 (değişmedi), 1 048 yerleşim (Kocaeli 69, Bilecik 64), 5 954 yapı.
> Bulgular: `features.json` sınırın %99'u (birleşikte aşılır), köprüsüz dere kesişimi 10 > 8 (3'ü kent sokağı), en kötü 355 draw call (Körfez), İzmit ilçesi 9 yapıya
> sıkışır, `PINNED_WINDOWS`'a mevcut dünya penceresi eklenmeli. Ayrıntı: [docs/faz-12-bati-rapor.md](docs/faz-12-bati-rapor.md).
