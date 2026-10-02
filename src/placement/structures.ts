import { DRYING, FENCES, FIRE, STORAGE } from '../config';
import { Inventory, type InventorySave } from '../items/Inventory';

/**
 * Yerleştirilebilir yapı türleri; eşya kimliğiyle aynı adı taşır. Liste yalnızca sona eklenir (kayıtlar türü
 * yazar). Faz 9: sandık, çalışma tezgâhı, ahşap kulübe.
 */
export const STRUCTURE_KINDS = [
  'campfire',
  'lean_to',
  'workbench',
  'storage_chest',
  'wooden_hut',
  // Modüler parçalar (kullanıcı talimatı): `placement/pieces.ts`.
  'foundation',
  'wall',
  'doorway',
  'window_wall',
  'door',
  'roof',
  // ── Faz 11: A (11.1 modüler inşa II) ──
  'stairs',
  'entry_step',
  'pillar',
  'railing',
  'half_wall',
  'gable_roof',
  'gable_wall',
  // ── Faz 11: B (11.2 tek parça yapılar + 11.3 çit) ──
  'forge',
  'stone_oven',
  'hand_mill',
  'drying_rack',
  'bedroll',
  'solar_panel',
  'wood_fence',
  'stone_fence',
  'fence_gate',
  // ── Faz 11: C (11.4): çapayla açılan tarla; eşyası yoktur (sökülünce bir şey dönmez) ──
  'farm_plot',
  // ── Faz 11: F (11.8): yere inmiş/düşmüş drone; `E` ile alınır ──
  'drone',
] as const;
export type StructureKind = (typeof STRUCTURE_KINDS)[number];

export function isStructureKind(value: unknown): value is StructureKind {
  return typeof value === 'string' && (STRUCTURE_KINDS as readonly string[]).includes(value);
}

// ── Faz 11: B (11.3) ──
/** Çit türleri: 2 m ızgara kenarına oturur, iki ucundaki zemine göre eğimlenir (`Structure.rise`). */
export const FENCE_KINDS = [
  'wood_fence',
  'stone_fence',
  'fence_gate',
] as const satisfies readonly StructureKind[];

export function isFenceKind(kind: StructureKind): boolean {
  return (FENCE_KINDS as readonly StructureKind[]).includes(kind);
}

/** `E` ile açılıp kapanan yapılar (kapı kanadı, çit kapısı); `Structure.open` yalnızca bunlarda bulunur. */
export function isOpenableKind(kind: StructureKind): boolean {
  return kind === 'door' || kind === 'fence_gate';
}

/** İçinde eşya saklanan yapılar (her biri kendi `Inventory`'sine sahiptir). */
export const STORAGE_KINDS = ['storage_chest'] as const satisfies readonly StructureKind[];

export function isStorageKind(kind: StructureKind): boolean {
  return (STORAGE_KINDS as readonly StructureKind[]).includes(kind);
}

/** Sandık envanterinin sınırları. */
export function storageOptions(): { slots: number; maxWeightG: number } {
  return { slots: STORAGE.slots, maxWeightG: STORAGE.maxWeightG };
}

export type StructureId = number;

export interface Structure {
  id: StructureId;
  kind: StructureKind;
  /** Oyun koordinatı; y = zemin. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Yalnızca kamp ateşinde: kalan yanma süresi (gerçek sn); 0 = sönük (kül). */
  fuelSeconds?: number;
  /** Yalnızca kapıda ve çit kapısında: açık mı? */
  open?: boolean;
  /**
   * Yalnızca çitlerde (Faz 11, 11.3): parçanın yerel +Z ucundaki zemin yüksekliği eksi −Z ucundakine (oyun m;
   * `FENCES.riseStep` adımına yuvarlı). Çit uçlarındaki zemini izler (eğimlenir); `y` ortadaki zemindir.
   */
  rise?: number;
  /** Yalnızca kurutma rafında (Faz 11, 11.2): kuruyan çiğ et, hazır kurutulmuş et ve parti ilerlemesi (gerçek sn). */
  rack?: RackState;
}

/** Kurutma rafının içeriği. */
export interface RackState {
  /** Kurumakta olan çiğ et parçaları (parti birlikte kurur). */
  raw: number;
  /** Alınmayı bekleyen kurutulmuş et parçaları. */
  dried: number;
  /** Kurumakta olan partinin ilerlemesi (gerçek sn; `DRYING.seconds`'ta biter). */
  progress: number;
}

/** Kayıttaki yapı girdisi: sandıklarda içerik de yazılır (Faz 9; alan yalnızca sandıkta bulunur). */
export interface StructureSaveEntry extends Structure {
  storage?: InventorySave;
}

