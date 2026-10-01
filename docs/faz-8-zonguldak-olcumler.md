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

Yorum: gündüz av hayvanı ~0,9/dk (≈ 1 karşılaşma/ 65 sn; Faz 5 hedefi "2–3 dk'da bir" = 0,33–0,5/dk idi, ve Faz 7 ölçümü eski bölgeye benzerdi): Zonguldak'ta av bolluğu hedefin yaklaşık iki katıdır; küçük örnekten dolayı kesin değildir, 8.4'te daha uzun ölçümle (başlangıç sayısı ↑) doğrulanmalıdır. Gece kurt ~4 dk'da bir, gündüz yok; yüksek ormanda (≥ 700 m) ayı ~12 dk'da bir, alçakta ~30 dk'da bir.

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
