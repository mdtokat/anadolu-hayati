import { absolutePropId, decodeAbsolutePropId, PROP_ID_STRIDE } from './chunkKeys';
import { chunkIndexAt, chunkKey, chunkRect, type ChunkGrid } from './chunks';
import { PROP_KINDS, type PropId, type PropKind, type PropRef } from './propKinds';
import type { ChunkProps } from './scatter';

/** Bir chunk'taki en fazla nesne sayısı (kimlik kodlaması: `chunkKey · 65536 + indeks`). */
export const PROP_INDEX_LIMIT = PROP_ID_STRIDE;

/**
 * `PropId = mutlakChunkAnahtarı · 65536 + indeks` (< 2⁴⁸): aynı seed → aynı kimlik (oturumlar, yeniden
 * yüklemeler ve dünya genişlemeleri arasında sabit; `chunkKeys.absolutePropId`).
 */
export function propId(key: number, index: number): PropId {
  return absolutePropId(key, index);
}

export function decodePropId(id: PropId): { chunkKey: number; index: number } {
  return decodeAbsolutePropId(id);
}

/**
 * Yüklü chunk'lardaki nesneler için uzamsal sorgu (saf). Yarıçap sorgusu yalnızca kesişen chunk'lara ve
 * chunk içinde nesnelerin satır sırasından yararlanarak yalnızca ilgili z şeridine bakar.
 */
export class PropIndex {
  private readonly chunks = new Map<number, ChunkProps>();

  constructor(private readonly grid: ChunkGrid) {}

  get chunkCount(): number {
    return this.chunks.size;
  }

  set(props: ChunkProps): void {
    if (props.count > PROP_INDEX_LIMIT) throw new RangeError('Chunk başına nesne sınırı aşıldı');
    this.chunks.set(chunkKey(props.cx, props.cy), props);
  }

  delete(cx: number, cy: number): void {
    this.chunks.delete(chunkKey(cx, cy));
  }

  has(cx: number, cy: number): boolean {
    return this.chunks.has(chunkKey(cx, cy));
  }

  /** Kimliğin gösterdiği nesne; chunk yüklü değilse ya da indeks yoksa null. */
  get(id: PropId): PropRef | null {
    const { chunkKey: key, index } = decodePropId(id);
    const props = this.chunks.get(key);
    if (!props || index >= props.count) return null;
    return this.ref(props, key, index);
  }

  /** (x, z)'ye `radius` (dahil) içindeki nesneler, yakından uzağa. */
  near(x: number, z: number, radius: number): PropRef[] {
    const from = chunkIndexAt(this.grid, x - radius, z - radius);
    const to = chunkIndexAt(this.grid, x + radius, z + radius);
    const hits: Array<{ ref: PropRef; d2: number }> = [];
    const r2 = radius * radius;

    for (let cy = from.cy; cy <= to.cy; cy++) {
      for (let cx = from.cx; cx <= to.cx; cx++) {
        const key = chunkKey(cx, cy);
        const props = this.chunks.get(key);
        if (!props) continue;
        const rect = chunkRect(this.grid, cx, cy);
        if (x + radius < rect.minX || x - radius > rect.maxX) continue;

        const rows = props.rowStart.length - 1;
        const row0 = Math.max(Math.floor((z - radius - props.minZ) / props.spacing), 0);
        const row1 = Math.min(Math.floor((z + radius - props.minZ) / props.spacing), rows - 1);
        if (row1 < row0) continue;
        for (
          let i = props.rowStart[row0] as number;
          i < (props.rowStart[row1 + 1] as number);
          i++
        ) {
          const dx = (props.x[i] as number) - x;
          const dz = (props.z[i] as number) - z;
          const d2 = dx * dx + dz * dz;
          if (d2 <= r2) hits.push({ ref: this.ref(props, key, i), d2 });
        }
      }
    }
    return hits.sort((a, b) => a.d2 - b.d2).map((h) => h.ref);
  }

  /** (x, z)'nin bulunduğu chunk yüklü mü (katı nesne sorguları yüklü olmayan yerde güvenilmez)? */
  hasChunkAt(x: number, z: number): boolean {
    const at = chunkIndexAt(this.grid, x, z);
    return this.chunks.has(chunkKey(at.cx, at.cy));
  }

  /**
   * (x, z)'ye `radius` içindeki nesnelerden biri `test`'i sağlıyor mu? Nesne dizisi ayırmaz (canlı/insan yürüyüşü her
   * adımda sorar). `test` kimlik, tür indeksi, konum ve ölçeği alır.
   */
  someNear(
    x: number,
    z: number,
    radius: number,
    test: (id: PropId, kind: PropKind, px: number, pz: number, scale: number) => boolean,
  ): boolean {
    const from = chunkIndexAt(this.grid, x - radius, z - radius);
    const to = chunkIndexAt(this.grid, x + radius, z + radius);
    const r2 = radius * radius;
    for (let cy = from.cy; cy <= to.cy; cy++) {
      for (let cx = from.cx; cx <= to.cx; cx++) {
        const key = chunkKey(cx, cy);
        const props = this.chunks.get(key);
        if (!props) continue;
        const rows = props.rowStart.length - 1;
        const row0 = Math.max(Math.floor((z - radius - props.minZ) / props.spacing), 0);
        const row1 = Math.min(Math.floor((z + radius - props.minZ) / props.spacing), rows - 1);
        if (row1 < row0) continue;
        for (
          let i = props.rowStart[row0] as number;
          i < (props.rowStart[row1 + 1] as number);
          i++
        ) {
          const px = props.x[i] as number;
          const pz = props.z[i] as number;
          const dx = px - x;
          const dz = pz - z;
          if (dx * dx + dz * dz > r2) continue;
          if (
            test(
              propId(key, i),
              PROP_KINDS[props.kind[i] as number] as PropKind,
              px,
              pz,
              props.scale[i] as number,
            )
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private ref(props: ChunkProps, key: number, index: number): PropRef {
    return {
      id: propId(key, index),
      kind: PROP_KINDS[props.kind[index] as number] as PropRef['kind'],
      x: props.x[index] as number,
      y: props.y[index] as number,
      z: props.z[index] as number,
      scale: props.scale[index] as number,
    };
  }
}
