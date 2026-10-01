import { FIRE } from '../config';

/** Yerleştirilebilir yapı türleri; eşya kimliğiyle aynı adı taşır (`campfire`, `lean_to`). */
export const STRUCTURE_KINDS = ['campfire', 'lean_to'] as const;
export type StructureKind = (typeof STRUCTURE_KINDS)[number];

export function isStructureKind(value: unknown): value is StructureKind {
  return typeof value === 'string' && (STRUCTURE_KINDS as readonly string[]).includes(value);
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
}

/** Kayıt formatı (sürümlü): Faz 6 kayıt sistemine hazırlık. */
export interface StructureSave {
  version: 1;
  nextId: number;
  structures: Structure[];
}

export const STRUCTURE_SAVE_VERSION = 1;

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

  /** Yeni yapı ekler; kamp ateşi `FIRE.burnSeconds` yakıtla yanık başlar. */
  add(kind: StructureKind, x: number, y: number, z: number, yaw = 0): Readonly<Structure> {
    const structure: Structure = { id: this.nextId++, kind, x, y, z, yaw };
    if (kind === 'campfire') structure.fuelSeconds = FIRE.burnSeconds;
    this.items.set(structure.id, structure);
    this.revision += 1;
    return structure;
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
      structures: [...this.items.values()].map((s) => ({ ...s })),
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
    this.nextId = loaded.nextId;
    this.revision += 1;
  }

  /** Kayıttan kurar; bozuk veride (sürüm, tür, sayılar, yakıt, kimlik) `Error` fırlatır. */
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
      const s = raw as Partial<Structure> | null;
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
      set.items.set(structure.id, structure);
    }
    return set;
  }
}
