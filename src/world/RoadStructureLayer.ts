import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import { ROAD_STRUCTURES } from '../config';
import { StructureIndex, buildBoxVertices, type StructureBox } from './roadStructureGeometry';

/**
 * Köprü, viyadük ve tünel çizimi: oyuncunun çevresindeki (`ROAD_STRUCTURES.drawRadius`) yapıların kutuları iki ortak
 * mesh'te birleştirilir (ışıklı tünel lambaları ayrı, ışıktan bağımsız malzemede; iki draw call); oyuncu
 * `refreshDistance` kadar yer değiştirince yeniden kurulur.
 */
export class RoadStructureLayer {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  private readonly mesh: Mesh;
  private readonly lampMaterial = new MeshBasicMaterial({ vertexColors: true });
  private readonly lamps: Mesh;
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
    const boxes: StructureBox[] = [];
    const lit: StructureBox[] = [];
    const ids = this.index.near(x, z, this.drawRadius);
    for (const id of ids) {
      for (const b of this.index.shape(id).boxes) (b.emissive ? lit : boxes).push(b);
    }
    this.drawn = ids.length;
    this.replace(this.mesh, boxes);
    this.replace(this.lamps, lit);
  }

  private replace(mesh: Mesh, boxes: readonly StructureBox[]): void {
    const data = buildBoxVertices(boxes);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(data.position, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(data.normal, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(data.color, 3));
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    mesh.visible = boxes.length > 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.lamps.geometry.dispose();
    this.material.dispose();
    this.lampMaterial.dispose();
    this.group.clear();
  }
}
