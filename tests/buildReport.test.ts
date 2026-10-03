import { describe, expect, it } from 'vitest';
import { BUILD_BUDGET } from '../scripts/buildBudget';
import {
  checkLimit,
  chunkKey,
  estimateLoadSeconds,
  evaluateBuild,
  groupModules,
  htmlAssetRefs,
  moduleGroupName,
  renderReport,
  transferBytes,
  worstStatus,
  type BudgetShape,
  type BuildInput,
} from '../scripts/buildReport';

const BUDGET: BudgetShape = {
  chunks: { 'index.js': { gzipKB: 100, rawKB: 300 }, 'index.css': { gzipKB: 10 } },
  otherChunk: { gzipKB: 50 },
  initialGzipKB: 200,
  data: { totalKB: 1000, maxFileKB: 500 },
  load: { referenceMbps: 8, maxSeconds: 2 },
  warnRatio: 0.9,
};

describe('chunkKey', () => {
  it('içerik özetini atar, adı ve uzantıyı korur', () => {
    expect(chunkKey('assets/three-BtJG7nsr.js')).toBe('three.js');
    expect(chunkKey('assets/rapier-BR_-CEU_.js')).toBe('rapier.js');
    expect(chunkKey('assets/index-DSbKZpmp.css')).toBe('index.css');
    expect(chunkKey('assets/my-lazy-module-AbCd1234.js')).toBe('my-lazy-module.js');
  });

  it('kalıba uymayan dosya adı olduğu gibi kalır', () => {
    expect(chunkKey('assets/plain.js')).toBe('plain.js');
  });
});

describe('checkLimit', () => {
  it('sınır altı ok, warnRatio üstü warn, sınır üstü fail', () => {
    expect(checkLimit('a', 80, 100, 0.9).status).toBe('ok');
    expect(checkLimit('a', 90, 100, 0.9).status).toBe('ok');
    expect(checkLimit('a', 95, 100, 0.9).status).toBe('warn');
    expect(checkLimit('a', 100, 100, 0.9).status).toBe('warn');
    expect(checkLimit('a', 101, 100, 0.9).status).toBe('fail');
  });
});

describe('transferBytes / estimateLoadSeconds', () => {
  it('metin dosyası gzip, ikili dosya ham iner', () => {
    expect(transferBytes({ file: 'assets/a.js', raw: 1000, gzip: 300 })).toBe(300);
    expect(transferBytes({ file: 'data/w/features.json', raw: 1000, gzip: 300 })).toBe(300);
    expect(transferBytes({ file: 'data/w/p.geojson', raw: 1000, gzip: 300 })).toBe(300);
    expect(transferBytes({ file: 'data/w/tiles/0_0.height.bin', raw: 1000, gzip: 300 })).toBe(1000);
  });

  it('8 Mbit/s = 1 MB/s', () => {
    expect(estimateLoadSeconds(1_000_000, 8)).toBeCloseTo(1);
    expect(estimateLoadSeconds(5_000_000, 20)).toBeCloseTo(2);
  });
});

describe('evaluateBuild', () => {
  const input: BuildInput = {
    assets: [
      { file: 'assets/index-AAAAAAAA.js', raw: 250_000, gzip: 80_000 },
      { file: 'assets/index-BBBBBBBB.css', raw: 20_000, gzip: 5_000 },
      { file: 'assets/lazy-CCCCCCCC.js', raw: 100_000, gzip: 60_000 },
    ],
    initialFiles: ['assets/index-AAAAAAAA.js', 'assets/index-BBBBBBBB.css'],
    data: [
      { file: 'data/w/world.json', raw: 10_000, gzip: 2_000 },
      { file: 'data/w/tiles/0_0.height.bin', raw: 400_000, gzip: 100_000 },
    ],
  };
  const byLabel = (label: string) =>
    evaluateBuild(input, BUDGET).find((check) => check.label === label);

  it('chunk bütçesi anahtarla eşleşir; bilinmeyen chunk otherChunk kullanır', () => {
    expect(byLabel('index.js (gzip)')).toMatchObject({
      actual: 80_000,
      limit: 100_000,
      status: 'ok',
    });
    expect(byLabel('index.js (ham)')).toMatchObject({
      actual: 250_000,
      limit: 300_000,
      status: 'ok',
    });
    expect(byLabel('index.css (gzip)')).toMatchObject({ limit: 10_000, status: 'ok' });
    expect(byLabel('index.css (ham)')).toBeUndefined();
    expect(byLabel('lazy.js (gzip)')).toMatchObject({ limit: 50_000, status: 'fail' });
  });

  it('açılış yükü yalnızca index.html dosyalarını sayar', () => {
    expect(byLabel('açılış JS + CSS (gzip)')).toMatchObject({ actual: 85_000, limit: 200_000 });
  });

  it('veri toplamı ve en büyük dosya', () => {
    expect(byLabel('dünya verisi toplamı (ham)')?.actual).toBe(410_000);
    expect(byLabel('en büyük veri dosyası (data/w/tiles/0_0.height.bin)')).toMatchObject({
      actual: 400_000,
      limit: 500_000,
      status: 'ok',
    });
  });

  it('tahmini yükleme: açılış gzip + metin veri gzip + ikili veri ham', () => {
    const check = byLabel('tahmini ilk yükleme @ 8 Mbit/s');
    // (80 000 + 5 000) + 2 000 + 400 000 bayt @ 1 MB/s
    expect(check?.actual).toBeCloseTo(0.487, 3);
    expect(check).toMatchObject({ unit: 's', limit: 2, status: 'ok' });
  });
});

