import { RANGED } from '../config';
import type { ItemId } from './itemDefs';

/**
 * Silah durumu (Faz 11 ortak sözleşmesi, docs/faz-11-paralel-plan.md §3.4; saf mantık): şarjörlü (menzilli) silah
 * türü başına şarjördeki mermi. D doldurur/boşaltır; kayıtta `weapons.loaded` (v5). Silah türü başına tek değer
 * tutulur (aynı türden iki silah aynı şarjörü paylaşır: silah aşınması/tekil silah kapsam dışı).
 */

/** Şarjörlü silahlar (`RANGED.weapons` anahtarlarıyla aynı; yalnızca sona eklenir). */
export const WEAPON_IDS = [
  'slingshot',
  'bow',
  'shotgun',
  'pistol',
  'rifle',
  'sniper_rifle',
  'revolver',
  'smg',
  'assault_rifle',
  'marksman_rifle',
  'lmg',
  'crossbow',
] as const satisfies readonly ItemId[];
export type WeaponId = (typeof WEAPON_IDS)[number];

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && (WEAPON_IDS as readonly string[]).includes(value);
}

/** Takılabilir dürbünler (`RANGED.scopes` anahtarları; büyütme sırasıyla). `scope` eski "Dürbün"dür (4x). */
export const SCOPE_IDS = [
  'scope_2x',
  'scope',
  'scope_8x',
  'scope_16x',
] as const satisfies readonly ItemId[];
export type ScopeId = (typeof SCOPE_IDS)[number];

export function isScopeId(value: unknown): value is ScopeId {
  return typeof value === 'string' && (SCOPE_IDS as readonly string[]).includes(value);
}

/** Dürbünün büyütmesi. */
export function scopeZoom(scope: ScopeId): number {
  return RANGED.scopes[scope].zoom;
}

/** Bu dürbün bu silaha takılabilir mi (`scopeMax`)? */
export function scopeFits(weapon: WeaponId, scope: ScopeId): boolean {
  return scopeZoom(scope) <= RANGED.weapons[weapon].scopeMax;
}

/** Silaha dürbün takılabilir mi (en küçüğü bile)? */
export function canScope(weapon: WeaponId): boolean {
  return RANGED.weapons[weapon].scopeMax > 0;
}

/**
 * Nişanda geçerli büyütme: takılı dürbün, yoksa silahın kendi dürbünü (keskin nişancı 4x); 0 = dürbünsüz (gez-arpacık,
 * `aimFovDeg`).
 */
export function effectiveZoom(weapon: WeaponId, attached: ScopeId | null): number {
  return attached ? scopeZoom(attached) : RANGED.weapons[weapon].scopeZoom;
}

/** Susturucu takılabilen silahlar (`RANGED.suppressor.weapons`). */
export function canSuppress(id: WeaponId): boolean {
  return (RANGED.suppressor.weapons as readonly WeaponId[]).includes(id);
}

/**
 * Kayıt biçimi: yalnızca dolu şarjörler yazılır; `suppressed` susturucu takılı silahlar (v7); `scopes` takılı dürbünler
 * (eklemeli alan; yoksa dürbünsüz).
 */
export interface WeaponStateSave {
  loaded: Partial<Record<WeaponId, number>>;
  suppressed: WeaponId[];
  scopes?: Partial<Record<WeaponId, ScopeId>>;
}

export class WeaponState {
  private readonly rounds = new Map<WeaponId, number>();
  private readonly suppressors = new Set<WeaponId>();
  private readonly scopes = new Map<WeaponId, ScopeId>();
  private loads = 0;
  private changes = 0;

  /** Susturucu tak/çıkar sayacı (arayüz yenilensin). */
  get attachmentRevision(): number {
    return this.changes;
  }

  /** Silahta susturucu takılı mı? */
  suppressed(id: WeaponId): boolean {
    return this.suppressors.has(id);
  }

  /** Susturucuyu takar/çıkarır (takılamayan silahta false; envanter işini çağıran yapar). */
  setSuppressed(id: WeaponId, on: boolean): boolean {
    if (on && !canSuppress(id)) return false;
    if (on === this.suppressors.has(id)) return true;
    if (on) this.suppressors.add(id);
    else this.suppressors.delete(id);
    this.changes += 1;
    return true;
  }

  /** Silaha takılı dürbün (yoksa null). */
  scope(id: WeaponId): ScopeId | null {
    return this.scopes.get(id) ?? null;
  }

  /** Dürbünü takar (null: çıkarır). Sığmayan dürbünde false; envanter işini çağıran yapar. */
  setScope(id: WeaponId, scope: ScopeId | null): boolean {
    if (scope !== null && !scopeFits(id, scope)) return false;
    if ((this.scopes.get(id) ?? null) === scope) return true;
    if (scope === null) this.scopes.delete(id);
    else this.scopes.set(id, scope);
    this.changes += 1;
    return true;
  }

  /** Kayıt yükleme/temizleme sayacı (11.5): `RangedSystem` geçici durumunu (doldurma, uçuştaki isabet) sıfırlar. */
  get revision(): number {
    return this.loads;
  }

  /** Şarjördeki mermi (boşsa 0). */
  loaded(id: WeaponId): number {
    return this.rounds.get(id) ?? 0;
  }

  /** Şarjör kapasitesi (`RANGED.weapons[id].magazine`). */
  capacity(id: WeaponId): number {
    return RANGED.weapons[id].magazine;
  }

  /** Şarjörü `count`'a ayarlar ([0, kapasite]'ye kırpılır, tam sayıya yuvarlanır); yeni değeri döner. */
  set(id: WeaponId, count: number): number {
    const value = Math.min(Math.max(Math.round(count), 0), this.capacity(id));
    if (value === 0) this.rounds.delete(id);
    else this.rounds.set(id, value);
    return value;
  }

  /** Bir mermi harcar; şarjör boşsa false. */
  consume(id: WeaponId): boolean {
    const current = this.loaded(id);
    if (current <= 0) return false;
    this.set(id, current - 1);
    return true;
  }

  clear(): void {
    this.rounds.clear();
    this.suppressors.clear();
    this.scopes.clear();
    this.loads += 1;
    this.changes += 1;
  }

  toSave(): WeaponStateSave {
    const loaded: Partial<Record<WeaponId, number>> = {};
    for (const id of WEAPON_IDS) {
      const n = this.loaded(id);
      if (n > 0) loaded[id] = n;
    }
    const scopes: Partial<Record<WeaponId, ScopeId>> = {};
    for (const [id, scope] of this.scopes) scopes[id] = scope;
    return {
      loaded,
      suppressed: WEAPON_IDS.filter((id) => this.suppressors.has(id)),
      ...(this.scopes.size > 0 ? { scopes } : {}),
    };
  }

  /** Kayıttan yükler (doğrulanmış kayıt: `parseSave`); bilinmeyen alanlar yok sayılır. */
  loadSave(save: Pick<WeaponStateSave, 'loaded'> & Partial<WeaponStateSave>): void {
    this.rounds.clear();
    this.suppressors.clear();
    this.scopes.clear();
    this.loads += 1;
    this.changes += 1;
    for (const id of WEAPON_IDS) {
      const n = save.loaded[id];
      if (n !== undefined) this.set(id, n);
    }
    for (const id of save.suppressed ?? []) if (canSuppress(id)) this.suppressors.add(id);
    for (const id of WEAPON_IDS) {
      const scope = save.scopes?.[id];
      if (scope !== undefined && scopeFits(id, scope)) this.scopes.set(id, scope);
    }
  }
}
