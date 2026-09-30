import { HORIZONTAL_SCALE } from '../config';
import type { UtmOrigin } from '../world/geo';

/** public/data/regions/<id>/meta.json (bkz. CLAUDE.md "Bölge Veri Formatı"). */
export interface RegionMeta {
  id: string;
  name: string;
  crs: string;
  originUtm: UtmOrigin;
  gridWidth: number;
  gridHeight: number;
  /** Izgara hücre boyu (gerçek metre). */
  cellSizeReal: number;
  elevationMin: number;
  elevationMax: number;
  elevationEncoding: 'uint16';
  horizontalScale: number;
  sources: string[];
}

/** Bir çokgen: dış halka + delikler. Halkalar düz [x0, z0, x1, z1, ...] dizisidir (oyun X/Z). */
export type Polygon = Float64Array[];

export interface ProvinceShape {
  name: string;
  iso: string;
  /** Bölgenin hedef ili mi (true), yoksa yürünebilir komşu il mi (false)? */
  inRegion: boolean;
  polygons: Polygon[];
  /** Hızlı eleme için sınır kutusu. */
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}

export interface RegionData {
  meta: RegionMeta;
  /** Nicemlenmiş yükseklikler (uint16), satır satır (kuzey→güney, batı→doğu). */
  heights: Uint16Array;
  provinces: ProvinceShape[];
}

/** Veri bozuksa ya da sözleşmeyle uyuşmuyorsa fırlatılır. */
export class RegionDataError extends Error {}

