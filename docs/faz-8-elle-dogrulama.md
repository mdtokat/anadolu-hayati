# Faz 8 — Elle doğrulama kılavuzu (Zonguldak)

Bu kılavuz, otomatik testlerin ve başsız tarayıcının **ölçemediği** şeyleri (gerçek FPS, oyun hissi, ses, gerçek fare kilidi) pilot il **Zonguldak** (bölüm 10: diğer 4 il) üzerinde sıraya koyar (bölüm 11: Faz 9 inşa ve ekipman). Faz 2–7'den kalan açık "elle doğrulanacak" kriterlerin hepsi buraya toplandı ([ROADMAP.md](../ROADMAP.md) Faz 8). Her adımın yanında **ne yapılacağı**, **beklenen sonuç** ve **sonucu yazacağın yer** var. Bitirince sonuçları (geçti / kaldı + kısa not) bana ilet; ROADMAP'teki kutuları ben işaretlerim.

Süre: tümü için ~1,5–2 saat; bölümler bağımsızdır, istediğin sırayla ya da yalnızca bir kısmını yapabilirsin.

## 0. Hazırlık

- **Donanım:** gerçek GPU'lu masaüstü (entegre GPU'lu dizüstü de olur: bütçe hedefi orada ≥ 60 FPS, alt sınır 30). Tarayıcı: Chrome (asıl), mümkünse Firefox ve Edge.
- **Çalıştırma:** depoda `npm install` sonra `npm run dev`, adres `http://localhost:5173/` (terminalde yazılan adrese bak; dev sunucusu kökten çalışır, `/anadolu-hayati/` yalnızca derleme/`npm run preview` içindir). Dev modunda ekranın solunda **FPS sayacı** ve **hata ayıklama HUD'u** görünür; ışınlanma tuşları yalnızca dev'dedir (yayındaki Pages sürümünde yoktur).
- **Dev tuşları:**

