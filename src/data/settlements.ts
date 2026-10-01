import { RegionDataError } from './region';

/**
 * Yerleşim verisi (Faz 10): `public/data/world/<id>/settlements.json` (tools/build_settlements.py üretir).
 * Koordinatlar oyun X/Z'sidir. Sözleşme: CLAUDE.md "Yerleşim verisi".
 */

export const SETTLEMENTS_VERSION = 1;

/** Yerleşim rütbesi: il merkezi, ilçe merkezi/belde, köy. */
export const SETTLEMENT_RANKS = ['il', 'ilce', 'koy'] as const;
export type SettlementRank = (typeof SETTLEMENT_RANKS)[number];

/** Yerleşim üslubu: arketip ağırlıklarını seçer (`config.ts` → `SETTLEMENT_STYLES`). */
export const SETTLEMENT_STYLES_LIST = ['kasaba', 'maden', 'sanayi', 'osmanli', 'koy'] as const;
export type SettlementStyle = (typeof SETTLEMENT_STYLES_LIST)[number];

/** Elle seçilmiş simge yapı türleri (tools/build_settlements.py `LANDMARK_KINDS` ile aynı). */
export const LANDMARK_KINDS = [
  'mosque_grand',
  'mosque',
  'han',
  'hamam',
  'tomb',
  'clock_tower',
  'castle',
  'monument',
  'shop_row',
] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

export interface SettlementData {
  /** Kalıcı kimlik (Overture kimliğinin 20 bitlik karması); bina kimlikleri bundan türer. */
  id: number;
  name: string;
  province: string;
  rank: SettlementRank;
  style: SettlementStyle;
  population: number | null;
  /** Merkez (oyun X/Z). */
  x: number;
  z: number;
  /** Ayak izindeki gerçek cami sayısı (yaklaşık). */
  mosques: number;
  /** Ayak izindeki gerçek bina sayısı. */
  buildings: number;
  /** Ayak izi: merkez kafes hücresine göreli `(dc, dr, n)` üçlüleri (n = 100 m hücredeki gerçek bina sayısı). */
  cells: Int16Array;
}

export interface LandmarkData {
  /** Bağlı olduğu yerleşimin kimliği. */
  settlement: number;
  kind: LandmarkKind;
  name: string;
  /** Gerçek konum (oyun X/Z); yerleşim düzeninde en yakın boş parsele oturur. */
  x: number;
  z: number;
}

/** Yol sınıfı: 0 anayol (otoyol/devlet yolu), 1 il-ilçe yolu, 2 köy yolu. */
export type RoadClass = 0 | 1 | 2;

export interface RoadData {
  cls: RoadClass;
  /** Oyun X/Z çoklu çizgisi: [x0, z0, x1, z1, …]. */
  xz: Float32Array;
}

export interface SettlementsData {
  version: typeof SETTLEMENTS_VERSION;
  overtureRelease: string;
  settlements: SettlementData[];
  landmarks: LandmarkData[];
  roads: RoadData[];
}

function fail(message: string): never {
  throw new RegionDataError(`Yerleşim verisi geçersiz: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(record: Record<string, unknown>, key: string, where: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${where}: '${key}' sayı olmalı`);
  return value;
}

function str(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value === '') fail(`${where}: '${key}' metin olmalı`);
  return value;
}

function oneOf<T extends string>(value: unknown, list: readonly T[], where: string): T {
  if (typeof value !== 'string' || !(list as readonly string[]).includes(value)) {
    fail(`${where}: '${String(value)}' bilinmiyor (${list.join(', ')})`);
  }
  return value as T;
}

function numberArray(value: unknown, where: string): number[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    fail(`${where}: sayı listesi olmalı`);
  }
  return value as number[];
}

