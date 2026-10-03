import { DRONE, HOTBAR, INVENTORY, WORLD } from '../config';
import { isCropId, type CropId } from '../farming/kinds';
import { Hotbar, type HotbarSave } from '../items/hotbar';
import { Inventory, type InventorySave, type ItemStack } from '../items/Inventory';
import { isItemId } from '../items/itemDefs';
import { WEAPON_IDS, type WeaponId } from '../items/weaponState';
import { StructureSet, type StructureSave } from '../placement/structures';
import type { VitalsState } from '../survival/vitals';
import { legacyCellKeyToAbsolute, legacyPropIdToAbsolute } from '../world/chunkKeys';

/**
 * Kayıt formatı (saf mantık; Three.js/IndexedDB'ye bağımlı değil). Bu dosya kayıt şemasının tek
 * kaynağıdır: şema değişirse `SAVE_FORMAT_VERSION` artar ve `MIGRATIONS`'a eski sürümü yeniye
 * çeviren bir adım eklenir; eski kayıtlar böylece yüklenebilir kalır.
 */

/**
 * Geçerli kayıt sürümü. Şema değiştikçe artırılır, hiçbir zaman geri alınmaz.
 * - v1 (Faz 6): bölge `zonguldak-bartin-karabuk`, kimlikler 13 × 10 chunk ızgarasına bağlı (`cy · 13 + cx`).
 * - v2 (Faz 7): dünya `WORLD.id`, nesne kimlikleri ve canlı hücre anahtarları mutlak (`world/chunkKeys.ts`).
 * - v3 (Faz 9): kısayol çubuğu (`hotbar`); yapılarda yeni türler (tezgâh, sandık, kulübe) ve sandık içeriği.
 * - v4 (Faz 10): yerleşimler (`settlements.searched`: aranmış yapı kimlikleri); yeni eşya kimlikleri (Türk kileri).
 * - v5 (Faz 11): tarla (`farm`), silah şarjörleri (`weapons`), eşkıya kampları ve çalınan eşyalar (`bandits`), drone
 *   (`drone`); yeni eşya/yapı kimlikleri. Alanlar v5 içinde sabittir (docs/faz-11-paralel-plan.md §2.4, §3.5).
 * - v6: bina içi kaplar (`settlements.containers`: aranmış sandık/dolap kimlikleri) ve camide kılınan son vakit
 *   (`settlements.lastPrayer`: mutlak vakit sırası, yoksa −1).
 * - v7: susturucu takılı silahlar (`weapons.suppressed`); yeni eşyalar (susturucu, sırt çantaları). Oyuncu envanteri
 *   çanta slotlarıyla daha uzundur (eski 20 slotluk envanter okunur, eksik slotlar boş).
 */
export const SAVE_FORMAT_VERSION = 7;

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

/** Dünyada oturum boyunca değişen nesneler (`PropId`'ler mutlaktır: oturumlar ve dünya genişlemeleri arası sabit). */
export interface WorldSave {
  /** Elle toplanıp tükenen nesneler. */
  handDone: number[];
  /** Baltayla tükenen nesneler (kesilen ağaçlar). */
  axeDone: number[];
  /** Dünyadan tamamen kalkan nesneler (kesilen ağaçlar). */
  removed: number[];
}

/**
 * Canlı simülasyonundan yalnızca kalıcı olan kısım: öldürülen canlının hücresindeki yeniden doğma beklemesi
 * (`cell` mutlak chunk anahtarıdır).
 */
export interface CreaturesSave {
  killed: Array<{ cell: number; remainingSeconds: number }>;
}

