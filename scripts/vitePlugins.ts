import type { Plugin } from 'vite';
import type { BuildInfo } from '../src/buildInfo.ts';

/** `dist/build-info.json`: yayındaki derlemenin kimliği (`curl …/anadolu-hayati/build-info.json`). */
export const BUILD_INFO_FILE = 'build-info.json';
/** `dist/build-stats.json`: chunk başına modül boyutları (yalnızca `npm run build:analyze`). */
export const BUILD_STATS_FILE = 'build-stats.json';

/** Derleme istatistiği: chunk dosya adı → modül kimliği → çıktıdaki bayt sayısı. */
export interface BuildStats {
  chunks: Record<string, { modules: Record<string, number> }>;
}

export function buildInfoPlugin(info: BuildInfo): Plugin {
  return {
    name: 'anadolu:build-info',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: BUILD_INFO_FILE,
        source: `${JSON.stringify(info, null, 2)}\n`,
      });
    },
  };
}

export function buildStatsPlugin(root: string): Plugin {
  // Mutlak yolları depo köküne göreli yap (rapor makineden bağımsız olsun).
  const relative = (id: string): string =>
    id.startsWith(root) ? id.slice(root.length).replace(/^[\\/]+/, '') : id;
  return {
    name: 'anadolu:build-stats',
    apply: 'build',
    generateBundle(_options, bundle) {
      const stats: BuildStats = { chunks: {} };
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        const modules: Record<string, number> = {};
        for (const [id, module] of Object.entries(output.modules)) {
          if (module.renderedLength > 0) modules[relative(id)] = module.renderedLength;
        }
        stats.chunks[output.fileName] = { modules };
      }
      this.emitFile({
        type: 'asset',
        fileName: BUILD_STATS_FILE,
        source: `${JSON.stringify(stats, null, 2)}\n`,
      });
    },
  };
}
