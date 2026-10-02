import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { ROAD_STRUCTURES } from '../config';
import { StructureIndex, buildBoxVertices } from './roadStructureGeometry';

/**
 * Köprü ve viyadük çizimi: oyuncunun çevresindeki (`ROAD_STRUCTURES.drawRadius`) yapıların kutuları tek bir
 * ortak mesh'te birleştirilir (tek draw call); oyuncu `refreshDistance` kadar yer değiştirince yeniden kurulur.
 */
export class RoadStructureLayer {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  private readonly mesh: Mesh;
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
    const boxes = [];
    const ids = this.index.near(x, z, this.drawRadius);
    for (const id of ids) boxes.push(...this.index.shape(id).boxes);
    this.drawn = ids.length;
    const data = buildBoxVertices(boxes);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(data.position, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(data.normal, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(data.color, 3));
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }
}
