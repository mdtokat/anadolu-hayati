import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORLD } from '../../src/config';
import type { FetchLike } from '../../src/data/region';
import { bakeWorld, type BakeResult } from '../../src/data/worldBake';
import { loadWorldStream, type StreamedWorldData } from '../../src/data/worldStreamLoader';
import { publicFsFetch } from './fsFetch';
import { loadRealWorld } from './realRegion';

/**
 * Gerçek dünyanın akışlı hâli (testler): bake belleğe bir kez yapılır (~25 sn, modül düzeyinde önbellekli) ve
 * `stream.json` + `stream/…` dosyaları bellekten, gerisi (world.json, il sınırları, su) depodan sunulur.
 */
let cached: Promise<BakeResult> | null = null;

const WORLD_DIR = resolve(__dirname, '../../public/data/world', WORLD.id);

export function bakedWorld(): Promise<BakeResult> {
  cached ??= (async () => {
    const region = await loadRealWorld();
    const bytes = readFileSync(resolve(WORLD_DIR, 'world.json'));
    return bakeWorld(region, {
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  })();
  return cached;
}

/** Bellekteki bake çıktısını (ve depodaki geri kalan dosyaları) sunan `fetch` benzeri. */
export function streamFetch(baked: BakeResult, tamper?: (path: string) => boolean): FetchLike {
  const real = publicFsFetch();
  const root = `/data/world/${WORLD.id}/`;
  return async (url) => {
    const path = url.replace(/\?.*$/, '');
    if (!path.startsWith(root)) return real(url);
    const rel = path.slice(root.length);
    if (rel === 'stream.json') {
      const json = JSON.parse(JSON.stringify(baked.manifest)) as unknown;
      return {
        ok: true,
        status: 200,
        json: async () => json,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    const file = baked.files.find((f) => f.path === rel);
    if (!file) return real(url);
    const copy = file.bytes.slice();
    if (tamper?.(rel)) copy[copy.length - 1] = (copy[copy.length - 1] as number) ^ 0xff;
    return {
      ok: true,
      status: 200,
      json: async () => null,
      arrayBuffer: async () => copy.buffer as ArrayBuffer,
    };
  };
}

export async function loadStreamedWorld(): Promise<StreamedWorldData> {
  const baked = await bakedWorld();
  const data = await loadWorldStream(WORLD.id, '/', streamFetch(baked));
  if (!data) throw new Error('akışlı dünya yüklenemedi');
  return data;
}
