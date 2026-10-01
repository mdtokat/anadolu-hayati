/**
 * Minimal sahte IndexedDB (yalnızca `IndexedDbBackend`'in kullandığı yüzey): open/onupgradeneeded,
 * transaction, objectStore get/put/delete, oncomplete/onerror/onabort. Değerler yapısal kopyalanır;
 * istekler asenkron tamamlanır. Hata enjeksiyonu: `failNextOpen`, `failNextTransaction`.
 */
export class FakeIndexedDb {
  readonly databases = new Map<string, Map<string, Map<string, unknown>>>();
  /** Açılan bağlantı sayısı (yeniden kullanımı denetlemek için). */
  opens = 0;
  failNextOpen: Error | null = null;
  failNextTransaction: DOMException | null = null;

  open(name: string): IDBOpenDBRequest {
    this.opens += 1;
    const request = {} as unknown as { [key: string]: unknown };
    setTimeout(() => {
      if (this.failNextOpen) {
        request.error = this.failNextOpen;
        this.failNextOpen = null;
        (request.onerror as (() => void) | undefined)?.();
        return;
      }
      let stores = this.databases.get(name);
      const isNew = !stores;
      if (!stores) {
        stores = new Map();
        this.databases.set(name, stores);
      }
      const db = this.makeDb(stores);
      request.result = db;
      if (isNew) (request.onupgradeneeded as (() => void) | undefined)?.();
      (request.onsuccess as (() => void) | undefined)?.();
    }, 0);
    return request as unknown as IDBOpenDBRequest;
  }

  private makeDb(stores: Map<string, Map<string, unknown>>): IDBDatabase {
    return {
      objectStoreNames: { contains: (n: string) => stores.has(n) },
      createObjectStore: (n: string) => stores.set(n, new Map()),
      close: () => undefined,
      onversionchange: null,
      transaction: (storeName: string) => {
        const store = stores.get(storeName);
        if (!store) throw new DOMException('Depo yok', 'NotFoundError');
        const tx: { [key: string]: unknown } = {};
        const fail = this.failNextTransaction;
        this.failNextTransaction = null;
        const makeRequest = (apply: () => unknown): IDBRequest => {
          const request: { [key: string]: unknown } = {};
          setTimeout(() => {
            if (fail) {
              tx.error = fail;
              (tx.onerror as (() => void) | undefined)?.();
              (tx.onabort as (() => void) | undefined)?.();
              return;
            }
            request.result = apply();
            (tx.oncomplete as (() => void) | undefined)?.();
          }, 0);
          return request as unknown as IDBRequest;
        };
        tx.objectStore = () => ({
          get: (key: string) => makeRequest(() => structuredClone(store.get(key))),
          put: (value: unknown, key: string) =>
            makeRequest(() => (store.set(key, structuredClone(value)), key)),
          delete: (key: string) => makeRequest(() => (store.delete(key), undefined)),
        });
        return tx as unknown as IDBTransaction;
      },
    } as unknown as IDBDatabase;
  }

  asFactory(): IDBFactory {
    return this as unknown as IDBFactory;
  }
}