/**
 * Kayıt formatı (sürümlü). Faz 9'da yalnızca eklemeli değişti (yeni türler, sandık içeriği): sürüm 1 kalır;
 * eski oyun yeni kaydı zaten kayıt biçimi sürümünden (`SAVE_FORMAT_VERSION`) tanıyıp reddeder.
 */
export interface StructureSave {
  version: 1;
  nextId: number;
  structures: StructureSaveEntry[];
}

export const STRUCTURE_SAVE_VERSION = 1;

/** Yapının yerleşim imzası: kayıt yüklenince aynı kimlik başka bir yapıyı gösterebilir (görsel/collider yenilenir). */
export function placementKey(s: Readonly<Structure>): string {
  return `${s.kind}|${s.x}|${s.y}|${s.z}|${s.yaw}${s.open ? '|open' : ''}${s.rise ? `|r${s.rise}` : ''}`;
}

/** Yanan bir ateş mi? */
export function isLit(structure: Readonly<Structure>): boolean {
  return structure.kind === 'campfire' && (structure.fuelSeconds ?? 0) > 0;
}

/**
 * Dünyadaki yapılar (saf mantık). Yapılar kalıcıdır (ölüm yeniden doğmada silmez); kamp ateşlerinin
 * yakıtı `update` ile azalır. Kimlikler artarak verilir ve asla yeniden kullanılmaz.
 */
export class StructureSet {
  private readonly items = new Map<StructureId, Structure>();
  /** Sandık içerikleri (yapı kimliğine göre). */
  private readonly storages = new Map<StructureId, Inventory>();
  private nextId = 1;
  private revision = 0;

  /** Her ekleme, yakıt ekleme ve sönmede artar (görsel katmanın "kirli" denetimi için). */
  get version(): number {
    return this.revision;
  }

  get size(): number {
    return this.items.size;
  }

  all(): ReadonlyArray<Readonly<Structure>> {
    return [...this.items.values()];
  }

  get(id: StructureId): Readonly<Structure> | undefined {
    return this.items.get(id);
  }

  /**
   * Yeni yapı ekler; kamp ateşi `FIRE.burnSeconds` yakıtla yanık başlar, sandık boş envanterle gelir. `rise`: çitin uç
   * yüksekliği farkı (yalnızca çitlerde anlamlı).
   */
  add(
    kind: StructureKind,
    x: number,
    y: number,
    z: number,
    yaw = 0,
    rise = 0,
  ): Readonly<Structure> {
    const structure: Structure = { id: this.nextId++, kind, x, y, z, yaw };
    if (kind === 'campfire') structure.fuelSeconds = FIRE.burnSeconds;
    if (isOpenableKind(kind)) structure.open = false;
    if (isFenceKind(kind) && rise !== 0) structure.rise = rise;
    if (kind === 'drying_rack') structure.rack = { raw: 0, dried: 0, progress: 0 };
    this.items.set(structure.id, structure);
    if (isStorageKind(kind)) this.storages.set(structure.id, new Inventory(storageOptions()));
    this.revision += 1;
    return structure;
  }

  /** Yapıyı kaldırır (sökme); varsa true. Sandık içeriği de silinir: çağıran önce boşaltmalıdır. */
  remove(id: StructureId): boolean {
    if (!this.items.delete(id)) return false;
    this.storages.delete(id);
    this.revision += 1;
    return true;
  }

  /** Kapıyı ya da çit kapısını açar/kapatır; yeni durumu döndürür (açılır bir yapı değilse null). */
  toggleDoor(id: StructureId): boolean | null {
    const structure = this.items.get(id);
    if (!structure || !isOpenableKind(structure.kind)) return null;
    structure.open = !structure.open;
    this.revision += 1;
    return structure.open;
  }

  /**
   * Kurutma rafına çiğ et koyar (parti kuruyor ya da hazır et beklemiyorsa): raf boşken en çok `DRYING.capacity`
   * parça. Gerçekten konan parça sayısını döndürür (raf değil, dolu ya da hazır et bekliyorsa 0).
   */
  loadRack(id: StructureId, pieces: number): number {
    const rack = this.items.get(id)?.rack;
    if (!rack || rack.raw > 0 || rack.dried > 0) return 0;
    const put = Math.min(Math.max(0, Math.floor(pieces)), DRYING.capacity);
    if (put === 0) return 0;
    rack.raw = put;
    rack.progress = 0;
    this.revision += 1;
    return put;
  }

