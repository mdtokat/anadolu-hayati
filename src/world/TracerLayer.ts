import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import { RANGED } from '../config';
import type { Vec3Like } from '../combat/ballistics';
import { tracerPath, tracerSegment, type TracerPath } from '../combat/tracers';
import type { WeaponId } from '../items/weaponState';

interface Tracer {
  path: TracerPath;
  flight: number;
  born: number;
  length: number;
  color: Color;
}

/**
 * Mermi, ok ve taş izleri (Faz 11.5): tek `LineSegments` (tek draw call, sabit tampon `RANGED.tracers.max`); her iz
 * atışın yolunda uçuş süresine göre ilerleyen kısa bir çizgidir. Mermiler kısa ömürlü parlak çizgi, ok/taş yavaş
 * süzülen koyu çizgidir. Işık eklemez.
 */
export class TracerLayer {
  readonly object: LineSegments;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly tracers: Tracer[] = [];

  constructor() {
    const max = RANGED.tracers.max;
    this.positions = new Float32Array(max * 6);
    this.colors = new Float32Array(max * 6);
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage),
    );
    geometry.setAttribute('color', new BufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const material = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
    this.object = new LineSegments(geometry, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
  }

  /** Bir atışın tanelerinin izlerini ekler (`now` sn). */
  add(
    weapon: WeaponId,
    shots: ReadonlyArray<{ path?: Vec3Like[]; time?: number }>,
    now: number,
  ): void {
    const t = RANGED.tracers;
    const bullet = weapon !== 'bow' && weapon !== 'slingshot';
    const color = new Color(
      bullet ? t.bulletColor : weapon === 'bow' ? t.arrowColor : t.stoneColor,
    );
    for (const shot of shots) {
      if (!shot.path || shot.path.length < 2) continue;
      if (this.tracers.length >= t.max) this.tracers.shift();
      this.tracers.push({
        path: tracerPath(shot.path),
        // Mermi izi gerçek uçuştan kısa sürmez (en az `bulletSeconds`: göz görebilsin).
        flight: bullet ? Math.max(shot.time ?? 0, t.bulletSeconds) : (shot.time ?? 0),
        born: now,
        length: bullet ? t.bulletLength : t.projectileLength,
        color,
      });
    }
  }

  /** Her karede: izleri ilerletir, bitenleri atar. */
  update(now: number): void {
    let n = 0;
    for (let i = 0; i < this.tracers.length;) {
      const tr = this.tracers[i]!;
      const seg = tracerSegment(tr.path, tr.flight, now - tr.born, tr.length);
      if (!seg) {
        this.tracers.splice(i, 1);
        continue;
      }
      const o = n * 6;
      this.positions[o] = seg.tail.x;
      this.positions[o + 1] = seg.tail.y;
      this.positions[o + 2] = seg.tail.z;
      this.positions[o + 3] = seg.head.x;
      this.positions[o + 4] = seg.head.y;
      this.positions[o + 5] = seg.head.z;
      for (let k = 0; k < 2; k++) {
        this.colors[o + k * 3] = tr.color.r;
        this.colors[o + k * 3 + 1] = tr.color.g;
        this.colors[o + k * 3 + 2] = tr.color.b;
      }
      n++;
      i++;
    }
    const geometry = this.object.geometry;
    geometry.setDrawRange(0, n * 2);
    this.object.visible = n > 0;
    if (n > 0) {
      (geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
    }
  }

  get count(): number {
    return this.tracers.length;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    (this.object.material as LineBasicMaterial).dispose();
    this.tracers.length = 0;
  }
}
