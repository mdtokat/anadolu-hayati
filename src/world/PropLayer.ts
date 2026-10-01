import {
  BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
  type BufferGeometry,
} from 'three';
import { SCATTER } from '../config';
import { chunkGridFor, chunkKey, chunksWithin, distanceToChunk, type ChunkGrid } from './chunks';
import type { LandCoverMap } from './LandCoverMap';
import { buildPropGeometry, type PropLod } from './propGeometry';
import { PropIndex, propId } from './propIndex';
import { PROP_KINDS, type PropId, type PropKind, type PropRef } from './propKinds';
import type { RegionHeightSource } from './RegionHeightSource';
import { scatterChunk, type ChunkProps } from './scatter';
import type { FreshWaterIndex } from './waterIndex';

/** Dev göstergesi / test için anlık sayımlar. */
export interface PropLayerStats {
  /** Çizim yarıçapı içindeki chunk sayısı ve bunlardan hesaplanmış olanlar. */
  activeChunks: number;
  loadedChunks: number;
  /** Bekleyen (bütçe yüzünden ertelenen) chunk sayısı. */
  pendingChunks: number;
  /** Şu an çizilen örnek sayısı: toplam ve tür başına (iki kademe toplamı). */
  instances: number;
  byKind: Record<PropKind, number>;
  /** Örneği olan (çizilen) InstancedMesh sayısı: en çok draw call'a eşittir. */
  meshes: number;
}

interface TierMesh {
  kind: PropKind;
  lod: PropLod;
  mesh: InstancedMesh;
  capacity: number;
}

/**
 * Seed'li nesnelerin (ağaç, çalı, kaya, yenebilir bitki) çizimi: her tür ve kademe için bir `InstancedMesh`.
 * Oyuncuya `SCATTER.drawRadius` içindeki chunk'ların nesneleri `scatterChunk` ile hesaplanır (karede en
 * fazla `maxChunkBuildsPerFrame`, LRU önbellekli) ve oyuncu `refreshDistance` kadar yer değiştirince örnek
 * tamponları yeniden doldurulur. Nesnelerin collider'ı yoktur. Kaynakları (`geometry`, materyal, mesh)
 * `dispose()` eder.
 */
export class PropLayer {
  readonly group = new Group();
  readonly grid: ChunkGrid;

  private readonly cache = new Map<number, ChunkProps>();
  private readonly index: PropIndex;
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  private readonly geometries: BufferGeometry[] = [];
  private readonly tiers: TierMesh[] = [];
  private readonly depleted = new Set<PropId>();
  private active: Array<{ cx: number; cy: number; key: number }> = [];
  private lastX = NaN;
  private lastZ = NaN;
  private dirty = true;
  private pending = 0;
  /** Çizim yarıçapı (oyun m); varsayılan `SCATTER.drawRadius`, grafik kalitesiyle değişir. */
  private drawRadius: number = SCATTER.drawRadius;
  private instanceTotal = 0;
  private readonly countByKind = Object.fromEntries(PROP_KINDS.map((k) => [k, 0])) as Record<
    PropKind,
    number
  >;

  constructor(
    private readonly source: RegionHeightSource,
    private readonly cover: LandCoverMap,
    private readonly water: FreshWaterIndex | null,
  ) {
    this.grid = chunkGridFor(source);
    this.index = new PropIndex(this.grid);
    this.group.name = 'props';

    for (const kind of PROP_KINDS) {
      const spec = SCATTER.kinds[kind];
      const lods: PropLod[] = spec.farLod ? ['near', 'far'] : ['near'];
      for (const lod of lods) {
        const geometry = buildPropGeometry(kind, lod);
        this.geometries.push(geometry);
        const mesh = new InstancedMesh(geometry, this.material, spec.maxInstances);
        mesh.name = `props-${kind}-${lod}`;
        mesh.count = 0;
        mesh.instanceColor = new InstancedBufferAttribute(
          new Float32Array(spec.maxInstances * 3),
          3,
        );
        mesh.frustumCulled = true;
        this.group.add(mesh);
        this.tiers.push({ kind, lod, mesh, capacity: spec.maxInstances });
      }
    }
  }

