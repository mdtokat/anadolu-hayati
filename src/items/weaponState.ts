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
] as const satisfies readonly ItemId[];
export type WeaponId = (typeof WEAPON_IDS)[number];

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && (WEAPON_IDS as readonly string[]).includes(value);
}

/** Kayıt biçimi: yalnızca dolu şarjörler yazılır. */
export interface WeaponStateSave {
  loaded: Partial<Record<WeaponId, number>>;
}

export class WeaponState {
  private readonly rounds = new Map<WeaponId, number>();
  private loads = 0;

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
    this.loads += 1;
  }

  toSave(): WeaponStateSave {
    const loaded: Partial<Record<WeaponId, number>> = {};
    for (const id of WEAPON_IDS) {
      const n = this.loaded(id);
      if (n > 0) loaded[id] = n;
    }
    return { loaded };
  }

  /** Kayıttan yükler (doğrulanmış kayıt: `parseSave`); bilinmeyen alanlar yok sayılır. */
  loadSave(save: WeaponStateSave): void {
    this.rounds.clear();
    this.loads += 1;
    for (const id of WEAPON_IDS) {
      const n = save.loaded[id];
      if (n !== undefined) this.set(id, n);
    }
  }
}