  /** Rafta hazır kurutulmuş eti boşaltır (hepsi); alınan parça sayısını döndürür. */
  collectRack(id: StructureId): number {
    const rack = this.items.get(id)?.rack;
    if (!rack || rack.dried === 0) return 0;
    const taken = rack.dried;
    rack.dried = 0;
    this.revision += 1;
    return taken;
  }

  /** Sandığın envanteri (yerinde değiştirilir); sandık değilse null. */
  storageOf(id: StructureId): Inventory | null {
    return this.storages.get(id) ?? null;
  }

  /** (x, z)'ye yatay `radius` içindeki yapılar, yakından uzağa. */
  near(x: number, z: number, radius: number): Array<Readonly<Structure>> {
    const limit = radius * radius;
    return [...this.items.values()]
      .map((s) => ({ s, d: (s.x - x) ** 2 + (s.z - z) ** 2 }))
      .filter((e) => e.d <= limit)
      .sort((a, b) => a.d - b.d || a.s.id - b.s.id)
      .map((e) => e.s);
  }

  /** (x, z)'ye en yakın kamp ateşi (yanık ya da sönük) `radius` içindeyse onu verir. */
  nearestCampfire(x: number, z: number, radius: number): Readonly<Structure> | null {
    return this.near(x, z, radius).find((s) => s.kind === 'campfire') ?? null;
  }

  /**
   * Kamp ateşine yakıt ekler (üst sınır `FIRE.maxFuelSeconds`); gerçekten eklenen süreyi döndürür.
   * Ateş değilse veya depo zaten doluysa 0. Sönük ateş yeniden tutuşur.
   */
  refuel(id: StructureId, seconds: number): number {
    const structure = this.items.get(id);
    if (!structure || structure.kind !== 'campfire' || !(seconds > 0)) return 0;
    const before = structure.fuelSeconds ?? 0;
    const after = Math.min(FIRE.maxFuelSeconds, before + seconds);
    if (after === before) return 0;
    structure.fuelSeconds = after;
    this.revision += 1;
    return after - before;
  }

  /**
   * Yakıtı `dt` saniye azaltır; bu adımda sönen ateşlerin kimliklerini döndürür.
   * Kalan yakıt yalnızca sönerken `version`'ı artırır (her adımda değil).
   */
  update(dt: number): StructureId[] {
    const extinguished: StructureId[] = [];
    for (const s of this.items.values()) {
      // Kurutma rafı: parti `DRYING.seconds` sonunda kurur (görsel/ipucu için `version` artar).
      if (s.rack && s.rack.raw > 0) {
        s.rack.progress += dt;
        if (s.rack.progress >= DRYING.seconds) {
          s.rack.dried += s.rack.raw * DRYING.yieldPerPiece;
          s.rack.raw = 0;
          s.rack.progress = 0;
          this.revision += 1;
        }
      }
      if (s.kind !== 'campfire' || (s.fuelSeconds ?? 0) <= 0) continue;
      s.fuelSeconds = Math.max(0, (s.fuelSeconds ?? 0) - dt);
      if (s.fuelSeconds === 0) {
        extinguished.push(s.id);
        this.revision += 1;
      }
    }
    return extinguished;
  }

  toJSON(): StructureSave {
    return {
      version: STRUCTURE_SAVE_VERSION,
      nextId: this.nextId,
      structures: [...this.items.values()].map((s) => {
        const storage = this.storages.get(s.id);
        const entry: StructureSaveEntry = s.rack ? { ...s, rack: { ...s.rack } } : { ...s };
        return storage ? { ...entry, storage: storage.toJSON() } : entry;
      }),
    };
  }

  /**
   * Kayıttan bu kümeyi yerinde yükler (`StructureSystem`/katmanlar bu örneği tutar): önce doğrular,
   * sonra yazar; bozuk veride `Error` fırlatır ve küme değişmez. `version` artar (görsel yenilenir).
   */
  loadSave(data: unknown): void {
    const loaded = StructureSet.fromJSON(data);
    this.items.clear();
    for (const [id, structure] of loaded.items) this.items.set(id, structure);
    this.storages.clear();
    for (const [id, storage] of loaded.storages) this.storages.set(id, storage);
    this.nextId = loaded.nextId;
    this.revision += 1;
  }

