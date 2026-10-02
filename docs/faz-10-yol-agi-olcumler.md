# Yol ağı, zemin düzeltme ve köprüler — ölçümler (Faz 10 sonrası)

Kullanıcı talimatı: ana yollar ve patikalar araziyi izlemesin (zemin yola uydurulsun; dağ patikaları hariç), dalgalı ya da keskin köşeli yol olmasın, dere geçişlerinde köprü, şehirler arası ana yol + patikalar, binaların çok olduğu yerde ana yol / az olduğu yerde tali yol ve patika, kopuk yol olmasın, yollar dik olmasın (gerekirse tünel), şehir-ilçe çevrelerinde "yalnız yol" olan yerler giderilsin. Tasarım ve sınırlar: `CLAUDE.md` "Yol ağı ve zemin düzeltmesi".

Ölçümler başsız ortamda (yazılımsal WebGL, tek çekirdek) alınmıştır; gerçek GPU'lu masaüstünde FPS **ölçülmedi**.

## Önce / sonra

| Ölçü | Önce | Sonra |
|---|---|---|
| Veri yolu uzunluğu (oyun m): anayol / tali / patika | 69 461 / 198 948 / 57 588 | 64 322 / 89 102 / 51 516 (+ 17 424 m kent bağlantısı, 14 392 m kent sokağı) |
| Yol çizgisi sayısı (veri) | 9 372 | 8 167 (1 427 çıkmaz silindi, 707 kırsal tali yol patikaya indi, 219 bağlantı eklendi) |
| Yatak/zemin eğimi (tüm sınıflar; ≤%5 / ≤%10 / ≤%20 / ≤%35 / >%35 uzunluk payı) | 26,9 / 15,6 / 21,5 / 19,4 / 16,6 (zemini izliyordu) | 29,5 / 16,5 / 23,0 / 22,9 / 8,1 |
| Anayol eğimi (aynı sınıflar) | — | 44,6 / 20,0 / 30,7 / 3,7 / 0,9 |
| Dere/vadi geçişi | ~1 700 kesişim, yol suyun üstüne boyanıyordu | 1 472 köprü (532 anayol, 616 tali, 324 patika; 166'sı viyadük, en uzunu 119 m) |
| Düzeltilen arazi | — | 508 640 hücre (%11,6); yol dışı hücrede en çok 8 m değişim |
| Yapı sayısı | 1 512 | 1 881 (il 355, ilçe 451, köy 1 075) |
| Yapı yok, yol var: kent sokakları | ızgara tüm yarıçapa çizilirdi | yalnız yapı bulunan blokların kenarları (14 392 m), hepsi ağa bağlı |
| Düzen süresi (`SettlementMap`, vitest) | ~1,2 sn | ~3,9 sn |
| Başsız sayfa yükleme (`vite` dev) | ~4,4 sn | ~6,8 sn |
| En kötü draw call / üçgen | 240 / ~760 bin | 243 / ~535 bin (yol mesh'leri kalktığı için üçgen azaldı) |
| JS yığını | ~235 MB | ~212 MB |

Kaynak çıktılar: `tests/roadNetworkReal` (kabul), `tests/helpers/settlementWorld.ts` (oyunla aynı kurulum).

## Düzen süresi dağılımı (vitest, ms)

yumuşatma 190 · sudan ayırma 400 · yol ağı 900–1 000 · profil 400 · zemin düzeltme 400–500 · yerleşim düzeni 800–1 000 · kent bağlantıları 400. İlk yükleme bütçesi (< 10 sn) için kalan en büyük kalemlerin (yumuşatma + ayırma + ağ düzeni ≈ 1,6 sn) **veri hattında bir kez hesaplanıp** `settlements.json`'a yazılması düşünülebilir (yol ağı arazi yüksekliğine yalnızca A* bağlantı maliyetlerinde bağlıdır); şimdilik çalışma zamanında yapılır.

## Bilinen sınırlar

- **Tünel yok.** Arazi yükseklik ızgarasında (Rapier heightfield) delik açılamadığından tünel kurulamıyor; derin sırtlar `ROADS.maxCut` (10 m'ye kadar) yarma ile geçilir, daha derin kesimler eğim sınırıyla yumuşatılmış profile uyar. Gerçek tünel delikli arazi (ya da ayrı tünel kabuğu + arazi deliği) ister.
- Dik arazide iner-çıkar yollar eğim sınırını (`gradeMax`) ancak uçlar arası eğim izin verdiği ölçüde sağlar: dikey ölçek 1:15, yatay 1:50 olduğundan yamaçlar ×3,3 dik; kıvrım (serpantin) üretilmez. Tali yolun %39'u hâlâ %20–35 eğimdedir.
- Birbirine çok yakın kesişen yollar (ör. Bolu merkezi) yan yana birkaç küçük köprü verir; kavşaklarda geniş asfalt yaması eski sınırlama olarak durur.
- Köprü altı doğal zemin kalır; insanlar (`PeopleSystem`) ve canlılar köprüyü bilmez, zeminden yürür.
- Yapı terasları komşu teraslarla çok yakın olduğunda (2 m'lik hücre) ayak izi kenarında 1–2 m sapma olabilir: aşırı gömülen (nadir, <%1) yapılar atılır, temel gerçek zemine göre yeniden ölçülür.
