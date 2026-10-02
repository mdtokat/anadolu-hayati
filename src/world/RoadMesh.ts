import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { ROADS } from '../config';
import type { RoadData } from '../data/settlements';
import { buildRoadGroups } from './roadGeometry';

/**
 * Yolların çizimi (Faz 10): şehirlerarası yollar ve kent sokakları, zemine oturan şeritler. Yollar `groupSize`
 * karelerine bölünür; her kare bir mesh'tir (frustum kırpması) ve oyuncuya `drawRadius` ötesindekiler gizlenir.
 * Terk edilmiş asfalt: koyu, solgun, lekeli. Kaynaklar `dispose()` ile bırakılır.
 */
export class RoadMesh {
  readonly object = new Group();
  private readonly material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly meshes: Array<{ mesh: Mesh; cx: number; cz: number }> = [];
  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  constructor(roads: readonly RoadData[], heightAt: (x: number, z: number) => number) {
    this.object.name = 'roads';
    const size = ROADS.groupSize;
    for (const group of buildRoadGroups(roads, heightAt, size)) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(group.positions, 3));
      geometry.setAttribute('color', new BufferAttribute(group.colors, 3));
      const normals = new Float32Array(group.positions.length);
      for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
      geometry.setAttribute('normal', new BufferAttribute(normals, 3));
      geometry.setIndex(new BufferAttribute(group.indices, 1));
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, this.material);
      mesh.name = `roads-${group.gx}-${group.gz}`;
      mesh.renderOrder = 1;
      this.object.add(mesh);
      this.meshes.push({ mesh, cx: (group.gx + 0.5) * size, cz: (group.gz + 0.5) * size });
    }
  }

  /** Görünür grup sayısı ve toplam üçgen (dev göstergesi/test). */
  get stats(): { groups: number; visible: number; triangles: number } {
    let visible = 0;
    let triangles = 0;
    for (const { mesh } of this.meshes) {
      if (!mesh.visible) continue;
      visible++;
      triangles += (mesh.geometry.index?.count ?? 0) / 3;
    }
    return { groups: this.meshes.length, visible, triangles };
  }

  /** Odak (oyuncu) çevresinde görünürlüğü günceller (`drawRadius`; grup kare yarı köşegeni payıyla). */
  update(x: number, z: number): void {
    if (Math.hypot(x - this.lastX, z - this.lastZ) < ROADS.groupSize / 8) return;
    this.lastX = x;
    this.lastZ = z;
    const reach = ROADS.drawRadius + ROADS.groupSize * Math.SQRT1_2;
    for (const entry of this.meshes) {
      entry.mesh.visible = Math.hypot(entry.cx - x, entry.cz - z) <= reach;
    }
  }

  dispose(): void {
    for (const { mesh } of this.meshes) mesh.geometry.dispose();
    this.material.dispose();
    this.object.clear();
    this.meshes.length = 0;
  }
}
