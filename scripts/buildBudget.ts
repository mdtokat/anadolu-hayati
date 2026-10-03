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
     * 740 → 850 kB (~%14 pay; uyarı eşiği %90'ın altında kalsın).
     */
    'index.js': { gzipKB: 270, rawKB: 850 },
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
     */
    totalKB: 55_000,
    /** Tek veri dosyası (ham). Karolar 512 kB; istisna `features.json` (genişlemeyle ≈ 1,9 MB; Sinop–Sakarya ile ≈ 2,5 MB): 1,5 → 3,5 MB. */
    maxFileKB: 3_584,
  },
  /**
   * Performans bütçesi "ilk yükleme < 10 sn": açılışta inen her şeyin (JS + CSS + dünya verisi)
   * referans bağlantıdaki tahmini indirme süresi. Varsayım: metin dosyaları (JS/CSS/JSON) gzip'li,
   * ikili karolar (`.bin`) sıkıştırılmadan iner (GitHub Pages'in davranışına güvenmeyen üst sınır).
   * CPU hazırlığı (~0,7 sn, Faz 7 ölçümü) dahil değildir.
   */
  // Kastamonu–Çankırı genişlemesi: 10 → 16 sn (ölçülen tahmin ~14,5 sn). Karo akışı gelince yeniden 10 sn'ye inmeli.
  // Sinop–Sakarya genişlemesi: 16 → 20 sn (ölçülen tahmin ~17,2 sn; 50 karo). Karo akışı gelince yeniden 10 sn'ye inmeli.
  load: { referenceMbps: 20, maxSeconds: 20 },
  /** Sınırın bu oranını aşan değerler uyarı (⚠️) olarak işaretlenir. */
  warnRatio: 0.9,
} as const;

export type BuildBudget = typeof BUILD_BUDGET;
