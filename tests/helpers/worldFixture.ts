import { createHash } from 'node:crypto';
import { WORLD } from '../../src/config';
import type { FetchLike } from '../../src/data/region';
import type { WorldExtent, WorldManifest } from '../../src/data/worldTypes';
import { tileRangeOf } from '../../src/world/lattice';

/** Sentetik karo dünyası: bellek içi dosya haritası + ona bakan `fetch` benzeri. */
export interface WorldFixture {
  id: string;
  manifest: WorldManifest;
  /** Yol (köke göreli) → bayt ya da JSON metni. */
  files: Map<string, Uint8Array | string>;
  fetch: FetchLike;
  /** Örnek `(col, row)` için beklenen yükseklik/örtü değeri. */
  heightAt(col: number, row: number): number;
  coverAt(col: number, row: number): number;
}

export const FIXTURE_ROOT = '/data/world';

export function heightValue(col: number, row: number): number {
  return (col * 31 + row * 17 + 40000) & 0xffff;
}

export function coverValue(col: number, row: number): number {
  return (((col + row) % 9) + 9) % 9;
}

const CLASSES = ['none', 'forest', 'shrub', 'grass', 'crop', 'barren', 'urban', 'snow', 'wetland'];

const PROVINCES = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Test', iso: 'TR-00', inRegion: true },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      },
    },
  ],
};

const FEATURES = {
  version: 1,
  water: {
    lines: [{ kind: 'stream', intermittent: false, xz: [0, 0, 10, 10] }],
    polygons: [],
    points: [],
  },
};

export interface FixtureOptions {
  id?: string;
  extent?: WorldExtent;
  /** Verilen karoları (örn. '0_0') listeden/dosyalardan çıkarır (boşluk testi). */
  omitTiles?: string[];
}

/** `extent` ile kesişen her karoyu üreten geçerli bir sentetik dünya. */
export function makeWorldFixture(options: FixtureOptions = {}): WorldFixture {
  const id = options.id ?? 'test-dunya';
  const extent = options.extent ?? { col0: -600, row0: -20, cols: 1200, rows: 700 };
  const size = WORLD.tileSize;
  const range = tileRangeOf(extent);
  const files = new Map<string, Uint8Array | string>();
  const tiles: WorldManifest['tiles'] = [];

  for (let ty = range.ty0; ty <= range.ty1; ty++) {
    for (let tx = range.tx0; tx <= range.tx1; tx++) {
      const height = new Uint16Array(size * size);
      const cover = new Uint8Array(size * size);
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const col = tx * size + c;
          const row = ty * size + r;
          const inside =
            col >= extent.col0 &&
            col < extent.col0 + extent.cols &&
            row >= extent.row0 &&
            row < extent.row0 + extent.rows;
          height[r * size + c] = inside ? heightValue(col, row) : 0;
          cover[r * size + c] = inside ? coverValue(col, row) : 0;
        }
      }
      const heightBytes = new Uint8Array(height.buffer);
      const name = `${tx}_${ty}`;
      const entry = {
        tx,
        ty,
        height: `tiles/${name}.height.bin`,
        cover: `tiles/${name}.cover.bin`,
        bytes: heightBytes.byteLength,
        sha256: createHash('sha256').update(heightBytes).digest('hex'),
      };
      tiles.push(entry);
      if (options.omitTiles?.includes(name)) continue;
      files.set(entry.height, heightBytes);
      files.set(entry.cover, cover);
    }
  }

  const manifest: WorldManifest = {
    version: 1,
    id,
    name: 'Test Dünyası',
    crs: 'EPSG:32636',
    originUtm: [434085, 4576261],
    horizontalScale: 50,
    cellSizeReal: 100,
    lattice: { anchorX: WORLD.lattice.anchorX, anchorZ: WORLD.lattice.anchorZ },
    tileSize: size,
    extent,
    elevation: { min: 0, max: 2500, encoding: 'uint16' },
    tiles: options.omitTiles
      ? tiles.filter((t) => !options.omitTiles?.includes(`${t.tx}_${t.ty}`))
      : tiles,
    provinces: 'provinces.geojson',
    features: { file: 'features.json', layers: ['water'] },
    landcover: { classes: [...CLASSES] },
    sources: ['test'],
    overtureRelease: '2026-09-23.1',
    built: '2026-10-01',
  };
  files.set('world.json', JSON.stringify(manifest));
  files.set('provinces.geojson', JSON.stringify(PROVINCES));
  files.set('features.json', JSON.stringify(FEATURES));

  const fetchFn: FetchLike = async (url) => {
    const path = url.replace(/\?.*$/, '').replace(`${FIXTURE_ROOT}/${id}/`, '');
    const file = files.get(path);
    if (file === undefined) {
      return {
        ok: false,
        status: 404,
        json: async () => null,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    const bytes = typeof file === 'string' ? new TextEncoder().encode(file) : file;
    return {
      ok: true,
      status: 200,
      json: async () =>
        JSON.parse(typeof file === 'string' ? file : new TextDecoder().decode(bytes)) as unknown,
      arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
    };
  };

  return { id, manifest, files, fetch: fetchFn, heightAt: heightValue, coverAt: coverValue };
}

/** Fixture'ın `loadWorld` çağrısı için taban adresi (`BASE_URL` yerine). */
export const FIXTURE_BASE = '/';
