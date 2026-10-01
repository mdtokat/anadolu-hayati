import { INVENTORY } from '../config';
import { Inventory, type InventorySave } from '../items/Inventory';
import { StructureSet, type StructureSave } from '../placement/structures';
import type { VitalsState } from '../survival/vitals';

/**
 * Kayıt formatı (saf mantık; Three.js/IndexedDB'ye bağımlı değil). Bu dosya kayıt şemasının tek
 * kaynağıdır: şema değişirse `SAVE_FORMAT_VERSION` artar ve `MIGRATIONS`'a eski sürümü yeniye
 * çeviren bir adım eklenir; eski kayıtlar böylece yüklenebilir kalır.
 */

/** Geçerli kayıt sürümü. Şema değiştikçe artırılır, hiçbir zaman geri alınmaz. */
export const SAVE_FORMAT_VERSION = 1;

/** Oyuncunun dünyadaki yeri: konum oyun metresidir, yaw/pitch radyandır. */
export interface PlayerSave {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Hayatta kalma durumu: göstergeler, bu yaşamın süresi, ölüm sayısı ve oyun saati. */
export interface SurvivalSave {
  vitals: VitalsState;
  /** Bu yaşamda hayatta kalınan gerçek süre (sn). */
  aliveSeconds: number;
  /** Toplam ölüm sayısı (yeniden doğma noktası tohumu). */
  deaths: number;
  /** Oyun saati (0 ≤ h < 24). */
  clockHour: number;
  /** Tamamlanan oyun günü sayısı. */
  clockDay: number;
}

/** Dünyada oturum boyunca değişen nesneler (`PropId`'ler oturumlar arası sabittir). */
export interface WorldSave {
  /** Elle toplanıp tükenen nesneler. */
  handDone: number[];
  /** Baltayla tükenen nesneler (kesilen ağaçlar). */
  axeDone: number[];
  /** Dünyadan tamamen kalkan nesneler (kesilen ağaçlar). */
  removed: number[];
}

/** Canlı simülasyonundan yalnızca kalıcı olan kısım: öldürülen canlının hücresindeki yeniden doğma beklemesi. */
export interface CreaturesSave {
  killed: Array<{ cell: number; remainingSeconds: number }>;
}

export interface SaveGame {
  version: typeof SAVE_FORMAT_VERSION;
  /** Kaydın alındığı an (ISO 8601). */
  savedAt: string;
  /** Kaydın ait olduğu bölge (`meta.json` `id`). */
  regionId: string;
  player: PlayerSave;
  survival: SurvivalSave;
  inventory: InventorySave;
  structures: StructureSave;
  world: WorldSave;
  creatures: CreaturesSave;
}

/** Yuva listesinde gösterilen kısa özet. */
export interface SaveSummary {
  savedAt: string;
  regionId: string;
  /** 1'den başlayan oyun günü. */
  day: number;
  hour: number;
  health: number;
  deaths: number;
}

export type SaveErrorCode =
  /** Kayıt nesne değil. */
  | 'not_object'
  /** Sürüm alanı yok ya da pozitif tam sayı değil. */
  | 'bad_version'
  /** Kayıt, bu oyun sürümünün bildiğinden daha yeni. */
  | 'future_version'
  /** Eski sürümü yeniye taşıyan göç adımı tanımlı değil. */
  | 'no_migration'
  /** Şema ya da değerler geçersiz. */
  | 'invalid';

/** Kayıt okunamadığında fırlatılır; `message` oyuncuya gösterilebilir Türkçe bir açıklamadır. */
export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SaveError';
  }
}

type RawSave = Record<string, unknown>;

/**
 * Sürüm `n` kaydını `n + 1`'e çeviren adımlar. Şimdilik yok (v1 ilk sürümdür); bir adım girdisini
 * değiştirmemeli, yeni nesne döndürmelidir. Adım yalnızca yapıyı çevirir; değerleri doğrulamak
 * `parseSave`'in işidir.
 */
export const MIGRATIONS: Readonly<Record<number, (raw: RawSave) => RawSave>> = {};

/**
 * Ham kaydı `current` sürümüne taşır (sürüm zinciri: `n → n+1 → … → current`). Kaydın sürümü
 * `current`'tan yeniyse ya da zincirde adım eksikse `SaveError` fırlatır.
 */
export function migrateSave(
  raw: unknown,
  current: number = SAVE_FORMAT_VERSION,
  migrations: Readonly<Record<number, (raw: RawSave) => RawSave>> = MIGRATIONS,
): RawSave {
  if (!isRecord(raw)) throw new SaveError('not_object', 'Kayıt dosyası okunamadı (nesne değil).');
  let save = raw;
  let version = save.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SaveError('bad_version', 'Kayıt sürümü okunamadı.');
  }
  if (version > current) {
    throw new SaveError(
      'future_version',
      `Bu kayıt daha yeni bir oyun sürümüyle alınmış (sürüm ${version}); oyunu güncelleyin.`,
    );
  }
  while (version < current) {
    const step = migrations[version];
    if (!step) {
      throw new SaveError('no_migration', `Kayıt sürümü ${version} artık desteklenmiyor.`);
    }
    save = { ...step(save), version: version + 1 };
    version += 1;
  }
  return save;
}

/**
 * Ham veriyi (IndexedDB'den okunan) doğrulanmış `SaveGame`'e çevirir: önce sürüm göçü, sonra
 * şema ve değer denetimi. Bozuk ya da bilinmeyen veride `SaveError` fırlatır. Dönen nesne girdiyle
 * bellek paylaşmaz.
 */
