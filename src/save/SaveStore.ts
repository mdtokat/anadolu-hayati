import { SAVE } from '../config';
import type { SaveBackend } from './backends';
import {
  SaveError,
  parseSave,
  summarizeSave,
  type SaveErrorCode,
  type SaveGame,
  type SaveSummary,
} from './saveGame';

/** Otomatik kayıt yuvası. */
export const AUTO_SLOT = 'auto';

export type SlotId = typeof AUTO_SLOT | `slot-${number}`;

/** Tüm yuvalar: önce otomatik, sonra elle yuvalar (`slot-1` …). */
export const SLOT_IDS: readonly SlotId[] = [
  AUTO_SLOT,
  ...Array.from({ length: SAVE.manualSlots }, (_, i): SlotId => `slot-${i + 1}`),
];

export function isSlotId(value: unknown): value is SlotId {
  return typeof value === 'string' && (SLOT_IDS as readonly string[]).includes(value);
}

/** Yuvanın arayüzde görünen adı. */
export function slotLabel(slot: SlotId): string {
  return slot === AUTO_SLOT ? 'Otomatik kayıt' : `Yuva ${slot.slice('slot-'.length)}`;
}

/** Bir yuvanın durumu (yuva listesi için). */
export type SlotState =
  | { slot: SlotId; status: 'empty' }
  | { slot: SlotId; status: 'ok'; summary: SaveSummary }
  /** Kayıt okunamıyor (bozuk ya da daha yeni sürüm); silinebilir. */
  | { slot: SlotId; status: 'corrupt'; code: SaveErrorCode; message: string };

/**
 * Yuvalı kayıt deposu. Yazarken kaydı doğrular, okurken yeniden doğrular ve sürüm göçünü uygular
 * (`parseSave`); depolama hataları `SaveError('storage')` olarak döner.
 */
export class SaveStore {
  /**
   * @param persistent `false` ise kayıtlar yalnızca bu oturumda yaşar (IndexedDB yok); arayüz
   *   oyuncuyu uyarabilsin diye açıkta tutulur.
   */
  constructor(
    private readonly backend: SaveBackend,
    readonly persistent = true,
  ) {}

  /** Tüm yuvaların durumu (otomatik ve elle yuvalar, sabit sırayla). Bozuk kayıt listeyi bozmaz. */
  async list(): Promise<SlotState[]> {
    return Promise.all(
      SLOT_IDS.map(async (slot): Promise<SlotState> => {
        const raw = await this.read(slot);
        if (raw === undefined) return { slot, status: 'empty' };
        try {
          return { slot, status: 'ok', summary: summarizeSave(parseSave(raw)) };
        } catch (error) {
          if (error instanceof SaveError) {
            return { slot, status: 'corrupt', code: error.code, message: error.message };
          }
          throw error;
        }
      }),
    );
  }

  /** Yuvaya yazar (öncekinin üzerine). Geçersiz kayıt yazılmaz; `SaveError` fırlatır. */
  async save(slot: SlotId, save: SaveGame): Promise<SaveSummary> {
    assertSlot(slot);
    const valid = parseSave(save);
    try {
      await this.backend.put(slot, valid);
    } catch (error) {
      throw storageError('Kayıt yazılamadı', error);
    }
    return summarizeSave(valid);
  }

  /** Yuvadaki kaydı okur; boşsa `null`. Bozuk/yeni sürümlü kayıtta `SaveError` fırlatır. */
  async load(slot: SlotId): Promise<SaveGame | null> {
    assertSlot(slot);
    const raw = await this.read(slot);
    return raw === undefined ? null : parseSave(raw);
  }

  /** Yuvayı boşaltır (bozuk kaydı silmek için de kullanılır). Boş yuvada hata vermez. */
  async delete(slot: SlotId): Promise<void> {
    assertSlot(slot);
    try {
      await this.backend.delete(slot);
    } catch (error) {
      throw storageError('Kayıt silinemedi', error);
    }
  }

  /** En son kaydedilen okunabilir yuva ("Devam" için); hiç kayıt yoksa `null`. */
  async latestSlot(): Promise<SlotId | null> {
    let best: { slot: SlotId; time: number } | null = null;
    for (const state of await this.list()) {
      if (state.status !== 'ok') continue;
      const time = Date.parse(state.summary.savedAt);
      if (best === null || time > best.time) best = { slot: state.slot, time };
    }
    return best?.slot ?? null;
  }

  private async read(slot: SlotId): Promise<unknown> {
    try {
      return await this.backend.get(slot);
    } catch (error) {
      throw storageError('Kayıt okunamadı', error);
    }
  }
}

function assertSlot(slot: unknown): asserts slot is SlotId {
  if (!isSlotId(slot)) throw new SaveError('bad_slot', `Geçersiz kayıt yuvası: ${String(slot)}.`);
}

function storageError(what: string, cause: unknown): SaveError {
  const full = cause instanceof DOMException && cause.name === 'QuotaExceededError';
  return new SaveError(
    'storage',
    full ? `${what}: depolama alanı dolu.` : `${what}: tarayıcı depolaması kullanılamıyor.`,
    { cause },
  );
}
