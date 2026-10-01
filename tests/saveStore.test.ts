import { describe, expect, it } from 'vitest';
import { SAVE } from '../src/config';
import { MemoryBackend, type SaveBackend } from '../src/save/backends';
import { SaveError, summarizeSave } from '../src/save/saveGame';
import { AUTO_SLOT, SLOT_IDS, SaveStore, isSlotId, slotLabel } from '../src/save/SaveStore';
import { sampleSave } from './helpers/sampleSave';

const at = (iso: string) => ({ ...sampleSave(), savedAt: iso });

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SaveError);
    return (error as SaveError).code;
  }
  throw new Error('SaveError bekleniyordu');
}

describe('yuva kimlikleri', () => {
  it('otomatik yuva + SAVE.manualSlots kadar elle yuva, sabit sırayla', () => {
    expect(SLOT_IDS).toHaveLength(SAVE.manualSlots + 1);
    expect(SLOT_IDS[0]).toBe(AUTO_SLOT);
    expect(SLOT_IDS[1]).toBe('slot-1');
    expect(SLOT_IDS.at(-1)).toBe(`slot-${SAVE.manualSlots}`);
  });

  it.each(['slot-0', `slot-${SAVE.manualSlots + 1}`, 'slot-1.5', '', 'AUTO', 3, null])(
    'geçersiz kimlik (%j) tanınmaz',
    (id) => expect(isSlotId(id)).toBe(false),
  );

  it('yuva adları Türkçe', () => {
    expect(slotLabel(AUTO_SLOT)).toBe('Otomatik kayıt');
    expect(slotLabel('slot-3')).toBe('Yuva 3');
  });
});

describe('SaveStore: kaydet / yükle / sil', () => {
  it('kaydedileni birebir geri okur ve özet verir', async () => {
    const store = new SaveStore(new MemoryBackend());
    const save = sampleSave();
    expect(await store.save('slot-2', save)).toEqual(summarizeSave(save));
    expect(await store.load('slot-2')).toEqual(save);
  });

  it('boş yuva null verir', async () => {
    expect(await new SaveStore(new MemoryBackend()).load('slot-1')).toBeNull();
  });

  it('aynı yuvaya yazmak öncekinin üzerine yazar; yuvalar birbirini etkilemez', async () => {
    const store = new SaveStore(new MemoryBackend());
    await store.save('slot-1', at('2026-10-01T08:00:00.000Z'));
    await store.save('slot-2', at('2026-10-01T09:00:00.000Z'));
    await store.save('slot-1', at('2026-10-01T10:00:00.000Z'));
    expect((await store.load('slot-1'))?.savedAt).toBe('2026-10-01T10:00:00.000Z');
    expect((await store.load('slot-2'))?.savedAt).toBe('2026-10-01T09:00:00.000Z');
  });

  it('sil yuvayı boşaltır; boş yuvayı silmek hata değildir', async () => {
    const store = new SaveStore(new MemoryBackend());
    await store.save('slot-1', sampleSave());
    await store.delete('slot-1');
    expect(await store.load('slot-1')).toBeNull();
    await expect(store.delete('slot-1')).resolves.toBeUndefined();
  });

  it('depodaki kayıt sonradan değiştirilen girdiyle paylaşılmaz', async () => {
    const store = new SaveStore(new MemoryBackend());
    const save = sampleSave();
    await store.save('slot-1', save);
    save.player.x = 999;
    expect((await store.load('slot-1'))?.player.x).toBe(10);
  });

  it('geçersiz yuva kimliği bad_slot verir', async () => {
    const store = new SaveStore(new MemoryBackend());
    expect(await codeOf(store.load('slot-99' as never))).toBe('bad_slot');
    expect(await codeOf(store.save('x' as never, sampleSave()))).toBe('bad_slot');
    expect(await codeOf(store.delete('' as never))).toBe('bad_slot');
  });

  it('geçersiz kayıt yazılmaz (invalid) ve yuva değişmez', async () => {
    const store = new SaveStore(new MemoryBackend());
    await store.save('slot-1', sampleSave());
    const bad = { ...sampleSave(), regionId: '' };
    expect(await codeOf(store.save('slot-1', bad))).toBe('invalid');
    expect(await store.load('slot-1')).toEqual(sampleSave());
  });
});

