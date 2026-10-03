import { STREAMING } from '../config';
import type { FrameBudget } from '../core/FrameBudget';

/**
 * Dünya karolarının yaşam döngüsü (saf mantık, Three.js'siz; Faz 12): odağa yakın karolar indirilir, aşamalı olarak
 * etkinleştirilir (kare bütçesine uyarak) ve uzaklaşınca boşaltılır. Karo sırasıyla `fetching → staged → ready`; etkinleştirme dilimlidir (`activate` her çağrıda bir dilim). Boşaltma `unloadRadius` ötesinde (histerezis) ve `maxResident` tavanını aşınca en uzaktan yapılır.
 */

export interface TileRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface StreamerHooks<Blob> {
  /** Dünya içindeki tüm karolar ve kapsadıkları dikdörtgen (oyun X/Z). */
  tiles: ReadonlyArray<{ tx: number; ty: number; rect: TileRect }>;
  /** Karo verisini indirir (doğrulanmış). */
  fetch(tx: number, ty: number): Promise<Blob>;
  /**
   * Karonun etkinleştirmesinden bir dilim çalıştırır (≈ 1 ms; kare bütçesi dilimleri yayar). Karo tamamen etkinse
   * `true` döner (hazır olur); aksi hâlde bir sonraki çağrıda sürer.
   */
  activate(tx: number, ty: number, blob: Blob): boolean;
  /** Karoyu boşaltır (en az bir aşaması çalışmışsa çağrılır). */
  release(tx: number, ty: number): void;
  /** Hata (indirme/etkinleştirme); karo atlanır ve sonraki güncellemede yeniden denenir. */
  onError?(tx: number, ty: number, error: unknown): void;
}

type State = 'fetching' | 'staged' | 'ready';

interface Entry<Blob> {
  tx: number;
  ty: number;
  rect: TileRect;
  state: State;
  blob: Blob | null;
  /** Aşaması çalışmış (boşaltırken `release` gerekir). */
  touched: boolean;
  cancelled: boolean;
}

export interface Focus {
  x: number;
  z: number;
}

/** Noktanın dikdörtgene uzaklığı (içindeyse 0). */
export function distanceToRect(r: TileRect, x: number, z: number): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

export class TileStreamer<Blob> {
  private readonly entries = new Map<string, Entry<Blob>>();
  private readonly rects = new Map<string, TileRect>();
  private inFlight = 0;
  private failed = new Map<string, number>();
  /** Hazır/boşaltılan karo olunca artar: tüketiciler (chunk, nesne katmanı) değişimi buradan anlar. */
  version = 0;
  private now = 0;

  constructor(
    private readonly hooks: StreamerHooks<Blob>,
    private readonly config: {
      loadRadius: number;
      unloadRadius: number;
      maxResident: number;
      maxFetches: number;
    } = STREAMING.tiles,
  ) {
    for (const t of hooks.tiles) this.rects.set(key(t.tx, t.ty), t.rect);
  }

