import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { BUILD_BUDGET } from './scripts/buildBudget.ts';
import { resolveBuildInfo } from './scripts/buildInfo.ts';
import { PAGES_BASE } from './scripts/site.ts';
import { buildInfoPlugin, buildStatsPlugin } from './scripts/vitePlugins.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Dev sunucusu kökten ('/') çalışır; üretim derlemesi ve onu önizleyen `vite preview`
// alt yolu kullanır (preview, derlenen dosyaların yollarıyla aynı base'e ihtiyaç duyar).
// `--mode analyze` (`npm run build:analyze`): kaynak haritaları + modül boyutu istatistiği; yine üretim derlemesidir.
export default defineConfig(({ command, isPreview, mode }) => {
  const analyze = mode === 'analyze';
  const buildInfo = resolveBuildInfo(pkg.version);
  return {
    base: command === 'build' || isPreview ? PAGES_BASE : '/',
    define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
    plugins: [buildInfoPlugin(buildInfo), ...(analyze ? [buildStatsPlugin(root)] : [])],
    build: {
      target: 'es2022',
      sourcemap: analyze,
      // rapier3d-compat WASM'ı base64 gömülü getirir (~4,3 MB); uyarı eşiği bütçeyle aynıdır
      // (`scripts/buildBudget.ts`; bütçe aşımını `npm run build:check` hata olarak yakalar).
      chunkSizeWarningLimit: BUILD_BUDGET.chunks['rapier.js'].rawKB,
      rolldownOptions: {
        output: {
          // Bağımlılıklar ayrı chunk'larda: oyun kodu değişince tarayıcı önbelleği bozulmaz.
          codeSplitting: {
            groups: [
              { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]rapier3d-compat/ },
              { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
