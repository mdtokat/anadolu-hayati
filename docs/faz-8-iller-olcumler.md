# Faz 8 — Diğer iller: ölçüm raporu (8.9)

Bu belge [ROADMAP.md](../ROADMAP.md) Faz 8 görev **8.9**'un çıktısıdır: Zonguldak'ta yapılan ölçüm tabanı ([faz-8-zonguldak-olcumler.md](faz-8-zonguldak-olcumler.md), 8.0 ve 8.4) **Bartın, Karabük, Düzce ve Bolu** için de alındı. **Hiçbir oyun davranışı/ayarı değişmedi**; dünya verisi (`public/data/`) ve `tools/` değişmedi. Tarih: 2026-10-01.

Yöntem (Zonguldak ile aynı; testler il başına parametriktir):
- **Arazi / örtü / eğim / su / canlı:** `PROVINCE_REPORT=1 npx vitest run tests/provinceBaseline.test.ts` (`PROVINCE_ONLY=Bolu` tek ile daraltır; canlı için `PROVINCE_STARTS=24`, bu raporda 24 kullanıldı). "İl içi" = `provinces.geojson` çokgeni, 100 m gerçek hücre çözünürlüğü. Canlı ölçümü 4 m/s dalgalı yürüyüş, 100 m içine giren benzersiz canlı (`tests/helpers/creatureWalk.ts`). **Not:** "Orman 50–700 m" bandı Bolu ve Karabük için dardır (bu illerde kara büyük oranda ≥ 500 m), yani bu iller için fiilen 500–700 m'lik ormanlardan örneklenir.
- **Ekoloji (su, yiyecek/yakıt, gece soğuğu):** `PROVINCE_REPORT=1 npx vitest run tests/provinceEcology.test.ts`; her ilde rastgele, kara, eğimi ≤ 45° 1500 nokta (tohum 8400, Zonguldak ile aynı).
- Zonguldak için sayılar bu yeniden düzenlemeden önceki rapordakilerle aynı çıktı (3174 km², 366/327/709/1571 m); canlı tablosu 24 başlangıçla yeniden alındığından Zonguldak'ın eski 8.4 tablosundakiyle birebir aynı değildir (aynı büyüklükte).
- **Yapılmayanlar:** draw call/üçgen ve FPS bu görevde yeniden ölçülmedi (kod/veri aynı; en kötü dünya geneli 176 draw call, Köroğlu/Bolu, bkz. [faz-7-b-olcumler.md](faz-7-b-olcumler.md)). Gerçek FPS elle (kılavuz bölüm 1 ve 10).

## Özet (5 il yan yana)

| Ölçüt | Zonguldak | Bartın | Karabük | Düzce | Bolu |
|---|---|---|---|---|---|
| Alan (km²) | 3174 | 2380 | 4180 | 2610 | 8205 |
| Kıyı (il çokgeni içi, yaklaşık) | 43 km | 21 km | yok | 15 km | yok |
| Rakım ort / medyan / p90 / en yüksek (m) | 366 / 327 / 709 / 1571 | 475 / 392 / 1032 / 1736 | 906 / 929 / 1311 / 1995 | 619 / 551 / 1260 / 1829 | 1176 / 1171 / 1597 / 2368 |
| ≥ 1000 m kara payı | %1,5 | %11,6 | %38,2 | %20,2 | %68,1 |
| Eğim ≤ 45° / ≤ 60° | %63,0 / %93,2 | %61,7 / %94,1 | %65,7 / %93,2 | %62,0 / %91,4 | %74,0 / %96,0 |
| Orman / çalı / tarım | %85,7 / %11,4 / %0,4 | %89,3 / %9,0 / %0,3 | %72,9 / %19,0 / %5,4 | %89,6 / %4,3 / %3,3 | %61,8 / %23,5 / %10,1 |
| Nehir + dere (km) | 227 + 304 | 192 + 369 | 208 + 291 | 112 + 299 (+43 kanal) | 376 + 530 (+51 kanal) |
| Durgun su | 21 çokgen, 3,84 km² | 23, 2,58 km² | 22, 1,84 km² | 31, 4,24 km² | 192, 20,94 km² |
| Kaynak noktası | 2 | 2 | 1 | 0 | 1 |
| İlsiz kıyı şeridi (kara hücresi) | 763 | 683 | 60 | 167 | 3 |

