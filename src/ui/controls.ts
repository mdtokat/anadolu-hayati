/** Kontrol listesi (Kontroller penceresi); tuş değişirse burası da güncellenmeli. */

/** Kontrol listesi: tuşlar (her biri ayrı tuş simgesi) ve eylem; menünün sağ sütununda gruplanır. */
export type ControlRow = readonly [keys: readonly string[], action: string];

export const CONTROL_GROUPS: ReadonlyArray<readonly [title: string, rows: readonly ControlRow[]]> =
  [
    [
      'Hareket',
      [
        [['W', 'A', 'S', 'D'], 'Yürü'],
        [['Shift'], 'Koş'],
        [['Boşluk'], 'Zıpla'],
        [['Boşluk ×2', 'Z'], 'Uçuş aç/kapa · aşağı in (Ayarlar → Test modu)'],
        [['Fare'], 'Etrafa bak'],
        [['V'], '1. / 3. şahıs kamera'],
      ],
    ],
    [
      'Hayatta kalma',
      [
        [
          ['E'],
          'Topla, leş kes, pişir, yakıt at, sandık/dolap ara, camide namaz kıl, su iç (basılı tut)',
        ],
        [['E'], 'Sandık aç, kapı ve çit kapısı aç/kapat, rafa et as/al, insanlarla konuş (bas)'],
        [['Sol tık'], 'Saldır · hayalet varken kur'],
        [['F'], 'Hızlı yemek'],
        [['I', 'Tab'], 'Envanter ve üretim (sırt çantası taşınınca yer artar)'],
        [['1–8', 'Tekerlek'], 'Kısayol çubuğu'],
      ],
    ],
    [
      'İnşa',
      [
        [['C', 'G'], 'Ateş / sundurma hayaleti'],
        [['1–8'], 'Taban, duvar, kapı, çatı… parçayı seç; sol tık monte eder (art arda)'],
        [['R'], 'Hayaleti döndür · duvar/kapı yüzünü çevir · çit hattını bakışa paralel yap'],
        [['X'], 'Yapıyı sök (basılı tut)'],
      ],
    ],
    [
      'Alışveriş ve tapu',
      [
        [['E'], 'Dükkân önündeki esnafla alışveriş (il/ilçe merkezleri): al, sat'],
        [['E'], 'Yapının kapısına bakıp tapusunu al ya da geri sat'],
        [['1–8'], 'Tapulu yapının içine sandık, tezgâh, döşek kur; yanına ek yap'],
      ],
    ],
    [
      'Silahlar',
      [
        [['Sol tık'], 'Ateş et (elde menzilli silah)'],
        [['Sağ tık'], 'Nişan al · dürbün'],
        [['R'], 'Doldur'],
        [['Shift'], 'Nişanda nefes tut (dürbün sallanmaz)'],
        [['I'], 'Envanterde silahı seç → Susturucu tak/çıkar'],
      ],
    ],
    [
      'Drone',
      [
        [['Sol tık'], 'Kısayolda seçiliyken kaldır · görüşte işaretle'],
        [['Q'], 'Oyuncu ↔ drone görüşü'],
        [['W', 'A', 'S', 'D'], 'Drone görüşünde uç (Shift hızlı)'],
        [['Boşluk', 'Z'], 'Yüksel / alçal'],
        [['Tekerlek'], 'Yakınlaştır'],
        [['H'], 'Eve dön ve in'],
      ],
    ],
    [
      'Diğer',
      [
        [['B'], 'İl sınırları'],
        [['Esc'], 'Duraklat'],
      ],
    ],
  ];

/** Yalnızca geliştirme modunda gösterilen ek kontroller. */
export const DEV_CONTROLS: readonly ControlRow[] = [
  [['T', '1–0'], 'Işınlan'],
  [['Shift', '1–0'], 'İldeki yerlere ışınlan'],
  [['P', 'O'], 'Malzeme / inşa eşyası ver'],
  [['L', 'N'], 'Erzak ver / önüne bir yolcu çıkar'],
  [['J'], 'Silah, mühimmat, susturucu ve büyük çanta ver'],
  [['M'], 'Drone ve pil ver'],
  [['Shift', 'M'], 'Cüzdana 1000 ₺'],
  [['[', ']'], 'Saati ±1 saat'],
  [['K'], 'Canı sıfırla'],
];