export interface SaveGame {
  version: typeof SAVE_FORMAT_VERSION;
  /** Kaydın alındığı an (ISO 8601). */
  savedAt: string;
  /** Kaydın ait olduğu dünya (`WORLD.id`; v1'de bölge kimliğiydi, göçte çevrilir). */
  regionId: string;
  player: PlayerSave;
  survival: SurvivalSave;
  inventory: InventorySave;
  structures: StructureSave;
  world: WorldSave;
  creatures: CreaturesSave;
  /** Kısayol çubuğu: slot bağlantıları ve seçili slot (Faz 9). */
  hotbar: HotbarSave;
  /** Yerleşimler (Faz 10): aranmış yapılar (`yerleşim · 1024 + sıra`). */
  settlements: SettlementsSave;
  /** Faz 11 (C): tarlalar. */
  farm: FarmSave;
  /** Faz 11 (D): şarjördeki mermiler. */
  weapons: WeaponsSave;
  /** Faz 11 (E): temizlenen kamplar, kamp sandıkları, yankesicinin kaçırdığı eşyalar. */
  bandits: BanditsSave;
  /** Faz 11 (F): drone durumu ve işaretler. */
  drone: DroneSave;
}

// ── Faz 11 (v5) alanları: zaman alanları oyun saatinin mutlak saniyesidir (`(gün · 24 + saat) · 3600`). ──

/** Bir tarla hücresi (C). */
export interface FarmPlotSave {
  id: number;
  x: number;
  z: number;
  /** Ekili ekin (yoksa null: boş tarla). */
  crop: CropId | null;
  plantedAt: number;
  wateredAt: number;
  /** Büyüme evresi (0 = yeni ekili … `FARMING.stages − 1` = olgun). */
  stage: number;
  dead: boolean;
}

export interface FarmSave {
  plots: FarmPlotSave[];
}

export interface WeaponsSave {
  loaded: Partial<Record<WeaponId, number>>;
  /** Susturucu takılı silahlar (v7). */
  suppressed: WeaponId[];
}

export interface BanditsSave {
  /** Temizlenen kamplar (`camp` kalıcı kamp kimliği) ve temizlendiği an. */
  cleared: Array<{ camp: number; at: number }>;
  /** Kamp sandıklarının içeriği (yalnızca değişmiş olanlar). */
  chests: Array<{ camp: number; items: ItemStack[] }>;
  /** Yankesicinin şu an taşıdığı (henüz bir sandığa düşmemiş) eşyalar. */
  stolen: ItemStack[];
}

export interface DroneSave {
  /** `stowed`: envanterde (eşya), `landed`: dünyada yere inmiş/düşmüş (yapı). */
  state: 'stowed' | 'landed';
  x: number;
  y: number;
  z: number;
  /** Pil 0–1. */
  battery: number;
  marks: Array<{ x: number; z: number; label: string }>;
}

/** v5 alanlarının boş başlangıç değerleri (yeni oyun ve v4 → v5 göçü). */
export function emptyFaz11Save(): Pick<SaveGame, 'farm' | 'weapons' | 'bandits' | 'drone'> {
  return {
    farm: { plots: [] },
    weapons: { loaded: {}, suppressed: [] },
    bandits: { cleared: [], chests: [], stolen: [] },
    drone: { state: 'stowed', x: 0, y: 0, z: 0, battery: 1, marks: [] },
  };
}

/** Yerleşimlerde kalıcı olan durum (Faz 10). */
export interface SettlementsSave {
  /** Kapıdan aranmış yapılar (v4; eski kayıtlarda bu yapıların kapları da aranmış sayılır). */
  searched: number[];
  /** Aranmış bina içi kaplar (`containerId`; v6). */
  containers: number[];
  /** Camide namaz kılınan son vaktin mutlak sırası (`survival/prayer.ts`; −1: hiç). */
  lastPrayer: number;
}