describe('BUILD_BUDGET', () => {
  it('oyunun gerçek chunk adlarını kapsar ve oranlar tutarlı', () => {
    expect(Object.keys(BUILD_BUDGET.chunks).sort()).toEqual(
      ['index.css', 'index.js', 'rapier.js', 'three.js'].sort(),
    );
    expect(BUILD_BUDGET.warnRatio).toBeGreaterThan(0);
    expect(BUILD_BUDGET.warnRatio).toBeLessThan(1);
    // Performans bütçesi: ilk yükleme < 10 sn (CLAUDE.md); karo akışıyla (Faz 12) 16/20 sn'lik geçici sınırlar geri çekildi.
    expect(BUILD_BUDGET.load.maxSeconds).toBeLessThanOrEqual(10);
  });
});

describe('modül gruplama', () => {
  it('paket, kapsamlı paket ve src klasörü adları', () => {
    expect(moduleGroupName('node_modules/three/build/three.module.js')).toBe('three');
    expect(moduleGroupName('node_modules/@dimforge/rapier3d-compat/rapier.mjs')).toBe(
      '@dimforge/rapier3d-compat',
    );
    expect(moduleGroupName('node_modules\\.pnpm\\x\\node_modules\\three\\a.js')).toBe('three');
    expect(moduleGroupName('src/world/ChunkManager.ts')).toBe('src/world');
    expect(moduleGroupName('src/config.ts')).toBe('src/config.ts');
    expect(moduleGroupName('\0vite/modulepreload-polyfill.js')).toBe(
      'vite/modulepreload-polyfill.js',
    );
  });

  it('gruplar boyuta göre azalan sıralanır, modül sayısı tutulur', () => {
    const groups = groupModules({
      'src/world/a.ts': 100,
      'src/world/b.ts': 50,
      'src/ui/c.ts': 200,
      'node_modules/three/x.js': 10,
    });
    expect(groups).toEqual([
      { name: 'src/ui', bytes: 200, modules: 1 },
      { name: 'src/world', bytes: 150, modules: 2 },
      { name: 'three', bytes: 10, modules: 1 },
    ]);
  });
});

describe('htmlAssetRefs', () => {
  it('yerel src/href yollarını döndürür; data:, http ve çapa hariç', () => {
    const html = `<link rel="icon" href="data:image/svg+xml,abc" />
      <script type="module" crossorigin src="/anadolu-hayati/assets/index-A.js"></script>
      <link rel="modulepreload" crossorigin href="/anadolu-hayati/assets/three-B.js">
      <link rel="stylesheet" crossorigin href="/anadolu-hayati/assets/index-C.css">
      <a href="https://example.com">x</a><a href="#top">y</a>`;
    expect(htmlAssetRefs(html)).toEqual([
      '/anadolu-hayati/assets/index-A.js',
      '/anadolu-hayati/assets/three-B.js',
      '/anadolu-hayati/assets/index-C.css',
    ]);
  });
});

describe('rapor', () => {
  it('worstStatus: sorun ya da aşım fail, uyarı warn', () => {
    const ok = checkLimit('a', 1, 100, 0.9);
    const warn = checkLimit('b', 95, 100, 0.9);
    const fail = checkLimit('c', 101, 100, 0.9);
    expect(worstStatus([ok], [])).toBe('ok');
    expect(worstStatus([ok, warn], [])).toBe('warn');
    expect(worstStatus([warn, fail], [])).toBe('fail');
    expect(worstStatus([ok], ['eksik dosya'])).toBe('fail');
  });

  it('Markdown tablo, sorunlar ve modül dağılımı', () => {
    const report = renderReport({
      title: 'Derleme raporu',
      checks: [
        checkLimit('index.js (gzip)', 80_000, 100_000, 0.9),
        checkLimit('yük', 1.5, 2, 0.9, 's'),
      ],
      problems: ['index.html: yol yanlış'],
      notes: ['Derleme: Sürüm 0.0.0'],
      moduleGroups: { 'index.js': [{ name: 'src/world', bytes: 1500, modules: 3 }] },
    });
    expect(report).toContain('## Derleme raporu');
    expect(report).toContain('- Derleme: Sürüm 0.0.0');
    expect(report).toContain('| index.js (gzip) | 80.0 kB | 100.0 kB | %80 | ✅ |');
    expect(report).toContain('| yük | 1.5 sn | 2.0 sn | %75 | ✅ |');
    expect(report).toContain('- ❌ index.html: yol yanlış');
    expect(report).toContain('| src/world | 3 | 1.5 kB |');
  });
});