  /** Hazır (tüm aşamaları bitmiş) karo sayısı. */
  get readyCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.state === 'ready') n++;
    return n;
  }

  /** İndirilen/etkinleştirilen/hazır karo sayısı (bellek tavanı bunu sayar). */
  get residentCount(): number {
    return this.entries.size;
  }

  /** İndirme sürüyor ya da etkinleştirme bekleyen karo var mı? */
  get busy(): boolean {
    for (const e of this.entries.values()) if (e.state !== 'ready') return true;
    return false;
  }

  isTileReady(tx: number, ty: number): boolean {
    return this.entries.get(key(tx, ty))?.state === 'ready';
  }

  /** (x, z) çevresindeki `radius` yarıçaplı diske değen dünya karolarının hepsi hazır mı? */
  isReady(x: number, z: number, radius: number): boolean {
    for (const [k, rect] of this.rects) {
      if (distanceToRect(rect, x, z) > radius) continue;
      if (this.entries.get(k)?.state !== 'ready') return false;
    }
    return true;
  }

  /** Verilen odak noktalarına en yakın karolar için istek ve etkinleştirme; bütçe verilmişse ona uyar. */
  update(foci: readonly Focus[], budget: FrameBudget | null = null): void {
    this.now++;
    const dist = (rect: TileRect) => Math.min(...foci.map((f) => distanceToRect(rect, f.x, f.z)));

    // 1) Boşalt: histerezis dışı karolar ve tavan.
    for (const [k, e] of this.entries) {
      if (dist(e.rect) > this.config.unloadRadius) this.evict(k, e);
    }
    if (this.entries.size > this.config.maxResident) {
      const byFar = [...this.entries.entries()].sort((a, b) => dist(b[1].rect) - dist(a[1].rect));
      for (const [k, e] of byFar) {
        if (this.entries.size <= this.config.maxResident) break;
        this.evict(k, e);
      }
    }

    // 2) İstek: yarıçap içinde olup olmayan karolar, en yakın önce.
    const wanted: Array<{ k: string; tx: number; ty: number; d: number }> = [];
    for (const t of this.hooks.tiles) {
      const k = key(t.tx, t.ty);
      if (this.entries.has(k)) continue;
      const d = dist(t.rect);
      if (d <= this.config.loadRadius && (this.failed.get(k) ?? -Infinity) < this.now - 120) {
        wanted.push({ k, tx: t.tx, ty: t.ty, d });
      }
    }
    wanted.sort((a, b) => a.d - b.d);
    for (const w of wanted) {
      if (this.inFlight >= this.config.maxFetches) break;
      if (this.entries.size >= this.config.maxResident) break;
      this.request(w.k, w.tx, w.ty);
    }

    // 3) Etkinleştir: indirilmiş karolar, en yakın önce; her aşama bütçeden bir iş (ilk aşama her karede yapılır).
    const staged = [...this.entries.values()]
      .filter((e) => e.state === 'staged')
      .sort((a, b) => dist(a.rect) - dist(b.rect));
    let done = 0;
    for (const e of staged) {
      while (e.state === 'staged') {
        if (budget !== null && !budget.allows(done, 1)) return;
        this.runStep(e);
        done++;
      }
    }
  }

  /** Tüm indirilmiş karoları bütçesiz etkinleştirir (ışınlanma/ilk yükleme sonrası). */
  flush(): void {
    for (const e of this.entries.values()) {
      while (e.state === 'staged') this.runStep(e);
    }
  }

  private request(k: string, tx: number, ty: number): void {
    const rect = this.rects.get(k);
    if (!rect) return;
    const entry: Entry<Blob> = {
      tx,
      ty,
      rect,
      state: 'fetching',
      blob: null,
      touched: false,
      cancelled: false,
    };
    this.entries.set(k, entry);
    this.inFlight++;
    this.hooks.fetch(tx, ty).then(
      (blob) => {
        this.inFlight--;
        if (entry.cancelled) return;
        entry.blob = blob;
        entry.state = 'staged';
      },
      (error: unknown) => {
        this.inFlight--;
        if (entry.cancelled) return;
        this.entries.delete(k);
        this.failed.set(k, this.now);
        this.hooks.onError?.(tx, ty, error);
      },
    );
  }

  private runStep(e: Entry<Blob>): void {
    try {
      e.touched = true;
      if (this.hooks.activate(e.tx, e.ty, e.blob as Blob)) {
        e.state = 'ready';
        e.blob = null;
        this.version++;
      }
    } catch (error) {
      this.hooks.onError?.(e.tx, e.ty, error);
      e.touched = true;
      this.evict(key(e.tx, e.ty), e);
      this.failed.set(key(e.tx, e.ty), this.now);
    }
  }

  private evict(k: string, e: Entry<Blob>): void {
    e.cancelled = true;
    this.entries.delete(k);
    if (e.state === 'fetching') {
      // Dönmemiş indirme: sayaç `then` içinde düşer; burada yalnızca iptal işareti yeter.
    }
    if (e.touched) {
      this.hooks.release(e.tx, e.ty);
      this.version++;
    }
  }

  /** Tüm karoları boşaltır. */
  dispose(): void {
    for (const [k, e] of [...this.entries]) this.evict(k, e);
  }
}

function key(tx: number, ty: number): string {
  return `${tx},${ty}`;
}
