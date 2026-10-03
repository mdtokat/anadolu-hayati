import { BufferAttribute, BufferGeometry, DynamicDrawUsage, type Mesh } from 'three';
import { uploadPrefix } from './instancing';

/** Öznitelik tanımı: ad ve köşe başına sayı (konum 3, renk 3…). */
export interface GrowableAttribute {
  readonly name: string;
  readonly itemSize: number;
}

/**
 * Sık yeniden kurulan (dizinsiz) geometri için yeniden kullanılan tampon (performans). Her yenilemede yeni bir
 * `BufferGeometry` kurmak GPU'da tampon silip yeniden ayırır (takılma); burada tampon kapasiteyle ayrılır, yalnızca dolu
 * kısım yüklenir (`drawRange` + güncelleme aralığı) ve kapasite yetmezse iki katına büyür (eski geometri `dispose`).
 * Kapasite küçülmez.
 */
export class GrowableGeometry {
  private capacity = 0;
  private used = 0;

  constructor(
    private readonly mesh: Mesh,
    private readonly attributes: readonly GrowableAttribute[],
    private readonly minCapacity = 256,
  ) {
    this.allocate(0);
  }

  /** Çizilen köşe sayısı. */
  get vertexCount(): number {
    return this.used;
  }

  /** Ayrılmış köşe kapasitesi (test/hata ayıklama). */
  get vertexCapacity(): number {
    return this.capacity;
  }

  /**
   * Yazılacak `vertexCount` köşe için öznitelik dizilerini hazırlar ve döndürür (ad → dizi; yalnızca ilk
   * `vertexCount · itemSize` öge yazılmalı). Ardından `commit` çağrılmalı.
   */
  reserve(vertexCount: number): Record<string, Float32Array> {
    if (vertexCount > this.capacity) this.allocate(vertexCount);
    const out: Record<string, Float32Array> = {};
    for (const { name } of this.attributes) {
      out[name] = (this.mesh.geometry.getAttribute(name) as BufferAttribute).array as Float32Array;
    }
    return out;
  }

  /** İlk `vertexCount` köşeyi çizilecek ve yüklenecek diye işaretler. */
  commit(vertexCount: number): void {
    this.used = vertexCount;
    const geometry = this.mesh.geometry;
    geometry.setDrawRange(0, vertexCount);
    for (const { name } of this.attributes) {
      uploadPrefix(geometry.getAttribute(name) as BufferAttribute, vertexCount);
    }
    this.mesh.visible = vertexCount > 0;
  }

  /** Dizilerden kopyalayarak yazar (`data[ad]` en az `vertexCount · itemSize` uzunlukta). */
  set(data: Readonly<Record<string, ArrayLike<number>>>, vertexCount: number): void {
    const arrays = this.reserve(vertexCount);
    for (const { name, itemSize } of this.attributes) {
      const source = data[name];
      if (!source) throw new Error(`Eksik öznitelik: ${name}`);
      const target = arrays[name] as Float32Array;
      const n = vertexCount * itemSize;
      if (source instanceof Float32Array) target.set(source.subarray(0, n));
      else for (let i = 0; i < n; i++) target[i] = source[i] as number;
    }
    this.commit(vertexCount);
  }

  private allocate(needed: number): void {
    const capacity = Math.max(this.minCapacity, needed, this.capacity * 2);
    const geometry = new BufferGeometry();
    for (const { name, itemSize } of this.attributes) {
      const attribute = new BufferAttribute(new Float32Array(capacity * itemSize), itemSize);
      attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
    }
    geometry.setDrawRange(0, 0);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.capacity = capacity;
  }
}

/** Dizinsiz üçgen listesinin düz (yüz) normalleri: `positions`'tan `normals`'a, ilk `vertexCount` köşe. */
export function flatNormals(
  positions: Float32Array,
  normals: Float32Array,
  vertexCount: number,
): void {
  for (let v = 0; v + 2 < vertexCount; v += 3) {
    const o = v * 3;
    const ax = positions[o] as number;
    const ay = positions[o + 1] as number;
    const az = positions[o + 2] as number;
    const ux = (positions[o + 3] as number) - ax;
    const uy = (positions[o + 4] as number) - ay;
    const uz = (positions[o + 5] as number) - az;
    const wx = (positions[o + 6] as number) - ax;
    const wy = (positions[o + 7] as number) - ay;
    const wz = (positions[o + 8] as number) - az;
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (let k = 0; k < 3; k++) {
      normals[o + k * 3] = nx;
      normals[o + k * 3 + 1] = ny;
      normals[o + k * 3 + 2] = nz;
    }
  }
}
