/**
 * Derleme bütçesi: `npm run build:check` (`scripts/check-build.ts`) `dist/`'i bununla karşılaştırır;
 * aşım CI'ı kırar, `warnRatio` üstü uyarı verir. Birimler Vite çıktısıyla aynı: kB = 1000 bayt.
 * Bir sınırı yükseltmek bilinçli bir karardır: gerekçesini commit mesajına yaz.
 *
 * Ölçüm (Faz 8 sonu, gzip): oyun kodu 77 kB, three 138 kB, rapier 1669 kB, CSS 2,7 kB;
 * dünya verisi 48 karo dosyası + manifest/il/su ≈ 20 MB ham.
 */
export const BUILD_BUDGET = {
  /**
   * Chunk bütçeleri; anahtar `<chunk adı>.<uzantı>` (`index-B5wsWrZK.js` → `index.js`).
   * `rawKB` yalnızca ayrıştırma maliyeti önemli olan chunk'larda tanımlıdır.
   */
  chunks: {
    /**
     * Oyun kodu (`src/`). Faz 10 sonrası yol omurgası, köprü türleri ve tüneller (10.13) 150 → 175 kB gzip
     * (ölçülen ~156 kB; ~%10 pay). Faz 11 (11.0, docs/faz-11-paralel-plan.md): altı akışın (inşa II, yapılar/çit,
     * tarım, silahlar, eşkıya, drone) ekleyeceği saf mantık + geometri için 175 → 230 kB gzip, ham 560 → 740 kB
     * (aynı oran); bir akış tek başına 15 kB'tan fazla eklerse PR'ında ölçümü yazar. Faz 11 sonrası alışveriş ve
     * tapu (ekonomi mantığı + dükkân paneli, ~+8 kB gzip; önce ~229 kB, sonra ~237 kB): 230 → 270 kB gzip, ham
     * 740 → 850 kB (~%14 pay; uyarı eşiği %90'ın altında kalsın). Faz 12 sonrası (savaş görünümü, ganimet paneli;
     * ardından üst kat camları/kapları, balkonlar, asma köprü, kıyı biçimlendirme: ~+3,6 kB gzip): taban ~269 kB'de
     * bütçenin %99'una dayanmıştı, ölçülen 272,7 kB → 270 → 310 kB gzip (%88: uyarı eşiğinin altında), ham 850 → 950 kB.
     * Son Kalan sonrası (Son Kalan ~+30 kB; ardından NPC bina yürüyüşü + A* yol bulma, mini harita, dürbünler ve 9 yeni
     * silahın modelleri/simgeleri: ölçülen 315 kB gzip, ham 938 kB) → 360 kB gzip, ham 1050 kB (%88: uyarı eşiğinin altında).
     */
    'index.js': { gzipKB: 360, rawKB: 1050 },
    /** Three.js; sürüm yükseltmesinde büyüyebilir. */
    'three.js': { gzipKB: 180, rawKB: 700 },
    /** Rapier: WASM base64 gömülüdür (~4,3 MB ham); `vite.config.ts` uyarı eşiği de bu `rawKB`'dir. */
    'rapier.js': { gzipKB: 1900, rawKB: 5000 },
    /** HUD/menü stilleri. */
    'index.css': { gzipKB: 20 },
  },
  /** Yukarıda adı geçmeyen yeni bir chunk (ör. ileride tembel yüklenen bir modül) için sınır. */
  otherChunk: { gzipKB: 100 },
  /** index.html'in açılışta çektiği tüm JS + CSS (gzip). */
  initialGzipKB: 2300,
  data: {
    /**
     * `dist/data/` toplamı (ham). CLAUDE.md: karo akışı yok, açılışta hepsi iner. Kastamonu–Çankırı genişlemesi
     * (kullanıcı kararı: karo akışı yazmadan, bütçe bilinçli yükseltilerek): 24 → 40 MB (ölçülen ~35 MB; 40 karo).
     * Sinop–Sakarya genişlemesi (50 karo): 40 → 55 MB.
     * Faz 12 (98 karo, 16 il, karo akışlı; 12.9): 55 → 160 MB (ölçülen 136,5 MB: eski `tiles/*.bin` 74 MB + bake 48 MB + küresel
     * dosyalar ~14 MB). Karo akışlı yayında eski `tiles/*.bin` hiç inmez (yalnızca yoğun yol ve testler içindir); açılışta inen
     * veri `stream` bütçesiyle (aşağıda) sınırlanır. Dağıtımdan çıkarma ayrı karar (ROADMAP).
     */
    totalKB: 160_000,
    /**
     * Tek veri dosyası (ham). Karolar 512 kB; istisna `features.json` (genişlemeyle ≈ 1,9 MB; Sinop–Sakarya ile ≈ 2,5 MB): 1,5 → 3,5 MB.
     * Faz 12 (12.9): 4,90 MB ham (gzip ≈ 1,7 MB iner; açılışta tek seferde okunur) → 5,5 MB. Karo başına bölme ayrı iş (ROADMAP).
     */
    maxFileKB: 5_632,
  },
  /**
   * Performans bütçesi "ilk yükleme < 10 sn": açılışta inen her şeyin (JS + CSS + dünya verisi)
   * referans bağlantıdaki tahmini indirme süresi. Varsayım: metin dosyaları (JS/CSS/JSON) gzip'li,
   * ikili karolar (`.bin`) sıkıştırılmadan iner (GitHub Pages'in davranışına güvenmeyen üst sınır).
   * CPU hazırlığı (~0,7 sn, Faz 7 ölçümü) dahil değildir.
   */
  // Kastamonu–Çankırı genişlemesi: 10 → 16 sn, Sinop–Sakarya: 16 → 20 sn (karo akışı yokken tüm dünya iniyordu).
  // Faz 12 (12.0a karo akışı + 12.9): yeniden 10 sn. Bu sınır yalnızca `stream.json` olmayan (tam bellek) yayında geçerlidir.
  load: { referenceMbps: 20, maxSeconds: 10 },
  /**
   * Karo akışlı dünya (Faz 12, `stream.json` yayında): açılışta yalnızca küçük küresel dosyalar ve oyuncunun çevresindeki
   * `startTiles` karo iner, kalan karolar yaklaştıkça akar; bu durumda ilk yükleme sınırı Performans Bütçesi'nin
   * hedefi olan 10 sn'dir. (Akışlı veri depoya girene kadar yukarıdaki `load` geçerlidir.)
   */
  stream: { startTiles: 9, maxSeconds: 10 },
  /** Sınırın bu oranını aşan değerler uyarı (⚠️) olarak işaretlenir. */
  warnRatio: 0.9,
} as const;

export type BuildBudget = typeof BUILD_BUDGET;
