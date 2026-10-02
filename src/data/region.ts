import { HORIZONTAL_SCALE } from '../config';
import type { SettlementsData } from './settlements';
import { classesMatch, type LandCoverMeta } from './landcover';
import type { UtmOrigin } from '../world/geo';

/** Bellek içi bölge üst verisi: dünya manifestinden türetilir (bkz. CLAUDE.md "Bölge Veri Formatı", `loadWorld`). */
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
  /** features.json'daki katmanlar (Faz 3: ['water']); boşsa dosya yoktur. */
  features: string[];
  /** landcover.bin bilgisi (Faz 4); dosya yoksa null. */
  landcover: LandCoverMeta | null;
  /**
   * Birleştirilmiş dizinin (0, 0) örneğinin merkez konumu (oyun m): `x(c) = gridOrigin.x + c · hücre`,
   * `z(r) = gridOrigin.z + r · hücre` (hücre = `cellSizeReal / HORIZONTAL_SCALE`). Faz 7 dünyasında kafes
   * çapalıdır (örn. `{ x: -2867, z: -1175 }`); eski, orijin-merkezli `meta.json`'da alan yoktur ve
   * `parseMeta` merkezli değeri türetir: `x = −(gridWidth − 1) / 2 · hücre` (z benzer).
   */
  gridOrigin: { x: number; z: number };
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

export type WaterLineKind = 'river' | 'stream' | 'canal';
export type WaterPolygonKind = 'lake' | 'reservoir' | 'pond' | 'water';

/** Akarsu çizgisi: düz [x0, z0, x1, z1, ...] (oyun X/Z). */
export interface WaterLine {
  kind: WaterLineKind;
  name?: string;
  /** Mevsimlik/kuruyabilen akarsu (OSM `intermittent`). */
  intermittent: boolean;
  xz: Float64Array;
}

/** Durgun su çokgeni: dış halka + delikler. */
export interface WaterPolygon {
  kind: WaterPolygonKind;
  name?: string;
  rings: Float64Array[];
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}

export interface WaterPoint {
  kind: 'spring';
  name?: string;
  x: number;
  z: number;
}

/** Tatlı su özellikleri (deniz dahil değildir; deniz heightmap'in 0 m seviyesidir). */
export interface WaterFeatures {
  lines: WaterLine[];
  polygons: WaterPolygon[];
  points: WaterPoint[];
}

export interface RegionFeatures {
  water: WaterFeatures;
}

export interface RegionData {
  meta: RegionMeta;
  /** Nicemlenmiş yükseklikler (uint16), satır satır (kuzey→güney, batı→doğu). */
  heights: Uint16Array;
  provinces: ProvinceShape[];
  /** Haritadaki özellikler (features.json); meta.features boşsa null. */
  features: RegionFeatures | null;
  /** Arazi örtüsü sınıfları (uint8), heightmap ile aynı ızgara ve sıra; meta.landcover yoksa null. */
  landcover: Uint8Array | null;
  /** Yerleşimler, yollar, simge yapılar (Faz 10); veri yoksa null ya da tanımsız. */
  settlements?: SettlementsData | null;
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
        'Veriyi yeniden üret (tools/build_world.py) ya da ölçeği eşitle.',
    );
  }

  const elevationMin = readNumber(json, 'elevationMin');
  const elevationMax = readNumber(json, 'elevationMax');
  if (elevationMax <= elevationMin) fail("'elevationMax' > 'elevationMin' olmalı");

  const cellSizeReal = readNumber(json, 'cellSizeReal');
  if (cellSizeReal <= 0) fail("'cellSizeReal' pozitif olmalı");

  const gridWidth = readPositiveInt(json, 'gridWidth');
  const gridHeight = readPositiveInt(json, 'gridHeight');

  return {
    id: readString(json, 'id'),
    name: readString(json, 'name'),
    crs: readString(json, 'crs'),
    originUtm: [origin[0] as number, origin[1] as number],
    gridWidth,
    gridHeight,
    cellSizeReal,
    elevationMin,
    elevationMax,
    elevationEncoding: 'uint16',
    horizontalScale,
    sources: Array.isArray(json.sources) ? json.sources.filter((s) => typeof s === 'string') : [],
    features: Array.isArray(json.features)
      ? json.features.filter((s) => typeof s === 'string')
      : [],
    landcover: parseLandCoverMeta(json.landcover),
    gridOrigin: parseGridOrigin(json.gridOrigin, gridWidth, gridHeight, cellSizeReal),
  };
}