  /** Kayıttan kurar; bozuk veride (sürüm, tür, sayılar, yakıt, kimlik, sandık içeriği) `Error` fırlatır. */
  static fromJSON(data: unknown): StructureSet {
    if (typeof data !== 'object' || data === null) throw new Error('Yapı kaydı nesne değil');
    const save = data as { version?: unknown; nextId?: unknown; structures?: unknown };
    if (save.version !== STRUCTURE_SAVE_VERSION) {
      throw new Error(`Desteklenmeyen yapı kayıt sürümü: ${String(save.version)}`);
    }
    if (!Array.isArray(save.structures)) throw new Error('Yapı kaydında structures dizisi yok');
    if (!Number.isInteger(save.nextId) || (save.nextId as number) < 1) {
      throw new Error(`Geçersiz nextId: ${String(save.nextId)}`);
    }

    const set = new StructureSet();
    set.nextId = save.nextId as number;
    for (const raw of save.structures as unknown[]) {
      const s = raw as Partial<StructureSaveEntry> | null;
      if (typeof s !== 'object' || s === null) throw new Error('Yapı girdisi nesne değil');
      if (!Number.isInteger(s.id) || (s.id as number) < 1 || (s.id as number) >= set.nextId) {
        throw new Error(`Geçersiz yapı kimliği: ${String(s.id)}`);
      }
      if (set.items.has(s.id as number)) throw new Error(`Yinelenen yapı kimliği: ${s.id}`);
      if (!isStructureKind(s.kind)) throw new Error(`Bilinmeyen yapı türü: ${String(s.kind)}`);
      for (const key of ['x', 'y', 'z', 'yaw'] as const) {
        if (typeof s[key] !== 'number' || !Number.isFinite(s[key])) {
          throw new Error(`Yapı ${s.id}: geçersiz ${key}`);
        }
      }
      const structure: Structure = {
        id: s.id as number,
        kind: s.kind,
        x: s.x as number,
        y: s.y as number,
        z: s.z as number,
        yaw: s.yaw as number,
      };
      if (s.kind === 'campfire') {
        const fuel = s.fuelSeconds;
        if (
          typeof fuel !== 'number' ||
          !Number.isFinite(fuel) ||
          fuel < 0 ||
          fuel > FIRE.maxFuelSeconds
        ) {
          throw new Error(`Yapı ${s.id}: geçersiz yakıt (${String(fuel)})`);
        }
        structure.fuelSeconds = fuel;
      } else if (s.fuelSeconds !== undefined) {
        throw new Error(`Yapı ${s.id}: ${s.kind} yakıt taşımaz`);
      }
      if (isOpenableKind(s.kind)) {
        if (s.open !== undefined && typeof s.open !== 'boolean') {
          throw new Error(`Yapı ${s.id}: geçersiz kapı durumu`);
        }
        structure.open = s.open === true;
      } else if (s.open !== undefined) {
        throw new Error(`Yapı ${s.id}: ${s.kind} açılıp kapanmaz`);
      }
      // Faz 11 (B): çit uç yüksekliği farkı (eksik = düz) ve kurutma rafı içeriği (eksik = boş).
      if (isFenceKind(s.kind)) {
        if (s.rise !== undefined) {
          if (
            typeof s.rise !== 'number' ||
            !Number.isFinite(s.rise) ||
            Math.abs(s.rise) > FENCES.maxEndRise + 1e-6
          ) {
            throw new Error(`Yapı ${s.id}: geçersiz çit eğimi (${String(s.rise)})`);
          }
          if (s.rise !== 0) structure.rise = s.rise;
        }
      } else if (s.rise !== undefined) {
        throw new Error(`Yapı ${s.id}: ${s.kind} çit değildir`);
      }
      if (s.kind === 'drying_rack') {
        const r = s.rack as Partial<RackState> | undefined;
        if (r === undefined) {
          structure.rack = { raw: 0, dried: 0, progress: 0 };
        } else {
          const ok = (v: unknown, max: number): v is number =>
            typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
          const cap = DRYING.capacity * DRYING.yieldPerPiece;
          if (
            typeof r !== 'object' ||
            r === null ||
            !ok(r.raw, DRYING.capacity) ||
            !ok(r.dried, cap) ||
            !ok(r.progress, DRYING.seconds)
          ) {
            throw new Error(`Yapı ${s.id}: geçersiz raf içeriği`);
          }
          structure.rack = { raw: r.raw, dried: r.dried, progress: r.progress };
        }
      } else if (s.rack !== undefined) {
        throw new Error(`Yapı ${s.id}: ${s.kind} raf değildir`);
      }
      if (isStorageKind(s.kind)) {
        // İçeriksiz sandık (elle yazılmış/eski kayıt) boş sayılır.
        const storage =
          s.storage === undefined
            ? new Inventory(storageOptions())
            : Inventory.fromJSON(s.storage, storageOptions());
        set.storages.set(structure.id, storage);
      } else if (s.storage !== undefined) {
        throw new Error(`Yapı ${s.id}: ${s.kind} eşya saklamaz`);
      }
      set.items.set(structure.id, structure);
    }
    return set;
  }
}
