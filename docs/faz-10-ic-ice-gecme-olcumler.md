# Yol yapıları iç içe geçme denetimi — ölçümler (Faz 11 sonrası)

Kullanıcı talimatı: "Köprü, yol, dere, dağ vb. yapıların iç içe geçtiği kısımlar var, bunları tekrar gözden geçir, düzelt."

Ölçüm: `tests/helpers/overlapAudit.ts` (gerçek dünyada `buildSettlementWorld` ile kurulan yerleşim haritası; kabul testi `tests/overlapAudit.test.ts`).

## Önce / sonra

| Ölçü | Önce | Sonra |
|---|---|---|
| Köprü/viyadük sayısı (tünel dahil yapı) | 333 | 420 |
| İnce güverte/korkuluk kutusu çevre arazide > 1 m gömülü (güverte "dağın içinde") | 31 | **0** |
| Yolun akarsuyu köprüsüz kestiği nokta | 77 | **4** |
| Yolun göl/rezervuar çokgeni içinden köprüsüz geçtiği yol | 10 | **0** |
| Köprü kutusu × bina çakışması | 1 | **0** |
| Köprü × köprü çakışması (kavşak ayağında / başka yerde) | 4 / 4 | 28 / 1 |

## Nedenler ve düzeltmeler

- **Güverte arazide gömülü:** (1) yaklaşım yolunun dolgu şevi köprü altına taşıp zemini güvertenin üstüne çıkarıyordu; (2) doğal zemin yatağın üstünde kalan kesimde güverte tepenin içinde duruyordu; (3) köprü yanındaki yapının terası (`levelPad`) komşu zemini yeniden yükseltiyordu. `roadGrading.ts` `bridgeCeiling`: köprü koridorunda (eksenden yarı genişlik + banket + 1 hücre) zemin yatağın `ROADS.bridgeClearance` (0,9 m) altına oyulur, koridor hücreleri kilitlenir (yapı terasları dokunmaz); ayak noktalarında tavan yatak yüksekliğidir.
- **Köprüsüz akarsu kesişimi (kavşakta biten yollar):** yollar kavşak düğümünde bölündüğünden dere kavşağa yakın geçtiğinde ne ona varan ne ondan çıkan yolda köprü planlanıyordu (ayaklar yolun iç noktalarından seçiliyordu). `roadProfile.ts`: köprü adayı yolun ucuna kadar uzanır, ayak uç noktanın kendisi olabilir; uçtaki ayak kavşak yüksekliğine sabit kalır (kavşakta basamak yok), güverteyi öbür ayak yükselterek eğimli yapar. Kavşağın iki yanındaki yollar aynı noktadan karşıya köprü kurduğundan ayak parçaları üst üste biner (28 kavşak çifti; aynı yükseklikte, aynı renk).
- **Göl içinden geçen yol:** köprü adayları yalnızca akarsu çizgisi kesişimlerinden geliyordu; göl/gölet/rezervuar çokgeni içinde kalan yol noktaları da köprü olur (`nearestWater` çokgen isabeti).

## Bilinen sınırlar

- Tünel ağzı cephesi araziden 5 m'ye kadar yükselir; ağız üstündeki yamaçta duran bina cepheyle örtüşebilir (dünyada 2 yapı: bir ev, bir mezarlık). Denetim tünel kutularını bina çakışmasından hariç tutar.
- Kavşak ayağında iki yolun köprü parçaları üst üste biner (aynı yükseklik); birleştirme yapılmadı.
- Köprünün oyulmuş koridorunun yanında doğal zemin hücre boyutunda (2 m) basamaklı yükselebilir.
- 4 köprüsüz akarsu kesişimi (uçtaki ayak iki adıma sığmayan çok kısa yollar).