/** `gridOrigin` varsa doğrular; yoksa (eski, orijin-merkezli veri) merkezli değeri türetir. */
function parseGridOrigin(
  value: unknown,
  gridWidth: number,
  gridHeight: number,
  cellSizeReal: number,
): { x: number; z: number } {
  if (value === undefined) {
    const cell = cellSizeReal / HORIZONTAL_SCALE;
    return { x: (-(gridWidth - 1) / 2) * cell, z: (-(gridHeight - 1) / 2) * cell };
  }
  if (!isRecord(value)) fail("'gridOrigin' { x, z } olmalı");
  return { x: readNumber(value, 'x'), z: readNumber(value, 'z') };
}

/** meta.json `landcover` alanı: yoksa null; varsa dosya adı ve sınıf tablosu koddakiyle eşleşmeli. */
function parseLandCoverMeta(value: unknown): LandCoverMeta | null {
  if (value === undefined) return null;
  if (!isRecord(value)) fail("'landcover' bir nesne olmalı");
  const file = readString(value, 'file');
  const classes = value.classes;
  if (!Array.isArray(classes) || !classes.every((c) => typeof c === 'string')) {
    fail("'landcover.classes' metin listesi olmalı");
  }
  if (!classesMatch(classes as string[])) {
    fail(
      `landcover sınıf tablosu kodla uyuşmuyor (veri: ${classes.join(', ')}). ` +
        'Veriyi yeniden üret (tools/build_world.py) ya da src/data/landcover.ts ile eşitle.',
    );
  }
  return { file, classes: classes as string[] };
}

/** landcover.bin'i doğrular: uzunluk ızgarayla eşleşmeli, her değer bilinen bir sınıf olmalı. */
export function parseLandCover(buffer: ArrayBuffer, meta: RegionMeta): Uint8Array {
  const expected = meta.gridWidth * meta.gridHeight;
  if (buffer.byteLength !== expected) {
    fail(`landcover.bin ${buffer.byteLength} bayt, beklenen ${expected}`);
  }
  const classes = new Uint8Array(buffer);
  const known = meta.landcover?.classes.length ?? 0;
  for (let i = 0; i < classes.length; i++) {
    if ((classes[i] as number) >= known)
      fail(`landcover.bin'de bilinmeyen sınıf değeri (hücre ${i})`);
  }
  return classes;
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

const LINE_KINDS: readonly string[] = ['river', 'stream', 'canal'];
const POLYGON_KINDS: readonly string[] = ['lake', 'reservoir', 'pond', 'water'];

function readFlatCoords(value: unknown, minPairs: number, what: string): Float64Array {
  if (!Array.isArray(value) || value.length % 2 !== 0 || value.length < minPairs * 2) {
    fail(`${what}: en az ${minPairs} çift içeren düz [x, z, ...] dizisi olmalı`);
  }
  if (!value.every((v) => typeof v === 'number' && Number.isFinite(v)))
    fail(`${what}: sayı olmalı`);
  return Float64Array.from(value as number[]);
}

function optionalName(record: Record<string, unknown>): { name?: string } {
  return typeof record.name === 'string' && record.name !== '' ? { name: record.name } : {};
}

/** features.json'ı doğrular. Şimdilik yalnızca `water` katmanı vardır. */
export function parseFeatures(json: unknown): RegionFeatures {
  if (!isRecord(json) || !isRecord(json.water)) fail("features.json'da 'water' katmanı yok");
  const water = json.water;
  if (
    !Array.isArray(water.lines) ||
    !Array.isArray(water.polygons) ||
    !Array.isArray(water.points)
  ) {
    fail("'water' lines/polygons/points dizileri içermeli");
  }

  const lines = water.lines.map((item: unknown): WaterLine => {
    if (!isRecord(item) || typeof item.kind !== 'string' || !LINE_KINDS.includes(item.kind))
      fail('akarsu türü geçersiz');
    return {
      kind: item.kind as WaterLineKind,
      ...optionalName(item),
      intermittent: item.intermittent === true,
      xz: readFlatCoords(item.xz, 2, 'akarsu çizgisi'),
    };
  });

  const polygons = water.polygons.map((item: unknown): WaterPolygon => {
    if (!isRecord(item) || typeof item.kind !== 'string' || !POLYGON_KINDS.includes(item.kind))
      fail('su çokgeni türü geçersiz');
    if (!Array.isArray(item.rings) || item.rings.length === 0)
      fail('su çokgeni en az bir halka içermeli');
    const rings = item.rings.map((ring: unknown) => readFlatCoords(ring, 4, 'su çokgeni halkası'));
    return {
      kind: item.kind as WaterPolygonKind,
      ...optionalName(item),
      rings,
      bounds: ringBounds(rings),
    };
  });

  const points = water.points.map((item: unknown): WaterPoint => {
    if (!isRecord(item) || item.kind !== 'spring') fail('su noktası türü geçersiz');
    return {
      kind: 'spring',
      ...optionalName(item),
      x: readNumber(item, 'x'),
      z: readNumber(item, 'z'),
    };
  });

  return { water: { lines, polygons, points } };
}

export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;
