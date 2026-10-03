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
import { PROP_ID_STRIDE } from './chunkKeys';
import { commitInstances, markDynamic } from './instancing';
import { PropIndex } from './propIndex';
import { PROP_KINDS, type PropId, type PropKind, type PropRef } from './propKinds';
import { MAX_PROP_SOLID_RADIUS, propSolid, type PropSolid } from './propSolids';
import type { RegionHeightSource } from './RegionHeightSource';
import { scatterChunk, type ChunkProps, type ScatterHeight } from './scatter';
import type { FreshWaterIndex } from './waterIndex';

/** Tür sırasına göre seyreltme oranı (`SCATTER.thinning`). */
const THINNING = Float32Array.from(PROP_KINDS, (kind) => SCATTER.thinning[kind] ?? 0);
/** Tür sırasına göre en uzak çizim uzaklığının karesi ve en uzak çizim uzaklığı (chunk elemesi). */
const MAX_DIST2 = Float32Array.from(PROP_KINDS, (kind) => SCATTER.kinds[kind].maxDistance ** 2);
const MAX_REACH = Math.max(...PROP_KINDS.map((kind) => SCATTER.kinds[kind].maxDistance));

/** Nesnenin seyreltme zarı [0, 1): chunk anahtarı ve sıradan karma (oturumlar arası sabit). */
export function thinningRoll(key: number, index: number): number {
  let h = Math.imul(key ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
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
 * tamponları yeniden doldurulur. Katı nesnelerin (ağaç, kaya, çalı) collider'ları `PropColliders`'tadır. Kaynakları (`geometry`, materyal, mesh)
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
  /**
   * Gizli nesneler, chunk anahtarı başına (1 = gizli): seyreltme ve yapı/yol üstünde kalanlar (Faz 10). Görünmez ve
   * toplanamaz; kimlikler değişmez. Chunk önbellekten atılınca maskesi de atılır (yeniden yüklemede aynı hesaplanır).
   */
  private readonly hidden = new Map<number, Uint8Array>();
  /** `türSırası · 2 + kademe` (0 yakın, 1 uzak) → `tiers` indeksi; uzak kademesi olmayan tür için −1. */
  private readonly tierIndex = new Int16Array(PROP_KINDS.length * 2).fill(-1);
  /** `fill` sayaçları (her doldurmada yeniden ayrılmasın). */
  private readonly fillCounts: Int32Array;
  /** Bekleyen chunk varken son doldurmadan beri geçen `update` sayısı. */
  private sinceFill = 0;
  /** Tür başına (ölçek 1'de) yakın geometrinin yatay yarıçapı (oyun m): eleme yarıçapı. */
  private readonly baseRadius = new Float32Array(PROP_KINDS.length);
  private readonly scatterHeight: ScatterHeight;
  private active: Array<{ cx: number; cy: number; key: number }> = [];
  private lastX = NaN;
  private lastZ = NaN;
  private dirty = true;
  private pending = 0;
  /** Çizim yarıçapı (oyun m); varsayılan `SCATTER.drawRadius`, grafik kalitesiyle değişir. */
  private drawRadius: number = SCATTER.drawRadius;
  private instanceTotal = 0;
  private solidVer = 0;
  private readonly countByKind = Object.fromEntries(PROP_KINDS.map((k) => [k, 0])) as Record<
    PropKind,
    number
  >;

  constructor(
    source: RegionHeightSource,
    private readonly cover: LandCoverMap,
    /**
     * Dağılımın tatlı su elemesi: ayıklanan küçük dereler dahil (`scatterWaterOf`; nesne kimlikleri kaymasın).
     */
    private readonly water: FreshWaterIndex | null,
    /**
     * `radius` yarıçaplı nesne (x, z)'de bir yapıya ya da yola değiyor mu (Faz 10 yerleşimleri)? Yoksa hiçbir nesne
     * elenmez. Yarıçap görsel genişliktir (ağaçta taç): saçaklar ve taçlar birbirine girmesin.
     */
    private readonly isBlocked: ((x: number, z: number, radius: number) => boolean) | null = null,
  ) {
    this.grid = chunkGridFor(source);
    // Dağılım ham araziye göre elenir (yumuşatma ve yol düzeltmesi nesne kimliklerini kaydırmasın); duruş yüksekliği
    // düzeltilmiş zemindir.
    const natural = source.scatterView();
    this.scatterHeight = {
      heightAt: (x, z) => source.heightAt(x, z),
      elevationAt: natural.elevationAt,
      slopeDegAt: natural.slopeDegAt,
    };
    this.index = new PropIndex(this.grid);
    this.group.name = 'props';

    for (const kind of PROP_KINDS) {
      const spec = SCATTER.kinds[kind];
      const lods: PropLod[] = spec.farLod ? ['near', 'far'] : ['near'];
      for (const lod of lods) {
        const geometry = buildPropGeometry(kind, lod);
        this.geometries.push(geometry);
        if (lod === 'near') this.baseRadius[PROP_KINDS.indexOf(kind)] = horizontalRadius(geometry);
        const mesh = new InstancedMesh(geometry, this.material, spec.maxInstances);
        mesh.name = `props-${kind}-${lod}`;
        mesh.count = 0;
        mesh.instanceColor = new InstancedBufferAttribute(
          new Float32Array(spec.maxInstances * 3),
          3,
        );
        mesh.frustumCulled = true;
        markDynamic(mesh);
        this.group.add(mesh);
        this.tierIndex[PROP_KINDS.indexOf(kind) * 2 + (lod === 'near' ? 0 : 1)] = this.tiers.length;
        this.tiers.push({ kind, lod, mesh, capacity: spec.maxInstances });
      }
    }
    this.fillCounts = new Int32Array(this.tiers.length);
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
    // Bekleyen chunk'lar hesaplanırken tamponlar her karede değil, `pendingFillInterval` adımda bir (ve son chunk
    // hesaplanınca) yeniden doldurulur: art arda karelerde tam doldurma + yükleme takılma yapıyordu.
    const settle =
      built > 0 && (this.pending === 0 || ++this.sinceFill >= SCATTER.pendingFillInterval);
    if (refresh || this.dirty || settle) {
      this.sinceFill = 0;
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
    return this.index
      .near(x, z, radius)
      .filter((ref) => !this.depleted.has(ref.id) && !this.isHidden(ref.id));
  }

  /**
   * Katı nesneler (ağaç, kaya, çalı) listesi değişti mi? Sayaç tükenme/geri gelme ve yeni yüklenen chunk'larla artar;
   * collider eşitleyicisi yalnızca değişince yeniden bakar.
   */
  get solidVersion(): number {
    return this.solidVer;
  }

  /** (x, z)'nin chunk'ı yüklü mü (collider eşitlemesi yüklü olmayan yerde yapılmaz)? */
  isLoadedAt(x: number, z: number): boolean {
    return this.index.hasChunkAt(x, z);
  }

  /** (x, z)'ye `radius` içindeki görünür katı nesneler: konum, yarıçap ve boy (collider eşitleyici). */
  solidsNear(x: number, z: number, radius: number): Array<PropRef & { solid: PropSolid }> {
    const out: Array<PropRef & { solid: PropSolid }> = [];
    for (const ref of this.propsNear(x, z, radius)) {
      const solid = propSolid(ref.kind, ref.scale);
      if (solid) out.push({ ...ref, solid });
    }
    return out;
  }

  /**
   * (x0, z0)'dan (x1, z1)'e yürüyen `radius` yarıçaplı gövde katı bir nesneye giriyor mu? Başlangıç zaten içerideyse
   * (örn. nesne üstüne doğmuş) yalnızca daha derine gitmek engeldir. Nesne dizisi ayırmaz (kinematik yürüyüş her adımda
   * sorar); gizli/tükenmiş nesneler engel değildir.
   */
  solidBlocks(x0: number, z0: number, x1: number, z1: number, radius: number): boolean {
    return this.index.someNear(
      x1,
      z1,
      radius + MAX_PROP_SOLID_RADIUS,
      (id, kind, px, pz, scale) => {
        const solid = propSolid(kind, scale);
        if (!solid) return false;
        const reach = solid.radius + radius;
        const d1 = Math.hypot(px - x1, pz - z1);
        if (d1 >= reach) return false;
        if (this.depleted.has(id) || this.isHidden(id)) return false;
        return d1 < Math.hypot(px - x0, pz - z0) - 1e-9 || Math.hypot(px - x0, pz - z0) >= reach;
      },
    );
  }

  /** (x, z) noktası (yarıçap payıyla) görünür bir katı nesnenin içinde mi? Hareketsiz noktalar için (insan yürüyüşü). */
  solidContains(x: number, z: number, radius: number): boolean {
    return this.index.someNear(x, z, radius + MAX_PROP_SOLID_RADIUS, (id, kind, px, pz, scale) => {
      const solid = propSolid(kind, scale);
      if (!solid || Math.hypot(px - x, pz - z) >= solid.radius + radius) return false;
      return !this.depleted.has(id) && !this.isHidden(id);
    });
  }

  /** Nesneyi gizler/geri getirir (durumu tutan 4.6'dır; burası yalnızca görseli ve sorguyu yönetir). */
  setPropDepleted(id: PropId, depleted: boolean): void {
    if (depleted === this.depleted.has(id)) return;
    if (depleted) this.depleted.add(id);
    else this.depleted.delete(id);
    this.dirty = true;
    this.solidVer++;
  }

  isPropDepleted(id: PropId): boolean {
    return this.depleted.has(id);
  }

  /** Nesne seyreltme ya da yapı/yol yüzünden gizli mi (yüklü olmayan chunk'ta false)? */
  private isHidden(id: PropId): boolean {
    const mask = this.hidden.get(Math.floor(id / PROP_ID_STRIDE));
    return mask !== undefined && mask[id % PROP_ID_STRIDE] === 1;
  }

  dispose(): void {
    for (const tier of this.tiers) {
      this.group.remove(tier.mesh);
      tier.mesh.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    this.material.dispose();
    this.cache.clear();
    this.hidden.clear();
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
        height: this.scatterHeight,
        isWater: (x, z, clearance) => this.water?.nearest(x, z, clearance) != null,
      });
      this.cache.set(chunk.key, props);
      this.index.set(props);
      const mask = new Uint8Array(props.count);
      this.hidden.set(chunk.key, mask);
      // Seyreltme: türün bir kısmı kimlik karmasıyla gizlenir (dağılım ve kimlikler değişmez).
      for (let i = 0; i < props.count; i++) {
        const fraction = THINNING[props.kind[i] as number] as number;
        if (fraction > 0 && thinningRoll(chunk.key, i) < fraction) mask[i] = 1;
      }
      if (this.isBlocked) {
        for (let i = 0; i < props.count; i++) {
          if (mask[i] === 1) continue;
          const radius =
            (this.baseRadius[props.kind[i] as number] as number) *
            (props.scale[i] as number) *
            SCATTER.blockRadiusFactor;
          if (this.isBlocked(props.x[i] as number, props.z[i] as number, radius)) mask[i] = 1;
        }
      }
      built++;
    }
    if (built > 0) this.solidVer++;
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
      this.hidden.delete(key);
      this.index.delete(props.cx, props.cy);
    }
  }

  /** Örnek tamponlarını etkin chunk'lardan (yakından uzağa) doldurur. */
  private fill(focusX: number, focusZ: number): void {
    const near2 = SCATTER.nearRadius ** 2;
    const counts = this.fillCounts;
    counts.fill(0);
    const byKind = new Int32Array(PROP_KINDS.length);
    const tierIndex = this.tierIndex;
    const tiers = this.tiers;
    const depleted = this.depleted.size > 0 ? this.depleted : null;

    for (const { cx, cy, key } of this.active) {
      const props = this.cache.get(key);
      if (!props) continue;
      // Hiçbir türün çizim uzaklığına girmeyen chunk tümden atlanır.
      if (distanceToChunk(this.grid, cx, cy, focusX, focusZ) > MAX_REACH) continue;
      const mask = this.hidden.get(key);
      const base = key * PROP_ID_STRIDE;
      for (let i = 0; i < props.count; i++) {
        const k = props.kind[i] as number;
        const dx = (props.x[i] as number) - focusX;
        const dz = (props.z[i] as number) - focusZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > (MAX_DIST2[k] as number)) continue;
        const t = tierIndex[k * 2 + (d2 < near2 ? 0 : 1)] as number;
        if (t < 0) continue; // uzak kademesi olmayan tür
        if (mask !== undefined && mask[i] === 1) continue;
        if (depleted !== null && depleted.has(base + i)) continue;
        const tier = tiers[t] as TierMesh;
        const n = counts[t] as number;
        if (n >= tier.capacity) continue; // kapasite dolu: uzak chunk'lar sona kaldığından yakınlar önceliklidir
        writeInstance(tier.mesh, n, props, i);
        counts[t] = n + 1;
        byKind[k] = (byKind[k] as number) + 1;
      }
    }

    let total = 0;
    for (let t = 0; t < tiers.length; t++) {
      const tier = tiers[t] as TierMesh;
      const n = counts[t] as number;
      // Yalnızca dolu kısım GPU'ya yüklenir (kapasitenin tamamı değil).
      commitInstances(tier.mesh, n);
      tier.mesh.computeBoundingSphere(); // frustum culling için (sayım 0 ise boş küre)
      total += n;
    }
    PROP_KINDS.forEach((kind, k) => (this.countByKind[kind] = byKind[k] as number));
    this.instanceTotal = total;
  }
}

/** Geometrinin dikey eksenden en uzak köşesinin yatay uzaklığı (taç/çalı yarıçapı). */
function horizontalRadius(geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position');
  let r2 = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    r2 = Math.max(r2, x * x + z * z);
  }
  return Math.sqrt(r2);
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