  get stats(): PropLayerStats {
    return {
      activeChunks: this.active.length,
      loadedChunks: this.cache.size,
      pendingChunks: this.pending,
      instances: this.instanceTotal,
      byKind: { ...this.countByKind },
      meshes: this.tiers.filter((t) => t.mesh.count > 0).length,
    };
  }

  /** Odak (oyuncu) çevresini günceller: önce eksik chunk'ları hesaplar, sonra gerekiyorsa tamponları yeniler. */
  update(focusX: number, focusZ: number, maxBuilds: number = SCATTER.maxChunkBuildsPerFrame): void {
    // İlk çağrıda lastX NaN'dır: karşılaştırma yanlış olur ve yenileme zorlanır.
    const refresh = !(
      Math.hypot(focusX - this.lastX, focusZ - this.lastZ) < SCATTER.refreshDistance
    );
    if (!refresh && !this.dirty && this.pending === 0) return;

    if (refresh) this.selectActive(focusX, focusZ);
    const built = this.computeMissing(maxBuilds);
    if (refresh || this.dirty || built > 0) {
      this.lastX = focusX;
      this.lastZ = focusZ;
      this.fill(focusX, focusZ);
      this.dirty = false;
    }
  }

  /** Çizim yarıçapını değiştirir (grafik kalitesi); etkin chunk kümesi bir sonraki `update`te yenilenir. */
  setDrawRadius(radius: number): void {
    if (radius === this.drawRadius) return;
    this.drawRadius = radius;
    this.lastX = Number.NaN; // yenilemeyi zorla
    this.dirty = true;
  }

  /** Işınlanma/doğma öncesi: (x, z) çevresini senkron hazırlar (bütçe yok). */
  prepare(x: number, z: number): void {
    this.selectActive(x, z);
    this.computeMissing(Infinity);
    this.lastX = x;
    this.lastZ = z;
    this.fill(x, z);
    this.dirty = false;
  }

  /** (x, z)'ye `radius` içindeki yüklü nesneler (tükenmişler dahil değil), yakından uzağa. */
  propsNear(x: number, z: number, radius: number): PropRef[] {
    return this.index.near(x, z, radius).filter((ref) => !this.depleted.has(ref.id));
  }

  /** Nesneyi gizler/geri getirir (durumu tutan 4.6'dır; burası yalnızca görseli ve sorguyu yönetir). */
  setPropDepleted(id: PropId, depleted: boolean): void {
    if (depleted === this.depleted.has(id)) return;
    if (depleted) this.depleted.add(id);
    else this.depleted.delete(id);
    this.dirty = true;
  }

  isPropDepleted(id: PropId): boolean {
    return this.depleted.has(id);
  }