Yorum: Zonguldak–Bartın–Düzce kıyıdan yükselen, çoğu orman kaplı iller; **Karabük ve Bolu iç kesimdedir ve yüksektir** (Bolu karasının %68'i ≥ 1000 m; kıyı yok, deniz sesi/kıyı manzarası yok). Bolu'da orman payı en düşük, çalı ve tarım payı en yüksektir (yayla/ova). Su verisi her ilde var; Düzce'de OSM'de adlandırılmış kaynak noktası yok.

Eğim: tüm illerde kara alanının ≥ %91'i oyuncunun tırmanma sınırının (60°) altındadır; hiçbir ilde kapalı/ulaşılamaz bir kitle sorunu görülmedi.

### Her ilin en uzun adlı akarsuları ve en büyük durgun suları

| İl | Akarsular | Durgun sular |
|---|---|---|
| Bartın | Ulus (Eldeş) Çayı 47 km, Bartın Çayı 44, Arıt Çayı 38, Koca (Gökırmak) Çayı 30 | 3 baraj gölü (1,39 / 0,73 / 0,38 km²) |
| Karabük | Filyos Çayı 53 km, Soğanlı Çayı 45, Eskipazar Çayı 43, Araç Çayı 34 | baraj/gölet (0,63 / 0,28 / 0,21 km²; Esencik, Bostancılar göletleri) |
| Düzce | Küçük Melen Çayı 75 km, Büyük Melen Çayı 51, Kara Dere 41, Uğursuyu Deresi 31 | Hasanlar Baraj Gölü 2,40 km², Efteni Gölü 0,99 km² |
| Bolu | Aladağ Çayı 86 km, Mudurnu Çayı 70, Mengen Çayı 40, Markuşa Deresi 38 | Seben-Taşlıyayla Göleti 8,45 km², Köprübaşı Baraj Gölü 3,40, Yeniçağa gölü 2,21, Gölköy Baraj Gölü 1,24, Abant Gölü 1,13 |

## Yer adları ve ışınlanma (testli: `tests/pilotPlaces`)

Her ilin yerleri `config.ts` → `OTHER_PROVINCE_PLACES` (Zonguldak: `PILOT.places`); hepsi `PROVINCE_PLACES`'te il adına göre toplanır. Her yer için test: **kendi ilinde** (kıyı şeridi dahil, `isInProvince`), karada, enlem/boylamdan yürünebilir noktaya ≤ 60 oyun m kayma, ≤ 60 oyun m'de tatlı su; adlar ve koordinatlar tüm illerde benzersiz.

| İl | Yer sayısı | Yerler |
|---|---|---|
| Bartın | 8 | Bartın merkez, Amasra, Kurucaşile, Ulus, Kozcağız, Güzelcehisar, Çaylıoğlu, Bartın Irmağı |
| Karabük | 8 | Karabük merkez, Safranbolu, Yenice, Eskipazar, Eflani, Ovacık, Yörük köyü, Soğanlı |
| Düzce | 9 | Düzce merkez, Akçakoca, Gölyaka, Cumayeri, Kaynaşlı, Yığılca, Çilimli, Gümüşova, Efteni Gölü |
| Bolu | 10 | Bolu merkez, Abant Gölü, Yedigöller, Mudurnu, Göynük, Mengen, Gerede, Seben, Yeniçağa, Kıbrıscık |

**Koordinatlar yaklaşıktır** ve bilgiden seçildi (harici bir yer-adı veritabanı kullanılmadı); testler yalnızca "ilde, karada, yürünebilir, yakında su" demektir, yerin adıyla gerçekten örtüştüğünü **doğrulamaz**. Özellikle belirsiz olanlar: **Çaylıoğlu, Bartın Irmağı, Yörük köyü, Soğanlı** (genel konum işaretleridir). Bir yer (Güzelcehisar) ilk tahminde su yakınında olmadığından koordinatı değiştirildi. Elle doğrulama: kılavuz bölüm 10.

Yer adı bildirimi (`PlaceTracker`, `RegionWorld.placeCenters`) artık tüm illerin yerlerini kullanır (toplam 45 yer; en yakın yer kazanır, il bildirimiyle çakışmaz). Dev modunda `Shift + 1–9, 0` oyuncunun bulunduğu ilin yerlerine ışınlar.

## Ekoloji ve denge (8.4'ün diğer illerde karşılığı)

### Su erişimi (rastgele yürünebilir kara noktası → en yakın tatlı su)

| İl | Medyan / p90 (oyun m) | ≤ 60 m (15 sn) | ≤ 120 m (30 sn) | ≤ 240 m (60 sn) |
|---|---|---|---|---|
| Zonguldak | 35 / 85 | %73,8 | %98,3 | %100 |
| Bartın | 31 / 81 | %76,4 | %99,5 | %100 |
| Karabük | 46 / 107 | %64,0 | %93,9 | %100 |
| Düzce | 32 / 79 | %80,1 | %99,1 | %100 |
| Bolu | 37 / 87 | %72,3 | %98,0 | %100 |

Her ilde her noktadan su ≤ 1 dk yürüyüştedir (susuzluk yürürken ~7,5 dk'da biter). Karabük en uzağıdır ama sorun değil.

### Yiyecek ve yakıt (en yakın nesne, oyun m)

| İl | Yenebilir bitki medyan / p90 | ≤ 60 m | Dal / çalı medyan / p90 | Yapraklı / iğne yapraklı ağaç (/km² gerçek) |
|---|---|---|---|---|
| Zonguldak | 12 / 27 | %99,9 | 6 / 12 | 2,5 / 0,8 |
| Bartın | 13 / 28 | %99,9 | 6 / 12 | 2,1 / 1,2 |
| Karabük | 14 / 30 | %99,5 | 6 / 11 | 1,0 / 2,0 |
| Düzce | 13 / 25 | %99,5 | 6 / 12 | 1,9 / 1,5 |
| Bolu | 19 / 51 | %93,9 | 6 / 13 | **0,4** / 1,9 |

Zonguldak'taki tasarım gözlemi her ilde geçerlidir: yiyecek neredeyse hiç kıtlık yaratmıyor (en iyi hâlde medyan 12–19 m ≈ 3–5 sn yürüyüş). Bolu en seyrek ilidir (p90 51 m). Bolu'da yapraklı ağaç çok azdır (iğne yapraklı baskın, çalı %24, tarım %10): görsel olarak diğer illerden belirgin biçimde farklı bir "orman" beklenir (kılavuz bölüm 10).

### Gece soğuğu (18:00 → 06:00, su-tokluk dolu, ateşsiz/barınaksız): yatarak en düşük can / ısı

| Rakım bandı | Zonguldak | Bartın | Karabük | Düzce | Bolu |
|---|---|---|---|---|---|
| medyan | 250 m: 100 / 35,4 °C | 293 m: 100 / 35,3 | 931 m: **82** / 34,0 | 417 m: 100 / 35,1 | 1157 m: **68** / 33,5 |
| p90 | 622 m: 96 / 34,6 | 1023 m: 76 / 33,8 | 1309 m: 57 / 33,2 | 1233 m: 62 / 33,4 | 1558 m: 37 / 32,7 |
| p99 | 967 m: 80 / 33,9 | 1519 m: 40 / 32,8 | 1615 m: 32 / 32,6 | 1608 m: 33 / 32,6 | 1825 m: 15 / 32,1 |
| en yüksek yürünebilir | 1211 m: 64 / 33,4 | 1689 m: 26 / 32,4 | 1799 m: 17 / 32,2 | 1757 m: 21 / 32,3 | 1978 m: **1** / 31,8 |

(Yürüyerek her bantta daha iyidir, ör. Bolu medyan 81, Bolu en yüksek 20.)

**Bulgu:** hiçbir ilde "medyan rakımda ateşsiz bir gece ölümcül" değildir (test kilitler: medyanda yatarak ölmez, p90'da yürüyerek ölmez), ama **Karabük ve Bolu'da medyan yer bile can kaybettirir** ve Bolu'nun yüksek yaylalarında (p90 ve üstü) ateş + barınak fiilen zorunludur. Bu, Faz 3'ün "rakım arttıkça gece ölümcüldür" tasarımıyla uyumludur ve Zonguldak'ın hafif soğuğundan **belirgin biçimde farklı bir zorluk** verir; ayarlanmadı (denge yargısı gerçek oyunda: kılavuz bölüm 10). Gerekirse ilk hamle `CLIMATE` (rakımla soğuma, gece genliği); ayarlanırsa `tests/vitals` kabul simülasyonları, `tests/provinceEcology` ve bu rapor yeniden çalıştırılmalıdır.

### Canlı yoğunluğu (24 başlangıç × 10 dk; 100 m içine giren benzersiz canlı / dk)

| İl | Gündüz orman 50–700 m (karaca / domuz / kurt / ayı) | Gece orman 50–700 m (karaca / domuz / kurt / ayı) | Ayı, orman ≥ 700 m gündüz |
|---|---|---|---|
| Zonguldak | 0,292 / 0,279 / 0,021 / 0,029 | 0,183 / 0,483 / 0,117 / 0,013 | 0,063 |
| Bartın | 0,229 / 0,150 / 0,000 / 0,046 | 0,100 / 0,146 / 0,083 / 0,004 | 0,058 |
| Karabük | 0,362 / 0,196 / 0,021 / 0,058 | 0,204 / 0,446 / 0,133 / 0,021 | 0,063 |
| Düzce | 0,321 / 0,271 / 0,029 / 0,067 | 0,108 / 0,429 / 0,133 / 0,029 | 0,079 |
| Bolu | 0,329 / 0,275 / 0,071 / 0,083 | 0,163 / 0,617 / 0,254 / 0,050 | 0,054 |

- Gündüz av hayvanı (karaca + domuz): Zonguldak 0,57, Bartın **0,38**, Karabük 0,56, Düzce 0,59, Bolu 0,60 /dk (≈ 1,7–2,6 dk'da bir; gevşek aralık 0,1–2). Bartın en seyrektir (nedeni araştırılmadı); gevşek aralıkta kaldığından sorun sayılmadı.
- Gece kurt ≈ 4–12 dk'da bir (Bolu en sık, 0,25), Bartın'da gündüz 24 başlangıçta hiç kurt görülmedi. Ayı ≈ 12–80 dk'da bir (0,013–0,083); Bolu'da gündüz ormanda en sık.
- Örnek küçüktür (24 × 10 dk): sayılar **yön gösterir**, hassas değildir. `CREATURES` ayarlanmadı; `CreatureSystem.update` ortalama 0,03–0,05 ms (bütçe < 2 ms).

## Elle doğrulama için bırakılanlar

Gerçek FPS, oyun hissi (özellikle **Bolu ve Karabük'te gece soğuğunun zorluğu**, Bolu'nun yapraklı ağaçsız görünümü), yer adı koordinatlarının gerçek yerle örtüşmesi ve yeniden doğmanın Zonguldak'ta kalması: [faz-8-elle-dogrulama.md](faz-8-elle-dogrulama.md) bölüm 10.
