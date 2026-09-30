import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadRegion, type RegionData } from '../../src/data/region';

export const REGION_ID = 'zonguldak-bartin-karabuk';
const PUBLIC = resolve(__dirname, '../../public');

/** Depodaki gerçek bölge verisini (public/data/regions/…) tarayıcı olmadan yükler. */
export async function loadRealRegion(): Promise<RegionData> {
  return loadRegion(REGION_ID, '/', async (url) => {
    const bytes = await readFile(resolve(PUBLIC, url.replace(/^\//, '')));
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(bytes.toString('utf-8')) as unknown,
      arrayBuffer: async () => buffer,
    };
  });
}
