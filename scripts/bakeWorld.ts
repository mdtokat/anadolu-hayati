/**
 * `npm run bake [dünya-id] [--public <klasör>]`: dünya verisinin akışlı biçimini üretir (Faz 12, karo akışı).
 *
 * Açılışta hesaplanan her şeyi (dere yatakları, yol ağı/planı, yapı düzeni, terasler, tünel delikleri) oyunun kendi
 * koduyla bir kez hesaplar; karolara pencere/yama/örtü yazar. Çıktı: `public/data/world/<id>/stream.json` ve
 * `stream/`. Sıra: `build_world.py` → `build_settlements.py` → `npm run bake` (`world.json` değişince yeniden bake).
 * Node ≥ 22.18 (tür ayıklama); `src/` modülleri Vite'ın `ssrLoadModule`'üyle yüklenir (uzantısız içe aktarmalar).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');

const args = process.argv.slice(2);
const publicIndex = args.indexOf('--public');
const publicDir = resolve(ROOT, publicIndex >= 0 ? (args[publicIndex + 1] ?? 'public') : 'public');
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--public');

const server = await createServer({
  root: ROOT,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});

try {
  const { WORLD } = (await server.ssrLoadModule('/src/config.ts')) as {
    WORLD: { id: string; basePath: string };
  };
  const { loadWorld } = (await server.ssrLoadModule('/src/data/world.ts')) as {
    loadWorld: (
      id: string,
      base: string,
      fetchImpl: (url: string) => Promise<unknown>,
    ) => Promise<unknown>;
  };
  const { bakeWorld } = (await server.ssrLoadModule('/src/data/worldBake.ts')) as {
    bakeWorld: (
      region: unknown,
      world: { bytes: number; sha256: string },
      onProgress: (message: string) => void,
    ) => Promise<{
      manifest: unknown;
      files: Array<{ path: string; bytes: Uint8Array }>;
    }>;
  };

  const id = positional[0] ?? WORLD.id;
  const worldDir = join(publicDir, WORLD.basePath, id);
  const fsFetch = async (url: string) => {
    const path = url.replace(/\?.*$/, '').replace(/^\//, '');
    try {
      const bytes = readFileSync(resolve(publicDir, path));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(bytes.toString('utf-8')) as unknown,
        arrayBuffer: async () => buffer,
      };
    } catch {
      return {
        ok: false,
        status: 404,
        json: async () => null,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
  };

  const started = performance.now();
  console.log(`Bake: ${id} (${worldDir})`);
  const region = await loadWorld(id, '/', fsFetch);
  const worldBytes = readFileSync(join(worldDir, 'world.json'));
  const worldFile = {
    bytes: worldBytes.length,
    sha256: createHash('sha256').update(worldBytes).digest('hex'),
  };
  const result = await bakeWorld(region, worldFile, (message) => console.log(`  ${message}`));

  rmSync(join(worldDir, 'stream'), { recursive: true, force: true });
  rmSync(join(worldDir, 'stream.json'), { force: true });
  let total = 0;
  for (const file of result.files) {
    const target = join(worldDir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.bytes);
    total += file.bytes.length;
  }
  writeFileSync(join(worldDir, 'stream.json'), `${JSON.stringify(result.manifest, null, 2)}\n`);
  console.log(
    `Bake tamam: ${result.files.length} dosya, ${(total / 1e6).toFixed(1)} MB, ` +
      `${((performance.now() - started) / 1000).toFixed(1)} sn`,
  );
} finally {
  await server.close();
}