function parseSettlement(value: unknown, index: number): SettlementData {
  const where = `yerleşim ${index}`;
  if (!isRecord(value)) fail(`${where} bir nesne olmalı`);
  const id = num(value, 'id', where);
  if (!Number.isInteger(id) || id < 0 || id > 0xfffff)
    fail(`${where}: 'id' 20 bitlik tam sayı olmalı`);
  const cells = numberArray(value.cells, `${where} cells`);
  if (cells.length % 3 !== 0) fail(`${where}: 'cells' üçlüler (dc, dr, n) olmalı`);
  if (!cells.every((v) => Number.isInteger(v) && Math.abs(v) <= 32767)) {
    fail(`${where}: 'cells' tam sayı olmalı`);
  }
  const population = value.population;
  return {
    id,
    name: str(value, 'name', where),
    province: str(value, 'province', where),
    rank: oneOf(value.rank, SETTLEMENT_RANKS, `${where} rank`),
    style: oneOf(value.style, SETTLEMENT_STYLES_LIST, `${where} style`),
    population: typeof population === 'number' && Number.isFinite(population) ? population : null,
    x: num(value, 'x', where),
    z: num(value, 'z', where),
    mosques: num(value, 'mosques', where),
    buildings: num(value, 'buildings', where),
    cells: Int16Array.from(cells),
  };
}

/** Yol koordinat birimi (oyun m): tools/build_settlements.py `COORD_UNIT`. */
export const ROAD_COORD_UNIT = 0.1;

/** Delta kodlu yol ([x0, z0, dx1, dz1, …], 0,1 m birimli tam sayılar) → mutlak oyun X/Z. */
export function decodeRoad(deltas: readonly number[]): Float32Array {
  const out = new Float32Array(deltas.length);
  let x = 0;
  let z = 0;
  for (let i = 0; i < deltas.length; i += 2) {
    x += deltas[i] as number;
    z += deltas[i + 1] as number;
    out[i] = x * ROAD_COORD_UNIT;
    out[i + 1] = z * ROAD_COORD_UNIT;
  }
  return out;
}

/** settlements.json'ı doğrular: sürüm, alan türleri, yinelenmeyen kimlikler, simge yapıların yerleşimi var. */
export function parseSettlements(json: unknown): SettlementsData {
  if (!isRecord(json)) fail('settlements.json bir nesne olmalı');
  if (json.version !== SETTLEMENTS_VERSION) {
    fail(`'version' ${String(json.version)}, desteklenen ${SETTLEMENTS_VERSION}`);
  }
  if (!Array.isArray(json.settlements)) fail("'settlements' liste olmalı");
  const settlements = json.settlements.map(parseSettlement);
  const ids = new Set<number>();
  for (const s of settlements) {
    if (ids.has(s.id)) fail(`yinelenen yerleşim kimliği ${s.id}`);
    ids.add(s.id);
  }

  if (!Array.isArray(json.landmarks)) fail("'landmarks' liste olmalı");
  const landmarks = json.landmarks.map((value: unknown, i: number): LandmarkData => {
    const where = `simge yapı ${i}`;
    if (!isRecord(value)) fail(`${where} bir nesne olmalı`);
    const settlement = num(value, 's', where);
    if (!ids.has(settlement)) fail(`${where}: yerleşim ${settlement} yok`);
    return {
      settlement,
      kind: oneOf(value.kind, LANDMARK_KINDS, `${where} kind`),
      name: str(value, 'name', where),
      x: num(value, 'x', where),
      z: num(value, 'z', where),
    };
  });

  if (!Array.isArray(json.roads)) fail("'roads' liste olmalı");
  const roads = json.roads.map((value: unknown, i: number): RoadData => {
    const where = `yol ${i}`;
    if (!isRecord(value)) fail(`${where} bir nesne olmalı`);
    const cls = value.c;
    if (cls !== 0 && cls !== 1 && cls !== 2) fail(`${where}: 'c' 0, 1 ya da 2 olmalı`);
    const deltas = numberArray(value.d, `${where} d`);
    if (deltas.length < 4 || deltas.length % 2 !== 0) fail(`${where}: 'd' en az iki nokta olmalı`);
    return { cls, xz: decodeRoad(deltas) };
  });

  return {
    version: SETTLEMENTS_VERSION,
    overtureRelease: str(json, 'overtureRelease', 'settlements.json'),
    settlements,
    landmarks,
    roads,
  };
}
