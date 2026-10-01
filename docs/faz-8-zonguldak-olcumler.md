# Faz 8 — Zonguldak ölçüm tabanı (8.0)

Bu belge [ROADMAP.md](../ROADMAP.md) Faz 8 görev **8.0**'ın çıktısıdır: pilot il Zonguldak'ın ölçülmüş "önce" durumu. Sonraki görevler (8.4 denge, 8.6 performans) değişikliklerini bu sayılarla karşılaştırır. **Hiçbir oyun davranışı değişmedi**; yalnızca ölçüm eklendi. Veri: `public/data/world/bati-karadeniz` (Faz 7, değişmedi). Tarih: 2026-10-01.

Yöntem:
- **Arazi / örtü / eğim / su / canlı:** `ZONGULDAK_REPORT=1 npx vitest run tests/zonguldakBaseline.test.ts` (Node, WebGL'siz; tablolar stdout'a yazılır; test her çalıştırmada yapısal sayıları gevşek aralıklarla da denetler). "İl içi" = `provinces.geojson` içindeki **Zonguldak** çokgeni (`provinceAt`), 100 m gerçek hücre çözünürlüğünde (oyunda 2 m). Canlı ölçümü `tests/creatureDensity` ile aynı yöntemdir (4 m/s dalgalı yürüyüş, 100 m içine giren benzersiz canlı; ortak kod `tests/helpers/creatureWalk.ts`), ama başlangıçlar yalnızca Zonguldak ormanından seçilir ve örnek küçüktür (6 başlangıç × 10 dk): sayılar **yön gösterir**, hassas değildir (uzun ölçüm için başlangıç sayısını artır).
- **Draw call / üçgen:** başsız Chromium (yazılımsal WebGL, SwiftShader), dev sunucusunda; betik [faz-7-b-olcumler.md](faz-7-b-olcumler.md) Ek'teki betiktir, yalnızca konum listesi değişti (aşağıdaki tablo). Her konumda 8 yön, en kötü değer. **Gerçek FPS ölçülmedi** (gerçek GPU yok; elle ölçülecek, bkz. ROADMAP Faz 8 "Elle doğrulanacak").

## Özet

| Ölçüt | Değer |
|---|---|
| İl çokgeni alanı | 3174 km² |
| Rakım (ort / medyan / p90 / en yüksek) | 366 / 327 / 709 / 1571 m (il zirvesi (-866, 635) ≈ 1567 m) |
| Eğim ≤ 45° / ≤ 60° (oyun uzayı, ×3,3 dikleşmiş) | %63,0 / %93,2 (medyan 39°) |
| Arazi örtüsü (kara) | orman %85,7, çalı %11,4, yerleşim %1,6, çıplak %0,6, tarım %0,4 |
| Akarsu (il içi) | nehir 227 km, dere 304 km, kanal 0 |
| Durgun su | 21 çokgen, toplam 3,84 km² (3 baraj gölü: Kızılcapınar 1,88, Kozlu 0,64, Gülüç 0,56 km²); 2 kaynak noktası |
| En kötü draw call / üçgen (Zonguldak içi, 9 konum) | **98** (il zirvesi) / **~591 bin** (Devrek) |

