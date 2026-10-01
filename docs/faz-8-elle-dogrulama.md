# Faz 8 — Elle doğrulama kılavuzu (Zonguldak)

Bu kılavuz, otomatik testlerin ve başsız tarayıcının **ölçemediği** şeyleri (gerçek FPS, oyun hissi, ses, gerçek fare kilidi) pilot il **Zonguldak** üzerinde sıraya koyar. Faz 2–7'den kalan açık "elle doğrulanacak" kriterlerin hepsi buraya toplandı ([ROADMAP.md](../ROADMAP.md) Faz 8). Her adımın yanında **ne yapılacağı**, **beklenen sonuç** ve **sonucu yazacağın yer** var. Bitirince sonuçları (geçti / kaldı + kısa not) bana ilet; ROADMAP'teki kutuları ben işaretlerim.

Süre: tümü için ~1,5–2 saat; bölümler bağımsızdır, istediğin sırayla ya da yalnızca bir kısmını yapabilirsin.

## 0. Hazırlık

- **Donanım:** gerçek GPU'lu masaüstü (entegre GPU'lu dizüstü de olur: bütçe hedefi orada ≥ 60 FPS, alt sınır 30). Tarayıcı: Chrome (asıl), mümkünse Firefox ve Edge.
- **Çalıştırma:** depoda `npm install` sonra `npm run dev`, adres `http://localhost:5173/` (terminalde yazılan adrese bak; dev sunucusu kökten çalışır, `/anadolu-hayati/` yalnızca derleme/`npm run preview` içindir). Dev modunda ekranın solunda **FPS sayacı** ve **hata ayıklama HUD'u** görünür; ışınlanma tuşları yalnızca dev'dedir (yayındaki Pages sürümünde yoktur).
- **Dev tuşları:**

| Tuş | İş |
|---|---|
| `1`–`9`, `0` | `TELEPORTS` noktalarına ışınlan (`1` = Zonguldak merkez, `2` Safranbolu, `3` Amasra, `4` Filyos vadisi, `5` Yenice, `6`–`0` Düzce/Bolu/Abant/Yedigöller/Akçakoca) |
| `Shift` + `1`–`9`, `0` | **Zonguldak yerlerine** ışınlan: `1` Zonguldak merkez, `2` Kozlu, `3` Kilimli, `4` Çatalağzı, `5` Karadeniz Ereğli, `6` Alaplı, `7` Çaycuma, `8` Filyos vadisi, `9` Devrek, `0` Gökçebey |
| `[` / `]` | Saati 1 saat geri / ileri sar (gece/gündüz denemek için) |
| `K` | Canı ve suyu sıfırla (ölüm ekranı ve yeniden doğma denemesi) |
| `P` | Malzeme ver (kamp ateşi, sundurma, 10 dal, 2 kütük) |
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
- [ ] Başka ile (ör. `7` Bolu merkez, `5` Yenice) ışınlanıp `K` ile öl: yine Zonguldak'ta mı doğuyorsun?
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

## Sonuçları iletme

Doldurduğun kutuları ve notları (ör. "FPS tablosu şöyle, 4. bölümde yiyecek çok bol, azalt") mesaj olarak yaz. Ben: geçenleri ROADMAP'te `[x]` yaparım, kalanları ayrı alt görevlere bölerim (ayar değişikliği gerekiyorsa ilgili testleri yeniden çalıştırıp kaydederim).
