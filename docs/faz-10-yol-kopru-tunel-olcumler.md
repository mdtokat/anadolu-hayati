# Yol ağı omurgası, köprü türleri, tüneller ve dere yatakları — ölçümler (Faz 10 sonrası, ROADMAP 10.13)

Kullanıcı talimatı: "Her geçişte büyük köprüler var, gereksiz yere göbek, ayrım yapmış yollar var, başı ve sonu bağlantısız yollar var, arka arkaya eklenmiş keskin tepeli köprüler var, yan duran akarsular var. Bunları düzelt. 3-4 farklı yol tipi olsun: şehirleri birbirine bağlayan ana yollar, şehir içindeki yollar, dağlardan giden patika yollar birbirinden farklı olsun. Köprüler bulunduğu yola ve konuma göre 2-3 farklı tipte olabilir. Tünellerle dağların altından geçen yollar olsun. Gereksiz parçalanmış yollar var; yol sayısının aşırı fazla olmasına gerek yok, birbirine bağlantılı olsun ve parça parça olmasın."

Tasarım: `CLAUDE.md` "Yol ağı omurgası, köprü türleri, tüneller ve dere yatakları". Ölçüler `tests/helpers/roadMetrics.ts` ile (aynı yardımcı eski koda da uygulandı); kabul testleri `tests/roadNetworkReal.test.ts`, `tests/roadTunnelsBridges.test.ts`, `tests/settlementWalk.test.ts` (tünelden geçiş). Başsız ortam (yazılımsal WebGL); gerçek GPU'da FPS **ölçülmedi**.

## Sorunların kaynağı

- **Parça parça ağ:** ham veri (OSM türevi) 9 372 çizgidir: çift şeritli yolun iki yönü ayrı çizgi, otoyol kavşak kolları ve göbekler ayrı çizgi, ormandaki sayısız toprak yol. Eski düzen bunları budayıp bağlamaya çalışıyordu; ikizler, halkalar ve kopuk öbekler kalıyordu.
- **Büyük ve arka arkaya köprüler:** köprü, yol suya *yakın* olduğu her yerde kuruluyordu (dereye paralel giden yol boyunca köprü), yakın köprüler 24 m'ye kadar birleşiyordu ve güverte her noktada "zeminin 0,8 m üstü" kuralına uyduğundan dere yatağı üstünde tepe yapıyordu.
- **Yan duran akarsular:** akarsu çizgileri 100 m'lik yükseklik verisiyle tam örtüşmez, dikey ölçek yamaçları ×3,3 dikleştirir; ayrıca yol dolgusu dere yatağını yükseltiyordu: dere yamacın üstünde duruyordu.

## Önce / sonra

| Ölçü | Önce | Sonra |
|---|---|---|
| Yol uzunluğu (oyun m): anayol / tali-köy / patika / kent sokağı | 67 534 / 113 295 / 56 093 / — (sokaklar anayol/tali içinde) | 21 192 / 18 272 / 12 177 / 23 879 |
| Çizgi sayısı | 8 258 | 2 079 |
| Bağlı bileşen (2,7 m değme) | 29 | **1** |
| Yerleşimden/dünya kenarından uzak çıkmaz uç | 151 | **0** |
| Çevresi < 400 m halka (göbek, çatal; sokaklar hariç) | 4 849 | 18 |
| İkiz şerit (kavşaktan uzakta, başka yola < 8 m paralel) | 11 888 m | 90 m |
| Köprü sayısı | 1 472 | 215 |
| Köprü uzunluğu: ortanca / %90 / en uzun (m) | 9,0 / 21 / 119 | 9,0 / 30 / 81 (viyadük) |
| Aynı yolda öncekine < 30 m köprü (arka arkaya) | 315 | 17 |
| Tepeli köprü (güverte, ayaklar arası doğrudan > 1,2 m yukarıda) | 225 | 1 |
| Dere boyunca uzanan köprü | 38 | 4 |
| Köprü türleri | tek tip | beton kiriş 117, taş kemer 56, ahşap 23, viyadük 19 |
| Tünel | 0 | 10 (42–150 m) |
| Yamaçta duran dere örneği (±4 m yan farkı > 1,5 m) | %8,2 (doğal arazi %4,5) | %2,9 |
| Yapı sayısı | 1 881 | 2 268 (yol azaldı, parsel arttı) |
| `SettlementMap` kurulumu (vitest) | ~3,0–4,8 sn | ~3,5–5 sn (ağ ~1,8 sn, kent içi ~1,1 sn) |
| `index.js` (gzip) | 145 kB | 156 kB (bütçe 150 → 175 kB) |
| Tahmini ilk yükleme @ 20 Mbit/s | 8,5 sn | 8,6 sn |
| Draw call | — | +1 (tünel lambaları ayrı ışıklı malzeme) |
| GPU dokusu | 1 kaplama (17,5 MB) | + yol dokusu (17,5 MB) |

Ağ düzeninin sayımları (gerçek dünya): 801 ikiz/kavşak kolu atıldı, 76 anayol bağlantısı (35 il/ilçe merkezi + 4 dünya kenarı çıkışı), 334 yerleşim çizgeden bağlandı, 6 yerleşim A* ile, 243 köye merkez girişi, 37 bileşen birleştirmesi, 65 dağ patikası; bağlanamayan yerleşim 0.

## Görsel doğrulama (başsız Chromium)

Test modunda uçarak alınan görüntülerde: anayol koyu asfalt, beyaz kenar çizgileri ve kesik orta şerit; köy yolu açık, yamalı asfalt; dağ patikası düzensiz kenarlı toprak; kent sokakları parke taşı ve kaldırım, kent içinde bağlı bir ağ; beton kirişli köprü (çelik korkuluk), taş kemer, viyadük; tünel ağzında taş/beton cephe ve koyu açıklık (arazi deliği), oyuncu tünelin içinden yürüyerek geçer (`tests/settlementWalk`). Gerçek ekranda elle değerlendirilecekler: kılavuz bölüm 16.

## Bilinen sınırlar

- Tünel içinde canlı/insan yoktur; tünelin üstündeki canlılar oyuncuyu uzaklık tabanlı algıyla duvar arkasından algılayabilir.
- Uzak LOD'larda (≥ 350 m) ağız deliği yoktur: cephe görünür, açıklığın içi arazidir.
- Serpantin üretilmez; çok dik yerde yol eğimi uçlar arası farkın izin verdiği kadar sınırlanır.
- Köprüde insanlar/canlılar zeminden yürür.
- Kentlerin sokakları kapı → kök en kısa yollarından oluştuğundan çıkmaz sokaklar (kapıya varan) olağandır.
- Düzen değiştiği için eski kayıtlardaki "aranmış yapı" kimlikleri başka yapıyı gösterebilir (daha önce kabul edilmişti).