  dispose(): void {
    for (const tier of this.tiers) {
      this.group.remove(tier.mesh);
      tier.mesh.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    this.material.dispose();
    this.cache.clear();
    this.tiers.length = 0;
    this.geometries.length = 0;
    this.group.clear();
  }

  /** Çizim yarıçapı içindeki chunk'lar, yakından uzağa. */
  private selectActive(x: number, z: number): void {
    this.active = chunksWithin(this.grid, x, z, this.drawRadius)
      .map(({ cx, cy }) => ({
        cx,
        cy,
        key: chunkKey(cx, cy),
        distance: distanceToChunk(this.grid, cx, cy, x, z),
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  /** Etkin chunk'lardan hesaplanmamışları (yakından uzağa) bütçe kadar hesaplar; hesaplananı döndürür. */
  private computeMissing(budget: number): number {
    let built = 0;
    this.pending = 0;
    for (const chunk of this.active) {
      const cached = this.cache.get(chunk.key);
      if (cached) {
        this.cache.delete(chunk.key); // LRU: yeniden sona ekle
        this.cache.set(chunk.key, cached);
        continue;
      }
      if (built >= budget) {
        this.pending++;
        continue;
      }
      const props = scatterChunk({
        cx: chunk.cx,
        cy: chunk.cy,
        grid: this.grid,
        seed: SCATTER.seed,
        cover: this.cover,
        height: this.source,
        isWater: (x, z, clearance) => this.water?.nearest(x, z, clearance) != null,
      });
      this.cache.set(chunk.key, props);
      this.index.set(props);
      built++;
    }
    this.evict();
    return built;
  }

  /** Önbellek kapasitesini aşınca en eski, etkin olmayan chunk'ları atar. */
  private evict(): void {
    if (this.cache.size <= SCATTER.chunkCacheSize) return;
    const activeKeys = new Set(this.active.map((c) => c.key));
    for (const key of this.cache.keys()) {
      if (this.cache.size <= SCATTER.chunkCacheSize) break;
      if (activeKeys.has(key)) continue;
      const props = this.cache.get(key) as ChunkProps;
      this.cache.delete(key);
      this.index.delete(props.cx, props.cy);
    }
  }

  /** Örnek tamponlarını etkin chunk'lardan (yakından uzağa) doldurur. */
  private fill(focusX: number, focusZ: number): void {
    const near2 = SCATTER.nearRadius ** 2;
    const counts = new Map<TierMesh, number>();
    const tierOf = new Map<string, TierMesh>();
    for (const tier of this.tiers) {
      counts.set(tier, 0);
      tierOf.set(`${tier.kind}/${tier.lod}`, tier);
    }
    for (const kind of PROP_KINDS) this.countByKind[kind] = 0;

    for (const { key } of this.active) {
      const props = this.cache.get(key);
      if (!props) continue;
      for (let i = 0; i < props.count; i++) {
        const kind = PROP_KINDS[props.kind[i] as number] as PropKind;
        const spec = SCATTER.kinds[kind];
        const dx = (props.x[i] as number) - focusX;
        const dz = (props.z[i] as number) - focusZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > spec.maxDistance * spec.maxDistance) continue;
        const lod: PropLod = d2 < near2 ? 'near' : 'far';
        const tier = tierOf.get(`${kind}/${lod}`);
        if (!tier) continue; // uzak kademesi olmayan tür
        if (this.depleted.size > 0 && this.depleted.has(propId(key, i))) continue;
        const n = counts.get(tier) as number;
        if (n >= tier.capacity) continue; // kapasite dolu: uzak chunk'lar sona kaldığından yakınlar önceliklidir
        writeInstance(tier.mesh, n, props, i);
        counts.set(tier, n + 1);
        this.countByKind[kind]++;
      }
    }

    let total = 0;
    for (const tier of this.tiers) {
      const n = counts.get(tier) as number;
      tier.mesh.count = n;
      tier.mesh.instanceMatrix.needsUpdate = true;
      (tier.mesh.instanceColor as BufferAttribute).needsUpdate = true;
      tier.mesh.computeBoundingSphere(); // frustum culling için (sayım 0 ise boş küre)
      total += n;
    }
    this.instanceTotal = total;
  }
}

/** Örnek matrisini (ölçek · yaw dönüşü · konum) ve ton rengini doğrudan tampona yazar. */
function writeInstance(mesh: InstancedMesh, slot: number, props: ChunkProps, i: number): void {
  const s = props.scale[i] as number;
  const yaw = props.yaw[i] as number;
  const c = Math.cos(yaw) * s;
  const sn = Math.sin(yaw) * s;
  const m = mesh.instanceMatrix.array as Float32Array;
  const o = slot * 16;
  m[o] = c;
  m[o + 1] = 0;
  m[o + 2] = -sn;
  m[o + 3] = 0;
  m[o + 4] = 0;
  m[o + 5] = s;
  m[o + 6] = 0;
  m[o + 7] = 0;
  m[o + 8] = sn;
  m[o + 9] = 0;
  m[o + 10] = c;
  m[o + 11] = 0;
  m[o + 12] = props.x[i] as number;
  m[o + 13] = props.y[i] as number;
  m[o + 14] = props.z[i] as number;
  m[o + 15] = 1;

  const tone = props.tone[i] as number;
  const colors = (mesh.instanceColor as BufferAttribute).array as Float32Array;
  colors[slot * 3] = tone;
  colors[slot * 3 + 1] = tone;
  colors[slot * 3 + 2] = tone;
}
