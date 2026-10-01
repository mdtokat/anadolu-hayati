import { SAVE } from '../config';

/**
 * Kayıt depolama arka ucu: anahtar → yapısal kopyalanabilir değer. `SaveStore` yuva mantığını, bu arayüz
 * yalnızca depolamayı bilir; böylece IndexedDB olmadan (testte, gizli pencerede) da çalışılır.
 */
export interface SaveBackend {
  /** Değeri okur; yoksa `undefined`. */
  get(key: string): Promise<unknown>;
  /** Değeri yazar; söz, yazma kalıcı olduktan sonra çözülür. */
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Bellekte tutan arka uç: oturum kapanınca kaybolur (test ve IndexedDB'siz ortam için). */
export class MemoryBackend implements SaveBackend {
  private readonly data = new Map<string, unknown>();

  get(key: string): Promise<unknown> {
    return Promise.resolve(structuredClone(this.data.get(key)));
  }

  put(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }
}

/**
 * IndexedDB arka ucu. Bağlantı ilk kullanımda açılır; açılış başarısızsa sonraki çağrıda yeniden denenir.
 * Yazma, işlem (transaction) tamamlandığında çözülür (veri diske yazılmıştır).
 */
export class IndexedDbBackend implements SaveBackend {
  private connection: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory,
    private readonly dbName: string = SAVE.dbName,
    private readonly storeName: string = SAVE.storeName,
  ) {}

  /** Bu ortamda IndexedDB var mı? */
  static isAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  get(key: string): Promise<unknown> {
    return this.run('readonly', (store) => store.get(key));
  }

  async put(key: string, value: unknown): Promise<void> {
    await this.run('readwrite', (store) => store.put(value, key));
  }

  async delete(key: string): Promise<void> {
    await this.run('readwrite', (store) => store.delete(key));
  }

  private open(): Promise<IDBDatabase> {
    this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.dbName, SAVE.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Başka sekme şema yükseltmek isterse bağlantıyı bırak; sonraki çağrı yeniden açar.
        db.onversionchange = () => {
          db.close();
          this.connection = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB açılamadı'));
    }).catch((error: unknown) => {
      this.connection = null; // yeniden denenebilsin
      throw error;
    });
    return this.connection;
  }

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(this.storeName, mode);
      const request = action(tx.objectStore(this.storeName));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () =>
        reject(tx.error ?? request.error ?? new Error('IndexedDB işlemi başarısız'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB işlemi iptal edildi'));
    });
  }
}

/** Ortamdaki en iyi arka uç ve kalıcılığı: IndexedDB varsa o, yoksa bellek (kalıcı değil). */
export function createBackend(): { backend: SaveBackend; persistent: boolean } {
  if (IndexedDbBackend.isAvailable()) {
    return { backend: new IndexedDbBackend(indexedDB), persistent: true };
  }
  return { backend: new MemoryBackend(), persistent: false };
}