describe('SaveStore.list / latestSlot', () => {
  it('boş depoda tüm yuvalar empty, sıra sabit', async () => {
    const list = await new SaveStore(new MemoryBackend()).list();
    expect(list.map((s) => s.slot)).toEqual([...SLOT_IDS]);
    expect(list.every((s) => s.status === 'empty')).toBe(true);
  });

  it('dolu yuvalar özetiyle, diğerleri empty listelenir', async () => {
    const store = new SaveStore(new MemoryBackend());
    await store.save(AUTO_SLOT, sampleSave());
    await store.save('slot-3', sampleSave());
    const byId = new Map((await store.list()).map((s) => [s.slot, s]));
    expect(byId.get(AUTO_SLOT)).toEqual({
      slot: AUTO_SLOT,
      status: 'ok',
      summary: summarizeSave(sampleSave()),
    });
    expect(byId.get('slot-3')?.status).toBe('ok');
    expect(byId.get('slot-1')?.status).toBe('empty');
  });

  it('bozuk kayıt listeyi bozmaz: corrupt olarak işaretlenir, silinebilir', async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend);
    await store.save('slot-1', sampleSave());
    await backend.put('slot-2', { version: 1, junk: true });
    await backend.put('slot-3', { version: 99 });
    const byId = new Map((await store.list()).map((s) => [s.slot, s]));
    expect(byId.get('slot-1')?.status).toBe('ok');
    expect(byId.get('slot-2')).toMatchObject({ status: 'corrupt', code: 'invalid' });
    expect(byId.get('slot-3')).toMatchObject({ status: 'corrupt', code: 'future_version' });
    expect(await codeOf(store.load('slot-2'))).toBe('invalid');
    await store.delete('slot-2');
    expect((await store.list()).find((s) => s.slot === 'slot-2')?.status).toBe('empty');
  });

  it('latestSlot en yeni savedAt olan okunabilir yuvayı verir', async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend);
    expect(await store.latestSlot()).toBeNull();
    await store.save('slot-1', at('2026-10-01T08:00:00.000Z'));
    await store.save(AUTO_SLOT, at('2026-10-01T12:00:00.000Z'));
    await store.save('slot-2', at('2026-10-01T10:00:00.000Z'));
    await backend.put('slot-3', { version: 1 }); // bozuk: sayılmaz
    expect(await store.latestSlot()).toBe(AUTO_SLOT);
  });

  it('eski sürümlü kayıt okunurken göç zincirinden geçer (şimdilik v1 aynen)', async () => {
    const backend = new MemoryBackend();
    await backend.put('slot-1', JSON.parse(JSON.stringify(sampleSave())));
    expect(await new SaveStore(backend).load('slot-1')).toEqual(sampleSave());
  });
});

describe('SaveStore: depolama hataları', () => {
  const failing = (error: unknown): SaveBackend => ({
    get: () => Promise.reject(error),
    put: () => Promise.reject(error),
    delete: () => Promise.reject(error),
  });

  it('arka uç hataları storage koduyla sarılır ve kök neden taşınır', async () => {
    const cause = new Error('boom');
    const store = new SaveStore(failing(cause));
    for (const op of [
      () => store.save('slot-1', sampleSave()),
      () => store.load('slot-1'),
      () => store.delete('slot-1'),
      () => store.list(),
    ]) {
      try {
        await op();
        throw new Error('hata bekleniyordu');
      } catch (error) {
        expect(error).toBeInstanceOf(SaveError);
        expect((error as SaveError).code).toBe('storage');
        expect((error as SaveError).cause).toBe(cause);
      }
    }
  });

  it('kota dolu hatası anlaşılır mesaj verir', async () => {
    const store = new SaveStore(failing(new DOMException('dolu', 'QuotaExceededError')));
    await expect(store.save('slot-1', sampleSave())).rejects.toThrow(/depolama alanı dolu/);
  });

  it('persistent bayrağı açıkta tutulur (bellek arka ucu için false)', () => {
    expect(new SaveStore(new MemoryBackend()).persistent).toBe(true);
    expect(new SaveStore(new MemoryBackend(), false).persistent).toBe(false);
  });
});
