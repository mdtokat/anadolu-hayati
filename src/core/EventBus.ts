type Handler<T> = (payload: T) => void;

/**
 * Tipli olay yayıncısı. Sistemler birbirini doğrudan çağırmak yerine olay
 * yayınlar/dinler (örn. `player:ate`, `time:nightStarted`).
 * `E`: olay adı → yük tipi eşlemesi.
 */
export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>();

  /** Dinleyici ekler; dinlemeyi bırakmak için çağrılabilir bir fonksiyon döndürür. */
  on<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  /** Bir kez tetiklenip kendini kaldıran dinleyici ekler. */
  once<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof E>(event: K, handler: Handler<E[K]>): void {
    const set = this.handlers.get(event);
    if (!set) return;
    set.delete(handler as Handler<never>);
    if (set.size === 0) this.handlers.delete(event);
  }

  /** Olayı yayınlar. Dinleyiciler eklenme sırasıyla çağrılır. */
  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Kopya üzerinde dolaş: dinleyici dinlemeyi bırakırsa döngü bozulmasın.
    for (const handler of [...set]) (handler as Handler<E[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
