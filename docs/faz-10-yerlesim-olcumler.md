# Faz 10 — Yerleşimler, Yollar ve İnsanlar: ölçümler

Ölçümler başsız Chromium'da (yazılımsal WebGL, SwiftShader) ve Node'da (Vitest) alındı. **Gerçek FPS ölçülmedi**: gerçek GPU'lu masaüstünde elle doğrulanacak (bkz. [faz-8-elle-dogrulama.md](faz-8-elle-dogrulama.md) bölüm 12).

## Veri (`settlements.json`)

Kaynak: Overture Maps `2026-09-23.1` (HTTP Range; `tools/fetch_settlements.py`). İndirilen ham veri `tools/raw/settlements/` altındadır, commit edilmez.

| Katman | Kayıt | İndirilen |
|---|---:|---:|
| `divisions` (il, ilçe, köy noktaları) | 7 509 | 5,2 MB |
| `transportation/segment` (yollar) | 82 324 | 445 MB |
| `places` (cami, han, hamam, kale… adayları) | 10 230 | 92 MB |
| `buildings` (yalnızca bbox merkezi) | 1 359 213 | 815 MB |

Üretilen dosya (`tools/build_settlements.py`, deterministik): **887 KB** (gzip ≈ 260 KB), world.json'da bayt + sha256 kayıtlı.

- **Yerleşimler:** 376 — 5 il merkezi, 30 ilçe merkezi, 341 köy (hedef illerdeki köylerin %20'si, deterministik seçim, yarıçapında en az 8 gerçek bina olanlar).
- **Yollar:** 9 372 çoklu çizgi (anayol 69 km, il-ilçe yolu 199 km, köy yolu 58 km; oyun ölçüsü). Hedef illerin dışında yalnızca anayol. Koordinatlar 0,1 m birimli delta kodlu.
- **Simge yapılar (elle seçilmiş, `tools/settlements.yaml`):** 24 — ör. Safranbolu'da Köprülü Mehmet Paşa Camii, Cinci Hanı, İzzet Mehmet Paşa Camii, Saat Kulesi, Arasta; Bolu'da Yıldırım Bayezid Camii, Taşhan, Orta Hamam; Göynük'te Akşemseddin Türbesi; Amasra Kalesi; Zonguldak'ta Uzun Mehmet ve Maden Şehitleri anıtları.

## Düzen (oyunda)

Açılışta `SettlementMap` her yerleşimin düzenini bir kez hesaplar: **1 410 yapı, ~0,5–0,6 sn** (Node; tarayıcı açılışı başsızda ~3,7 sn, önceki ~2 sn).

| Yerleşim | Yapı | Not |
|---|---:|---|
| Düzce | 68 | düz ova: en kalabalık |
| Bolu | 59 | Yıldırım Bayezid Camii, Taşhan, Orta Hamam |
| Bartın | 51 | Osmanlı dokusu: 17 konak |
| Karabük | 44 | fabrika, maden lojmanları |
| Zonguldak | 26 | çok dik yamaç ve deniz: parsellerin çoğu elenir; 2 maden kuyusu, anıtlar |
| Safranbolu | 21 | büyük cami, Cinci Hanı, hamam, türbe, saat kulesi, arasta, konaklar |
| İlçeler (30) | 2–24 | Amasra (2) ve Kurucaşile (4): ayak izinin çoğu deniz, cami sığmadı |
| Köyler (341) | ~2,5 ortalama | ahşap köy camisi, köy evi, serender |

Neden bu kadar az? 1 oyun m = 50 gerçek m: 100 binlik bir il merkezi gerçekte ~4 × 2 km, oyunda ~80 × 40 m. Ayak izi bilinçli olarak büyütülmüştür (`SETTLEMENT_LAYOUT.footprintScale`: il ×1,8, ilçe ×1,6, köy ×1,3); dikey ölçek (×3,3 diklik) yüzünden yamaç kasabalarında (Zonguldak, Devrek, Kozlu) parsellerin çoğu yamaç sınırlarına (`MAX_BURY`, `maxPlinth`) takılır. Konutlar kapısı vadiye bakacak şekilde yamaca gömülür, camiler kıbleye dönük taş setlere oturur.

## Çizim maliyeti (başsız, 8 yöne bakış, en kötü)

| Konum | Draw call | Üçgen | Yakın / uzak yapı | Yerleşim mesh'i |
|---|---:|---:|---:|---:|
| Köroğlu zirvesi (Faz 7 en kötü: 176) | 192 | 606 bin | 11 / 506 | 15 |
| Yenice (orman) | 192 | 754 bin | 36 / 820 | 18 |
| Zonguldak | 127 | 490 bin | 59 / 580 | 24 |
| Bolu | 180 | 711 bin | 92 / 709 | 26 |
| Düzce | 229 | 748 bin | 136 / 545 | 26 |
| Karabük | 222 | 761 bin | 82 / 645 | 32 |
| Bartın | 171 | 650 bin | 77 / 515 | 25 |
| **Safranbolu** | **240** | 763 bin | 79 / 586 | 32 |
| Karadeniz Ereğli | 187 | 620 bin | 47 / 766 | 20 |

- Bütçe < 300 draw call: **en kötü 240** (Safranbolu). Ölçüm, nesne/canlı akışı yüzünden koşudan koşuya ±40 oynar.
- Yerleşim katmanı: varyant başına yakın mesh; uzakta camiler kendi siluetleriyle, diğer yapılar iki ortak mesh'le (çatılı/düz) çizilir — bu birleştirme yerleşim mesh sayısını 50'den 32'ye indirdi.
- Yollar 1 km'lik gruplarda: görünür 7–10 grup (draw call), ~100–170 bin üçgen.
- Üçgen ~760 bine çıktı (Faz 7: ~540 bin); fark büyük ölçüde yollar ve uzak yapılardır. Sorun olursa ilk hamle `ROADS.drawRadius`, `ROADS.sampleStep` ve `BUILDING_LOOK.drawRadius`/`nearRadius`.
- JS yığını ~235 MB (Faz 7: ~150–200 MB).

## Yükleme bütçesi (`npm run build:check`)

- Dünya verisi toplamı 21,0 MB (sınır 24 MB); tahmini ilk yükleme @ 20 Mbit/s **8,6 sn** (Faz 9: 8,5 sn; sınır 10 sn).

## İnsanlar

- Yol/yerleşim yakınında doğma denemesi dakikada bir, olasılık %5 → ortalama ~20 dk'da bir kişi; yaban yerde %1,2. Aynı anda en çok 2 kişi, ömür 15 dk, 320 m'den uzakta kaybolur (`PEOPLE`; `tests/people.test.ts`: 4 saatlik simülasyonda 5–25 kişi).
