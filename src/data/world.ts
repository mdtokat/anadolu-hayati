import { HORIZONTAL_SCALE, PROVINCE_PLACES, TELEPORTS, WORLD } from '../config';
import { latLonToGame } from '../world/geo';
import { gridOriginOf, LATTICE_CELL, tileRangeOf } from '../world/lattice';
import { classesMatch } from './landcover';
import {
  parseFeatures,
  parseProvinces,
  RegionDataError,
  type FetchLike,
  type RegionData,
  type RegionMeta,
} from './region';
import {
  WORLD_MANIFEST_VERSION,
  type WorldExtent,
  type WorldManifest,
  type WorldFileEntry,
  type WorldTileEntry,
} from './worldTypes';
import { parseSettlements } from './settlements';
import { thinFeatures } from './waterThinning';

/** Dünya manifesti + karo verisi yükleyicisi: sözleşme docs/faz-7-paralel-plan.md §3.2–§3.3. */

function fail(message: string): never {
  throw new RegionDataError(`Dünya verisi geçersiz: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value === '') fail(`'${key}' metin olmalı`);
  return value;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`'${key}' sayı olmalı`);
  return value;
}

function readInt(record: Record<string, unknown>, key: string): number {
  const value = readNumber(record, key);
  if (!Number.isInteger(value)) fail(`'${key}' tam sayı olmalı`);
  return value;
}

function readStringList(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    fail(`'${key}' metin listesi olmalı`);
  }
  return value as string[];
}

/** Manifeste göreli, kökten çıkmayan dosya yolu (`..` ve mutlak yol yok). */
function readRelativePath(record: Record<string, unknown>, key: string): string {
  const path = readString(record, key);
  if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) {
    fail(`'${key}' göreli ve kökten çıkmayan bir yol olmalı (${path})`);
  }
  return path;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Karo başına yükseklik dosyasının bayt sayısı: `tileSize² × 2` (uint16). */
export const TILE_HEIGHT_BYTES = WORLD.tileSize * WORLD.tileSize * 2;
/** Karo başına arazi örtüsü dosyasının bayt sayısı: `tileSize²` (uint8). */
export const TILE_COVER_BYTES = WORLD.tileSize * WORLD.tileSize;

function parseExtent(value: unknown): WorldExtent {
  if (!isRecord(value)) fail("'extent' { col0, row0, cols, rows } olmalı");
  const extent: WorldExtent = {
    col0: readInt(value, 'col0'),
    row0: readInt(value, 'row0'),
    cols: readInt(value, 'cols'),
    rows: readInt(value, 'rows'),
  };
  if (extent.cols <= 0 || extent.rows <= 0) fail("'extent' boyutu pozitif olmalı");
  return extent;
}

function parseTile(value: unknown): WorldTileEntry {
  if (!isRecord(value)) fail('karo girdisi bir nesne olmalı');
  const tile: WorldTileEntry = {
    tx: readInt(value, 'tx'),
    ty: readInt(value, 'ty'),
    height: readRelativePath(value, 'height'),
    cover: readRelativePath(value, 'cover'),
    bytes: readInt(value, 'bytes'),
    sha256: readString(value, 'sha256'),
  };
  const name = `karo (${tile.tx}, ${tile.ty})`;
  if (tile.bytes !== TILE_HEIGHT_BYTES) {
    fail(`${name}: 'bytes' ${tile.bytes}, beklenen ${TILE_HEIGHT_BYTES}`);
  }
  if (!SHA256_HEX.test(tile.sha256))
    fail(`${name}: 'sha256' 64 haneli küçük harf onaltılık olmalı`);
  return tile;
}

/**
 * `world.json`'ı katı doğrular. Sözleşmeyle uyuşmayan (kafes çapası, yatay ölçek, karo boyu, sınıf tablosu),
 * kapsaması dikdörtgen/boşluksuz olmayan ya da yinelenen karo içeren manifest `RegionDataError` verir.
 */
export function parseWorldManifest(json: unknown): WorldManifest {
  if (!isRecord(json)) fail('world.json bir nesne olmalı');

  if (json.version !== WORLD_MANIFEST_VERSION) {
    fail(`'version' ${String(json.version)}, desteklenen ${WORLD_MANIFEST_VERSION}`);
  }

  const origin = json.originUtm;
  if (!Array.isArray(origin) || origin.length !== 2 || !origin.every((v) => Number.isFinite(v))) {
    fail("'originUtm' [easting, northing] olmalı");
  }

  const horizontalScale = readNumber(json, 'horizontalScale');
  if (horizontalScale !== HORIZONTAL_SCALE) {
    fail(
      `veri yatay ölçeği ${horizontalScale} ile üretilmiş, config.ts HORIZONTAL_SCALE = ${HORIZONTAL_SCALE}. ` +
        'Veriyi yeniden üret (tools/build_world.py) ya da ölçeği eşitle.',
    );
  }

  const cellSizeReal = readNumber(json, 'cellSizeReal');
  if (cellSizeReal / HORIZONTAL_SCALE !== LATTICE_CELL) {
    fail(
      `'cellSizeReal' ${cellSizeReal}, kafes hücresi ${LATTICE_CELL * HORIZONTAL_SCALE} m olmalı`,
    );
  }

  const lattice = json.lattice;
  if (!isRecord(lattice)) fail("'lattice' { anchorX, anchorZ } olmalı");
  const anchorX = readNumber(lattice, 'anchorX');
  const anchorZ = readNumber(lattice, 'anchorZ');
  if (anchorX !== WORLD.lattice.anchorX || anchorZ !== WORLD.lattice.anchorZ) {
    fail(
      `kafes çapası (${anchorX}, ${anchorZ}), config.ts WORLD.lattice (${WORLD.lattice.anchorX}, ` +
        `${WORLD.lattice.anchorZ}) ile aynı olmalı`,
    );
  }

  const tileSize = readInt(json, 'tileSize');
  if (tileSize !== WORLD.tileSize) {
    fail(`'tileSize' ${tileSize}, config.ts WORLD.tileSize = ${WORLD.tileSize}`);
  }

  const extent = parseExtent(json.extent);

  const elevation = json.elevation;
  if (!isRecord(elevation)) fail("'elevation' { min, max, encoding } olmalı");
  if (elevation.encoding !== 'uint16') fail("'elevation.encoding' 'uint16' olmalı");
  const elevationMin = readNumber(elevation, 'min');
  const elevationMax = readNumber(elevation, 'max');
  if (elevationMax <= elevationMin) fail("'elevation.max' > 'elevation.min' olmalı");

  if (!Array.isArray(json.tiles)) fail("'tiles' bir liste olmalı");
  const tiles = json.tiles.map(parseTile);
  const seen = new Set<string>();
  for (const tile of tiles) {
    const key = `${tile.tx}_${tile.ty}`;
    if (seen.has(key)) fail(`karo (${tile.tx}, ${tile.ty}) birden fazla kez listelenmiş`);
    seen.add(key);
  }
  const range = tileRangeOf(extent);
  const expected = (range.tx1 - range.tx0 + 1) * (range.ty1 - range.ty0 + 1);
  for (const tile of tiles) {
    if (tile.tx < range.tx0 || tile.tx > range.tx1 || tile.ty < range.ty0 || tile.ty > range.ty1) {
      fail(`karo (${tile.tx}, ${tile.ty}) extent ile kesişmiyor`);
    }
  }
  if (tiles.length !== expected) {
    fail(
      `extent ${expected} karo gerektirir (tx ${range.tx0}…${range.tx1}, ty ${range.ty0}…${range.ty1}), ` +
        `manifestte ${tiles.length} var (kapsama boşluksuz olmalı)`,
    );
  }

  const features = json.features;
  if (!isRecord(features)) fail("'features' { file, layers } olmalı");
  const landcover = json.landcover;
  if (!isRecord(landcover)) fail("'landcover' { classes } olmalı");
  const classes = readStringList(landcover, 'classes');
  if (!classesMatch(classes)) {
    fail(
      `landcover sınıf tablosu kodla uyuşmuyor (veri: ${classes.join(', ')}). ` +
        'Veriyi yeniden üret (tools/build_world.py) ya da src/data/landcover.ts ile eşitle.',
    );
  }

  let settlements: WorldFileEntry | null = null;
  if (json.settlements !== undefined && json.settlements !== null) {
    if (!isRecord(json.settlements)) fail("'settlements' { file, bytes, sha256 } olmalı");
    settlements = {
      file: readRelativePath(json.settlements, 'file'),
      bytes: readInt(json.settlements, 'bytes'),
      sha256: readString(json.settlements, 'sha256'),
    };
    if (!SHA256_HEX.test(settlements.sha256))
      fail("'settlements.sha256' 64 haneli onaltılık olmalı");
  }

  return {
    version: WORLD_MANIFEST_VERSION,
    id: readString(json, 'id'),
    name: readString(json, 'name'),
    crs: readString(json, 'crs'),
    originUtm: [origin[0] as number, origin[1] as number],
    horizontalScale,
    cellSizeReal,
    lattice: { anchorX, anchorZ },
    tileSize,
    extent,
    elevation: { min: elevationMin, max: elevationMax, encoding: 'uint16' },
    tiles,
    provinces: readRelativePath(json, 'provinces'),
    features: {
      file: readRelativePath(features, 'file'),
      layers: readStringList(features, 'layers'),
    },
    landcover: { classes },
    sources: readStringList(json, 'sources'),
    ...(settlements ? { settlements } : {}),
    overtureRelease: readString(json, 'overtureRelease'),
    built: readString(json, 'built'),
  };
}

/** Karo dosyalarının önbellek tazeleme son eki: SHA-256'nın ilk 8 hanesi (§3.2). */
function cacheTag(tile: WorldTileEntry): string {
  return `?v=${tile.sha256.slice(0, 8)}`;
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  // Güvenli olmayan bağlamda (http, localhost dışı) SubtleCrypto yoktur: bütünlük denetimi atlanır,
  // boyut denetimi yine yapılır.
  if (!subtle) return null;
  const digest = new Uint8Array(await subtle.digest('SHA-256', buffer));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** Bu platform little-endian mı? (karolar little-endian yazılır.) */
function platformIsLittleEndian(): boolean {
  return new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
}

/** Karo (tileSize × tileSize) ile extent'in kesişimi: karo ve hedef dizideki dikdörtgenler. */
function tileWindow(tile: WorldTileEntry, extent: WorldExtent) {
  const size = WORLD.tileSize;
  const col0 = Math.max(tile.tx * size, extent.col0);
  const col1 = Math.min((tile.tx + 1) * size, extent.col0 + extent.cols);
  const row0 = Math.max(tile.ty * size, extent.row0);
  const row1 = Math.min((tile.ty + 1) * size, extent.row0 + extent.rows);
  return {
    width: col1 - col0,
    rows: row1 - row0,
    /** Karo içindeki ilk sütun/satır. */
    srcCol: col0 - tile.tx * size,
    srcRow: row0 - tile.ty * size,
    /** Birleştirilmiş dizideki ilk sütun/satır. */
    dstCol: col0 - extent.col0,
    dstRow: row0 - extent.row0,
  };
}

/** Manifestten bellek içi bölge üst verisi (dizi boyutu = `extent`). */
export function regionMetaOf(manifest: WorldManifest): RegionMeta {
  return {
    id: manifest.id,
    name: manifest.name,
    crs: manifest.crs,
    originUtm: manifest.originUtm,
    gridWidth: manifest.extent.cols,
    gridHeight: manifest.extent.rows,
    cellSizeReal: manifest.cellSizeReal,
    elevationMin: manifest.elevation.min,
    elevationMax: manifest.elevation.max,
    elevationEncoding: 'uint16',
    horizontalScale: manifest.horizontalScale,
    sources: manifest.sources,
    features: manifest.features.layers,
    landcover: { file: 'tiles/*.cover.bin', classes: manifest.landcover.classes },
    gridOrigin: gridOriginOf(manifest.extent),
  };
}

/**
 * Dünyayı yükler: `world.json` + (karo yükseklik/örtü dosyaları) + provinces.geojson + features.json,
 * tek `RegionData`'ya birleştirir (`gridOrigin` = `gridOriginOf(extent)`).
 * `baseUrl`: Vite `BASE_URL`; dosyalar `<base>data/world/<id>/` altındadır (`WORLD.basePath`).
 */
export async function loadWorld(
  id: string,
  baseUrl: string = import.meta.env.BASE_URL,
  fetchImpl: FetchLike = (url) => fetch(url),
): Promise<RegionData> {
  const root = `${baseUrl}${WORLD.basePath}/${id}`;

  async function get(file: string, tag = '') {
    const response = await fetchImpl(`${root}/${file}${tag}`);
    if (!response.ok) fail(`${file} indirilemedi (HTTP ${response.status})`);
    return response;
  }

  const manifest = parseWorldManifest(await (await get('world.json')).json());
  if (manifest.id !== id) fail(`world.json id'si '${manifest.id}', beklenen '${id}'`);

  const { extent } = manifest;
  const width = extent.cols;
  const height = extent.rows;
  const size = WORLD.tileSize;
  const heights = new Uint16Array(width * height);
  const landcover = new Uint8Array(width * height);
  const littleEndian = platformIsLittleEndian();
  const knownClasses = manifest.landcover.classes.length;

  const loadTile = async (tile: WorldTileEntry) => {
    const name = `karo (${tile.tx}, ${tile.ty})`;
    const [heightBuffer, coverBuffer] = await Promise.all([
      get(tile.height, cacheTag(tile)).then((r) => r.arrayBuffer()),
      get(tile.cover, cacheTag(tile)).then((r) => r.arrayBuffer()),
    ]);
    if (heightBuffer.byteLength !== tile.bytes) {
      fail(`${name} yüksekliği ${heightBuffer.byteLength} bayt, manifestte ${tile.bytes}`);
    }
    if (coverBuffer.byteLength !== TILE_COVER_BYTES) {
      fail(`${name} örtüsü ${coverBuffer.byteLength} bayt, beklenen ${TILE_COVER_BYTES}`);
    }
    const sha = await sha256Hex(heightBuffer);
    if (sha !== null && sha !== tile.sha256)
      fail(`${name} yüksekliği sha256 uyuşmuyor (bozuk dosya?)`);

    const source = littleEndian ? new Uint16Array(heightBuffer) : readLittleEndian(heightBuffer);
    const cover = new Uint8Array(coverBuffer);
    const win = tileWindow(tile, extent);
    for (let r = 0; r < win.rows; r++) {
      const src = (win.srcRow + r) * size + win.srcCol;
      const dst = (win.dstRow + r) * width + win.dstCol;
      heights.set(source.subarray(src, src + win.width), dst);
      const coverRow = cover.subarray(src, src + win.width);
      for (let i = 0; i < coverRow.length; i++) {
        if ((coverRow[i] as number) >= knownClasses) {
          fail(
            `${name} örtüsünde bilinmeyen sınıf değeri (satır ${win.srcRow + r}, sütun ${win.srcCol + i})`,
          );
        }
      }
      landcover.set(coverRow, dst);
    }
  };

  const loadSettlements = async (entry: WorldFileEntry) => {
    const buffer = await (await get(entry.file, `?v=${entry.sha256.slice(0, 8)}`)).arrayBuffer();
    if (buffer.byteLength !== entry.bytes) {
      fail(`${entry.file} ${buffer.byteLength} bayt, manifestte ${entry.bytes}`);
    }
    const sha = await sha256Hex(buffer);
    if (sha !== null && sha !== entry.sha256) fail(`${entry.file} sha256 uyuşmuyor (bozuk dosya?)`);
    return parseSettlements(JSON.parse(new TextDecoder().decode(buffer)));
  };

  const [, provinces, features, settlements] = await Promise.all([
    Promise.all(manifest.tiles.map(loadTile)),
    get(manifest.provinces).then((r) => r.json()),
    manifest.features.layers.length > 0
      ? get(manifest.features.file).then((r) => r.json())
      : Promise.resolve(null),
    manifest.settlements ? loadSettlements(manifest.settlements) : Promise.resolve(null),
  ]);

  const meta = regionMetaOf(manifest);

  return {
    meta,
    heights,
    provinces: parseProvinces(provinces),
    // Küçük dereler ayıklanır (`WATER_THINNING`): oyun ve testler aynı su ağını görür.
    features:
      features === null
        ? null
        : thinFeatures(parseFeatures(features), waterAnchors(settlements, manifest.originUtm)),
    landcover,
    settlements,
  };
}

/**
 * Küçük dere ayıklamasında korunacak noktalar: il/ilçe merkezleri (yanından geçen öbek kısa olsa da kalır, birkaç
 * hücrelik parça değilse: `minAnchoredLength`) ve oyunun yer adları / ışınlanma noktaları (yanından geçen öbek her
 * uzunlukta kalır: oyuncunun başladığı ya da ışınlandığı yerde içme suyu olsun).
 */
export function waterAnchors(
  settlements: { settlements: ReadonlyArray<{ rank: string; x: number; z: number }> } | null,
  origin: readonly [number, number],
): Array<{ x: number; z: number; keepShort?: boolean }> {
  const out: Array<{ x: number; z: number; keepShort?: boolean }> = [];
  for (const s of settlements?.settlements ?? [])
    if (s.rank !== 'koy') out.push({ x: s.x, z: s.z });
  // Yer adı/ışınlanma noktaları hayatta kalma başlangıcıdır: yakındaki su kısa olsa da kalır (`tests/pilotPlaces`).
  const places = [...Object.values(PROVINCE_PLACES).flat(), ...TELEPORTS];
  for (const p of places) out.push({ ...latLonToGame(p.lat, p.lon, origin), keepShort: true });
  return out;
}

function readLittleEndian(buffer: ArrayBuffer): Uint16Array {
  const view = new DataView(buffer);
  const out = new Uint16Array(buffer.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}