| Tuş | İş |
|---|---|
| `T` + `1`–`9`, `0` | (`T` basılıyken rakam; Faz 9'dan beri değiştiricisiz rakamlar kısayol çubuğunundur) `TELEPORTS` noktalarına ışınlan (`1` = Zonguldak merkez, `2` Safranbolu, `3` Amasra, `4` Filyos vadisi, `5` Yenice, `6`–`0` Düzce/Bolu/Abant/Yedigöller/Akçakoca) |
| `Shift` + `1`–`9`, `0` | **Bulunduğun ilin yerlerine** ışınlan (il bilinmiyorsa Zonguldak). Zonguldak: `1` Zonguldak merkez, `2` Kozlu, `3` Kilimli, `4` Çatalağzı, `5` Karadeniz Ereğli, `6` Alaplı, `7` Çaycuma, `8` Filyos vadisi, `9` Devrek, `0` Gökçebey. Diğer iller: bölüm 10 |
| `[` / `]` | Saati 1 saat geri / ileri sar (gece/gündüz denemek için) |
| `K` | Canı ve suyu sıfırla (ölüm ekranı ve yeniden doğma denemesi) |
| `P` | Malzeme ver (kamp ateşi, sundurma, 10 dal, 2 kütük) |
| `O` | İnşa denemesi (Faz 9): çalışma tezgâhı, sandık ve ahşap kulübe ver (ağırlık sınırı kadar; kısayola bağlanır) |
| `B`, `V` | İl sınırı çizgileri, kamera (1./3. şahıs) |

- **Konsol:** tarayıcıda `F12` → Konsol. `window.__game` oyun nesnesidir. **Hata sayfası/kırmızı hata** görürsen kopyala; her bölümün sonunda "Konsolda hata var mı?" diye soruyorum.
- **Il zirvesi** (Zonguldak'ın en yüksek yürünebilir yeri, 1567 m) için kısayol yok; konsola yapıştır:
  ```js
  const g = __game; const x = -874, z = 635;
  g.world.prepare(x, z); g.player.teleport({ x, y: g.world.terrain.heightAt(x, z) + 1, z });
  ```

Sonuç kutuları: `[ ]` boş, `[x]` geçti, `[!]` kaldı (not yaz).

## 1. Performans — gerçek FPS (Faz 7 / 6 / 5 / 2 / 1)

**Amaç:** 60 FPS hedefi, 30 FPS alt sınır (bkz. CLAUDE.md "Performans Bütçesi"). Başsız ölçüm (yazılımsal WebGL) Zonguldak içi en kötü **98 draw call / ~591 bin üçgen** verdi; bütçe 300 draw call.

Her konuma ışınlan, **8 yöne** bakarak (fareyi çevir) FPS sayacının en düşük değerini yaz. Kalite ayarı: `Esc` → Ayarlar → Grafik kalitesi (varsayılan **Yüksek**; Faz 6 ön ayarları Düşük/Orta da denensin).

| Konum | Tuş | Neden zor | Yüksek | Orta | Düşük |
|---|---|---|---|---|---|
| Zonguldak merkez | `Shift+1` | kıyı, geniş görüş | ___ FPS | ___ | ___ |
| Devrek | `Shift+9` | en çok üçgen (~591 bin), ~15 bin nesne | ___ | ___ | ___ |
| Gökçebey | `Shift+0` | ~14,6 bin nesne | ___ | ___ | ___ |
| Alaplı | `Shift+6` | ~9 bin nesne, kıyı | ___ | ___ | ___ |
| Il zirvesi | konsol (yukarıda) | en çok draw call (98), tüm dünya görüşte | ___ | ___ | ___ |

- [ ] Yüksek ayarda hiçbir yerde 30 FPS'in altına düşmüyor, çoğu yerde ≥ 60
- [ ] Düşük/Orta ön ayarlar FPS'i gözle görülür artırıyor ve görüntü hâlâ kabul edilebilir _(Faz 6)_
- [ ] Yürürken takılma / kare atlama (stutter) yok, özellikle chunk yüklenirken
- Notlar: ____________________

Sorun çıkarsa ilk hamleler (bende): `SCATTER.drawRadius`/`candidateSpacing`/`maxInstances`, `CHUNK.lodDistances`, `RENDER.maxPixelRatio`, su meshini chunk'lara bölme.

## 2. Arazi, yürüme ve orman hissi (Faz 1 / 2 / 4)

- [ ] **Eğimlerde doğal his** _(Faz 1)_: Devrek–Gökçebey çevresindeki yamaçlarda yürü/koş/zıpla. Yamaca "yapışma", kaygan kayma ya da garip hız kaybı var mı? (Gerçek yamaçlar oyunda ×3,3 dikleşir; 55°'de hız ≈ 2,3 m/s beklenir.)
- [ ] **Orman tanınırlığı** _(Faz 4)_: Zonguldak'ın büyük kısmı ormandır (%86). Ormanlar orman gibi görünüyor mu (ağaç yoğunluğu, çalı, kaya)? Ağaç/çalı çok mu seyrek ya da çok mu sık?
- [ ] **Zemin renkleri:** orman, çalı, yerleşim (Zonguldak merkez, Çaycuma), çıplak/kayalık (Kozlu yamaçları) ayırt ediliyor mu? Yamaçlar gri kayaya mı dönüyor?
- [ ] **Deniz ve kıyı:** `Shift+1` / `Shift+5` kıyıda su düzlemi arazi altında titreşiyor ya da çakışıyor mu (z-fighting)? Denizde yürünebiliyor (tasarım); su şeridi/dere yüzeyi arazi üstünde düzgün mü?
- [ ] **Başlangıç bakışı** _(Faz 8.6)_: **Yeni Oyun**'da ilk kare açık, denizi gören bir manzara mı (kuzeydeki yamaç duvarı yerine)?
- Notlar: ____________________

## 3. Sıfırdan ateş ve barınak zinciri (Faz 4)

Ana menüden **Yeni Oyun** ile başla (gerçek akışı dene, `P` kullanma). Beklenen zincir:

1. [ ] Dal ve çalı topla (`E` basılı), taş al (kaya/yerde taş), yeterli **dal/kabuk/kav** ile **I** → taş balta üret.
2. [ ] Baltayla ağaç kes (`E` basılı), **kütük** al.
3. [ ] **C** ile kamp ateşi hayaleti → sol tık ile kur; yakıt için **E** basılı (dal/kütük at). Ateş yanıyor, ışık ve ısı veriyor mu?
4. [ ] **G** ile sundurma kur. Altında "Barınakta" yazıyor mu?
5. [ ] Zincir kafa karıştırmadan, ipuçlarıyla tamamlanabiliyor mu? Hangi adımda takıldın? ______
- Gece soğuğu: `]` ile saati gece (20:00–06:00) yap, yüksek bir yere (il zirvesi) çık: soğuk hasar veriyor mu, ateş+barınak bunu gideriyor mu? (Ölçülen: Zonguldak'ta yalnızca ≥ 600 m'de hasar; 1211 m'de gece sonunda can ≈ 64.)
- [ ] Toplama süreleri, yakıt süreleri (kamp ateşi ≈ 10 dk), envanter sınırı (20 slot / 25 kg) rahat mı?
- Notlar: ____________________

## 4. Avlanma, tehdit ve denge (Faz 5, 3)

Zonguldak ormanında (ör. Devrek, Gökçebey, Alaplı çevresi) yürü; gündüz ve gece dene.

- [ ] **Sıklık:** gündüz karaca/domuz ≈ 1,5 dakikada bir, gece kurt ≈ 9 dakikada bir, yüksek ormanda ayı ≈ 20 dakikada bir (ölçüm değerleri). Hissedilen sıklık bununla uyumlu mu? Çok mu sık / çok mu seyrek?
- [ ] **Av:** karacayı arkasından yaklaşıp uyarı anında atılarak avlayabiliyor musun? Domuz yumrukla tehlikeli, baltayla/mızrakla yenilir mi? (Taş balta 18, taş mızrak 28 hasar.)
- [ ] **Leş ve pişirme:** `E` basılı → leş kes; ateşte pişir (8 sn/adet); çiğ et riski (−6 can) caydırıcı mı? Pişmiş et (+30 tokluk) ödüllendirici mi?
- [ ] **Ayı ve kurt:** ayı kaçılamaz/yenilemez (tek koruma ateş); kurt sürüsü gece tehlikeli. Ateşin başında ikisi de çekiniyor mu? Ayı tehdidi adil mi (uyarı var mı)?
- [ ] **`E` tuşunun aşırı yüklenmesi** _(Faz 5)_: toplama › leş kesme › pişirme › yakıt › su sırası kafa karıştırıyor mu? Sol tık saldırı / yerleştirme ayrımı sorunsuz mu?
- [ ] **Yiyecek bolluğu (açık tasarım sorusu, 8.4):** yenebilir bitki her yerde ~3 sn yürüyüşte. Oyunda hiç **aç kalıyor** musun, avlanmak gerekli hissediliyor mu? Bitkiler çok mu bol? → Cevabına göre `SCATTER.density`/verim azaltılabilir. Karar: ☐ olduğu gibi kalsın ☐ azaltılsın (ne kadar? ___)
- [ ] **Açlık/susuzluk hızları** _(Faz 3)_: hiçbir şey yapmazsan ~20 dk'da susuzluktan ölürsün; hızlar hâlâ doğru hissettiriyor mu?
- Notlar: ____________________

## 5. Ölüm, yeniden doğma ve il çerçevesi (Faz 8.1–8.3)

- [ ] `K` ile öl → ölüm ekranı → **Yeniden Doğ**: oyuncu **Zonguldak içinde** güvenli bir noktada doğuyor. 5–6 kez öl: her seferinde Zonguldak (kıyı şeridi dahil)? Hiç Bartın/Karabük/Düzce/Bolu'ya doğmuyor mu?
- [ ] Başka ile (ör. `T+7` Bolu merkez, `T+5` Yenice) ışınlanıp `K` ile öl: yine Zonguldak'ta mı doğuyorsun?
- [ ] **Yer adı bildirimi** _(8.3)_: `Shift+2` (Kozlu) … `Shift+0`: ışınlanınca ~2 sn sonra yer adı belirip kayboluyor. Yürüyerek bir yere yaklaşınca da çıkıyor mu? Üst üste binme / çok sık çıkma var mı? Oyun başlangıcında ve yüklemede bildirim yok (doğru).
- [ ] **Il bildirimi:** Zonguldak'tan Karabük/Bartın'a yürürken "…'a girdiniz/hoş geldiniz" çıkıyor.
- [ ] **Işınlanma yerleri** _(8.2)_: 10 yerin her biri gerçekten adıyla örtüşen bir yere (şehir/ilçe merkezine yakın) mi ışınlıyor? Koordinat yaklaşık; yanlış/yanıltıcı olan: ____________________
- Notlar: ____________________

## 6. İpuçları (Faz 8.5)

Ana menüden Yeni Oyun ile başla; **hiçbir şeye dokunmadan** ilk dakikaları izle.

- [ ] ~4 sn sonra kontrol özeti çıkıyor (W A S D, fare, Shift, Boşluk, I, E).
- [ ] Susuzluk/açlık < %65 olunca su ve yiyecek ipucu çıkıyor; gece ateş, ateş kurunca barınak, yakında karaca/domuz varken av ipucu çıkıyor.
- [ ] İpuçları arasında ~20 sn var; üst üste binmiyor, sinir bozmuyor; her biri **bir kez**.
- [ ] Metinler anlaşılır, doğru tuşları söylüyor.
- [ ] `Esc` → Ayarlar → **İpuçları: Kapalı** ipuçlarını durduruyor; Yeni Oyun görülenleri sıfırlıyor, Devam/yükleme sıfırlamıyor.
- Notlar: ____________________

## 7. Ortam sesleri (Faz 6)

Hoparlör/kulaklıkla dinle; ses seviyesi `Esc` → Ayarlar → Ses.

- [ ] **Deniz** (`Shift+1`, `Shift+5` kıyıda): dalga sesi doğal mı, kıyıdan uzaklaşınca azalıyor mu?
- [ ] **Rüzgâr:** yüksek yerlerde (il zirvesi) artıyor, ormanda boğuluyor, sundurma altında azalıyor mu?
- [ ] **Orman:** yaprak hışırtısı ve gündüz kuşlar; **gece:** cırcır böceği ve ormanda baykuş. Doğal mı, tekrarlayan/rahatsız edici mi?
- [ ] **Katman dengesi:** hiçbir katman diğerini bastırmıyor, kırpılma/çatlama yok; ses 0 iken tam sessiz. Ayarlanacaksa: `AMBIENT`, `audio/ambientGraph.ts` `MIX`. Not: ____________________
- [ ] Oyunu duraklatınca (Esc) sesler kesiliyor, devamında geri geliyor.

## 8. Menü, kayıt ve fare kilidi (Faz 6)

Chrome, Firefox ve Edge'de ayrı ayrı (en azından Chrome).

- [ ] Ana menü: Devam / Yeni Oyun / Yükle / Ayarlar / Krediler; oyuna girince fare kilitleniyor.
- [ ] `Esc` → duraklatma menüsü; **Devam Et** fareyi geri kilitliyor (Chrome Esc'ten hemen sonra kilidi geri vermeyebilir: menüde ipucu var). Dış alana tıklayınca oyuna dönüyor.
- [ ] **Kaydet** (yuva 1) → bir şey değiştir (envanter, konum) → **Yükle**: durum birebir geri geliyor; sekmeyi yenileyip **Devam**: otomatik kayıttan açılıyor.
- [ ] Yeni Oyun, ilerleme varken iki adımlı onay istiyor; yuvada üzerine yazma/silme iki adımlı.
- [ ] Krediler ekranı atıfları gösteriyor.
- Tarayıcı / sonuç: Chrome ___ Firefox ___ Edge ___

## 9. Genel

- [ ] 20–30 dakikalık kesintisiz oyun: bellek şişmesi/yavaşlama yok (Görev Yöneticisi / Chrome `Shift+Esc`), sekme çökmüyor.
- [ ] Konsolda kırmızı hata yok (her bölümde).
- [ ] İlk yükleme < 10 sn (önbelleksiz).
- En çok rahatsız eden 3 şey: 1. ____________ 2. ____________ 3. ____________
- En iyi hissettiren: ____________________

## 10. Diğer iller: Bartın, Karabük, Düzce, Bolu (Faz 8'in genişletilmesi)

Zonguldak'ta yapılan yer adı/ışınlanma, yer adı bildirimi ve ekoloji ölçümü diğer 4 ile de uygulandı ([faz-8-iller-olcumler.md](faz-8-iller-olcumler.md)). **Yeniden doğma ve yeni oyun başlangıcı yine yalnızca Zonguldak'tadır** (pilot il kararı değişmedi). `Shift + 1–9, 0`, **bulunduğun ilin** yerlerine ışınlar: önce o ile `T` + `1`–`9`/`0` ile git, sonra `Shift`'li tuşları kullan.

| Tuş | Bartın | Karabük | Düzce | Bolu |
|---|---|---|---|---|
| `Shift+1` | Bartın merkez | Karabük merkez | Düzce merkez | Bolu merkez |
| `Shift+2` | Amasra | Safranbolu | Akçakoca | Abant Gölü |
| `Shift+3` | Kurucaşile | Yenice | Gölyaka | Yedigöller |
| `Shift+4` | Ulus | Eskipazar | Cumayeri | Mudurnu |
| `Shift+5` | Kozcağız | Eflani | Kaynaşlı | Göynük |
| `Shift+6` | Güzelcehisar | Ovacık | Yığılca | Mengen |
| `Shift+7` | Çaylıoğlu | Yörük köyü | Çilimli | Gerede |
| `Shift+8` | Bartın Irmağı | Soğanlı | Gümüşova | Seben |
| `Shift+9` | — | — | Efteni Gölü | Yeniçağa |
| `Shift+0` | — | — | — | Kıbrıscık |

- [ ] **Yer örtüşmesi:** her yer adıyla örtüşen bir yere (ilçe/yer merkezine yakın) ışınlıyor mu? Koordinatlar yaklaşıktır, özellikle **Çaylıoğlu, Bartın Irmağı, Yörük köyü, Soğanlı** gibi belirsiz adlar için dikkat et. Yanlış/yanıltıcı olanlar: ____________________
- [ ] **Yer adı bildirimi:** ışınlanınca ~2 sn sonra yer adı çıkıyor; il bildirimiyle üst üste binmiyor.
- [ ] **Yeniden doğma:** Bolu'da (`T+7`) `K` ile öl → yine Zonguldak'ta mı doğuyorsun? (Beklenen: evet.)
- [ ] **Gece soğuğu** (`]` ile saati gece yap, ateşsiz): **Karabük ve Bolu yüksektir** (medyan rakım ≈ 930 m / ≈ 1160 m); Zonguldak'ta yalnızca ≥ 600 m'de hasar varken burada medyan yerde de can kaybı olur (Bolu'da bir gece sonunda ≈ 68, en yüksek yerde ≈ 1). Ateş + barınak gerçekten gerekli hissettiriyor mu? Çok mu zorlayıcı? (Karar: ☐ olduğu gibi ☐ `CLIMATE` hafifletilsin.)
- [ ] **Bolu yaylası:** yürürken ağaç yoğunluğu düşük (yapraklı ağaç az, iğne yapraklı baskın; çalı %24 ve tarım %10). Hâlâ orman gibi hissediyor mu? Yenebilir bitki biraz daha seyrek (medyan ≈ 19 m): rahatsız ediyor mu?
- [ ] **Performans:** Bolu'daki Köroğlu zirvesi (Faz 7: en kötü 176 draw call) ve Abant/Yedigöller çevresinde FPS (bölüm 1 tablosuna ekle). Faz 7 elle doğrulama borcu burada: ___ FPS
- Notlar: ____________________

## Sonuçları iletme

Doldurduğun kutuları ve notları (ör. "FPS tablosu şöyle, 4. bölümde yiyecek çok bol, azalt") mesaj olarak yaz. Ben: geçenleri ROADMAP'te `[x]` yaparım, kalanları ayrı alt görevlere bölerim (ayar değişikliği gerekiyorsa ilgili testleri yeniden çalıştırıp kaydederim).

## 11. İnşa, ekipman ve kısayol çubuğu (Faz 9)

Dev tuşu `O` tezgâh, sandık ve kulübe verir (kısayola bağlar); `P` ateş/sundurma + dal/kütük verir. Gerçek akışı da dene: taş balta → tezgâh (her yerde) → tezgâhın yanında sandık, kulübe, kürk pelerin.

- [ ] **Kısayol çubuğu** (ekranın altı, 1–8): envanterde (`I`) eşyayı seç → "Kısayol: 1…8" ile bağla. Rakama basınca silah elde kalıyor mu ("Elde: Taş Mızrak")? Yiyecek tuşu bir tane yiyor mu? Aynı tuşa tekrar basmak eli boşaltıyor mu? Fare tekerleği seçimi kaydırıyor mu (dokunmatik yüzeyde çok hızlı mı)?
- [ ] **Silah seçimi:** elde mızrak / balta / bıçak varken sol tık gerçekten o silahla mı vuruyor (menzil, hız farkı hissediliyor mu)? El boşken en iyi silah kullanılır (eski davranış) — kafa karıştırıyor mu?
- [ ] **Yerleştirme:** kısayoldan yapı seçince hayalet açılıyor; `R` 90° döndürüyor; sol tık kuruyor, kurulunca el boşalıyor. Kulübe 4,6 m ileriye konuyor: kurarken oyuncu duvarın içinde kalmıyor mu?
- [ ] **Kulübe:** kapıdan rahat giriliyor mu (1,2 m)? Duvarlar oyuncuyu durduruyor mu (yamaçta duvar altında boşluk / havada kalan köşe var mı)? İçeride HUD "Kulübede" diyor mu; soğuk gecede (`]`) vücut ısısı sundurmadakinden iyi mi? Düz yer bulmak çok mu zor (kara alanının ≈ %21'i uygun)?
- [ ] **Sandık:** `E` ile açılıyor; tıklayınca yığın karşı tarafa geçiyor; "Hepsini koy / al" çalışıyor; kaydedip yükleyince içerik duruyor mu?
- [ ] **Tezgâh:** yanındayken (`I`) "Yakında: Çalışma Tezgâhı" yazıyor ve sandık/kulübe/pelerin üretilebiliyor; uzaklaşınca "Çalışma Tezgâhı yanında üretilir".
- [ ] **Sökme:** yapıya bakıp `X` basılı tut (1,2 sn): yapı eşya olarak geri geliyor (kamp ateşinden yalnızca 4 taş); dolu sandık sökülmüyor ("Önce sandık boşaltılmalı").
- [ ] **Meşale:** gece elde (kısayolda seçili) meşale çevreyi yeterince aydınlatıyor mu? FPS etkisi: ___
- [ ] **Kürk pelerin:** Bolu/Karabük yükseklerinde (`T+7`) ateşsiz bir gecede fark ediliyor mu (+2,5 °C)?
- Notlar: ____________________

## 12. Yerleşimler, yollar, insanlar ve kültür (Faz 10)

Dev tuşları: `T` + rakam ve `Shift` + rakam ile il/ilçe merkezlerine ışınlan (Zonguldak `Shift+1`, Safranbolu `T+2`, Bolu `T+7`, Düzce `T+6`). `L` kiler erzakı ve bakır tencere verir, `N` önüne bir yolcu çıkarır.

- [ ] **Gerçeğe benzerlik:** Safranbolu'da büyük cami, Cinci Hanı, hamam, saat kulesi ve konaklar bir arada mı (çarşı hissi)? Zonguldak'ta yamaca tırmanan apartmanlar, maden kuyusu kulesi, Uzun Mehmet anıtı? Bolu'da Yıldırım Bayezid Camii ve Taşhan? Hangisi yanlış/eksik: ____________________
- [ ] **Ölçek:** Kasabalar bilinçli olarak büyütüldü ama yine de küçük (il merkezi 25–70 yapı). Yeterince "şehir" hissi veriyor mu? (Karar: ☐ olduğu gibi ☐ `SETTLEMENT_LAYOUT.footprintScale` büyütülsün)
- [ ] **Yamaç:** evler yamaca gömülü, kapıları aşağı bakıyor; altta taş temel. Havada kalan ya da toprağa batmış (içine girilen) yapı var mı? Nerede: ____________________
- [ ] **Camiler:** kıbleye (güneydoğu, pusulada "Kıble") dönük mü? Merdivenden çıkıp harime girebiliyor musun? İçeride HUD "Camide" diyor, gece kurtlar yaklaşmıyor mu?
- [ ] **Terk edilmişlik:** yıkık çatısız evler, kararmış/tahtalanmış pencereler, inik kepenkler yeterince ıssız hissettiriyor mu?
- [ ] **Yollar:** şehirleri bağlıyor mu? Yamaçta yolun arazinin içine gömüldüğü ya da havada kaldığı yer var mı? Renkleri/genişlikleri doğal mı? Kent içinde sokak ızgarası okunuyor mu?
- [ ] **Arama:** ev/dükkân/apartman kapısında `E` basılı (3 sn) → "Bulundu: …" ya da "Boş çıktı". Ganimet miktarı (yiyecek kıtlığı helal kuralıyla dengelendi mi?): ☐ az ☐ uygun ☐ çok
- [ ] **Türk mutfağı:** bakır tencere varken ateşte tarhana çorbası / bulgur pilavı / kuru fasulye / demli çay pişiyor mu (`E` basılı)?
- [ ] **Çeşmeler:** cami avlusundaki ve meydandaki çeşmeden `E` ile su içilip kap doldurulabiliyor mu?
- [ ] **İnsanlar:** yol kenarında beklerken ~20 dk'da bir kişi çıkıyor mu (dev: `N`)? Yaklaşıp selam veriyor mu, konuşma paneli (rakam tuşlarıyla) rahat mı, tarif ettiği yön doğru mu, takaslar makul mü?
- [ ] **Helal/haram:** yaban domuzu leşi "necistir, kesilmez" diyor; kurt/ayıdan yalnızca deri ve kemik; karaca kesilince "Bismillah" ipucu. Kültürel olarak doğru ve saygılı mı?
- [ ] **Vakitler:** saat kartında Miladî + Hicrî tarih ve sonraki vakit; `]` ile saati ilerletince "Öğle/İkindi/Akşam/Yatsı/İmsak vakti girdi" bildirimi geliyor mu?
- [ ] **Performans:** Safranbolu, Düzce ve Karabük merkezlerinde FPS (başsız ölçümde en kötü 240 draw call): ___ FPS
- Notlar: ____________________

## 13. Modüler inşa, test modu ve şehir merkezi başlangıcı (Faz 10 sonrası)

**Test modu:** Esc → Ayarlar → "Test modu: Açık" (varsayılan kapalı; sol üstte "Test modu" rozeti). Uçmak için Boşluk'a çift bas; Boşluk yukarı, `Z` aşağı, Shift hızlı. Üretim, malzeme/alet/tezgâh istemez ve girdi tüketmez (envanter panelinde bütün tarifler "hazır"); yapı yerleştirmek eşya harcamaz (parçayı bir kez üretip kısayola bağla, art arda kur); ağaç/kaya/dal tükenmez.

- [ ] **Test modu aç/kapa:** Ayarlar'dan kapatınca uçuş kapanıyor, malzeme gereksinimi geri geliyor, rozet kayboluyor mu? Kaydedip yükleyince ayar korunuyor mu?
- [ ] **Uçuş hissi:** çift Boşluk ile uçuş açılıp kapanıyor mu (yanlışlıkla tetiklenme: hızlı zıplarken)? Hızlar (12 m/s, Shift 40 m/s, dikey 9) uygun mu? Zemine/duvara çarpıyor mu? Hız ayarı: ☐ olur ☐ `TEST_MODE.flight` değişsin
- [ ] **Taban:** tezgâhta üret → kısayola bağlı gelir → hayalet 2 m'lik ızgaraya yapışıyor; komşu tabanla aynı yükseklikte kuruluyor; eğimli yerde "Zemin çok dik" diyor, kenarda zemin tabanın altında kalırsa toprak tonlu etek boşluğu kapatıyor mu? Taban üstüne yürümek (autostep 0,4 m) rahat mı, yamaçta taban zemine göre çok yükseğe çıkarsa girişi imkânsız mı olur?
- [ ] **Duvar / kapılı / pencereli:** hayalet bakış noktasına en yakın taban kenarına yapışıyor; destek yoksa "Destek yok…"; dolu kenara kurulmuyor ("Burası dolu"); `R` iç-dış yüzü çeviriyor; oyuncu duvarın içindeyken kurulmuyor mu? Çok katlı: çatı plakasının kenarına duvar kurulabiliyor mu (yukarı bakarak)?
- [ ] **Çatı:** duvarların üstüne bir kat yukarı oturuyor, komşu çatıyla uzuyor; üst katın zemini olarak yürünebiliyor mu?
- [ ] **Kapı:** kapılı duvara kapı kuruluyor; `E` (bas) açıyor/kapatıyor, açıkken geçilebiliyor, kapalıyken durduruyor; menteşe yanı `R` ile değişiyor; kayıt/yükleme durumu koruyor mu?
- [ ] **Barınak:** çatılı ve çevresi kapalı odada HUD "Kulübede" (en çok 1 açıklık serbest; açık kapı bir açıklıktır); çatılı ama açık yerde "Barınakta"; gece soğuğunda fark ediliyor mu?
- [ ] **Sökme:** `X` basılı parçayı geri veriyor; plaka üstündeyken duvara bakınca duvar seçiliyor mu? **Bilinen sınırlama:** destek parçası sökülünce üstündekiler havada kalır.
- [ ] **Ateş/tezgâh/sandık tabanın üstüne** kurulabiliyor mu (tabanın üst yüzüne oturuyor mu)? Kulübe/sundurma taban üstüne kurulamıyor.
- [ ] **Şehir merkezi başlangıcı:** Yeni Oyun ve ölüm sonrası "Yeniden Doğ" farklı il/ilçe merkezlerinde (konsolda "Başlangıç: …"), bina dışında ve duvara bakmadan başlıyor mu? 10 denemede çeşitlilik: ___ farklı yer
- Notlar: ____________________

## 14. Grafik düzenlemesi: yollar, sular, yapılar, ağaçlar (Faz 10 sonrası)

Yollar, akarsular, kıyı bantları ve il sınırları artık arazinin kendi shader'ında boyanıyor; yapılar ve ağaçlar birbirine girmeyecek biçimde eleniyor (`CLAUDE.md` "Grafik düzenlemesi"). Kontrol için: Zonguldak merkez (`Shift+1`), Safranbolu (`T+2`), Yenice (`T+5`, vadi yolu ve ırmak), Bolu (`T+7`), Abant (`T+8`, il sınırı ve toprak yol). Test modunda uçarak yukarıdan bakmak karşılaştırmayı kolaylaştırır.

- [ ] **Yollar:** yamaçta havada kalan ya da araziye gömülen yol kaldı mı? Asfalt (koyu, banketli, soluk kenar çizgili) ve köy yolu (toprak) ayırt ediliyor mu? Uzakta yollar titreşiyor/kayboluyor mu? Nerede: ____________________
- [ ] **Akarsu ve yol:** vadilerde yol ırmağın üstüne biniyor mu, yoksa yanında mı akıyor? Geçişlerde köprü korkuluğu (yol kenarında açık taş şerit) görünüyor mu?
- [ ] **Su görünümü:** ırmaklar sudan çok "mavi boya" gibi mi görünüyor? Güneşte parlıyor, yavaş dalgalanıyor mu? Kıyıdaki ıslak toprak bandı doğal mı?
- [ ] **Yapılar:** komşu iki yapının saçağı/duvarı iç içe giriyor mu? Kapı merdiveni başka yapıya ya da suya iniyor mu? Sokak/yol bir yapının içinden geçiyor mu? Nerede: ____________________
- [ ] **Ağaçlar ve kayalar:** bir ağacın tacı binanın içinden ya da yolun üstünden çıkıyor mu? Yol kenarındaki ağaçsız şerit fazla geniş mi? (☐ uygun ☐ `SCATTER.blockRadiusFactor` küçülsün)
- [ ] **İl sınırı:** iller arasındaki sarı şerit zeminde okunuyor mu, deniz kıyısı boyunca çizgi yok mu? `B` açıp kapatıyor mu?
- [ ] **Renkler:** dik yamaçlar hâlâ çok mu gri? Kent içi zemin (toprak-yeşil) asfalttan ayırt ediliyor mu?
- [ ] **Yakın plan:** dik yamaçta çok yakından bakınca yol/su kenarı basamaklı görünüyor mu (bilinen sınırlama: 2 m hücre)? Rahatsız edici mi: ☐ hayır ☐ evet
- [ ] **Performans:** Safranbolu, Bolu, Yenice'de FPS (yol mesh'leri kalktı, draw call azaldı; arazi shader'ı biraz ağırlaştı): ___ FPS
- Notlar: ____________________

## 15. Yol ağı, zemin düzeltme ve köprüler (Faz 10 sonrası)

Yollar zemine uydurulur (kazı/dolgu terası), yumuşatılır, dere geçişlerinde köprü olur, çıkmaz/kopuk yol budanır ya da bağlanır; kırsalda tali yol patikaya iner; kent sokakları yalnız yapılı bloklarda ve ağa bağlı çizilir; dik yamaçlarda yapılar terasa oturur (`CLAUDE.md` "Yol ağı ve zemin düzeltmesi", ölçümler [faz-10-yol-agi-olcumler.md](faz-10-yol-agi-olcumler.md)). Kontrol için test modunda uçarak yukarıdan bakın; konumlar: Düzce, Bolu, Zonguldak, Safranbolu, Karabük, Bartın (`T` + rakam / `Shift` + rakam ışınlanması, bkz. bölüm 14).

- [ ] **Zemin yola uygun mu?** Ana yolda ve köy yolunda yürürken yol yatay (enine) eğimsiz, düz bir teras gibi mi? Yamaçta yolun iki yanında doğal bir şev/kazı görünüyor mu, yoksa yapay basamak/yarık mı? Nerede: ____________________
- [ ] **Dağ patikaları:** dik dağ yamaçlarında patikalar zemini izliyor (düzeltilmiyor) mu? Bu doğal görünüyor mu?
- [ ] **Düzgünlük:** yollarda dalga, testere dişi ya da keskin köşe kaldı mı? (Kavşaklarda köşe olması doğal.) Nerede: ____________________
- [ ] **Eğim:** anayolda uzun, çok dik (≈ 20°+) yokuş kaldı mı? Tali yol/patikada yürümek zor mu? Dik yerler kabul edilebilir mi? (Bilinen sınır: tünel ve serpantin yok.)
- [ ] **Köprüler:** dere/akarsu geçişlerinde ana yolda daha geniş, patikada dar köprü görünüyor mu? Köprüden yürünüyor mu (korkuluk çarpıyor, güverte düz, kıyıda basamak yok)? Köprü altından geçilebiliyor mu? Çok sık/yan yana küçük köprü kümesi (Bolu merkezi) rahatsız ediyor mu?
- [ ] **Viyadük:** derin vadi geçişlerinde ayaklı köprü görünüyor mu, ayaklar zemine oturuyor mu?
- [ ] **Bağlantı:** hiçbir yere varmayan çıkmaz yol ya da tek başına duran yol parçası görüyor musunuz? Her köy/ilçe bir yola bağlı mı? Nerede: ____________________
- [ ] **Hiyerarşi:** şehirler arası anayol geniş asfalt, kırsal tali yol/patika toprak mı? Kent merkezinde ana cadde + yan sokaklar ayırt ediliyor mu?
- [ ] **"Yalnız yol" yerleri:** il/ilçe çevresinde aralarında bina olmayan, yollarla dolu boş alan kaldı mı? Kent sokakları yapısız yerde bitiyor mu? Nerede: ____________________
- [ ] **Yapı terasları:** dik yamaç kasabalarında (Zonguldak, Kozlu, Karabük) yapılar düz teraslara oturuyor mu? Havada kalan ya da yarıya gömülen yapı var mı?
- [ ] **Nesneler:** ağaç/kaya yol kenarında düzgün (yolun üstünde değil, kazı şevinde asılı değil) mi?
- [ ] **Yükleme süresi:** oyun açılışı önceki fazlara göre belirgin yavaşladı mı (düzen ≈ +2,5 sn)? ___ sn
- [ ] **Performans:** Düzce, Bolu, Safranbolu'da FPS: ___ (köprü çizimi tek draw call)
- Notlar: ____________________

## 16. Yol ağı omurgası, köprü türleri, tüneller ve dere yatakları (Faz 10 sonrası, ROADMAP 10.13)

Yol ağı artık il/ilçe merkezlerini ve köyleri bağlayan seyrek, tek parça bir omurgadır; dört yol tipi ayrı görünür; köprüler yalnız dere geçişlerinde ve kısadır, dört türü vardır; anayol ve köy yolu derin sırtların altından tünelle geçer; dereler oyulmuş yataklarında akar (`CLAUDE.md` "Yol ağı omurgası", ölçümler [faz-10-yol-kopru-tunel-olcumler.md](faz-10-yol-kopru-tunel-olcumler.md)). Kontrol için test modunda uçarak bakın; Düzce, Bolu, Gerede, Çaycuma, Bartın ve Karabük çevresi iyi örneklerdir.

- [ ] **Parça parça yol kaldı mı?** Hiçbir yere varmayan kısa yol, ortada biten yol ya da tek başına duran parça görüyor musunuz? Nerede: ____________________
- [ ] **Göbek / ayrım:** anayolda birbirine paralel ikiz yol, ayrılıp yeniden birleşen çatal ya da küçük halka kaldı mı? Nerede: ____________________
- [ ] **Yol sayısı:** ağ fazla seyrek mi (köyler arası yol yok hissi) yoksa yeterli mi? Her köye bir yol varıyor mu?
- [ ] **Dört yol tipi:** şehirlerarası anayol (koyu asfalt, kenar çizgileri, kesik orta şerit), köy yolu (açık, yamalı asfalt), dağ patikası (toprak, düzensiz kenar), kent sokağı (parke taşı + kaldırım) birbirinden kolayca ayırt ediliyor mu? Orta şerit kesikleri düzgün mü?
- [ ] **Kent içi:** il/ilçe merkezinde sokaklar birbirine ve kente giren yollara bağlı mı; sokaklar yapıların kapılarına gidiyor mu? Ana cadde geniş görünüyor mu?
- [ ] **Köprüler:** her dere geçişinde dev köprü hissi kalktı mı? Köprüler kısa ve düz (tepe yok) mü? Arka arkaya köprü kaldı mı? Nerede: ____________________
- [ ] **Köprü türleri:** anayolda beton kirişli köprü (çelik korkuluk) ve yüksek ayaklı viyadük, köy yolunda taş kemer (kemerin altı boş), patikada ahşap köprü (dikmeli trabzan) görünüyor mu? Türler bulunduğu yere yakışıyor mu?
- [ ] **Tüneller:** dağın içine giren tünel ağzı (taş/beton cephe, koyu açıklık) doğal görünüyor mu? Tünelden yürüyerek/uçarak geçilebiliyor mu; içeride lambalar, duvarlar ve zemin var mı; çıkışta takılma var mı? Üçüncü şahıs kamerada tünel içi görüntü kabul edilebilir mi? Tüneller: ____________________
- [ ] **Dereler:** dere ve nehirler yamaçta "yan duran" bir şerit değil, kendi yatağında mı akıyor? Yol kenarında dere yatağı yol dolgusuyla kapanmış mı?
- [ ] **Uzaktan bakış:** 350 m'den uzakta tünel ağzının içi arazi görünüyor (bilinen sınır); rahatsız edici mi?
- [ ] **Yükleme süresi ve FPS:** açılış önceki sürüme göre belirgin yavaşladı mı? ___ sn; tünel/köprü yakınında FPS: ___
- Notlar: ____________________

---

## 17. Bina içleri, sandık/dolap ganimeti, camiler, şadırvan, namaz ve üretim paneli (Faz 10 sonrası, ROADMAP 10.14)

Konutlar (ev, konak, apartman zemin katı, maden lojmanı), dükkânlar, kahvehane, hükümet konağı, hamam, han ve camiler artık içine girilebilir; içeride sandık ve dolaplar `E` basılı tutularak aranır. Camiler azaldı ve aralıklı; önlerinde şadırvan var; camide vakit namazı sağlık verir (vakit başına bir kez). Envanterin üretim listesinde süzgeç ve adet girişi var. Ayrıntı `CLAUDE.md` "Bina içleri, camiler ve üretim paneli".

- [ ] **Kapıdan giriş:** evin/konağın/dükkânın kapısından takılmadan girilebiliyor mu? Merdivenli kapılarda (yamaç) çıkış rahat mı? Kapı boşluğu dar geliyor mu?
- [ ] **İç mekân görünümü:** sıva, döşeme, kirişler, içten pencereler, sedir/kilim/ocak (ev), masalar ve semaver (kahvehane), raflar ve tezgâh (dükkân), göbek taşı ve kurnalar (hamam) yerinde ve inandırıcı mı? Arazi döşemenin içinden çıkan yer var mı? Nerede: ____________________
- [ ] **Kamera:** üçüncü şahıs kamerada oda içi kabul edilebilir mi (kamera duvarın dışına çıkıyor mu)? Birinci şahısta sorun var mı?
- [ ] **Sandık/dolap arama:** sandığa/dolaba bakınca "E (basılı tut): Sandık ara" çıkıyor mu; 1,6 sn sonra ganimet geliyor, kap "arandı, içi boş" oluyor mu? Kayıt/yükleme sonrası aranmış kaplar boş kalıyor mu?
- [ ] **Ganimet dengesi:** bina başına ganimet (yiyecek dolapta, alet/silah sandıkta) çok mu cömert, çok mu cimri?
- [ ] **Uzaktan görünüm:** ~70 m'den uzakta iç mekân çizilmez; kapı boşlukları karanlık görünür. Yaklaşırken iç mekânın "belirmesi" rahatsız edici mi?
- [ ] **Cami sayısı ve aralığı:** kasabalarda cami sayısı makul mü; yan yana cami kaldı mı? Nerede: ____________________
- [ ] **Şadırvan:** caminin önünde (merdivenin ötesinde ya da yanında) şadırvan duruyor mu; yanında `E` ile su içilebiliyor mu?
- [ ] **Cami içi:** mihrap (kıble duvarında), minber, halı ve saf çizgileri, avize, içten görünen kubbe doğru mu; kubbe çevresinde gökyüzü görünen yarık var mı?
- [ ] **Namaz:** vakit içindeyken harimde "E (basılı tut): Öğle namazını kıl" çıkıyor, 6 sn sonra sağlık +15 oluyor mu? Aynı vakitte ikinci kez kılınamıyor, sonraki vakitte yeniden kılınabiliyor mu? Güneş doğuşu–öğle arası "Namaz vakti değil" diyor mu?
- [ ] **Üretim paneli:** Tümü/Silah/Alet/Yapı/Gıda/Malzeme sekmeleri doğru tarifleri gösteriyor mu? Bir tarif üretince liste başa atmıyor mu? Adet kutusu ve "En çok" düğmesi çalışıyor mu (malzeme yetene kadar üretir)?
- [ ] **Ağaçlar ve yapılar:** yapraklı ağaçların dalları/kök genişlemesi, çam katları, kayalardaki yosun, kamp ateşi odunları/közleri, sundurma sırıkları, tezgâh aletleri, kulübe mahyası güzel görünüyor mu?
- [ ] **FPS:** kasaba içinde (iç mekân kademesi açıkken) ve ormanda FPS: ___
- Notlar: ____________________

---

## 18. Alışveriş, satıcılar ve tapu (Faz 11 sonrası)

İl ve ilçe merkezlerinde dükkân kapılarının önünde esnaf (bakkal, nalbur, yapı ustası, av bayii) durur; `E` ile dükkân paneli açılır. Yerleşim yapılarının kapısına bakınca `E` ile tapu alınır; tapulu yapının içine sandık/tezgâh kurulur, yanına ek yapılır. Ayrıntı `CLAUDE.md` "Alışveriş, satıcılar ve tapu" ve ROADMAP "Faz 11 sonrası". Hızlı deneme için geliştirme modunda `Shift` + `M` cüzdana 1000 ₺ ekler.

- [ ] **Satıcıyı bulma:** il/ilçe merkezinde (ör. Devrek, Safranbolu, Bolu) dükkânların önünde önlüklü esnaf görünüyor mu; yaklaşınca size dönüyor, "E: Bakkal … · alışveriş" ipucu çıkıyor mu? Merdivenin, yolun ya da başka yapının içinde duran satıcı var mı? Nerede: ____________________
- [ ] **Dükkân paneli:** satın al listesi, fiyatlar, adet kutusu, "En çok" ve "Al" çalışıyor mu? Para ya da yer yetmeyince düğme sönük ve nedeni yazıyor mu? Sağda eşyaya tıklayınca satış teklifi (uzmanlık alanında daha iyi fiyat) doğru mu?
- [ ] **Satış:** av ürünlerini (deri, et) av bayiine/bakkala, aramada bulunan eşyaları satarak para kazanmak makul hızda mı? Hangi eşya fazla ucuz/pahalı: ____________________
- [ ] **Yapı ustası:** kulübe, sandık, tezgâh, ocak, çit ve modüler parçaların hepsi satılıyor mu? Alınan yapı kısayola bağlanıp kurulabiliyor mu?
- [ ] **Aramada para:** sandık/dolap ve dükkân kasalarından para çıkıyor mu ("+35 ₺")? Miktar dengeli mi?
- [ ] **Tapu:** evin kapısına bakınca "E: Tapu — Ev (Devrek) · 900 ₺" çıkıyor mu? Satın alma ve iki adımlı geri satış çalışıyor mu? Cami, türbe, çeşme için tapu ipucu çıkmıyor mu?
- [ ] **İçine sandık:** tapulu evin içinde sandık/tezgâh/döşek döşemeye oturuyor mu (havada/gömülü değil)? Duvara, dolaba çok yakın kurulamıyor mu? Başkasının evinde "Bu yapı senin değil" diyor mu?
- [ ] **Ek yapı:** tapulu evin yanına kurulan ilk taban döşemeyle aynı seviyede mi; kapıdan düz geçilebiliyor mu? Parçalar binanın duvarına girmiyor mu?
- [ ] **Evde uyanma:** tapulu evin varken ölünce evin içinde uyanıyor musunuz? Kayıt/yükleme sonrası para ve tapular korunuyor mu?
- Notlar: ____________________

---

## 19. Arayüz, katı nesneler, katlı bina içleri, sokak çeteleri ve yol düzeltmesi (Faz 11 sonrası)

Ayrıntı `CLAUDE.md` "Katı nesneler, katlı bina içleri, sokak çeteleri…" ve ROADMAP "Faz 11 sonrası".

- [ ] **Envanter düzeni:** farklı pencere boyutlarında (dar ~800 px, geniş, kısa) `I` ile açınca eşyalar ve üretim bölümü üst üste binmiyor, taşan yer yok mu? Dar pencerede Eşyalar/Üretim sekmeleri çalışıyor mu? Sırt çantalı (34 slot) envanter kaydırılıyor mu?
- [ ] **Üretim paneli:** arama kutusu ve süzgeç tarifleri doğru süzüyor mu; bir tarife tıklayınca altta ayrıntı (malzemeler, eksik nedeni), adet −/+ ve "En çok" çalışıyor mu; yazı yazarken oyun tuşları (rakamlar, I) tetiklenmiyor mu?
- [ ] **Göstergeler:** sol alttaki halka göstergeler (sağlık, tokluk, su, enerji) okunaklı mı; düşük/kritik durumda renk ve yanıp sönme yeterince belirgin mi; durum çipleri (ısı, ateş, barınak) hâlâ görünüyor mu?
- [ ] **Katı nesneler:** ağaca, kayaya, çalıya yürüyünce içinden geçilmiyor mu; sık ormanda yürümek (takılma, dolaşma) hâlâ akıcı mı; kesilen ağaç gövdesi yok oluyor mu (içinden geçilebilir)? Canlılar (karaca, domuz), yolcular, eşkıyalar ağaç/kaya/köprü korkuluğuna takılıp dolaşıyor mu, ağaç içinden geçen var mı? Gerçek GPU'da FPS düşüyor mu?
- [ ] **Katlı binalar:** konak, apartman, maden lojmanı, hükümet konağında (kapıdan girip) merdivenle her kata ve çatı terasına çıkılıyor mu? Merdivenin üstünde baş çarpması, döşemeden düşme, sahanlıkta takılma var mı? Çatıda korkuluk yüksekliği ve manzara iyi mi? Çatıdayken "Bina içinde" çipi kalkıyor, yağmur görünüyor mu? Yıkık konak/lojmanda yalnız zemin kat mı? Nerede: ____________________
- [ ] **Sokak çeteleri:** il/ilçe merkezinde (gündüz, oyunun ilk ~15 dakikasından sonra) bazı günlerde caddede iki rakip çete görülüyor mu; birbirleriyle çatışıyorlar mı, "sokakta iki çete çatışıyor" bildirimi çıkıyor mu? Oyuncuyu görünce ona da saldırıyorlar mı; bina duvarı arkasından ateş ediyorlar mı (etmemeli)? Ayarlar'da eşkıya kapalıyken çıkmıyorlar mı? Çok mu sık/zor (olasılık `GANGS.presenceChance`, ısınma `GANGS.graceSeconds`)?
- [ ] **Köprü ve yollar:** köprü güvertesi/korkuluğu araziye gömülü görünüyor mu (özellikle yamaçta, bina yanında)? Yolun ucundaki (kavşak) dere geçişlerinde ve göl/baraj kenarlarında köprü var mı, kavşakta iki köprünün birleştiği yer kötü görünüyor mu? Köprü altında yamaç oyuğu (basamaklı çukur) rahatsız ediyor mu?
- Notlar: ____________________

## 20. Performans: takılma, otomatik çözünürlük ve performans göstergesi

Ayrıntı `CLAUDE.md` "Performans çalışması" ve [performans-olcumler.md](performans-olcumler.md).

- [ ] **Hareket ederken takılma:** koşarken (`Shift`) ve test modunda uçarken düzenli aralıklı kısa donmalar azaldı mı? `F3` göstergesinde grafik çoğunlukla yeşil mi, "Son takılma" satırı neyi gösteriyor (bölüm adlarını not edin)? Ekran kartı / tarayıcı: ____________________
- [ ] **Tünel yakını:** tünel ağzına doğru yürürken ve tünelden geçerken donma var mı?
- [ ] **Gün doğumu / batımı:** `[` / `]` ile saati sararken (dev) ya da oyunda akşam olurken birkaç saniyelik donma kalktı mı?
- [ ] **İlk kez görülenler:** eşkıya, cam kırığı, mermi izi, yağmur ilk göründüğünde donma var mı? Yükleme ekranında "Gölgelendiriciler hazırlanıyor…" çok mu uzun sürüyor?
- [ ] **Otomatik çözünürlük:** zorlanan bir sahnede (kalabalık şehir, uzak manzara) `F3`'teki "Çözünürlük" yüzdesi düşüyor mu, görüntü bulanıklaşması rahatsız edici mi? Rahatlayınca geri yükseliyor mu? Ayarlar'da kapatınca eski davranış mı?
- [ ] **Göstergede:** FPS, %1 en kötü, draw call değerleri (şehirde ve ormanda): ____________________
- Notlar: ____________________

## 21. Faz 12: çevre iller ve karo akışı (Kocaeli, Bilecik, Samsun, Çorum, Amasya, Ankara, Kırıkkale)

Ayrıntı [faz-12-olcumler.md](faz-12-olcumler.md) (birleşik ölçüm) ve grup raporları ([batı](faz-12-bati-rapor.md), [doğu](faz-12-dogu-rapor.md), [güney](faz-12-guney-rapor.md)), karo akışı [faz-12-karo-akisi-olcumler.md](faz-12-karo-akisi-olcumler.md). Harita 16 hedef ile (13,27 × 6,29 km) büyüdü; dünya artık oyuncuya yaklaştıkça karo karo yüklenir.

- [ ] **Açılış ve yükleme:** sayfa açılışı → menü kaç saniye? Yeni Oyun / Devam sonrası "Harita yükleniyor…" kısa mı? Konsolda hata var mı? Bağlantı hızı: ____________________
- [ ] **Işınlanma ve karo akışı:** `T` + rakam ve `Shift` + rakam ile uzak noktalara (Ankara'dan Samsun'a, Kocaeli'den Amasya'ya) ışınlanınca oyun karolar gelene kadar bekleyip sorunsuz devam ediyor mu? Yürürken karo sınırlarında (kaplama dokusu, yol/dere kenarı, ağaç/collider) dikiş, kayma ya da düşme var mı? Koşarken yeni karo yüklenirken takılma var mı (`F3` "Karo akışı" bölümü)?
- [ ] **Uzak arazi:** yüksek bir yerden (Ilgaz, Köroğlu) uzağa bakınca uzak arazi (genel bakış, 16 m doku) yakın arazi ile uyumlu mu, geçişte belirgin renk/yükseklik sıçraması var mı?
- [ ] **Başlangıç / yeniden doğma:** birkaç Yeni Oyun ve `K` ile ölüm: il ve ilçe merkezlerinden rastgele başlıyor; yeni illerde (Ankara, Samsun, Kocaeli …) bina içine/suya düşme, havada kalma var mı? Notlar: ____________________
- [ ] **Yeni ilde il bildirimi ve yer adları:** sınır geçince "Ankara'ya / Kırıkkale'ye / Kocaeli'ne / Samsun'a / Çorum'a / Amasya'ya / Bilecik'e hoş geldiniz" doğru dilbilgisiyle çıkıyor mu? `Shift` + 1–9, 0 her yeni ilin 8–10 yerine götürüyor mu, yer adı bildirimi çıkıyor mu?
- [ ] **Ankara:** Anıtkabir, Ankara Kalesi, Hacı Bayram Veli ve Kocatepe camileri çevresi inandırıcı mı? Şehir merkezinde (Kızılay) satıcı sayısı çok mu, FPS nasıl (en kötü draw call 343, bkz. ölçüm)? Kızılcahamam–Çamlıdere ormanında gece soğuğu, Çubuk/Kalecik bozkırında yiyecek hissi?
- [ ] **Samsun ve doğu:** Bafra/Çarşamba deltasında yol, köprü, dere sıklığı; Samsun merkezinin görünümü (il merkezi yalnız 13 yapı); Amasya vadisi (Kral Kaya Mezarları, kale), Çorum (Hattuşa, Ulu Cami), Eynegazi köyünün yolsuzluğu.
- [ ] **Kocaeli ve Bilecik:** Körfez kıyısındaki sanayi dokusu (İzmit, Gebze, Dilovası: yalnız birkaç fabrika), Körfez'e batıdan bakarken FPS (en kötü draw call 309–355), Söğüt/Bilecik tarihî doku, Sapanca–Kartepe ormanı.
- [ ] **FPS (asıl madde):** gerçek GPU'lu masaüstünde en kötü konumlarda (Anıtkabir, Safranbolu, İnebolu, İzmit, Zonguldak, Çorum) `F3`'teki FPS, %1 en kötü, draw call, üçgen. Başsız (yazılımsal) ölçümde 16 konumun 11'inde draw call 300'ü aşıyor; gerçek GPU'da ≥ 60 FPS mi? Aşağıdaysa `CHUNK.viewDistance` 4000 → 3000 (+ `fogFar`) en hızlı çare (ölçüm: en kötü 343 → 219): ____________________
- [ ] **Bellek:** Chrome Görev Yöneticisi / `performance.memory`: uzun gezintiden sonra (10 dk, farklı iller) JS yığını ve sekme belleği nasıl (başsız ~310–370 MB)? Karo tavanı (25) aşılıyor mu, bellek sızıntısı var mı?
- [ ] **Eski kayıtlar:** Faz 11 sonrası (v8) bir kayıt yükleniyor mu? Kayıttaki "aranmış yapı" listesi yerleşim düzeni değiştiği için başka yapıyı gösterebilir (kabul edilmiş sınır): yapılar, envanter, saat doğru mu?
- Notlar: ____________________
