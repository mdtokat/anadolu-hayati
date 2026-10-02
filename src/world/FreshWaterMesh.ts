import {
  BufferAttribute,
  BufferGeometry,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { FRESH_WATER } from '../config';
import type { WaterFeatures } from '../data/region';
import { buildLakeMeshes, type HeightFn, type MeshData } from './waterGeometry';

function toGeometry(data: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  // Su yüzeyleri düzdür: normaller hep +Y (yumuşak gölgeleme için hesaplamaya gerek yok).
  const normals = new Float32Array(data.positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Durgun tatlı su görseli: göller/göletler/barajlar düz yüzeyler (tek mesh, 1 draw call). Şeffaf; opak araziden
 * sonra, deniz düzleminden önce çizilir. Akarsular ayrı mesh değildir: arazi shader'ında boyanır
 * (`terrainOverlay.ts`; dik yamaçta havada kalan şeritler kalktı).
 */
export class FreshWaterMesh {
  readonly object = new Group();
  private readonly material = new MeshStandardMaterial({
    color: FRESH_WATER.color,
    transparent: true,
    opacity: FRESH_WATER.opacity,
    roughness: 0.25,
    metalness: 0,
    side: FrontSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  private readonly geometries: BufferGeometry[] = [];

  constructor(water: WaterFeatures, heightAt: HeightFn) {
    this.object.name = 'fresh-water';
    const lakes = buildLakeMeshes(water.polygons, heightAt, FRESH_WATER.lift);
    for (const [name, data] of [['lakes', lakes]] as const) {
      if (data.indices.length === 0) continue;
      const geometry = toGeometry(data);
      this.geometries.push(geometry);
      const mesh = new Mesh(geometry, this.material);
      mesh.name = name;
      mesh.renderOrder = 9; // deniz (10) öncesi
      mesh.frustumCulled = false; // büyük ve seyrek: kırpma kazancı yok
      this.object.add(mesh);
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.material.dispose();
    this.object.clear();
  }
}