/** Boş yerleşim durumu (yeni oyun). */
export function emptySettlementsSave(): SettlementsSave {
  return { searched: [], containers: [], lastPrayer: -1 };
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
  | 'invalid'
  /** Yuva kimliği geçersiz. */
  | 'bad_slot'
  /** Depolama (IndexedDB) kullanılamıyor, dolu ya da bir işlem başarısız oldu. */
  | 'storage';

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
 * v1 → v2 (Faz 7, docs/faz-7-paralel-plan.md §3.5): bölge kimliği `WORLD.legacyRegionId` → `WORLD.id`; tükenen
 * nesne kimlikleri ve öldürülen canlı hücreleri eski 13 × 10 ızgara anahtarından mutlak anahtara. Kafes çapası
 * eski ızgaranın kuzeybatı köşesi olduğundan aynı kimlik aynı nesneyi/hücreyi gösterir; oyuncu, yapı, envanter,
 * gösterge ve saat aynen kalır (orijin değişmedi). Eski ızgara dışındaki (v1'de zaten var olamayacak) kimlikler
 * atılır; tam sayı olmayan bozuk değerler dokunulmadan bırakılır ki `parseSave` reddetsin.
 */
function migrateV1toV2(raw: RawSave): RawSave {
  if (raw.regionId !== WORLD.legacyRegionId) {
    throw new SaveError(
      'invalid',
      `Kayıt tanınmayan bir bölgeye ait (${String(raw.regionId)}); yalnızca ${WORLD.legacyRegionId} kayıtları taşınabilir.`,
    );
  }
  const out: RawSave = { ...raw, regionId: WORLD.id };

  if (isRecord(raw.world)) {
    const world: RawSave = { ...raw.world };
    for (const key of ['handDone', 'axeDone', 'removed'] as const) {
      const list = raw.world[key];
      if (Array.isArray(list)) world[key] = mapIds(list, legacyPropIdToAbsolute);
    }
    out.world = world;
  }

  if (isRecord(raw.creatures) && Array.isArray(raw.creatures.killed)) {
    const killed: unknown[] = [];
    for (const entry of raw.creatures.killed as unknown[]) {
      if (!isRecord(entry) || !Number.isInteger(entry.cell)) {
        killed.push(entry);
        continue;
      }
      const cell = legacyCellKeyToAbsolute(entry.cell as number);
      if (cell !== null) killed.push({ ...entry, cell });
    }
    out.creatures = { ...raw.creatures, killed };
  }
  return out;
}

/** Eski kimlik listesini çevirir: geçersiz (ızgara dışı) kimlik atılır, tam sayı olmayan değer korunur. */
function mapIds(list: unknown[], map: (old: number) => number | null): unknown[] {
  const out: unknown[] = [];
  for (const value of list) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      out.push(value);
      continue;
    }
    const mapped = map(value);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

/** Boş kısayol çubuğu (yeni oyun ve v2 → v3 göçü). */
export function emptyHotbarSave(): HotbarSave {
  return new Hotbar(HOTBAR.slots).toSave();
}

/**
 * v2 → v3 (Faz 9): kısayol çubuğu eklendi (boş başlar). Yapı biçimi yalnızca eklemeli değişti (yeni türler,
 * sandık içeriği); v2 kaydında bunlar bulunmadığından yapılar aynen kalır.
 */
function migrateV2toV3(raw: RawSave): RawSave {
  return { ...raw, hotbar: emptyHotbarSave() };
}

/** v3 → v4 (Faz 10): yerleşim durumu eklendi; eski kayıtta hiçbir yapı aranmamıştır. */
function migrateV3toV4(raw: RawSave): RawSave {
  return { ...raw, settlements: { searched: [] } };
}

/** v4 → v5 (Faz 11): tarla, silah, eşkıya ve drone alanları boş eklenir; geri kalanı aynen kalır. */
function migrateV4toV5(raw: RawSave): RawSave {
  return { ...raw, ...emptyFaz11Save() };
}

/** v5 → v6: aranmış kap listesi boş ve "hiç namaz kılınmadı" eklenir; kapıdan aranmış yapılar korunur. */
function migrateV5toV6(raw: RawSave): RawSave {
  const settlements = isRecord(raw.settlements) ? raw.settlements : { searched: [] };
  return { ...raw, settlements: { ...settlements, containers: [], lastPrayer: -1 } };
}

/**
 * Sürüm `n` kaydını `n + 1`'e çeviren adımlar; bir adım girdisini değiştirmemeli, yeni nesne döndürmelidir.
 * Adım yalnızca yapıyı çevirir (taşınamayan kayıtta `SaveError` fırlatabilir); değerleri doğrulamak
 * `parseSave`'in işidir.
 */
function migrateV6toV7(raw: RawSave): RawSave {
  const weapons = isRecord(raw.weapons) ? raw.weapons : { loaded: {} };
  return { ...raw, weapons: { ...weapons, suppressed: [] } };
}

export const MIGRATIONS: Readonly<Record<number, (raw: RawSave) => RawSave>> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
  5: migrateV5toV6,
  6: migrateV6toV7,
};

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
    const json = Inventory.fromJSON(save.inventory, {
      slots: INVENTORY.slots,
      backpacks: true,
    }).toJSON();
    // Kayıttaki slot sayısı korunur (eski 20 slotluk envanter çantalı envantere yüklenirken doldurulur).
    const length = (save.inventory as { slots: unknown[] }).slots.length;
    inventory = { ...json, slots: json.slots.slice(0, Math.max(length, INVENTORY.slots)) };
  } catch (error) {
    throw invalid(`envanter: ${messageOf(error)}`, error);
  }
  try {
    structures = StructureSet.fromJSON(save.structures).toJSON();
  } catch (error) {
    throw invalid(`yapılar: ${messageOf(error)}`, error);
  }
  let hotbar: HotbarSave;
  try {
    hotbar = Hotbar.parse(save.hotbar, HOTBAR.slots);
  } catch (error) {
    throw invalid(`kısayol: ${messageOf(error)}`, error);
  }
  const settlements = parseSettlementsSave(save.settlements);
  const farm = parseFarm(save.farm);
  const weapons = parseWeapons(save.weapons);
  const bandits = parseBandits(save.bandits);
  const drone = parseDrone(save.drone);

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
    hotbar,
    settlements,
    farm,
    weapons,
    bandits,
    drone,
  };
}

