import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FetchLike } from '../../src/data/region';

/** `public/` klasörünü kök alan, Node `fs` tabanlı `fetch` benzeri (sorgu dizisi `?v=…` yok sayılır). */
export function publicFsFetch(publicDir: string = resolve(__dirname, '../../public')): FetchLike {
  return async (url) => {
    const path = url.replace(/\?.*$/, '').replace(/^\//, '');
    let bytes: Buffer;
    try {
      bytes = await readFile(resolve(publicDir, path));
    } catch {
      return {
        ok: false,
        status: 404,
        json: async () => null,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
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
  };
}