Karşılaştırma için: dünya genelinde Faz 7 en kötüsü 176 draw call (Köroğlu, Bolu'da) idi; Zonguldak içinde en kötüsü bunun yarısından az. Üçgen sayısı ise Zonguldak'ta (Devrek ~591 bin) Faz 7'de ölçülen dünya en yüksek değerinin (~538 bin, merkez) üstündedir: Faz 7'de Devrek/Gökçebey/Alaplı konumları ölçülmemişti.

## Arazi (il sınırı içi)

| Rakım bandı | Kara payı |
|---|---|
| 0–50 m | %6,6 |
| 50–200 m | %24,4 |
| 200–500 m | %41,3 |
| 500–1000 m | %26,3 |
| ≥ 1000 m | %1,5 |

| Eğim (oyun uzayı) | Kara payı |
|---|---|
| ≤ 15° | %9,6 |
| ≤ 30° | %31,3 |
| ≤ 45° | %63,0 |
| ≤ 60° | %93,2 |

| Arazi örtüsü | Kara payı |
|---|---|
| orman | %85,7 |
| çalı | %11,4 |
| yerleşim | %1,6 |
| çıplak | %0,6 |
| tarım | %0,4 |
| çayır | %0,1 |
| veri yok | %0,1 |

Yorum: il neredeyse tamamen ormandır (çayır/tarım/sulak alan yok denecek kadar az); ≥ 1000 m yalnızca %1,5 olduğundan Faz 3'te ölçülen "≥ 1500 m tek gecede ölümcül" soğuk bölgesi küçük bir dağ tepesidir. Zonguldak'ın gece soğuğu ve açıklık/yerleşim çeşitliliği (8.4/8.5 için) sınırlıdır; ağırlık orman ve kıyıdadır.

### Bulgu: il çokgeni kıyıdan içeride kalıyor

Heightmap'te deniz 0 m'dir (sözleşme). Zonguldak çokgeninin içinde hiç deniz hücresi yoktur (kara = çokgen alanı), ama çokgen kıyıdan **içeridedir**: sınır kutusu içinde hiçbir ile ait olmayan **763 kara hücresi (7,6 km²) vardır ve 724'ü denize komşudur**. Çokgenin denizle gerçekten buluştuğu kıyı yalnızca ~43 km'dir; ilsiz kıyı şeridi (~72 km) eklendiğinde Zonguldak kıyısı ≈ 115 km civarıdır. Sonuçlar:
- Kıyı şeridinde `provinceAt` **null** döner (deniz gibi): il bildirimi ilk il için sessiz olduğundan zararsızdır, ama "Zonguldak içinde mi?" diye `provinceAt` ile sınırlayan her mantık kıyı şeridini dışarıda bırakır.
- **8.1'i doğrudan etkiler:** yeniden doğma yalnızca `provinceAt === 'Zonguldak'` noktalarını kabul ederse kıyı şeridi hiç seçilmez; 8.1'de "Zonguldak içi" tanımı (çokgen + en yakın il / kıyı tamponu) bilinçli seçilmelidir. `RESPAWN.maxDrift` yorumundaki "il dışına taşmasın" kuralı da bu tanıma bağlıdır.
- Veri/harita genişletme gerektirmez (çözüm kodda: tampon ya da "en yakın il").

## Tatlı su (il çokgeni içi; çizgi bölümleri ortalarından sayılır)

| Tür | Değer |
|---|---|
| Nehir | 227 km |
| Dere | 304 km |
| Kanal | 0 km |
| Göl / gölet / baraj çokgeni | 21 (toplam 3,84 km²) |
| Kaynak noktası | 2 |
| En uzun adlı akarsular | Aydınlar Çayı 65 km, Bolu Çayı 50 km, Filyos Çayı 49 km, Alaplı Çayı 20 km, Devrek Çayı 17 km, Cuma Deresi 15 km |
| En büyük durgun sular | Kızılcapınar Baraj Gölü 1,88 km², Kozlu Baraj Gölü 0,64 km², Gülüç Baraj Gölü 0,56 km², iki adsız baraj (0,38 ve 0,13 km²) |

Yorum: su bol; ama kaynak noktası yalnızca 2 ve göl hemen hiç yok (barajlar var). Suya erişim akarsu kıyılarıdır (erişim 3,5 m, `FRESH_WATER`).

## Canlı yoğunluğu (Zonguldak ormanı, 6 başlangıç × 10 dk)

| Durum | Karşılaşma/dk |
|---|---|
| Orman 50–700 m, gündüz | karaca 0,383, domuz 0,533, kurt 0,000, ayı 0,033 |
| Orman 50–700 m, gece | karaca 0,333, domuz 0,683, kurt 0,250, ayı 0,033 |
| Orman ≥ 700 m, gündüz | ayı 0,083 |
| Bir `CreatureSystem` adımı (ortalama) | 0,02 ms |

Yorum: 6 başlangıçlık örnek gürültülüdür (gündüz av hayvanı ~0,9/dk çıkmıştı); **24 başlangıçlık kesin ölçüm 8.4 bölümündedir** ve hedef aralığındadır.

## Performans (başsız yazılımsal WebGL; gerçek FPS ölçülmedi)

| Konum | konum · çağrı · üçgen · yüklü chunk · çizilen nesne |
|---|---|
| Zonguldak merkez | (-688, -277) · 45 · 425 bin · 288 · 7652 |
| Kozlu | (-763, -257) · 45 · 380 bin · 288 · 7445 |
| Filyos vadisi | (-294, -517) · 36 · 370 bin · 288 · 6849 |
| Karadeniz Ereğli | (-1327, 101) · 63 · 434 bin · 288 · 6855 |
| Alaplı | (-1390, 318) · 76 · 493 bin · 288 · 8966 |
| Çaycuma | (-228, -203) · 49 · 518 bin · 288 · 11783 |
| Devrek | (-422, 251) · 75 · **591 bin** · 288 · 15228 |
| Gökçebey | (-136, 73) · 64 · 575 bin · 288 · 14641 |
| il zirvesi (1567 m) | (-874, 635) · **98** · 563 bin · 288 · 14089 |

- Bütçe (draw call < 300) geniş farkla sağlanıyor; 8.6'daki "tabana göre ≤ +%10 draw call" kriteri bu tablodaki **en kötü 98** değerine göredir.
- Bu ortamda sayfa açılışı ~3,7 sn (Faz 7'de ~1,4–2,2 sn; ölçüm gürültüsü, ağ ve önbelleksiz Vite dönüşümü dahil), JS yığını ~186 MB (tüm konumlar dolaşıldıktan sonra; Faz 7: ~147–152 MB). Konsolda hata yok.
- Başlangıç noktasının CPU hazırlığı (Faz 7: ~0,6 sn) dünya geneli olup bu görevde yeniden ölçülmedi (kod değişmedi).

## Elle doğrulama için bırakılanlar

Gerçek FPS, oyun hissi, ses ve fare kilidi akışı bu ortamda ölçülemez (ROADMAP Faz 8 "Elle doğrulanacak"). Zonguldak'ta en çok dikkat edilecek yerler: **Devrek / Gökçebey** (en çok üçgen, ~14–15 bin nesne) ve **il zirvesi** (en çok draw call).

## 8.4 Ekoloji ve denge turu (2026-10-01)

Test: `tests/zonguldakEcology.test.ts` (su, yiyecek/yakıt, gece soğuğu; `ZONGULDAK_REPORT=1`), canlılar için `ZONGULDAK_STARTS=24 ZONGULDAK_REPORT=1 npx vitest run tests/zonguldakBaseline.test.ts`. (Canlı tablosundaki sayılar; Zonguldak/Karabük/Bartın karşılaştırması için tek seferlik betikle, farklı tohumlarla alındı: komut aynı büyüklükte sayılar verir, birebir aynı değil.) Örnek: pilot ilde rastgele, kara, eğimi ≤ 45° 1500 nokta. **Sonuç: hiçbir ayar değişikliği gerekmedi** (`CREATURES`, `SCATTER`, `CLIMATE`, `SURVIVAL` aynı).

### Canlı yoğunluğu (24 başlangıç × 10 dk; diğer hedef illerle karşılaştırmalı)

| Konum | Gündüz (karaca / domuz / kurt / ayı, /dk) | Gece (karaca / domuz / kurt / ayı, /dk) |
|---|---|---|
| Zonguldak orman 50–700 m | 0,362 / 0,267 / 0,042 / 0,046 | 0,138 / 0,450 / 0,108 / 0,017 |
| Karabük orman 50–700 m | 0,354 / 0,183 / 0,029 / 0,063 | 0,158 / 0,496 / 0,163 / 0,013 |
| Bartın orman 50–700 m | 0,325 / 0,192 / 0,000 / 0,042 | 0,133 / 0,242 / 0,079 / 0,008 |
| Zonguldak orman 400–700 m | 0,250 / 0,233 / 0,029 / 0,029 | — |
| Zonguldak orman ≥ 700 m | 0,308 / 0,279 / 0,017 / 0,050 | — |

- Gündüz av hayvanı (karaca + domuz) Zonguldak'ta ≈ 0,63/dk (≈ 1,6 dk'da bir); Karabük ≈ 0,54, Bartın ≈ 0,52 (Faz 5 hedefi 2–3 dk'da bir; gevşek aralık 0,15–1,5). İlk 6 başlangıçlık ölçümdeki ~0,9 değeri örneklem gürültüsüydü.
- Kurt: gece ≈ 9 dk'da bir, gündüz ≈ 24 dk'da bir (Faz 7 Düzce–Bolu: gece ≈ 7 dk). Ayı: ≈ 20 dk'da bir (hem alçak hem yüksek ormanda; hedef ≈ 20 dk).
- **Karar:** Zonguldak diğer illerle aynı aralıkta; `CREATURES` ayarlanmadı.

### Su erişimi (rastgele yürünebilir kara noktası → en yakın tatlı su)

| Ölçüt | Değer |
|---|---|
| Medyan / p90 uzaklık | 35 / 85 oyun m |
| ≤ 60 m (15 sn yürüyüş) | %73,8 |
| ≤ 120 m (30 sn) | %98,3 |
| ≤ 240 m (60 sn) | %100 |

Susuzluk hareketsiz 12, yürürken ~7,5 dk'da biter; Zonguldak'ta her yerden su ≤ 1 dakikalık yürüyüştür. **Su bir kıtlık kaynağı değildir.**

### Yiyecek ve yakıt (nesne yerleşimi, `scatterChunk`, pilot il içi)

| Tür | Adet | | Ölçüt | Yenebilir bitki | Dal / çalı |
|---|---|---|---|---|---|
| ağaç (yapraklı / iğne yapraklı) | 8062 / 2509 | | Medyan uzaklık | 12 m | 6 m |
| çalı / kaya | 5328 / 397 | | p90 uzaklık | 27 m | 12 m |
| böğürtlen / fındık / kestane / mantar | 694 / 283 / 181 / 593 | | ≤ 60 m (15 sn) | %99,9 | %100 |
| yerde dal / taş | 2105 / 1473 | | | | |

Yenebilir bitki en yakın ~12 m'dedir (≈ 3 sn yürüyüş); bir böğürtlen çalısı 2–5 toplanış × 3 tokluk (~10 tokluk, 1,2 sn). Tokluk hareketle ~19 dk'da biter. Yani **yiyecek, Zonguldak'ta (ve Faz 4 yerleşim kuralıyla her yerde) neredeyse kıtlık yaratmaz**: avlanma zorunlu değildir, yalnızca verimli bir seçenektir (pişmiş et +30 tokluk). Bu bir **tasarım gözlemi**dir: oyun hissi gerçek oyunda elle denenmeden değiştirilmedi. Aday ayar (uygulanmadı): yenebilir bitki yoğunluklarını (`SCATTER.density`) düşürmek ve/veya verimi (`gatherRules`) azaltmak; bu durumda `scatterRegion`, `gatherIntegration`, `huntChain` ve `latticeGolden` (nesne özetleri) testleri yeniden kaydedilmelidir.

### Gece soğuğu (18:00 → 06:00 oyun saati = 12 gerçek dk; su ve tokluk dolu, ateşsiz ve barınaksız)

| Rakım bandı | Rakım | Gece en düşük ortam | Yatarak: en düşük can / ısı | Yürüyerek: en düşük can / ısı |
|---|---|---|---|---|
| medyan | 250 m | 11,7 °C | 100 / 35,4 °C | 100 / 35,9 °C |
| p90 | 622 m | 9,3 °C | 96 / 34,6 °C | 100 / 35,1 °C |
| p99 | 967 m | 7,1 °C | 80 / 33,9 °C | 91 / 34,4 °C |
| en yüksek yürünebilir | 1211 m | 5,5 °C | 64 / 33,4 °C | 78 / 33,9 °C |

Zonguldak'ta (karasının %98,5'i < 1000 m) bir gece hiçbir yerde ölümcül değildir; en kötü durumda can 64'e iner. Soğuk, Zonguldak'ta yalnızca yüksek kesimlerde (≥ 600 m) hissedilir hasar verir. Ateş + barınak etkisi (Faz 4.9) bunu zaten sıfırlar. **Karar:** `CLIMATE` ayarlanmadı (mevsim ve gündüz/gece döngüsü Faz 3'te ölçülmüştü; Zonguldak'ın düşük rakım dağılımıyla uyumlu).

### 8.4 sonucu

Mevcut denge Zonguldak'ta hedef aralıklarda: canlılar (ayı ve kurt dahil) diğer illerle uyumlu, su ve yakıt bol, gece soğuğu yalnızca yüksekte hasarlı. Bilinçli bir tasarım kararı bekleyen tek konu **yiyecek kıtlığının neredeyse olmaması** (yukarıda). Gerçek oyun hissi elle doğrulanmalıdır.
