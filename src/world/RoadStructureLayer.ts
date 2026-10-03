import { BufferGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { ROAD_STRUCTURES } from '../config';
import { GrowableGeometry } from './growableGeometry';
import { StructureIndex, buildBoxVertices, type StructureBox } from './roadStructureGeometry';

/** Bir yapının hazır köşe verisi (gövde ve ışıklı lambalar ayrı). */
interface StructureVertices {
  main: ReturnType<typeof buildBoxVertices>;
  lit: ReturnType<typeof buildBoxVertices>;
}

const ATTRIBUTES = [
  { name: 'position', itemSize: 3 },
  { name: 'normal', itemSize: 3 },
  { name: 'color', itemSize: 3 },
] as const;
/** Köşe önbelleği bu kadar yapıyı aşınca çizilmeyenler atılır. */
const VERTEX_CACHE_LIMIT = 400;

/**
 * Köprü, viyadük ve tünel çizimi: oyuncunun çevresindeki (`ROAD_STRUCTURES.drawRadius`) yapıların kutuları iki ortak
 * mesh'te birleştirilir (ışıklı tünel lambaları ayrı, ışıktan bağımsız malzemede; iki draw call); oyuncu
 * `refreshDistance` kadar yer değiştirince yeniden kurulur. Yapı başına köşe verisi önbelleklidir ve tamponlar yeniden
 * kullanılır (`GrowableGeometry`): her yenilemede yeni GPU tamponu ayrılmaz.
 */
export class RoadStructureLayer {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  private readonly mesh: Mesh;
  private readonly lampMaterial = new MeshBasicMaterial({ vertexColors: true });
  private readonly lamps: Mesh;
  private readonly mainBuffer: GrowableGeometry;
  private readonly lampBuffer: GrowableGeometry;
  private readonly vertices = new Map<number, StructureVertices>();
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private drawn = 0;
  private drawRadius: number = ROAD_STRUCTURES.drawRadius;

  constructor(private readonly index: StructureIndex) {
    this.group.name = 'road-structures';
    this.mesh = new Mesh(new BufferGeometry(), this.material);
    this.mesh.name = 'road-structures-mesh';
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.lamps = new Mesh(new BufferGeometry(), this.lampMaterial);
    this.lamps.name = 'road-structures-lamps';
    this.lamps.frustumCulled = false;
    this.group.add(this.lamps);
    this.mainBuffer = new GrowableGeometry(this.mesh, ATTRIBUTES, 4096);
    this.lampBuffer = new GrowableGeometry(this.lamps, ATTRIBUTES, 256);
  }

  /** Şu an çizilen yapı sayısı (dev göstergesi). */
  get drawnCount(): number {
    return this.drawn;
  }

  /** Çizim yarıçapı (grafik kalitesi ile ölçeklenebilir). */
  setDrawRadius(radius: number): void {
    this.drawRadius = radius;
    this.lastX = Number.NaN;
  }

  update(x: number, z: number): void {
    if (Math.hypot(x - this.lastX, z - this.lastZ) < ROAD_STRUCTURES.refreshDistance) return;
    this.lastX = x;
    this.lastZ = z;
    const ids = this.index.near(x, z, this.drawRadius);
    const parts = ids.map((id) => this.verticesOf(id));
    this.drawn = ids.length;
    write(
      this.mainBuffer,
      parts.map((p) => p.main),
    );
    write(
      this.lampBuffer,
      parts.map((p) => p.lit),
    );
    if (this.vertices.size > VERTEX_CACHE_LIMIT) {
      const keep = new Set(ids);
      for (const id of this.vertices.keys()) if (!keep.has(id)) this.vertices.delete(id);
    }
  }

  private verticesOf(id: number): StructureVertices {
    let v = this.vertices.get(id);
    if (!v) {
      const main: StructureBox[] = [];
      const lit: StructureBox[] = [];
      for (const b of this.index.shape(id).boxes) (b.emissive ? lit : main).push(b);
      v = { main: buildBoxVertices(main), lit: buildBoxVertices(lit) };
      this.vertices.set(id, v);
    }
    return v;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.lamps.geometry.dispose();
    this.material.dispose();
    this.lampMaterial.dispose();
    this.group.clear();
  }
}

/** Yapıların köşe verisini art arda tampona yazar. */
function write(
  buffer: GrowableGeometry,
  parts: ReadonlyArray<ReturnType<typeof buildBoxVertices>>,
): void {
  let count = 0;
  for (const p of parts) count += p.position.length / 3;
  const arrays = buffer.reserve(count);
  let o = 0;
  for (const p of parts) {
    for (const { name } of ATTRIBUTES) (arrays[name] as Float32Array).set(p[name], o);
    o += p.position.length;
  }
  buffer.commit(count);
}
