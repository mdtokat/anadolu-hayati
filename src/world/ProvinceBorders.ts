import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import { BORDERS } from '../config';
import type { ProvinceShape } from '../data/region';
import { buildBorderSegments } from './borders';

/** İl sınırlarını yere yapışık ince çizgi olarak gösterir; açılıp kapanabilir. */
export class ProvinceBorders {
  readonly object: LineSegments<BufferGeometry, LineBasicMaterial>;

  constructor(provinces: readonly ProvinceShape[], heightAt: (x: number, z: number) => number) {
    const data = buildBorderSegments(provinces, heightAt);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
    geometry.computeBoundingSphere();

    this.object = new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true }));
    this.object.name = 'province-borders';
    this.object.frustumCulled = false; // tek büyük çizgi nesnesi; kırpma kazancı yok
    this.object.visible = BORDERS.visibleByDefault;
  }

  get visible(): boolean {
    return this.object.visible;
  }

  toggle(): void {
    this.object.visible = !this.object.visible;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}