function fail(message: string): never {
  throw new RegionDataError(`Bölge verisi geçersiz: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function readPositiveInt(record: Record<string, unknown>, key: string): number {
  const value = readNumber(record, key);
  if (!Number.isInteger(value) || value <= 0) fail(`'${key}' pozitif tam sayı olmalı`);
  return value;
}

/** meta.json'ı doğrular. `horizontalScale`, config'deki HORIZONTAL_SCALE ile aynı olmalıdır. */
export function parseMeta(json: unknown): RegionMeta {
  if (!isRecord(json)) fail('meta.json bir nesne olmalı');

  const origin = json.originUtm;
  if (!Array.isArray(origin) || origin.length !== 2 || !origin.every((v) => Number.isFinite(v))) {
    fail("'originUtm' [easting, northing] olmalı");
  }
  if (json.elevationEncoding !== 'uint16') fail("'elevationEncoding' 'uint16' olmalı");

  const horizontalScale = readNumber(json, 'horizontalScale');
  if (horizontalScale !== HORIZONTAL_SCALE) {
    fail(
      `veri yatay ölçeği ${horizontalScale} ile üretilmiş, config.ts HORIZONTAL_SCALE = ${HORIZONTAL_SCALE}. ` +
        'Veriyi yeniden üret (tools/build_region.py) ya da ölçeği eşitle.',
    );
  }

  const elevationMin = readNumber(json, 'elevationMin');
  const elevationMax = readNumber(json, 'elevationMax');
  if (elevationMax <= elevationMin) fail("'elevationMax' > 'elevationMin' olmalı");

  const cellSizeReal = readNumber(json, 'cellSizeReal');
  if (cellSizeReal <= 0) fail("'cellSizeReal' pozitif olmalı");

  return {
    id: readString(json, 'id'),
    name: readString(json, 'name'),
    crs: readString(json, 'crs'),
    originUtm: [origin[0] as number, origin[1] as number],
    gridWidth: readPositiveInt(json, 'gridWidth'),
    gridHeight: readPositiveInt(json, 'gridHeight'),
    cellSizeReal,
    elevationMin,
    elevationMax,
    elevationEncoding: 'uint16',
    horizontalScale,
    sources: Array.isArray(json.sources) ? json.sources.filter((s) => typeof s === 'string') : [],
  };
}

/** Bu platform little-endian mı? (heightmap.bin little-endian yazılır.) */
function platformIsLittleEndian(): boolean {
  return new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
}

/** heightmap.bin'i (little-endian uint16) doğrulayıp Uint16Array'e çevirir. */
export function parseHeightmap(buffer: ArrayBuffer, meta: RegionMeta): Uint16Array {
  const expected = meta.gridWidth * meta.gridHeight * 2;
  if (buffer.byteLength !== expected) {
    fail(
      `heightmap.bin ${buffer.byteLength} bayt, beklenen ${expected} (${meta.gridWidth}×${meta.gridHeight}×2)`,
    );
  }
  if (platformIsLittleEndian()) return new Uint16Array(buffer);

  // Big-endian platform: baytları elle çöz.
  const view = new DataView(buffer);
  const out = new Uint16Array(meta.gridWidth * meta.gridHeight);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}

function parseRing(ring: unknown): Float64Array {
  if (!Array.isArray(ring) || ring.length < 4) fail('halka en az 4 nokta içermeli');
  const out = new Float64Array(ring.length * 2);
  ring.forEach((point: unknown, i) => {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      fail('halka noktası [x, z] olmalı');
    }
    out[i * 2] = point[0] as number;
    out[i * 2 + 1] = point[1] as number;
  });
  return out;
}

function ringBounds(rings: Float64Array[]) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i] as number);
      maxX = Math.max(maxX, ring[i] as number);
      minZ = Math.min(minZ, ring[i + 1] as number);
      maxZ = Math.max(maxZ, ring[i + 1] as number);
    }
  }
  return { minX, minZ, maxX, maxZ };
}

/** provinces.geojson'ı (oyun X/Z koordinatlı) doğrulayıp çokgen yapılarına çevirir. */
export function parseProvinces(json: unknown): ProvinceShape[] {
  if (!isRecord(json) || !Array.isArray(json.features))
    fail('provinces.geojson bir FeatureCollection olmalı');

  return json.features.map((feature: unknown): ProvinceShape => {
    if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) {
      fail('il özelliği (Feature) geçersiz');
    }
    const { type, coordinates } = feature.geometry;
    let polygonCoords: unknown[];
    if (type === 'Polygon') polygonCoords = [coordinates];
    else if (type === 'MultiPolygon' && Array.isArray(coordinates)) polygonCoords = coordinates;
    else return fail(`desteklenmeyen geometri: ${String(type)}`);

    const polygons = polygonCoords.map((polygon) => {
      if (!Array.isArray(polygon) || polygon.length === 0) fail('çokgen en az bir halka içermeli');
      return polygon.map(parseRing);
    });

    return {
      name: readString(feature.properties, 'name'),
      iso: typeof feature.properties.iso === 'string' ? feature.properties.iso : '',
      inRegion: feature.properties.inRegion === true,
      polygons,
      bounds: ringBounds(polygons.flat()),
    };
  });
}

type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/**
 * Bölgeyi yükler: meta.json + heightmap.bin + provinces.geojson.
 * `baseUrl`: Vite `BASE_URL` (GitHub Pages'te /anadolu-hayati/) — dosyalar `<base>data/regions/<id>/` altındadır.
 */
export async function loadRegion(
  id: string,
  baseUrl: string = import.meta.env.BASE_URL,
  fetchImpl: FetchLike = (url) => fetch(url),
): Promise<RegionData> {
  const root = `${baseUrl}data/regions/${id}`;

  async function get(file: string) {
    const response = await fetchImpl(`${root}/${file}`);
    if (!response.ok) fail(`${file} indirilemedi (HTTP ${response.status})`);
    return response;
  }

  const meta = parseMeta(await (await get('meta.json')).json());
  if (meta.id !== id) fail(`meta.json id'si '${meta.id}', beklenen '${id}'`);

  const [heightmap, provinces] = await Promise.all([
    get('heightmap.bin').then((r) => r.arrayBuffer()),
    get('provinces.geojson').then((r) => r.json()),
  ]);

  return { meta, heights: parseHeightmap(heightmap, meta), provinces: parseProvinces(provinces) };
}