export function parseSave(raw: unknown): SaveGame {
  const save = migrateSave(raw);

  const savedAt = save.savedAt;
  if (typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) {
    throw invalid('savedAt geçerli bir tarih değil');
  }
  const regionId = save.regionId;
  if (typeof regionId !== 'string' || regionId === '') throw invalid('regionId eksik');

  const player = parsePlayer(save.player);
  const survival = parseSurvival(save.survival);
  const world = parseWorld(save.world);
  const creatures = parseCreatures(save.creatures);

  // Envanter ve yapılar kendi doğrulayıcılarına sahiptir; sürümleri de orada denetlenir.
  let inventory: InventorySave;
  let structures: StructureSave;
  try {
    inventory = Inventory.fromJSON(save.inventory, { slots: INVENTORY.slots }).toJSON();
  } catch (error) {
    throw invalid(`envanter: ${messageOf(error)}`, error);
  }
  try {
    structures = StructureSet.fromJSON(save.structures).toJSON();
  } catch (error) {
    throw invalid(`yapılar: ${messageOf(error)}`, error);
  }

  return {
    version: SAVE_FORMAT_VERSION,
    savedAt,
    regionId,
    player,
    survival,
    inventory,
    structures,
    world,
    creatures,
  };
}

/** Yuva listesinde gösterilecek özet (gün 1'den başlar). */
export function summarizeSave(save: Readonly<SaveGame>): SaveSummary {
  return {
    savedAt: save.savedAt,
    regionId: save.regionId,
    day: save.survival.clockDay + 1,
    hour: save.survival.clockHour,
    health: save.survival.vitals.health,
    deaths: save.survival.deaths,
  };
}

function parsePlayer(raw: unknown): PlayerSave {
  const o = record(raw, 'player');
  return {
    x: finite(o.x, 'player.x'),
    y: finite(o.y, 'player.y'),
    z: finite(o.z, 'player.z'),
    yaw: finite(o.yaw, 'player.yaw'),
    pitch: finite(o.pitch, 'player.pitch'),
  };
}

function parseSurvival(raw: unknown): SurvivalSave {
  const o = record(raw, 'survival');
  const v = record(o.vitals, 'survival.vitals');
  if (typeof v.exhausted !== 'boolean') throw invalid('survival.vitals.exhausted mantıksal değil');
  const clockHour = finite(o.clockHour, 'survival.clockHour');
  if (clockHour < 0 || clockHour >= 24) throw invalid('survival.clockHour [0, 24) dışında');
  return {
    vitals: {
      health: gauge(v.health, 'health'),
      satiety: gauge(v.satiety, 'satiety'),
      hydration: gauge(v.hydration, 'hydration'),
      energy: gauge(v.energy, 'energy'),
      bodyTemp: finite(v.bodyTemp, 'survival.vitals.bodyTemp'),
      exhausted: v.exhausted,
    },
    aliveSeconds: nonNegative(o.aliveSeconds, 'survival.aliveSeconds'),
    deaths: nonNegativeInt(o.deaths, 'survival.deaths'),
    clockHour,
    clockDay: nonNegativeInt(o.clockDay, 'survival.clockDay'),
  };
}

function parseWorld(raw: unknown): WorldSave {
  const o = record(raw, 'world');
  return {
    handDone: intList(o.handDone, 'world.handDone'),
    axeDone: intList(o.axeDone, 'world.axeDone'),
    removed: intList(o.removed, 'world.removed'),
  };
}

function parseCreatures(raw: unknown): CreaturesSave {
  const o = record(raw, 'creatures');
  if (!Array.isArray(o.killed)) throw invalid('creatures.killed dizi değil');
  return {
    killed: o.killed.map((entry: unknown, index) => {
      const e = record(entry, `creatures.killed[${index}]`);
      return {
        cell: nonNegativeInt(e.cell, `creatures.killed[${index}].cell`),
        remainingSeconds: nonNegative(
          e.remainingSeconds,
          `creatures.killed[${index}].remainingSeconds`,
        ),
      };
    }),
  };
}

function isRecord(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, name: string): RawSave {
  if (!isRecord(value)) throw invalid(`${name} nesne değil`);
  return value;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(`${name} sayı değil`);
  return value;
}

function nonNegative(value: unknown, name: string): number {
  const n = finite(value, name);
  if (n < 0) throw invalid(`${name} negatif`);
  return n;
}

function nonNegativeInt(value: unknown, name: string): number {
  const n = nonNegative(value, name);
  if (!Number.isInteger(n)) throw invalid(`${name} tam sayı değil`);
  return n;
}

/** Gösterge değeri: 0–100. */
function gauge(value: unknown, name: string): number {
  const n = finite(value, `survival.vitals.${name}`);
  if (n < 0 || n > 100) throw invalid(`survival.vitals.${name} [0, 100] dışında`);
  return n;
}

/** Yinelenmeyen, negatif olmayan tam sayı listesi (kopyasını döner). */
function intList(value: unknown, name: string): number[] {
  if (!Array.isArray(value)) throw invalid(`${name} dizi değil`);
  const out = value.map((item: unknown, index) => nonNegativeInt(item, `${name}[${index}]`));
  if (new Set(out).size !== out.length) throw invalid(`${name} yinelenen girdi içeriyor`);
  return out;
}

function invalid(detail: string, cause?: unknown): SaveError {
  return new SaveError('invalid', `Kayıt bozuk: ${detail}.`, { cause });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