function parseFarm(raw: unknown): FarmSave {
  const o = record(raw, 'farm');
  if (!Array.isArray(o.plots)) throw invalid('farm.plots dizi değil');
  const plots = o.plots.map((entry: unknown, index): FarmPlotSave => {
    const name = `farm.plots[${index}]`;
    const p = record(entry, name);
    if (p.crop !== null && !isCropId(p.crop)) throw invalid(`${name}.crop tanınmıyor`);
    if (typeof p.dead !== 'boolean') throw invalid(`${name}.dead mantıksal değil`);
    return {
      id: nonNegativeInt(p.id, `${name}.id`),
      x: finite(p.x, `${name}.x`),
      z: finite(p.z, `${name}.z`),
      crop: p.crop,
      plantedAt: nonNegative(p.plantedAt, `${name}.plantedAt`),
      wateredAt: nonNegative(p.wateredAt, `${name}.wateredAt`),
      stage: nonNegativeInt(p.stage, `${name}.stage`),
      dead: p.dead,
    };
  });
  if (new Set(plots.map((p) => p.id)).size !== plots.length) {
    throw invalid('farm.plots yinelenen kimlik içeriyor');
  }
  return { plots };
}

function parseWeapons(raw: unknown): WeaponsSave {
  const o = record(raw, 'weapons');
  const loaded = record(o.loaded, 'weapons.loaded');
  const out: Partial<Record<WeaponId, number>> = {};
  for (const [key, value] of Object.entries(loaded)) {
    if (!(WEAPON_IDS as readonly string[]).includes(key)) {
      throw invalid(`weapons.loaded.${key} tanınmayan silah`);
    }
    out[key as WeaponId] = nonNegativeInt(value, `weapons.loaded.${key}`);
  }
  if (!Array.isArray(o.suppressed)) throw invalid('weapons.suppressed dizi değil');
  const suppressed = o.suppressed.map((id: unknown, index) => {
    if (!(WEAPON_IDS as readonly unknown[]).includes(id)) {
      throw invalid(`weapons.suppressed[${index}] tanınmayan silah`);
    }
    return id as WeaponId;
  });
  if (new Set(suppressed).size !== suppressed.length) {
    throw invalid('weapons.suppressed yinelenen silah içeriyor');
  }
  return { loaded: out, suppressed };
}

