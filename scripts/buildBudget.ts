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
     * (aynı oran); bir akış tek başına 15 kB'tan fazla eklerse PR'ında ölçümü yazar.
     */
    'index.js': { gzipKB: 230, rawKB: 740 },
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
    /** `dist/data/` toplamı (ham). CLAUDE.md: karo akışı yok, açılışta hepsi iner. */
    totalKB: 24_000,
    /** Tek veri dosyası (ham). Karolar 512 kB; tek istisna `features.json` ≈ 1,1 MB. */
    maxFileKB: 1_536,
  },
  /**
   * Performans bütçesi "ilk yükleme < 10 sn": açılışta inen her şeyin (JS + CSS + dünya verisi)
   * referans bağlantıdaki tahmini indirme süresi. Varsayım: metin dosyaları (JS/CSS/JSON) gzip'li,
   * ikili karolar (`.bin`) sıkıştırılmadan iner (GitHub Pages'in davranışına güvenmeyen üst sınır).
   * CPU hazırlığı (~0,7 sn, Faz 7 ölçümü) dahil değildir.
   */
  load: { referenceMbps: 20, maxSeconds: 10 },
  /** Sınırın bu oranını aşan değerler uyarı (⚠️) olarak işaretlenir. */
  warnRatio: 0.9,
} as const;

export type BuildBudget = typeof BUILD_BUDGET;
