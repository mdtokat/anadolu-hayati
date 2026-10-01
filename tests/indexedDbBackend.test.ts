import { describe, expect, it } from 'vitest';
import { SAVE } from '../src/config';
import { IndexedDbBackend } from '../src/save/backends';
import { SaveStore } from '../src/save/SaveStore';
import { FakeIndexedDb } from './helpers/fakeIndexedDb';
import { sampleSave } from './helpers/sampleSave';

describe('IndexedDbBackend', () => {
  it('yazılan değeri okur; olmayan anahtar undefined; silme çalışır', async () => {
    const idb = new FakeIndexedDb();
    const backend = new IndexedDbBackend(idb.asFactory());
    expect(await backend.get('a')).toBeUndefined();
    await backend.put('a', { n: 1 });
    expect(await backend.get('a')).toEqual({ n: 1 });
    await backend.delete('a');
    expect(await backend.get('a')).toBeUndefined();
  });

  it('ilk açılışta nesne deposunu oluşturur; bağlantıyı yeniden kullanır', async () => {
    const idb = new FakeIndexedDb();
    const backend = new IndexedDbBackend(idb.asFactory());
    await backend.put('a', 1);
    await backend.get('a');
    await backend.delete('a');
    expect(idb.opens).toBe(1);
    expect(idb.databases.get(SAVE.dbName)?.has(SAVE.storeName)).toBe(true);
  });

  it('veri başka bir arka uç örneğinden (sayfa yenileme) okunabilir', async () => {
    const idb = new FakeIndexedDb();
    await new IndexedDbBackend(idb.asFactory()).put('k', 'v');
    expect(await new IndexedDbBackend(idb.asFactory()).get('k')).toBe('v');
  });

  it('açılış hatası reddedilir ve sonraki çağrıda yeniden denenir', async () => {
    const idb = new FakeIndexedDb();
    const backend = new IndexedDbBackend(idb.asFactory());
    idb.failNextOpen = new Error('açılamadı');
    await expect(backend.get('a')).rejects.toThrow('açılamadı');
    await expect(backend.put('a', 1)).resolves.toBeUndefined();
    expect(idb.opens).toBe(2);
  });

  it('işlem hatası reddedilir ve veri yazılmaz', async () => {
    const idb = new FakeIndexedDb();
    const backend = new IndexedDbBackend(idb.asFactory());
    await backend.get('ısınma'); // bağlantı aç
    idb.failNextTransaction = new DOMException('dolu', 'QuotaExceededError');
    await expect(backend.put('a', 1)).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(await backend.get('a')).toBeUndefined();
  });

  it('SaveStore ile uçtan uca: kaydet, yenile, yükle; kota hatası storage olur', async () => {
    const idb = new FakeIndexedDb();
    const store = new SaveStore(new IndexedDbBackend(idb.asFactory()));
    await store.save('slot-1', sampleSave());

    const reopened = new SaveStore(new IndexedDbBackend(idb.asFactory()));
    expect(await reopened.load('slot-1')).toEqual(sampleSave());
    expect((await reopened.list())[0]?.status).toBe('empty');

    await reopened.load('slot-1'); // bağlantı açık
    idb.failNextTransaction = new DOMException('dolu', 'QuotaExceededError');
    await expect(reopened.save('slot-2', sampleSave())).rejects.toMatchObject({
      code: 'storage',
    });
    expect(await reopened.load('slot-2')).toBeNull();
  });
});