function parseBandits(raw: unknown): BanditsSave {
  const o = record(raw, 'bandits');
  if (!Array.isArray(o.cleared)) throw invalid('bandits.cleared dizi değil');
  if (!Array.isArray(o.chests)) throw invalid('bandits.chests dizi değil');
  const cleared = o.cleared.map((entry: unknown, index) => {
    const e = record(entry, `bandits.cleared[${index}]`);
    return {
      camp: nonNegativeInt(e.camp, `bandits.cleared[${index}].camp`),
      at: nonNegative(e.at, `bandits.cleared[${index}].at`),
    };
  });
  const chests = o.chests.map((entry: unknown, index) => {
    const e = record(entry, `bandits.chests[${index}]`);
    return {
      camp: nonNegativeInt(e.camp, `bandits.chests[${index}].camp`),
      items: itemStacks(e.items, `bandits.chests[${index}].items`),
    };
  });
  return { cleared, chests, stolen: itemStacks(o.stolen, 'bandits.stolen') };
}

function parseDrone(raw: unknown): DroneSave {
  const o = record(raw, 'drone');
  if (o.state !== 'stowed' && o.state !== 'landed') throw invalid('drone.state tanınmıyor');
  const battery = finite(o.battery, 'drone.battery');
  if (battery < 0 || battery > 1) throw invalid('drone.battery [0, 1] dışında');
  if (!Array.isArray(o.marks)) throw invalid('drone.marks dizi değil');
  if (o.marks.length > DRONE.maxMarks) throw invalid('drone.marks çok fazla işaret');
  const marks = o.marks.map((entry: unknown, index) => {
    const m = record(entry, `drone.marks[${index}]`);
    if (typeof m.label !== 'string') throw invalid(`drone.marks[${index}].label metin değil`);
    return {
      x: finite(m.x, `drone.marks[${index}].x`),
      z: finite(m.z, `drone.marks[${index}].z`),
      label: m.label,
    };
  });
  return {
    state: o.state,
    x: finite(o.x, 'drone.x'),
    y: finite(o.y, 'drone.y'),
    z: finite(o.z, 'drone.z'),
    battery,
    marks,
  };
}

/** Eşya yığını listesi: bilinen kimlik, pozitif tam sayı adet (kopyasını döner). */
function itemStacks(value: unknown, name: string): ItemStack[] {
  if (!Array.isArray(value)) throw invalid(`${name} dizi değil`);
  return value.map((entry: unknown, index) => {
    const e = record(entry, `${name}[${index}]`);
    if (!isItemId(e.id)) throw invalid(`${name}[${index}].id tanınmayan eşya`);
    const count = nonNegativeInt(e.count, `${name}[${index}].count`);
    if (count < 1) throw invalid(`${name}[${index}].count pozitif değil`);
    return { id: e.id, count };
  });
}

function parseSettlementsSave(value: unknown): SettlementsSave {
  if (!isRecord(value)) throw invalid('settlements bir nesne olmalı');
  const ids = (key: 'searched' | 'containers'): number[] => {
    const list = value[key];
    if (!Array.isArray(list) || !list.every((v) => Number.isInteger(v) && v >= 0)) {
      throw invalid(`settlements.${key} negatif olmayan tam sayı listesi olmalı`);
    }
    return [...new Set(list as number[])].sort((a, b) => a - b);
  };
  const lastPrayer = value.lastPrayer;
  if (typeof lastPrayer !== 'number' || !Number.isInteger(lastPrayer) || lastPrayer < -1) {
    throw invalid('settlements.lastPrayer −1 ya da negatif olmayan tam sayı olmalı');
  }
  return { searched: ids('searched'), containers: ids('containers'), lastPrayer };
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
  if (!Number.isSafeInteger(n)) throw invalid(`${name} tam sayı değil`);
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
